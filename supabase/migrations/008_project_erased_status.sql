-- Allow 'erased' as a valid project status (soft delete)
alter table projects
  drop constraint if exists projects_status_check;

alter table projects
  add constraint projects_status_check
  check (status in ('draft', 'in_progress', 'complete', 'erased'));
