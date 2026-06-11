import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * V3 WmsService
 * 替代已废弃的 WmsV2CompatService，所有操作直接操作 V3 数据表
 */
@Injectable()
export class WmsService {
  constructor(
    @InjectEntityManager()
    private readonly em: EntityManager,
  ) {}

  // ─── 入库 (Inbound) ─────────────────────────────────────────────────────────
  async getInboundDashboard() {
    try {
      const [pending] = await this.em.query(
        `SELECT COUNT(*) as count FROM wms_inbound WHERE status = 'PENDING'`,
      );
      const [processing] = await this.em.query(
        `SELECT COUNT(*) as count FROM wms_inbound WHERE status = 'PROCESSING'`,
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
      const data = await this.em.query(
        `SELECT * FROM wms_inbound WHERE status IN ('PENDING', 'PROCESSING') ORDER BY created_at DESC`,
      );
      return { code: 200, data };
    } catch {
      return { code: 200, data: [] };
    }
  }

  async getInboundTask(taskNo: string) {
    try {
      const tasks = await this.em.query(
        `SELECT * FROM wms_inbound WHERE task_no = $1`,
        [taskNo],
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
    for (const it of items) {
      const actual = Number(it.actual_qty ?? it.qty) || 0;
      const broken = Number(it.broken_qty) || 0;
      const expected = it.expected_qty != null ? Number(it.expected_qty) : null;
      if (expected != null && actual + broken !== expected) {
        validationErrors.push(
          `批次 ${it.batch_no || it.product_code}: actual(${actual}) + broken(${broken}) ≠ expected(${expected})`,
        );
      }
      if (actual < 0 || broken < 0) {
        validationErrors.push(
          `批次 ${it.batch_no || it.product_code}: actual_qty / broken_qty 不可为负`,
        );
      }
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

        const baseBatchNo = item.batch_no ||
          `IBN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
        const warehouseCode = item.warehouse_code || item.warehouse || defaultWarehouse;
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
            `INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, location_code, store_code)
             VALUES ($1, $2, $3::int, $3::int, 'AVAILABLE', $4, $5, $6)
             ON CONFLICT (batch_no) DO UPDATE SET
               qty = inv_batches.qty + EXCLUDED.qty,
               qty_available = COALESCE(inv_batches.qty_available, inv_batches.qty) + EXCLUDED.qty,
               updated_at = now()`,
            [baseBatchNo, item.product_code, actualQty, warehouseCode, locationCode, storeCode],
          );
          await manager.query(
            `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
             VALUES ($1, 'INBOUND', $2::int, $3, $4, $5, $6)`,
            [
              baseBatchNo, actualQty, operator, storeCode, task_no,
              `入库确认 product=${item.product_code} actual=${actualQty} warehouse=${warehouseCode}`,
            ],
          );
        }

        // V2 fidelity: 破损 → 独立 QUARANTINE batch（qty_available=0，可追溯但不可销售）
        if (brokenQty > 0) {
          const brokenBatchNo = `${baseBatchNo}-BROKEN`;
          await manager.query(
            `INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, location_code, store_code)
             VALUES ($1, $2, $3::int, 0, 'QUARANTINE', $4, $5, $6)
             ON CONFLICT (batch_no) DO UPDATE SET
               qty = inv_batches.qty + EXCLUDED.qty,
               qty_available = 0,
               status = 'QUARANTINE',
               updated_at = now()`,
            [brokenBatchNo, item.product_code, brokenQty, warehouseCode, 'QUARANTINE-DOCK', storeCode],
          );
          await manager.query(
            `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
             VALUES ($1, 'INBOUND_BROKEN', $2::int, $3, $4, $5, $6)`,
            [
              brokenBatchNo, brokenQty, operator, storeCode, task_no,
              `破损入隔离 product=${item.product_code} broken=${brokenQty}`,
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
      items: { productCode?: string; qty: number; batchNo?: string; locationCode?: string }[];
    },
  ): Promise<{ batchNos: string[]; skipped: number }> {
    const storeCode = ctx.storeCode || 'ALL';
    const operator = ctx.operator || 'SYS';
    const warehouseCode = ctx.warehouseCode || 'WMS-VTE-MAIN';
    const batchNos: string[] = [];
    let skipped = 0;
    for (let idx = 0; idx < ctx.items.length; idx++) {
      const it = ctx.items[idx];
      const qty = Math.round(Number(it.qty) || 0);
      if (qty <= 0 || !it.productCode) { skipped++; continue; }
      const batchNo = (it.batchNo || `${ctx.refNo}-${String(idx + 1).padStart(3, '0')}`).slice(0, 64);
      const locationCode = (it.locationCode || 'INBOUND-DOCK').slice(0, 64);
      await manager.query(
        `INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, location_code, store_code)
         VALUES ($1, $2, $3::int, $3::int, 'AVAILABLE', $4, $5, $6)
         ON CONFLICT (batch_no) DO UPDATE SET
           qty = inv_batches.qty + EXCLUDED.qty,
           qty_available = COALESCE(inv_batches.qty_available, inv_batches.qty) + EXCLUDED.qty,
           updated_at = now()`,
        [batchNo, it.productCode, qty, warehouseCode, locationCode, storeCode],
      );
      await manager.query(
        `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
         VALUES ($1, 'INBOUND', $2::int, $3, $4, $5, $6)`,
        [batchNo, qty, operator, storeCode, ctx.refNo,
         `采购收货入库 product=${it.productCode} qty=${qty} wh=${warehouseCode}`],
      );
      batchNos.push(batchNo);
    }
    return { batchNos, skipped };
  }

  // ─── 出库 (Outbound) ────────────────────────────────────────────────────────
  async getOutboundDashboard() {
    try {
      const [pending] = await this.em.query(
        `SELECT COUNT(*) as count FROM ord_orders WHERE status = 'approved'`,
      );
      const [allocated] = await this.em.query(
        `SELECT COUNT(*) as count FROM ord_orders WHERE status = 'allocated'`,
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
      const data = await this.em.query(
        `SELECT * FROM ord_orders WHERE status IN ('approved', 'locked', 'allocated') ORDER BY created_at DESC`,
      );
      return { code: 200, data };
    } catch {
      return { code: 200, data: [] };
    }
  }

  async getOutboundOrder(orderNo: string) {
    try {
      const orders = await this.em.query(
        `SELECT * FROM ord_orders WHERE order_no = $1`,
        [orderNo],
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
   * body: { next_status, items?: [{batch_no, qty}] }
   */
  async advanceOutboundOrder(orderNo: string, body: any, user: any) {
    // 统一 UPPER 状态枚举 (与 order.service VALID_TRANSITIONS 对齐)
    const nextStatus = String(body?.next_status || 'allocated').toUpperCase();
    const items: Array<{ batch_no: string; qty: number }> = Array.isArray(body?.items) ? body.items : [];

    return await this.em.transaction(async (manager) => {
      const ords = await manager.query(
        `SELECT order_no, status, store_code FROM ord_orders WHERE order_no = $1`,
        [orderNo],
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
          if (qty <= 0 || !it.batch_no) continue;

          // 检查余量
          const [batch] = await manager.query(
            `SELECT qty FROM inv_batches WHERE batch_no = $1 FOR UPDATE`,
            [it.batch_no],
          );
          if (!batch) {
            throw new Error(`batch ${it.batch_no} 不存在`);
          }
          if (Number(batch.qty) < qty) {
            throw new Error(`batch ${it.batch_no} 余量 ${batch.qty} 不足 ${qty}`);
          }

          await manager.query(
            `UPDATE inv_batches SET qty = qty - $1::int, updated_at = now() WHERE batch_no = $2`,
            [qty, it.batch_no],
          );
          await manager.query(
            `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
             VALUES ($1, 'OUTBOUND', -$2::int, $3, $4, $5, $6)`,
            [
              it.batch_no,
              qty,
              String(user?.userId || user?.username || 'SYS'),
              order.store_code || 'ALL',
              orderNo,
              `出库 status=${nextStatus} batch=${it.batch_no} qty=${qty}`,
            ],
          );
        }
      }

      return { code: 200, msg: `状态推进至 ${nextStatus}` };
    });
  }

  /**
   * 收货签收 — V3 真实实现
   * body: { receiver, sign_time, items?: [{ batch_no, actual_qty }] }
   */
  async receiveSignOrder(orderNo: string, body: any, user: any) {
    const receiver = body?.receiver || user?.username || 'SYS';
    return await this.em.transaction(async (manager) => {
      const result = await manager.query(
        `UPDATE ord_orders SET status='received', updated_at=CURRENT_TIMESTAMP
         WHERE order_no = $1
         RETURNING order_no, store_code`,
        [orderNo],
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
      const data = await this.em.query(
        `SELECT * FROM inv_batches WHERE qty > 0 ORDER BY created_at DESC LIMIT 200`,
      );
      return { code: 200, data };
    } catch {
      return { code: 200, data: [] };
    }
  }

  async getReceivingOrders() {
    try {
      const data = await this.em.query(
        `SELECT * FROM wms_inbound WHERE status = 'PENDING' ORDER BY created_at DESC`,
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
          `SELECT batch_no, product_code, qty, expire_date, store_code
             FROM inv_batches WHERE batch_no = $1 FOR UPDATE`,
          [it.batch_no],
        );
        if (!src) throw new Error(`源 batch ${it.batch_no} 不存在`);
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
      await manager.query(
        `UPDATE wms_stocktake SET status='APPROVED', auditor=$1, updated_at=now() WHERE stocktake_no=$2`,
        [opName, stocktake_no],
      );

      // 差额必须有 batch_no 才能真扣账
      if (batch_no && diff !== 0) {
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
      await manager.query(
        `UPDATE wms_stocktake SET status='APPROVED', auditor=$1, updated_at=now()
         WHERE stocktake_no=$2`,
        [opName, loss_no],
      );

      if (batch_no) {
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
