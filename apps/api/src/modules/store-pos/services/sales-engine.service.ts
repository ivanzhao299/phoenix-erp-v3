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
 *      - [Phase G2] 唯一读取 sal_customers（正式主档），LEGACY FALLBACK 已删除
 *        customer_no 或 legacy_customer_code 双查兼容历史 ord_customers customer_code
 *        黑名单：risk_level='BLACKLIST' 或 status='BLACKLIST'/'FROZEN' → 阻断
 *        匿名零售（customer_code=ANONYMOUS 或空）直接通过
 *      - 归属保护：protection_status != 'INIT' 时检查 sales_rep_id
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
    // ─── [Phase G2] sal_customers 唯一读取路径 ────────────────────────────────
    // G2 数据迁移完成：所有历史 ord_customers 客户已迁入 sal_customers
    // （通过 legacy_customer_code 字段双查兼容旧 customer_code）
    // LEGACY FALLBACK 已删除 — 不再读取 ord_customers
    // ─────────────────────────────────────────────────────────────────────────

    const rows = await this.em.query(
      `SELECT customer_no, risk_level, status, protection_status,
              sales_rep_id::text AS owner_id
         FROM sal_customers
        WHERE customer_no = $1 OR legacy_customer_code = $1
        LIMIT 1`,
      [order.customer_code],
    ).catch(() => [] as any[]);

    if (rows.length === 0) {
      // 未找到客户：匿名零售（无 customer_code）允许现金销售，
      // 指定客户不存在则拒绝
      if (!order.customer_code || order.customer_code === 'ANONYMOUS') {
        return { passed: true, errors: [] };
      }
      return { passed: false, errors: [`Customer ${order.customer_code} not found in master data`] };
    }

    const cust = rows[0];
    const riskLevel      = cust.risk_level      ?? 'NORMAL';
    const customerStatus = cust.status          ?? 'ACTIVE';
    const protectionStatus = cust.protection_status ?? 'INIT';
    const ownerSubjectId   = cust.owner_id      ?? null;

    // 黑名单 / 冻结拦截（统一语义）
    if (riskLevel === 'BLACKLIST' || customerStatus === 'BLACKLIST' || customerStatus === 'FROZEN') {
      return { passed: false, errors: ['Customer is blacklisted or frozen. Order blocked.'] };
    }

    // 归属保护
    if (protectionStatus && protectionStatus !== 'INIT' && ownerSubjectId) {
      if (order.seller_subject_id && ownerSubjectId !== order.seller_subject_id) {
        return {
          passed: false,
          errors: [
            `Customer is owned by ${ownerSubjectId},` +
            ` you (${order.seller_subject_id}) have no permission to place order.`,
          ],
        };
      }
    }

    return { passed: true, errors: [] };
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

    // Sales V2 Phase 2: 读取 sal_price_items（统一价格引擎），不再读 prc_price_items
    // prc_price_items 已标记为 [LEGACY][READ_ONLY][Sales用途已冻结]
    const items: Array<{
      product_code: string;
      grade_code:   string | null;
      floor_price:  number | null;
      ceiling_price: number | null;
      unit_price:   number;
    }> = await this.em.query(
      `SELECT pi.product_code, pi.grade_code, pi.floor_price, pi.ceiling_price, pi.unit_price
       FROM sal_price_items pi
       JOIN sal_price_books pb ON pb.id = pi.price_book_id
       WHERE pb.id = $1
         AND pb.status = 'ACTIVE'
         AND pi.status = 'ACTIVE'
         AND (pb.effective_from IS NULL OR pb.effective_from <= CURRENT_DATE)
         AND (pb.effective_to   IS NULL OR pb.effective_to   >= CURRENT_DATE)`,
      [order.price_book_id],
    ).catch(() => []);

    // 若价格册未迁移至 sal_price_books，跳过校验（向后兼容旧订单）
    if (!items.length) {
      return { passed: true, requiresApproval: false, errors: [] };
    }

    // 构建查找表：product_code（+可选 grade_code）
    const itemMap = new Map<string, typeof items[0]>();
    for (const i of items) {
      const key = i.grade_code ? `${i.product_code}:${i.grade_code}` : i.product_code;
      itemMap.set(key, i);
    }

    let passed = true;
    for (const line of lines) {
      const gradeCode = (line as any).grade_code ?? null;
      const prc = itemMap.get(gradeCode ? `${line.product_code}:${gradeCode}` : line.product_code)
               ?? itemMap.get(line.product_code);

      if (!prc) {
        // PRD 8.4.1: 指定了 price_book_id 但商品不在价格册内 → 直接阻断
        errors.push(
          `Product ${line.product_code} is not found in price book (id=${order.price_book_id}). Order blocked.`,
        );
        passed = false;
        continue;
      }

      line.retail_band_status = 'IN_BAND';
      if (line.price_source === 'NORMAL' || !line.price_source) {
        if (prc.floor_price != null && Number(line.unit_price) < Number(prc.floor_price)) {
          line.retail_band_status = 'BELOW_LOWER';
          requiresApproval = true;
          passed = false;
          errors.push(
            `Price for ${line.product_code} (${line.unit_price}) is below floor price (${prc.floor_price}). Requires approval.`,
          );
        } else if (prc.ceiling_price != null && Number(line.unit_price) > Number(prc.ceiling_price)) {
          line.retail_band_status = 'ABOVE_UPPER';
        }
      }
    }
    return { passed, requiresApproval, errors };
  }
}
