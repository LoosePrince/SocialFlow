-- QQ 扫码识别后的 uin，与 profiles 一对一绑定；用于设置页绑定与 QQ 登录。
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS qq_uin text;

COMMENT ON COLUMN public.profiles.qq_uin IS '腾讯 QQ 账号 uin（来自 q.qq.com devtoolAuth 扫码流程），唯一，可空。';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_qq_uin_unique ON public.profiles (qq_uin)
  WHERE qq_uin IS NOT NULL AND qq_uin <> '';
