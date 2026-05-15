import { Injectable } from '@nestjs/common';

/**
 * 跨币种折算基础服务
 */
@Injectable()
export class CurrencyService {
  // P2 初期：静态基准汇率 (后续可改为从 DB/Redis 动态读取)
  // 按照 V3 要求：2026年5月1号的基准点
  private readonly LAK_TO_CNY_RATE = 1 / 3000; // 假设 1 CNY = 3000 LAK

  /**
   * 将任意金额转换为目标币种 (主要用于审批流的阈值判定，非实际账面变更)
   */
  convertTo(amount: number, fromCurrency: string, toCurrency: string): number {
    if (fromCurrency === toCurrency) return amount;

    if (fromCurrency === 'LAK' && toCurrency === 'CNY') {
      return amount * this.LAK_TO_CNY_RATE;
    }
    
    if (fromCurrency === 'CNY' && toCurrency === 'LAK') {
      return amount / this.LAK_TO_CNY_RATE;
    }

    // 默认回退
    console.warn(`[CurrencyService] Unsupported conversion: ${fromCurrency} -> ${toCurrency}`);
    return amount;
  }
}
