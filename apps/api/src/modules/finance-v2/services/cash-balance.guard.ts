import { BadRequestException } from '@nestjs/common';

export function finiteCashNumber(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException(`${field} 必须为有限数值`);
  }
  return parsed;
}

/**
 * TypeORM/Postgres raw DML RETURNING can be either rows[] or [rows[], rowCount].
 * Normalize both shapes and fail closed when no row was returned.
 */
export function returningRow<T extends object>(
  raw: unknown,
  operation: string,
): T {
  const outer = Array.isArray(raw) ? raw : [];
  const rows = Array.isArray(outer[0]) && typeof outer[1] === 'number'
    ? outer[0]
    : outer;
  const row = rows[0];
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new BadRequestException(`${operation} 未返回有效记录`);
  }
  return row as T;
}
