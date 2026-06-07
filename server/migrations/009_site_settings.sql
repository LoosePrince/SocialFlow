CREATE TABLE IF NOT EXISTS public.site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updatedat bigint NOT NULL DEFAULT (extract(epoch from now())::bigint * 1000),
  updatedby text
);
