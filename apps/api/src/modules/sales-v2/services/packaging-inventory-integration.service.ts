import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { EggInventoryService } from './egg-inventory.service';
import { InventorySourceModeService } from './inventory-source-mode.service'; // P1A 互斥门控
import { OrgOwnershipService } from '../../org/services/org-ownership.service';

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
  private async resolveCompanyCode(explicit?: string, mgr?: EntityManager): Promise<string> {
    if (explicit) return explicit;
    if (process.env.PRODUCTION_COMPANY_CODE) return process.env.PRODUCTION_COMPANY_CODE;
    try {
      const rows = await (mgr ?? this.ds).query(
        `SELECT company_code FROM sal_customers
          WHERE company_code IS NOT NULL
          GROUP BY company_code`,
      );
      if (rows.length === 1 && rows[0].company_code) return rows[0].company_code;
    } catch { /* 表不可用时兜底 */ }
    return 'ALL';
  }

  private async resolveTerminalCompanyCode(siteCode: string | null, explicit?: string, mgr?: EntityManager): Promise<string> {
    if (explicit) return explicit;
    if (siteCode) {
      const rows = await (mgr ?? this.ds).query(
        `SELECT company_code FROM ${OrgOwnershipService.FARM_TABLE}
          WHERE farm_code = $1 AND status = 'ACTIVE' AND company_code IS NOT NULL
          LIMIT 1`,
        [siteCode],
      );
      if (rows[0]?.company_code) return rows[0].company_code;
      throw new NotFoundException(`权威场站 ${siteCode} 未关联有效公司，禁止猜测公司码入账`);
    }
    return this.resolveCompanyCode(undefined, mgr);
  }

  /** 读取可售等级集合（product_grades.is_saleable=true） */
  private async loadSaleableGrades(mgr?: EntityManager): Promise<Set<string>> {
    const set = new Set<string>();
    try {
      const rows: Array<{ grade_code: string; is_saleable: boolean }> = await (mgr ?? this.ds).query(
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
   * @param items  Array<{grade, specName?, qty}>（grade 已归一化；specName 为规格名，用于解析 spec_code/sku_code）
   * @param opts   companyCode / siteCode（模式解析）/ eggDate / collectionRef
   *
   * R3：携带 specName → 解析 spec_code（packaging_specs.spec_name）+ sku_code（product_skus grade+spec）写入库存。
   */
  async generateSaleableFromOutputs(
    refNo: string,
    items: Array<{ grade: string; specName?: string | null; qty: number }>,
    opts?: {
      companyCode?: string;
      siteCode?: string | null;
      eggDate?: string;
      collectionRef?: string | null;
      packSpec?: string | null;
      /** 作业台成品交接必须真实入账，不能把“模式跳过”当成功。 */
      requireInventory?: boolean;
      warehouseCode?: string;
      locationCode?: string;
      manager?: EntityManager;
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
    const db = opts?.manager ?? this.ds;
    const existing = await db.query(
      `SELECT b.batch_no, b.product_code, b.quality_grade, b.qty, b.company_code,
              b.warehouse_code, b.location_code,
              COALESCE((SELECT SUM(l.qty_change) FROM inv_ledger l
                         WHERE l.batch_no IN (SELECT batch_no FROM inv_batches
                                               WHERE packaging_batch_ref = $1 AND source_type = 'PACKAGING')
                           AND l.change_type = 'PACKAGING_INBOUND'), 0)::int AS ledger_qty
         FROM inv_batches b
        WHERE b.packaging_batch_ref = $1 AND b.source_type = 'PACKAGING'`,
      [refNo],
    );
    if (existing.length > 0) {
      const mismatchedLocation = existing.some((b: any) =>
        (opts?.warehouseCode && b.warehouse_code !== opts.warehouseCode)
        || (opts?.locationCode && b.location_code !== opts.locationCode));
      if (mismatchedLocation) {
        throw new Error(`包装批次 ${refNo} 已入账，但仓库/库位与本次交接不一致，禁止按幂等成功处理`);
      }
      const existingQty = existing.reduce((sum: number, b: any) => sum + Number(b.qty), 0);
      if (Number(existing[0]?.ledger_qty || 0) !== existingQty) {
        throw new Error(`包装批次 ${refNo} 的批次与流水数量不一致，禁止按幂等成功处理`);
      }
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

    const companyCode = await this.resolveCompanyCode(opts?.companyCode, opts?.manager);

    // 包装完成遵守库存来源模式互斥：TEMP 模式由日产蛋入库负责库存，
    // 成品交接只落交接记录；PACKAGING 模式才由本链路生成可售库存。
    const modeScope = { siteCode: opts?.siteCode ?? null, companyCode };
    const mode = opts?.manager
      ? await this.modeSvc.resolveMode(modeScope, opts.manager)
      : await this.modeSvc.resolveMode(modeScope);
    if (mode !== 'PACKAGING_INBOUND' && !opts?.requireInventory) {
      this.logger.log(`[PkgInv] 包装批次 ${refNo} 当前为 ${mode} 模式，跳过包装可售入库（互斥，防双写）`);
      return {
        refNo, idempotent: false, companyCode,
        batches: [], skippedNonSaleable: [], totalInbound: 0,
        mode, skippedByMode: true,
      };
    }
    if (mode !== 'PACKAGING_INBOUND') {
      this.logger.warn(
        `[PkgInv] 包装批次 ${refNo} 来自成品交接，覆盖 ${mode} 模式并生成统一库存；` +
        '该交接以 packaging_batch_ref 保证幂等',
      );
    }

    const eggDate = opts?.eggDate || new Date().toISOString().slice(0, 10);
    const collectionRef = opts?.collectionRef ?? null;
    const saleable = await this.loadSaleableGrades(opts?.manager);

    // R3：按 (grade, specName) 聚合，保留规格维度
    const agg = new Map<string, { grade: string; specName: string | null; qty: number }>();
    for (const it of items || []) {
      const grade = String(it.grade || '').trim();
      const qty = Math.max(0, Math.round(Number(it.qty) || 0));
      if (!grade || qty === 0) continue;
      const specName = it.specName ? String(it.specName).trim() : null;
      const key = `${grade}__${specName ?? ''}`;
      const cur = agg.get(key);
      if (cur) cur.qty += qty; else agg.set(key, { grade, specName, qty });
    }

    const batches: Array<{ batchNo: string; grade: string; qty: number; productCode: string }> = [];
    const skippedNonSaleable: Array<{ grade: string; qty: number }> = [];

    for (const { grade, specName, qty } of agg.values()) {
      if (!saleable.has(grade)) { skippedNonSaleable.push({ grade, qty }); continue; }
      // R3：解析 spec_code（按规格名）+ sku_code（grade+spec），写入库存批次
      const specCode = await this.resolveSpecCode(specName, opts?.manager);
      const skuCode  = await this.resolveSku(grade, specCode, opts?.manager);
      const b = await this.createSaleableBatch(companyCode, eggDate, grade, qty, refNo, collectionRef, specCode, skuCode, opts);
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

    // 解析等级产出（无明细 → 用 output_qty/packed_qty 整体入等级 A）；规格取 task.pack_spec
    const gr: Record<string, number> = (() => {
      const v = task.grade_results;
      if (!v) return {};
      try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return {}; }
    })();
    let items: Array<{ grade: string; specName?: string | null; qty: number }> =
      Object.entries(gr)
        .filter(([, v]) => Number(v) > 0)
        .map(([k, v]) => ({ grade: k, specName: task.pack_spec ?? null, qty: Number(v) }));
    if (items.length === 0) {
      const qty = Number(task.output_qty) || Number(task.packed_qty) || 0;
      // 默认 'L'（一号蛋）— 2026-06-06 product_grades 回归孟赛业务口径后主流销售档
      if (qty > 0) items = [{ grade: 'L', specName: task.pack_spec ?? null, qty }];
    }

    const eggDate = task.created_at
      ? new Date(task.created_at).toISOString().slice(0, 10)
      : undefined;
    const collectionRef = task.shift_id ? `SHIFT-${task.shift_id}` : (task.house_code ?? null);

    const r = await this.generateSaleableFromOutputs(taskNo, items, {
      companyCode:   opts?.companyCode,
      siteCode:      task.house_code ?? null,
      eggDate,
      collectionRef,
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
    opts?: { companyCode?: string; warehouseCode?: string; locationCode?: string; manager?: EntityManager },
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
    if (!opts?.warehouseCode || !opts?.locationCode) {
      throw new NotFoundException('成品交接必须解析到真实仓库和库位，禁止使用默认占位码');
    }

    // 读取包装记录，并解析 shift → site 供 SITE 级库存来源模式门控使用。
    // legacy 数据库若仍缺 shift_id，则 helper 会降级到 company/group 模式。
    const rec = await this.loadTerminalPackingContext(packingCode, opts?.manager);
    if (!rec) {
      return { refNo: packingCode, idempotent: false, companyCode: 'ALL', batches: [], skippedNonSaleable: [], totalInbound: 0, note: `包装记录不存在：${packingCode}` };
    }

    // R3：完整解析 batches_json（保留 spec），归一化等级码，按 (grade, spec) 形成 items
    const batchesJson: Array<{ grade?: string; eggs?: number; spec?: string; specId?: string }> = (() => {
      const v = rec.batches_json;
      if (!v) return [];
      try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return []; }
    })();
    const keyMap = await this.buildGradeKeyMap(opts?.manager);
    const items: Array<{ grade: string; specName?: string | null; qty: number }> = [];
    for (const b of batchesJson) {
      if (!b?.grade) continue;
      const g = keyMap[b.grade] ?? b.grade;
      items.push({ grade: g, specName: b.spec ?? null, qty: Number(b.eggs || 0) });
    }

    const eggDate = rec.production_date
      ? new Date(rec.production_date).toISOString().slice(0, 10)
      : undefined;
    const collectionRef = rec.shift_id ? `SHIFT-${rec.shift_id}` : null;
    const companyCode = await this.resolveTerminalCompanyCode(rec.site_id ?? null, opts.companyCode, opts.manager);

    const r = await this.generateSaleableFromOutputs(packingCode, items, {
      companyCode,
      siteCode: rec.site_id ?? null,
      eggDate,
      collectionRef,
      warehouseCode: opts?.warehouseCode,
      locationCode: opts?.locationCode,
      manager: opts?.manager,
    });
    return r;
  }

  /**
   * 查询车间包装记录当前采用的库存来源模式。
   * 状态接口必须复用同一模式判定，否则 TEMP 模式确认后刷新会被误判为未入库。
   */
  async getTerminalInventoryMode(
    packingCode: string,
    opts?: { companyCode?: string },
  ): Promise<string> {
    const rec = await this.loadTerminalPackingContext(packingCode);
    const companyCode = await this.resolveCompanyCode(opts?.companyCode);
    return this.modeSvc.resolveMode({
      siteCode: rec?.site_id ?? null,
      companyCode,
    });
  }

  /** TEMP 模式交接前核对日产蛋批次与流水；数量必须与本包装记录完全一致。 */
  async verifyTerminalTempEvidence(packingCode: string, mgr?: EntityManager): Promise<{
    ok: boolean; expectedQty: number; batchQty: number; ledgerQty: number; batchCount: number;
  }> {
    const db = mgr ?? this.ds;
    const rec = await this.loadTerminalPackingContext(packingCode, mgr);
    if (!rec?.site_id || !rec?.production_date) {
      return { ok: false, expectedQty: 0, batchQty: 0, ledgerQty: 0, batchCount: 0 };
    }
    const expectedQty = (Array.isArray(rec.batches_json)
      ? rec.batches_json
      : (() => { try { return JSON.parse(rec.batches_json || '[]'); } catch { return []; } })())
      .reduce((sum: number, item: any) => sum + Math.max(0, Number(item?.eggs || 0)), 0);
    const [row] = await db.query(
      `WITH matched_batches AS (
         SELECT batch_no, qty FROM inv_batches
          WHERE source_type = 'TEMP_PRODUCTION'
            AND egg_date = $1::date
            AND (collection_batch_ref = $2
              OR collection_batch_ref IN (
              SELECT 'HOUSE-' || h.house_code FROM brd_houses h
               ${OrgOwnershipService.ACTIVE_FARM_JOIN}
               WHERE h.farm_code = $3 AND h.status = 'ACTIVE'
              ))
       )
       SELECT COUNT(*)::int AS batch_count,
              COALESCE(SUM(m.qty), 0)::int AS batch_qty,
              COALESCE((SELECT SUM(l.qty_change) FROM inv_ledger l
                         WHERE l.batch_no IN (SELECT batch_no FROM matched_batches)
                           AND l.change_type = 'TEMP_PRODUCTION_INBOUND'), 0)::int AS ledger_qty
         FROM matched_batches m`,
      [new Date(rec.production_date).toISOString().slice(0, 10), `SITE-${rec.site_id}`, rec.site_id],
    );
    const batchQty = Number(row?.batch_qty || 0);
    const ledgerQty = Number(row?.ledger_qty || 0);
    const batchCount = Number(row?.batch_count || 0);
    return { ok: expectedQty > 0 && batchCount > 0 && batchQty === expectedQty && ledgerQty === expectedQty,
      expectedQty, batchQty, ledgerQty, batchCount };
  }

  /**
   * 读取 Terminal 包装上下文。生产库已部署 shift_id；对尚未补列的 legacy
   * 数据库仅在 PostgreSQL undefined_column(42703) 时降级，其他 SQL 错误继续抛出。
   */
  private async loadTerminalPackingContext(packingCode: string, mgr?: EntityManager): Promise<any | null> {
    const db = mgr ?? this.ds;
    try {
      const rows = await db.query(
        `SELECT p.code, p.production_date, p.batches_json, p.shift_id, ws.site_id
           FROM pkg_packing_records p
           LEFT JOIN pkg_work_shifts ws ON ws.id = p.shift_id
          WHERE p.code = $1
          LIMIT 1`,
        [packingCode],
      );
      return rows[0] ?? null;
    } catch (error: any) {
      if (error?.code !== '42703') throw error;
      this.logger.warn(
        `[PkgInv] legacy pkg_packing_records 缺 shift_id，包装批次 ${packingCode} 回落 company/group 模式`,
      );
      const rows = await db.query(
        `SELECT code, production_date, batches_json
           FROM pkg_packing_records
          WHERE code = $1
          LIMIT 1`,
        [packingCode],
      );
      return rows[0] ?? null;
    }
  }

  /** R3：按规格名解析 packaging_specs.spec_code（用于写 inv_batches.spec_code / 解析 SKU） */
  private async resolveSpecCode(specName: string | null, mgr?: EntityManager): Promise<string | null> {
    if (!specName) return null;
    try {
      const rows = await (mgr ?? this.ds).query(
        `SELECT spec_code FROM packaging_specs WHERE spec_name = $1 LIMIT 1`, [specName],
      );
      return rows[0]?.spec_code ?? null;
    } catch { return null; }
  }

  /** R3：按 (grade, spec_code) 解析 product_skus.sku_code（用于 FIFO PATH A 精确匹配） */
  private async resolveSku(gradeCode: string, specCode: string | null, mgr?: EntityManager): Promise<string | null> {
    if (!specCode) return null;
    try {
      const rows = await (mgr ?? this.ds).query(
        `SELECT sku_code FROM product_skus
          WHERE grade_code = $1 AND spec_code = $2 AND status = 'ACTIVE' LIMIT 1`,
        [gradeCode, specCode],
      );
      return rows[0]?.sku_code ?? null;
    } catch { return null; }
  }

  /** 构建等级归一化映射：PKG_EGG_GRADE 字典 config_json.code/terminalCode → dict_code */
  private async buildGradeKeyMap(mgr?: EntityManager): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    try {
      const dictRows = await (mgr ?? this.ds).query(
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
    specCode: string | null,
    skuCode: string | null,
    opts?: { warehouseCode?: string; locationCode?: string; manager?: EntityManager },
  ): Promise<{ batchNo: string; grade: string; qty: number; productCode: string }> {
    const productCode = `PRD-EGG-${gradeCode}`;
    // R3：写入 spec_code（按规格）+ sku_code（grade+spec 解析）。
    //   product_skus.product_code 已对齐 PRD-EGG-{grade}，故即使 createProductionBatch 以 SKU 反解
    //   product_code，也与 PATH B(product+grade) 一致；sku_code 为空时回退 PATH B。
    const batch = await this.eggInv.createProductionBatch({
      companyCode,
      warehouseCode: opts?.warehouseCode,
      locationCode: opts?.locationCode,
      eggDate,
      qualityGrade:       gradeCode,
      gradeCodeStd:       gradeCode,
      specCode:           specCode ?? undefined,
      packagingSpec:      specCode ?? undefined,
      productCode,
      qty,
      sourceNo:           taskNo,
      sourceType:         'PACKAGING',
      ledgerChangeType:   'PACKAGING_INBOUND',
      packagingBatchRef:  taskNo,
      collectionBatchRef: collectionRef ?? undefined,
      skuCode:            skuCode ?? undefined,
    }, opts?.manager);
    return { batchNo: batch.batch_no, grade: gradeCode, qty, productCode };
  }
}
