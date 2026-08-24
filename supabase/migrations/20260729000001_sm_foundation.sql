-- =============================================================================
-- Stack Management Foundation
-- Tables: sm_user_roles, sm_invitations, sm_app_catalog,
--         sm_license_assignments, sm_ai_usage, sm_cloud_services
-- Extends: subscriptions (catalog_id, license_count)
--          subscriptions RLS (SM-aware policies)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SM USER ROLES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.sm_user_roles (
  user_id    UUID        NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'viewer' CHECK (role IN ('super_admin', 'viewer')),
  granted_by UUID        REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sm_user_roles ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER helpers so RLS policies don't recurse into sm_user_roles
CREATE OR REPLACE FUNCTION public.get_sm_role(_user_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.sm_user_roles WHERE user_id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.has_sm_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sm_user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_sm_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_sm_role(UUID, TEXT) TO authenticated;

CREATE POLICY "sm_user_roles_self_select"
  ON public.sm_user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "sm_user_roles_super_admin_all"
  ON public.sm_user_roles FOR ALL TO authenticated
  USING  (public.has_sm_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_sm_role(auth.uid(), 'super_admin'));

-- Seed: global super_admins with SM access → SM super_admin; others → viewer
INSERT INTO public.sm_user_roles (user_id, role)
SELECT aa.user_id,
  CASE WHEN ur.role = 'super_admin' THEN 'super_admin' ELSE 'viewer' END
FROM public.app_access aa
LEFT JOIN public.user_roles ur ON ur.user_id = aa.user_id
WHERE aa.app = 'stack_management'
ON CONFLICT (user_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SM INVITATIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.sm_invitations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token      TEXT        NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  email      TEXT        NOT NULL,
  sm_role    TEXT        NOT NULL DEFAULT 'viewer' CHECK (sm_role IN ('super_admin', 'viewer')),
  status     TEXT        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'used', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_by UUID        NOT NULL REFERENCES auth.users(id),
  used_by    UUID        REFERENCES auth.users(id),
  used_at    TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate active invitations for the same email
CREATE UNIQUE INDEX sm_invitations_pending_email_idx
  ON public.sm_invitations (lower(email))
  WHERE status = 'pending';

ALTER TABLE public.sm_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sm_invitations_super_admin_all"
  ON public.sm_invitations FOR ALL TO authenticated
  USING  (public.has_sm_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_sm_role(auth.uid(), 'super_admin'));

CREATE POLICY "sm_invitations_self_select"
  ON public.sm_invitations FOR SELECT TO authenticated
  USING (lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid())));

-- Token lookup (anon-accessible so users can preview before signing in)
CREATE OR REPLACE FUNCTION public.get_sm_invitation_by_token(_token TEXT)
RETURNS TABLE (
  id UUID, email TEXT, sm_role TEXT, status TEXT, expires_at TIMESTAMPTZ
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, email, sm_role, status, expires_at
  FROM public.sm_invitations
  WHERE token = _token;
$$;

GRANT EXECUTE ON FUNCTION public.get_sm_invitation_by_token(TEXT) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. APPLICATION CATALOG
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.sm_app_catalog (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  slug           TEXT        NOT NULL UNIQUE,
  provider       TEXT,
  description    TEXT,
  category       TEXT        NOT NULL DEFAULT 'Other',
  website        TEXT,
  logo_url       TEXT,
  billing_models TEXT[]      NOT NULL DEFAULT '{}',
  is_custom      BOOLEAN     NOT NULL DEFAULT false,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  source         TEXT,
  source_id      TEXT,
  created_by     UUID        REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sm_app_catalog_category_idx ON public.sm_app_catalog (category);
CREATE INDEX sm_app_catalog_name_idx     ON public.sm_app_catalog (lower(name));

ALTER TABLE public.sm_app_catalog ENABLE ROW LEVEL SECURITY;

-- All SM users can read the catalog
CREATE POLICY "sm_app_catalog_sm_users_select"
  ON public.sm_app_catalog FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.app_access
    WHERE user_id = auth.uid() AND app = 'stack_management'
  ));

-- Only SM super_admins can write (insert custom apps, etc.)
CREATE POLICY "sm_app_catalog_super_admin_write"
  ON public.sm_app_catalog FOR ALL TO authenticated
  USING  (public.has_sm_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_sm_role(auth.uid(), 'super_admin'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. EXTEND SUBSCRIPTIONS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN catalog_id    UUID REFERENCES public.sm_app_catalog(id),
  ADD COLUMN license_count INT  CHECK (license_count IS NULL OR license_count >= 0);

-- Additional SM-aware RLS on subscriptions (complement existing Petty Cash policies)
CREATE POLICY "subscriptions_sm_users_select"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.app_access
    WHERE user_id = auth.uid() AND app = 'stack_management'
  ));

CREATE POLICY "subscriptions_sm_super_admin_all"
  ON public.subscriptions FOR ALL TO authenticated
  USING  (public.has_sm_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_sm_role(auth.uid(), 'super_admin'));

-- SM-aware RLS on subscription_payment_logs
CREATE POLICY "payment_logs_sm_users_select"
  ON public.subscription_payment_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.app_access
    WHERE user_id = auth.uid() AND app = 'stack_management'
  ));

CREATE POLICY "payment_logs_sm_super_admin_all"
  ON public.subscription_payment_logs FOR ALL TO authenticated
  USING  (public.has_sm_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_sm_role(auth.uid(), 'super_admin'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. LICENSE ASSIGNMENTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.sm_license_assignments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID        NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  member_id       UUID        REFERENCES auth.users(id),
  assigned_email  TEXT        NOT NULL,
  assigned_name   TEXT,
  status          TEXT        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'revoked')),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by     UUID        REFERENCES auth.users(id),
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID        REFERENCES auth.users(id),
  notes           TEXT
);

CREATE INDEX sm_license_sub_idx    ON public.sm_license_assignments (subscription_id);
CREATE INDEX sm_license_email_idx  ON public.sm_license_assignments (lower(assigned_email));
CREATE INDEX sm_license_member_idx ON public.sm_license_assignments (member_id);

ALTER TABLE public.sm_license_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sm_license_sm_users_select"
  ON public.sm_license_assignments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.app_access
    WHERE user_id = auth.uid() AND app = 'stack_management'
  ));

CREATE POLICY "sm_license_super_admin_all"
  ON public.sm_license_assignments FOR ALL TO authenticated
  USING  (public.has_sm_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_sm_role(auth.uid(), 'super_admin'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. AI USAGE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.sm_ai_usage (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider             TEXT        NOT NULL,
  service_name         TEXT        NOT NULL,
  account_project      TEXT,
  billing_period_start DATE,
  billing_period_end   DATE,
  usage_amount         NUMERIC(18,4),
  usage_unit           TEXT        NOT NULL DEFAULT 'tokens'
                       CHECK (usage_unit IN (
                         'tokens','requests','images','minutes',
                         'characters','credits','custom'
                       )),
  estimated_cost       NUMERIC(12,2),
  currency             TEXT        NOT NULL DEFAULT 'USD',
  spending_limit       NUMERIC(12,2),
  data_source          TEXT        NOT NULL DEFAULT 'manual'
                       CHECK (data_source IN ('manual','imported','api_sync')),
  status               TEXT        NOT NULL DEFAULT 'active',
  notes                TEXT,
  catalog_id           UUID        REFERENCES public.sm_app_catalog(id),
  recorded_by          UUID        NOT NULL REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sm_ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sm_ai_usage_sm_users_select"
  ON public.sm_ai_usage FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.app_access
    WHERE user_id = auth.uid() AND app = 'stack_management'
  ));

CREATE POLICY "sm_ai_usage_super_admin_all"
  ON public.sm_ai_usage FOR ALL TO authenticated
  USING  (public.has_sm_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_sm_role(auth.uid(), 'super_admin'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. CLOUD SERVICES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.sm_cloud_services (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          TEXT        NOT NULL,
  service_name      TEXT        NOT NULL,
  environment       TEXT        CHECK (environment IN ('production','staging','development','other')),
  project_account   TEXT,
  owner             TEXT,
  billing_model     TEXT        CHECK (billing_model IN (
                      'pay_as_you_go','monthly','quarterly','annual','custom'
                    )),
  current_cost      NUMERIC(12,2),
  currency          TEXT        NOT NULL DEFAULT 'USD',
  billing_period    TEXT,
  next_billing_date DATE,
  status            TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','paused','cancelled')),
  notes             TEXT,
  catalog_id        UUID        REFERENCES public.sm_app_catalog(id),
  recorded_by       UUID        NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sm_cloud_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sm_cloud_sm_users_select"
  ON public.sm_cloud_services FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.app_access
    WHERE user_id = auth.uid() AND app = 'stack_management'
  ));

CREATE POLICY "sm_cloud_super_admin_all"
  ON public.sm_cloud_services FOR ALL TO authenticated
  USING  (public.has_sm_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_sm_role(auth.uid(), 'super_admin'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. TRIGGERS: updated_at
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_sm_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER sm_app_catalog_updated_at
  BEFORE UPDATE ON public.sm_app_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_sm_updated_at();

CREATE TRIGGER sm_ai_usage_updated_at
  BEFORE UPDATE ON public.sm_ai_usage
  FOR EACH ROW EXECUTE FUNCTION public.set_sm_updated_at();

CREATE TRIGGER sm_cloud_services_updated_at
  BEFORE UPDATE ON public.sm_cloud_services
  FOR EACH ROW EXECUTE FUNCTION public.set_sm_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. ACCEPT SM INVITATION FUNCTION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_sm_invitation(_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv     public.sm_invitations%ROWTYPE;
  uid     UUID := auth.uid();
  u_email TEXT;
BEGIN
  SELECT * INTO inv FROM public.sm_invitations WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  IF inv.status != 'pending' THEN
    RETURN jsonb_build_object('error', 'invalid_status', 'status', inv.status);
  END IF;
  IF inv.expires_at < now() THEN
    UPDATE public.sm_invitations SET status = 'expired' WHERE id = inv.id;
    RETURN jsonb_build_object('error', 'expired');
  END IF;
  SELECT email INTO u_email FROM auth.users WHERE id = uid;
  IF lower(u_email) != lower(inv.email) THEN
    RETURN jsonb_build_object('error', 'email_mismatch');
  END IF;
  -- Grant SM app access
  INSERT INTO public.app_access (user_id, app, granted_by)
  VALUES (uid, 'stack_management', inv.created_by)
  ON CONFLICT (user_id, app) DO NOTHING;
  -- Set SM role
  INSERT INTO public.sm_user_roles (user_id, role, granted_by)
  VALUES (uid, inv.sm_role, inv.created_by)
  ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by, granted_at = now();
  -- Link any pre-account license assignments
  UPDATE public.sm_license_assignments
  SET member_id = uid
  WHERE lower(assigned_email) = lower(inv.email) AND member_id IS NULL;
  -- Mark invitation used
  UPDATE public.sm_invitations
  SET status = 'used', used_by = uid, used_at = now()
  WHERE id = inv.id;
  RETURN jsonb_build_object('ok', true, 'sm_role', inv.sm_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_sm_invitation(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. CATALOG SEED
-- Curated catalog of 65+ common business tools.
-- Source: manually curated from publicly known information.
-- No proprietary data or logos included.
-- Idempotent: ON CONFLICT (slug) DO NOTHING.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.sm_app_catalog
  (name, slug, provider, description, category, website, billing_models, is_custom, source)
VALUES
-- AI
('Claude',          'claude',         'Anthropic',          'AI assistant for analysis, writing, and coding.',                                     'AI',            'https://claude.ai',                              ARRAY['monthly','annual','pay_as_you_go'], false, 'curated'),
('ChatGPT',         'chatgpt',        'OpenAI',             'Conversational AI assistant for productivity and research.',                           'AI',            'https://chat.openai.com',                        ARRAY['monthly','annual'],                false, 'curated'),
('OpenAI API',      'openai-api',     'OpenAI',             'API access to GPT models for application development.',                               'AI',            'https://platform.openai.com',                    ARRAY['pay_as_you_go'],                   false, 'curated'),
('Gemini',          'gemini',         'Google',             'Google AI assistant and API platform.',                                               'AI',            'https://gemini.google.com',                      ARRAY['monthly','annual','pay_as_you_go'], false, 'curated'),
('GitHub Copilot',  'github-copilot', 'GitHub / Microsoft', 'AI pair programmer integrated into code editors.',                                    'AI',            'https://github.com/features/copilot',            ARRAY['monthly','annual'],                false, 'curated'),
('Midjourney',      'midjourney',     'Midjourney',         'AI image generation service.',                                                        'AI',            'https://www.midjourney.com',                     ARRAY['monthly','annual'],                false, 'curated'),
('Perplexity',      'perplexity',     'Perplexity AI',      'AI-powered search and research assistant.',                                           'AI',            'https://www.perplexity.ai',                      ARRAY['monthly','annual'],                false, 'curated'),
('ElevenLabs',      'elevenlabs',     'ElevenLabs',         'AI voice generation and text-to-speech platform.',                                    'AI',            'https://elevenlabs.io',                          ARRAY['monthly','pay_as_you_go'],          false, 'curated'),
('Runway',          'runway',         'Runway',             'AI video generation and creative tools.',                                             'AI',            'https://runwayml.com',                           ARRAY['monthly','pay_as_you_go'],          false, 'curated'),
('Anthropic API',   'anthropic-api',  'Anthropic',          'Direct API access to Claude models.',                                                 'AI',            'https://console.anthropic.com',                  ARRAY['pay_as_you_go'],                   false, 'curated'),
-- Cloud
('AWS',             'aws',            'Amazon',             'Cloud computing platform with 200+ services.',                                        'Cloud',         'https://aws.amazon.com',                         ARRAY['pay_as_you_go','monthly'],          false, 'curated'),
('Google Cloud',    'google-cloud',   'Google',             'Cloud platform for computing, storage, and ML.',                                      'Cloud',         'https://cloud.google.com',                       ARRAY['pay_as_you_go','monthly'],          false, 'curated'),
('Microsoft Azure', 'azure',          'Microsoft',          'Cloud platform for applications and infrastructure.',                                 'Cloud',         'https://azure.microsoft.com',                    ARRAY['pay_as_you_go','monthly'],          false, 'curated'),
('Render',          'render',         'Render',             'Cloud platform for web apps, APIs, and databases.',                                   'Cloud',         'https://render.com',                             ARRAY['monthly','pay_as_you_go'],          false, 'curated'),
('Vercel',          'vercel',         'Vercel',             'Frontend cloud platform for web deployment.',                                         'Cloud',         'https://vercel.com',                             ARRAY['monthly','annual','pay_as_you_go'], false, 'curated'),
('Cloudflare',      'cloudflare',     'Cloudflare',         'CDN, security, and serverless computing platform.',                                   'Cloud',         'https://www.cloudflare.com',                     ARRAY['monthly','annual','pay_as_you_go'], false, 'curated'),
('DigitalOcean',    'digitalocean',   'DigitalOcean',       'Cloud infrastructure for developers.',                                                'Cloud',         'https://www.digitalocean.com',                   ARRAY['monthly','pay_as_you_go'],          false, 'curated'),
('Supabase',        'supabase',       'Supabase',           'Open source Firebase alternative with Postgres.',                                     'Cloud',         'https://supabase.com',                           ARRAY['monthly','annual','pay_as_you_go'], false, 'curated'),
('Heroku',          'heroku',         'Salesforce',         'Platform as a service for application deployment.',                                   'Cloud',         'https://www.heroku.com',                         ARRAY['monthly','pay_as_you_go'],          false, 'curated'),
('Netlify',         'netlify',        'Netlify',            'Web hosting and CI/CD platform for frontend developers.',                             'Cloud',         'https://www.netlify.com',                        ARRAY['monthly','annual','pay_as_you_go'], false, 'curated'),
-- Development
('GitHub',          'github',         'Microsoft',          'Code hosting, collaboration, and CI/CD platform.',                                    'Development',   'https://github.com',                             ARRAY['monthly','annual'],                false, 'curated'),
('GitLab',          'gitlab',         'GitLab',             'DevOps platform with CI/CD and code hosting.',                                        'Development',   'https://gitlab.com',                             ARRAY['monthly','annual'],                false, 'curated'),
('Jira',            'jira',           'Atlassian',          'Project and issue tracking for software teams.',                                      'Development',   'https://www.atlassian.com/software/jira',        ARRAY['monthly','annual'],                false, 'curated'),
('Linear',          'linear',         'Linear',             'Modern issue tracker for software teams.',                                            'Development',   'https://linear.app',                             ARRAY['monthly','annual'],                false, 'curated'),
('Sentry',          'sentry',         'Sentry',             'Error tracking and application monitoring.',                                          'Development',   'https://sentry.io',                              ARRAY['monthly','annual','pay_as_you_go'], false, 'curated'),
('Datadog',         'datadog',        'Datadog',            'Cloud monitoring and observability platform.',                                        'Development',   'https://www.datadoghq.com',                      ARRAY['monthly','annual','pay_as_you_go'], false, 'curated'),
('Postman',         'postman',        'Postman',            'API development and testing platform.',                                               'Development',   'https://www.postman.com',                        ARRAY['monthly','annual'],                false, 'curated'),
('Retool',          'retool',         'Retool',             'Low-code platform for building internal tools.',                                      'Development',   'https://retool.com',                             ARRAY['monthly','annual'],                false, 'curated'),
('New Relic',       'new-relic',      'New Relic',          'Observability platform for application performance monitoring.',                      'Development',   'https://newrelic.com',                           ARRAY['monthly','annual','pay_as_you_go'], false, 'curated'),
-- Design
('Figma',           'figma',          'Figma',              'Collaborative UI/UX design and prototyping tool.',                                    'Design',        'https://www.figma.com',                          ARRAY['monthly','annual'],                false, 'curated'),
('Adobe Creative Cloud', 'adobe-cc', 'Adobe',               'Suite of creative applications (Photoshop, Illustrator, etc.).',                     'Design',        'https://www.adobe.com/creativecloud.html',       ARRAY['monthly','annual'],                false, 'curated'),
('Canva',           'canva',          'Canva',              'Graphic design platform for non-designers.',                                          'Design',        'https://www.canva.com',                          ARRAY['monthly','annual'],                false, 'curated'),
('Miro',            'miro',           'Miro',               'Online collaborative whiteboard for teams.',                                          'Design',        'https://miro.com',                               ARRAY['monthly','annual'],                false, 'curated'),
-- Productivity
('Notion',          'notion',         'Notion',             'All-in-one workspace for notes, docs, and wikis.',                                    'Productivity',  'https://www.notion.so',                          ARRAY['monthly','annual'],                false, 'curated'),
('Google Workspace','google-workspace','Google',            'Collaboration suite with Gmail, Docs, Drive, and more.',                              'Productivity',  'https://workspace.google.com',                   ARRAY['monthly','annual'],                false, 'curated'),
('Microsoft 365',   'microsoft-365',  'Microsoft',          'Office apps, Teams, OneDrive, and cloud services.',                                  'Productivity',  'https://www.microsoft.com/microsoft-365',        ARRAY['monthly','annual'],                false, 'curated'),
('Airtable',        'airtable',       'Airtable',           'Flexible spreadsheet-database hybrid.',                                               'Productivity',  'https://www.airtable.com',                       ARRAY['monthly','annual'],                false, 'curated'),
('Asana',           'asana',          'Asana',              'Project management and team coordination platform.',                                  'Productivity',  'https://asana.com',                              ARRAY['monthly','annual'],                false, 'curated'),
('Monday.com',      'monday',         'Monday.com',         'Work management platform for teams.',                                                 'Productivity',  'https://monday.com',                             ARRAY['monthly','annual'],                false, 'curated'),
('ClickUp',         'clickup',        'ClickUp',            'All-in-one productivity platform.',                                                   'Productivity',  'https://clickup.com',                            ARRAY['monthly','annual'],                false, 'curated'),
('Dropbox',         'dropbox',        'Dropbox',            'Cloud storage and file sharing platform.',                                            'Productivity',  'https://www.dropbox.com',                        ARRAY['monthly','annual'],                false, 'curated'),
-- Communication
('Slack',           'slack',          'Salesforce',         'Business messaging and collaboration platform.',                                      'Communication', 'https://slack.com',                              ARRAY['monthly','annual'],                false, 'curated'),
('Zoom',            'zoom',           'Zoom',               'Video conferencing and communication platform.',                                      'Communication', 'https://zoom.us',                                ARRAY['monthly','annual'],                false, 'curated'),
('Microsoft Teams', 'microsoft-teams','Microsoft',          'Team chat, meetings, and collaboration.',                                             'Communication', 'https://www.microsoft.com/en-us/microsoft-teams',ARRAY['monthly','annual'],                false, 'curated'),
('Loom',            'loom',           'Atlassian',          'Async video messaging for teams.',                                                    'Communication', 'https://www.loom.com',                           ARRAY['monthly','annual'],                false, 'curated'),
('Intercom',        'intercom',       'Intercom',           'Customer messaging and support platform.',                                            'Communication', 'https://www.intercom.com',                       ARRAY['monthly','annual'],                false, 'curated'),
-- Education
('Platzi',          'platzi',         'Platzi',             'Online learning platform focused on technology and business.',                        'Education',     'https://platzi.com',                             ARRAY['monthly','annual'],                false, 'curated'),
('Udemy Business',  'udemy-business', 'Udemy',              'On-demand learning platform for business teams.',                                     'Education',     'https://business.udemy.com',                     ARRAY['annual'],                          false, 'curated'),
('LinkedIn Learning','linkedin-learning','LinkedIn',        'Professional online courses and skill development.',                                  'Education',     'https://www.linkedin.com/learning',              ARRAY['monthly','annual'],                false, 'curated'),
('Coursera for Business','coursera-business','Coursera',    'University-grade online courses for enterprise teams.',                              'Education',     'https://www.coursera.org/business',              ARRAY['annual'],                          false, 'curated'),
-- Security
('1Password',       '1password',      '1Password',          'Password manager and security vault for teams.',                                      'Security',      'https://1password.com',                          ARRAY['monthly','annual'],                false, 'curated'),
('LastPass',        'lastpass',       'LastPass',           'Password manager for individuals and teams.',                                         'Security',      'https://www.lastpass.com',                       ARRAY['monthly','annual'],                false, 'curated'),
('Snyk',            'snyk',           'Snyk',               'Security platform for code, dependencies, and containers.',                           'Security',      'https://snyk.io',                                ARRAY['monthly','annual','pay_as_you_go'], false, 'curated'),
('Okta',            'okta',           'Okta',               'Identity and access management platform.',                                            'Security',      'https://www.okta.com',                           ARRAY['monthly','annual'],                false, 'curated'),
-- Analytics
('Google Analytics','google-analytics','Google',            'Web analytics and audience insights platform.',                                       'Analytics',     'https://analytics.google.com',                   ARRAY['pay_as_you_go'],                   false, 'curated'),
('Mixpanel',        'mixpanel',       'Mixpanel',           'Product analytics for user behavior tracking.',                                       'Analytics',     'https://mixpanel.com',                           ARRAY['monthly','annual'],                false, 'curated'),
('Hotjar',          'hotjar',         'Hotjar',             'Heatmaps and session recordings for UX insights.',                                    'Analytics',     'https://www.hotjar.com',                         ARRAY['monthly','annual'],                false, 'curated'),
('Amplitude',       'amplitude',      'Amplitude',          'Digital analytics platform for product teams.',                                       'Analytics',     'https://amplitude.com',                          ARRAY['monthly','annual'],                false, 'curated'),
-- Marketing
('HubSpot',         'hubspot',        'HubSpot',            'CRM, marketing automation, and sales tools.',                                         'Marketing',     'https://www.hubspot.com',                        ARRAY['monthly','annual'],                false, 'curated'),
('Mailchimp',       'mailchimp',      'Intuit',             'Email marketing and automation platform.',                                            'Marketing',     'https://mailchimp.com',                          ARRAY['monthly','annual','pay_as_you_go'], false, 'curated'),
('Semrush',         'semrush',        'Semrush',            'SEO, PPC, and competitive intelligence platform.',                                    'Marketing',     'https://www.semrush.com',                        ARRAY['monthly','annual'],                false, 'curated'),
-- Finance
('QuickBooks',      'quickbooks',     'Intuit',             'Accounting and financial management software.',                                       'Finance',       'https://quickbooks.intuit.com',                  ARRAY['monthly','annual'],                false, 'curated'),
('Stripe',          'stripe',         'Stripe',             'Payment processing and financial infrastructure platform.',                           'Finance',       'https://stripe.com',                             ARRAY['pay_as_you_go'],                   false, 'curated'),
-- HR
('BambooHR',        'bamboohr',       'BambooHR',           'Human resources management platform.',                                                'HR',            'https://www.bamboohr.com',                       ARRAY['monthly','annual'],                false, 'curated'),
('Deel',            'deel',           'Deel',               'Global payroll and HR compliance platform.',                                          'HR',            'https://www.deel.com',                           ARRAY['monthly'],                         false, 'curated'),
-- Operations
('Tango',           'tango',          'Tango',              'Documentation and workflow capture tool.',                                            'Operations',    'https://www.tango.us',                           ARRAY['monthly','annual'],                false, 'curated'),
('Zapier',          'zapier',         'Zapier',             'No-code automation platform connecting apps.',                                        'Operations',    'https://zapier.com',                             ARRAY['monthly','annual','pay_as_you_go'], false, 'curated'),
('Make',            'make',           'Make',               'Visual automation platform (formerly Integromat).',                                   'Operations',    'https://www.make.com',                           ARRAY['monthly','annual','pay_as_you_go'], false, 'curated'),
('Calendly',        'calendly',       'Calendly',           'Meeting scheduling and appointment automation.',                                      'Operations',    'https://calendly.com',                           ARRAY['monthly','annual'],                false, 'curated'),
('DocuSign',        'docusign',       'DocuSign',           'Electronic signature and agreement cloud platform.',                                  'Operations',    'https://www.docusign.com',                       ARRAY['monthly','annual'],                false, 'curated')
ON CONFLICT (slug) DO NOTHING;
