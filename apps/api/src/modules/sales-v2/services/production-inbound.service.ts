import { Injectable, Logger, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { EggInventoryService } from './egg-inventory.service';
import { InventorySourceModeService } from './inventory-source-mode.service';
import { DataScopeContext } from '../../org/services/data-scope.service';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';

type MasterContext = {
  companyCode: string;
  siteCode?: string;
  warehouseCode: string;
  locationCode: string;
};

/**
 * ProductionInboundService — 库存来源模式治理 Phase P1A · 临时生产入库
 * ════════════════════════════════════════════════════════════════════════
 * 依据：docs/production-inventory-source-mode-phase-p1a.md（第二步）
 *
 * 过渡方案：包装模块成熟前，允许手机端/电脑端录入日产蛋，直接形成销售库存。
 * 关键约束：
 *   · 不允许继续写 EGG-STOCK-*（已冻结的旧旁路命名）。
 *   · 必须统一写 Sales V2 库存体系：EGG-YYYYMMDD-NNNNN + grade_code_std + spec + expire_date，
 *     写 inv_ledger change_type='TEMP_PRODUCTION_INBOUND'，自动进入 FIFO。
 *   · 互斥：仅当来源模式 = TEMP_PRODUCTION_INBOUND 时允许；PACKAGING_INBOUND 模式下禁止。
 */
@Injectable()
export class ProductionInboundService {
  private readonly logger = new Logger(ProductionInboundService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly eggInv: EggInventoryService,
    private readonly modeSvc: InventorySourceModeService,
    private readonly ownership: OrgOwnershipService,
  ) {}

  private get operator(): string {
    try { return (this.cls.get('user') as any)?.username ?? 'production'; } catch { return 'production'; }
  }

  private assertScope(companyCode: string, warehouseCode?: string): void {
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    if (!scope || scope.isGlobal) return;
    if (!scope.allowedCompanyCodes.includes(companyCode)) {
      throw new ForbiddenException(`无权向公司 ${companyCode} 入库`);
    }
    if (warehouseCode && !scope.allowedWarehouseCodes.includes(warehouseCode)) {
      throw new ForbiddenException(`无权向仓库 ${warehouseCode} 入库`);
    }
  }

  private async resolveCompanyAndSite(dto: { companyCode?: string; siteCode?: string; houseCode?: string }) {
    let house: { farmCode: string; companyCode: string; siteCode?: string } | undefined;
    if (dto.houseCode) {
      house = await this.ownership.resolveHouse(dto.houseCode);
    }

    // 选择鸡舍后，以 house→farm 的权威归属覆盖请求值，禁止前端把鸡舍绑到另一公司/SITE。
    let companyCode = house?.companyCode?.trim()
      || dto.companyCode?.trim();
    const siteCode = house?.siteCode?.trim()
      || dto.siteCode?.trim();
    if (!companyCode && siteCode) {
      const rows = await this.ds.query(
        `SELECT DISTINCT NULLIF(f.company_code, '') AS company_code
           FROM brd_houses h
           ${OrgOwnershipService.ACTIVE_FARM_JOIN}
          WHERE ${OrgOwnershipService.FARM_SITE_SQL} = $1
            AND h.status = 'ACTIVE'
            AND NULLIF(f.company_code, '') IS NOT NULL`,
        [siteCode],
      );
      if (rows.length === 1) companyCode = rows[0].company_code;
      else if (rows.length > 1) throw new BadRequestException(`场站 ${siteCode} 关联多个公司，请显式选择公司`);
    }
    if (!companyCode) {
      if (dto.houseCode) {
        const farmHint = house?.farmCode
          ? `；关联农场 ${house.farmCode} 也未提供 ACTIVE 公司归属`
          : '；该鸡舍未关联 ACTIVE 农场';
        throw new BadRequestException(
          `鸡舍 ${dto.houseCode} 缺少公司归属${farmHint}。请到「主数据中心 → 鸡舍」补齐农场/公司归属后重试`,
        );
      }
      throw new BadRequestException('无法解析真实公司：请显式选择公司/场站，或选择已维护归属的 ACTIVE 鸡舍');
    }
    const activeCompany = await this.ds.query(
      `SELECT 1 FROM sys_organizations
        WHERE org_type = 'COMPANY' AND status = 'ACTIVE'
          AND COALESCE(company_code, org_code) = $1 LIMIT 1`,
      [companyCode],
    );
    if (!activeCompany.length) throw new BadRequestException(`公司 ${companyCode} 不存在或已停用`);
    this.assertScope(companyCode);
    return { companyCode, siteCode };
  }

  private async resolveWarehouse(companyCode: string, siteCode?: string, explicit?: string): Promise<string> {
    const params: unknown[] = [companyCode];
    let sql = `SELECT warehouse_code FROM wms_warehouses
      WHERE company_code = $1 AND status = 'ACTIVE' AND type = 'EGG_FARM'
        AND domain = 'OPERATIONAL'`;
    if (explicit) { params.push(explicit); sql += ` AND warehouse_code = $2`; }
    else if (siteCode) { params.push(siteCode); sql += ` AND (site_code = $2 OR site_code IS NULL)`; }
    sql += ` ORDER BY warehouse_code`;
    const rows = await this.ds.query(sql, params);
    if (explicit && rows.length === 0) throw new BadRequestException(`仓库 ${explicit} 不属于公司 ${companyCode} 或未启用`);
    if (!explicit && rows.length === 0) throw new BadRequestException(`公司 ${companyCode} 没有可用的 ACTIVE 仓库，请先维护仓库主数据`);
    if (!explicit && rows.length > 1) {
      throw new BadRequestException(`公司 ${companyCode} 存在多个 ACTIVE 仓库（${rows.map((r: any) => r.warehouse_code).join('、')}），请选择入库仓库`);
    }
    const warehouseCode = rows[0].warehouse_code;
    const warehouse = await this.ownership.resolveWarehouse(warehouseCode);
    if (warehouse.companyCode !== companyCode) {
      throw new BadRequestException(`仓库 ${warehouseCode} 不属于公司 ${companyCode}`);
    }
    this.assertScope(companyCode, warehouseCode);
    return warehouseCode;
  }

  private async resolveLocation(warehouseCode: string, explicit?: string): Promise<string> {
    const rows = await this.ds.query(
      `SELECT location_code FROM wms_locations
        WHERE warehouse_code = $1 AND status IN ('ACTIVE', 'NORMAL')
          ${explicit ? 'AND location_code = $2' : ''}
        ORDER BY location_code`,
      explicit ? [warehouseCode, explicit] : [warehouseCode],
    );
    if (explicit && rows.length === 0) throw new BadRequestException(`库位 ${explicit} 不属于仓库 ${warehouseCode} 或未启用`);
    if (!explicit && rows.length === 0) throw new BadRequestException(`仓库 ${warehouseCode} 没有 ACTIVE 库位，请先维护入库库位`);
    if (!explicit && rows.length > 1) {
      throw new BadRequestException(`仓库 ${warehouseCode} 存在多个 ACTIVE 库位，请选择入库库位`);
    }
    return rows[0].location_code;
  }

  private async resolveMasterContext(dto: {
    companyCode?: string; siteCode?: string; houseCode?: string; warehouseCode?: string; locationCode?: string;
  }): Promise<MasterContext> {
    const { companyCode, siteCode } = await this.resolveCompanyAndSite(dto);
    const warehouseCode = await this.resolveWarehouse(companyCode, siteCode, dto.warehouseCode?.trim());
    const locationCode = await this.resolveLocation(warehouseCode, dto.locationCode?.trim());
    return { companyCode, siteCode, warehouseCode, locationCode };
  }

  /**
   * 录入日产蛋 → 直接形成销售库存（仅 TEMP_PRODUCTION_INBOUND 模式）
   */
  async recordProductionInbound(dto: {
    companyCode?: string;
    siteCode?:    string;   // 场站（用于模式解析与追溯）
    houseCode?:   string;   // 鸡舍（追溯）
    warehouseCode?: string;
    locationCode?: string;
    eggDate:      string;   // YYYY-MM-DD
    items:        Array<{ grade: string; qty: number; spec?: string }>;
    operator?:    string;
    remark?:      string;
  }): Promise<{
    mode: string;
    companyCode: string;
    siteCode?: string;
    warehouseCode: string;
    locationCode: string;
    eggDate: string;
    batches: Array<{ batchNo: string; grade: string; qty: number; productCode: string }>;
    totalInbound: number;
  }> {
    if (!dto.eggDate) throw new BadRequestException('eggDate 必填');
    if (!Array.isArray(dto.items) || dto.items.length === 0) throw new BadRequestException('items 不能为空');

    const context = await this.resolveMasterContext(dto);
    const { companyCode, siteCode, warehouseCode, locationCode } = context;

    // 互斥校验：仅 TEMP_PRODUCTION_INBOUND 模式允许
    const mode = await this.modeSvc.resolveMode({ siteCode, companyCode });
    if (mode !== 'TEMP_PRODUCTION_INBOUND') {
      throw new ForbiddenException(
        '已启用包装入库模式（PACKAGING_INBOUND），不允许直接生成库存。请通过「包装作业中心」完成入库。',
      );
    }

    const collectionRef = dto.houseCode ? `HOUSE-${dto.houseCode}` : (siteCode ? `SITE-${siteCode}` : null);
    const batches: Array<{ batchNo: string; grade: string; qty: number; productCode: string }> = [];

    const effectiveItems = dto.items
      .map(item => ({ ...item, spec: item.spec?.trim() || 'LOOSE', grade: String(item.grade || '').trim(), qty: Math.max(0, Math.round(Number(item.qty) || 0)) }))
      .filter(item => item.qty > 0);
    const grades = [...new Set(effectiveItems.map(item => item.grade))];
    const skuRows: Array<{ sku_code: string; product_code: string; grade_code: string; spec_code: string }> = grades.length
      ? await this.ds.query(
        `SELECT sku_code, product_code, grade_code, spec_code FROM product_skus
          WHERE status = 'ACTIVE' AND grade_code = ANY($1)
          ORDER BY grade_code, spec_code, sku_code`,
        [grades],
      )
      : [];
    const resolved = new Map<string, (typeof skuRows)[number]>();
    const missing: string[] = [];
    const ambiguous: string[] = [];
    for (const item of effectiveItems) {
      const matches = skuRows.filter(row => row.grade_code === item.grade && (!item.spec || row.spec_code === item.spec));
      if (matches.length === 0) missing.push(item.spec ? `${item.grade}/${item.spec}` : item.grade);
      else if (matches.length > 1) ambiguous.push(item.spec ? `${item.grade}/${item.spec}` : item.grade);
      else resolved.set(`${item.grade}\u0000${item.spec ?? ''}`, matches[0]);
    }
    if (missing.length) throw new BadRequestException(`以下蛋品档位缺少 ACTIVE SKU：${[...new Set(missing)].join('、')}。请先在主数据中心维护`);
    if (ambiguous.length) throw new BadRequestException(`以下蛋品档位匹配多个 ACTIVE SKU：${[...new Set(ambiguous)].join('、')}。请选择规格后重试`);

    for (const item of effectiveItems) {
      const { qty, grade } = item;
      const sku = resolved.get(`${grade}\u0000${item.spec ?? ''}`)!;
      const productCode = sku.product_code;
      const batch = await this.eggInv.createProductionBatch({
        companyCode,
        warehouseCode,
        locationCode,
        eggDate:            dto.eggDate,
        qualityGrade:       grade,
        skuCode:            sku.sku_code,
        gradeCodeStd:       sku.grade_code,
        specCode:           sku.spec_code,
        packagingSpec:      sku.spec_code,
        productCode,
        qty,
        sourceNo:           `TEMP-${dto.eggDate}-${dto.houseCode ?? siteCode ?? companyCode}`,
        sourceType:         'TEMP_PRODUCTION',
        ledgerChangeType:   'TEMP_PRODUCTION_INBOUND',
        collectionBatchRef: collectionRef ?? undefined,
      });
      batches.push({ batchNo: batch.batch_no, grade, qty, productCode });
    }

    const totalInbound = batches.reduce((s, b) => s + b.qty, 0);
    this.logger.log(
      `[ProdInbound] 临时生产入库 company=${companyCode} date=${dto.eggDate} 批次=${batches.length} 入库=${totalInbound}`,
    );
    return { mode, companyCode, siteCode, warehouseCode, locationCode, eggDate: dto.eggDate, batches, totalInbound };
  }
}
