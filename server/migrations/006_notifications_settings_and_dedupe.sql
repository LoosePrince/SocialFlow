-- 通知增强：
-- 1) notifications 增加去重键 eventkey、提醒标记 isalert、扩展负载 payload
-- 2) 新增 notification_settings 表，用于“接收/提醒”双开关

ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS eventkey text NOT NULL DEFAULT '';

ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS isalert boolean NOT NULL DEFAULT true;

ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.notifications.eventkey IS '通知去重键：同一 touserid + type + eventkey 只保留一条。';
COMMENT ON COLUMN public.notifications.isalert IS '是否参与提醒（未读计数等）。';
COMMENT ON COLUMN public.notifications.payload IS '通知扩展字段（JSON），用于前端展示上下文。';

-- 仅对非空 eventkey 做唯一约束，兼容历史空值数据。
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unique_event
ON public.notifications (touserid, type, eventkey)
WHERE eventkey <> '';

CREATE TABLE IF NOT EXISTS public.notification_settings (
  userid uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
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

COMMENT ON TABLE public.notification_settings IS '用户通知偏好：每类通知独立控制接收与提醒。';
