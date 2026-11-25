import { BadRequestException } from '@nestjs/common';

/** Existing invoice numbers are globally unique and the normal AR writer never issues this prefix. */
export const flockArNumber = (documentId: string) => 'AR-FLOCK-' + documentId;
export const isFlockArNumber = (arNo: unknown) => typeof arNo === 'string' && /^AR-FLOCK-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(arNo);

export function flockMoneyCents(value: unknown) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? ''));
  if (!match) throw new BadRequestException('鸡群收款金额须为有效的两位小数金额');
  const cents = BigInt(match[1] + (match[2] ?? '').padEnd(2,'0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new BadRequestException('余额超出资金流水可精确处理的范围');
  return cents;
}

export function flockMoneyNumber(cents: bigint) {
  const amount=Number(cents)/100;
  if (flockMoneyCents(amount)!==cents || flockMoneyCents(amount.toFixed(2))!==cents) {
    throw new BadRequestException('资金流水金额无法按分精确表示');
  }
  return amount;
}
