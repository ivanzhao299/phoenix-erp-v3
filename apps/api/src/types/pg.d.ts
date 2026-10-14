/**
 * Minimal ambient surface of the `pg` driver (a direct dependency, used
 * without types). Declares ONLY what the bounded guard executor consumes;
 * replace with @types/pg when dependency changes are authorized.
 */
declare module 'pg' {
  export interface ClientConfig {
    connectionString?: string;
    connectionTimeoutMillis?: number;
  }
  export interface QueryResult {
    rows: unknown[];
    rowCount?: number;
  }
  export class Client {
    constructor(config?: ClientConfig);
    connect(): Promise<void>;
    query(sql: string, values?: unknown[]): Promise<QueryResult>;
    /** Present after a successful connect; the backend PID of the connection. */
    processID?: number;
    /** Driver internals: the live socket wrapper (teardown terminator). */
    connection?: { stream?: { destroy?: () => void } };
    end(): Promise<void>;
  }
}
