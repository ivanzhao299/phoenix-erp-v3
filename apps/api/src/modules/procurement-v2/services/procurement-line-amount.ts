import { BadRequestException } from '@nestjs/common';

export function procurementLineAmount(qty: number, price: number, supplied?: number): number {
  // Quantize to the precision of the stored quantity and price before extending the line.
  const scale = (value: number) => BigInt(Math.round(value * 10000));
  const cents = (scale(qty) * scale(price) + 500000n) / 1000000n;
  if (supplied != null && BigInt(Math.round(supplied * 100)) !== cents) {
    throw new BadRequestException('明细小计与数量及单价不一致，请核对识别结果后保存');
  }
  return Number(cents) / 100;
}
