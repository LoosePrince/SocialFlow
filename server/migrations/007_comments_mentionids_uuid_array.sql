-- 统一 comments.mentionids 为 uuid[]，兼容历史 jsonb 结构。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'comments'
      AND column_name = 'mentionids'
      AND udt_name = 'jsonb'
  ) THEN
    ALTER TABLE public.comments
      ALTER COLUMN mentionids DROP DEFAULT;

    ALTER TABLE public.comments
      ALTER COLUMN mentionids TYPE uuid[]
      USING (
        COALESCE(
          ARRAY(
            SELECT value::uuid
            FROM jsonb_array_elements_text(mentionids) AS t(value)
            WHERE value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          ),
          ARRAY[]::uuid[]
        )
      );

    ALTER TABLE public.comments
      ALTER COLUMN mentionids SET DEFAULT ARRAY[]::uuid[];
  END IF;
END $$;
