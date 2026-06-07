import type postgres from 'postgres';
import { getRuntimeConfigBool, getRuntimeConfigNumber } from './runtimeConfig.js';

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

const DEFAULT_INTERVAL_MS = 2 * 60 * 60 * 1000;

let schedulerSql: postgres.Sql | null = null;
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let schedulerGeneration = 0;
let runInFlight: Promise<void> | null = null;

async function readInterval() {
  const intervalMs = await getRuntimeConfigNumber(
    'COUNT_RECONCILE_INTERVAL_MS',
    DEFAULT_INTERVAL_MS
  );
  if (!Number.isFinite(intervalMs) || intervalMs < 60_000) {
    console.warn(
      '[scheduler] COUNT_RECONCILE_INTERVAL_MS is invalid or below 60s; using 2h default'
    );
    return DEFAULT_INTERVAL_MS;
  }
  return intervalMs;
}

async function runIfEnabled(sql: postgres.Sql) {
  const skip = await getRuntimeConfigBool('SKIP_COUNT_RECONCILE', false);
  if (skip) {
    console.warn('[scheduler] skipped engagement count reconcile');
    return;
  }

  const t0 = Date.now();
  try {
    console.log('[scheduler] reconciling engagement counts...');
    const { postsUpdated, projectsUpdated } = await reconcileEngagementCounts(sql);
    const elapsed = Date.now() - t0;
    console.log(
      `[scheduler] reconcile complete - posts ${postsUpdated} rows - projects ${projectsUpdated} rows - ${elapsed}ms`
    );
  } catch (err) {
    console.error('[scheduler] reconcile failed:', err);
  }
}

function clearSchedulerTimer() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
}

async function scheduleNext(generation: number) {
  if (!schedulerSql || generation !== schedulerGeneration) return;
  const ms = await readInterval();
  if (generation !== schedulerGeneration) return;
  schedulerTimer = setTimeout(() => {
    void runNowAndSchedule(generation);
  }, ms);
}

async function runNowAndSchedule(generation: number) {
  if (!schedulerSql || generation !== schedulerGeneration) return;
  if (!runInFlight) {
    runInFlight = runIfEnabled(schedulerSql).finally(() => {
      runInFlight = null;
    });
  }
  await runInFlight;
  await scheduleNext(generation);
}

export function refreshCountReconcileScheduler(): void {
  if (!schedulerSql) return;
  schedulerGeneration += 1;
  const generation = schedulerGeneration;
  clearSchedulerTimer();
  void runNowAndSchedule(generation);
}

export function startCountReconcileScheduler(sql: postgres.Sql): void {
  schedulerSql = sql;
  console.log('[scheduler] dynamic engagement count scheduler started');
  refreshCountReconcileScheduler();
}
