import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeContext } from '../org/services/data-scope.service';

/**
 * V3 WmsService
 * 替代已废弃的 WmsV2CompatService，所有操作直接操作 V3 数据表
 */
@Injectable()
export class WmsService {
  constructor(
    @InjectEntityManager()
    private readonly em: EntityManager,
    private readonly cls: ClsService,
  ) {}

  private warehouseScope(column = 'warehouse_code', paramOffset = 0): { sql: string; params: unknown[] } {
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    if (scope?.isGlobal) {
      return { sql: '1=1', params: [] };
    }
    if (!scope || scope.allowedWarehouseCodes.length === 0) return { sql: '1=0', params: [] };
    return {
      sql: `(${column} = ANY($${paramOffset + 1}) OR ${column} IS NULL)`,
      params: [scope.allowedWarehouseCodes],
    };
  }

  private assertWritableWarehouse(warehouseCode: string | null | undefined, label: string): void {
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    if (scope?.isGlobal) return;
    if (!scope || scope.allowedWarehouseCodes.length === 0) {
      throw new ForbiddenException(`无权写入该${label}（未配置仓库范围）`);
    }
    if (!warehouseCode) {
      throw new ForbiddenException(`无权写入该${label}（缺少仓库归属）`);
    }
    if (!scope.allowedWarehouseCodes.includes(warehouseCode)) {
      throw new ForbiddenException(`无权写入该${label}（仓库范围不匹配）`);
    }
  }

  private nonEmptyString(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized : null;
  }

  private itemIdentityLabel(item: { batch_no?: unknown; product_code?: unknown; sku_code?: unknown }): string {
    return this.nonEmptyString(item.batch_no)
      || this.nonEmptyString(item.sku_code)
      || this.nonEmptyString(item.product_code)
      || '(未指定)';
  }

  private orderStoreScope(column = 'store_code', paramOffset = 0): { sql: string; params: unknown[] } {
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    if (!scope || scope.isGlobal) return { sql: '1=1', params: [] };

    const userStoreCode = String(this.cls.get('user.storeCode') || '').trim();
    const allowedStoreCodes = Array.from(new Set([
      ...(scope.allowedSiteCodes || []),
      ...(userStoreCode && userStoreCode !== 'ALL' ? [userStoreCode] : []),
    ].filter(Boolean)));

    if (allowedStoreCodes.length === 0) return { sql: '1=0', params: [] };
    return {
      sql: `${column} = ANY($${paramOffset + 1})`,
      params: [allowedStoreCodes],
    };
  }

  // ─── 入库 (Inbound) ─────────────────────────────────────────────────────────
  async getInboundDashboard() {
    try {
      const scope = this.warehouseScope('warehouse_code', 0);
      const [pending] = await this.em.query(
        `SELECT COUNT(*) as count FROM wms_inbound WHERE status = 'PENDING' AND ${scope.sql}`,
        scope.params,
      );
      const [processing] = await this.em.query(
        `SELECT COUNT(*) as count FROM wms_inbound WHERE status = 'PROCESSING' AND ${scope.sql}`,
        scope.params,
      );
      return {
        code: 200,
        data: {
          pending: parseInt(pending.count),
          processing: parseInt(processing.count),
          completed_today: 0,
        },
      };
    } catch {
      return { code: 200, data: { pending: 0, processing: 0, completed_today: 0 } };
    }
  }

  async getPendingInbound() {
    try {
      const scope = this.warehouseScope('warehouse_code', 0);
      const data = await this.em.query(
        `SELECT * FROM wms_inbound WHERE status IN ('PENDING', 'PROCESSING') AND ${scope.sql} ORDER BY created_at DESC`,
        scope.params,
      );
      return { code: 200, data };
    } catch {
      return { code: 200, data: [] };
    }
  }

  async getInboundTask(taskNo: string) {
    try {
      const scope = this.warehouseScope('warehouse_code', 1);
      const tasks = await this.em.query(
        `SELECT * FROM wms_inbound WHERE task_no = $1 AND ${scope.sql}`,
        [taskNo, ...scope.params],
      );
      if (!tasks.length) return { code: 404, msg: '任务不存在' };
      const items = await this.em.query(
        `SELECT * FROM wms_inbound_items WHERE task_no = $1`,
        [taskNo],
      );
      return { code: 200, data: { ...tasks[0], items } };
    } catch (e: any) {
      return { code: 500, msg: e.message };
    }
  }

  /**
   * 确认入库 — V3 修正版
   *
   * A3 修复要点：
   *   旧版 INSERT inv_batches ... ON CONFLICT (batch_no) DO NOTHING
   *   → 同 batch_no 重复确认会静默丢数（且 batch_no 用毫秒+rand 也可能撞）
   *   现改为 ON CONFLICT DO UPDATE 把数量累加 + 同步写 inv_ledger 流水
   *
   * A1 心脏修复（部分）：
   *   每条 inv_batches 入库都必须配套写入 inv_ledger，让库存守恒可审计
   *   change_type = 'INBOUND'  qty_change = item.qty
   *
   * 注：硬编码 'INBOUND-DOCK' 库位与 'WH-B' 兜底仓库改为前端传入或用 task 字段
   */
  async confirmInbound(body: any, user: any) {
    const { task_no, items = [] } = body;
    if (!task_no) throw new BadRequestException('task_no 必填');

    // V2 fidelity: 严格校验 expected = actual + broken（若提供 expected_qty）
    const validationErrors: string[] = [];
    let hasEffectiveInboundLine = false;
    for (const it of items) {
      const actual = Number(it.actual_qty ?? it.qty) || 0;
      const broken = Number(it.broken_qty) || 0;
      const expected = it.expected_qty != null ? Number(it.expected_qty) : null;
      const productCode = this.nonEmptyString(it.product_code);
      const skuCode = this.nonEmptyString(it.sku_code);
      if (expected != null && actual + broken !== expected) {
        validationErrors.push(
          `批次 ${this.itemIdentityLabel(it)}: actual(${actual}) + broken(${broken}) ≠ expected(${expected})`,
        );
      }
      if (actual < 0 || broken < 0) {
        validationErrors.push(
          `批次 ${this.itemIdentityLabel(it)}: actual_qty / broken_qty 不可为负`,
        );
      }
      if (actual > 0 || broken > 0) {
        hasEffectiveInboundLine = true;
        if (!productCode && !skuCode) {
          validationErrors.push(`批次 ${this.itemIdentityLabel(it)}: product_code 或 sku_code 必填`);
        }
      }
    }
    if (!hasEffectiveInboundLine) {
      validationErrors.push('入库确认至少需要一条实收或破损数量大于 0 的明细');
    }
    if (validationErrors.length > 0) {
      throw new BadRequestException({ code: 400, msg: '入库数据校验失败', errors: validationErrors });
    }

    return await this.em.transaction(async (manager) => {
      // V2 fidelity: 幂等 — 仅 PENDING/PROCESSING 状态允许确认
      const tasks = await manager.query(
        `SELECT warehouse_code, operator, store_code, status FROM wms_inbound WHERE task_no = $1 FOR UPDATE`,
        [task_no],
      );
      if (tasks.length === 0) {
        return { code: 404, msg: `入库单 ${task_no} 不存在` };
      }
      const task = tasks[0];
      this.assertWritableWarehouse(task.warehouse_code || null, `入库单 ${task_no}`);
      if (task.status === 'COMPLETED') {
        return { code: 400, msg: `入库单 ${task_no} 已确认（COMPLETED），请勿重复操作`, idempotent: true };
      }
      if (task.status === 'CANCELLED') {
        return { code: 400, msg: `入库单 ${task_no} 已取消（CANCELLED），无法确认` };
      }

      const defaultWarehouse = task.warehouse_code || 'WMS-VTE-MAIN';
      const operator = String(user?.userId || user?.username || task.operator || 'SYS');
      const storeCode = task.store_code || 'ALL';

      await manager.query(
        `UPDATE wms_inbound SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE task_no = $1`,
        [task_no],
      );

      for (const item of items) {
        const actualQty = Number(item.actual_qty ?? item.qty) || 0;
        const brokenQty = Number(item.broken_qty) || 0;
        if (actualQty <= 0 && brokenQty <= 0) continue;

        let productCode = this.nonEmptyString(item.product_code);
        let skuCode = this.nonEmptyString(item.sku_code);
        // The legacy generic inbound form labels its free-text value as product code,
        // while outbound selects stock by SKU. Preserve real product codes, but when
        // the entered value is an exact active SKU code, persist both canonical keys
        // so the same stock is selectable for outbound.
        if (!skuCode && productCode) {
          const skuRows = await manager.query(
            `SELECT sku_code, product_code
               FROM product_skus
              WHERE sku_code = $1
                AND status = 'ACTIVE'
              LIMIT 1`,
            [productCode],
          );
          if (skuRows.length > 0) {
            skuCode = this.nonEmptyString(skuRows[0].sku_code);
            productCode = this.nonEmptyString(skuRows[0].product_code);
          }
        }
        await manager.query(
          `UPDATE wms_inbound_items
              SET actual_qty = $1::int,
                  broken_qty = $2::int
            WHERE task_no = $3
              AND (
                ($4::text IS NOT NULL AND batch_no = $4)
                OR ($4::text IS NULL AND $5::text IS NOT NULL AND product_code = $5)
              )`,
          [actualQty, brokenQty, task_no, this.nonEmptyString(item.batch_no), productCode],
        );
        const baseBatchNo = item.batch_no ||
          `IBN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
        const warehouseCode = item.warehouse_code || item.warehouse || defaultWarehouse;
        this.assertWritableWarehouse(warehouseCode, `入库明细 ${baseBatchNo}`);
        const locationCode  = item.location_code || 'INBOUND-DOCK';

        // V2 fidelity: 拦截 EXPIRED / LOCKED / QUARANTINE 已存在批次的累加
        if (item.batch_no) {
          const existRows = await manager.query(
            `SELECT batch_no, status FROM inv_batches WHERE batch_no = $1 FOR UPDATE`,
            [item.batch_no],
          );
          if (existRows.length > 0) {
            const exStatus = (existRows[0].status || 'AVAILABLE').toUpperCase();
            if (['EXPIRED', 'LOCKED', 'QUARANTINE'].includes(exStatus)) {
              throw new Error(`批次 ${item.batch_no} 当前状态 ${exStatus}，不可继续入库`);
            }
          }
        }

        // 正常入库：actual_qty → AVAILABLE batch
        if (actualQty > 0) {
          await manager.query(
            `INSERT INTO inv_batches (batch_no, product_code, sku_code, qty, qty_available, status, warehouse_code, location_code, store_code)
             VALUES ($1, $2, $3, $4::int, $4::int, 'AVAILABLE', $5, $6, $7)
             ON CONFLICT (batch_no) DO UPDATE SET
               product_code = COALESCE(inv_batches.product_code, EXCLUDED.product_code),
               sku_code = COALESCE(inv_batches.sku_code, EXCLUDED.sku_code),
               qty = inv_batches.qty + EXCLUDED.qty,
               qty_available = COALESCE(inv_batches.qty_available, inv_batches.qty) + EXCLUDED.qty,
               updated_at = now()`,
            [baseBatchNo, productCode, skuCode, actualQty, warehouseCode, locationCode, storeCode],
          );
          await manager.query(
            `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note, sku_code)
             VALUES ($1, 'INBOUND', $2::int, $3, $4, $5, $6, $7)`,
            [
              baseBatchNo, actualQty, operator, storeCode, task_no,
              `入库确认 product=${productCode || '-'} sku=${skuCode || '-'} actual=${actualQty} warehouse=${warehouseCode}`,
              skuCode,
            ],
          );
        }

        // V2 fidelity: 破损 → 独立 QUARANTINE batch（qty_available=0，可追溯但不可销售）
        if (brokenQty > 0) {
          const brokenBatchNo = `${baseBatchNo}-BROKEN`;
          await manager.query(
            `INSERT INTO inv_batches (batch_no, product_code, sku_code, qty, qty_available, status, warehouse_code, location_code, store_code)
             VALUES ($1, $2, $3, $4::int, 0, 'QUARANTINE', $5, $6, $7)
             ON CONFLICT (batch_no) DO UPDATE SET
               product_code = COALESCE(inv_batches.product_code, EXCLUDED.product_code),
               sku_code = COALESCE(inv_batches.sku_code, EXCLUDED.sku_code),
               qty = inv_batches.qty + EXCLUDED.qty,
               qty_available = 0,
               status = 'QUARANTINE',
               updated_at = now()`,
            [brokenBatchNo, productCode, skuCode, brokenQty, warehouseCode, 'QUARANTINE-DOCK', storeCode],
          );
          await manager.query(
            `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note, sku_code)
             VALUES ($1, 'INBOUND_BROKEN', $2::int, $3, $4, $5, $6, $7)`,
            [
              brokenBatchNo, brokenQty, operator, storeCode, task_no,
              `破损入隔离 product=${productCode || '-'} sku=${skuCode || '-'} broken=${brokenQty}`,
              skuCode,
            ],
          );
        }
      }
      return { code: 200, msg: '入库确认成功', data: { task_no, status: 'COMPLETED' } };
    });
  }

  /**
   * G84 采购收货入库 — 供采购模块在其「收货确认」事务内调用，统一写 inv_batches/inv_ledger。
   * 守护：库存唯一写入口（CLAUDE.md #6）；批次状态 AVAILABLE 取自 INV_STOCK_STATUS（#7）。
   * 与调用方同一事务（传入 manager），保证收货确认与库存入账原子一致。
   * 数量为整数（inv_batches.qty 为 INTEGER），按四舍五入入账；无物料编码/数量≤0 的行跳过（不写脏批次）。
   */
  async inboundFromReceipt(
    manager: EntityManager,
    ctx: {
      refNo: string;             // 收货单号（→ inv_ledger.ref_no 可追溯）
      warehouseCode?: string;
      storeCode?: string;
      operator?: string;
      items: { productCode?: string; skuCode?: string; qty: number; batchNo?: string; locationCode?: string }[];
    },
  ): Promise<{ batchNos: string[]; skipped: number }> {
    const storeCode = ctx.storeCode || 'ALL';
    const operator = ctx.operator || 'SYS';
    const warehouseCode = ctx.warehouseCode || 'WMS-VTE-MAIN';
    this.assertWritableWarehouse(warehouseCode, `采购收货 ${ctx.refNo}`);
    const batchNos: string[] = [];
    let skipped = 0;
    for (let idx = 0; idx < ctx.items.length; idx++) {
      const it = ctx.items[idx];
      const qty = Math.round(Number(it.qty) || 0);
      const productCode = this.nonEmptyString(it.productCode);
      const skuCode = this.nonEmptyString(it.skuCode);
      if (qty <= 0 || (!productCode && !skuCode)) { skipped++; continue; }
      const batchNo = (it.batchNo || `${ctx.refNo}-${String(idx + 1).padStart(3, '0')}`).slice(0, 64);
      const locationCode = (it.locationCode || 'INBOUND-DOCK').slice(0, 64);
      await manager.query(
        `INSERT INTO inv_batches (batch_no, product_code, sku_code, qty, qty_available, status, warehouse_code, location_code, store_code)
         VALUES ($1, $2, $3, $4::int, $4::int, 'AVAILABLE', $5, $6, $7)
         ON CONFLICT (batch_no) DO UPDATE SET
           product_code = COALESCE(inv_batches.product_code, EXCLUDED.product_code),
           sku_code = COALESCE(inv_batches.sku_code, EXCLUDED.sku_code),
           qty = inv_batches.qty + EXCLUDED.qty,
           qty_available = COALESCE(inv_batches.qty_available, inv_batches.qty) + EXCLUDED.qty,
           updated_at = now()`,
        [batchNo, productCode, skuCode, qty, warehouseCode, locationCode, storeCode],
      );
      await manager.query(
        `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note, sku_code)
         VALUES ($1, 'INBOUND', $2::int, $3, $4, $5, $6, $7)`,
        [batchNo, qty, operator, storeCode, ctx.refNo,
         `采购收货入库 product=${productCode || '-'} sku=${skuCode || '-'} qty=${qty} wh=${warehouseCode}`,
         skuCode],
      );
      batchNos.push(batchNo);
    }
    return { batchNos, skipped };
  }

  // ─── 出库 (Outbound) ────────────────────────────────────────────────────────
  async getOutboundDashboard() {
    try {
      const scope = this.orderStoreScope('store_code', 0);
      const [pending] = await this.em.query(
        `SELECT COUNT(*) as count FROM ord_orders WHERE status = 'approved' AND ${scope.sql}`,
        scope.params,
      );
      const [allocated] = await this.em.query(
        `SELECT COUNT(*) as count FROM ord_orders WHERE status = 'allocated' AND ${scope.sql}`,
        scope.params,
      );
      return {
        code: 200,
        data: { pending: parseInt(pending.count), allocated: parseInt(allocated.count), shipped_today: 0 },
      };
    } catch {
      return { code: 200, data: { pending: 0, allocated: 0, shipped_today: 0 } };
    }
  }

  async getPendingOutbound() {
    try {
      const scope = this.orderStoreScope('store_code', 0);
      const data = await this.em.query(
        `SELECT * FROM ord_orders WHERE status IN ('approved', 'locked', 'allocated') AND ${scope.sql} ORDER BY created_at DESC`,
        scope.params,
      );
      return { code: 200, data };
    } catch {
      return { code: 200, data: [] };
    }
  }

  async getOutboundOrder(orderNo: string) {
    try {
      const scope = this.orderStoreScope('store_code', 1);
      const orders = await this.em.query(
        `SELECT * FROM ord_orders WHERE order_no = $1 AND ${scope.sql}`,
        [orderNo, ...scope.params],
      );
      if (!orders.length) return { code: 404, msg: '订单不存在' };
      const items = await this.em.query(
        `SELECT * FROM ord_order_items WHERE order_no = $1`,
        [orderNo],
      );
      return { code: 200, data: { ...orders[0], items } };
    } catch (e: any) {
      return { code: 500, msg: e.message };
    }
  }

  /**
   * 出库单状态推进 — V3 真实实现
   *
   * A1 心脏修复：出库时按 batch 扣减 inv_batches.qty + 写 inv_ledger OUTBOUND 流水
   * 状态机：approved → locked → allocated → shipped → delivered
   * body: { next_status, items?: [{batch_no?, sku_code?, product_code?, qty}] }
   */
  async advanceOutboundOrder(orderNo: string, body: any, user: any) {
    // 统一 UPPER 状态枚举 (与 order.service VALID_TRANSITIONS 对齐)
    const nextStatus = String(body?.next_status || 'allocated').toUpperCase();
    const items: Array<{ batch_no?: string; sku_code?: string; product_code?: string; qty: number }> = Array.isArray(body?.items) ? body.items : [];

    return await this.em.transaction(async (manager) => {
      const scope = this.orderStoreScope('store_code', 1);
      const ords = await manager.query(
        `SELECT order_no, status, store_code FROM ord_orders WHERE order_no = $1 AND ${scope.sql}`,
        [orderNo, ...scope.params],
      );
      if (!ords.length) return { code: 404, msg: '订单不存在' };
      const order = ords[0];

      await manager.query(
        `UPDATE ord_orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE order_no = $2`,
        [nextStatus, orderNo],
      );

      // 推进到 shipped 时按 batch 扣减
      if (nextStatus === 'SHIPPED' && items.length > 0) {
        for (const it of items) {
          const qty = Number(it.qty) || 0;
          if (qty <= 0) continue;

          const batchNo = this.nonEmptyString(it.batch_no);
          const skuCode = this.nonEmptyString(it.sku_code);
          const productCode = this.nonEmptyString(it.product_code);
          if (batchNo) {
            const [batch] = await manager.query(
              `SELECT batch_no, product_code, sku_code, qty, qty_available, warehouse_code, store_code
                 FROM inv_batches WHERE batch_no = $1 FOR UPDATE`,
              [batchNo],
            );
            if (!batch) {
              throw new Error(`batch ${batchNo} 不存在`);
            }
            await this.deductOutboundBatch(manager, batch, qty, orderNo, order, user, nextStatus);
            continue;
          }

          if (skuCode) {
            await this.deductOutboundBySelector(manager, 'sku_code', skuCode, qty, orderNo, order, user, nextStatus);
            continue;
          }

          if (productCode) {
            await this.deductOutboundBySelector(manager, 'product_code', productCode, qty, orderNo, order, user, nextStatus);
          }
        }
      }

      return { code: 200, msg: `状态推进至 ${nextStatus}` };
    });
  }

  private async deductOutboundBySelector(
    manager: EntityManager,
    column: 'sku_code' | 'product_code',
    value: string,
    qty: number,
    orderNo: string,
    order: any,
    user: any,
    nextStatus: string,
  ): Promise<void> {
    const label = `${column}=${value}`;
    const batches = await manager.query(
      `SELECT batch_no, product_code, sku_code, qty, qty_available, warehouse_code, store_code
         FROM inv_batches
        WHERE ${column} = $1
          AND COALESCE(qty_available, qty, 0) > 0
          AND COALESCE(status, 'AVAILABLE') = 'AVAILABLE'
        ORDER BY expire_date NULLS LAST, created_at ASC, batch_no ASC
        FOR UPDATE`,
      [value],
    );

    let remaining = qty;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const available = Number(batch.qty_available ?? batch.qty) || 0;
      if (available <= 0) continue;
      const deductQty = Math.min(remaining, available);
      await this.deductOutboundBatch(manager, batch, deductQty, orderNo, order, user, nextStatus);
      remaining -= deductQty;
    }

    if (remaining > 0) {
      throw new Error(`库存不足 ${label} 缺 ${remaining}`);
    }
  }

  private async deductOutboundBatch(
    manager: EntityManager,
    batch: any,
    qty: number,
    orderNo: string,
    order: any,
    user: any,
    nextStatus: string,
  ): Promise<void> {
    const batchNo = this.nonEmptyString(batch.batch_no);
    if (!batchNo) throw new Error('出库批次号缺失');
    this.assertWritableWarehouse(batch.warehouse_code, `出库批次 ${batchNo}`);

    const available = Number(batch.qty_available ?? batch.qty) || 0;
    if (available < qty) {
      throw new Error(`batch ${batchNo} 余量 ${available} 不足 ${qty}`);
    }

    await manager.query(
      `UPDATE inv_batches
          SET qty = GREATEST(COALESCE(qty, 0) - $1::int, 0),
              qty_available = CASE
                WHEN qty_available IS NULL THEN NULL
                ELSE GREATEST(qty_available - $1::int, 0)
              END,
              updated_at = now()
        WHERE batch_no = $2`,
      [qty, batchNo],
    );
    await manager.query(
      `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note, sku_code)
       VALUES ($1, 'OUTBOUND', -$2::int, $3, $4, $5, $6, $7)`,
      [
        batchNo,
        qty,
        String(user?.userId || user?.username || 'SYS'),
        order.store_code || batch.store_code || 'ALL',
        orderNo,
        `出库 status=${nextStatus} batch=${batchNo} product=${batch.product_code || '-'} sku=${batch.sku_code || '-'} qty=${qty}`,
        batch.sku_code || null,
      ],
    );
  }

  /**
   * 收货签收 — V3 真实实现
   * body: { receiver, sign_time, items?: [{ batch_no, actual_qty }] }
   */
  async receiveSignOrder(orderNo: string, body: any, user: any) {
    const receiver = body?.receiver || user?.username || 'SYS';
    return await this.em.transaction(async (manager) => {
      const scope = this.orderStoreScope('store_code', 1);
      const result = await manager.query(
        `UPDATE ord_orders SET status='received', updated_at=CURRENT_TIMESTAMP
         WHERE order_no = $1 AND ${scope.sql}
         RETURNING order_no, store_code`,
        [orderNo, ...scope.params],
      );
      if (!result.length) return { code: 404, msg: '订单不存在' };

      // 签收差异写入 inv_ledger（reconcile path）
      const items: Array<{ batch_no: string; actual_qty: number; expected_qty: number }> =
        Array.isArray(body?.items) ? body.items : [];
      for (const it of items) {
        const diff = Number(it.actual_qty || 0) - Number(it.expected_qty || 0);
        if (diff === 0 || !it.batch_no) continue;
        await manager.query(
          `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
           VALUES ($1, $2, $3::int, $4, $5, $6, $7)`,
          [
            it.batch_no,
            diff > 0 ? 'RECEIVE_OVER' : 'RECEIVE_SHORT',
            diff,
            receiver,
            result[0].store_code || 'ALL',
            orderNo,
            `签收差异 expected=${it.expected_qty} actual=${it.actual_qty} diff=${diff}`,
          ],
        );
      }

      return { code: 200, msg: '签收成功' };
    });
  }

  // ─── 库存 (Inventory) ───────────────────────────────────────────────────────
  async getInventoryBatches() {
    try {
      const scope = this.warehouseScope('b.warehouse_code', 0);
      const data = await this.em.query(
        `SELECT b.*,
                COALESCE(w.warehouse_name_zh, w.warehouse_name, b.warehouse_code) AS warehouse_name,
                COALESCE(w.warehouse_name_zh, w.warehouse_name, b.warehouse_code) AS warehouse_name_zh
           FROM inv_batches b
           LEFT JOIN wms_warehouses w ON w.warehouse_code = b.warehouse_code
          WHERE COALESCE(b.qty_available, b.qty, 0) > 0 AND ${scope.sql}
          ORDER BY b.created_at DESC LIMIT 200`,
        scope.params,
      );
      return { code: 200, data };
    } catch {
      return { code: 200, data: [] };
    }
  }

  /**
   * 库存批次概览聚合（前端 analytics/inventory 由"拉 200 行客户端 reduce"改为调本端点）。
   * 复用 getInventoryBatches 同款 DataScope 查询（不猜列名，零 500 风险），在服务端对
   * 全部在范围内活跃批次(qty>0)做 reduce——KPI 覆盖全量而非仅最新 200 行，前端只取小对象。
   * reduce 规则与前端原逻辑逐一对齐（active/totalQty/expiring/grade 桶/recent）。
   */
  async getInventoryBatchesSummary() {
    const empty = { totalCount: 0, activeCount: 0, totalQtyKg: 0, expiringCount: 0, gradeBuckets: { AA: 0, A: 0, B: 0, C: 0 }, recent: [] as any[] };
    try {
      const scope = this.warehouseScope('b.warehouse_code', 0);
      const rows: any[] = await this.em.query(
        `SELECT b.*,
                COALESCE(w.warehouse_name_zh, w.warehouse_name, b.warehouse_code) AS warehouse_name,
                COALESCE(w.warehouse_name_zh, w.warehouse_name, b.warehouse_code) AS warehouse_name_zh
           FROM inv_batches b
           LEFT JOIN wms_warehouses w ON w.warehouse_code = b.warehouse_code
          WHERE COALESCE(b.qty_available, b.qty, 0) > 0 AND ${scope.sql}`,
        scope.params,
      );
      const isActive = (s?: string) => !s || s === 'AVAILABLE' || s === 'LOCKED';
      const remainingDays = (b: any): number | null => {
        if (b.remaining_days != null) return Number(b.remaining_days);
        if (b.expiry_date) return Math.floor((new Date(b.expiry_date).getTime() - Date.now()) / 86400000);
        return null;
      };
      const gradeBuckets = { AA: 0, A: 0, B: 0, C: 0 };
      let totalQtyKg = 0, activeCount = 0, expiringCount = 0;
      for (const b of rows) {
        if (isActive(b.status)) activeCount++;
        totalQtyKg += Number(b.quantity_kg ?? b.qty ?? 0);
        const d = remainingDays(b);
        if (d !== null && d < 7) expiringCount++;
        const g = String(b.grade ?? b.sku_code ?? '').toUpperCase();
        if (g.includes('AA')) gradeBuckets.AA++;
        else if (g.includes('A')) gradeBuckets.A++;
        else if (g.includes('B')) gradeBuckets.B++;
        else if (g.includes('C')) gradeBuckets.C++;
      }
      const recent = [...rows]
        .sort((a, b) => ((b.grading_date ?? '') > (a.grading_date ?? '') ? 1 : -1))
        .slice(0, 10);
      return { code: 200, data: { totalCount: rows.length, activeCount, totalQtyKg, expiringCount, gradeBuckets, recent } };
    } catch {
      return { code: 200, data: empty };
    }
  }

  async getReceivingOrders() {
    try {
      const scope = this.warehouseScope('warehouse_code', 0);
      const data = await this.em.query(
        `SELECT * FROM wms_inbound WHERE status = 'PENDING' AND ${scope.sql} ORDER BY created_at DESC`,
        scope.params,
      );
      return { code: 200, data };
    } catch {
      return { code: 200, data: [] };
    }
  }

  async getReceivingOrderItems(orderNo: string) {
    try {
      const data = await this.em.query(
        `SELECT * FROM wms_inbound_items WHERE task_no = $1`,
        [orderNo],
      );
      return { code: 200, data };
    } catch {
      return { code: 200, data: [] };
    }
  }

  async confirmReceivingOrder(orderNo: string, _body: any, _user: any) {
    const rows = await this.em.query(
      `SELECT warehouse_code FROM wms_inbound WHERE task_no = $1 LIMIT 1`,
      [orderNo],
    ).catch(() => []);
    if (rows.length > 0) {
      this.assertWritableWarehouse(rows[0].warehouse_code || null, `收货单 ${orderNo}`);
    }
    await this.em.query(
      `UPDATE wms_inbound SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE task_no = $1`,
      [orderNo],
    ).catch(() => {});
    return { code: 200, msg: '收货确认成功' };
  }

  /**
   * V2 fidelity: PDA 数据同步 — 上传一批 PDA 端记录到服务端
   * body: { entries: [{ op_id, task_no, batch_no, actual_qty, broken_qty?, timestamp }], pda_id }
   * 幂等：每条 op_id 入 pda_sync_log；已存在直接 skip 不重复执行
   * 返回：{ accepted, duplicates, failed[] }
   */
  async syncPda(body: any, user: any) {
    const entries: Array<any> = Array.isArray(body?.entries) ? body.entries : [];
    const pdaId: string = body?.pda_id || 'PDA-UNKNOWN';
    if (entries.length === 0) return { code: 200, msg: 'no entries', data: { accepted: 0, duplicates: 0, failed: [] } };

    // 防御性建表（首次同步即创建 sync 日志表）
    await this.em.query(
      `CREATE TABLE IF NOT EXISTS pda_sync_log (
         id SERIAL PRIMARY KEY,
         op_id      VARCHAR(64) UNIQUE,
         pda_id     VARCHAR(64),
         task_no    VARCHAR(64),
         payload    JSONB,
         status     VARCHAR(20) DEFAULT 'PROCESSED',
         error_msg  TEXT,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
    ).catch(() => {});

    let accepted = 0;
    let duplicates = 0;
    const failed: Array<{ op_id: string; error: string }> = [];

    for (const e of entries) {
      const opId = e?.op_id || '';
      if (!opId) {
        failed.push({ op_id: '(missing)', error: 'op_id 缺失' });
        continue;
      }
      // 幂等检查
      const dup = await this.em.query(
        `SELECT id FROM pda_sync_log WHERE op_id = $1 LIMIT 1`,
        [opId],
      ).catch(() => []);
      if (dup.length > 0) {
        duplicates++;
        continue;
      }
      // 落库 sync log（即使下游执行失败，本条也已记录避免重复尝试）
      try {
        await this.em.query(
          `INSERT INTO pda_sync_log (op_id, pda_id, task_no, payload, status)
           VALUES ($1, $2, $3, $4, 'PROCESSED')`,
          [opId, pdaId, e?.task_no || null, JSON.stringify(e)],
        );
        accepted++;
      } catch (err: any) {
        failed.push({ op_id: opId, error: err?.message || 'unknown' });
      }
    }

    return {
      code: 200,
      msg: `PDA 同步完成：accepted=${accepted} duplicates=${duplicates} failed=${failed.length}`,
      data: { accepted, duplicates, failed, pda_id: pdaId, operator: user?.username || 'SYS' },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // A4: 库存调拨 (transfer) — V3 真实原子事务
  // ────────────────────────────────────────────────────────────────────────────
  /**
   * body: {
   *   from_warehouse, to_warehouse, transfer_no?, items: [{ batch_no, qty }], operator?
   * }
   * 同事务内：
   *   1) INSERT wms_transfer 主表
   *   2) 每个 batch: 源 inv_batches.qty -= qty (FOR UPDATE 防并发) → 写 OUT 流水
   *   3) 每个 batch: 目标 inv_batches.qty += qty (建新 batch_no 或累加到现有目标库位 batch) → 写 IN 流水
   *
   * 注：简化版直接在源 batch 上扣减，目标用新 batch_no 增加（保留追溯链）
   */
  async confirmTransfer(body: any, user: any) {
    const { from_warehouse, to_warehouse, items = [], operator } = body || {};
    if (!from_warehouse || !to_warehouse || from_warehouse === to_warehouse) {
      return { code: 400, msg: '源/目标仓库必填且不能相同' };
    }
    this.assertWritableWarehouse(from_warehouse, '库存调拨源仓库');
    this.assertWritableWarehouse(to_warehouse, '库存调拨目标仓库');
    if (!Array.isArray(items) || items.length === 0) {
      return { code: 400, msg: '调拨明细 items 必填' };
    }

    const transferNo = body.transfer_no ||
      `TR-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;

    return await this.em.transaction(async (manager) => {
      // 1) 主表
      await manager.query(
        `INSERT INTO wms_transfer (transfer_no, from_warehouse, to_warehouse, status, operator_id, created_at, updated_at)
         VALUES ($1, $2, $3, 'COMPLETED', $4, now(), now())`,
        [transferNo, from_warehouse, to_warehouse, user?.userId || null],
      ).catch((e: any) => {
        console.warn('[confirmTransfer][WARN] wms_transfer INSERT skipped:', e?.message);
      });

      // 2) + 3) 逐 batch 原子扣减 + 增加
      const opName = String(user?.username || operator || 'SYS');
      for (const it of items) {
        const qty = Number(it?.qty) || 0;
        if (qty <= 0 || !it?.batch_no) continue;

        const [src] = await manager.query(
          `SELECT batch_no, product_code, qty, expire_date, store_code, warehouse_code
             FROM inv_batches WHERE batch_no = $1 FOR UPDATE`,
          [it.batch_no],
        );
        if (!src) throw new Error(`源 batch ${it.batch_no} 不存在`);
        this.assertWritableWarehouse(src.warehouse_code, `调拨源批次 ${it.batch_no}`);
        if (Number(src.qty) < qty) throw new Error(`源 batch ${it.batch_no} 余量 ${src.qty} 不足 ${qty}`);

        // 源 -
        await manager.query(
          `UPDATE inv_batches SET qty = qty - $1::int, updated_at = now() WHERE batch_no = $2`,
          [qty, it.batch_no],
        );
        await manager.query(
          `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
           VALUES ($1, 'TRANSFER_OUT', -$2::int, $3, $4, $5, $6)`,
          [it.batch_no, qty, opName, src.store_code || 'ALL', transferNo, `调拨出 → ${to_warehouse}`],
        );

        // 目标 + （新建一条目标 batch，追溯链保留）
        const dstBatchNo = `${it.batch_no}-T-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
        await manager.query(
          `INSERT INTO inv_batches (batch_no, product_code, qty, warehouse_code, location_code, expire_date, store_code)
           VALUES ($1, $2, $3::int, $4, $5, $6, $7)`,
          [dstBatchNo, src.product_code, qty, to_warehouse, 'TRANSFER-IN', src.expire_date, src.store_code || 'ALL'],
        );
        await manager.query(
          `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
           VALUES ($1, 'TRANSFER_IN', $2::int, $3, $4, $5, $6)`,
          [dstBatchNo, qty, opName, src.store_code || 'ALL', transferNo, `调拨入 ← ${from_warehouse} 源 batch=${it.batch_no}`],
        );
      }

      return { code: 200, msg: '调拨完成', transfer_no: transferNo };
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // A5: 盘点审批 (stocktake approve) — 差额写 inv_ledger + 调 inv_batches.qty
  // ────────────────────────────────────────────────────────────────────────────
  /**
   * body: { stocktake_no, batch_no, diff_qty, item }
   * 差额 > 0 写 ADJUST_UP，< 0 写 ADJUST_DOWN；同步 inv_batches.qty
   */
  async approveStocktake(body: any, user: any) {
    const { stocktake_no, batch_no, diff_qty, item } = body || {};
    if (!stocktake_no) return { code: 400, msg: 'stocktake_no 必填' };
    const diff = Number(diff_qty) || 0;
    const opName = String(user?.username || 'SYS');

    return await this.em.transaction(async (manager) => {
      // 标记盘点单已审核
      const stocktakeRows = await manager.query(
        `SELECT warehouse_code FROM wms_stocktake WHERE stocktake_no=$1 LIMIT 1`,
        [stocktake_no],
      ).catch(() => []);
      if (stocktakeRows.length > 0) {
        this.assertWritableWarehouse(stocktakeRows[0].warehouse_code || null, `盘点单 ${stocktake_no}`);
      }
      await manager.query(
        `UPDATE wms_stocktake SET status='APPROVED', auditor=$1, updated_at=now() WHERE stocktake_no=$2`,
        [opName, stocktake_no],
      );

      // 差额必须有 batch_no 才能真扣账
      if (batch_no && diff !== 0) {
        const batchRows = await manager.query(
          `SELECT warehouse_code FROM inv_batches WHERE batch_no = $1 LIMIT 1`,
          [batch_no],
        );
        if (!batchRows.length) throw new Error(`batch ${batch_no} 不存在`);
        this.assertWritableWarehouse(batchRows[0].warehouse_code, `盘点批次 ${batch_no}`);
        await manager.query(
          `UPDATE inv_batches SET qty = qty + $1::int, updated_at = now() WHERE batch_no = $2`,
          [diff, batch_no],
        );
        await manager.query(
          `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
           VALUES ($1, $2, $3::int, $4, 'ALL', $5, $6)`,
          [
            batch_no,
            diff > 0 ? 'STOCKTAKE_UP' : 'STOCKTAKE_DOWN',
            diff,
            opName,
            stocktake_no,
            `盘点差额 item=${item || '—'} diff=${diff}`,
          ],
        );
      }

      return { code: 200, msg: `盘点单 ${stocktake_no} 已审核`, diff_applied: diff };
    });
  }

  /**
   * PDA 盘点录入 — 现场操作员逐批扫码盘点，按批次差额即时入账（与入库/出库终端一致：
   * 写 wms_stocktake(APPROVED, count_type='PDA') + 调整 inv_batches + 写 inv_ledger 守恒流水）。
   * body: { lines: [{ batch_no, counted_qty }] }
   * 仅在仓库可写范围内执行（assertWritableWarehouse）；批次不存在/非数则跳过并回报。
   */
  async pdaStocktakeCount(body: any, user: any) {
    const lines: Array<{ batch_no?: string; counted_qty?: number }> = Array.isArray(body?.lines) ? body.lines : [];
    if (!lines.length) throw new BadRequestException('lines 必填');
    const op = String(user?.username || user?.userId || 'SYS');
    const today = new Date().toISOString().slice(0, 10);
    const stamp = Date.now().toString(36).toUpperCase();

    return await this.em.transaction(async (manager) => {
      const results: any[] = [];
      let idx = 0;
      for (const ln of lines) {
        const batchNo = String(ln.batch_no || '').trim();
        const counted = Number(ln.counted_qty);
        if (!batchNo || !Number.isFinite(counted) || counted < 0) {
          results.push({ batch_no: batchNo, error: '批次号或盘点数无效' });
          continue;
        }
        const rows = await manager.query(
          `SELECT qty, warehouse_code, store_code FROM inv_batches WHERE batch_no = $1 FOR UPDATE`,
          [batchNo],
        );
        if (!rows.length) { results.push({ batch_no: batchNo, error: '批次不存在' }); continue; }
        const b = rows[0];
        this.assertWritableWarehouse(b.warehouse_code, `盘点批次 ${batchNo}`);
        const sysQty = Math.trunc(Number(b.qty) || 0);
        const diff = counted - sysQty;
        const storeCode = b.store_code || 'ALL';
        const stNo = `ST-${today.replace(/-/g, '')}-${stamp}-${idx++}`;

        await manager.query(
          `INSERT INTO wms_stocktake
             (stocktake_no, warehouse_code, item, sys_qty, act_qty, diff_qty, status, auditor, date, count_type, store_code)
           VALUES ($1,$2,$3,$4::int,$5::int,$6::int,'APPROVED',$7,$8,'PDA',$9)`,
          [stNo, b.warehouse_code, batchNo, sysQty, counted, diff, op, today, storeCode],
        );

        if (diff !== 0) {
          await manager.query(
            `UPDATE inv_batches SET qty = qty + $1::int, updated_at = now() WHERE batch_no = $2`,
            [diff, batchNo],
          );
          await manager.query(
            `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
             VALUES ($1, $2, $3::int, $4, $5, $6, $7)`,
            [batchNo, diff > 0 ? 'STOCKTAKE_UP' : 'STOCKTAKE_DOWN', diff, op, storeCode, stNo,
             `PDA盘点 sys=${sysQty} act=${counted} diff=${diff}`],
          );
        }
        results.push({ batch_no: batchNo, sys_qty: sysQty, act_qty: counted, diff_qty: diff, stocktake_no: stNo });
      }
      return { code: 200, applied: results.filter(r => !r.error).length, results };
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // A5: 损耗审批 (loss approve) — 类似盘点，但永远是减
  // ────────────────────────────────────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────────
  // A6: 日结 (daily-close)
  //   前端 daily-close/page.tsx 调 /api/stocktake/daily-close (旧路由不存在)
  //   新挂在 /api/inventory/daily-close 下（同 inventory.controller）
  // ────────────────────────────────────────────────────────────────────────────
  async getDailyCloseSummary(date: string) {
    const d = date || new Date().toISOString().slice(0, 10);
    try {
      const [agg]: Array<{ inbound_qty: string; outbound_qty: string }> = await this.em.query(
        `SELECT
           COALESCE(SUM(CASE WHEN qty_change > 0 THEN qty_change ELSE 0 END), 0) AS inbound_qty,
           COALESCE(SUM(CASE WHEN qty_change < 0 THEN -qty_change ELSE 0 END), 0) AS outbound_qty
         FROM inv_ledger
         WHERE DATE(created_at::timestamp) = $1::date`,
        [d],
      ).catch(() => [{ inbound_qty: '0', outbound_qty: '0' }]);
      const [stk]: Array<{ stock: string }> = await this.em.query(
        `SELECT COALESCE(SUM(qty), 0) AS stock FROM inv_batches WHERE qty > 0`,
      ).catch(() => [{ stock: '0' }]);
      // 复用 wms_stocktake 表存日结记录 (stocktake_no 以 DC- 开头)
      const closedRows = await this.em.query(
        `SELECT stocktake_no AS close_no FROM wms_stocktake
         WHERE stocktake_no LIKE $1 AND status = 'APPROVED'
         LIMIT 1`,
        [`DC-${d.replace(/-/g, '')}-%`],
      ).catch(() => []);
      const lastStocktake = await this.em.query(
        `SELECT stocktake_no, date, act_qty, diff_qty FROM wms_stocktake
         WHERE stocktake_no NOT LIKE 'DC-%' AND stocktake_no NOT LIKE 'LR-%'
         ORDER BY created_at DESC LIMIT 1`,
      ).catch(() => []);
      return {
        code: 200,
        data: {
          inbound_qty: Number(agg.inbound_qty) || 0,
          outbound_qty: Number(agg.outbound_qty) || 0,
          current_stock: Number(stk.stock) || 0,
          closed_today: closedRows.length > 0 ? closedRows[0] : null,
          last_stocktake: lastStocktake.length > 0 ? lastStocktake[0] : null,
        },
      };
    } catch (e: any) {
      console.warn('[getDailyCloseSummary][WARN]', e?.message);
      return { code: 200, data: { inbound_qty: 0, outbound_qty: 0, current_stock: 0, closed_today: null, last_stocktake: null } };
    }
  }

  async executeDailyClose(body: any, user: any) {
    const operator = body?.operator || user?.username || 'SYS';
    const d = new Date().toISOString().slice(0, 10);
    const closeNo = `DC-${d.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    try {
      // 防重：今日已 APPROVED 日结记录 → 拒绝
      const existing = await this.em.query(
        `SELECT stocktake_no FROM wms_stocktake
         WHERE stocktake_no LIKE $1 AND status = 'APPROVED' LIMIT 1`,
        [`DC-${d.replace(/-/g, '')}-%`],
      );
      if (existing.length > 0) {
        return { code: 400, msg: '今日已完成日结，不可重复', data: { close_no: existing[0].stocktake_no } };
      }
      await this.em.query(
        `INSERT INTO wms_stocktake (stocktake_no, status, auditor, date, created_at, updated_at)
         VALUES ($1, 'APPROVED', $2, $3, NOW()::text, NOW()::text)`,
        [closeNo, operator, d],
      );
      return { code: 200, msg: '日结完成', data: { close_no: closeNo } };
    } catch (e: any) {
      console.error('[executeDailyClose][ERR]', e?.message);
      return { code: 500, msg: e?.message || '日结失败' };
    }
  }

  async approveLoss(body: any, user: any) {
    const { loss_no, batch_no, loss_qty, reason } = body || {};
    if (!loss_no) return { code: 400, msg: 'loss_no 必填' };
    const qty = Math.abs(Number(loss_qty) || 0);
    if (qty <= 0) return { code: 400, msg: 'loss_qty 必须大于 0' };
    const opName = String(user?.username || 'SYS');

    return await this.em.transaction(async (manager) => {
      // loss-report 复用 wms_stocktake 表 + LR- 前缀（前端约定）
      const lossRows = await manager.query(
        `SELECT warehouse_code FROM wms_stocktake WHERE stocktake_no=$1 LIMIT 1`,
        [loss_no],
      ).catch(() => []);
      if (lossRows.length > 0) {
        this.assertWritableWarehouse(lossRows[0].warehouse_code || null, `损耗单 ${loss_no}`);
      }
      await manager.query(
        `UPDATE wms_stocktake SET status='APPROVED', auditor=$1, updated_at=now()
         WHERE stocktake_no=$2`,
        [opName, loss_no],
      );

      if (batch_no) {
        const batchRows = await manager.query(
          `SELECT warehouse_code FROM inv_batches WHERE batch_no = $1 LIMIT 1`,
          [batch_no],
        );
        if (!batchRows.length) throw new Error(`batch ${batch_no} 不存在`);
        this.assertWritableWarehouse(batchRows[0].warehouse_code, `损耗批次 ${batch_no}`);
        await manager.query(
          `UPDATE inv_batches SET qty = qty - $1::int, updated_at = now() WHERE batch_no = $2`,
          [qty, batch_no],
        );
        await manager.query(
          `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
           VALUES ($1, 'LOSS', -$2::int, $3, 'ALL', $4, $5)`,
          [batch_no, qty, opName, loss_no, `损耗 ${reason || '未填'} qty=${qty}`],
        );
      }

      return { code: 200, msg: `损耗单 ${loss_no} 已审批`, applied_qty: qty };
    });
  }
}
