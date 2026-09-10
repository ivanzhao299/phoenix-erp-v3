import { resolvePackagingIdentity, PackagingIdentity } from '../../bff/packaging-readiness';
import { assertPackingCanEnterInventory, lockPacking } from '../../bff/packaging-protection';
import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
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
    if (siteCode) {
      const rows = await (mgr ?? this.ds).query(
        `SELECT company_code FROM ${OrgOwnershipService.FARM_TABLE}
          WHERE farm_code = $1 AND status = 'ACTIVE' AND company_code IS NOT NULL
          LIMIT 1`,
        [siteCode],
      );
      if (rows[0]?.company_code) {
        if (explicit && explicit !== rows[0].company_code) throw new ConflictException('公司与权威场站不匹配');
        return rows[0].company_code;
      }
      throw new NotFoundException(`权威场站 ${siteCode} 未关联有效公司，禁止猜测公司码入账`);
    }
    throw new ConflictException('包装班次缺权威场站，禁止猜测公司');
  }

  /**
   * 【收口核心 · P1C】按等级产出生成 Sales V2 可售库存批次（幂等 + 模式门控）
   *
   * 与具体来源（pkg_tasks / BFF 车间流 pkg_packing_records）解耦：调用方只需提供
   * 等级→数量 映射与上下文，本方法负责 幂等 / 互斥门控 / 不可售隔离 / 统一命名。
   *
   * @param refNo        幂等键（包装任务号 task_no 或 BFF 包装记录号 packingCode）→ 写入 packaging_batch_ref
   * @param items  grade + 稳定 specCode/specId + 展示名。新链路以编码为权威，名称仅兼容旧记录。
   * @param opts   companyCode / siteCode（模式解析）/ eggDate / collectionRef
   *
   * R3：携带 specName → 解析 spec_code（packaging_specs.spec_name）+ sku_code（product_skus grade+spec）写入库存。
   */
  async generateSaleableFromOutputs(
    refNo: string,
    items: Array<PackagingIdentity & { qty: number; boxes?: number }>,
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
    if (!opts?.eggDate || !/^\d{4}-\d{2}-\d{2}$/.test(opts.eggDate)) throw new ConflictException('包装权威生产日期缺失或无效');
    if (!opts?.manager) return this.ds.transaction(manager => this.generateSaleableFromOutputs(refNo, items, { ...opts, manager }));
    await opts.manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, ['packaging-chain:false']);
    await lockPacking(opts.manager, refNo);
    const terminalRows = await opts.manager.query(`SELECT code FROM pkg_packing_records WHERE code=$1`, [refNo]);
    if (terminalRows.length || refNo.startsWith('PKG-')) await assertPackingCanEnterInventory(opts.manager, refNo);
    const db = opts.manager;
    const companyCode = await this.resolveCompanyCode(opts.companyCode, db);
    // Resolve every output before the first inventory write, including historical JSON without identities.
    const resolved = new Map<string, Awaited<ReturnType<typeof resolvePackagingIdentity>> & { qty: number }>();
    for (const item of items) {
      if (!Number.isSafeInteger(item.qty) || item.qty <= 0) throw new ConflictException('包装产出数量必须为正整数');
      const identity = await resolvePackagingIdentity(db, item);
      if (item.boxes !== undefined && item.qty !== item.boxes * identity.qtyPerUnit) throw new ConflictException('包装枚数与规格箱数不一致');
      const key = `${identity.skuCode}/${identity.specCode}`;
      const previous = resolved.get(key);
      resolved.set(key, { ...identity, qty: (previous?.qty || 0) + item.qty });
    }
    if (!resolved.size) throw new ConflictException('包装缺有效产出');
    const existing = await db.query(`SELECT b.*, b.egg_date::text AS egg_date_text, b.inbound_date::text AS inbound_date_text FROM inv_batches b WHERE b.packaging_batch_ref=$1 OR b.source_no=$1`, [refNo]);
    const ledger = await db.query(`SELECT l.* FROM inv_ledger l WHERE l.change_type='PACKAGING_INBOUND'
      AND (l.ref_no=$1 OR l.batch_no=ANY($2::text[]))`, [refNo, existing.map((b: any) => b.batch_no)]);
    if (existing.length || ledger.length) {
      const expected = new Map(resolved);
      for (const b of existing) {
        const key = `${b.sku_code}/${b.spec_code}`;
        const item = expected.get(key);
        const entries = ledger.filter((l: any) => l.batch_no === b.batch_no);
        if (!item || b.source_type !== 'PACKAGING' || b.packaging_batch_ref !== refNo
          || (b.egg_date_text !== opts.eggDate || b.inbound_date_text !== opts.eggDate)
          || b.product_code !== item.productCode || b.grade_code_std !== item.grade || Number(b.qty) !== item.qty
          || b.company_code !== companyCode || b.warehouse_code !== opts.warehouseCode || b.location_code !== opts.locationCode
          || entries.length !== 1 || entries.some((l: any) => l.ref_no !== refNo || Number(l.qty_change) !== item.qty
            || l.sku_code !== item.skuCode || l.company_code !== companyCode
            || l.warehouse_code !== opts.warehouseCode || l.location_code !== opts.locationCode)) {
          throw new ConflictException('既有库存或流水与预期逐SKU数量/归属不一致，禁止补余或重建');
        }
        expected.delete(key);
      }
      if (expected.size || ledger.length !== existing.length) throw new ConflictException('既有入库证据不完整，禁止补余或重建');
      return { refNo, idempotent: true, companyCode,
        batches: existing.map((b: any) => ({ batchNo: b.batch_no, grade: b.grade_code_std, qty: Number(b.qty), productCode: b.product_code })),
        skippedNonSaleable: [], totalInbound: existing.reduce((sum: number, b: any) => sum + Number(b.qty), 0) };
    }

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
    if (mode !== 'PACKAGING_INBOUND') throw new ConflictException('当前来源模式禁止包装生成库存');

    const eggDate = opts.eggDate;
    const collectionRef = opts?.collectionRef ?? null;
    const batches: Array<{ batchNo: string; grade: string; qty: number; productCode: string }> = [];
    const skippedNonSaleable: Array<{ grade: string; qty: number }> = [];
    for (const item of resolved.values()) {
      batches.push(await this.createSaleableBatch(companyCode, eggDate, item.grade, item.qty, refNo,
        collectionRef, item.specCode, item.skuCode, item.productCode, opts));
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
    if (!opts?.manager) return this.ds.transaction(manager => this.completeTerminalPacking(packingCode, { ...opts, manager }));
    await opts.manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, ['packaging-chain:false']);
    await lockPacking(opts.manager, packingCode);
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
    const batchesJson: Array<{ grade?: string; boxes?: number; eggs?: number; spec?: string; specId?: string; productCode?: string; skuCode?: string }> = (() => {
      const v = rec.batches_json;
      if (!v) return [];
      try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return []; }
    })();
    const keyMap = await this.buildGradeKeyMap(opts?.manager);
    const items: Array<PackagingIdentity & { qty: number; boxes?: number }> = [];
    for (const b of batchesJson) {
      if (!b?.grade) continue;
      const g = keyMap[b.grade] ?? b.grade;
      items.push({ boxes: b.boxes, productCode: b.productCode, skuCode: b.skuCode, grade: g, specCode: b.specId ?? null, specName: b.spec ?? null, qty: Number(b.eggs || 0) });
    }

    const eggDate = rec.production_date_text ?? (typeof rec.production_date === 'string' ? rec.production_date.slice(0,10) : undefined);
    if (!eggDate || !/^\d{4}-\d{2}-\d{2}$/.test(eggDate)) throw new ConflictException('包装业务日期无效');
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
      [rec.production_date_text ?? rec.production_date, `SITE-${rec.site_id}`, rec.site_id],
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
    await assertPackingCanEnterInventory(db, packingCode);
    const rows = await db.query(`SELECT p.*, p.production_date::text AS production_date_text, ws.site_id FROM pkg_packing_records p
      LEFT JOIN pkg_work_shifts ws ON ws.id=p.shift_id WHERE p.code=$1`, [packingCode]);
    return rows[0] ?? null;
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
    productCode: string,
    opts?: { warehouseCode?: string; locationCode?: string; manager?: EntityManager },
  ): Promise<{ batchNo: string; grade: string; qty: number; productCode: string }> {
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
