DO $$
DECLARE
  profile_id_udt text;
  profile_id_type text;
BEGIN
  SELECT udt_name
  INTO profile_id_udt
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'id'
  LIMIT 1;

  profile_id_type := CASE WHEN profile_id_udt = 'uuid' THEN 'uuid' ELSE 'text' END;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'file_folders'
  ) THEN
    EXECUTE format(
      'CREATE TABLE public.file_folders (
        id uuid PRIMARY KEY,
        ownerid %s NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
        parentid uuid REFERENCES public.file_folders (id) ON DELETE CASCADE,
        name text NOT NULL,
        createdat bigint NOT NULL,
        updatedat bigint NOT NULL
      )',
      profile_id_type
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'file_assets'
  ) THEN
    EXECUTE format(
      'CREATE TABLE public.file_assets (
        id uuid PRIMARY KEY,
        ownerid %s NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
        folderid uuid REFERENCES public.file_folders (id) ON DELETE SET NULL,
        path text NOT NULL,
        url text NOT NULL DEFAULT '''',
        name text NOT NULL,
        mime text NOT NULL DEFAULT ''application/octet-stream'',
        size bigint NOT NULL DEFAULT 0,
        ext text NOT NULL DEFAULT '''',
        kind text NOT NULL DEFAULT ''file'',
        checksum text NOT NULL DEFAULT '''',
        createdat bigint NOT NULL,
        updatedat bigint NOT NULL
      )',
      profile_id_type
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_file_folders_ownerid ON public.file_folders (ownerid);
CREATE INDEX IF NOT EXISTS idx_file_folders_parentid ON public.file_folders (parentid);

CREATE INDEX IF NOT EXISTS idx_file_assets_ownerid ON public.file_assets (ownerid, createdat DESC);
CREATE INDEX IF NOT EXISTS idx_file_assets_folderid ON public.file_assets (folderid);
CREATE INDEX IF NOT EXISTS idx_file_assets_kind ON public.file_assets (kind);
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_assets_owner_path_unique ON public.file_assets (ownerid, path);

CREATE TABLE IF NOT EXISTS public.post_attachments (
  postid uuid NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  assetid uuid NOT NULL REFERENCES public.file_assets (id) ON DELETE CASCADE,
  sortorder integer NOT NULL DEFAULT 0,
  createdat bigint NOT NULL,
  PRIMARY KEY (postid, assetid)
);

CREATE INDEX IF NOT EXISTS idx_post_attachments_postid ON public.post_attachments (postid, sortorder);
CREATE INDEX IF NOT EXISTS idx_post_attachments_assetid ON public.post_attachments (assetid);

CREATE TABLE IF NOT EXISTS public.project_attachments (
  projectid uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  assetid uuid NOT NULL REFERENCES public.file_assets (id) ON DELETE CASCADE,
  sortorder integer NOT NULL DEFAULT 0,
  createdat bigint NOT NULL,
  PRIMARY KEY (projectid, assetid)
);

CREATE INDEX IF NOT EXISTS idx_project_attachments_projectid ON public.project_attachments (projectid, sortorder);
CREATE INDEX IF NOT EXISTS idx_project_attachments_assetid ON public.project_attachments (assetid);
