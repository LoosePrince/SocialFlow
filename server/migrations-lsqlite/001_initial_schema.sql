PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  displayname TEXT NOT NULL DEFAULT '',
  photourl TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  createdat INTEGER NOT NULL,
  qq_uin TEXT,
  passwordhash TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_qq_uin_unique
ON profiles (qq_uin)
WHERE qq_uin IS NOT NULL AND qq_uin <> '';

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  authorid TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  createdat INTEGER NOT NULL,
  likecount INTEGER NOT NULL DEFAULT 0,
  commentcount INTEGER NOT NULL DEFAULT 0,
  isrecommended INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  images TEXT NOT NULL DEFAULT '[]',
  type TEXT NOT NULL DEFAULT 'post'
);

CREATE INDEX IF NOT EXISTS idx_posts_authorid ON posts (authorid);
CREATE INDEX IF NOT EXISTS idx_posts_createdat ON posts (createdat DESC);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  authorid TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  createdat INTEGER NOT NULL,
  likecount INTEGER NOT NULL DEFAULT 0,
  commentcount INTEGER NOT NULL DEFAULT 0,
  isrecommended INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  coverurl TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]',
  type TEXT NOT NULL DEFAULT 'project'
);

CREATE INDEX IF NOT EXISTS idx_projects_authorid ON projects (authorid);
CREATE INDEX IF NOT EXISTS idx_projects_createdat ON projects (createdat DESC);

CREATE TABLE IF NOT EXISTS file_folders (
  id TEXT PRIMARY KEY,
  ownerid TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  parentid TEXT REFERENCES file_folders (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  createdat INTEGER NOT NULL,
  updatedat INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_file_folders_ownerid ON file_folders (ownerid);
CREATE INDEX IF NOT EXISTS idx_file_folders_parentid ON file_folders (parentid);

CREATE TABLE IF NOT EXISTS file_assets (
  id TEXT PRIMARY KEY,
  ownerid TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  folderid TEXT REFERENCES file_folders (id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  ext TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'file',
  checksum TEXT NOT NULL DEFAULT '',
  createdat INTEGER NOT NULL,
  updatedat INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_file_assets_ownerid ON file_assets (ownerid, createdat DESC);
CREATE INDEX IF NOT EXISTS idx_file_assets_folderid ON file_assets (folderid);
CREATE INDEX IF NOT EXISTS idx_file_assets_kind ON file_assets (kind);
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_assets_owner_path_unique ON file_assets (ownerid, path);

CREATE TABLE IF NOT EXISTS post_attachments (
  postid TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  assetid TEXT NOT NULL REFERENCES file_assets (id) ON DELETE CASCADE,
  sortorder INTEGER NOT NULL DEFAULT 0,
  createdat INTEGER NOT NULL,
  PRIMARY KEY (postid, assetid)
);

CREATE INDEX IF NOT EXISTS idx_post_attachments_postid ON post_attachments (postid, sortorder);
CREATE INDEX IF NOT EXISTS idx_post_attachments_assetid ON post_attachments (assetid);

CREATE TABLE IF NOT EXISTS project_attachments (
  projectid TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  assetid TEXT NOT NULL REFERENCES file_assets (id) ON DELETE CASCADE,
  sortorder INTEGER NOT NULL DEFAULT 0,
  createdat INTEGER NOT NULL,
  PRIMARY KEY (projectid, assetid)
);

CREATE INDEX IF NOT EXISTS idx_project_attachments_projectid ON project_attachments (projectid, sortorder);
CREATE INDEX IF NOT EXISTS idx_project_attachments_assetid ON project_attachments (assetid);

CREATE TABLE IF NOT EXISTS likes (
  id TEXT PRIMARY KEY,
  userid TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  contentid TEXT NOT NULL,
  contenttype TEXT NOT NULL CHECK (contenttype IN ('post', 'project')),
  createdat INTEGER NOT NULL,
  UNIQUE (userid, contentid)
);

CREATE INDEX IF NOT EXISTS idx_likes_content ON likes (contentid, contenttype);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  contentid TEXT NOT NULL,
  contenttype TEXT NOT NULL CHECK (contenttype IN ('post', 'project')),
  authorid TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  createdat INTEGER NOT NULL,
  parentid TEXT,
  replytoname TEXT,
  mentionids TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_comments_content ON comments (contentid, contenttype);
CREATE INDEX IF NOT EXISTS idx_comments_createdat ON comments (createdat DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  touserid TEXT NOT NULL,
  fromuserid TEXT,
  fromusername TEXT NOT NULL DEFAULT '',
  commenttext TEXT NOT NULL DEFAULT '',
  contentid TEXT,
  contenttype TEXT,
  type TEXT NOT NULL DEFAULT 'mention',
  isread INTEGER NOT NULL DEFAULT 0,
  createdat INTEGER NOT NULL,
  eventkey TEXT NOT NULL DEFAULT '',
  isalert INTEGER NOT NULL DEFAULT 1,
  payload TEXT NOT NULL DEFAULT '{}',
  CHECK (contenttype IS NULL OR contenttype IN ('post', 'project'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_touser ON notifications (touserid, createdat DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unique_event
ON notifications (touserid, type, eventkey)
WHERE eventkey <> '';

CREATE TABLE IF NOT EXISTS notification_settings (
  userid TEXT PRIMARY KEY REFERENCES profiles (id) ON DELETE CASCADE,
  receive_recommend INTEGER NOT NULL DEFAULT 1,
  alert_recommend INTEGER NOT NULL DEFAULT 1,
  receive_like INTEGER NOT NULL DEFAULT 1,
  alert_like INTEGER NOT NULL DEFAULT 1,
  receive_comment INTEGER NOT NULL DEFAULT 1,
  alert_comment INTEGER NOT NULL DEFAULT 1,
  receive_reply INTEGER NOT NULL DEFAULT 1,
  alert_reply INTEGER NOT NULL DEFAULT 1,
  receive_delete INTEGER NOT NULL DEFAULT 1,
  alert_delete INTEGER NOT NULL DEFAULT 1,
  receive_mention INTEGER NOT NULL DEFAULT 1,
  alert_mention INTEGER NOT NULL DEFAULT 1,
  updatedat INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  userid TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  useragent TEXT NOT NULL DEFAULT '',
  createdat INTEGER NOT NULL,
  updatedat INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_userid
ON push_subscriptions (userid);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '{}',
  updatedat INTEGER NOT NULL DEFAULT 0,
  updatedby TEXT
);