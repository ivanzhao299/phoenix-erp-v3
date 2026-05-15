import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * SalesEngine — V3 port from V2 (PRD 8.4.1/8.4.2/8.4.3)
 *
 * V2 源: _archive/phoenix-backend-v2-sqlite/src/services/salesEngine.js
 *
 * 三大校验：
 *   1. OwnershipValidator (8.4.2)
 *      - 黑名单拦截：customer.risk_flag = 'BLACKLIST' → 阻断
 *      - 归属保护：customer.current_owner_subject_id !== order.seller_subject_id 时阻断
 *        (仅当 protection_status != 'INIT' 时启用归属保护)
 *   2. RegionValidator (8.4.3)
 *      - V2/V3 一期均为 stub，默认通过；二期接 chn_distributor authorizedRegions
 *   3. PriceValidator (8.4.1)
 *      - 校验商品在指定 price_book_id 内（含 prc_price_items）
 *      - 价格带：retail_lower 以下需特价审批；retail_upper 以上仅标记
 *
 * 检查顺序：ownership → region → price
 *   ownership 失败 → 直接 block
 *   region 失败 → 直接 block
 *   price 失败 + requiresApproval=true → 转特价审批
 *   price 失败 + requiresApproval=false → 直接 block
 */

export type ValidationLine = {
  product_code: string;
  unit_price: number;
  qty: number;
  price_source?: 'NORMAL' | 'SPECIAL' | 'CONTRACT';
  retail_band_status?: 'IN_BAND' | 'BELOW_LOWER' | 'ABOVE_UPPER';
  [k: string]: unknown;
};

export type ValidationOrder = {
  customer_code: string;
  price_book_id?: string | number;
  seller_subject_id?: string;
  [k: string]: unknown;
};

export type ValidationResult =
  | { passed: true; lines: ValidationLine[] }
  | { passed: false; type: 'OWNERSHIP' | 'REGION' | 'PRICE' | 'PRICE_APPROVAL_REQUIRED'; errors: string[]; lines?: ValidationLine[] };

@Injectable()
export class SalesEngineService {
  constructor(
    @InjectEntityManager() private readonly em: EntityManager,
  ) {}

  async validateOrder(order: ValidationOrder, lines: ValidationLine[]): Promise<ValidationResult> {
    // 1. OwnershipValidator
    const ownership = await this.validateOwnership(order);
    if (!ownership.passed) return { passed: false, type: 'OWNERSHIP', errors: ownership.errors };

    // 2. RegionValidator (stub — V2 一期同款返回通过)
    const region = await this.validateRegion(order);
    if (!region.passed) return { passed: false, type: 'REGION', errors: region.errors };

    // 3. PriceValidator
    const price = await this.validatePrice(order, lines);
    if (!price.passed) {
      if (price.requiresApproval) {
        return { passed: false, type: 'PRICE_APPROVAL_REQUIRED', errors: price.errors, lines };
      }
      return { passed: false, type: 'PRICE', errors: price.errors };
    }

    return { passed: true, lines };
  }

  private async validateOwnership(order: ValidationOrder): Promise<{ passed: boolean; errors: string[] }> {
    const errors: string[] = [];
    const rows = await this.em.query(
      `SELECT customer_code, risk_flag, protection_status, current_owner_subject_id
         FROM ord_customers WHERE customer_code = $1 LIMIT 1`,
      [order.customer_code],
    ).catch(() => []);
    if (rows.length === 0) {
      return { passed: false, errors: [`Customer ${order.customer_code} not found`] };
    }
    const cust = rows[0];

    // 黑名单
    if (cust.risk_flag === 'BLACKLIST') {
      errors.push('Customer is in blacklist. Order blocked.');
      return { passed: false, errors };
    }

    // 归属保护
    if (cust.protection_status && cust.protection_status !== 'INIT' && cust.current_owner_subject_id) {
      if (order.seller_subject_id && cust.current_owner_subject_id !== order.seller_subject_id) {
        errors.push(`Customer is owned by ${cust.current_owner_subject_id}, you (${order.seller_subject_id}) have no permission to place order.`);
        return { passed: false, errors };
      }
    }

    return { passed: true, errors };
  }

  private async validateRegion(_order: ValidationOrder): Promise<{ passed: boolean; errors: string[] }> {
    // V2 PRD 8.4.3 一期 stub
    return { passed: true, errors: [] };
  }

  /**
   * 仅校验价格带 — POS 用（没有 customer_code 概念，不走 ownership/region）
   * 返回与内部 validatePrice 一致。requiresApproval=true 表示需要店长授权（低于 retail_lower）
   */
  async validatePriceOnly(
    order: ValidationOrder,
    lines: ValidationLine[],
  ): Promise<{ passed: boolean; requiresApproval: boolean; errors: string[] }> {
    return this.validatePrice(order, lines);
  }

  private async validatePrice(
    order: ValidationOrder,
    lines: ValidationLine[],
  ): Promise<{ passed: boolean; requiresApproval: boolean; errors: string[] }> {
    const errors: string[] = [];
    let requiresApproval = false;

    // 没有 price_book_id 时跳过价格校验（向后兼容：V3 早期订单无此字段）
    if (!order.price_book_id) {
      return { passed: true, requiresApproval: false, errors: [] };
    }

    const items: Array<{ sku_code: string; retail_lower?: number; retail_upper?: number }> =
      await this.em.query(
        `SELECT sku_code, retail_lower, retail_upper FROM prc_price_items WHERE price_book_id = $1`,
        [order.price_book_id],
      ).catch(() => []);
    const itemMap = new Map(items.map(i => [i.sku_code, i]));

    let passed = true;
    for (const line of lines) {
      const prc = itemMap.get(line.product_code);
      if (!prc) {
        passed = false;
        errors.push(`SKU ${line.product_code} not found in price book ${order.price_book_id}`);
        continue;
      }
      line.retail_band_status = 'IN_BAND';
      if (line.price_source === 'NORMAL' || !line.price_source) {
        if (prc.retail_lower != null && Number(line.unit_price) < Number(prc.retail_lower)) {
          line.retail_band_status = 'BELOW_LOWER';
          requiresApproval = true;
          passed = false;
          errors.push(
            `Price for ${line.product_code} (${line.unit_price}) is below lower bound (${prc.retail_lower}). Requires special approval.`,
          );
        } else if (prc.retail_upper != null && Number(line.unit_price) > Number(prc.retail_upper)) {
          line.retail_band_status = 'ABOVE_UPPER';
        }
      }
    }
    return { passed, requiresApproval, errors };
  }
}
