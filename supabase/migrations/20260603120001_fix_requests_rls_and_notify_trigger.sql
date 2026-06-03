-- Fix 1: "Uploaders create requests" still referenced 'admin_uploader' (deleted role).
-- Admin users were getting 403 when trying to create pre-spend requests.
DROP POLICY "Uploaders create requests" ON public.requests;

CREATE POLICY "Uploaders create requests" ON public.requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = requested_by AND
    public.has_role(auth.uid(), 'admin')
  );

-- Fix 2: notify_super_admins fired on every invoice INSERT, including when
-- super_admin uploads (status already 'approved', no review needed).
-- Skip the INSERT notification in that case to avoid noise.
CREATE OR REPLACE FUNCTION public.notify_super_admins()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id UUID;
  msg TEXT;
  ttl TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Super admin uploads are auto-approved; no review notification needed.
    IF NEW.status = 'approved' THEN
      RETURN NEW;
    END IF;
    ttl := 'New invoice submitted for review';
    msg := 'Invoice ' || NEW.invoice_number || ' from ' || NEW.vendor
           || ' · ' || NEW.amount::TEXT;

  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    ttl := 'Invoice ' || NEW.status::TEXT;
    msg := 'Invoice ' || NEW.invoice_number || ' from ' || NEW.vendor
           || ' is now ' || NEW.status::TEXT;
  ELSE
    RETURN NEW;
  END IF;

  FOR admin_id IN
    SELECT user_id FROM public.user_roles WHERE role = 'super_admin'
  LOOP
    INSERT INTO public.notifications (recipient_id, title, message, type, link)
    VALUES (admin_id, ttl, msg, 'invoice', '/invoices/' || NEW.id);
  END LOOP;

  RETURN NEW;
END;
$$;
