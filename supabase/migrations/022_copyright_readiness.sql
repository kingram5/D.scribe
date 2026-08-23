-- 022: Copyright Readiness — structure provenance
--
-- Records whether the author accepted the AI outline as-is or edited it.
-- Used by the Copyright Readiness scorer (deterministic, no model calls).
-- Set 'ai_edited' when the user modifies any chapter title/summary/order/add/remove
-- at the Structure step. 'user_authored' is reserved for a future
-- outline-from-scratch path (do not wire in v1).

-- Structure provenance: did the user author/edit the outline, or accept the AI's?
alter table projects add column if not exists structure_provenance text not null default 'ai_generated_accepted'
  check (structure_provenance in ('ai_generated_accepted', 'ai_edited', 'user_authored'));
