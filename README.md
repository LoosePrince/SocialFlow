# SocialFlow

一个现代化简约风格的信息分享平台。

## 特性

- **现代化设计**：基于 Outfit 字体和柔和配色方案。
- **动态 (Posts)**：支持文本 + 多图（3x3 网格展示），点赞显示头像列表。
- **项目 (Projects)**：支持 Markdown 渲染，展示项目简介、封面及附件。
- **社交互动**：实时点赞、评论系统，支持二级回复（PostgreSQL 下通过 SSE + `NOTIFY` 推送变更；Lsqlite 下保留 SSE 连接，写入后依赖前端刷新/拉取）。
- **用户认证**：通过 Supabase 使用 GitHub OAuth 登录。
- **响应式布局**：完美适配桌面端和移动端，移动端提供类 App 的 TabBar 交互。
- **全栈架构**：浏览器仅持有 Supabase Auth；业务数据经自建 Node（Hono）访问 PostgreSQL 或 Lsqlite；媒体上传由后端使用 GitHub API 完成。

## 技术栈

- **前端**: React (TypeScript), Vite, Ant Design, Ant Design Mobile
- **样式**: Vanilla CSS, Framer Motion (动画)
- **后端**: Hono, `postgres`, Lsqlite HTTP API, `jose`（JWT 验签）；认证仍用 Supabase Auth；数据库可选 Supabase 托管 PostgreSQL 或 Lsqlite

## 开始使用

1. 安装依赖:

   ```powershell
   npm install
   ```

2. 配置环境变量：复制 `.env.example` 为 `.env`，填写前端 `VITE_*` 与后端 `DATABASE_URL`、`SUPABASE_JWT_SECRET`、`ADMIN_EMAIL`、`GITHUB_*` 等（详见 `.env.example` 注释）。

3. 数据库结构：后端启动时会自动执行对应迁移目录：PostgreSQL 使用 `server/migrations/`，Lsqlite 使用 `server/migrations-lsqlite/`，并在 `app_schema_migrations` 中记录版本；新增变更时在对应目录增加按文件名排序的新 `.sql` 即可。若需跳过迁移（例如只读连接），可设置环境变量 `SKIP_DB_MIGRATIONS=1`。

   - PostgreSQL 为默认数据源：`DATABASE_PROVIDER=postgres` 或不设置。
   - Lsqlite 数据源：设置 `DATABASE_PROVIDER=lsqlite`、`LSQLITE_BASE_URL`、`LSQLITE_DATABASE_KEY`。
   - 从 PostgreSQL 迁移到 Lsqlite：确认 `DATABASE_URL` 指向源 PostgreSQL，`LSQLITE_*` 指向目标 Lsqlite，然后执行：

   ```powershell
   npm run migrate:lsqlite
   ```

   迁移脚本会先初始化 Lsqlite 结构，再按业务表顺序写入/覆盖目标数据；如需迁移前清空目标业务表，可临时设置 `LSQLITE_MIGRATION_CLEAR=1`。

4. 启动开发（同时启动 Vite 与 API，默认 API 端口 `8787`）:

   ```powershell
   npm run dev
   ```

5. 仅构建前端静态资源:

   ```powershell
   npm run build
   ```

6. 编译后端:

   ```powershell
   npm run build:server
   ```

7. 生产环境可先 `npm run build` 再 `npm run build:server`，然后使用 `node dist-server/index.js` 运行 API（静态资源需另行托管或由反向代理指向 `dist`）。

## 管理员权限

在后端环境变量中设置 `ADMIN_EMAIL` 为管理员邮箱（需与登录账号邮箱一致）。用户首次通过 `GET /api/me` 创建 `profiles` 时若匹配则为管理员；管理员发布的动态和项目会自动推荐到首页。
