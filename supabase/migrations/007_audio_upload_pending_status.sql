-- Add pending_upload status to audio_uploads to correctly reflect lifecycle:
-- upload-url creates record as 'pending_upload', confirm-upload transitions to 'uploaded'
alter table audio_uploads
  drop constraint if exists audio_uploads_status_check;

alter table audio_uploads
  add constraint audio_uploads_status_check
  check (status in ('pending_upload', 'uploaded', 'transcribing', 'transcribed', 'failed'));

alter table audio_uploads
  alter column status set default 'pending_upload';
