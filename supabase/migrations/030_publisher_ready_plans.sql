-- 030: Publisher-Ready plan allotments. ⚠️ LAUNCH DAY ONLY.
--
-- Apply this together with the Stripe price swap (new $50 / $100 / $200
-- prices in the STRIPE_PRICE_* env vars), never before. deduct_ink's lazy
-- refill reads tier_ink_allotment, so applying this early would hand every
-- current $25/$50/$100 subscriber the new, 5x larger allotment on their next
-- refill.
--
-- Plans (Kyle 2026-09-27, option #3): each plan is sized to whole
-- Publisher-Ready books at the unchanged meter (Ink = vendor $ x 102,
-- ~1,200 Ink per book):
--   Starter  $50  -> 1,500 Ink (1 book / month + that month's interviews)
--   Pro      $100 -> 3,000 Ink (2 books / month)
--   Premium  $200 -> 7,500 Ink (5 books / month)

create or replace function tier_ink_allotment(p_tier text) returns numeric as $$
begin
  case p_tier
    when 'starter' then return 1500;
    when 'pro'     then return 3000;
    when 'premium' then return 7500;
    when 'free'    then return 10;   -- one-time trial; never refilled
    else                return 0;
  end case;
end;
$$ language plpgsql immutable;
