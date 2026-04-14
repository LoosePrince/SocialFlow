-- 浏览器 Web Push 订阅信息（用于站点关闭时推送通知）。
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
