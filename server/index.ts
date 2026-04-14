import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';
import { sql, listenSql } from './db.js';
import { startCountReconcileScheduler } from './countReconcile.js';
import { runDatabaseStartup } from './migrations.js';
import {
  authMiddleware,
  metadataFromJwt,
  isAdminEmail,
  verifySupabaseJwt,
  type AuthUser,
} from './auth.js';
import { broadcastSse, registerSseClient } from './sse.js';
import { uploadBufferToGithub } from './githubUpload.js';
import { queryQqScanStatus, requestQqLoginCode } from './qqDevToolAuth.js';
import { issueSupabaseSessionForEmail } from './supabaseIssueSession.js';
import { hashPassword, validatePasswordStrength, verifyPassword } from './passwordAuth.js';

const PORT = Number(process.env.PORT) || 8787;

const QQ_UIN_RE = /^\d{5,20}$/;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Variables = { user: AuthUser };
const app = new Hono<{ Variables: Variables }>();

type ProfileRow = {
  id: string;
  email: string;
  displayname: string;
  photourl: string;
  role: string;
  createdat: string | number;
  qq_uin?: string | null;
  passwordhash?: string | null;
};

function toPublicProfile(row: ProfileRow) {
  return {
    id: row.id,
    email: row.email,
    displayname: row.displayname,
    photourl: row.photourl,
    role: row.role,
    createdat: Number(row.createdat),
    qq_uin: row.qq_uin ?? null,
    haspassword: !!row.passwordhash,
  };
}

app.use(
  '*',
  cors({
    origin: process.env.FRONTEND_ORIGIN?.split(',') || ['http://localhost:5173', 'http://127.0.0.1:5173'],
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);

app.get('/health', (c) => c.json({ ok: true }));

// ---------- /api/me ----------
app.get('/api/me', authMiddleware, async (c) => {
  const user = c.get('user');
  const existingRows = await sql`SELECT * FROM profiles WHERE id = ${user.sub} LIMIT 1`;
  const existing = existingRows[0] as ProfileRow | undefined;

  if (existing) {
    return c.json(toPublicProfile(existing));
  }

  const { displayname, photourl, email } = metadataFromJwt(user);
  const role = isAdminEmail(email) ? 'admin' : 'user';
  const createdat = Date.now();

  const createdRows = await sql`
    INSERT INTO profiles (id, email, displayname, photourl, role, createdat)
    VALUES (${user.sub}, ${email}, ${displayname}, ${photourl}, ${role}, ${createdat})
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email
    RETURNING *
  `;
  const created = createdRows[0] as ProfileRow;
  return c.json(toPublicProfile(created));
});

// ---------- QQ 扫码（devtoolAuth，与 PF-MCDR-WebUI qq_qr_login_service 同源接口）----------
app.get('/api/qq/login-code', async (c) => {
  try {
    const { code, qrUrl } = await requestQqLoginCode();
    return c.json({ code, qrUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'GetLoginCode failed';
    return c.json({ error: msg }, 502);
  }
});

/** 已登录用户：轮询扫码结果并写入 profiles.qq_uin */
app.get('/api/qq/bind/poll', authMiddleware, async (c) => {
  const code = c.req.query('code')?.trim();
  if (!code) {
    return c.json({ state: 'error' as const, msg: '缺少 code' }, 400);
  }

  let scan: Awaited<ReturnType<typeof queryQqScanStatus>>;
  try {
    scan = await queryQqScanStatus(code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'poll failed';
    return c.json({ state: 'error' as const, msg });
  }

  if (scan.state !== 'ok' || !scan.uin) {
    return c.json({ state: scan.state, ...(scan.msg ? { msg: scan.msg } : {}) });
  }

  const uin = scan.uin.trim();
  if (!QQ_UIN_RE.test(uin)) {
    return c.json({ state: 'error' as const, msg: '无效的 uin' });
  }

  const user = c.get('user');
  const takenRows = await sql`
    SELECT id FROM profiles WHERE qq_uin = ${uin} AND id <> ${user.sub} LIMIT 1
  `;
  if (takenRows.length > 0) {
    return c.json(
      { state: 'error' as const, msg: '该 QQ 已绑定其他账号' },
      409
    );
  }

  try {
    await sql`UPDATE profiles SET qq_uin = ${uin} WHERE id = ${user.sub}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'update failed';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return c.json({ state: 'error' as const, msg: '该 QQ 已绑定其他账号' }, 409);
    }
    return c.json({ state: 'error' as const, msg }, 500);
  }

  return c.json({ state: 'ok' as const, uin });
});

/** 未登录：轮询扫码，若 profiles.qq_uin 匹配则签发 Supabase Session */
app.get('/api/qq/login/poll', async (c) => {
  const code = c.req.query('code')?.trim();
  if (!code) {
    return c.json({ state: 'error' as const, msg: '缺少 code' }, 400);
  }

  let scan: Awaited<ReturnType<typeof queryQqScanStatus>>;
  try {
    scan = await queryQqScanStatus(code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'poll failed';
    return c.json({ state: 'error' as const, msg });
  }

  if (scan.state !== 'ok' || !scan.uin) {
    return c.json({ state: scan.state, ...(scan.msg ? { msg: scan.msg } : {}) });
  }

  const uin = scan.uin.trim();
  if (!QQ_UIN_RE.test(uin)) {
    return c.json({ state: 'error' as const, msg: '无效的 uin' });
  }

  const profRows = await sql`
    SELECT id, email FROM profiles WHERE qq_uin = ${uin} LIMIT 1
  `;
  const prof = profRows[0] as { id: string; email: string } | undefined;
  if (!prof?.email) {
    return c.json({
      state: 'no_bind' as const,
      msg: '该 QQ 尚未绑定本站账号，请先用 GitHub 登录后在设置中绑定 QQ',
    });
  }

  try {
    const session = await issueSupabaseSessionForEmail(prof.email);
    return c.json({
      state: 'ok' as const,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      ...(session.expires_at !== undefined ? { expires_at: session.expires_at } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'session failed';
    console.error('[qq/login/poll] issue session:', e);
    return c.json({ state: 'error' as const, msg }, 502);
  }
});

// ---------- password auth ----------
app.get('/api/auth/password/status', authMiddleware, async (c) => {
  const user = c.get('user');
  const rows = await sql`
    SELECT email, passwordhash FROM profiles WHERE id = ${user.sub} LIMIT 1
  `;
  const row = rows[0] as { email?: string; passwordhash?: string | null } | undefined;
  if (!row?.email) {
    return c.json({ error: '用户不存在' }, 404);
  }
  return c.json({
    email: row.email,
    hasPassword: !!row.passwordhash,
  });
});

app.post('/api/auth/password', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ currentPassword?: string; newPassword?: string }>();
  const newPassword = body.newPassword?.trim() ?? '';
  const reason = validatePasswordStrength(newPassword);
  if (reason) {
    return c.json({ error: reason }, 400);
  }

  const rows = await sql`
    SELECT passwordhash FROM profiles WHERE id = ${user.sub} LIMIT 1
  `;
  const row = rows[0] as { passwordhash?: string | null } | undefined;
  if (!row) {
    return c.json({ error: '用户不存在' }, 404);
  }

  if (row.passwordhash) {
    const currentPassword = body.currentPassword ?? '';
    if (!currentPassword || !verifyPassword(currentPassword, row.passwordhash)) {
      return c.json({ error: '当前密码错误' }, 401);
    }
  }

  const nextHash = hashPassword(newPassword);
  await sql`UPDATE profiles SET passwordhash = ${nextHash} WHERE id = ${user.sub}`;
  return c.json({ ok: true, hasPassword: true });
});

app.post('/api/auth/password-login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = body.email?.trim().toLowerCase() ?? '';
  const password = body.password ?? '';
  if (!email || !password) {
    return c.json({ error: '邮箱和密码不能为空' }, 400);
  }

  const rows = await sql`
    SELECT email, passwordhash FROM profiles WHERE lower(email) = ${email} LIMIT 1
  `;
  const row = rows[0] as { email?: string; passwordhash?: string | null } | undefined;
  if (!row?.email || !row.passwordhash || !verifyPassword(password, row.passwordhash)) {
    return c.json({ error: '邮箱或密码错误' }, 401);
  }

  try {
    const session = await issueSupabaseSessionForEmail(row.email);
    return c.json(session);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'password login failed';
    return c.json({ error: msg }, 502);
  }
});

// ---------- feeds ----------
app.get('/api/feeds', async (c) => {
  const showAll = c.req.query('showAll') === 'true' || c.req.query('showAll') === '1';
  const [posts, projects] = await Promise.all([
    sql`
      SELECT p.*,
        json_build_object(
          'displayname', pr.displayname,
          'photourl', pr.photourl
        ) AS profiles
      FROM posts p
      LEFT JOIN profiles pr ON pr.id = p.authorid
      ORDER BY p.createdat DESC
    `,
    sql`
      SELECT p.*,
        json_build_object(
          'displayname', pr.displayname,
          'photourl', pr.photourl
        ) AS profiles
      FROM projects p
      LEFT JOIN profiles pr ON pr.id = p.authorid
      ORDER BY p.createdat DESC
    `,
  ]);

  const all = [
    ...(posts as Record<string, unknown>[]).map((p) => ({ ...p, type: 'post' })),
    ...(projects as Record<string, unknown>[]).map((p) => ({ ...p, type: 'project' })),
  ]
    .filter((item: Record<string, unknown>) =>
      showAll ? true : item.isrecommended === true
    )
    .sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) =>
        Number(b.createdat) - Number(a.createdat)
    );

  return c.json(all);
});

// ---------- posts / projects get ----------
app.get('/api/posts/:id', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Bad request' }, 400);
  const [row] = await sql`
    SELECT p.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
    FROM posts p
    LEFT JOIN profiles pr ON pr.id = p.authorid
    WHERE p.id = ${id}
    LIMIT 1
  `;
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

app.get('/api/projects/:id', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Bad request' }, 400);
  const [row] = await sql`
    SELECT p.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
    FROM projects p
    LEFT JOIN profiles pr ON pr.id = p.authorid
    WHERE p.id = ${id}
    LIMIT 1
  `;
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

// ---------- users ----------
app.get('/api/users', async (c) => {
  const rows = (await sql`SELECT id, displayname, photourl FROM profiles`) as unknown as {
    id: string;
    displayname: string;
    photourl: string;
  }[];
  return c.json(
    rows.map((u) => ({
      uid: u.id,
      displayname: u.displayname,
      photourl: u.photourl,
    }))
  );
});

// ---------- profile PATCH ----------
app.patch('/api/profile', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ displayname?: string; photourl?: string }>();
  if (body.displayname !== undefined && body.photourl !== undefined) {
    await sql`
      UPDATE profiles SET displayname = ${body.displayname}, photourl = ${body.photourl}
      WHERE id = ${user.sub}
    `;
  } else if (body.displayname !== undefined) {
    await sql`UPDATE profiles SET displayname = ${body.displayname} WHERE id = ${user.sub}`;
  } else if (body.photourl !== undefined) {
    await sql`UPDATE profiles SET photourl = ${body.photourl} WHERE id = ${user.sub}`;
  }
  const [row] = await sql`SELECT * FROM profiles WHERE id = ${user.sub} LIMIT 1`;
  return c.json(toPublicProfile(row as ProfileRow));
});

// ---------- posts CRUD ----------
app.post('/api/posts', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    id?: string;
    content: string;
    images?: string[];
    isrecommended?: boolean;
  }>();
  if (!body.content) return c.json({ error: 'content required' }, 400);
  let id = body.id?.trim();
  if (id) {
    if (!UUID_RE.test(id)) return c.json({ error: 'invalid id' }, 400);
    const taken = await sql`SELECT 1 FROM posts WHERE id = ${id} LIMIT 1`;
    if (taken.length > 0) return c.json({ error: 'id already exists' }, 409);
  } else {
    id = crypto.randomUUID();
  }
  const createdat = Date.now();
  const meRows = await sql`SELECT role FROM profiles WHERE id = ${user.sub} LIMIT 1`;
  const me = meRows[0] as { role: string } | undefined;
  const isAdmin = me?.role === 'admin';
  const isrecommended = isAdmin && !!body.isrecommended;
  const imageList = body.images ?? [];

  await sql`
    INSERT INTO posts (id, authorid, createdat, likecount, commentcount, isrecommended, content, images, type)
    VALUES (
      ${id},
      ${user.sub},
      ${createdat},
      0,
      0,
      ${isrecommended},
      ${body.content},
      ${sql.array(imageList)},
      'post'
    )
  `;
  const [row] = await sql`
    SELECT p.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
    FROM posts p
    LEFT JOIN profiles pr ON pr.id = p.authorid
    WHERE p.id = ${id}
    LIMIT 1
  `;
  return c.json(row);
});

app.patch('/api/posts/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Bad request' }, 400);
  const body = await c.req.json<{
    content?: string;
    images?: string[];
    isrecommended?: boolean;
  }>();

  const postRows = await sql`SELECT authorid FROM posts WHERE id = ${id} LIMIT 1`;
  const post = postRows[0] as { authorid: string } | undefined;
  if (!post) return c.json({ error: 'Not found' }, 404);

  const profRows = await sql`SELECT role FROM profiles WHERE id = ${user.sub} LIMIT 1`;
  const prof = profRows[0] as { role: string } | undefined;
  const isAdmin = prof?.role === 'admin';
  const isAuthor = post.authorid === user.sub;
  if (!isAdmin && !isAuthor) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  if (body.isrecommended !== undefined && !isAdmin) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const hasContent = body.content !== undefined;
  const hasImages = body.images !== undefined;
  const hasRec = body.isrecommended !== undefined;
  if (!hasContent && !hasImages && !hasRec) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  if (hasContent) {
    if (!body.content || !String(body.content).trim()) {
      return c.json({ error: 'content cannot be empty' }, 400);
    }
    await sql`UPDATE posts SET content = ${body.content} WHERE id = ${id}`;
  }
  if (hasImages) {
    await sql`UPDATE posts SET images = ${sql.array(body.images ?? [])} WHERE id = ${id}`;
  }
  if (hasRec && isAdmin) {
    await sql`UPDATE posts SET isrecommended = ${body.isrecommended ?? false} WHERE id = ${id}`;
  }

  const [row] = await sql`
    SELECT p.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
    FROM posts p
    LEFT JOIN profiles pr ON pr.id = p.authorid
    WHERE p.id = ${id}
    LIMIT 1
  `;
  return c.json(row);
});

app.delete('/api/posts/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Bad request' }, 400);
  const postRows = await sql`SELECT authorid FROM posts WHERE id = ${id} LIMIT 1`;
  const post = postRows[0] as { authorid: string } | undefined;
  if (!post) return c.json({ error: 'Not found' }, 404);
  const profRows = await sql`SELECT role FROM profiles WHERE id = ${user.sub} LIMIT 1`;
  const prof = profRows[0] as { role: string } | undefined;
  if (post.authorid !== user.sub && prof?.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await sql`DELETE FROM posts WHERE id = ${id}`;
  return c.json({ ok: true });
});

// ---------- projects CRUD ----------
app.post('/api/projects', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    id?: string;
    title: string;
    summary?: string;
    content: string;
    coverurl?: string;
    attachments?: string[];
    isrecommended?: boolean;
  }>();
  if (!body.title || !body.content) return c.json({ error: 'title and content required' }, 400);
  let id = body.id?.trim();
  if (id) {
    if (!UUID_RE.test(id)) return c.json({ error: 'invalid id' }, 400);
    const taken = await sql`SELECT 1 FROM projects WHERE id = ${id} LIMIT 1`;
    if (taken.length > 0) return c.json({ error: 'id already exists' }, 409);
  } else {
    id = crypto.randomUUID();
  }
  const createdat = Date.now();
  const meRows = await sql`SELECT role FROM profiles WHERE id = ${user.sub} LIMIT 1`;
  const me = meRows[0] as { role: string } | undefined;
  const isAdmin = me?.role === 'admin';
  const isrecommended = isAdmin && !!body.isrecommended;
  const attachmentList = body.attachments ?? [];

  await sql`
    INSERT INTO projects (id, authorid, createdat, likecount, commentcount, isrecommended, title, summary, content, coverurl, attachments, type)
    VALUES (
      ${id},
      ${user.sub},
      ${createdat},
      0,
      0,
      ${isrecommended},
      ${body.title},
      ${body.summary ?? ''},
      ${body.content},
      ${body.coverurl ?? ''},
      ${sql.array(attachmentList)},
      'project'
    )
  `;
  const [row] = await sql`
    SELECT p.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
    FROM projects p
    LEFT JOIN profiles pr ON pr.id = p.authorid
    WHERE p.id = ${id}
    LIMIT 1
  `;
  return c.json(row);
});

app.patch('/api/projects/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Bad request' }, 400);
  const body = await c.req.json<{
    title?: string;
    summary?: string;
    content?: string;
    coverurl?: string;
    attachments?: string[];
    isrecommended?: boolean;
  }>();

  const projRows = await sql`SELECT authorid FROM projects WHERE id = ${id} LIMIT 1`;
  const proj = projRows[0] as { authorid: string } | undefined;
  if (!proj) return c.json({ error: 'Not found' }, 404);

  const profRows = await sql`SELECT role FROM profiles WHERE id = ${user.sub} LIMIT 1`;
  const prof = profRows[0] as { role: string } | undefined;
  const isAdmin = prof?.role === 'admin';
  const isAuthor = proj.authorid === user.sub;
  if (!isAdmin && !isAuthor) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  if (body.isrecommended !== undefined && !isAdmin) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const hasTitle = body.title !== undefined;
  const hasSummary = body.summary !== undefined;
  const hasContent = body.content !== undefined;
  const hasCover = body.coverurl !== undefined;
  const hasAtt = body.attachments !== undefined;
  const hasRec = body.isrecommended !== undefined;
  if (!hasTitle && !hasSummary && !hasContent && !hasCover && !hasAtt && !hasRec) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  if (hasTitle) {
    if (!body.title || !String(body.title).trim()) {
      return c.json({ error: 'title cannot be empty' }, 400);
    }
    await sql`UPDATE projects SET title = ${body.title} WHERE id = ${id}`;
  }
  if (hasSummary) {
    await sql`UPDATE projects SET summary = ${body.summary ?? ''} WHERE id = ${id}`;
  }
  if (hasContent) {
    if (!body.content || !String(body.content).trim()) {
      return c.json({ error: 'content cannot be empty' }, 400);
    }
    await sql`UPDATE projects SET content = ${body.content} WHERE id = ${id}`;
  }
  if (hasCover) {
    await sql`UPDATE projects SET coverurl = ${body.coverurl ?? ''} WHERE id = ${id}`;
  }
  if (hasAtt) {
    await sql`UPDATE projects SET attachments = ${sql.array(body.attachments ?? [])} WHERE id = ${id}`;
  }
  if (hasRec && isAdmin) {
    await sql`UPDATE projects SET isrecommended = ${body.isrecommended ?? false} WHERE id = ${id}`;
  }

  const [row] = await sql`
    SELECT p.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
    FROM projects p
    LEFT JOIN profiles pr ON pr.id = p.authorid
    WHERE p.id = ${id}
    LIMIT 1
  `;
  return c.json(row);
});

app.delete('/api/projects/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Bad request' }, 400);
  const projRows = await sql`SELECT authorid FROM projects WHERE id = ${id} LIMIT 1`;
  const proj = projRows[0] as { authorid: string } | undefined;
  if (!proj) return c.json({ error: 'Not found' }, 404);
  const profRows = await sql`SELECT role FROM profiles WHERE id = ${user.sub} LIMIT 1`;
  const prof = profRows[0] as { role: string } | undefined;
  if (proj.authorid !== user.sub && prof?.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await sql`DELETE FROM projects WHERE id = ${id}`;
  return c.json({ ok: true });
});

// ---------- likes ----------
app.get('/api/likes/status', async (c) => {
  const contentId = c.req.query('contentId');
  if (!contentId) return c.json({ liked: false });
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return c.json({ liked: false });
  try {
    const user = await verifySupabaseJwt(auth.slice(7).trim());
    const rows = await sql`SELECT id FROM likes WHERE userid = ${user.sub} AND contentid = ${contentId} LIMIT 1`;
    return c.json({ liked: rows.length > 0 });
  } catch {
    return c.json({ liked: false });
  }
});

app.get('/api/likes', async (c) => {
  const contentId = c.req.query('contentId');
  const contentType = c.req.query('contentType');
  if (!contentId) return c.json({ error: 'contentId required' }, 400);
  const rows =
    contentType && (contentType === 'post' || contentType === 'project')
      ? await sql`
          SELECT l.*,
            json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
          FROM likes l
          LEFT JOIN profiles pr ON pr.id = l.userid
          WHERE l.contentid = ${contentId} AND l.contenttype = ${contentType}
        `
      : await sql`
          SELECT l.*,
            json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
          FROM likes l
          LEFT JOIN profiles pr ON pr.id = l.userid
          WHERE l.contentid = ${contentId}
        `;
  return c.json(rows);
});

app.post('/api/likes/toggle', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ contentId: string; contentType: 'post' | 'project' }>();
  const { contentId, contentType } = body;
  if (!contentId || !contentType) return c.json({ error: 'contentId and contentType required' }, 400);
  const table = contentType === 'post' ? 'posts' : 'projects';

  const existingRows = await sql`
    SELECT id FROM likes
    WHERE userid = ${user.sub} AND contentid = ${contentId}
    LIMIT 1
  `;
  const existing = existingRows[0] as { id: string } | undefined;

  if (existing) {
    await sql`DELETE FROM likes WHERE id = ${existing.id}`;
    const rowRows =
      table === 'posts'
        ? await sql`SELECT likecount FROM posts WHERE id = ${contentId} LIMIT 1`
        : await sql`SELECT likecount FROM projects WHERE id = ${contentId} LIMIT 1`;
    const row = rowRows[0] as { likecount: number } | undefined;
    const next = Math.max(0, (row?.likecount ?? 0) - 1);
    if (table === 'posts') {
      await sql`UPDATE posts SET likecount = ${next} WHERE id = ${contentId}`;
    } else {
      await sql`UPDATE projects SET likecount = ${next} WHERE id = ${contentId}`;
    }
    return c.json({ liked: false });
  }

  await sql`
    INSERT INTO likes (id, userid, contentid, contenttype, createdat)
    VALUES (${crypto.randomUUID()}, ${user.sub}, ${contentId}, ${contentType}, ${Date.now()})
  `;
  const rowRows2 =
    table === 'posts'
      ? await sql`SELECT likecount FROM posts WHERE id = ${contentId} LIMIT 1`
      : await sql`SELECT likecount FROM projects WHERE id = ${contentId} LIMIT 1`;
  const row = rowRows2[0] as { likecount: number } | undefined;
  const next = (row?.likecount ?? 0) + 1;
  if (table === 'posts') {
    await sql`UPDATE posts SET likecount = ${next} WHERE id = ${contentId}`;
  } else {
    await sql`UPDATE projects SET likecount = ${next} WHERE id = ${contentId}`;
  }
  return c.json({ liked: true });
});

// ---------- comments ----------
app.get('/api/comments', async (c) => {
  const contentId = c.req.query('contentId');
  const contentType = c.req.query('contentType');
  if (!contentId || !contentType) return c.json({ error: 'contentId and contentType required' }, 400);
  const rows = await sql`
    SELECT c.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
    FROM comments c
    LEFT JOIN profiles pr ON pr.id = c.authorid
    WHERE c.contentid = ${contentId} AND c.contenttype = ${contentType}
    ORDER BY c.createdat DESC
  `;
  return c.json(rows);
});

app.get('/api/comments/latest', async (c) => {
  const contentId = c.req.query('contentId');
  if (!contentId) return c.json({ error: 'contentId required' }, 400);
  const [row] = await sql`
    SELECT c.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
    FROM comments c
    LEFT JOIN profiles pr ON pr.id = c.authorid
    WHERE c.contentid = ${contentId}
    ORDER BY c.createdat DESC
    LIMIT 1
  `;
  return c.json(row ?? null);
});

app.post('/api/comments', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    contentid: string;
    contenttype: 'post' | 'project';
    text: string;
    parentid?: string | null;
    replytoname?: string | null;
    mentionids?: string[];
  }>();

  const id = crypto.randomUUID();
  const createdat = Date.now();

  await sql`
    INSERT INTO comments (id, contentid, contenttype, authorid, text, createdat, parentid, replytoname, mentionids)
    VALUES (
      ${id},
      ${body.contentid},
      ${body.contenttype},
      ${user.sub},
      ${body.text},
      ${createdat},
      ${body.parentid ?? null},
      ${body.replytoname ?? null},
      ${JSON.stringify(body.mentionids ?? [])}::jsonb
    )
  `;

  const tableName = body.contenttype === 'post' ? 'posts' : 'projects';
  const r0Rows =
    tableName === 'posts'
      ? await sql`SELECT commentcount FROM posts WHERE id = ${body.contentid} LIMIT 1`
      : await sql`SELECT commentcount FROM projects WHERE id = ${body.contentid} LIMIT 1`;
  const r0 = r0Rows[0] as { commentcount: number } | undefined;
  const nextCount = (r0?.commentcount ?? 0) + 1;
  if (tableName === 'posts') {
    await sql`UPDATE posts SET commentcount = ${nextCount} WHERE id = ${body.contentid}`;
  } else {
    await sql`UPDATE projects SET commentcount = ${nextCount} WHERE id = ${body.contentid}`;
  }

  const [row] = await sql`
    SELECT c.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
    FROM comments c
    LEFT JOIN profiles pr ON pr.id = c.authorid
    WHERE c.id = ${id}
    LIMIT 1
  `;
  return c.json(row);
});

app.patch('/api/comments/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Bad request' }, 400);
  const body = await c.req.json<{ text?: string }>();
  if (!body.text || !String(body.text).trim()) {
    return c.json({ error: 'text required' }, 400);
  }

  const profRows = await sql`SELECT role FROM profiles WHERE id = ${user.sub} LIMIT 1`;
  const prof = profRows[0] as { role: string } | undefined;
  if (prof?.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const comRows = await sql`SELECT id FROM comments WHERE id = ${id} LIMIT 1`;
  if (!comRows.length) return c.json({ error: 'Not found' }, 404);

  await sql`UPDATE comments SET text = ${body.text.trim()} WHERE id = ${id}`;

  const [row] = await sql`
    SELECT c.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
    FROM comments c
    LEFT JOIN profiles pr ON pr.id = c.authorid
    WHERE c.id = ${id}
    LIMIT 1
  `;
  return c.json(row);
});

app.delete('/api/comments/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Bad request' }, 400);
  const comRows = await sql`
    SELECT authorid, contentid, contenttype FROM comments WHERE id = ${id} LIMIT 1
  `;
  const com = comRows[0] as
    | { authorid: string; contentid: string; contenttype: string }
    | undefined;
  if (!com) return c.json({ error: 'Not found' }, 404);
  const profRows = await sql`SELECT role FROM profiles WHERE id = ${user.sub} LIMIT 1`;
  const prof = profRows[0] as { role: string } | undefined;
  if (com.authorid !== user.sub && prof?.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const table = com.contenttype === 'post' ? 'posts' : 'projects';
  await sql`DELETE FROM comments WHERE id = ${id}`;
  const rRows =
    table === 'posts'
      ? await sql`SELECT commentcount FROM posts WHERE id = ${com.contentid} LIMIT 1`
      : await sql`SELECT commentcount FROM projects WHERE id = ${com.contentid} LIMIT 1`;
  const r = rRows[0] as { commentcount: number } | undefined;
  const next = Math.max(0, (r?.commentcount ?? 0) - 1);
  if (table === 'posts') {
    await sql`UPDATE posts SET commentcount = ${next} WHERE id = ${com.contentid}`;
  } else {
    await sql`UPDATE projects SET commentcount = ${next} WHERE id = ${com.contentid}`;
  }
  return c.json({ ok: true });
});

// ---------- notifications ----------
function mapNotificationRow(r: Record<string, unknown>) {
  const isread = r.isread ?? r.isRead;
  const created = r.createdat ?? r.createdAt;
  return {
    id: r.id,
    isRead: !!isread,
    fromUserName: String(r.fromusername ?? r.fromUserName ?? r.from_user_name ?? ''),
    commentText: String(r.commenttext ?? r.commentText ?? r.text ?? ''),
    contentType: r.contenttype ?? r.contentType,
    contentId: r.contentid ?? r.contentId,
    type: r.type,
    createdAt: typeof created === 'number' ? created : Number(created),
    ...r,
  };
}

app.get('/api/notifications', authMiddleware, async (c) => {
  const user = c.get('user');
  const rows = await sql`
    SELECT * FROM notifications
    WHERE touserid = ${user.sub}
    ORDER BY createdat DESC
  `;
  return c.json((rows as Record<string, unknown>[]).map(mapNotificationRow));
});

app.patch('/api/notifications/read-all', authMiddleware, async (c) => {
  const user = c.get('user');
  await sql`
    UPDATE notifications SET isread = true
    WHERE touserid = ${user.sub} AND isread = false
  `;
  return c.json({ ok: true });
});

app.patch('/api/notifications/:id/read', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Bad request' }, 400);
  await sql`
    UPDATE notifications SET isread = true
    WHERE id = ${id} AND touserid = ${user.sub}
  `;
  return c.json({ ok: true });
});

// ---------- upload ----------
app.post('/api/uploads', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.parseBody();
  const file = body['file'];
  const scope = String(body['scope'] ?? '');
  const contentIdRaw = String(body['contentId'] ?? '').trim();

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'file required' }, 400);
  }
  if (scope !== 'post' && scope !== 'project' && scope !== 'profile') {
    return c.json({ error: 'invalid scope' }, 400);
  }

  let contentId: string;
  if (scope === 'profile') {
    contentId = user.sub;
  } else {
    contentId = contentIdRaw;
    if (!UUID_RE.test(contentId)) {
      return c.json({ error: 'invalid contentId' }, 400);
    }
  }

  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const relative = await uploadBufferToGithub(
      buf,
      scope,
      contentId,
      file.name || 'file',
      file.type || 'application/octet-stream'
    );
    return c.json({ path: relative });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upload failed';
    return c.json({ error: msg }, 500);
  }
});

// ---------- SSE ----------
app.get('/api/events', authMiddleware, async (c) => {
  const user = c.get('user');
  c.header('Content-Type', 'text/event-stream; charset=utf-8');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  return stream(c, async (s) => {
    s.onAbort(() => {});
    const send = (line: string) => {
      try {
        s.write(line);
      } catch {
        /* ignore */
      }
    };
    const unregister = registerSseClient(send);
    send(`data: ${JSON.stringify({ type: 'connected', userId: user.sub })}\n\n`);
    await new Promise<void>((resolve) => {
      s.onAbort(() => {
        unregister();
        resolve();
      });
    });
  });
});

async function startListen() {
  try {
    await listenSql.listen('app_events', (payload) => {
      try {
        const data = JSON.parse(payload as string) as Record<string, unknown>;
        broadcastSse(data);
      } catch {
        broadcastSse({ raw: payload });
      }
    });
    console.log('[server] listening on pg channel app_events');
  } catch (e) {
    console.warn('[server] pg listen failed (check migrations 002_notify_triggers.sql):', e);
  }
}

await runDatabaseStartup(sql).catch((err) => {
  console.error('[db] 启动阶段数据库处理失败:', err);
  process.exit(1);
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] http://localhost:${info.port}`);
  void startListen();
  startCountReconcileScheduler(sql);
});
