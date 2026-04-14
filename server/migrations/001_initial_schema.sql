-- SocialFlow 基线结构（全新数据库一次初始化到最新版本）。
-- 该脚本应始终保持可重复执行（IF NOT EXISTS / 幂等索引）。

CREATE TABLE IF NOT EXISTS public.profiles (
  id text PRIMARY KEY,
  email text NOT NULL,
  displayname text NOT NULL DEFAULT '',
  photourl text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'user',
  createdat bigint NOT NULL,
  qq_uin text,
  passwordhash text
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_qq_uin_unique
ON public.profiles (qq_uin)
WHERE qq_uin IS NOT NULL AND qq_uin <> '';

CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY,
  authorid text NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  createdat bigint NOT NULL,
  likecount integer NOT NULL DEFAULT 0,
  commentcount integer NOT NULL DEFAULT 0,
  isrecommended boolean NOT NULL DEFAULT false,
  content text NOT NULL,
  images text[] NOT NULL DEFAULT ARRAY[]::text[],
  type text NOT NULL DEFAULT 'post'
);

CREATE INDEX IF NOT EXISTS idx_posts_authorid ON public.posts (authorid);
CREATE INDEX IF NOT EXISTS idx_posts_createdat ON public.posts (createdat DESC);

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY,
  authorid text NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  createdat bigint NOT NULL,
  likecount integer NOT NULL DEFAULT 0,
  commentcount integer NOT NULL DEFAULT 0,
  isrecommended boolean NOT NULL DEFAULT false,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  content text NOT NULL,
  coverurl text NOT NULL DEFAULT '',
  attachments text[] NOT NULL DEFAULT ARRAY[]::text[],
  type text NOT NULL DEFAULT 'project'
);

CREATE INDEX IF NOT EXISTS idx_projects_authorid ON public.projects (authorid);
CREATE INDEX IF NOT EXISTS idx_projects_createdat ON public.projects (createdat DESC);

CREATE TABLE IF NOT EXISTS public.likes (
  id uuid PRIMARY KEY,
  userid text NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  contentid uuid NOT NULL,
  contenttype text NOT NULL CHECK (contenttype IN ('post', 'project')),
  createdat bigint NOT NULL,
  UNIQUE (userid, contentid)
);

CREATE INDEX IF NOT EXISTS idx_likes_content ON public.likes (contentid, contenttype);

CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY,
  contentid uuid NOT NULL,
  contenttype text NOT NULL CHECK (contenttype IN ('post', 'project')),
  authorid text NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  text text NOT NULL,
  createdat bigint NOT NULL,
  parentid uuid,
  replytoname text,
  mentionids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[]
);

CREATE INDEX IF NOT EXISTS idx_comments_content ON public.comments (contentid, contenttype);
CREATE INDEX IF NOT EXISTS idx_comments_createdat ON public.comments (createdat DESC);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY,
  touserid text NOT NULL,
  fromusername text NOT NULL DEFAULT '',
  commenttext text NOT NULL DEFAULT '',
  contentid uuid,
  contenttype text,
  type text NOT NULL DEFAULT 'mention',
  isread boolean NOT NULL DEFAULT false,
  createdat bigint NOT NULL,
  eventkey text NOT NULL DEFAULT '',
  isalert boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT notifications_contenttype_check CHECK (
    contenttype IS NULL OR contenttype IN ('post', 'project')
  )
);

CREATE INDEX IF NOT EXISTS idx_notifications_touser ON public.notifications (touserid, createdat DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unique_event
ON public.notifications (touserid, type, eventkey)
WHERE eventkey <> '';

CREATE TABLE IF NOT EXISTS public.notification_settings (
  userid text PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  receive_recommend boolean NOT NULL DEFAULT true,
  alert_recommend boolean NOT NULL DEFAULT true,
  receive_like boolean NOT NULL DEFAULT true,
  alert_like boolean NOT NULL DEFAULT true,
  receive_comment boolean NOT NULL DEFAULT true,
  alert_comment boolean NOT NULL DEFAULT true,
  receive_reply boolean NOT NULL DEFAULT true,
  alert_reply boolean NOT NULL DEFAULT true,
  receive_delete boolean NOT NULL DEFAULT true,
  alert_delete boolean NOT NULL DEFAULT true,
  receive_mention boolean NOT NULL DEFAULT true,
  alert_mention boolean NOT NULL DEFAULT true,
  updatedat bigint NOT NULL DEFAULT (extract(epoch from now())::bigint * 1000)
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint text PRIMARY KEY,
  userid text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  useragent text NOT NULL DEFAULT '',
  createdat bigint NOT NULL,
  updatedat bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_userid
ON public.push_subscriptions (userid);
