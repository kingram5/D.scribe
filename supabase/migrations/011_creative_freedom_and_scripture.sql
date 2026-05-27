-- Persist the Creative Freedom slider per project (#14) and the chosen
-- scripture translation for faith audiences (#11).
alter table projects
  add column if not exists creative_freedom integer not null default 50,
  add column if not exists scripture_translation text;

comment on column projects.creative_freedom is 'Creative freedom slider 0-100, persisted for the project lifetime (#14).';
comment on column projects.scripture_translation is 'Preferred Bible translation for scripture enrichment (Christian Living / Faith Community audiences) (#11).';
