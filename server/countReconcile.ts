import type postgres from 'postgres';

/** 用 likes / comments 真实行数重写 posts、projects 上的 likecount、commentcount（纠偏增量更新带来的漂移）。 */
export async function reconcileEngagementCounts(sql: postgres.Sql): Promise<{
  postsUpdated: number;
  projectsUpdated: number;
}> {
  return await sql.begin(async (tx) => {
    const postsResult = await tx`
      UPDATE public.posts AS p
      SET
        likecount = (SELECT COUNT(*)::int FROM public.likes l WHERE l.contenttype = 'post' AND l.contentid = p.id),
        commentcount = (SELECT COUNT(*)::int FROM public.comments c WHERE c.contenttype = 'post' AND c.contentid = p.id)
    `;
    const projectsResult = await tx`
      UPDATE public.projects AS pr
      SET
        likecount = (SELECT COUNT(*)::int FROM public.likes l WHERE l.contenttype = 'project' AND l.contentid = pr.id),
        commentcount = (SELECT COUNT(*)::int FROM public.comments c WHERE c.contenttype = 'project' AND c.contentid = pr.id)
    `;
    const postsUpdated = postsResult.count;
    const projectsUpdated = projectsResult.count;
    return { postsUpdated, projectsUpdated };
  });
}

const DEFAULT_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2小时

/** 启动后尽快跑一轮，之后按间隔定时执行。 */
export function startCountReconcileScheduler(sql: postgres.Sql): void {
  if (process.env.SKIP_COUNT_RECONCILE === '1' || process.env.SKIP_COUNT_RECONCILE === 'true') {
    console.warn('[scheduler] 已跳过点赞/评论计数校验（SKIP_COUNT_RECONCILE）');
    return;
  }

  const raw = process.env.COUNT_RECONCILE_INTERVAL_MS;
  const intervalMs =
    raw !== undefined && raw !== '' ? Number(raw) : DEFAULT_INTERVAL_MS;
  if (!Number.isFinite(intervalMs) || intervalMs < 60_000) {
    console.warn(
      '[scheduler] COUNT_RECONCILE_INTERVAL_MS 无效或小于 60s，已使用默认 2 小时'
    );
  }
  const ms =
    Number.isFinite(intervalMs) && intervalMs >= 60_000 ? intervalMs : DEFAULT_INTERVAL_MS;

  const run = async () => {
    const t0 = Date.now();
    try {
      console.log('[scheduler] 开始校验并更新点赞/评论计数缓存…');
      const { postsUpdated, projectsUpdated } = await reconcileEngagementCounts(sql);
      const elapsed = Date.now() - t0;
      console.log(
        `[scheduler] 计数校验完成 · posts 更新 ${postsUpdated} 行 · projects 更新 ${projectsUpdated} 行 · ${elapsed}ms`
      );
    } catch (err) {
      console.error('[scheduler] 计数校验失败:', err);
    }
  };

  void run();
  setInterval(() => void run(), ms);
  console.log(`[scheduler] 已启动定时计数校验，间隔 ${Math.round(ms / 1000 / 60)} 分钟`);
}
