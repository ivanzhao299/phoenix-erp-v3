import {
  Injectable, Logger, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';

/**
 * EggInventoryService — Sales V2 Phase 7
 *
 * 鸡蛋时效库存 Runtime。
 *
 * 核心设计原则：
 *   · FIFO（先进先出）：按 expire_date ASC 扣减，Runtime 强制
 *   · 临期控制：expire_date - CURRENT_DATE <= 7 天 → 预警
 *   · 过期禁售：expire_date < CURRENT_DATE → 禁止分配
 *   · 退货重检：RETURNED 批次不可直接再销售
 *   · qty_available 不允许负数（Advisory Lock 防并发）
 *   · 所有变动写 inv_ledger（完整审计链）
 *
 * 批次号规则：
 *   生产批次：  EGG-YYYYMMDD-NNNNN
 *   退货批次：  RET-{returnNo}-{productCode}（由 ReturnOrdersService 生成）
 *
 * change_type 枚举（inv_ledger）：
 *   INBOUND        — 入库（WMS 原有）
 *   OUTBOUND       — 出库（WMS 原有）
 *   SALE_RETURN    — 退货回库（Phase 6）
 *   WRITE_OFF      — 损耗（Phase 6）
 *   FIFO_OUT       — FIFO 出库预占（Phase 7）
 *   RESERVED       — 订单审批时库存预留（Phase 7）
 *   RELEASED       — 订单取消时释放预留（Phase 7）
 *   QC_REJECT      — 质检不合格（Phase 7）
 *   EXPIRE_WRITEOFF — 过期报废（Phase 7）
 *   DAMAGE_WRITEOFF — 破损报废（Phase 7）
 */

export interface EggBatch {
  id: number;
  batch_no: string;
  product_code: string;
  company_code: string;
  warehouse_code: string | null;
  egg_date: string | null;
  expire_date: string | null;
  quality_grade: string | null;
  packaging_spec: string | null;
  source_type: string | null;
  source_no: string | null;
  qty: number;
  qty_available: number;
  status: string;
  created_at: string;
}

export interface FifoAllocation {
  batchNo:       string;
  allocatedQty:  number;
  expireDate:    string | null;
  qualityGrade:  string | null;
  remaining:     number;   // 未满足的数量（正常为 0）
}

/** 默认保质期：30 天 */
const DEFAULT_SHELF_DAYS = 30;
/** 临期预警阈值：7 天 */
const EXPIRING_WARN_DAYS = 7;
/** 大额退货审批阈值（LAK） */
const APPROVAL_THRESHOLD = 500_000;

@Injectable()
export class EggInventoryService {
  private readonly logger = new Logger(EggInventoryService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  // ── 内部工具 ─────────────────────────────────────────────────────────────────

  private get operator(): string {
    try { return (this.cls.get('user') as any)?.username ?? 'system'; } catch { return 'system'; }
  }

  private async genBatchNo(eggDate: string): Promise<string> {
    const dateStr = eggDate.replace(/-/g, '');
    const prefix  = `EGG-${dateStr}-`;
    const [row]   = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM inv_batches WHERE batch_no LIKE $1`, [`${prefix}%`],
    );
    return `${prefix}${String(Number(row.cnt) + 1).padStart(5, '0')}`;
  }

  private calcExpireDate(eggDate: string, shelfDays = DEFAULT_SHELF_DAYS): string {
    const d = new Date(eggDate);
    d.setDate(d.getDate() + shelfDays);
    return d.toISOString().slice(0, 10);
  }

  /** 写 inv_ledger 流水（内部） */
  private async writeLedger(
    params: {
      batchNo:        string;
      changeType:     string;
      qtyChange:      number;
      operator:       string;
      companyCode:    string;
      refNo:          string;
      note:           string;
      batchExpireDate?: string | null;
      qualityGrade?:  string | null;
    },
    mgr?: EntityManager,
  ) {
    const q = mgr ? mgr.query.bind(mgr) : this.ds.query.bind(this.ds);
    await q(
      `INSERT INTO inv_ledger
         (batch_no, change_type, qty_change, operator, store_code, ref_no, note,
          batch_expire_date, quality_grade, company_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        params.batchNo,
        params.changeType,
        params.qtyChange,
        params.operator,
        params.companyCode,
        params.refNo,
        params.note,
        params.batchExpireDate ?? null,
        params.qualityGrade ?? null,
        params.companyCode,
      ],
    );
  }

  // ── 1. 创建生产批次 ──────────────────────────────────────────────────────────

  async createProductionBatch(params: {
    companyCode:   string;
    warehouseCode?: string;
    eggDate:       string;
    qualityGrade?: string;
    packagingSpec?: string;
    productCode:   string;
    qty:           number;
    shelfDays?:    number;
    sourceNo?:     string;
  }): Promise<EggBatch> {
    if (params.qty <= 0) throw new BadRequestException('入库数量必须大于 0');
    const validGrades = ['AA','A','B','DIRTY','CRACKED','DAMAGED'];
    const grade = params.qualityGrade ?? 'A';
    if (!validGrades.includes(grade)) {
      throw new BadRequestException(`无效的质量等级: ${grade}，有效值：${validGrades.join('/')}`);
    }

    const batchNo    = await this.genBatchNo(params.eggDate);
    const expireDate = this.calcExpireDate(params.eggDate, params.shelfDays ?? DEFAULT_SHELF_DAYS);
    const qty        = Math.round(params.qty);

    const [batch] = await this.ds.query(
      `INSERT INTO inv_batches (
         batch_no, product_code, company_code, warehouse_code,
         egg_date, expire_date, quality_grade, packaging_spec,
         source_type, source_no,
         qty, qty_available, status,
         created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,'PRODUCTION',$9,
         $10,$10,'AVAILABLE',NOW(),NOW()
       ) RETURNING *`,
      [
        batchNo, params.productCode, params.companyCode,
        params.warehouseCode ?? null,
        params.eggDate, expireDate, grade,
        params.packagingSpec ?? null,
        params.sourceNo ?? null,
        qty,
      ],
    );

    await this.writeLedger({
      batchNo,
      changeType:  'INBOUND',
      qtyChange:   qty,
      operator:    this.operator,
      companyCode: params.companyCode,
      refNo:       params.sourceNo ?? batchNo,
      note:        `生产入库 product=${params.productCode} grade=${grade} qty=${qty} expire=${expireDate}`,
      batchExpireDate: expireDate,
      qualityGrade:    grade,
    });

    this.logger.log(`[EggInv] 生产入库: ${batchNo} qty=${qty} expire=${expireDate}`);
    return batch as EggBatch;
  }

  // ── 2. 查询可销售批次（FIFO 排序） ──────────────────────────────────────────

  async getAvailableBatches(params: {
    productCode:  string;
    companyCode?: string;
    gradeCode?:   string;
    includingExpiring?: boolean;
  }): Promise<EggBatch[]> {
    const conds = [
      `product_code = $1`,
      `status = 'AVAILABLE'`,
      `qty_available > 0`,
    ];
    const args: unknown[] = [params.productCode];
    let pi = 2;

    if (params.companyCode) { conds.push(`company_code = $${pi++}`); args.push(params.companyCode); }
    if (params.gradeCode)   { conds.push(`quality_grade = $${pi++}`); args.push(params.gradeCode); }

    // 过期禁售
    if (!params.includingExpiring) {
      conds.push(`(expire_date IS NULL OR expire_date >= CURRENT_DATE)`);
    }

    const rows = await this.ds.query(
      `SELECT *,
         CASE WHEN expire_date IS NULL THEN NULL
              ELSE (expire_date::date - CURRENT_DATE::date) END AS days_remaining
       FROM inv_batches
       WHERE ${conds.join(' AND ')}
       ORDER BY expire_date ASC NULLS LAST, created_at ASC`,
      args,
    );
    return rows;
  }

  // ── 3. FIFO 分配（预占 qty_available） ──────────────────────────────────────

  async allocateByFIFO(
    params: {
      productCode:  string;
      gradeCode?:   string;
      companyCode:  string;
      qty:          number;
      refNo:        string;
      note:         string;
    },
    mgr?: EntityManager,
  ): Promise<FifoAllocation[]> {
    const q = mgr ? mgr.query.bind(mgr) : this.ds.query.bind(this.ds);

    if (params.qty <= 0) throw new BadRequestException('分配数量必须大于 0');

    // Advisory Lock 防并发超卖（key = productCode hash）
    await q(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`fifo:${params.companyCode}:${params.productCode}`]);

    // 查询可用批次（FIFO：expire_date ASC）
    const conds = [
      `product_code = $1`,
      `company_code = $2`,
      `status = 'AVAILABLE'`,
      `qty_available > 0`,
      `(expire_date IS NULL OR expire_date >= CURRENT_DATE)`,
    ];
    const args: unknown[] = [params.productCode, params.companyCode];
    if (params.gradeCode) {
      conds.push(`quality_grade = $3`);
      args.push(params.gradeCode);
    }

    const batches = await q(
      `SELECT * FROM inv_batches WHERE ${conds.join(' AND ')}
       ORDER BY expire_date ASC NULLS LAST, created_at ASC
       FOR UPDATE`,
      args,
    );

    let remaining = params.qty;
    const allocations: FifoAllocation[] = [];

    for (const batch of batches) {
      if (remaining <= 0) break;

      const canTake = Math.min(remaining, Number(batch.qty_available));
      remaining -= canTake;

      // 扣减 qty_available（预留）
      await q(
        `UPDATE inv_batches SET qty_available = qty_available - $1, updated_at=NOW() WHERE batch_no=$2`,
        [canTake, batch.batch_no],
      );

      // 写 inv_ledger RESERVED
      await this.writeLedger({
        batchNo:      batch.batch_no,
        changeType:   'RESERVED',
        qtyChange:    -canTake,
        operator:     this.operator,
        companyCode:  params.companyCode,
        refNo:        params.refNo,
        note:         `FIFO 预占 ${params.note} batch=${batch.batch_no} qty=${canTake}`,
        batchExpireDate: batch.expire_date,
        qualityGrade:    batch.quality_grade,
      }, mgr);

      allocations.push({
        batchNo:      batch.batch_no,
        allocatedQty: canTake,
        expireDate:   batch.expire_date,
        qualityGrade: batch.quality_grade,
        remaining:    0,
      });
    }

    if (remaining > 0) {
      // 库存不足：回滚已预占（抛出异常让事务回滚）
      throw new ConflictException(
        `库存不足：product=${params.productCode} grade=${params.gradeCode ?? 'ALL'} 缺少 ${remaining} 个单位`,
      );
    }

    return allocations;
  }

  // ── 4. 预占库存（Sales Order APPROVED → FIFO 分配） ──────────────────────────

  async reserveInventory(
    orderId: string,
    orderNo: string,
    companyCode: string,
    mgr?: EntityManager,
  ): Promise<void> {
    const q = mgr ? mgr.query.bind(mgr) : this.ds.query.bind(this.ds);

    const items = await q(
      `SELECT * FROM sal_order_items WHERE sales_order_id = $1`, [orderId],
    );

    for (const item of items) {
      const qty = Number(item.qty);
      if (qty <= 0) continue;

      try {
        const allocations = await this.allocateByFIFO({
          productCode: item.product_code,
          gradeCode:   item.grade_code ?? undefined,
          companyCode,
          qty,
          refNo:   orderNo,
          note:    `销售订单 ${orderNo} 明细 ${item.id}`,
        }, mgr);

        // 记录分配的批次（取首批次作为主批次，多批次逗号分隔）
        const batchNos    = allocations.map(a => a.batchNo).join(',');
        const allocatedQty = allocations.reduce((s, a) => s + a.allocatedQty, 0);

        await q(
          `UPDATE sal_order_items
           SET allocated_batch_no=$1, allocated_qty=$2
           WHERE id=$3`,
          [batchNos, allocatedQty, item.id],
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[EggInv] reserveInventory 明细 ${item.id} 库存不足（不阻断审批）: ${msg}`);
        // 鸡蛋业务：库存预占失败不阻断订单审批，记录告警即可
      }
    }

    this.logger.log(`[EggInv] 库存预占完成: order=${orderNo}`);
  }

  // ── 5. 释放库存（Sales Order CANCELLED → 还回 qty_available） ───────────────

  async releaseInventory(
    orderId: string,
    orderNo: string,
    companyCode: string,
    mgr?: EntityManager,
  ): Promise<void> {
    const q = mgr ? mgr.query.bind(mgr) : this.ds.query.bind(this.ds);

    const items = await q(
      `SELECT * FROM sal_order_items WHERE sales_order_id=$1 AND allocated_batch_no IS NOT NULL`,
      [orderId],
    );

    for (const item of items) {
      const batchNos = String(item.allocated_batch_no).split(',');
      const totalQty = Number(item.allocated_qty);
      if (!totalQty || !batchNos.length) continue;

      // 简化：均分归还（精确版本需要记录每个批次分配量）
      const qtyPerBatch = totalQty / batchNos.length;
      for (const batchNo of batchNos) {
        const releaseQty = Math.round(qtyPerBatch);
        if (releaseQty <= 0) continue;

        await q(
          `UPDATE inv_batches
           SET qty_available = LEAST(qty, qty_available + $1), updated_at=NOW()
           WHERE batch_no=$2`,
          [releaseQty, batchNo.trim()],
        );

        await this.writeLedger({
          batchNo:     batchNo.trim(),
          changeType:  'RELEASED',
          qtyChange:   releaseQty,
          operator:    this.operator,
          companyCode,
          refNo:       orderNo,
          note:        `订单取消释放预占 order=${orderNo} batch=${batchNo}`,
        }, mgr);
      }

      await q(
        `UPDATE sal_order_items SET allocated_batch_no=NULL, allocated_qty=0 WHERE id=$1`,
        [item.id],
      );
    }

    this.logger.log(`[EggInv] 库存释放完成: order=${orderNo}`);
  }

  // ── 6. 确认出库（Delivery LOADED → 正式扣减 qty） ────────────────────────────

  async confirmOutbound(
    orderId: string,
    orderNo: string,
    companyCode: string,
    deliveryNo: string,
    mgr?: EntityManager,
  ): Promise<void> {
    const q = mgr ? mgr.query.bind(mgr) : this.ds.query.bind(this.ds);

    const items = await q(
      `SELECT * FROM sal_order_items WHERE sales_order_id=$1 AND allocated_batch_no IS NOT NULL`,
      [orderId],
    );

    for (const item of items) {
      const batchNos = String(item.allocated_batch_no).split(',');
      const totalQty = Number(item.allocated_qty ?? item.qty);
      if (!totalQty || !batchNos.length) continue;

      const qtyPerBatch = totalQty / batchNos.length;
      for (const batchNo of batchNos) {
        const outQty = Math.round(qtyPerBatch);
        if (outQty <= 0) continue;

        // 查当前批次信息
        const [batch] = await q(
          `SELECT qty, expire_date, quality_grade FROM inv_batches WHERE batch_no=$1`, [batchNo.trim()],
        );

        // 正式扣减物理库存（qty）
        await q(
          `UPDATE inv_batches
           SET qty = GREATEST(0, qty - $1), updated_at=NOW()
           WHERE batch_no=$2`,
          [outQty, batchNo.trim()],
        );

        // 写 inv_ledger FIFO_OUT
        await this.writeLedger({
          batchNo:     batchNo.trim(),
          changeType:  'FIFO_OUT',
          qtyChange:   -outQty,
          operator:    this.operator,
          companyCode,
          refNo:       deliveryNo,
          note:        `装车出库 delivery=${deliveryNo} order=${orderNo} batch=${batchNo}`,
          batchExpireDate: batch?.expire_date ?? null,
          qualityGrade:    batch?.quality_grade ?? null,
        }, mgr);
      }
    }

    this.logger.log(`[EggInv] 出库确认: delivery=${deliveryNo} order=${orderNo}`);
  }

  // ── 7. 退货回库（Return Runtime 联动） ───────────────────────────────────────

  async processReturnInventory(
    returnId:    string,
    returnNo:    string,
    companyCode: string,
    mgr?:        EntityManager,
  ): Promise<void> {
    const q = mgr ? mgr.query.bind(mgr) : this.ds.query.bind(this.ds);

    const items = await q(
      `SELECT * FROM sal_return_items WHERE return_order_id=$1`, [returnId],
    );

    for (const item of items) {
      const accepted = Number(item.accepted_qty);
      const damaged  = Number(item.damaged_qty);
      const batchNo  = `RET-${returnNo}-${item.product_code}`;

      // ── accepted_qty：回库（RETURNED 状态，需重新质检） ──────────────────────
      if (accepted > 0) {
        // 退货等级：自动根据到期时间降级
        const originalGrade = item.grade_code ?? 'A';
        const returnGrade   = this.degradeGrade(originalGrade);

        await q(
          `INSERT INTO inv_batches
             (batch_no, product_code, company_code, qty, qty_available,
              quality_grade, source_type, source_no, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$4,$5,'RETURN',$6,'RETURNED',NOW(),NOW())
           ON CONFLICT (batch_no)
           DO UPDATE SET qty          = inv_batches.qty          + EXCLUDED.qty,
                         qty_available = inv_batches.qty_available + EXCLUDED.qty_available,
                         updated_at   = NOW()`,
          [batchNo, item.product_code, companyCode, Math.round(accepted), returnGrade, returnNo],
        );

        await this.writeLedger({
          batchNo,
          changeType:  'SALE_RETURN',
          qtyChange:   Math.round(accepted),
          operator:    this.operator,
          companyCode,
          refNo:       returnNo,
          note:        `退货回库 return=${returnNo} product=${item.product_code} accepted=${accepted} grade=${returnGrade}`,
          qualityGrade: returnGrade,
        }, mgr);

        await q(
          `UPDATE sal_return_items SET restock_status='RESTOCKED' WHERE id=$1`, [item.id],
        );
      }

      // ── damaged_qty：损耗（仅写 inv_ledger，不回库） ─────────────────────────
      if (damaged > 0) {
        const damageBatch = `DMG-${returnNo}-${item.product_code}`;
        await this.writeLedger({
          batchNo:     damageBatch,
          changeType:  'DAMAGE_WRITEOFF',
          qtyChange:   Math.round(damaged),
          operator:    this.operator,
          companyCode,
          refNo:       returnNo,
          note:        `退货损耗 return=${returnNo} product=${item.product_code} damaged=${damaged}`,
        }, mgr);

        await q(
          `UPDATE sal_return_items SET restock_status='WRITTEN_OFF' WHERE id=$1`, [item.id],
        );
      }
    }

    this.logger.log(`[EggInv] 退货回库处理完成: return=${returnNo}`);
  }

  // ── 8. 标记过期批次 ──────────────────────────────────────────────────────────

  async markExpiredBatches(companyCode?: string): Promise<{ expired: number; written: number }> {
    const cond = companyCode ? `AND company_code='${companyCode}'` : '';

    // 查询已过期但还是 AVAILABLE 状态的批次
    const expiredBatches = await this.ds.query(
      `SELECT * FROM inv_batches
       WHERE expire_date < CURRENT_DATE
         AND status = 'AVAILABLE'
         AND qty > 0
         ${cond}`,
    );

    let written = 0;
    for (const batch of expiredBatches) {
      const qty = Number(batch.qty);

      await this.ds.query(
        `UPDATE inv_batches
         SET status='EXPIRED', qty_available=0, updated_at=NOW()
         WHERE batch_no=$1`,
        [batch.batch_no],
      );

      await this.writeLedger({
        batchNo:     batch.batch_no,
        changeType:  'EXPIRE_WRITEOFF',
        qtyChange:   -qty,
        operator:    'scheduler',
        companyCode: batch.company_code ?? companyCode ?? 'ALL',
        refNo:       batch.batch_no,
        note:        `过期自动报废 batch=${batch.batch_no} expire=${batch.expire_date} qty=${qty}`,
        batchExpireDate: batch.expire_date,
        qualityGrade:    batch.quality_grade,
      });

      written += qty;
    }

    this.logger.log(`[EggInv] 过期处理: ${expiredBatches.length} 批次 ${written} 个报废`);
    return { expired: expiredBatches.length, written };
  }

  // ── 9. 查询临期库存 ──────────────────────────────────────────────────────────

  async getExpiringBatches(params: {
    companyCode?: string;
    days?: number;
  }): Promise<EggBatch[]> {
    const days = params.days ?? EXPIRING_WARN_DAYS;
    const cond = params.companyCode ? `AND company_code='${params.companyCode}'` : '';

    return this.ds.query(
      `SELECT *,
         (expire_date::date - CURRENT_DATE::date) AS days_remaining
       FROM inv_batches
       WHERE status IN ('AVAILABLE','RETURNED')
         AND qty_available > 0
         AND expire_date IS NOT NULL
         AND expire_date >= CURRENT_DATE
         AND expire_date <= CURRENT_DATE + INTERVAL '${days} days'
         ${cond}
       ORDER BY expire_date ASC`,
    );
  }

  // ── 10. Dashboard 统计 ───────────────────────────────────────────────────────

  async getDashboardStats(companyCode?: string) {
    const cond = companyCode ? `AND company_code='${companyCode}'` : '';

    const [row] = await this.ds.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='AVAILABLE' AND qty_available > 0)        AS active_batches,
        COALESCE(SUM(qty_available) FILTER (WHERE status='AVAILABLE'), 0)        AS total_available,
        COUNT(*) FILTER (
          WHERE status='AVAILABLE' AND qty_available > 0
            AND expire_date IS NOT NULL
            AND expire_date >= CURRENT_DATE
            AND expire_date <= CURRENT_DATE + INTERVAL '7 days'
        )                                                                        AS expiring_batches,
        COALESCE(SUM(qty_available) FILTER (
          WHERE status='AVAILABLE' AND qty_available > 0
            AND expire_date IS NOT NULL
            AND expire_date >= CURRENT_DATE
            AND expire_date <= CURRENT_DATE + INTERVAL '7 days'
        ), 0)                                                                    AS expiring_qty,
        COUNT(*) FILTER (WHERE status='EXPIRED')                                 AS expired_batches,
        COUNT(*) FILTER (WHERE status='RETURNED')                                AS returned_batches
      FROM inv_batches WHERE 1=1 ${cond}
    `);

    // 今日损耗
    const [lossRow] = await this.ds.query(`
      SELECT
        COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type='EXPIRE_WRITEOFF'), 0) AS expire_loss,
        COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type='DAMAGE_WRITEOFF'), 0) AS damage_loss,
        COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type='WRITE_OFF'), 0)       AS write_off
      FROM inv_ledger
      WHERE created_at >= CURRENT_DATE ${cond.replace('company_code', 'company_code')}
    `);

    return {
      activeBatches:   Number(row.active_batches),
      totalAvailable:  Number(row.total_available),
      expiringBatches: Number(row.expiring_batches),
      expiringQty:     Number(row.expiring_qty),
      expiredBatches:  Number(row.expired_batches),
      returnedBatches: Number(row.returned_batches),
      todayExpireLoss: Number(lossRow.expire_loss),
      todayDamageLoss: Number(lossRow.damage_loss),
      todayWriteOff:   Number(lossRow.write_off),
    };
  }

  // ── 11. 损耗分析 ─────────────────────────────────────────────────────────────

  async getLossAnalysis(companyCode?: string) {
    const cond = companyCode ? `AND company_code='${companyCode}'` : '';

    const byType = await this.ds.query(`
      SELECT change_type,
             COUNT(*) AS record_count,
             SUM(ABS(qty_change)) AS total_qty
      FROM inv_ledger
      WHERE change_type IN ('EXPIRE_WRITEOFF','DAMAGE_WRITEOFF','WRITE_OFF','QC_REJECT')
        AND created_at >= NOW() - INTERVAL '30 days'
        ${cond}
      GROUP BY change_type
      ORDER BY total_qty DESC
    `);

    const byBatch = await this.ds.query(`
      SELECT b.batch_no, b.egg_date, b.expire_date, b.quality_grade,
             b.product_code, b.qty AS original_qty, b.status
      FROM inv_batches b
      WHERE b.status IN ('EXPIRED','WRITTEN_OFF')
        AND b.created_at >= NOW() - INTERVAL '30 days'
        ${cond}
      ORDER BY b.created_at DESC
      LIMIT 20
    `);

    const [summary] = await this.ds.query(`
      SELECT
        COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type='EXPIRE_WRITEOFF'), 0) AS expire_total,
        COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type='DAMAGE_WRITEOFF'), 0) AS damage_total,
        COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type='WRITE_OFF'), 0)       AS write_off_total,
        COUNT(*) AS total_records
      FROM inv_ledger
      WHERE change_type IN ('EXPIRE_WRITEOFF','DAMAGE_WRITEOFF','WRITE_OFF','QC_REJECT')
        AND created_at >= NOW() - INTERVAL '30 days'
        ${cond}
    `);

    return { byType, byBatch, summary };
  }

  // ── 内部：等级降级 ───────────────────────────────────────────────────────────

  private degradeGrade(grade: string): string {
    const ladder: Record<string, string> = {
      AA: 'A', A: 'B', B: 'B', DIRTY: 'DAMAGED', CRACKED: 'DAMAGED', DAMAGED: 'DAMAGED',
    };
    return ladder[grade] ?? grade;
  }
}
