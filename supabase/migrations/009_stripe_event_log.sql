-- Migration 009: Stripe event idempotency log
-- Stores processed Stripe event IDs so duplicate webhook deliveries are ignored.

create table if not exists stripe_events (
  id            text        primary key,     -- Stripe event ID (evt_...)
  type          text        not null,
  processed_at  timestamptz not null default now()
);

-- Index for fast lookups (primary key covers this, but explicit for clarity)
comment on table stripe_events is 'Idempotency log for Stripe webhook events. Insert before processing; ignore if insert fails due to PK conflict.';
