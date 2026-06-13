CREATE INDEX IF NOT EXISTS idx_posts_createdat_id
ON public.posts (createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_posts_authorid_createdat_id
ON public.posts (authorid, createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_posts_recommended_createdat_id
ON public.posts (isrecommended, createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_posts_authorid_recommended_createdat_id
ON public.posts (authorid, isrecommended, createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_projects_createdat_id
ON public.projects (createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_projects_authorid_createdat_id
ON public.projects (authorid, createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_projects_recommended_createdat_id
ON public.projects (isrecommended, createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_projects_authorid_recommended_createdat_id
ON public.projects (authorid, isrecommended, createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_createdat_id
ON public.profiles (createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_comments_content_createdat_id
ON public.comments (contentid, contenttype, createdat DESC, id DESC);