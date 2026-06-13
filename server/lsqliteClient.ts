import { readFile } from 'node:fs/promises';
import type { AppSql, AppSqlArray, AppSqlQuery, QueryRows, SqlFragment } from './dbTypes.js';

type LsqliteQueryMode = 'auto' | 'read' | 'write';

type LsqliteResult = {
  rows?: Record<string, unknown>[];
  rowCount?: number;
  changes?: number;
};

type LsqliteQueryResponse = {
  ok?: boolean;
  error?: { code?: string; message?: string };
  results?: LsqliteResult[];
};

type LsqliteTransactionResponse = LsqliteQueryResponse;

type LsqliteStatement = {
  sql: string;
  params?: unknown[];
  mode?: LsqliteQueryMode;
};

const arrayJsonColumns = new Set(['images', 'attachments', 'mentionids']);
const objectJsonColumns = new Set(['profiles', 'payload']);
const booleanColumns = new Set([
  'isrecommended',
  'isread',
  'isalert',
  'receive_recommend',
  'alert_recommend',
  'receive_like',
  'alert_like',
  'receive_comment',
  'alert_comment',
  'receive_reply',
  'alert_reply',
  'receive_delete',
  'alert_delete',
  'receive_mention',
  'alert_mention',
]);

function asErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function isTemplateStringsArray(value: unknown): value is TemplateStringsArray {
  return Boolean(
    Array.isArray(value) &&
      Array.isArray((value as { raw?: unknown }).raw)
  );
}

function isFragment(value: unknown): value is SqlFragment {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as { __appSqlFragment?: unknown }).__appSqlFragment === true
  );
}

function isSqlArray(value: unknown): value is AppSqlArray {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as { __appSqlArray?: unknown }).__appSqlArray === true
  );
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (
    !(
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
    )
  ) {
    return value;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function normalizeParam(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value;
}

function normalizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const next: Record<string, unknown> = { ...row };
    for (const [key, value] of Object.entries(next)) {
      const normalizedKey = key.toLowerCase();
      if (arrayJsonColumns.has(normalizedKey)) {
        const parsed = parseJson(value);
        next[key] = Array.isArray(parsed) ? parsed : [];
      } else if (objectJsonColumns.has(normalizedKey)) {
        const parsed = parseJson(value);
        next[key] = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } else if (normalizedKey === 'value') {
        next[key] = parseJson(value);
      } else if (booleanColumns.has(normalizedKey)) {
        next[key] = value === true || value === 1 || value === '1' || value === 'true';
      }
    }
    return next;
  });
}

function createRows(result?: LsqliteResult): QueryRows {
  const rows = normalizeRows(result?.rows ?? []) as QueryRows;
  Object.defineProperty(rows, 'count', {
    value: Number(result?.changes ?? result?.rowCount ?? rows.length ?? 0),
    enumerable: false,
    configurable: true,
  });
  return rows;
}

function stripPgCasts(sql: string): string {
  return sql.replace(/::\s*[a-zA-Z_][a-zA-Z0-9_]*(?:\[\])?/g, '');
}

function normalizeSqlText(sql: string): string {
  let next = sql;
  next = next.replace(/\bpublic\./gi, '');
  next = next.replace(/\bILIKE\b/g, 'LIKE');
  next = next.replace(/\bjson_build_object\s*\(/gi, 'json_object(');
  next = next.replace(/substring\(([^()]+?)\s+from\s+(\d+)\s+for\s+(\d+)\)/gi, 'substr($1, $2, $3)');
  next = stripPgCasts(next);
  next = next.replace(/=\s*ANY\s*\(([^)]*)\)/gi, 'IN ($1)');
  next = next.replace(/<>\s*ANY\s*\(([^)]*)\)/gi, 'NOT IN ($1)');
  next = next.replace(/\bTRUE\b/g, '1');
  next = next.replace(/\bFALSE\b/g, '0');
  next = next.replace(/\btrue\b/g, '1');
  next = next.replace(/\bfalse\b/g, '0');
  return next.trim();
}

function inferMode(sql: string): LsqliteQueryMode {
  const head = sql.trimStart().split(/\s+/, 1)[0]?.toLowerCase() ?? '';
  if (['select', 'pragma', 'with'].includes(head)) return 'read';
  return 'write';
}

function render(strings: TemplateStringsArray, values: unknown[]): SqlFragment {
  let text = '';
  const params: unknown[] = [];

  for (let index = 0; index < values.length; index += 1) {
    text += strings[index] ?? '';
    const value = values[index];

    if (isFragment(value)) {
      text += value.text;
      params.push(...value.params);
      continue;
    }

    if (isSqlArray(value)) {
      const previous = strings[index] ?? '';
      const next = strings[index + 1] ?? '';
      const useList = /ANY\s*\(\s*$/i.test(previous) || /^\s*\)/.test(next);
      if (useList) {
        if (value.values.length === 0) {
          text += 'NULL';
        } else {
          text += value.values.map(() => '?').join(', ');
          params.push(...value.values.map(normalizeParam));
        }
      } else {
        text += '?';
        params.push(JSON.stringify(value.values));
      }
      continue;
    }

    text += '?';
    params.push(normalizeParam(value));
  }

  text += strings[strings.length - 1] ?? '';
  return {
    __appSqlFragment: true,
    text: normalizeSqlText(text),
    params,
  };
}

class LsqliteQuery implements AppSqlQuery {
  readonly __appSqlFragment = true;
  readonly text: string;
  readonly params: unknown[];

  constructor(
    private readonly client: LsqliteHttpClient,
    fragment: SqlFragment,
    private readonly mode?: LsqliteQueryMode
  ) {
    this.text = fragment.text;
    this.params = fragment.params;
  }

  then<TResult1 = QueryRows, TResult2 = never>(
    onfulfilled?: ((value: QueryRows) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.client.execute(this.text, this.params, this.mode).then(onfulfilled, onrejected);
  }
}

export class LsqliteHttpClient {
  private readonly baseUrl: string;
  private readonly databaseKey: string;

  constructor(options: { baseUrl: string; databaseKey: string }) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.databaseKey = options.databaseKey;
  }

  private async request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined
        ? { Authorization: `Bearer ${this.databaseKey}` }
        : {
            Authorization: `Bearer ${this.databaseKey}`,
            'Content-Type': 'application/json',
          },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      throw new Error(`[lsqlite] HTTP ${response.status}: ${asErrorMessage(payload)}`);
    }
    return payload as T;
  }

  async health(): Promise<void> {
    const response = await this.request<{ ok?: boolean; service?: string }>('/api/health');
    if (!response.ok) {
      throw new Error('[lsqlite] health check failed');
    }
  }

  async execute(sql: string, params: readonly unknown[] = [], mode?: LsqliteQueryMode): Promise<QueryRows> {
    const normalizedSql = normalizeSqlText(sql);
    const payload = await this.request<LsqliteQueryResponse>('/api/query', {
      sql: normalizedSql,
      params: [...params].map(normalizeParam),
      mode: mode ?? inferMode(normalizedSql),
    });

    if (!payload.ok) {
      throw new Error(payload.error?.message ?? '[lsqlite] query failed');
    }
    return createRows(payload.results?.[0]);
  }

  async transaction(statements: LsqliteStatement[]): Promise<QueryRows[]> {
    if (statements.length === 0) return [];
    const payload = await this.request<LsqliteTransactionResponse>('/api/transaction', {
      statements: statements.map((statement) => {
        const normalizedSql = normalizeSqlText(statement.sql);
        return {
          sql: normalizedSql,
          params: (statement.params ?? []).map(normalizeParam),
          mode: statement.mode ?? inferMode(normalizedSql),
        };
      }),
    });

    if (!payload.ok) {
      throw new Error(payload.error?.message ?? '[lsqlite] transaction failed');
    }
    return (payload.results ?? []).map(createRows);
  }

  createSql(): AppSql {
    const client = this;

    function sql(stringsOrValues: TemplateStringsArray | Record<string, unknown>, ...values: unknown[]) {
      if (isTemplateStringsArray(stringsOrValues)) {
        const fragment = render(stringsOrValues, values);
        return new LsqliteQuery(client, fragment);
      }

      const record = stringsOrValues as Record<string, unknown>;
      const keys = Object.keys(record);
      return {
        __appSqlFragment: true,
        text: `(${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
        params: keys.map((key) => normalizeParam(record[key])),
      } satisfies SqlFragment;
    }

    const appSql = sql as AppSql;

    appSql.array = (values: readonly unknown[]) => ({
      __appSqlArray: true,
      values,
    });

    appSql.begin = async <T>(fn: (tx: AppSql) => Promise<T> | T) => fn(appSql);

    appSql.file = async (filePath: string) => {
      const content = await readFile(filePath, 'utf8');
      return client.execute(content, [], 'write');
    };

    appSql.unsafe = (sqlText: string, params: readonly unknown[] = []) => {
      const fragment: SqlFragment = {
        __appSqlFragment: true,
        text: normalizeSqlText(sqlText),
        params: [...params].map(normalizeParam),
      };
      return new LsqliteQuery(client, fragment);
    };

    appSql.end = async () => {};

    appSql.listen = async () => {
      console.warn('[server] Lsqlite 当前不支持数据库 LISTEN，SSE 将仅保持连接状态');
    };

    return appSql;
  }
}