import 'dotenv/config';
import { sql } from '../server/db.js';
import { isPushEnabled, sendWebPush } from '../server/push.js';

type NotifyType = 'recommend' | 'like' | 'comment' | 'reply' | 'delete' | 'mention';

function parseArg(name: string, fallback = '') {
  const prefix = `--${name}=`;
  const hit = process.argv.find((x) => x.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);

  const snakeName = name
    .replace(/[A-Z]/g, (s) => `_${s.toLowerCase()}`)
    .replace(/-/g, '_')
    .toLowerCase();
  const kebabName = name
    .replace(/[A-Z]/g, (s) => `-${s.toLowerCase()}`)
    .toLowerCase();
  const envValue =
    process.env[`npm_config_${snakeName}`] ??
    process.env[`npm_config_${kebabName.replace(/-/g, '_')}`];
  return envValue ?? fallback;
}

async function main() {
  const toUserId = parseArg('toUserId') || parseArg('to');
  if (!toUserId) {
    throw new Error('缺少参数 --toUserId=<user-id>（兼容 --to=<user-id>）');
  }

  const type = (parseArg('type', 'mention') as NotifyType) ?? 'mention';
  const fromUserId = parseArg('fromUserId') || toUserId;
  const fromUserName = parseArg('from', '测试系统');
  const commentText = parseArg('text', '这是一条测试通知');
  const contentId = parseArg('contentId', crypto.randomUUID());
  const contentTypeRaw = parseArg('contentType', 'post');
  const isAlert = parseArg('isAlert', 'true') !== 'false';
  const sendPush = parseArg('sendPush', 'true') !== 'false';
  const eventKey = parseArg(
    'eventKey',
    `manual-test:${type}:${toUserId}:${Date.now()}`
  );

  const validTypes: NotifyType[] = ['recommend', 'like', 'comment', 'reply', 'delete', 'mention'];
  if (!validTypes.includes(type)) {
    throw new Error(`无效 type: ${type}`);
  }
  const contentType =
    contentTypeRaw === 'post' || contentTypeRaw === 'project' ? contentTypeRaw : 'post';

  const hasFromUserIdRows = await sql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'fromuserid'
    LIMIT 1
  `;
  const hasFromUserId = hasFromUserIdRows.length > 0;

  if (hasFromUserId) {
    await sql`
      INSERT INTO notifications (
        id, touserid, fromuserid, fromusername, commenttext,
        contentid, contenttype, type, isread, createdat,
        eventkey, isalert, payload
      )
      VALUES (
        ${crypto.randomUUID()},
        ${toUserId},
        ${fromUserId},
        ${fromUserName},
        ${commentText},
        ${contentId},
        ${contentType},
        ${type},
        ${!isAlert},
        ${Date.now()},
        ${eventKey},
        ${isAlert},
        ${JSON.stringify({ source: 'manual-script' })}::jsonb
      )
      ON CONFLICT (touserid, type, eventkey)
      WHERE eventkey <> ''
      DO NOTHING
    `;
  } else {
    await sql`
      INSERT INTO notifications (
        id, touserid, fromusername, commenttext,
        contentid, contenttype, type, isread, createdat,
        eventkey, isalert, payload
      )
      VALUES (
        ${crypto.randomUUID()},
        ${toUserId},
        ${fromUserName},
        ${commentText},
        ${contentId},
        ${contentType},
        ${type},
        ${!isAlert},
        ${Date.now()},
        ${eventKey},
        ${isAlert},
        ${JSON.stringify({ source: 'manual-script' })}::jsonb
      )
      ON CONFLICT (touserid, type, eventkey)
      WHERE eventkey <> ''
      DO NOTHING
    `;
  }

  console.log('测试通知写入成功');
  if (sendPush && isAlert && isPushEnabled()) {
    const subs = (await sql`
      SELECT endpoint, p256dh, auth
      FROM push_subscriptions
      WHERE userid = ${toUserId}
    `) as Array<{ endpoint: string; p256dh: string; auth: string }>;
    const invalid = await sendWebPush(subs, {
      title: `${fromUserName} 发送了测试通知`,
      body: commentText,
      url: contentType === 'post' ? `/post/${contentId}` : `/project/${contentId}`,
      tag: `manual-script-${eventKey}`,
    });
    if (invalid.length > 0) {
      await sql`DELETE FROM push_subscriptions WHERE endpoint = ANY(${sql.array(invalid)})`;
    }
    console.log(`Web Push 发送完成，订阅数=${subs.length}，失效订阅=${invalid.length}`);
  } else if (sendPush && !isPushEnabled()) {
    console.log('未发送 Web Push：服务端未配置 VAPID');
  } else if (sendPush && !isAlert) {
    console.log('未发送 Web Push：isAlert=false');
  }

  console.log(
    JSON.stringify(
      {
        toUserId,
        fromUserId,
        type,
        fromUserName,
        commentText,
        contentId,
        contentType,
        isAlert,
        sendPush,
        eventKey,
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error('[testNotification] 失败:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 1 });
  });
