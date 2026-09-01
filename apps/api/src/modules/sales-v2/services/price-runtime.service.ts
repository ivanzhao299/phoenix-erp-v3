import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeContext } from '../../org/services/data-scope.service';
import { ResolvePriceDto, ValidatePriceDto } from '../dto/price-item.dto';

export interface ResolvedPrice {
  priceBookId:   string;
  priceBookNo:   string;
  priceItemId:   string;
  unitPrice:     number;
  floorPrice:    number | null;
  ceilingPrice:  number | null;
  currencyCode:  string;
  sourceType:    'STORE' | 'CUSTOMER' | 'CHANNEL' | 'DEFAULT';
  publishVersion: number;
  matchedRule:   string;
  /** Phase H3: 匹配的 SKU 编码（如果是 sku_code 精确匹配）*/
  skuCode?:      string | null;
  /** Phase H3: 标准等级编码 */
  gradeCodeStd?: string | null;
  /** Phase H3: 标准规格编码 */
  specCode?:     string | null;
}

export interface ValidateResult {
  passed:        boolean;
  needApproval:  boolean;
  unitPrice:     number;
  floorPrice:    number | null;
  message:       string;
}

@Injectable()
export class PriceRuntimeService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  private getScope(): { companyCodes: string[]; scopeAll: boolean } {
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    return scope
      ? { companyCodes: scope.allowedCompanyCodes, scopeAll: scope.isGlobal }
      : { companyCodes: [], scopeAll: false };
  }

  /**
   * 价格解析引擎
   *
   * 匹配优先级（Phase H3 更新）：
   *   0. sku_code 精确匹配（最高优先级，Phase H3 新增）
   *   1. customer_code 精确匹配
   *   2. channel_code 匹配
   *   3. 默认价格册（customer_code 和 channel_code 均为 NULL）
   *   4. priority 数字越小越优先
   *   5. 数量阶梯：qty 在 [min_qty, max_qty] 范围内
   *
   * 兼容规则：
   *   - dto.skuCode 为空时，按旧逻辑 product_code + grade_code + packaging_spec 匹配
   *   - dto.skuCode 非空时，同时尝试 sku_code 精确路径和旧路径，sku_code 路径优先
   */
  async resolvePrice(dto: ResolvePriceDto, queryable: Pick<DataSource, 'query'> = this.ds): Promise<ResolvedPrice> {
    const qty     = dto.qty ?? null;
    const skuCode = dto.skuCode ?? null;

    const rows = await queryable.query(`
      SELECT
        pi.id              AS item_id,
        pi.unit_price,
        pi.floor_price,
        pi.ceiling_price,
        pi.currency_code,
        pi.sku_code,
        pi.grade_code_std,
        pi.spec_code,
        pb.id              AS book_id,
        pb.price_book_no,
        pb.priority,
        pb.store_code,
        pb.publish_version,
        pb.effective_from,
        pb.customer_code,
        pb.channel_code,
        CASE
          WHEN pb.store_code    IS NOT NULL THEN 0
          WHEN pb.customer_code IS NOT NULL THEN 1
          WHEN pb.channel_code  IS NOT NULL THEN 2
          ELSE 3
        END AS tier
      FROM sal_price_items pi
      JOIN sal_price_books pb ON pb.id = pi.price_book_id
      WHERE pb.company_code = $1
        AND pb.status       = 'ACTIVE'
        AND pi.status       = 'ACTIVE'
        AND (pb.effective_from IS NULL OR pb.effective_from <= CURRENT_DATE)
        AND (pb.effective_to   IS NULL OR pb.effective_to   >= CURRENT_DATE)
        AND (
          -- Phase H3 Path A: sku_code 精确匹配（仅当请求和价格项都有 sku_code 时）
          ($2::varchar IS NOT NULL AND pi.sku_code = $2::varchar)
          OR
          -- Path B: 兼容旧 product+grade+spec 匹配
          (
            ($2::varchar IS NULL OR pi.sku_code IS NULL)
            AND pi.product_code = $3
            AND (pi.grade_code     IS NULL OR pi.grade_code     = $4)
            AND (pi.packaging_spec IS NULL OR pi.packaging_spec = $5)
          )
        )
        AND ($6::numeric IS NULL OR pi.min_qty IS NULL OR pi.min_qty <= $6::numeric)
        AND ($6::numeric IS NULL OR pi.max_qty IS NULL OR pi.max_qty >= $6::numeric)
        AND ($9::varchar IS NULL OR pi.currency_code = $9::varchar)
        AND (
              pb.store_code    = $10
           OR pb.customer_code = $7
           OR pb.channel_code  = $8
           OR (pb.store_code IS NULL AND pb.customer_code IS NULL AND pb.channel_code IS NULL)
        )
      ORDER BY
        -- Phase H3: sku_code 精确匹配优先于 product+grade+spec 匹配
        CASE WHEN $2::varchar IS NOT NULL AND pi.sku_code = $2::varchar THEN 0 ELSE 1 END ASC,
        tier ASC,
        pb.priority ASC,
        pb.effective_from DESC NULLS LAST,
        pb.publish_version DESC,
        pb.id DESC
      LIMIT 1
    `, [
      dto.companyCode,
      skuCode,
      dto.productCode,
      dto.gradeCode    ?? null,
      dto.packagingSpec ?? null,
      qty,
      dto.customerCode ?? null,
      dto.channelCode  ?? null,
      dto.currencyCode ?? null,
      dto.storeCode ?? null,
    ]);

    if (!rows?.length) {
      throw new NotFoundException(
        `未找到价格：公司=${dto.companyCode} 产品=${dto.productCode}` +
        (dto.skuCode       ? ` SKU=${dto.skuCode}` : '') +
        (dto.gradeCode     ? ` 品级=${dto.gradeCode}` : '') +
        (dto.packagingSpec ? ` 规格=${dto.packagingSpec}` : '') +
        (dto.customerCode  ? ` 客户=${dto.customerCode}` : '') +
        (dto.channelCode   ? ` 渠道=${dto.channelCode}` : ''),
      );
    }

    const r = rows[0];
    const tier = Number(r.tier);
    const sourceType: 'STORE' | 'CUSTOMER' | 'CHANNEL' | 'DEFAULT' =
      tier === 0 ? 'STORE' : tier === 1 ? 'CUSTOMER' : tier === 2 ? 'CHANNEL' : 'DEFAULT';

    const matchedRule =
      sourceType === 'STORE'    ? `门店价格册 (store=${r.store_code})` :
      sourceType === 'CUSTOMER' ? `客户专属价格册 (customer=${r.customer_code})` :
      sourceType === 'CHANNEL'  ? `渠道价格册 (channel=${r.channel_code})` :
                                  `默认价格册`;

    return {
      priceBookId:  String(r.book_id),
      priceBookNo:  r.price_book_no,
      priceItemId:  String(r.item_id),
      unitPrice:    Number(r.unit_price),
      floorPrice:   r.floor_price  != null ? Number(r.floor_price)  : null,
      ceilingPrice: r.ceiling_price != null ? Number(r.ceiling_price) : null,
      currencyCode: r.currency_code,
      sourceType,
      publishVersion: Number(r.publish_version),
      matchedRule,
      skuCode:      r.sku_code      ?? null,
      gradeCodeStd: r.grade_code_std ?? null,
      specCode:     r.spec_code     ?? null,
    };
  }

  /**
   * 价格校验
   * 返回 needApproval=true 时表示低于底价，须走 Workflow 审批
   */
  async validatePrice(dto: ValidatePriceDto): Promise<ValidateResult> {
    let resolved: ResolvedPrice | null = null;
    try {
      resolved = await this.resolvePrice({
        companyCode:   dto.companyCode,
        storeCode:     dto.storeCode,
        customerCode:  dto.customerCode,
        channelCode:   dto.channelCode,
        productCode:   dto.productCode,
        gradeCode:     dto.gradeCode,
        packagingSpec: dto.packagingSpec,
        skuCode:       dto.skuCode,
        qty:           dto.qty,
      });
    } catch {
      // 无价格配置 → 通过（但记录警告）
      return {
        passed:       true,
        needApproval: false,
        unitPrice:    dto.unitPrice,
        floorPrice:   null,
        message:      '未找到价格配置，允许自定义定价',
      };
    }

    const actual = Number(dto.unitPrice);
    const floor  = resolved.floorPrice;

    if (floor != null && actual < floor) {
      return {
        passed:       false,
        needApproval: true,
        unitPrice:    actual,
        floorPrice:   floor,
        message:      `实际价格 ${actual} 低于底价 ${floor}，须走价格审批`,
      };
    }

    return {
      passed:       true,
      needApproval: false,
      unitPrice:    actual,
      floorPrice:   floor,
      message:      '价格校验通过',
    };
  }

  /**
   * 移动端当前生效价格列表
   * 按 grade_code + packaging_spec 聚合，返回当前 DataScope 公司的 ACTIVE 价格
   * Phase H3 更新：同时返回 sku_code / grade_code_std / spec_code
   */
  async getCurrentPrices(companyCode?: string): Promise<any[]> {
    const user = this.getScope();

    let effectiveCompanyCodes: string[] = [];
    if (companyCode) {
      effectiveCompanyCodes = [companyCode];
    } else if (!user.scopeAll && user.companyCodes.length > 0) {
      effectiveCompanyCodes = user.companyCodes;
    }

    // 无 scopeAll + 无 companyCode → 返回空（移动端必须传 companyCode 或有范围）
    if (effectiveCompanyCodes.length === 0 && !user.scopeAll) {
      return [];
    }

    const params: any[] = [];
    const companyFilter = effectiveCompanyCodes.length > 0
      ? (() => { params.push(effectiveCompanyCodes); return `AND pb.company_code = ANY($${params.length})`; })()
      : '';

    const rows = await this.ds.query(`
      SELECT DISTINCT ON (pi.product_code, COALESCE(pi.grade_code,''), COALESCE(pi.packaging_spec,''))
        pi.id             AS item_id,
        pi.product_code,
        pi.grade_code,
        pi.packaging_spec,
        pi.unit_price,
        pi.floor_price,
        pi.ceiling_price,
        pi.currency_code,
        pi.sku_code,
        pi.grade_code_std,
        pi.spec_code,
        pb.price_book_no,
        pb.company_code,
        pb.customer_code,
        pb.channel_code,
        CASE
          WHEN pb.customer_code IS NOT NULL THEN 0
          WHEN pb.channel_code  IS NOT NULL THEN 1
          ELSE 2
        END AS tier
      FROM sal_price_items pi
      JOIN sal_price_books pb ON pb.id = pi.price_book_id
      WHERE pb.status = 'ACTIVE'
        AND pi.status = 'ACTIVE'
        AND (pb.effective_from IS NULL OR pb.effective_from <= CURRENT_DATE)
        AND (pb.effective_to   IS NULL OR pb.effective_to   >= CURRENT_DATE)
        ${companyFilter}
      ORDER BY pi.product_code, COALESCE(pi.grade_code,''), COALESCE(pi.packaging_spec,''),
               tier ASC, pb.priority ASC
    `, params);

    return rows.map((r: any) => ({
      itemId:        String(r.item_id),
      productCode:   r.product_code,
      gradeCode:     r.grade_code,
      packagingSpec: r.packaging_spec,
      unitPrice:     Number(r.unit_price),
      floorPrice:    r.floor_price   != null ? Number(r.floor_price)   : null,
      ceilingPrice:  r.ceiling_price != null ? Number(r.ceiling_price) : null,
      currencyCode:  r.currency_code,
      priceBookNo:   r.price_book_no,
      companyCode:   r.company_code,
      // Phase H3 新增字段
      skuCode:       r.sku_code       ?? null,
      gradeCodeStd:  r.grade_code_std ?? null,
      specCode:      r.spec_code      ?? null,
    }));
  }
}
