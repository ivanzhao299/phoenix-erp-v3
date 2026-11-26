import { BadRequestException } from '@nestjs/common';

/** Convert a NUMERIC(14,3) inventory quantity to exact integer thousandths. */
export function quantityTicks(value: unknown, label: string): number {
  const decimal = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
  const parts = /^(\d{1,11})(?:\.(\d{1,3}))?$/.exec(decimal);
  if (!parts) throw new BadRequestException(label + '必须为最多三位小数的非负数量');
  return Number(parts[1]) * 1000 + Number((parts[2] ?? '').padEnd(3, '0'));
}
