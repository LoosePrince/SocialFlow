-- SocialFlow 基础表结构（与 server/index.ts 中的查询一致）。使用 IF NOT EXISTS，便于在已有手工库上首次登记迁移版本。

-- 用户表：与 Supabase Auth 用户一一对应，存展示名、角色等应用侧资料。
CREATE TABLE IF NOT EXISTS public.profiles (
  id text PRIMARY KEY, -- Supabase Auth 用户 UUID（user.id）。
  email text NOT NULL, -- 登录邮箱，与 Auth 一致。
  displayname text NOT NULL DEFAULT '', -- 展示名称。
  photourl text NOT NULL DEFAULT '', -- 头像路径或 URL（可与 GitHub CDN 等配合）。
  role text NOT NULL DEFAULT 'user', -- 权限：admin / user。
  createdat bigint NOT NULL -- 记录创建时间，毫秒 Unix 时间戳。
);

COMMENT ON TABLE public.profiles IS '用户资料，主键与 Supabase Auth 用户 id 对齐。';

-- 动态帖：短内容 + 多图等。
CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY, -- 帖文 ID。
  authorid text NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE, -- 作者 profiles.id。
  createdat bigint NOT NULL, -- 创建时间，毫秒时间戳。
  likecount integer NOT NULL DEFAULT 0, -- 点赞数缓存。
  commentcount integer NOT NULL DEFAULT 0, -- 评论数缓存。
  isrecommended boolean NOT NULL DEFAULT false, -- 是否首页推荐（通常仅管理员可设）。
  content text NOT NULL, -- 正文（如 Markdown/纯文本，由应用约定）。
  images text[] NOT NULL DEFAULT ARRAY[]::text[], -- 图片路径/URL 列表。
  type text NOT NULL DEFAULT 'post' -- 区分类型，当前多为 post。
);

COMMENT ON TABLE public.posts IS '用户发布的动态帖文。';

CREATE INDEX IF NOT EXISTS idx_posts_authorid ON public.posts (authorid); -- 作者 ID 索引。
CREATE INDEX IF NOT EXISTS idx_posts_createdat ON public.posts (createdat DESC); -- 创建时间 降序 索引。

-- 项目帖：长文、封面、附件等。
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY, -- 项目 ID。
  authorid text NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE, -- 作者 profiles.id。
  createdat bigint NOT NULL, -- 创建时间，毫秒时间戳。
  likecount integer NOT NULL DEFAULT 0, -- 点赞数缓存。
  commentcount integer NOT NULL DEFAULT 0, -- 评论数缓存。
  isrecommended boolean NOT NULL DEFAULT false, -- 是否首页推荐。
  title text NOT NULL, -- 标题。
  summary text NOT NULL DEFAULT '', -- 摘要/简介。
  content text NOT NULL, -- 正文（常为 Markdown）。
  coverurl text NOT NULL DEFAULT '', -- 封面图 URL。
  attachments text[] NOT NULL DEFAULT ARRAY[]::text[], -- 附件路径列表。
  type text NOT NULL DEFAULT 'project' -- 固定为 project。
);

COMMENT ON TABLE public.projects IS '项目型内容（长文、封面、附件）。';

CREATE INDEX IF NOT EXISTS idx_projects_authorid ON public.projects (authorid); -- 作者 ID 索引。
CREATE INDEX IF NOT EXISTS idx_projects_createdat ON public.projects (createdat DESC); -- 创建时间 降序 索引。

-- 点赞：用户对帖子或项目的点赞关系。
CREATE TABLE IF NOT EXISTS public.likes (
  id uuid PRIMARY KEY, -- 点赞记录 ID。
  userid text NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE, -- 点赞用户。
  contentid uuid NOT NULL, -- 被点赞的 post 或 project 的 id。
  contenttype text NOT NULL CHECK (contenttype IN ('post', 'project')), -- 内容类型。
  createdat bigint NOT NULL, -- 点赞时间，毫秒时间戳。
  UNIQUE (userid, contentid) -- 同一用户对同一内容仅一条记录。
);

COMMENT ON TABLE public.likes IS '用户对动态或项目的点赞；与 posts/projects 的 likecount 配合使用。';

CREATE INDEX IF NOT EXISTS idx_likes_content ON public.likes (contentid, contenttype); -- 内容 ID 和类型 复合索引。

-- 评论：挂在 post/project 下，支持回复与 @ 提及。
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY, -- 评论 ID。
  contentid uuid NOT NULL, -- 所属 post 或 project 的 id。
  contenttype text NOT NULL CHECK (contenttype IN ('post', 'project')), -- 内容类型。
  authorid text NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE, -- 评论作者。
  text text NOT NULL, -- 评论正文。
  createdat bigint NOT NULL, -- 创建时间，毫秒时间戳。
  parentid uuid, -- 父评论 id（二级回复时非空）。
  replytoname text, -- 回复对象的展示名（冗余，便于展示）。
  mentionids jsonb NOT NULL DEFAULT '[]'::jsonb -- 被 @ 的用户 id 列表（JSON 数组）。
);

COMMENT ON TABLE public.comments IS '帖文/项目下的评论与回复。';

CREATE INDEX IF NOT EXISTS idx_comments_content ON public.comments (contentid, contenttype); -- 内容 ID 和类型 复合索引。
CREATE INDEX IF NOT EXISTS idx_comments_createdat ON public.comments (createdat DESC); -- 创建时间 降序 索引。

-- 通知：如评论中 @ 某人时写入，由前端消息中心展示。
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY, -- 通知 ID。
  touserid text NOT NULL, -- 接收者（profiles.id）。
  fromusername text NOT NULL DEFAULT '', -- 触发方展示名（如评论者）。
  commenttext text NOT NULL DEFAULT '', -- 相关评论摘要/预览文案。
  contentid uuid, -- 关联的 post 或 project id。
  contenttype text, -- post / project，可为空视业务而定。
  type text NOT NULL DEFAULT 'mention', -- 通知类型，如 mention、like 等。
  isread boolean NOT NULL DEFAULT false, -- 是否已读。
  createdat bigint NOT NULL, -- 创建时间，毫秒时间戳。
  CONSTRAINT notifications_contenttype_check CHECK (
    contenttype IS NULL OR contenttype IN ('post', 'project')
  )
);

COMMENT ON TABLE public.notifications IS '用户站内通知（如被 @、互动提醒）。';

CREATE INDEX IF NOT EXISTS idx_notifications_touser ON public.notifications (touserid, createdat DESC); -- 接收者 ID 和创建时间 降序 索引。
