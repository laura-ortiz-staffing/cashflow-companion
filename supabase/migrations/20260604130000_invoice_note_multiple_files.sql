-- Replace single-file note columns with arrays to support multiple attachments.
-- Columns were just added with no production data, so drop-and-recreate is safe.
ALTER TABLE public.invoices
  DROP COLUMN IF EXISTS note_file_url,
  DROP COLUMN IF EXISTS note_file_name,
  ADD COLUMN note_file_urls  TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN note_file_names TEXT[] NOT NULL DEFAULT '{}';
