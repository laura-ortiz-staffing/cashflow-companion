-- Add optional note attachment columns to invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS note_file_url  TEXT,
  ADD COLUMN IF NOT EXISTS note_file_name TEXT;

-- Allow the uploader to update their own invoice while still unlocked
-- (needed so they can add/replace note attachments before approval)
CREATE POLICY "Uploaders update own unlocked invoices" ON public.invoices
  FOR UPDATE TO authenticated
  USING  (auth.uid() = uploaded_by AND locked = false)
  WITH CHECK (auth.uid() = uploaded_by AND locked = false);
