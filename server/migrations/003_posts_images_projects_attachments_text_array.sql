-- posts.images、projects.attachments 统一为 text[]，与 Node postgres.sql.array() 写入一致。
-- 若当前为 jsonb（旧版 001），则转换为 text[]；若已是 text[] 则跳过。

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'posts'
      AND c.column_name = 'images'
      AND c.data_type = 'jsonb'
  ) THEN
    ALTER TABLE public.posts
      ALTER COLUMN images DROP DEFAULT,
      ALTER COLUMN images TYPE text[] USING (
        COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(COALESCE(images, '[]'::jsonb))),
          ARRAY[]::text[]
        )
      ),
      ALTER COLUMN images SET DEFAULT ARRAY[]::text[],
      ALTER COLUMN images SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'projects'
      AND c.column_name = 'attachments'
      AND c.data_type = 'jsonb'
  ) THEN
    ALTER TABLE public.projects
      ALTER COLUMN attachments DROP DEFAULT,
      ALTER COLUMN attachments TYPE text[] USING (
        COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(COALESCE(attachments, '[]'::jsonb))),
          ARRAY[]::text[]
        )
      ),
      ALTER COLUMN attachments SET DEFAULT ARRAY[]::text[],
      ALTER COLUMN attachments SET NOT NULL;
  END IF;
END $$;
