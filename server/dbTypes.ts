export type QueryRows<T extends Record<string, unknown> = any> = T[] & {
  count: number;
};

export type SqlFragment = {
  readonly __appSqlFragment: true;
  readonly text: string;
  readonly params: unknown[];
};

export type AppSqlQuery<T extends Record<string, unknown> = Record<string, unknown>> =
  SqlFragment & PromiseLike<QueryRows<T>>;

export type AppSqlArray = {
  readonly __appSqlArray: true;
  readonly values: readonly unknown[];
};

export type AppSql = {
  (strings: TemplateStringsArray, ...values: unknown[]): AppSqlQuery;
  (values: Record<string, unknown>): SqlFragment;
  array(values: readonly unknown[]): AppSqlArray;
  begin<T>(fn: (tx: AppSql) => Promise<T> | T): Promise<T>;
  file(path: string): Promise<QueryRows>;
  unsafe(sql: string, params?: readonly unknown[]): AppSqlQuery;
  end(options?: unknown): Promise<void>;
  listen(channel: string, handler: (payload: string) => void): Promise<void>;
};