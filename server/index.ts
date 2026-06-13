import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';
import { closeDatabaseConnections, databaseMaxConnections, databaseProvider, sql, listenSql, type AppSql } from './db.js';
import { refreshCountReconcileScheduler, startCountReconcileScheduler } from './countReconcile.js';
import { runDatabaseStartup } from './migrations.js';
import {
  authMiddleware,
  metadataFromJwt,
  isAdminEmail,
  verifySupabaseJwt,
  type AuthUser,
} from './auth.js';
import { broadcastSse, registerSseClient } from './sse.js';
import { deleteFilesFromGithub, uploadBufferToGithub, uploadBufferToGithubWithMeta } from './githubUpload.js';
import { queryQqScanStatus, requestQqLoginCode } from './qqDevToolAuth.js';
import { issueSupabaseSessionForEmail } from './supabaseIssueSession.js';
import { createSupabaseUserForQqRegister, deleteSupabaseUser } from './supabaseAdmin.js';
import {
  issueQqRegisterTicket,
  qqAvatarUrl,
  qqSyntheticEmail,
  verifyQqRegisterTicket,
} from './qqRegisterTicket.js';
import { hashPassword, validatePasswordStrength, verifyPassword } from './passwordAuth.js';
import { getPushPublicKey, isPushEnabled, sendWebPush } from './push.js';
import {
  getEnvOnlyConfigStringList,
  getPublicRuntimeConfig,
  isEnvOnlyConfigKey,
  isRuntimeConfigKey,
  normalizeRuntimeConfigValue,
  runtimeConfigKeys,
  syncEnvConfigDefaultsToDatabase,
} from './runtimeConfig.js';

const PORT = Number(process.env.PORT) || 8787;

const QQ_UIN_RE = /^\d{5,20}$/;
const DISPLAY_NAME_MAX = 32;

function normalizeDisplayName(raw: string | undefined): string | null {
  const name = raw?.trim() ?? '';
  if (!name || name.length > DISPLAY_NAME_MAX) return null;
  return name;
}

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

type AdminProfileRow = ProfileRow & {
  postcount?: string | number;
  projectcount?: string | number;
  commentcount?: string | number;
  likecount?: string | number;
};

type PostRow = {
  id: string;
  authorid: string;
  createdat: string | number;
  likecount: number;
  commentcount: number;
  isrecommended: boolean;
  content: string;
  images?: string[] | null;
  type: string;
  profiles?: { displayname?: string; photourl?: string } | null;
};

type ProjectRow = {
  id: string;
  authorid: string;
  createdat: string | number;
  likecount: number;
  commentcount: number;
  isrecommended: boolean;
  title: string;
  summary: string;
  content: string;
  coverurl: string;
  attachments?: string[] | null;
  type: string;
  profiles?: { displayname?: string; photourl?: string } | null;
};

type FileKind = 'image' | 'audio' | 'video' | 'document' | 'archive' | 'file';

type FileAssetRow = {
  id: string;
  ownerid: string;
  folderid?: string | null;
  path: string;
  url?: string | null;
  name: string;
  mime: string;
  size: string | number;
  ext: string;
  kind: FileKind | string;
  checksum: string;
  createdat: string | number;
  updatedat: string | number;
  ownername?: string | null;
};

type FileFolderRow = {
  id: string;
  ownerid: string;
  parentid?: string | null;
  name: string;
  createdat: string | number;
  updatedat: string | number;
};

type QuerySql = AppSql;

type SiteSettingRow = {
  key: string;
  value: unknown;
  updatedat: string | number;
  updatedby?: string | null;
};

const schedulerSettingKeys = new Set([
  'SKIP_COUNT_RECONCILE',
  'COUNT_RECONCILE_INTERVAL_MS',
]);
const editableRuntimeConfigKeys = new Set<string>(runtimeConfigKeys);

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

function toAdminProfile(row: AdminProfileRow) {
  return {
    ...toPublicProfile(row),
    postcount: Number(row.postcount ?? 0),
    projectcount: Number(row.projectcount ?? 0),
    commentcount: Number(row.commentcount ?? 0),
    likecount: Number(row.likecount ?? 0),
  };
}

function toAdminPost(row: PostRow) {
  return {
    ...row,
    createdat: Number(row.createdat),
    likecount: Number(row.likecount ?? 0),
    commentcount: Number(row.commentcount ?? 0),
    images: Array.isArray(row.images) ? row.images : [],
    authorName: row.profiles?.displayname ?? '',
    authorPhoto: row.profiles?.photourl ?? '',
  };
}

function toAdminProject(row: ProjectRow) {
  return {
    ...row,
    createdat: Number(row.createdat),
    likecount: Number(row.likecount ?? 0),
    commentcount: Number(row.commentcount ?? 0),
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    authorName: row.profiles?.displayname ?? '',
    authorPhoto: row.profiles?.photourl ?? '',
  };
}

function toFileAsset(row: FileAssetRow) {
  return {
    id: row.id,
    ownerid: row.ownerid,
    folderid: row.folderid ?? null,
    path: row.path,
    url: row.url ?? '',
    name: row.name,
    mime: row.mime || 'application/octet-stream',
    size: Number(row.size ?? 0),
    ext: row.ext ?? '',
    kind: normalizeFileKind(row.kind, row.mime, row.name),
    checksum: row.checksum ?? '',
    createdat: Number(row.createdat),
    updatedat: Number(row.updatedat),
    ownerName: row.ownername ?? '',
  };
}

function toFileFolder(row: FileFolderRow) {
  return {
    id: row.id,
    ownerid: row.ownerid,
    parentid: row.parentid ?? null,
    name: row.name,
    createdat: Number(row.createdat),
    updatedat: Number(row.updatedat),
  };
}

function toSiteSetting(row: SiteSettingRow) {
  return {
    key: row.key,
    value: normalizeRuntimeConfigValue(row.value),
    updatedat: Number(row.updatedat),
    updatedby: row.updatedby ?? null,
  };
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseOffset(value: string | undefined) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizeSearch(value: string | undefined) {
  return `%${(value ?? '').trim().replace(/[%_\\]/g, '\\$&')}%`;
}

type PageCursor = {
  createdat: number;
  id: string;
  type?: string;
};

type PaginatedResponse<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

type CursorRow = Record<string, unknown> & {
  id?: unknown;
  createdat?: unknown;
  type?: unknown;
};

type FeedType = 'all' | 'post' | 'project';
type SearchType = 'all' | 'user' | 'post' | 'project';
type ContentType = 'post' | 'project';

type AttachmentMap = Record<ContentType, Map<string, ReturnType<typeof toFileAsset>[]>>;

function parseOptionalLimit(value: string | undefined, fallback: number, max: number): number | null {
  if (value === undefined) return null;
  return parsePositiveInt(value, fallback, max);
}

function encodePageCursor(row: CursorRow): string | null {
  const createdat = Number(row.createdat);
  const id = String(row.id ?? '').trim();
  const type = String(row.type ?? '').trim();
  if (!Number.isFinite(createdat) || !id) return null;
  const json = JSON.stringify({ createdat, id, ...(type ? { type } : {}) });
  return Buffer.from(json, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodePageCursor(value: string | undefined): PageCursor | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const base64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Partial<PageCursor>;
    const createdat = Number(parsed.createdat);
    const id = String(parsed.id ?? '').trim();
    const type = String(parsed.type ?? '').trim();
    if (!Number.isFinite(createdat) || !id) return null;
    return { createdat, id, ...(type ? { type } : {}) };
  } catch {
    return null;
  }
}

function cursorTypeRank(value: unknown) {
  const type = String(value ?? '');
  if (type === 'post') return 3;
  if (type === 'project') return 2;
  if (type === 'user') return 1;
  return 0;
}

function compareCursorRows(a: CursorRow, b: CursorRow) {
  const timeDelta = Number(b.createdat ?? 0) - Number(a.createdat ?? 0);
  if (timeDelta !== 0) return timeDelta;
  const idDelta = String(b.id ?? '').localeCompare(String(a.id ?? ''));
  if (idDelta !== 0) return idDelta;
  return cursorTypeRank(b.type) - cursorTypeRank(a.type);
}

function toPaginatedResponse<T extends CursorRow>(rows: T[], limit: number): PaginatedResponse<T> {
  const pageItems = rows.slice(0, limit);
  const last = pageItems[pageItems.length - 1];
  return {
    items: pageItems,
    nextCursor: rows.length > limit && last ? encodePageCursor(last) : null,
    hasMore: rows.length > limit,
  };
}

function emptyPaginatedResponse<T>(): PaginatedResponse<T> {
  return { items: [], nextCursor: null, hasMore: false };
}

function mergeAttachmentRows(rows: Array<Record<string, unknown> & FileAssetRow>, contentIdKey: string) {
  const map = new Map<string, ReturnType<typeof toFileAsset>[]>();
  for (const row of rows) {
    const contentId = String(row[contentIdKey] ?? '').trim();
    if (!contentId) continue;
    const list = map.get(contentId) ?? [];
    list.push(toFileAsset(row));
    map.set(contentId, list);
  }
  return map;
}

async function getContentAttachmentAssetsBatch(params: { postIds?: string[]; projectIds?: string[] }): Promise<AttachmentMap> {
  const postIds = Array.from(new Set((params.postIds ?? []).filter((id) => UUID_RE.test(id))));
  const projectIds = Array.from(new Set((params.projectIds ?? []).filter((id) => UUID_RE.test(id))));
  const result: AttachmentMap = { post: new Map(), project: new Map() };
  if (postIds.length === 0 && projectIds.length === 0) return result;

  let rows: Array<Record<string, unknown> & FileAssetRow>;
  if (postIds.length > 0 && projectIds.length > 0) {
    rows = (await sql`
      SELECT 'post' AS contenttype, pa.postid::text AS contentid, pa.sortorder AS attachmentsortorder, pa.createdat AS attachmentcreatedat, fa.*
      FROM post_attachments pa
      JOIN file_assets fa ON fa.id = pa.assetid
      WHERE pa.postid = ANY(${sql.array(postIds)}::uuid[])
      UNION ALL
      SELECT 'project' AS contenttype, pa.projectid::text AS contentid, pa.sortorder AS attachmentsortorder, pa.createdat AS attachmentcreatedat, fa.*
      FROM project_attachments pa
      JOIN file_assets fa ON fa.id = pa.assetid
      WHERE pa.projectid = ANY(${sql.array(projectIds)}::uuid[])
      ORDER BY contenttype ASC, contentid ASC, attachmentsortorder ASC, attachmentcreatedat ASC
    `) as unknown as Array<Record<string, unknown> & FileAssetRow>;
  } else if (postIds.length > 0) {
    rows = (await sql`
      SELECT 'post' AS contenttype, pa.postid::text AS contentid, pa.sortorder AS attachmentsortorder, pa.createdat AS attachmentcreatedat, fa.*
      FROM post_attachments pa
      JOIN file_assets fa ON fa.id = pa.assetid
      WHERE pa.postid = ANY(${sql.array(postIds)}::uuid[])
      ORDER BY pa.postid ASC, pa.sortorder ASC, pa.createdat ASC
    `) as unknown as Array<Record<string, unknown> & FileAssetRow>;
  } else {
    rows = (await sql`
      SELECT 'project' AS contenttype, pa.projectid::text AS contentid, pa.sortorder AS attachmentsortorder, pa.createdat AS attachmentcreatedat, fa.*
      FROM project_attachments pa
      JOIN file_assets fa ON fa.id = pa.assetid
      WHERE pa.projectid = ANY(${sql.array(projectIds)}::uuid[])
      ORDER BY pa.projectid ASC, pa.sortorder ASC, pa.createdat ASC
    `) as unknown as Array<Record<string, unknown> & FileAssetRow>;
  }

  for (const row of rows) {
    const contentType = row.contenttype === 'project' ? 'project' : row.contenttype === 'post' ? 'post' : null;
    const contentId = String(row.contentid ?? '').trim();
    if (!contentType || !contentId) continue;
    const list = result[contentType].get(contentId) ?? [];
    list.push(toFileAsset(row));
    result[contentType].set(contentId, list);
  }
  return result;
}

async function attachCurrentPageAssets<T extends Record<string, unknown> & { type?: unknown; id?: unknown; fileattachments?: unknown }>(items: T[]) {
  const postIds = items
    .filter((item) => item.type === 'post')
    .map((item) => String(item.id ?? ''));
  const projectIds = items
    .filter((item) => item.type === 'project')
    .map((item) => String(item.id ?? ''));
  const attachments = await getContentAttachmentAssetsBatch({ postIds, projectIds });
  for (const item of items) {
    if (item.type === 'post' || item.type === 'project') {
      item.fileattachments = attachments[item.type].get(String(item.id ?? '')) ?? [];
    }
  }
}

function cursorPredicate(tableAlias: string, cursor: PageCursor | null, includeType = false) {
  if (!cursor) return sql`true`;
  if (!includeType || !cursor.type) {
    return sql`${sql.unsafe(tableAlias)}.createdat < ${cursor.createdat} OR (${sql.unsafe(tableAlias)}.createdat = ${cursor.createdat} AND ${sql.unsafe(tableAlias)}.id < ${cursor.id})`;
  }
  return sql`
    ${sql.unsafe(tableAlias)}.createdat < ${cursor.createdat}
    OR (${sql.unsafe(tableAlias)}.createdat = ${cursor.createdat} AND ${sql.unsafe(tableAlias)}.id < ${cursor.id})
    OR (${sql.unsafe(tableAlias)}.createdat = ${cursor.createdat} AND ${sql.unsafe(tableAlias)}.id = ${cursor.id} AND ${sql.unsafe(tableAlias)}.type < ${cursor.type})
  `;
}

function normalizeExtFromName(name: string) {
  const clean = name.split(/[?#]/)[0] ?? '';
  const dot = clean.lastIndexOf('.');
  if (dot < 0) return '';
  return clean.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 16);
}

function normalizeFileKind(kind: unknown, mime?: string, name?: string): FileKind {
  if (kind === 'image' || kind === 'audio' || kind === 'video' || kind === 'document' || kind === 'archive' || kind === 'file') {
    return kind;
  }
  const lowerMime = (mime ?? '').toLowerCase();
  const ext = normalizeExtFromName(name ?? '');
  if (lowerMime.startsWith('image/')) return 'image';
  if (lowerMime.startsWith('audio/')) return 'audio';
  if (lowerMime.startsWith('video/')) return 'video';
  if (
    lowerMime === 'application/pdf' ||
    lowerMime.startsWith('text/') ||
    lowerMime.includes('officedocument') ||
    lowerMime.includes('msword') ||
    lowerMime.includes('ms-excel') ||
    lowerMime.includes('ms-powerpoint') ||
    ['.pdf', '.txt', '.md', '.markdown', '.csv', '.json', '.xml', '.html', '.css', '.js', '.ts', '.tsx', '.jsx', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(ext)
  ) {
    return 'document';
  }
  if (
    lowerMime.includes('zip') ||
    lowerMime.includes('compressed') ||
    ['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.xz'].includes(ext)
  ) {
    return 'archive';
  }
  return 'file';
}

function cleanFileName(value: unknown, fallback = 'file') {
  const raw = String(value ?? '').trim();
  const name = raw.split(/[\\/]/).pop()?.trim() || fallback;
  return name.replace(/[\u0000-\u001f]/g, '').slice(0, 180) || fallback;
}

function uniqueIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const id = String(value ?? '').trim();
    if (!UUID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

async function getActorRole(userId: string) {
  const rows = await sql`SELECT role FROM profiles WHERE id = ${userId} LIMIT 1`;
  return (rows[0] as { role?: string } | undefined)?.role ?? 'user';
}

async function assertFolderWritable(folderId: string | null, ownerId: string, isAdmin: boolean) {
  if (!folderId) return;
  if (!UUID_RE.test(folderId)) throw new Error('invalid folderId');
  const rows = await sql`SELECT ownerid FROM file_folders WHERE id = ${folderId} LIMIT 1`;
  const folder = rows[0] as { ownerid: string } | undefined;
  if (!folder) throw new Error('folder not found');
  if (!isAdmin && folder.ownerid !== ownerId) throw new Error('folder forbidden');
  if (isAdmin && folder.ownerid !== ownerId) throw new Error('folder owner mismatch');
}

async function getContentAttachmentAssets(contentType: 'post' | 'project', contentId: string) {
  const rows =
    contentType === 'post'
      ? await sql`
          SELECT fa.*
          FROM post_attachments pa
          JOIN file_assets fa ON fa.id = pa.assetid
          WHERE pa.postid = ${contentId}
          ORDER BY pa.sortorder ASC, pa.createdat ASC
        `
      : await sql`
          SELECT fa.*
          FROM project_attachments pa
          JOIN file_assets fa ON fa.id = pa.assetid
          WHERE pa.projectid = ${contentId}
          ORDER BY pa.sortorder ASC, pa.createdat ASC
        `;
  return (rows as unknown as FileAssetRow[]).map(toFileAsset);
}

async function validateContentAttachmentIds(db: QuerySql, assetIdsInput: unknown, actorId: string, isAdmin: boolean) {
  const assetIds = uniqueIds(assetIdsInput);
  if (assetIds.length > 0) {
    const assets = (await db`
      SELECT id::text AS id, ownerid::text AS ownerid
      FROM file_assets
      WHERE id = ANY(${db.array(assetIds)}::uuid[])
    `) as unknown as Array<{ id: string; ownerid: string }>;
    const found = new Set(assets.map((asset) => asset.id));
    if (assetIds.some((id) => !found.has(id))) {
      throw new Error('attachment not found');
    }
    if (!isAdmin && assets.some((asset) => asset.ownerid !== actorId)) {
      throw new Error('attachment forbidden');
    }
  }
  return assetIds;
}

async function writeContentAttachments(
  db: QuerySql,
  contentType: 'post' | 'project',
  contentId: string,
  assetIds: string[]
) {
  if (contentType === 'post') {
    await db`DELETE FROM post_attachments WHERE postid = ${contentId}`;
    for (let i = 0; i < assetIds.length; i++) {
      await db`
        INSERT INTO post_attachments (postid, assetid, sortorder, createdat)
        VALUES (${contentId}, ${assetIds[i]}, ${i}, ${Date.now()})
        ON CONFLICT (postid, assetid) DO UPDATE SET sortorder = EXCLUDED.sortorder
      `;
    }
    return;
  }

  await db`DELETE FROM project_attachments WHERE projectid = ${contentId}`;
  for (let i = 0; i < assetIds.length; i++) {
    await db`
      INSERT INTO project_attachments (projectid, assetid, sortorder, createdat)
      VALUES (${contentId}, ${assetIds[i]}, ${i}, ${Date.now()})
      ON CONFLICT (projectid, assetid) DO UPDATE SET sortorder = EXCLUDED.sortorder
    `;
  }
}

async function syncContentAttachments(
  contentType: 'post' | 'project',
  contentId: string,
  assetIdsInput: unknown,
  actorId: string,
  isAdmin: boolean
) {
  const assetIds = await validateContentAttachmentIds(sql, assetIdsInput, actorId, isAdmin);
  await sql.begin((tx) => writeContentAttachments(tx, contentType, contentId, assetIds));
}

async function attachmentPathsForContent(contentType: 'post' | 'project', contentId: string) {
  const rows =
    contentType === 'post'
      ? await sql`
          SELECT fa.path FROM post_attachments pa
          JOIN file_assets fa ON fa.id = pa.assetid
          WHERE pa.postid = ${contentId}
        `
      : await sql`
          SELECT fa.path FROM project_attachments pa
          JOIN file_assets fa ON fa.id = pa.assetid
          WHERE pa.projectid = ${contentId}
        `;
  return (rows as unknown as Array<{ path?: string }>).map((row) => row.path ?? '').filter(Boolean);
}

async function getProfileRole(userId: string): Promise<string | undefined> {
  const rows = await sql`SELECT role FROM profiles WHERE id = ${userId} LIMIT 1`;
  return (rows[0] as { role?: string } | undefined)?.role;
}

async function assertAdminCanRemoveProfile(targetId: string, actorId: string) {
  if (targetId === actorId) {
    return 'Cannot remove the current admin account';
  }
  const targetRows = await sql`SELECT role FROM profiles WHERE id = ${targetId} LIMIT 1`;
  const target = targetRows[0] as { role?: string } | undefined;
  if (!target) return 'User not found';
  if (target.role !== 'admin') return undefined;

  const countRows = await sql`SELECT count(*)::int AS count FROM profiles WHERE role = 'admin'`;
  const count = Number((countRows[0] as { count?: number } | undefined)?.count ?? 0);
  if (count <= 1) {
    return 'Cannot remove the last admin account';
  }
  return undefined;
}

const adminMiddleware: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const user = c.get('user');
  const role = await getProfileRole(user.sub);
  if (role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
};

type NotifyType = 'recommend' | 'like' | 'comment' | 'reply' | 'delete' | 'mention';

type NotificationSettingsRow = {
  userid: string;
  receive_recommend: boolean;
  alert_recommend: boolean;
  receive_like: boolean;
  alert_like: boolean;
  receive_comment: boolean;
  alert_comment: boolean;
  receive_reply: boolean;
  alert_reply: boolean;
  receive_delete: boolean;
  alert_delete: boolean;
  receive_mention: boolean;
  alert_mention: boolean;
  updatedat: number;
};

const notifySettingMap: Record<NotifyType, { receive: keyof NotificationSettingsRow; alert: keyof NotificationSettingsRow }> =
  {
    recommend: { receive: 'receive_recommend', alert: 'alert_recommend' },
    like: { receive: 'receive_like', alert: 'alert_like' },
    comment: { receive: 'receive_comment', alert: 'alert_comment' },
    reply: { receive: 'receive_reply', alert: 'alert_reply' },
    delete: { receive: 'receive_delete', alert: 'alert_delete' },
    mention: { receive: 'receive_mention', alert: 'alert_mention' },
  };

let notificationHasFromUserIdColumn: boolean | null = null;

async function hasNotificationFromUserIdColumn() {
  if (notificationHasFromUserIdColumn !== null) return notificationHasFromUserIdColumn;
  const rows = databaseProvider === 'lsqlite'
    ? await sql`
        SELECT 1
        FROM pragma_table_info('notifications')
        WHERE name = 'fromuserid'
        LIMIT 1
      `
    : await sql`
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'notifications'
          AND column_name = 'fromuserid'
        LIMIT 1
      `;
  notificationHasFromUserIdColumn = rows.length > 0;
  return notificationHasFromUserIdColumn;
}

async function ensureNotificationSettings(userId: string): Promise<NotificationSettingsRow> {
  await sql`
    INSERT INTO notification_settings (userid)
    VALUES (${userId})
    ON CONFLICT (userid) DO NOTHING
  `;
  const existing = await sql`SELECT * FROM notification_settings WHERE userid = ${userId} LIMIT 1`;
  return existing[0] as NotificationSettingsRow;
}

async function emitNotification(params: {
  toUserId: string;
  fromUserId?: string;
  fromUserName: string;
  type: NotifyType;
  eventKey: string;
  commentText?: string;
  contentId?: string | null;
  contentType?: 'post' | 'project' | null;
  payload?: Record<string, unknown>;
}) {
  const { toUserId, fromUserId, fromUserName, type, eventKey, commentText, contentId, contentType, payload } = params;
  if (!toUserId || !eventKey) return;

  const settings = await ensureNotificationSettings(toUserId);
  const keys = notifySettingMap[type];
  const receive = Boolean(settings[keys.receive]);
  if (!receive) return;
  const isAlert = Boolean(settings[keys.alert]);

  const hasFromUserId = await hasNotificationFromUserIdColumn();
  if (hasFromUserId) {
    await sql`
      INSERT INTO notifications (id, touserid, fromuserid, fromusername, commenttext, contentid, contenttype, type, isread, createdat, eventkey, isalert, payload)
      VALUES (
        ${crypto.randomUUID()},
        ${toUserId},
        ${fromUserId ?? toUserId},
        ${fromUserName},
        ${commentText ?? ''},
        ${contentId ?? null},
        ${contentType ?? null},
        ${type},
        ${!isAlert},
        ${Date.now()},
        ${eventKey},
        ${isAlert},
        ${JSON.stringify(payload ?? {})}::jsonb
      )
      ON CONFLICT (touserid, type, eventkey)
      WHERE eventkey <> ''
      DO NOTHING
    `;
  } else {
    await sql`
      INSERT INTO notifications (id, touserid, fromusername, commenttext, contentid, contenttype, type, isread, createdat, eventkey, isalert, payload)
      VALUES (
        ${crypto.randomUUID()},
        ${toUserId},
        ${fromUserName},
        ${commentText ?? ''},
        ${contentId ?? null},
        ${contentType ?? null},
        ${type},
        ${!isAlert},
        ${Date.now()},
        ${eventKey},
        ${isAlert},
        ${JSON.stringify(payload ?? {})}::jsonb
      )
      ON CONFLICT (touserid, type, eventkey)
      WHERE eventkey <> ''
      DO NOTHING
    `;
  }

  if (!isAlert || !(await isPushEnabled())) return;

  const subscriptions = (await sql`
    SELECT endpoint, p256dh, auth
    FROM push_subscriptions
    WHERE userid = ${toUserId}
  `) as unknown as Array<{ endpoint: string; p256dh: string; auth: string }>;
  if (subscriptions.length === 0) return;

  const typeTextMap: Record<NotifyType, string> = {
    recommend: '推荐了你的内容',
    like: '点赞了你的内容',
    comment: '评论了你的内容',
    reply: '回复了你的评论',
    delete: '管理员删除了你的内容',
    mention: '@了你',
  };
  const title = fromUserName ? `${fromUserName} ${typeTextMap[type]}` : typeTextMap[type];
  const bodyText = (commentText ?? '').trim() || '点击查看详情';
  const url =
    contentId && contentType
      ? `${contentType === 'post' ? '/post/' : '/project/'}${contentId}`
      : '/messages';

  const invalidEndpoints = await sendWebPush(subscriptions, {
    title,
    body: bodyText,
    url,
    tag: `sf-${type}-${eventKey}`,
  });
  if (invalidEndpoints.length > 0) {
    await sql`DELETE FROM push_subscriptions WHERE endpoint = ANY(${sql.array(invalidEndpoints)})`;
  }
}

app.use(
  '*',
  cors({
    origin: (origin) => {
      const allowed = getEnvOnlyConfigStringList('FRONTEND_ORIGIN', [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        'https://localhost',
        'capacitor://localhost',
        'ionic://localhost',
      ]);
      if (allowed.includes('*')) return origin || '*';
      if (!origin) return allowed[0] ?? null;
      return allowed.includes(origin) ? origin : null;
    },
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);

app.get('/health', (c) => c.json({ ok: true }));

app.get('/api/public-config', async (c) => c.json(await getPublicRuntimeConfig()));

// ---------- /api/me ----------
app.get('/api/me', authMiddleware, async (c) => {
  const user = c.get('user');
  const existingRows = await sql`SELECT * FROM profiles WHERE id = ${user.sub} LIMIT 1`;
  const existing = existingRows[0] as ProfileRow | undefined;

  if (existing) {
    return c.json(toPublicProfile(existing));
  }

  const { displayname, photourl, email } = metadataFromJwt(user);
  const role = (await isAdminEmail(email)) ? 'admin' : 'user';
  const createdat = Date.now();

  await sql`
    INSERT INTO profiles (id, email, displayname, photourl, role, createdat)
    VALUES (${user.sub}, ${email}, ${displayname}, ${photourl}, ${role}, ${createdat})
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email
  `;
  const createdRows = await sql`SELECT * FROM profiles WHERE id = ${user.sub} LIMIT 1`;
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
    try {
      const ticket = await issueQqRegisterTicket(uin);
      return c.json({
        state: 'register' as const,
        uin,
        ticket,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'ticket failed';
      return c.json({ state: 'error' as const, msg }, 502);
    }
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

/** 未登录：QQ 扫码注册（multipart：ticket + displayname；可选 file 自定义头像，否则使用 QQ 官方头像链接） */
app.post('/api/qq/register', async (c) => {
  const body = await c.req.parseBody();
  const ticket = String(body['ticket'] ?? '').trim();
  const displayname = normalizeDisplayName(String(body['displayname'] ?? ''));
  const file = body['file'];

  if (!ticket) {
    return c.json({ error: '缺少 ticket' }, 400);
  }
  if (!displayname) {
    return c.json({ error: '昵称不能为空且不超过 32 字' }, 400);
  }
  if (file !== undefined && file !== null && !(file instanceof File)) {
    return c.json({ error: '无效的头像文件' }, 400);
  }
  if (file instanceof File && !file.type.startsWith('image/')) {
    return c.json({ error: '仅支持图片' }, 400);
  }

  let uin: string;
  try {
    ({ uin } = await verifyQqRegisterTicket(ticket));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'ticket invalid';
    return c.json({ error: msg }, 401);
  }

  if (!QQ_UIN_RE.test(uin)) {
    return c.json({ error: '无效的 uin' }, 400);
  }

  const takenRows = await sql`SELECT id FROM profiles WHERE qq_uin = ${uin} LIMIT 1`;
  if (takenRows.length > 0) {
    return c.json({ error: '该 QQ 已注册' }, 409);
  }

  const email = qqSyntheticEmail(uin);
  const defaultPhotoUrl = qqAvatarUrl(uin);
  let userId: string;
  let photourl: string;

  if (file instanceof File) {
    try {
      const created = await createSupabaseUserForQqRegister({
        uin,
        email,
        displayname,
      });
      userId = created.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'create user failed';
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
        return c.json({ error: '该 QQ 已注册' }, 409);
      }
      console.error('[qq/register] createUser:', e);
      return c.json({ error: msg }, 502);
    }

    const buf = Buffer.from(await file.arrayBuffer());
    try {
      const mime = file.type || 'image/jpeg';
      const name = cleanFileName(file.name || 'avatar.jpg');
      const result = await uploadBufferToGithubWithMeta(buf, 'profile', userId, name, mime);
      photourl = result.path;
    } catch (e) {
      try {
        await deleteSupabaseUser(userId);
      } catch (rollbackErr) {
        console.error('[qq/register] rollback deleteUser failed:', rollbackErr);
      }
      const msg = e instanceof Error ? e.message : 'avatar upload failed';
      console.error('[qq/register] upload avatar:', e);
      return c.json({ error: msg }, 500);
    }
  } else {
    photourl = defaultPhotoUrl;
    try {
      const created = await createSupabaseUserForQqRegister({
        uin,
        email,
        displayname,
        photourl,
      });
      userId = created.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'create user failed';
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
        return c.json({ error: '该 QQ 已注册' }, 409);
      }
      console.error('[qq/register] createUser:', e);
      return c.json({ error: msg }, 502);
    }
  }

  const role = (await isAdminEmail(email)) ? 'admin' : 'user';
  const createdat = Date.now();

  try {
    await sql`
      INSERT INTO profiles (id, email, displayname, photourl, role, createdat, qq_uin)
      VALUES (${userId}, ${email}, ${displayname}, ${photourl}, ${role}, ${createdat}, ${uin})
    `;
  } catch (e) {
    try {
      await deleteSupabaseUser(userId);
    } catch (rollbackErr) {
      console.error('[qq/register] rollback deleteUser failed:', rollbackErr);
    }
    const msg = e instanceof Error ? e.message : 'profile insert failed';
    console.error('[qq/register] insert profile:', e);
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return c.json({ error: '该 QQ 已注册' }, 409);
    }
    return c.json({ error: msg }, 500);
  }

  try {
    const session = await issueSupabaseSessionForEmail(email);
    return c.json({
      ok: true,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      ...(session.expires_at !== undefined ? { expires_at: session.expires_at } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'session failed';
    console.error('[qq/register] issue session:', e);
    return c.json({ error: msg }, 502);
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

// ---------- notification settings ----------
app.get('/api/notification-settings', authMiddleware, async (c) => {
  const user = c.get('user');
  const row = await ensureNotificationSettings(user.sub);
  return c.json(row);
});

app.patch('/api/notification-settings', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<Partial<Omit<NotificationSettingsRow, 'userid' | 'updatedat'>>>();
  const current = await ensureNotificationSettings(user.sub);

  const next = {
    receive_recommend: body.receive_recommend ?? current.receive_recommend,
    alert_recommend: body.alert_recommend ?? current.alert_recommend,
    receive_like: body.receive_like ?? current.receive_like,
    alert_like: body.alert_like ?? current.alert_like,
    receive_comment: body.receive_comment ?? current.receive_comment,
    alert_comment: body.alert_comment ?? current.alert_comment,
    receive_reply: body.receive_reply ?? current.receive_reply,
    alert_reply: body.alert_reply ?? current.alert_reply,
    receive_delete: body.receive_delete ?? current.receive_delete,
    alert_delete: body.alert_delete ?? current.alert_delete,
    receive_mention: body.receive_mention ?? current.receive_mention,
    alert_mention: body.alert_mention ?? current.alert_mention,
    updatedat: Date.now(),
  };

  await sql`
    UPDATE notification_settings
    SET
      receive_recommend = ${next.receive_recommend},
      alert_recommend = ${next.alert_recommend},
      receive_like = ${next.receive_like},
      alert_like = ${next.alert_like},
      receive_comment = ${next.receive_comment},
      alert_comment = ${next.alert_comment},
      receive_reply = ${next.receive_reply},
      alert_reply = ${next.alert_reply},
      receive_delete = ${next.receive_delete},
      alert_delete = ${next.alert_delete},
      receive_mention = ${next.receive_mention},
      alert_mention = ${next.alert_mention},
      updatedat = ${next.updatedat}
    WHERE userid = ${user.sub}
  `;
  const rows = await sql`SELECT * FROM notification_settings WHERE userid = ${user.sub} LIMIT 1`;
  return c.json(rows[0] as NotificationSettingsRow);
});

// ---------- web push ----------
app.get('/api/push/public-key', authMiddleware, async (c) => {
  if (!(await isPushEnabled())) {
    return c.json({ enabled: false, publicKey: '' });
  }
  return c.json({ enabled: true, publicKey: await getPushPublicKey() });
});

app.post('/api/push/subscribe', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!(await isPushEnabled())) return c.json({ error: 'Push unavailable' }, 503);

  const body = await c.req.json<{
    subscription?: {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
  }>();
  const endpoint = body.subscription?.endpoint?.trim() ?? '';
  const p256dh = body.subscription?.keys?.p256dh?.trim() ?? '';
  const auth = body.subscription?.keys?.auth?.trim() ?? '';
  if (!endpoint || !p256dh || !auth) {
    return c.json({ error: 'Invalid subscription' }, 400);
  }

  const now = Date.now();
  const ua = c.req.header('User-Agent') ?? '';
  await sql`
    INSERT INTO push_subscriptions (endpoint, userid, p256dh, auth, useragent, createdat, updatedat)
    VALUES (${endpoint}, ${user.sub}, ${p256dh}, ${auth}, ${ua}, ${now}, ${now})
    ON CONFLICT (endpoint) DO UPDATE SET
      userid = EXCLUDED.userid,
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      useragent = EXCLUDED.useragent,
      updatedat = EXCLUDED.updatedat
  `;
  return c.json({ ok: true });
});

app.post('/api/push/unsubscribe', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ endpoint?: string }>();
  const endpoint = body.endpoint?.trim() ?? '';
  if (!endpoint) return c.json({ error: 'endpoint required' }, 400);
  await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint} AND userid = ${user.sub}`;
  return c.json({ ok: true });
});

// ---------- admin ----------
app.get('/api/admin/summary', authMiddleware, adminMiddleware, async (c) => {
  const [profileRows, postRows, projectRows, commentRows, likeRows, recommendRows] = await Promise.all([
    sql`SELECT count(*)::int AS count FROM profiles`,
    sql`SELECT count(*)::int AS count FROM posts`,
    sql`SELECT count(*)::int AS count FROM projects`,
    sql`SELECT count(*)::int AS count FROM comments`,
    sql`SELECT count(*)::int AS count FROM likes`,
    sql`
      SELECT
        (SELECT count(*)::int FROM posts WHERE isrecommended = true) AS posts,
        (SELECT count(*)::int FROM projects WHERE isrecommended = true) AS projects
    `,
  ]);

  const recommended = recommendRows[0] as { posts?: number; projects?: number } | undefined;
  return c.json({
    users: Number((profileRows[0] as { count?: number } | undefined)?.count ?? 0),
    posts: Number((postRows[0] as { count?: number } | undefined)?.count ?? 0),
    projects: Number((projectRows[0] as { count?: number } | undefined)?.count ?? 0),
    comments: Number((commentRows[0] as { count?: number } | undefined)?.count ?? 0),
    likes: Number((likeRows[0] as { count?: number } | undefined)?.count ?? 0),
    recommendedPosts: Number(recommended?.posts ?? 0),
    recommendedProjects: Number(recommended?.projects ?? 0),
  });
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (c) => {
  const q = c.req.query('q')?.trim() ?? '';
  const limit = parsePositiveInt(c.req.query('limit'), 50, 100);
  const offset = parseOffset(c.req.query('offset'));
  const like = normalizeSearch(q);

  const rows = q
    ? await sql`
        SELECT pr.*,
          (SELECT count(*) FROM posts p WHERE p.authorid = pr.id) AS postcount,
          (SELECT count(*) FROM projects pj WHERE pj.authorid = pr.id) AS projectcount,
          (SELECT count(*) FROM comments c WHERE c.authorid = pr.id) AS commentcount,
          (SELECT count(*) FROM likes l WHERE l.userid = pr.id) AS likecount
        FROM profiles pr
        WHERE pr.email ILIKE ${like} ESCAPE '\\'
          OR pr.displayname ILIKE ${like} ESCAPE '\\'
          OR pr.id ILIKE ${like} ESCAPE '\\'
          OR COALESCE(pr.qq_uin, '') ILIKE ${like} ESCAPE '\\'
        ORDER BY pr.createdat DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `
    : await sql`
        SELECT pr.*,
          (SELECT count(*) FROM posts p WHERE p.authorid = pr.id) AS postcount,
          (SELECT count(*) FROM projects pj WHERE pj.authorid = pr.id) AS projectcount,
          (SELECT count(*) FROM comments c WHERE c.authorid = pr.id) AS commentcount,
          (SELECT count(*) FROM likes l WHERE l.userid = pr.id) AS likecount
        FROM profiles pr
        ORDER BY pr.createdat DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

  const countRows = q
    ? await sql`
        SELECT count(*)::int AS count
        FROM profiles pr
        WHERE pr.email ILIKE ${like} ESCAPE '\\'
          OR pr.displayname ILIKE ${like} ESCAPE '\\'
          OR pr.id ILIKE ${like} ESCAPE '\\'
          OR COALESCE(pr.qq_uin, '') ILIKE ${like} ESCAPE '\\'
      `
    : await sql`SELECT count(*)::int AS count FROM profiles`;

  return c.json({
    items: (rows as unknown as AdminProfileRow[]).map(toAdminProfile),
    total: Number((countRows[0] as { count?: number } | undefined)?.count ?? 0),
  });
});

app.patch('/api/admin/users/:id', authMiddleware, adminMiddleware, async (c) => {
  const actor = c.get('user');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Bad request' }, 400);

  const body = await c.req.json<{
    displayname?: string;
    photourl?: string;
    role?: 'admin' | 'user';
    qq_uin?: string | null;
    clearPassword?: boolean;
  }>();

  const existingRows = await sql`SELECT * FROM profiles WHERE id = ${id} LIMIT 1`;
  const existing = existingRows[0] as ProfileRow | undefined;
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const nextRole = body.role ?? existing.role;
  if (nextRole !== 'admin' && nextRole !== 'user') {
    return c.json({ error: 'Invalid role' }, 400);
  }
  if (existing.role === 'admin' && nextRole !== 'admin') {
    const reason = await assertAdminCanRemoveProfile(id, actor.sub);
    if (reason) return c.json({ error: reason }, 400);
  }

  const displayname = body.displayname !== undefined ? body.displayname.trim() : existing.displayname;
  if (!displayname) return c.json({ error: 'displayname cannot be empty' }, 400);
  const photourl = body.photourl !== undefined ? body.photourl.trim() : existing.photourl;
  const qqUin = body.qq_uin === undefined ? existing.qq_uin ?? null : body.qq_uin?.trim() || null;

  if (qqUin && !QQ_UIN_RE.test(qqUin)) {
    return c.json({ error: 'Invalid QQ uin' }, 400);
  }
  if (qqUin) {
    const takenRows = await sql`
      SELECT id FROM profiles WHERE qq_uin = ${qqUin} AND id <> ${id} LIMIT 1
    `;
    if (takenRows.length > 0) return c.json({ error: 'QQ uin already bound' }, 409);
  }

  if (body.clearPassword) {
    await sql`
      UPDATE profiles
      SET displayname = ${displayname},
          photourl = ${photourl},
          role = ${nextRole},
          qq_uin = ${qqUin},
          passwordhash = null
      WHERE id = ${id}
    `;
  } else {
    await sql`
      UPDATE profiles
      SET displayname = ${displayname},
          photourl = ${photourl},
          role = ${nextRole},
          qq_uin = ${qqUin}
      WHERE id = ${id}
    `;
  }
  const rows = await sql`SELECT * FROM profiles WHERE id = ${id} LIMIT 1`;

  return c.json(toPublicProfile(rows[0] as ProfileRow));
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, async (c) => {
  const actor = c.get('user');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Bad request' }, 400);

  const reason = await assertAdminCanRemoveProfile(id, actor.sub);
  if (reason) return c.json({ error: reason }, 400);

  await sql`DELETE FROM profiles WHERE id = ${id}`;
  return c.json({ ok: true });
});

app.get('/api/admin/posts', authMiddleware, adminMiddleware, async (c) => {
  const q = c.req.query('q')?.trim() ?? '';
  const recommended = c.req.query('recommended');
  const limit = parsePositiveInt(c.req.query('limit'), 50, 100);
  const offset = parseOffset(c.req.query('offset'));
  const like = normalizeSearch(q);

  const rows = await sql`
    SELECT p.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
    FROM posts p
    LEFT JOIN profiles pr ON pr.id = p.authorid
    WHERE (${q ? sql`p.content ILIKE ${like} ESCAPE '\\'` : sql`true`})
      AND (${recommended === 'true' ? sql`p.isrecommended = true` : recommended === 'false' ? sql`p.isrecommended = false` : sql`true`})
    ORDER BY p.createdat DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
  const countRows = await sql`
    SELECT count(*)::int AS count
    FROM posts p
    WHERE (${q ? sql`p.content ILIKE ${like} ESCAPE '\\'` : sql`true`})
      AND (${recommended === 'true' ? sql`p.isrecommended = true` : recommended === 'false' ? sql`p.isrecommended = false` : sql`true`})
  `;

  return c.json({
    items: (rows as unknown as PostRow[]).map(toAdminPost),
    total: Number((countRows[0] as { count?: number } | undefined)?.count ?? 0),
  });
});

app.get('/api/admin/projects', authMiddleware, adminMiddleware, async (c) => {
  const q = c.req.query('q')?.trim() ?? '';
  const recommended = c.req.query('recommended');
  const limit = parsePositiveInt(c.req.query('limit'), 50, 100);
  const offset = parseOffset(c.req.query('offset'));
  const like = normalizeSearch(q);

  const rows = await sql`
    SELECT p.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
    FROM projects p
    LEFT JOIN profiles pr ON pr.id = p.authorid
    WHERE (${
      q
        ? sql`p.title ILIKE ${like} ESCAPE '\\' OR p.summary ILIKE ${like} ESCAPE '\\' OR p.content ILIKE ${like} ESCAPE '\\'`
        : sql`true`
    })
      AND (${recommended === 'true' ? sql`p.isrecommended = true` : recommended === 'false' ? sql`p.isrecommended = false` : sql`true`})
    ORDER BY p.createdat DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
  const countRows = await sql`
    SELECT count(*)::int AS count
    FROM projects p
    WHERE (${
      q
        ? sql`p.title ILIKE ${like} ESCAPE '\\' OR p.summary ILIKE ${like} ESCAPE '\\' OR p.content ILIKE ${like} ESCAPE '\\'`
        : sql`true`
    })
      AND (${recommended === 'true' ? sql`p.isrecommended = true` : recommended === 'false' ? sql`p.isrecommended = false` : sql`true`})
  `;

  return c.json({
    items: (rows as unknown as ProjectRow[]).map(toAdminProject),
    total: Number((countRows[0] as { count?: number } | undefined)?.count ?? 0),
  });
});

app.get('/api/admin/comments', authMiddleware, adminMiddleware, async (c) => {
  const q = c.req.query('q')?.trim() ?? '';
  const contentType = c.req.query('contentType');
  const limit = parsePositiveInt(c.req.query('limit'), 50, 100);
  const offset = parseOffset(c.req.query('offset'));
  const like = normalizeSearch(q);

  const rows = await sql`
    SELECT c.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles,
      CASE
        WHEN c.contenttype = 'post' THEN substring(po.content from 1 for 120)
        WHEN c.contenttype = 'project' THEN pj.title
        ELSE ''
      END AS contenttitle
    FROM comments c
    LEFT JOIN profiles pr ON pr.id = c.authorid
    LEFT JOIN posts po ON po.id = c.contentid AND c.contenttype = 'post'
    LEFT JOIN projects pj ON pj.id = c.contentid AND c.contenttype = 'project'
    WHERE (${q ? sql`c.text ILIKE ${like} ESCAPE '\\'` : sql`true`})
      AND (${contentType === 'post' || contentType === 'project' ? sql`c.contenttype = ${contentType}` : sql`true`})
    ORDER BY c.createdat DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
  const countRows = await sql`
    SELECT count(*)::int AS count
    FROM comments c
    WHERE (${q ? sql`c.text ILIKE ${like} ESCAPE '\\'` : sql`true`})
      AND (${contentType === 'post' || contentType === 'project' ? sql`c.contenttype = ${contentType}` : sql`true`})
  `;

  return c.json({
    items: (rows as Record<string, unknown>[]).map((row) => ({
      ...row,
      createdat: Number(row.createdat),
      authorName: (row.profiles as { displayname?: string } | undefined)?.displayname ?? '',
      authorPhoto: (row.profiles as { photourl?: string } | undefined)?.photourl ?? '',
    })),
    total: Number((countRows[0] as { count?: number } | undefined)?.count ?? 0),
  });
});

app.delete('/api/admin/comments/:id', authMiddleware, adminMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Bad request' }, 400);

  const rows = await sql`
    SELECT contentid, contenttype
    FROM comments
    WHERE id = ${id}
    LIMIT 1
  `;
  const deleted = rows[0] as { contentid?: string; contenttype?: 'post' | 'project' } | undefined;
  if (!deleted?.contentid || !deleted.contenttype) return c.json({ error: 'Not found' }, 404);
  await sql`DELETE FROM comments WHERE id = ${id}`;

  if (deleted.contenttype === 'post') {
    await sql`
      UPDATE posts
      SET commentcount = (SELECT count(*)::int FROM comments WHERE contenttype = 'post' AND contentid = ${deleted.contentid})
      WHERE id = ${deleted.contentid}
    `;
  } else {
    await sql`
      UPDATE projects
      SET commentcount = (SELECT count(*)::int FROM comments WHERE contenttype = 'project' AND contentid = ${deleted.contentid})
      WHERE id = ${deleted.contentid}
    `;
  }
  return c.json({ ok: true });
});

app.get('/api/admin/settings', authMiddleware, adminMiddleware, async (c) => {
  await syncEnvConfigDefaultsToDatabase();
  const rows = await sql`
    SELECT key, value, updatedat, updatedby
    FROM site_settings
    WHERE key = ANY(${sql.array([...runtimeConfigKeys])})
    ORDER BY key ASC
  `;
  return c.json((rows as unknown as SiteSettingRow[]).map(toSiteSetting));
});

app.put('/api/admin/settings/:key', authMiddleware, adminMiddleware, async (c) => {
  const user = c.get('user');
  const key = c.req.param('key');
  if (!key || !/^[a-z0-9_.:-]{1,80}$/i.test(key)) {
    return c.json({ error: 'Invalid setting key' }, 400);
  }
  if (isEnvOnlyConfigKey(key)) {
    return c.json({ error: 'This setting must be configured with environment variables' }, 400);
  }
  if (!isRuntimeConfigKey(key) || !editableRuntimeConfigKeys.has(key)) {
    return c.json({ error: 'Unsupported setting key' }, 400);
  }

  const body = await c.req.json<{ value?: unknown }>();
  if (body.value === undefined) {
    return c.json({ error: 'value required' }, 400);
  }
  const normalizedValue = normalizeRuntimeConfigValue(body.value);

  await sql`
    INSERT INTO site_settings (key, value, updatedat, updatedby)
    VALUES (${key}, ${JSON.stringify(normalizedValue)}::jsonb, ${Date.now()}, ${user.sub})
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updatedat = EXCLUDED.updatedat,
      updatedby = EXCLUDED.updatedby
  `;
  const [row] = await sql`
    SELECT key, value, updatedat, updatedby
    FROM site_settings
    WHERE key = ${key}
    LIMIT 1
  `;
  if (schedulerSettingKeys.has(key)) {
    refreshCountReconcileScheduler();
  }
  return c.json(toSiteSetting(row as SiteSettingRow));
});

app.delete('/api/admin/settings/:key', authMiddleware, adminMiddleware, async (c) => {
  const key = c.req.param('key');
  if (!key) return c.json({ error: 'Bad request' }, 400);
  if (isEnvOnlyConfigKey(key)) {
    return c.json({ error: 'This setting must be configured with environment variables' }, 400);
  }
  await sql`DELETE FROM site_settings WHERE key = ${key}`;
  await syncEnvConfigDefaultsToDatabase();
  if (schedulerSettingKeys.has(key)) {
    refreshCountReconcileScheduler();
  }
  return c.json({ ok: true });
});

// ---------- feeds ----------
app.get('/api/feeds', async (c) => {
  const showAll = c.req.query('showAll') === 'true' || c.req.query('showAll') === '1';
  const authorId = c.req.query('authorId')?.trim() ?? '';
  const requestedType = c.req.query('type');
  const feedType: FeedType = requestedType === 'post' || requestedType === 'project' ? requestedType : 'all';
  const limit = parseOptionalLimit(c.req.query('limit'), 20, 50);
  const cursor = decodePageCursor(c.req.query('cursor'));

  if (authorId && !UUID_RE.test(authorId)) {
    return c.json({ error: 'invalid authorId' }, 400);
  }

  const queryLimit = limit === null ? null : limit + 1;
  const cursorRank = cursorTypeRank(cursor?.type);
  let rows: Array<Record<string, unknown> & { type: ContentType; fileattachments?: unknown }>;

  if (feedType === 'post') {
    rows = (await sql`
      SELECT p.*,
        json_build_object(
          'displayname', pr.displayname,
          'photourl', pr.photourl
        ) AS profiles,
        'post' AS type
      FROM posts p
      LEFT JOIN profiles pr ON pr.id = p.authorid
      WHERE (${showAll ? sql`true` : sql`p.isrecommended = true`})
        AND (${authorId ? sql`p.authorid = ${authorId}` : sql`true`})
        AND (${cursor ? sql`p.createdat < ${cursor.createdat} OR (p.createdat = ${cursor.createdat} AND p.id < ${cursor.id})` : sql`true`})
      ORDER BY p.createdat DESC, p.id DESC
      ${queryLimit === null ? sql`` : sql`LIMIT ${queryLimit}`}
    `) as unknown as Array<Record<string, unknown> & { type: ContentType; fileattachments?: unknown }>;
  } else if (feedType === 'project') {
    rows = (await sql`
      SELECT p.*,
        json_build_object(
          'displayname', pr.displayname,
          'photourl', pr.photourl
        ) AS profiles,
        'project' AS type
      FROM projects p
      LEFT JOIN profiles pr ON pr.id = p.authorid
      WHERE (${showAll ? sql`true` : sql`p.isrecommended = true`})
        AND (${authorId ? sql`p.authorid = ${authorId}` : sql`true`})
        AND (${cursor ? sql`p.createdat < ${cursor.createdat} OR (p.createdat = ${cursor.createdat} AND p.id < ${cursor.id})` : sql`true`})
      ORDER BY p.createdat DESC, p.id DESC
      ${queryLimit === null ? sql`` : sql`LIMIT ${queryLimit}`}
    `) as unknown as Array<Record<string, unknown> & { type: ContentType; fileattachments?: unknown }>;
  } else {
    rows = (await sql`
      WITH feed_posts AS (
        SELECT
          p.id::text AS id,
          p.authorid,
          p.createdat,
          p.likecount,
          p.commentcount,
          p.isrecommended,
          p.content,
          p.images,
          NULL AS title,
          NULL AS summary,
          NULL AS coverurl,
          NULL AS attachments,
          'post' AS type,
          3 AS typerank,
          json_build_object(
            'displayname', pr.displayname,
            'photourl', pr.photourl
          ) AS profiles
        FROM posts p
        LEFT JOIN profiles pr ON pr.id = p.authorid
        WHERE (${showAll ? sql`true` : sql`p.isrecommended = true`})
          AND (${authorId ? sql`p.authorid = ${authorId}` : sql`true`})
          AND (${cursor ? sql`
            p.createdat < ${cursor.createdat}
            OR (p.createdat = ${cursor.createdat} AND p.id < ${cursor.id})
            OR (p.createdat = ${cursor.createdat} AND p.id = ${cursor.id} AND 3 < ${cursorRank})
          ` : sql`true`})
        ${queryLimit === null ? sql`` : sql`ORDER BY p.createdat DESC, p.id DESC LIMIT ${queryLimit}`}
      ),
      feed_projects AS (
        SELECT
          p.id::text AS id,
          p.authorid,
          p.createdat,
          p.likecount,
          p.commentcount,
          p.isrecommended,
          p.content,
          NULL AS images,
          p.title,
          p.summary,
          p.coverurl,
          p.attachments,
          'project' AS type,
          2 AS typerank,
          json_build_object(
            'displayname', pr.displayname,
            'photourl', pr.photourl
          ) AS profiles
        FROM projects p
        LEFT JOIN profiles pr ON pr.id = p.authorid
        WHERE (${showAll ? sql`true` : sql`p.isrecommended = true`})
          AND (${authorId ? sql`p.authorid = ${authorId}` : sql`true`})
          AND (${cursor ? sql`
            p.createdat < ${cursor.createdat}
            OR (p.createdat = ${cursor.createdat} AND p.id < ${cursor.id})
            OR (p.createdat = ${cursor.createdat} AND p.id = ${cursor.id} AND 2 < ${cursorRank})
          ` : sql`true`})
        ${queryLimit === null ? sql`` : sql`ORDER BY p.createdat DESC, p.id DESC LIMIT ${queryLimit}`}
      )
      SELECT *
      FROM (
        SELECT * FROM feed_posts
        UNION ALL
        SELECT * FROM feed_projects
      ) feed
      ORDER BY feed.createdat DESC, feed.id DESC, feed.typerank DESC
      ${queryLimit === null ? sql`` : sql`LIMIT ${queryLimit}`}
    `) as unknown as Array<Record<string, unknown> & { type: ContentType; fileattachments?: unknown }>;
  }

  const page = limit === null ? null : toPaginatedResponse(rows, limit);
  const items = page?.items ?? rows;
  await attachCurrentPageAssets(items);
  for (const item of items) {
    delete item.typerank;
  }

  return c.json(page ? { ...page, items } : items);
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
  return c.json({
    ...(row as Record<string, unknown>),
    fileattachments: await getContentAttachmentAssets('post', id),
  });
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
  return c.json({
    ...(row as Record<string, unknown>),
    fileattachments: await getContentAttachmentAssets('project', id),
  });
});

// ---------- users ----------
app.get('/api/users', async (c) => {
  const rows = (await sql`SELECT id, displayname, photourl, role FROM profiles`) as unknown as {
    id: string;
    displayname: string;
    photourl: string;
    role: string;
  }[];
  return c.json(
    rows.map((u) => ({
      uid: u.id,
      displayname: u.displayname,
      photourl: u.photourl,
      role: u.role,
    }))
  );
});

// ---------- search ----------
app.get('/api/search', async (c) => {
  const q = c.req.query('q')?.trim() ?? '';
  const requestedType = c.req.query('type');
  const searchType: SearchType = requestedType === 'user' || requestedType === 'post' || requestedType === 'project' ? requestedType : 'all';
  const limit = parsePositiveInt(c.req.query('limit'), 20, 50);
  const cursor = decodePageCursor(c.req.query('cursor'));
  if (!q) return c.json(emptyPaginatedResponse<Record<string, unknown>>());

  const like = normalizeSearch(q);
  const queryLimit = limit + 1;
  const cursorRank = cursorTypeRank(cursor?.type);
  let rows: Array<Record<string, unknown> & { type: 'user' | ContentType; fileattachments?: unknown }>;

  if (searchType === 'user') {
    rows = (await sql`
      SELECT
        pr.id,
        pr.id AS uid,
        pr.createdat,
        pr.displayname,
        pr.photourl,
        pr.role,
        'user' AS type
      FROM profiles pr
      WHERE pr.displayname ILIKE ${like} ESCAPE '\\'
        AND (${cursor ? sql`pr.createdat < ${cursor.createdat} OR (pr.createdat = ${cursor.createdat} AND pr.id < ${cursor.id})` : sql`true`})
      ORDER BY pr.createdat DESC, pr.id DESC
      LIMIT ${queryLimit}
    `) as unknown as Array<Record<string, unknown> & { type: 'user' | ContentType; fileattachments?: unknown }>;
  } else if (searchType === 'post') {
    rows = (await sql`
      SELECT p.*,
        json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles,
        'post' AS type
      FROM posts p
      LEFT JOIN profiles pr ON pr.id = p.authorid
      WHERE (p.content ILIKE ${like} ESCAPE '\\' OR pr.displayname ILIKE ${like} ESCAPE '\\')
        AND (${cursor ? sql`p.createdat < ${cursor.createdat} OR (p.createdat = ${cursor.createdat} AND p.id < ${cursor.id})` : sql`true`})
      ORDER BY p.createdat DESC, p.id DESC
      LIMIT ${queryLimit}
    `) as unknown as Array<Record<string, unknown> & { type: 'user' | ContentType; fileattachments?: unknown }>;
  } else if (searchType === 'project') {
    rows = (await sql`
      SELECT p.*,
        json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles,
        'project' AS type
      FROM projects p
      LEFT JOIN profiles pr ON pr.id = p.authorid
      WHERE (p.title ILIKE ${like} ESCAPE '\\' OR p.summary ILIKE ${like} ESCAPE '\\' OR p.content ILIKE ${like} ESCAPE '\\' OR pr.displayname ILIKE ${like} ESCAPE '\\')
        AND (${cursor ? sql`p.createdat < ${cursor.createdat} OR (p.createdat = ${cursor.createdat} AND p.id < ${cursor.id})` : sql`true`})
      ORDER BY p.createdat DESC, p.id DESC
      LIMIT ${queryLimit}
    `) as unknown as Array<Record<string, unknown> & { type: 'user' | ContentType; fileattachments?: unknown }>;
  } else {
    rows = (await sql`
      WITH search_users AS (
        SELECT
          pr.id::text AS id,
          pr.id::text AS uid,
          pr.createdat,
          pr.displayname,
          pr.photourl,
          pr.role,
          NULL AS authorid,
          NULL AS likecount,
          NULL AS commentcount,
          NULL AS isrecommended,
          NULL AS content,
          NULL AS images,
          NULL AS title,
          NULL AS summary,
          NULL AS coverurl,
          NULL AS attachments,
          'user' AS type,
          1 AS typerank,
          NULL AS profiles
        FROM profiles pr
        WHERE pr.displayname ILIKE ${like} ESCAPE '\\'
          AND (${cursor ? sql`
            pr.createdat < ${cursor.createdat}
            OR (pr.createdat = ${cursor.createdat} AND pr.id < ${cursor.id})
            OR (pr.createdat = ${cursor.createdat} AND pr.id = ${cursor.id} AND 1 < ${cursorRank})
          ` : sql`true`})
        ORDER BY pr.createdat DESC, pr.id DESC
        LIMIT ${queryLimit}
      ),
      search_posts AS (
        SELECT
          p.id::text AS id,
          NULL AS uid,
          p.createdat,
          NULL AS displayname,
          NULL AS photourl,
          NULL AS role,
          p.authorid,
          p.likecount,
          p.commentcount,
          p.isrecommended,
          p.content,
          p.images,
          NULL AS title,
          NULL AS summary,
          NULL AS coverurl,
          NULL AS attachments,
          'post' AS type,
          3 AS typerank,
          json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
        FROM posts p
        LEFT JOIN profiles pr ON pr.id = p.authorid
        WHERE (p.content ILIKE ${like} ESCAPE '\\' OR pr.displayname ILIKE ${like} ESCAPE '\\')
          AND (${cursor ? sql`
            p.createdat < ${cursor.createdat}
            OR (p.createdat = ${cursor.createdat} AND p.id < ${cursor.id})
            OR (p.createdat = ${cursor.createdat} AND p.id = ${cursor.id} AND 3 < ${cursorRank})
          ` : sql`true`})
        ORDER BY p.createdat DESC, p.id DESC
        LIMIT ${queryLimit}
      ),
      search_projects AS (
        SELECT
          p.id::text AS id,
          NULL AS uid,
          p.createdat,
          NULL AS displayname,
          NULL AS photourl,
          NULL AS role,
          p.authorid,
          p.likecount,
          p.commentcount,
          p.isrecommended,
          p.content,
          NULL AS images,
          p.title,
          p.summary,
          p.coverurl,
          p.attachments,
          'project' AS type,
          2 AS typerank,
          json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
        FROM projects p
        LEFT JOIN profiles pr ON pr.id = p.authorid
        WHERE (p.title ILIKE ${like} ESCAPE '\\' OR p.summary ILIKE ${like} ESCAPE '\\' OR p.content ILIKE ${like} ESCAPE '\\' OR pr.displayname ILIKE ${like} ESCAPE '\\')
          AND (${cursor ? sql`
            p.createdat < ${cursor.createdat}
            OR (p.createdat = ${cursor.createdat} AND p.id < ${cursor.id})
            OR (p.createdat = ${cursor.createdat} AND p.id = ${cursor.id} AND 2 < ${cursorRank})
          ` : sql`true`})
        ORDER BY p.createdat DESC, p.id DESC
        LIMIT ${queryLimit}
      )
      SELECT *
      FROM (
        SELECT * FROM search_users
        UNION ALL
        SELECT * FROM search_posts
        UNION ALL
        SELECT * FROM search_projects
      ) search
      ORDER BY search.createdat DESC, search.id DESC, search.typerank DESC
      LIMIT ${queryLimit}
    `) as unknown as Array<Record<string, unknown> & { type: 'user' | ContentType; fileattachments?: unknown }>;
  }

  const page = toPaginatedResponse(rows, limit);
  await attachCurrentPageAssets(page.items);
  for (const item of page.items) {
    delete item.typerank;
  }

  return c.json(page);
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

// ---------- file library ----------
app.get('/api/files/folders', authMiddleware, async (c) => {
  const user = c.get('user');
  const isAdmin = (await getActorRole(user.sub)) === 'admin';
  const showAll = isAdmin && (c.req.query('all') === 'true' || c.req.query('all') === '1');
  const rows = showAll
    ? await sql`SELECT * FROM file_folders ORDER BY createdat ASC`
    : await sql`SELECT * FROM file_folders WHERE ownerid = ${user.sub} ORDER BY createdat ASC`;
  return c.json((rows as unknown as FileFolderRow[]).map(toFileFolder));
});

app.post('/api/files/folders', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ name?: string; parentid?: string | null }>();
  const name = cleanFileName(body.name, '新建文件夹');
  const parentid = body.parentid ? String(body.parentid).trim() : null;
  const isAdmin = (await getActorRole(user.sub)) === 'admin';
  try {
    await assertFolderWritable(parentid, user.sub, isAdmin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'folder invalid';
    return c.json({ error: msg }, msg.includes('forbidden') ? 403 : 400);
  }
  const now = Date.now();
  const id = crypto.randomUUID();
  await sql`
    INSERT INTO file_folders (id, ownerid, parentid, name, createdat, updatedat)
    VALUES (${id}, ${user.sub}, ${parentid}, ${name}, ${now}, ${now})
  `;
  const [row] = await sql`SELECT * FROM file_folders WHERE id = ${id} LIMIT 1`;
  return c.json(toFileFolder(row as FileFolderRow));
});

app.patch('/api/files/folders/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return c.json({ error: 'invalid id' }, 400);
  const body = await c.req.json<{ name?: string; parentid?: string | null }>();
  const folderRows = await sql`SELECT * FROM file_folders WHERE id = ${id} LIMIT 1`;
  const folder = folderRows[0] as FileFolderRow | undefined;
  if (!folder) return c.json({ error: 'Not found' }, 404);
  const isAdmin = (await getActorRole(user.sub)) === 'admin';
  if (!isAdmin && folder.ownerid !== user.sub) return c.json({ error: 'Forbidden' }, 403);

  const nextName = body.name !== undefined ? cleanFileName(body.name, folder.name) : folder.name;
  const nextParent = body.parentid !== undefined ? (body.parentid ? String(body.parentid).trim() : null) : folder.parentid ?? null;
  if (nextParent === id) return c.json({ error: 'folder cannot be its own parent' }, 400);
  try {
    await assertFolderWritable(nextParent, folder.ownerid, isAdmin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'folder invalid';
    return c.json({ error: msg }, msg.includes('forbidden') ? 403 : 400);
  }

  await sql`
    UPDATE file_folders
    SET name = ${nextName}, parentid = ${nextParent}, updatedat = ${Date.now()}
    WHERE id = ${id}
  `;
  const [row] = await sql`SELECT * FROM file_folders WHERE id = ${id} LIMIT 1`;
  return c.json(toFileFolder(row as FileFolderRow));
});

app.delete('/api/files/folders/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return c.json({ error: 'invalid id' }, 400);
  const folderRows = await sql`SELECT ownerid FROM file_folders WHERE id = ${id} LIMIT 1`;
  const folder = folderRows[0] as { ownerid: string } | undefined;
  if (!folder) return c.json({ error: 'Not found' }, 404);
  const isAdmin = (await getActorRole(user.sub)) === 'admin';
  if (!isAdmin && folder.ownerid !== user.sub) return c.json({ error: 'Forbidden' }, 403);
  await sql`DELETE FROM file_folders WHERE id = ${id}`;
  return c.json({ ok: true });
});

app.get('/api/files', authMiddleware, async (c) => {
  const user = c.get('user');
  const isAdmin = (await getActorRole(user.sub)) === 'admin';
  const showAll = isAdmin && (c.req.query('all') === 'true' || c.req.query('all') === '1');
  const folderId = c.req.query('folderId');
  const kind = c.req.query('kind');
  const q = c.req.query('q')?.trim();
  const limit = parsePositiveInt(c.req.query('limit'), 80, 200);
  const offset = parseOffset(c.req.query('offset'));
  const kindFilter = kind && ['image', 'audio', 'video', 'document', 'archive', 'file'].includes(kind) ? kind : '';
  const search = normalizeSearch(q);

  const rows = showAll
    ? await sql`
        SELECT fa.*, pr.displayname AS ownername
        FROM file_assets fa
        LEFT JOIN profiles pr ON pr.id = fa.ownerid
        WHERE (${folderId === undefined ? sql`true` : folderId === '' || folderId === 'root' ? sql`fa.folderid IS NULL` : sql`fa.folderid = ${folderId}`})
          AND (${kindFilter ? sql`fa.kind = ${kindFilter}` : sql`true`})
          AND (${q ? sql`(fa.name ILIKE ${search} OR fa.path ILIKE ${search} OR fa.mime ILIKE ${search})` : sql`true`})
        ORDER BY fa.createdat DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT fa.*, pr.displayname AS ownername
        FROM file_assets fa
        LEFT JOIN profiles pr ON pr.id = fa.ownerid
        WHERE fa.ownerid = ${user.sub}
          AND (${folderId === undefined ? sql`true` : folderId === '' || folderId === 'root' ? sql`fa.folderid IS NULL` : sql`fa.folderid = ${folderId}`})
          AND (${kindFilter ? sql`fa.kind = ${kindFilter}` : sql`true`})
          AND (${q ? sql`(fa.name ILIKE ${search} OR fa.path ILIKE ${search} OR fa.mime ILIKE ${search})` : sql`true`})
        ORDER BY fa.createdat DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
  return c.json((rows as unknown as FileAssetRow[]).map(toFileAsset));
});

app.patch('/api/files/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return c.json({ error: 'invalid id' }, 400);
  const body = await c.req.json<{ name?: string; folderid?: string | null }>();
  const assetRows = await sql`SELECT * FROM file_assets WHERE id = ${id} LIMIT 1`;
  const asset = assetRows[0] as FileAssetRow | undefined;
  if (!asset) return c.json({ error: 'Not found' }, 404);
  const isAdmin = (await getActorRole(user.sub)) === 'admin';
  if (!isAdmin && asset.ownerid !== user.sub) return c.json({ error: 'Forbidden' }, 403);

  const nextName = body.name !== undefined ? cleanFileName(body.name, asset.name) : asset.name;
  const nextFolder = body.folderid !== undefined ? (body.folderid ? String(body.folderid).trim() : null) : asset.folderid ?? null;
  try {
    await assertFolderWritable(nextFolder, asset.ownerid, isAdmin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'folder invalid';
    return c.json({ error: msg }, msg.includes('forbidden') ? 403 : 400);
  }

  await sql`
    UPDATE file_assets
    SET name = ${nextName}, folderid = ${nextFolder}, updatedat = ${Date.now()}
    WHERE id = ${id}
  `;
  const [row] = await sql`SELECT * FROM file_assets WHERE id = ${id} LIMIT 1`;
  return c.json(toFileAsset(row as FileAssetRow));
});

app.delete('/api/files/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return c.json({ error: 'invalid id' }, 400);
  const assetRows = await sql`SELECT * FROM file_assets WHERE id = ${id} LIMIT 1`;
  const asset = assetRows[0] as FileAssetRow | undefined;
  if (!asset) return c.json({ error: 'Not found' }, 404);
  const isAdmin = (await getActorRole(user.sub)) === 'admin';
  if (!isAdmin && asset.ownerid !== user.sub) return c.json({ error: 'Forbidden' }, 403);
  try {
    await deleteFilesFromGithub([asset.path]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Delete files failed';
    return c.json({ error: msg }, 500);
  }
  await sql`DELETE FROM file_assets WHERE id = ${id}`;
  return c.json({ ok: true });
});

// ---------- posts CRUD ----------
app.post('/api/posts', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    id?: string;
    content: string;
    images?: string[];
    attachmentIds?: string[];
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

  try {
    await sql.begin(async (tx) => {
      const attachmentIds =
        body.attachmentIds !== undefined
          ? await validateContentAttachmentIds(tx, body.attachmentIds, user.sub, isAdmin)
          : [];
      await tx`
        INSERT INTO posts (id, authorid, createdat, likecount, commentcount, isrecommended, content, images, type)
        VALUES (
          ${id},
          ${user.sub},
          ${createdat},
          0,
          0,
          ${isrecommended},
          ${body.content},
          ${tx.array(imageList)},
          'post'
        )
      `;
      if (body.attachmentIds !== undefined) {
        await writeContentAttachments(tx, 'post', id, attachmentIds);
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'post create failed';
    return c.json({ error: msg }, msg.includes('forbidden') ? 403 : msg.includes('attachment') ? 400 : 500);
  }
  const [row] = await sql`
    SELECT p.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
    FROM posts p
    LEFT JOIN profiles pr ON pr.id = p.authorid
    WHERE p.id = ${id}
    LIMIT 1
  `;
  return c.json({
    ...(row as Record<string, unknown>),
    fileattachments: await getContentAttachmentAssets('post', id),
  });
});

app.patch('/api/posts/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Bad request' }, 400);
  const body = await c.req.json<{
    content?: string;
    images?: string[];
    attachmentIds?: string[];
    isrecommended?: boolean;
  }>();

  const postRows = await sql`SELECT authorid, isrecommended FROM posts WHERE id = ${id} LIMIT 1`;
  const post = postRows[0] as { authorid: string; isrecommended: boolean } | undefined;
  if (!post) return c.json({ error: 'Not found' }, 404);

  const profRows = await sql`SELECT role, displayname FROM profiles WHERE id = ${user.sub} LIMIT 1`;
  const prof = profRows[0] as { role: string; displayname: string } | undefined;
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
  const hasAttachmentIds = body.attachmentIds !== undefined;
  const hasRec = body.isrecommended !== undefined;
  if (!hasContent && !hasImages && !hasAttachmentIds && !hasRec) {
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
  if (hasAttachmentIds) {
    try {
      await syncContentAttachments('post', id, body.attachmentIds, user.sub, isAdmin);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'attachment invalid';
      return c.json({ error: msg }, msg.includes('forbidden') ? 403 : 400);
    }
  }
  if (hasRec && isAdmin) {
    await sql`UPDATE posts SET isrecommended = ${body.isrecommended ?? false} WHERE id = ${id}`;
    if (body.isrecommended === true && !post.isrecommended && post.authorid !== user.sub) {
      await emitNotification({
        toUserId: post.authorid,
        fromUserId: user.sub,
        fromUserName: prof?.displayname ?? '管理员',
        type: 'recommend',
        eventKey: `recommend:post:${id}`,
        commentText: '你的动态已被推荐到首页',
        contentId: id,
        contentType: 'post',
      });
    }
  }

  const [row] = await sql`
    SELECT p.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
    FROM posts p
    LEFT JOIN profiles pr ON pr.id = p.authorid
    WHERE p.id = ${id}
    LIMIT 1
  `;
  return c.json({
    ...(row as Record<string, unknown>),
    fileattachments: await getContentAttachmentAssets('post', id),
  });
});

app.delete('/api/posts/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Bad request' }, 400);
  const body: { deleteFiles?: boolean } = await c.req.json<{ deleteFiles?: boolean }>().catch(() => ({}));
  const postRows = await sql`SELECT authorid, images FROM posts WHERE id = ${id} LIMIT 1`;
  const post = postRows[0] as { authorid: string; images?: string[] | null } | undefined;
  if (!post) return c.json({ error: 'Not found' }, 404);
  const profRows = await sql`SELECT role, displayname FROM profiles WHERE id = ${user.sub} LIMIT 1`;
  const prof = profRows[0] as { role: string; displayname: string } | undefined;
  if (post.authorid !== user.sub && prof?.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  if (body.deleteFiles) {
    try {
      await deleteFilesFromGithub([
        ...(Array.isArray(post.images) ? post.images : []),
        ...(await attachmentPathsForContent('post', id)),
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Delete files failed';
      return c.json({ error: msg }, 500);
    }
  }
  if (prof?.role === 'admin' && post.authorid !== user.sub) {
    await emitNotification({
      toUserId: post.authorid,
      fromUserId: user.sub,
      fromUserName: prof.displayname ?? '管理员',
      type: 'delete',
      eventKey: `delete:post:${id}`,
      commentText: '你的动态已被管理员删除',
      contentId: id,
      contentType: 'post',
    });
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
    attachmentIds?: string[];
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

  try {
    await sql.begin(async (tx) => {
      const attachmentIds =
        body.attachmentIds !== undefined
          ? await validateContentAttachmentIds(tx, body.attachmentIds, user.sub, isAdmin)
          : [];
      await tx`
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
          ${tx.array(attachmentList)},
          'project'
        )
      `;
      if (body.attachmentIds !== undefined) {
        await writeContentAttachments(tx, 'project', id, attachmentIds);
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'project create failed';
    return c.json({ error: msg }, msg.includes('forbidden') ? 403 : msg.includes('attachment') ? 400 : 500);
  }
  const [row] = await sql`
    SELECT p.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
    FROM projects p
    LEFT JOIN profiles pr ON pr.id = p.authorid
    WHERE p.id = ${id}
    LIMIT 1
  `;
  return c.json({
    ...(row as Record<string, unknown>),
    fileattachments: await getContentAttachmentAssets('project', id),
  });
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
    attachmentIds?: string[];
    isrecommended?: boolean;
  }>();

  const projRows = await sql`SELECT authorid, isrecommended FROM projects WHERE id = ${id} LIMIT 1`;
  const proj = projRows[0] as { authorid: string; isrecommended: boolean } | undefined;
  if (!proj) return c.json({ error: 'Not found' }, 404);

  const profRows = await sql`SELECT role, displayname FROM profiles WHERE id = ${user.sub} LIMIT 1`;
  const prof = profRows[0] as { role: string; displayname: string } | undefined;
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
  const hasAttachmentIds = body.attachmentIds !== undefined;
  const hasRec = body.isrecommended !== undefined;
  if (!hasTitle && !hasSummary && !hasContent && !hasCover && !hasAtt && !hasAttachmentIds && !hasRec) {
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
  if (hasAttachmentIds) {
    try {
      await syncContentAttachments('project', id, body.attachmentIds, user.sub, isAdmin);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'attachment invalid';
      return c.json({ error: msg }, msg.includes('forbidden') ? 403 : 400);
    }
  }
  if (hasRec && isAdmin) {
    await sql`UPDATE projects SET isrecommended = ${body.isrecommended ?? false} WHERE id = ${id}`;
    if (body.isrecommended === true && !proj.isrecommended && proj.authorid !== user.sub) {
      await emitNotification({
        toUserId: proj.authorid,
        fromUserId: user.sub,
        fromUserName: prof?.displayname ?? '管理员',
        type: 'recommend',
        eventKey: `recommend:project:${id}`,
        commentText: '你的项目已被推荐到首页',
        contentId: id,
        contentType: 'project',
      });
    }
  }

  const [row] = await sql`
    SELECT p.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
    FROM projects p
    LEFT JOIN profiles pr ON pr.id = p.authorid
    WHERE p.id = ${id}
    LIMIT 1
  `;
  return c.json({
    ...(row as Record<string, unknown>),
    fileattachments: await getContentAttachmentAssets('project', id),
  });
});

app.delete('/api/projects/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Bad request' }, 400);
  const body: { deleteFiles?: boolean } = await c.req.json<{ deleteFiles?: boolean }>().catch(() => ({}));
  const projRows = await sql`
    SELECT authorid, coverurl, attachments FROM projects WHERE id = ${id} LIMIT 1
  `;
  const proj = projRows[0] as {
    authorid: string;
    coverurl?: string | null;
    attachments?: string[] | null;
  } | undefined;
  if (!proj) return c.json({ error: 'Not found' }, 404);
  const profRows = await sql`SELECT role, displayname FROM profiles WHERE id = ${user.sub} LIMIT 1`;
  const prof = profRows[0] as { role: string; displayname: string } | undefined;
  if (proj.authorid !== user.sub && prof?.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  if (body.deleteFiles) {
    try {
      await deleteFilesFromGithub([
        proj.coverurl ?? '',
        ...(Array.isArray(proj.attachments) ? proj.attachments : []),
        ...(await attachmentPathsForContent('project', id)),
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Delete files failed';
      return c.json({ error: msg }, 500);
    }
  }
  if (prof?.role === 'admin' && proj.authorid !== user.sub) {
    await emitNotification({
      toUserId: proj.authorid,
      fromUserId: user.sub,
      fromUserName: prof.displayname ?? '管理员',
      type: 'delete',
      eventKey: `delete:project:${id}`,
      commentText: '你的项目已被管理员删除',
      contentId: id,
      contentType: 'project',
    });
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

  const actorRows = await sql`SELECT displayname FROM profiles WHERE id = ${user.sub} LIMIT 1`;
  const actor = actorRows[0] as { displayname: string } | undefined;
  const targetRows =
    table === 'posts'
      ? await sql`SELECT authorid FROM posts WHERE id = ${contentId} LIMIT 1`
      : await sql`SELECT authorid FROM projects WHERE id = ${contentId} LIMIT 1`;
  const target = targetRows[0] as { authorid: string } | undefined;
  if (target?.authorid && target.authorid !== user.sub) {
    await emitNotification({
      toUserId: target.authorid,
      fromUserId: user.sub,
      fromUserName: actor?.displayname ?? '',
      type: 'like',
      eventKey: `like:${contentType}:${contentId}:from:${user.sub}`,
      commentText: contentType === 'post' ? '你的动态收到了一个赞' : '你的项目收到了一个赞',
      contentId,
      contentType,
    });
  }
  return c.json({ liked: true });
});

// ---------- comments ----------
app.get('/api/comments', async (c) => {
  const contentId = c.req.query('contentId');
  const contentType = c.req.query('contentType');
  const limit = parseOptionalLimit(c.req.query('limit'), 20, 50);
  const cursor = decodePageCursor(c.req.query('cursor'));
  if (!contentId || !contentType) return c.json({ error: 'contentId and contentType required' }, 400);

  const queryLimit = limit === null ? null : limit + 1;
  const rows = await sql`
    SELECT c.*,
      json_build_object('displayname', pr.displayname, 'photourl', pr.photourl) AS profiles
    FROM comments c
    LEFT JOIN profiles pr ON pr.id = c.authorid
    WHERE c.contentid = ${contentId} AND c.contenttype = ${contentType}
      AND (${cursor ? sql`c.createdat < ${cursor.createdat} OR (c.createdat = ${cursor.createdat} AND c.id < ${cursor.id})` : sql`true`})
    ORDER BY c.createdat DESC, c.id DESC
    ${queryLimit === null ? sql`` : sql`LIMIT ${queryLimit}`}
  `;

  const commentRows = rows as Array<Record<string, unknown> & CursorRow>;
  return c.json(limit === null ? commentRows : toPaginatedResponse(commentRows, limit));
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
  const mentionIds = Array.from(
    new Set(
      (body.mentionids ?? [])
        .map((x) => String(x).trim())
        .filter((x) => UUID_RE.test(x))
    )
  );

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
      ${sql.array(mentionIds)}::uuid[]
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

  const actorRows = await sql`SELECT displayname FROM profiles WHERE id = ${user.sub} LIMIT 1`;
  const actor = actorRows[0] as { displayname: string } | undefined;
  const actorName = actor?.displayname ?? '';

  const contentRows =
    tableName === 'posts'
      ? await sql`SELECT authorid FROM posts WHERE id = ${body.contentid} LIMIT 1`
      : await sql`SELECT authorid FROM projects WHERE id = ${body.contentid} LIMIT 1`;
  const content = contentRows[0] as { authorid: string } | undefined;

  if (body.parentid) {
    const parentRows = await sql`SELECT authorid FROM comments WHERE id = ${body.parentid} LIMIT 1`;
    const parent = parentRows[0] as { authorid: string } | undefined;
    if (parent?.authorid && parent.authorid !== user.sub) {
      await emitNotification({
        toUserId: parent.authorid,
        fromUserId: user.sub,
        fromUserName: actorName,
        type: 'reply',
        eventKey: `reply:${id}:to:${parent.authorid}`,
        commentText: body.text,
        contentId: body.contentid,
        contentType: body.contenttype,
        payload: { parentId: body.parentid },
      });
    }
  } else if (content?.authorid && content.authorid !== user.sub) {
    await emitNotification({
      toUserId: content.authorid,
      fromUserId: user.sub,
      fromUserName: actorName,
      type: 'comment',
      eventKey: `comment:${id}:to:${content.authorid}`,
      commentText: body.text,
      contentId: body.contentid,
      contentType: body.contenttype,
    });
  }

  for (const mentionedUserId of mentionIds) {
    if (mentionedUserId === user.sub) continue;
    await emitNotification({
      toUserId: mentionedUserId,
      fromUserId: user.sub,
      fromUserName: actorName,
      type: 'mention',
      eventKey: `mention:${id}:to:${mentionedUserId}`,
      commentText: body.text,
      contentId: body.contentid,
      contentType: body.contenttype,
    });
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
  const isalert = r.isalert ?? r.isAlert;
  const created = r.createdat ?? r.createdAt;
  return {
    id: r.id,
    isRead: !!isread,
    isAlert: !!isalert,
    fromUserName: String(r.fromusername ?? r.fromUserName ?? r.from_user_name ?? ''),
    commentText: String(r.commenttext ?? r.commentText ?? r.text ?? ''),
    contentType: r.contenttype ?? r.contentType,
    contentId: r.contentid ?? r.contentId,
    type: r.type,
    eventKey: String(r.eventkey ?? r.eventKey ?? ''),
    payload: (r.payload ?? {}) as Record<string, unknown>,
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
    const mime = file.type || 'application/octet-stream';
    const name = cleanFileName(file.name || 'file');
    const result = await uploadBufferToGithubWithMeta(buf, scope, contentId, name, mime);
    if (scope !== 'profile') {
      const now = Date.now();
      const ext = normalizeExtFromName(name || result.path);
      await sql`
        INSERT INTO file_assets (id, ownerid, folderid, path, url, name, mime, size, ext, kind, checksum, createdat, updatedat)
        VALUES (
          ${crypto.randomUUID()},
          ${user.sub},
          NULL,
          ${result.path},
          '',
          ${name},
          ${mime},
          ${file.size},
          ${ext},
          ${normalizeFileKind(undefined, mime, name)},
          ${result.checksum},
          ${now},
          ${now}
        )
        ON CONFLICT (ownerid, path) DO UPDATE SET
          name = EXCLUDED.name,
          mime = EXCLUDED.mime,
          size = EXCLUDED.size,
          ext = EXCLUDED.ext,
          kind = EXCLUDED.kind,
          checksum = EXCLUDED.checksum,
          updatedat = EXCLUDED.updatedat
      `;
    }
    return c.json({ path: result.path });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upload failed';
    return c.json({ error: msg }, 500);
  }
});

app.post('/api/files/upload', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.parseBody();
  const file = body['file'];
  const folderIdRaw = body['folderId'] === undefined ? null : String(body['folderId']).trim();

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'file required' }, 400);
  }

  const folderid = folderIdRaw && folderIdRaw !== 'root' ? folderIdRaw : null;
  const isAdmin = (await getActorRole(user.sub)) === 'admin';
  try {
    await assertFolderWritable(folderid, user.sub, isAdmin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'folder invalid';
    return c.json({ error: msg }, msg.includes('forbidden') ? 403 : 400);
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const name = cleanFileName(file.name || 'file');
  const mime = file.type || 'application/octet-stream';
  try {
    const result = await uploadBufferToGithubWithMeta(buf, 'file', user.sub, name, mime);
    const now = Date.now();
    const ext = normalizeExtFromName(name || result.path);
    const assetId = crypto.randomUUID();
    await sql`
      INSERT INTO file_assets (id, ownerid, folderid, path, url, name, mime, size, ext, kind, checksum, createdat, updatedat)
      VALUES (
        ${assetId},
        ${user.sub},
        ${folderid},
        ${result.path},
        '',
        ${name},
        ${mime},
        ${file.size},
        ${ext},
        ${normalizeFileKind(undefined, mime, name)},
        ${result.checksum},
        ${now},
        ${now}
      )
      ON CONFLICT (ownerid, path) DO UPDATE SET
        folderid = EXCLUDED.folderid,
        name = EXCLUDED.name,
        mime = EXCLUDED.mime,
        size = EXCLUDED.size,
        ext = EXCLUDED.ext,
        kind = EXCLUDED.kind,
        checksum = EXCLUDED.checksum,
        updatedat = EXCLUDED.updatedat
    `;
    const [row] = await sql`
      SELECT * FROM file_assets
      WHERE ownerid = ${user.sub} AND path = ${result.path}
      LIMIT 1
    `;
    return c.json(toFileAsset(row as FileAssetRow));
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
  if (databaseProvider === 'lsqlite') {
    console.log('[server] Lsqlite 不支持 PostgreSQL LISTEN，已跳过 app_events 监听');
    return;
  }
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

const syncedConfigCount = await syncEnvConfigDefaultsToDatabase().catch((err) => {
  console.warn('[config] failed to sync environment defaults to database:', err);
  return 0;
});
if (syncedConfigCount > 0) {
  console.log(`[config] synced ${syncedConfigCount} missing config item(s) from environment`);
}

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] http://localhost:${info.port}`);
  console.log(`[db] connection provider: ${databaseProvider}`);
  console.log(`[db] connection pool max: ${databaseMaxConnections}${databaseProvider === 'postgres' ? ' (+1 LISTEN)' : ''}`);
  void startListen();
  startCountReconcileScheduler(sql);
});

async function shutdown() {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabaseConnections();
}

process.once('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});

process.once('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});
