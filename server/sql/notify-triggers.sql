-- 在 Supabase SQL Editor 中执行。用于 NOTIFY → 后端 sql.listen('app_events') → SSE 广播。
-- 若表名或列名与项目不一致，请按需调整。

CREATE OR REPLACE FUNCTION public.notify_app_event()
RETURNS TRIGGER AS $$
DECLARE
  payload json;
  row_id text;
BEGIN
  row_id := COALESCE(NEW.id::text, OLD.id::text);
  payload := json_build_object(
    'table', TG_TABLE_NAME,
    'id', row_id
  );
  PERFORM pg_notify('app_events', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_posts_notify ON public.posts;
CREATE TRIGGER trg_posts_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.posts
  FOR EACH ROW EXECUTE PROCEDURE public.notify_app_event();

DROP TRIGGER IF EXISTS trg_projects_notify ON public.projects;
CREATE TRIGGER trg_projects_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE PROCEDURE public.notify_app_event();

DROP TRIGGER IF EXISTS trg_comments_notify ON public.comments;
CREATE TRIGGER trg_comments_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.comments
  FOR EACH ROW EXECUTE PROCEDURE public.notify_app_event();

DROP TRIGGER IF EXISTS trg_likes_notify ON public.likes;
CREATE TRIGGER trg_likes_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.likes
  FOR EACH ROW EXECUTE PROCEDURE public.notify_app_event();

DROP TRIGGER IF EXISTS trg_notifications_notify ON public.notifications;
CREATE TRIGGER trg_notifications_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.notifications
  FOR EACH ROW EXECUTE PROCEDURE public.notify_app_event();
