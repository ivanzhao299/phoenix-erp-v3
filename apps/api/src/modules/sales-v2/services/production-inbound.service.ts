import { Injectable, Logger, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { EggInventoryService } from './egg-inventory.service';
import { InventorySourceModeService } from './inventory-source-mode.service';

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
  ) {}

  private get operator(): string {
    try { return (this.cls.get('user') as any)?.username ?? 'production'; } catch { return 'production'; }
  }

  /** 解析生产公司码（与包装入库一致的兜底链） */
  private async resolveCompanyCode(explicit?: string): Promise<string> {
    if (explicit) return explicit;
    if (process.env.PRODUCTION_COMPANY_CODE) return process.env.PRODUCTION_COMPANY_CODE;
    try {
      const rows = await this.ds.query(
        `SELECT company_code FROM sal_customers WHERE company_code IS NOT NULL GROUP BY company_code`,
      );
      if (rows.length === 1 && rows[0].company_code) return rows[0].company_code;
    } catch { /* 兜底 */ }
    return 'ALL';
  }

  /**
   * 录入日产蛋 → 直接形成销售库存（仅 TEMP_PRODUCTION_INBOUND 模式）
   */
  async recordProductionInbound(dto: {
    companyCode?: string;
    siteCode?:    string;   // 场站（用于模式解析与追溯）
    houseCode?:   string;   // 鸡舍（追溯）
    eggDate:      string;   // YYYY-MM-DD
    items:        Array<{ grade: string; qty: number; spec?: string }>;
    operator?:    string;
    remark?:      string;
  }): Promise<{
    mode: string;
    companyCode: string;
    eggDate: string;
    batches: Array<{ batchNo: string; grade: string; qty: number; productCode: string }>;
    totalInbound: number;
  }> {
    if (!dto.eggDate) throw new BadRequestException('eggDate 必填');
    if (!Array.isArray(dto.items) || dto.items.length === 0) throw new BadRequestException('items 不能为空');

    const companyCode = await this.resolveCompanyCode(dto.companyCode);

    // 互斥校验：仅 TEMP_PRODUCTION_INBOUND 模式允许
    const mode = await this.modeSvc.resolveMode({ siteCode: dto.siteCode, companyCode });
    if (mode !== 'TEMP_PRODUCTION_INBOUND') {
      throw new ForbiddenException(
        '已启用包装入库模式（PACKAGING_INBOUND），不允许直接生成库存。请通过「包装作业中心」完成入库。',
      );
    }

    const collectionRef = dto.houseCode ? `HOUSE-${dto.houseCode}` : (dto.siteCode ? `SITE-${dto.siteCode}` : null);
    const batches: Array<{ batchNo: string; grade: string; qty: number; productCode: string }> = [];

    for (const item of dto.items) {
      const qty = Math.max(0, Math.round(Number(item.qty) || 0));
      if (qty === 0) continue;
      // 默认 'L'（一号蛋）— 2026-06-06 product_grades 回归孟赛业务口径后主流销售档
      const grade = String(item.grade || 'L').trim();
      const productCode = `PRD-EGG-${grade}`;
      const batch = await this.eggInv.createProductionBatch({
        companyCode,
        eggDate:            dto.eggDate,
        qualityGrade:       grade,
        gradeCodeStd:       grade,
        specCode:           item.spec ?? undefined,
        packagingSpec:      item.spec ?? undefined,
        productCode,
        qty,
        sourceNo:           `TEMP-${dto.eggDate}-${dto.houseCode ?? dto.siteCode ?? 'PROD'}`,
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
    return { mode, companyCode, eggDate: dto.eggDate, batches, totalInbound };
  }
}
