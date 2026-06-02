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
   * 【收口核心 · P1C】按等级产出生成 Sales V2 可售库存批次（幂等 + 模式门控）
   *
   * 与具体来源（pkg_tasks / BFF 车间流 pkg_packing_records）解耦：调用方只需提供
   * 等级→数量 映射与上下文，本方法负责 幂等 / 互斥门控 / 不可售隔离 / 统一命名。
   *
   * @param refNo        幂等键（包装任务号 task_no 或 BFF 包装记录号 packingCode）→ 写入 packaging_batch_ref
   * @param gradeOutputs 等级→数量（已归一化为标准 grade_code）
   * @param opts         companyCode / siteCode（模式解析）/ eggDate / collectionRef / packSpec
   */
  async generateSaleableFromOutputs(
    refNo: string,
    gradeOutputs: Record<string, number>,
    opts?: {
      companyCode?: string;
      siteCode?: string | null;
      eggDate?: string;
      collectionRef?: string | null;
      packSpec?: string | null;
    },
  ): Promise<{
    refNo: string;
    idempotent: boolean;
    companyCode: string;
    batches: Array<{ batchNo: string; grade: string; qty: number; productCode: string }>;
    skippedNonSaleable: Array<{ grade: string; qty: number }>;
    totalInbound: number;
    /** P1A：当前来源模式；skippedByMode=true 表示非包装入库模式，本次未生成可售库存（互斥） */
    mode?: string;
    skippedByMode?: boolean;
  }> {
    // ── 幂等键：该包装批次是否已生成过可售批次 ──────────────────────────────
    const existing = await this.ds.query(
      `SELECT batch_no, product_code, quality_grade, qty, company_code
         FROM inv_batches
        WHERE packaging_batch_ref = $1 AND source_type = 'PACKAGING'`,
      [refNo],
    );
    if (existing.length > 0) {
      this.logger.log(`[PkgInv] 包装批次 ${refNo} 已入库（幂等跳过），批次数=${existing.length}`);
      return {
        refNo,
        idempotent: true,
        companyCode: existing[0]?.company_code ?? 'ALL',
        batches: existing.map((b: any) => ({
          batchNo: b.batch_no, grade: b.quality_grade, qty: Number(b.qty), productCode: b.product_code,
        })),
        skippedNonSaleable: [],
        totalInbound: existing.reduce((s: number, b: any) => s + Number(b.qty), 0),
      };
    }

    const companyCode = await this.resolveCompanyCode(opts?.companyCode);

    // ── P1A 互斥门控：仅 PACKAGING_INBOUND 模式允许包装完成生成可售库存（SITE 级灰度）──
    //   TEMP_PRODUCTION_INBOUND 模式下，库存由日产蛋入库生成，包装完成不再写可售库存（防双写）。
    const mode = await this.modeSvc.resolveMode({ siteCode: opts?.siteCode ?? null, companyCode });
    if (mode !== 'PACKAGING_INBOUND') {
      this.logger.log(`[PkgInv] 包装批次 ${refNo} 当前为 ${mode} 模式，跳过包装可售入库（互斥，防双写）`);
      return {
        refNo, idempotent: false, companyCode,
        batches: [], skippedNonSaleable: [], totalInbound: 0,
        mode, skippedByMode: true,
      };
    }

    const eggDate = opts?.eggDate || new Date().toISOString().slice(0, 10);
    const collectionRef = opts?.collectionRef ?? null;
    const packSpec = opts?.packSpec ?? null;
    const saleable = await this.loadSaleableGrades();

    const batches: Array<{ batchNo: string; grade: string; qty: number; productCode: string }> = [];
    const skippedNonSaleable: Array<{ grade: string; qty: number }> = [];

    for (const [gradeCode, qtyValue] of Object.entries(gradeOutputs)) {
      const qty = Math.max(0, Math.round(Number(qtyValue) || 0));
      if (qty === 0) continue;
      if (!saleable.has(gradeCode)) { skippedNonSaleable.push({ grade: gradeCode, qty }); continue; }
      const b = await this.createSaleableBatch(companyCode, eggDate, gradeCode, qty, refNo, collectionRef, packSpec);
      batches.push(b);
    }

    const totalInbound = batches.reduce((s, b) => s + b.qty, 0);
    this.logger.log(
      `[PkgInv] 包装批次 ${refNo} 入库完成 company=${companyCode} 可售批次=${batches.length} 入库=${totalInbound} 隔离等级=${skippedNonSaleable.length}`,
    );
    return { refNo, idempotent: false, companyCode, batches, skippedNonSaleable, totalInbound, mode, skippedByMode: false };
  }

  /**
   * 包装完成（Admin/Service 流 pkg_tasks）→ 生成 Sales V2 可售库存批次（幂等）。
   * 保留原行为：读 pkg_tasks 后委托 generateSaleableFromOutputs（幂等键仍为 task_no）。
   * @param taskNo  pkg_tasks.task_no（包装任务号）
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
    mode?: string;
    skippedByMode?: boolean;
  }> {
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

    // 解析等级产出（无明细 → 用 output_qty/packed_qty 整体入等级 A）
    const gr: Record<string, number> = (() => {
      const v = task.grade_results;
      if (!v) return {};
      try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return {}; }
    })();
    let gradeOutputs = Object.fromEntries(
      Object.entries(gr).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]),
    );
    if (Object.keys(gradeOutputs).length === 0) {
      const qty = Number(task.output_qty) || Number(task.packed_qty) || 0;
      if (qty > 0) gradeOutputs = { A: qty };
    }

    const eggDate = task.created_at
      ? new Date(task.created_at).toISOString().slice(0, 10)
      : undefined;
    const collectionRef = task.shift_id ? `SHIFT-${task.shift_id}` : (task.house_code ?? null);

    const r = await this.generateSaleableFromOutputs(taskNo, gradeOutputs, {
      companyCode:   opts?.companyCode,
      siteCode:      task.house_code ?? null,
      eggDate,
      collectionRef,
      packSpec:      task.pack_spec ?? null,
    });
    return { ...r, taskNo: r.refNo };
  }

  /**
   * 【收口入口 · P1C】BFF 真实车间流 成品交接 → 生成 Sales V2 可售库存（幂等）。
   * 数据源为 BFF 包装记录 pkg_packing_records.batches_json（[{grade, eggs}]），
   * 不依赖 Admin 流的 pkg_tasks。幂等键 = packingCode。
   *
   * @param packingCode  pkg_packing_records.code（PKG-*），作为幂等键写入 packaging_batch_ref
   */
  async completeTerminalPacking(
    packingCode: string,
    opts?: { companyCode?: string },
  ): Promise<{
    refNo: string;
    idempotent: boolean;
    companyCode: string;
    batches: Array<{ batchNo: string; grade: string; qty: number; productCode: string }>;
    skippedNonSaleable: Array<{ grade: string; qty: number }>;
    totalInbound: number;
    mode?: string;
    skippedByMode?: boolean;
    note?: string;
  }> {
    if (!packingCode) {
      return { refNo: '', idempotent: false, companyCode: 'ALL', batches: [], skippedNonSaleable: [], totalInbound: 0, note: '无 packingCode，跳过库存生成' };
    }

    // 读取包装记录
    const rows = await this.ds.query(
      `SELECT code, production_date, batches_json, shift_id
         FROM pkg_packing_records WHERE code = $1 LIMIT 1`,
      [packingCode],
    );
    const rec = rows[0];
    if (!rec) {
      return { refNo: packingCode, idempotent: false, companyCode: 'ALL', batches: [], skippedNonSaleable: [], totalInbound: 0, note: `包装记录不存在：${packingCode}` };
    }

    // 解析 batches_json → 按等级累加（归一化等级码）
    const batchesJson: Array<{ grade?: string; eggs?: number }> = (() => {
      const v = rec.batches_json;
      if (!v) return [];
      try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return []; }
    })();
    const keyMap = await this.buildGradeKeyMap();
    const gradeOutputs: Record<string, number> = {};
    for (const b of batchesJson) {
      if (!b?.grade) continue;
      const g = keyMap[b.grade] ?? b.grade;
      gradeOutputs[g] = (gradeOutputs[g] || 0) + Number(b.eggs || 0);
    }

    // 解析 site（pkg_work_shifts.site_id）用于 SITE 级模式门控
    let siteCode: string | null = null;
    if (rec.shift_id) {
      const ws = await this.ds.query(
        `SELECT site_id FROM pkg_work_shifts WHERE id = $1 LIMIT 1`, [rec.shift_id],
      );
      siteCode = ws[0]?.site_id ?? null;
    }

    const eggDate = rec.production_date
      ? new Date(rec.production_date).toISOString().slice(0, 10)
      : undefined;
    const collectionRef = rec.shift_id ? `SHIFT-${rec.shift_id}` : null;

    const r = await this.generateSaleableFromOutputs(packingCode, gradeOutputs, {
      companyCode: opts?.companyCode,
      siteCode,
      eggDate,
      collectionRef,
    });
    return r;
  }

  /** 构建等级归一化映射：PKG_EGG_GRADE 字典 config_json.code/terminalCode → dict_code */
  private async buildGradeKeyMap(): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    try {
      const dictRows = await this.ds.query(
        `SELECT dict_code, config_json FROM sys_dict WHERE dict_type IN ('PKG_EGG_GRADE','PKG_EGG_DEFECT')`,
      );
      for (const d of dictRows || []) {
        const dc = d.dict_code as string;
        map[dc] = dc;
        try {
          const cfg = typeof d.config_json === 'string' ? JSON.parse(d.config_json) : (d.config_json ?? {});
          if (cfg.code)         map[String(cfg.code)]         = dc;
          if (cfg.terminalCode) map[String(cfg.terminalCode)] = dc;
        } catch { /* ignore */ }
      }
    } catch { /* 字典不可用 → 恒等映射 */ }
    return map;
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
