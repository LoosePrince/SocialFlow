-- 变更通知：在相关表发生 INSERT/UPDATE/DELETE 时向 PostgreSQL 会话频道 app_events 发送 NOTIFY。
-- 后端使用 sql.listen('app_events') 接收后通过 SSE 推给前端（见 server/index.ts、server/sse.ts）。
-- 依赖 001_initial_schema.sql 中的业务表。

-- 通用触发器函数：把表名与行 id 打成 JSON，经 pg_notify 发到频道 app_events。
CREATE OR REPLACE FUNCTION public.notify_app_event()
RETURNS TRIGGER AS $$
DECLARE
  payload json; -- 推送给监听端的 JSON：table、id。
  row_id text; -- 当前行主键（INSERT/UPDATE 用 NEW，DELETE 用 OLD）。
BEGIN
  -- 主键统一转文本，兼容 uuid / text 等。
  row_id := COALESCE(NEW.id::text, OLD.id::text);
  payload := json_build_object(
    'table', TG_TABLE_NAME, -- 实际表名，前端可据此决定刷新策略。
    'id', row_id
  );
  PERFORM pg_notify('app_events', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.notify_app_event() IS
  'AFTER 行级触发：向 app_events 频道 NOTIFY JSON（table、id），供 Node LISTEN 与 SSE 广播。';

-- posts：帖文变更时通知。
DROP TRIGGER IF EXISTS trg_posts_notify ON public.posts;
CREATE TRIGGER trg_posts_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.posts
  FOR EACH ROW EXECUTE PROCEDURE public.notify_app_event();

COMMENT ON TRIGGER trg_posts_notify ON public.posts IS '帖文增删改后触发 NOTIFY。';

-- projects：项目变更时通知。
DROP TRIGGER IF EXISTS trg_projects_notify ON public.projects;
CREATE TRIGGER trg_projects_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE PROCEDURE public.notify_app_event();

COMMENT ON TRIGGER trg_projects_notify ON public.projects IS '项目增删改后触发 NOTIFY。';

-- comments：评论变更时通知。
DROP TRIGGER IF EXISTS trg_comments_notify ON public.comments;
CREATE TRIGGER trg_comments_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.comments
  FOR EACH ROW EXECUTE PROCEDURE public.notify_app_event();

COMMENT ON TRIGGER trg_comments_notify ON public.comments IS '评论增删改后触发 NOTIFY。';

-- likes：点赞变更时通知。
DROP TRIGGER IF EXISTS trg_likes_notify ON public.likes;
CREATE TRIGGER trg_likes_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.likes
  FOR EACH ROW EXECUTE PROCEDURE public.notify_app_event();

COMMENT ON TRIGGER trg_likes_notify ON public.likes IS '点赞增删改后触发 NOTIFY。';

-- notifications：通知表变更时通知（例如未读数、列表刷新）。
DROP TRIGGER IF EXISTS trg_notifications_notify ON public.notifications;
CREATE TRIGGER trg_notifications_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.notifications
  FOR EACH ROW EXECUTE PROCEDURE public.notify_app_event();

COMMENT ON TRIGGER trg_notifications_notify ON public.notifications IS '通知记录增删改后触发 NOTIFY。';
