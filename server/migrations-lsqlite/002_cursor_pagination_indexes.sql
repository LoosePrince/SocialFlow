CREATE INDEX IF NOT EXISTS idx_posts_createdat_id
ON posts (createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_posts_authorid_createdat_id
ON posts (authorid, createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_posts_recommended_createdat_id
ON posts (isrecommended, createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_posts_authorid_recommended_createdat_id
ON posts (authorid, isrecommended, createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_projects_createdat_id
ON projects (createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_projects_authorid_createdat_id
ON projects (authorid, createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_projects_recommended_createdat_id
ON projects (isrecommended, createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_projects_authorid_recommended_createdat_id
ON projects (authorid, isrecommended, createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_createdat_id
ON profiles (createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_comments_content_createdat_id
ON comments (contentid, contenttype, createdat DESC, id DESC);