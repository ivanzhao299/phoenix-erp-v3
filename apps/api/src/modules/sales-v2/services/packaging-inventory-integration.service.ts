import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { EggInventoryService } from './egg-inventory.service';
import { InventorySourceModeService } from './inventory-source-mode.service'; // P1A 互斥门控

/**
 * PackagingInventoryIntegrationService — 生产链路收口 Phase 1
 * ════════════════════════════════════════════════════════════════════════
 * 依据：docs/production-inventory-integration-audit.md / 生产链路收口 Phase 1 §2/§3
 *
 * 唯一库存入口：包装完成 = 唯一库存入口。
 *   包装完成（packComplete）→ completePackagingBatch(taskNo)
 *     → 对每个【可售】等级调用 EggInventoryService.createProductionBatch()
 *       生成 Sales V2 统一可售批次（batch_no=EGG-YYYYMMDD-NNNNN，带 expire_date，
 *       source_type='PACKAGING'，写 inv_ledger change_type='PACKAGING_INBOUND'，
 *       packaging_batch_ref=taskNo 追溯），自动进入 FIFO 体系。
 *
 * 关键保证：
 *   · 幂等：以 inv_batches.packaging_batch_ref=taskNo 为幂等键，重复调用不重复入库。
 *   · 命名统一：产出批次走 EGG-YYYYMMDD-* 命名，与销售 FIFO 一致。
 *   · 不可售等级（product_grades.is_saleable=false）不进可售库存（由 packComplete
 *     写 QUARANTINE 中间态，标 legacy_source，FIFO 排除）。
 */
@Injectable()
export class PackagingInventoryIntegrationService {
  private readonly logger = new Logger(PackagingInventoryIntegrationService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly eggInv: EggInventoryService,
    private readonly modeSvc: InventorySourceModeService, // P1A 互斥门控
  ) {}

  private get operator(): string {
    try { return (this.cls.get('user') as any)?.username ?? 'packaging'; } catch { return 'packaging'; }
  }

  /**
   * 解析生产公司码（包装表无 company_code 列）：
   *   1) 显式参数 → 2) 环境变量 PRODUCTION_COMPANY_CODE
   *   → 3) 系统中唯一的销售客户公司码（单租户 Pilot 自动适配）
   *   → 4) 'ALL' 兜底
   */
  private async resolveCompanyCode(explicit?: string): Promise<string> {
    if (explicit) return explicit;
    if (process.env.PRODUCTION_COMPANY_CODE) return process.env.PRODUCTION_COMPANY_CODE;
    try {
      const rows = await this.ds.query(
        `SELECT company_code FROM sal_customers
          WHERE company_code IS NOT NULL
          GROUP BY company_code`,
      );
      if (rows.length === 1 && rows[0].company_code) return rows[0].company_code;
    } catch { /* 表不可用时兜底 */ }
    return 'ALL';
  }

  /** 读取可售等级集合（product_grades.is_saleable=true） */
  private async loadSaleableGrades(): Promise<Set<string>> {
    const set = new Set<string>();
    try {
      const rows: Array<{ grade_code: string; is_saleable: boolean }> = await this.ds.query(
        `SELECT grade_code, is_saleable FROM product_grades WHERE status = 'ACTIVE'`,
      );
      for (const r of rows) if (r.is_saleable) set.add(r.grade_code);
    } catch { /* product_grades 不可用 → 视为全部可售 */ }
    // 无主数据时的安全默认：常见可售等级
    if (set.size === 0) { ['AA', 'A', 'B', 'C', '0', '1', '2', '3'].forEach(g => set.add(g)); }
    return set;
  }

  /**
   * 包装完成 → 生成 Sales V2 可售库存批次（幂等）
   * @param taskNo  pkg_tasks.task_no（包装任务号）
   * @param opts    可选：companyCode（生产公司）、operator
   */
  async completePackagingBatch(
    taskNo: string,
    opts?: { companyCode?: string; operator?: string },
  ): Promise<{
    taskNo: string;
    idempotent: boolean;
    companyCode: string;
    batches: Array<{ batchNo: string; grade: string; qty: number; productCode: string }>;
    skippedNonSaleable: Array<{ grade: string; qty: number }>;
    totalInbound: number;
    /** P1A：当前来源模式；skippedByMode=true 表示非包装入库模式，本次未生成可售库存（互斥） */
    mode?: string;
    skippedByMode?: boolean;
  }> {
    // ── 幂等键：该包装任务是否已生成过可售批次 ──────────────────────────────
    const existing = await this.ds.query(
      `SELECT batch_no, product_code, quality_grade, qty
         FROM inv_batches
        WHERE packaging_batch_ref = $1 AND source_type = 'PACKAGING'`,
      [taskNo],
    );
    if (existing.length > 0) {
      this.logger.log(`[PkgInv] 任务 ${taskNo} 已入库（幂等跳过），批次数=${existing.length}`);
      return {
        taskNo,
        idempotent: true,
        companyCode: existing[0]?.company_code ?? 'ALL',
        batches: existing.map((b: any) => ({
          batchNo: b.batch_no, grade: b.quality_grade, qty: Number(b.qty), productCode: b.product_code,
        })),
        skippedNonSaleable: [],
        totalInbound: existing.reduce((s: number, b: any) => s + Number(b.qty), 0),
      };
    }

    // ── 读取包装任务 ──────────────────────────────────────────────────────────
    const taskRows = await this.ds.query(
      `SELECT task_no, grade_results, house_code, pack_spec, packed_qty, output_qty,
              created_at, shift_id
         FROM pkg_tasks
        WHERE task_no = $1 OR id::text = $1
        LIMIT 1`,
      [taskNo],
    );
    const task = taskRows[0];
    if (!task) throw new NotFoundException(`包装任务不存在：${taskNo}`);

    const companyCode = await this.resolveCompanyCode(opts?.companyCode);

    // ── P1A 互斥门控：仅 PACKAGING_INBOUND 模式允许包装完成生成可售库存 ──────────
    //   TEMP_PRODUCTION_INBOUND 模式下，库存由日产蛋入库生成，包装完成不再写可售库存（防双写）。
    const mode = await this.modeSvc.resolveMode({ siteCode: task.house_code ?? null, companyCode });
    if (mode !== 'PACKAGING_INBOUND') {
      this.logger.log(`[PkgInv] 任务 ${taskNo} 当前为 ${mode} 模式，跳过包装可售入库（互斥，防双写）`);
      return {
        taskNo, idempotent: false, companyCode,
        batches: [], skippedNonSaleable: [], totalInbound: 0,
        mode, skippedByMode: true,
      };
    }

    const eggDate = task.created_at
      ? new Date(task.created_at).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const collectionRef = task.shift_id ? `SHIFT-${task.shift_id}` : (task.house_code ?? null);

    // 解析等级产出
    const gr: Record<string, number> = (() => {
      const v = task.grade_results;
      if (!v) return {};
      try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return {}; }
    })();
    const saleable = await this.loadSaleableGrades();

    const grades = Object.entries(gr).filter(([, v]) => Number(v) > 0);
    const batches: Array<{ batchNo: string; grade: string; qty: number; productCode: string }> = [];
    const skippedNonSaleable: Array<{ grade: string; qty: number }> = [];

    // 无等级明细 → 用 packed_qty 整体入一条默认可售批次（等级 A）
    if (grades.length === 0) {
      const qty = Number(task.output_qty) || Number(task.packed_qty) || 0;
      if (qty > 0) {
        const b = await this.createSaleableBatch(
          companyCode, eggDate, 'A', qty, taskNo, collectionRef, task.pack_spec,
        );
        batches.push(b);
      }
    } else {
      for (const [gradeCode, qtyValue] of grades) {
        const qty = Math.max(0, Number(qtyValue) || 0);
        if (qty === 0) continue;
        if (!saleable.has(gradeCode)) { skippedNonSaleable.push({ grade: gradeCode, qty }); continue; }
        const b = await this.createSaleableBatch(
          companyCode, eggDate, gradeCode, qty, taskNo, collectionRef, task.pack_spec,
        );
        batches.push(b);
      }
    }

    const totalInbound = batches.reduce((s, b) => s + b.qty, 0);
    this.logger.log(
      `[PkgInv] 任务 ${taskNo} 包装入库完成 company=${companyCode} 可售批次=${batches.length} 入库=${totalInbound} 隔离等级=${skippedNonSaleable.length}`,
    );
    return { taskNo, idempotent: false, companyCode, batches, skippedNonSaleable, totalInbound, mode, skippedByMode: false };
  }

  /** 生成单条可售批次（走 EggInventoryService 统一命名 + FIFO 体系） */
  private async createSaleableBatch(
    companyCode: string,
    eggDate: string,
    gradeCode: string,
    qty: number,
    taskNo: string,
    collectionRef: string | null,
    packSpec: string | null,
  ): Promise<{ batchNo: string; grade: string; qty: number; productCode: string }> {
    const productCode = `PRD-EGG-${gradeCode}`;
    // Phase 1：保留 product_code=PRD-EGG-{grade} + grade_code_std，保证销售 FIFO PATH B（product+grade）可靠匹配；
    //          不传 skuCode（避免 createProductionBatch 以 SKU 反向覆盖 product_code），SKU 精确匹配留待 Phase 2。
    const batch = await this.eggInv.createProductionBatch({
      companyCode,
      eggDate,
      qualityGrade:       gradeCode,
      gradeCodeStd:       gradeCode,
      specCode:           packSpec ?? undefined,
      packagingSpec:      packSpec ?? undefined,
      productCode,
      qty,
      sourceNo:           taskNo,
      sourceType:         'PACKAGING',
      ledgerChangeType:   'PACKAGING_INBOUND',
      packagingBatchRef:  taskNo,
      collectionBatchRef: collectionRef ?? undefined,
    });
    return { batchNo: batch.batch_no, grade: gradeCode, qty, productCode };
  }
}
