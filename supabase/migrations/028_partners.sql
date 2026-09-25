-- 028: creator partner program (promo codes, referral links, commissions, payouts).
-- Kyle 2026-09-25 plan mode: a creator link or code gives a NEW account 50 free
-- Ink (once per person) and 50% off the first month of any plan; the creator
-- earns 30% of what their referrals pay for 12 months, after a 30-day refund
-- hold. Payouts go through Stripe Connect and are released by Kyle by hand.
--
-- Every table here is service-role only (RLS on, no policies): the app reads
-- and writes them through server routes that check the session first.

-- ── partners (applications live here too, status 'pending') ───────────────
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  slug text unique check (slug is null or slug ~ '^[a-z0-9-]{2,32}$'),
  code text unique check (code is null or code ~ '^[A-Z0-9-]{3,24}$'),
  name text not null,
  email text not null,
  user_id uuid unique,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'paused', 'declined')),
  source text not null default 'application' check (source in ('application', 'invite')),
  links text,
  audience text,
  pitch text,
  commission_rate numeric(4,3) not null default 0.300 check (commission_rate >= 0 and commission_rate <= 0.9),
  commission_months integer not null default 12 check (commission_months between 1 and 60),
  stripe_promotion_code_id text,
  stripe_connect_account_id text,
  notified_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_partners_email on partners (lower(email));
create index if not exists idx_partners_status on partners (status);

drop trigger if exists trg_partners_updated_at on partners;
create trigger trg_partners_updated_at
  before update on partners
  for each row execute function update_updated_at();

-- ── referrals: one per account, first touch wins ─────────────────────────────
create table if not exists referrals (
  user_id uuid primary key,
  partner_id uuid not null references partners(id),
  source text not null check (source in ('link', 'code', 'checkout')),
  email_hash text,
  bonus_ink numeric(10,4) not null default 0,
  first_paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_referrals_partner on referrals (partner_id);
-- the free Ink goes to one account per person, however many accounts they open
create unique index if not exists uq_referrals_bonus_email
  on referrals (email_hash) where bonus_ink > 0 and email_hash is not null;

-- ── clicks, one row per creator per day ──────────────────────────────────────
create table if not exists partner_clicks (
  partner_id uuid not null references partners(id) on delete cascade,
  day date not null default current_date,
  clicks integer not null default 0,
  primary key (partner_id, day)
);

-- ── commissions: one row per paid Stripe object (invoice or checkout session) ─
create table if not exists partner_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id),
  user_id uuid not null,
  source_id text not null unique,
  payment_intent text,
  kind text not null check (kind in ('subscription', 'topup')),
  amount_cents integer not null check (amount_cents >= 0),
  commission_cents integer not null check (commission_cents >= 0),
  status text not null default 'held' check (status in ('held', 'paid', 'void')),
  available_at timestamptz not null,
  payout_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_commissions_partner on partner_commissions (partner_id, status);
create index if not exists idx_commissions_pi on partner_commissions (payment_intent);
create index if not exists idx_commissions_user on partner_commissions (user_id);

-- ── payouts: one Stripe transfer per creator per release ─────────────────────
create table if not exists partner_payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id),
  amount_cents integer not null check (amount_cents > 0),
  status text not null check (status in ('released', 'failed')),
  stripe_transfer_id text,
  error text,
  released_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_payouts_partner on partner_payouts (partner_id);

-- ── comp Premium for active partners ─────────────────────────────────────────
alter table ink_balances add column if not exists comp_partner boolean not null default false;

alter table partners enable row level security;
alter table referrals enable row level security;
alter table partner_clicks enable row level security;
alter table partner_commissions enable row level security;
alter table partner_payouts enable row level security;

-- ── atomic claim: referral row + the free Ink, or nothing ────────────────────
-- p_bonus is decided by the app (new account, not disposable, not a deleted-
-- account re-signup). The email-hash check here is the last line against one
-- person farming the bonus across several accounts.
create or replace function claim_partner_referral(
  p_user_id uuid,
  p_partner_id uuid,
  p_source text,
  p_email_hash text,
  p_bonus numeric
) returns numeric as $$
declare
  v_bonus numeric := greatest(coalesce(p_bonus, 0), 0);
  v_rows integer;
begin
  if v_bonus > 0 and p_email_hash is not null and exists (
    select 1 from referrals r where r.email_hash = p_email_hash and r.bonus_ink > 0
  ) then
    v_bonus := 0;
  end if;

  insert into referrals (user_id, partner_id, source, email_hash, bonus_ink)
  values (p_user_id, p_partner_id, p_source, p_email_hash, v_bonus)
  on conflict (user_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return null; -- already referred: first touch wins, no second bonus
  end if;

  if v_bonus > 0 then
    update ink_balances set topup_ink = coalesce(topup_ink, 0) + v_bonus where user_id = p_user_id;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'claim_partner_referral: no ink_balances row for %', p_user_id;
    end if;
  end if;

  return v_bonus;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function bump_partner_click(p_partner_id uuid) returns void as $$
  insert into partner_clicks (partner_id, day, clicks) values (p_partner_id, current_date, 1)
  on conflict (partner_id, day) do update set clicks = partner_clicks.clicks + 1;
$$ language sql security definer set search_path = public;

revoke execute on function claim_partner_referral(uuid, uuid, text, text, numeric) from public, anon, authenticated;
grant  execute on function claim_partner_referral(uuid, uuid, text, text, numeric) to service_role;
revoke execute on function bump_partner_click(uuid) from public, anon, authenticated;
grant  execute on function bump_partner_click(uuid) to service_role;
