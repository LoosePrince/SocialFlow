# SocialFlow

一个现代化简约风格的信息分享平台。

## 特性

- **现代化设计**：基于 Outfit 字体和柔和配色方案。
- **动态 (Posts)**：支持文本 + 多图（3x3 网格展示），点赞显示头像列表。
- **项目 (Projects)**：支持 Markdown 渲染，展示项目简介、封面及附件。
- **社交互动**：实时点赞、评论系统，支持二级回复。
- **用户认证**：通过 Supabase 使用 GitHub OAuth 登录。
- **响应式布局**：完美适配桌面端和移动端，移动端提供类 App 的 TabBar 交互。
- **Supabase 后端**：使用 Supabase 提供认证与数据库；媒体文件上传至配置的 GitHub 仓库。

## 技术栈

- **前端**: React (TypeScript), Vite, Ant Design, Ant Design Mobile
- **样式**: Vanilla CSS, Framer Motion (动画)
- **后端**: Supabase (Auth, 数据库)；媒体上传依赖 GitHub API（见 `src/github.ts` 所需环境变量）

## 开始使用

1. 安装依赖:
   ```bash
   npm install
   ```

2. 启动开发服务器:
   ```bash
   npm run dev
   ```

3. 构建生产版本:
   ```bash
   npm run build
   ```

## 管理员权限

在根目录 `.env` 中设置 `VITE_ADMIN_EMAIL` 为管理员邮箱（需与登录账号邮箱一致）。用户首次写入 `profiles` 时若匹配则为管理员；管理员发布的动态和项目会自动推荐到首页。
