import { ServiceUnavailableException } from '@nestjs/common';
import schemaContract = require('./api-bootstrap-schema-contract.json');
export const API_BOOTSTRAP_SCHEMA_CONTRACT = schemaContract;

type Query = (sql: string, parameters?: unknown[]) => Promise<Array<Record<string, unknown>>>;
type Requirements = Readonly<Record<string, readonly string[]>>;

export function schemaMismatch(table: string, column?: string): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'SCHEMA_MISMATCH',
    table,
    ...(column ? { column } : {}),
    message: '数据库结构不兼容，请由受控 schema 治理处理；应用不会自动修复',
  });
}

/** Inspect existing metadata only. Missing schema stops bootstrap; never repair it. */
export async function assertExistingSchema(query: Query, requirements: Requirements): Promise<void> {
  const rows = await query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [Object.keys(requirements)],
  );
  for (const [table, columns] of Object.entries(requirements)) {
    const present = new Set(rows.filter(row => row.table_name === table).map(row => row.column_name));
    if (!present.size) throw schemaMismatch(table);
    for (const column of columns) if (!present.has(column)) throw schemaMismatch(table, column);
  }
}

/** These retired IoT FKs have a controlled migration; report drift rather than drop them. */
export async function assertConstraintsAbsent(query: Query, names: readonly string[]): Promise<void> {
  const rows = await query(
    `SELECT c.conname FROM pg_catalog.pg_constraint c
     JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
     WHERE n.nspname = 'public' AND c.conname = ANY($1::text[])`,
    [names],
  );
  if (rows.length) throw schemaMismatch('iot', String(rows[0].conname));
}
