ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS passwordhash text;

COMMENT ON COLUMN public.profiles.passwordhash IS '应用侧账号密码登录哈希（PBKDF2），仅服务端校验使用。';
