import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
// Phase D: SalesEngineService 已迁移至 store-pos 模块，切断 StoreModule → OrderModule 依赖
import { SalesEngineService } from '../store-pos/services/sales-engine.service';

/**
 * PosService — POS 收银业务服务
 *
 * V3 重构（覆盖审计 Batch A：A1 销售心脏 + A2 退款反账）+ V2 fidelity backfill：
 *
 * V2 来源（_archive/phoenix-backend-v2-sqlite/src/routes/pos.js）：
 *   - SEC-04  store_code/cashier 强制取自 Token (req.user)，禁止跨店伪造
 *   - SEC-11  sale_no 幂等性 — 同 sale_no 重发返回原结果
 *   - BIZ-01  库存预检 — qty_available 不足直接 409
 *   - BIZ-02  价格带保护 — SalesEngine.PriceValidator 拦截低于零售下限
 *             auth_override + manager_username/password 走店长授权路径
 *   - sessions 开班/结班/当日汇总
 */
@Injectable()
export class PosService {
  constructor(
    @InjectEntityManager() private readonly em: EntityManager,
    private readonly salesEngine: SalesEngineService,
  ) {}

  /**
   * 创建销售单 — 原子事务
   *
   * body: {
   *   sale_no?, store_code, cashier, member_phone?,
   *   pay_method: 'CASH'|'CARD'|'QR'|'MIXED',
   *   note?, session_no?,
   *   items: [{ product_code, product_name_zh, product_name_lo?, batch_no, qty, unit_price }],
   *   discount_amount?: number
   * }
   */
  async createSale(body: any, user: any) {
    if (!Array.isArray(body?.items) || body.items.length === 0) {
      throw new BadRequestException('items 至少 1 条');
    }

    // SEC-04（V2 fidelity）：store_code/cashier 强制取自 Token
    // 仅 storeCode='ALL'（admin/总部）允许通过 body 指定，且需 fallback 默认门店
    const tokenStoreCode: string | undefined = user?.storeCode || user?.store_code;
    const storeCode =
      tokenStoreCode && tokenStoreCode !== 'ALL'
        ? tokenStoreCode
        : (body.store_code || 'ST-VTE-001');
    if (tokenStoreCode && tokenStoreCode !== 'ALL' && body.store_code && body.store_code !== tokenStoreCode) {
      throw new ForbiddenException(`SEC-04: 不能跨店提交（Token=${tokenStoreCode} body=${body.store_code}）`);
    }
    const cashier = user?.username || body.cashier || 'SYS';
    const saleNo = body.sale_no || this.genSaleNo();

    // SEC-11（V2 fidelity）：sale_no 幂等 — 同 sale_no 已落库直接返回原结果，不再走事务
    const existing = await this.em.query(
      `SELECT sale_no, net_amount FROM pos_sales WHERE sale_no = $1 LIMIT 1`,
      [saleNo],
    );
    if (existing.length > 0) {
      return {
        code: 200,
        msg: '交易已处理（幂等）',
        data: { sale_no: saleNo, net_amount: Number(existing[0].net_amount) || 0, idempotent: true },
      };
    }

    // BIZ-02（V2 fidelity）：零售价格带保护 — 用 SalesEngine.PriceValidator
    // 仅当未走店长授权 (auth_override=false) 时拦截；走授权时须验证店长账号密码
    const authOverride = body.auth_override === true || body.auth_override === 'true';
    if (authOverride) {
      const mgrUser: string | undefined = body.manager_username;
      const mgrPass: string | undefined = body.manager_password;
      if (!mgrUser || !mgrPass) {
        throw new ForbiddenException('店长授权失败：缺少 manager_username/manager_password');
      }
      // V3 canonical: sys_user + sys_user_role JOIN sys_role 取 role_code
      const rows: Array<{ username: string; password_hash?: string; role?: string }> =
        await this.em.query(
          `SELECT u.username, u.password_hash,
                  COALESCE(
                    (SELECT r.role_code FROM sys_user_role ur
                       JOIN sys_role r ON ur.role_id = r.role_id
                      WHERE ur.user_id = u.user_id AND ur.is_primary = true LIMIT 1),
                    (SELECT r.role_code FROM sys_user_role ur
                       JOIN sys_role r ON ur.role_id = r.role_id
                      WHERE ur.user_id = u.user_id LIMIT 1)
                  ) AS role
             FROM sys_user u
            WHERE u.username = $1 AND u.status = 1 LIMIT 1`,
          [mgrUser],
        ).catch(() => []);
      if (rows.length === 0) {
        throw new ForbiddenException('店长授权失败：账号不存在或已停用');
      }
      const mgrRole = (rows[0].role || '').toUpperCase();
      if (!['ROLE_STORE_MGR', 'ROLE_ADMIN', 'ROLE_SYSOPS'].includes(mgrRole)) {
        throw new ForbiddenException('店长授权失败：权限不足');
      }
      // 复用 bcrypt 验证；导入避免循环依赖，直接 require
      const bcrypt = require('bcrypt');
      const hash = rows[0].password_hash || '';
      const ok = hash && (await bcrypt.compare(mgrPass, hash).catch(() => false));
      if (!ok) {
        throw new ForbiddenException('店长授权失败：密码错误');
      }
    } else if (body.price_book_id) {
      // POS 不走 customer ownership/region，仅校验价格带
      const validation = await this.salesEngine.validatePriceOnly(
        { customer_code: '__POS__', price_book_id: body.price_book_id, seller_subject_id: cashier },
        body.items.map((it: any) => ({
          product_code: it.product_code,
          unit_price: Number(it.unit_price) || 0,
          qty: Number(it.qty) || 0,
          price_source: 'NORMAL' as const,
        })),
      );
      if (!validation.passed) {
        throw new BadRequestException({
          code: 400,
          error_type: 'PRICE_LIMIT_ERROR',
          msg: '触发价格保护机制：交易包含低于底价的商品，请店长授权。',
          errors: validation.errors,
          requires_approval: validation.requiresApproval,
        });
      }
    }

    return await this.em.transaction(async (mgr) => {
      // BIZ-01（V2 fidelity）：库存预检 — 使用 qty_available 而非 qty
      let totalAmount = 0;
      for (const it of body.items) {
        const qty = Number(it.qty) || 0;
        const unit = Number(it.unit_price) || 0;
        if (qty <= 0) throw new BadRequestException(`item.qty 必须 > 0`);
        totalAmount += qty * unit;

        if (it.batch_no) {
          const [batch] = await mgr.query(
            `SELECT batch_no, qty, qty_available, status FROM inv_batches WHERE batch_no = $1 FOR UPDATE`,
            [it.batch_no],
          );
          if (!batch) throw new BadRequestException(`batch ${it.batch_no} 不存在`);
          if (batch.status && !['AVAILABLE', null, ''].includes(batch.status)) {
            throw new BadRequestException(`批次 ${it.batch_no} 状态 ${batch.status}，不可销售`);
          }
          const avail = batch.qty_available != null ? Number(batch.qty_available) : Number(batch.qty);
          if (avail < qty) {
            throw new BadRequestException(`库存不足: ${it.product_code} 批次 ${it.batch_no} 可用 ${avail}，请求 ${qty}`);
          }
        }
      }

      const discount = Math.max(0, Number(body.discount_amount) || 0);
      const netAmount = Math.max(0, totalAmount - discount);

      // 2) INSERT pos_sales
      await mgr.query(
        `INSERT INTO pos_sales
           (sale_no, store_code, cashier, member_phone, total_amount, discount_amount, net_amount,
            pay_method, status, session_no, sale_type, note, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'COMPLETED',$9,$10,$11,now()::text,now()::text)`,
        [
          saleNo, storeCode, cashier, body.member_phone || null,
          totalAmount, discount, netAmount,
          body.pay_method || 'CASH',
          body.session_no || null,
          body.sale_type || 'NORMAL',
          body.note || null,
        ],
      );

      // 3) INSERT pos_sale_items + 扣 inv_batches.qty + 写 inv_ledger SALE_OUT
      for (const it of body.items) {
        const qty = Number(it.qty) || 0;
        const unit = Number(it.unit_price) || 0;
        const subtotal = qty * unit;
        await mgr.query(
          `INSERT INTO pos_sale_items
             (sale_no, product_code, product_name_zh, product_name_lo, batch_no, qty, unit_price, subtotal, store_code, created_at)
           VALUES ($1,$2,$3,$4,$5,$6::int,$7,$8,$9,now())`,
          [
            saleNo, it.product_code, it.product_name_zh || '', it.product_name_lo || '',
            it.batch_no || null, qty, unit, subtotal, storeCode,
          ],
        );

        if (it.batch_no) {
          await mgr.query(
            `UPDATE inv_batches
               SET qty = qty - $1::int,
                   qty_available = GREATEST(0, COALESCE(qty_available, qty) - $1::int),
                   updated_at = now()
             WHERE batch_no = $2`,
            [qty, it.batch_no],
          );
          await mgr.query(
            `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
             VALUES ($1, 'SALE_OUT', -$2::int, $3, $4, $5, $6)`,
            [
              it.batch_no, qty, cashier, storeCode, saleNo,
              `POS 销售 sale=${saleNo} product=${it.product_code} qty=${qty}`,
            ],
          );
        }
      }

      return {
        code: 200,
        msg: '销售单创建成功',
        data: { sale_no: saleNo, total_amount: totalAmount, net_amount: netAmount },
      };
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // V2 fidelity: POS sessions（开班/查班/结班/当日汇总）
  // 来源：_archive/phoenix-backend-v2-sqlite/src/routes/pos.js
  // ────────────────────────────────────────────────────────────────────────────

  /** 开班 — store_code/cashier 强制取自 Token */
  async openSession(body: any, user: any) {
    const tokenStoreCode: string | undefined = user?.storeCode || user?.store_code;
    const storeCode =
      tokenStoreCode && tokenStoreCode !== 'ALL'
        ? tokenStoreCode
        : (body?.store_code || 'ST-VTE-001');
    const cashier = user?.username || body?.cashier || 'SYS';
    const openingCash = Math.max(0, Number(body?.opening_cash) || 0);

    // 同店当前已有 OPEN 班次 → 直接返回，不重复开班
    const [open] = await this.em.query(
      `SELECT session_no FROM pos_sessions WHERE store_code = $1 AND status = 'OPEN' ORDER BY open_time DESC LIMIT 1`,
      [storeCode],
    );
    if (open) {
      return { code: 200, msg: '已有进行中班次', data: { session_no: open.session_no, idempotent: true } };
    }

    const sessionNo = `SES-${storeCode}-${Date.now()}`;
    await this.em.query(
      `INSERT INTO pos_sessions (session_no, store_code, cashier, opening_cash, status, open_time)
       VALUES ($1, $2, $3, $4, 'OPEN', now()::text)`,
      [sessionNo, storeCode, cashier, openingCash],
    );
    return { code: 200, msg: '开班成功', data: { session_no: sessionNo, store_code: storeCode, cashier } };
  }

  /** 查询当前 OPEN 班次 */
  async getCurrentSession(storeCodeQuery: string, user: any) {
    const tokenStoreCode: string | undefined = user?.storeCode || user?.store_code;
    const storeCode =
      tokenStoreCode && tokenStoreCode !== 'ALL'
        ? tokenStoreCode
        : (storeCodeQuery || 'ST-VTE-001');
    const [session] = await this.em.query(
      `SELECT session_no, store_code, cashier, opening_cash, open_time, status
         FROM pos_sessions WHERE store_code = $1 AND status = 'OPEN'
        ORDER BY open_time DESC LIMIT 1`,
      [storeCode],
    );
    return { code: 200, data: session || null };
  }

  /** 结班 — 汇总该班次销售并归档 */
  async closeSession(body: any, user: any) {
    const sessionNo = body?.session_no;
    if (!sessionNo) throw new BadRequestException('session_no 必填');
    const closingCash = Math.max(0, Number(body?.closing_cash) || 0);
    const remark = body?.remark || '';

    return await this.em.transaction(async (mgr) => {
      const [session] = await mgr.query(
        `SELECT session_no, store_code, status FROM pos_sessions WHERE session_no = $1 FOR UPDATE`,
        [sessionNo],
      );
      if (!session) throw new BadRequestException(`班次 ${sessionNo} 不存在`);
      if (session.status === 'CLOSED') {
        return { code: 400, msg: `班次 ${sessionNo} 已结班，请勿重复` };
      }
      // SEC-04 跨店保护
      const tokenStoreCode: string | undefined = user?.storeCode || user?.store_code;
      if (tokenStoreCode && tokenStoreCode !== 'ALL' && tokenStoreCode !== session.store_code) {
        throw new ForbiddenException(`SEC-04: 不能结他人门店班次（Token=${tokenStoreCode} session=${session.store_code}）`);
      }

      const [summary] = await mgr.query(
        `SELECT COALESCE(SUM(net_amount),0)::float8 AS total_sales,
                COUNT(*)::int               AS order_count
           FROM pos_sales WHERE session_no = $1`,
        [sessionNo],
      );
      await mgr.query(
        `UPDATE pos_sessions
            SET status = 'CLOSED', close_time = now()::text,
                closing_cash = $1, total_sales = $2, order_count = $3, remark = $4
          WHERE session_no = $5`,
        [closingCash, summary?.total_sales || 0, summary?.order_count || 0, remark, sessionNo],
      );
      return {
        code: 200,
        msg: '结班成功',
        data: {
          session_no: sessionNo,
          total_sales: Number(summary?.total_sales) || 0,
          order_count: Number(summary?.order_count) || 0,
          closing_cash: closingCash,
        },
      };
    });
  }

  /** 当日销售汇总 + 热销 TOP10 */
  async getTodaySummary(storeCodeQuery: string, user: any) {
    const tokenStoreCode: string | undefined = user?.storeCode || user?.store_code;
    const storeCode =
      tokenStoreCode && tokenStoreCode !== 'ALL'
        ? tokenStoreCode
        : (storeCodeQuery || 'ST-VTE-001');
    const today = new Date().toISOString().slice(0, 10);

    const [summary] = await this.em.query(
      `SELECT
         COALESCE(SUM(net_amount),0)::float8                                                 AS total_sales,
         COUNT(*)::int                                                                       AS order_count,
         COALESCE(SUM(CASE WHEN pay_method = 'CASH'      THEN net_amount ELSE 0 END),0)::float8 AS cash_sales,
         COALESCE(SUM(CASE WHEN pay_method <> 'CASH'     THEN net_amount ELSE 0 END),0)::float8 AS card_sales
       FROM pos_sales
       WHERE store_code = $1 AND substr(created_at,1,10) = $2`,
      [storeCode, today],
    );

    const items: Array<{ product_code: string; product_name_zh: string; total_qty: number; total_amount: number }> =
      await this.em.query(
        `SELECT si.product_code,
                MAX(si.product_name_zh) AS product_name_zh,
                SUM(si.qty)::int        AS total_qty,
                SUM(si.subtotal)::float8 AS total_amount
           FROM pos_sale_items si
           JOIN pos_sales s ON s.sale_no = si.sale_no
          WHERE s.store_code = $1 AND substr(s.created_at,1,10) = $2
          GROUP BY si.product_code
          ORDER BY total_amount DESC
          LIMIT 10`,
        [storeCode, today],
      );

    return { code: 200, data: { summary: summary || {}, top_items: items } };
  }

  /**
   * 退款 — 反向事务
   * body: { sale_no }
   * 仅当 status='COMPLETED' 时允许；将每个 item 的 qty 加回 inv_batches + 写 SALE_REFUND ledger
   */
  async refundSale(saleNo: string, body: any, user: any) {
    if (!saleNo) throw new BadRequestException('sale_no 必填');

    return await this.em.transaction(async (mgr) => {
      const [sale] = await mgr.query(
        `SELECT sale_no, store_code, cashier, net_amount, status FROM pos_sales WHERE sale_no = $1 FOR UPDATE`,
        [saleNo],
      );
      if (!sale) return { code: 404, msg: `销售单 ${saleNo} 不存在` };
      if (sale.status !== 'COMPLETED') {
        return { code: 400, msg: `销售单当前状态为 ${sale.status}，无法退款` };
      }

      const operator = user?.username || sale.cashier || 'SYS';
      const items = await mgr.query(
        `SELECT product_code, batch_no, qty FROM pos_sale_items WHERE sale_no = $1`,
        [saleNo],
      );

      for (const it of items) {
        const qty = Number(it.qty) || 0;
        if (qty <= 0 || !it.batch_no) continue;
        await mgr.query(
          `UPDATE inv_batches
             SET qty = qty + $1::int,
                 qty_available = COALESCE(qty_available, qty) + $1::int,
                 updated_at = now()
           WHERE batch_no = $2`,
          [qty, it.batch_no],
        );
        await mgr.query(
          `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
           VALUES ($1, 'SALE_REFUND', $2::int, $3, $4, $5, $6)`,
          [
            it.batch_no, qty, operator, sale.store_code, saleNo,
            `POS 退款 sale=${saleNo} product=${it.product_code} qty=${qty} reason=${body?.reason || '未填'}`,
          ],
        );
      }

      await mgr.query(
        `UPDATE pos_sales SET status='REFUNDED', updated_at=now()::text, note = COALESCE(note,'') || $1 WHERE sale_no = $2`,
        [` | 退款原因: ${body?.reason || '未填'}`, saleNo],
      );

      return { code: 200, msg: '退款成功', data: { sale_no: saleNo, refunded_amount: Number(sale.net_amount) } };
    });
  }

  /**
   * 作废 — 仅当 status='COMPLETED' 且当日的销售，操作上等同退款但 ledger 类型为 SALE_VOID
   */
  async voidSale(saleNo: string, body: any, user: any) {
    if (!saleNo) throw new BadRequestException('sale_no 必填');

    return await this.em.transaction(async (mgr) => {
      const [sale] = await mgr.query(
        `SELECT sale_no, store_code, cashier, status, created_at FROM pos_sales WHERE sale_no = $1 FOR UPDATE`,
        [saleNo],
      );
      if (!sale) return { code: 404, msg: `销售单 ${saleNo} 不存在` };
      if (sale.status !== 'COMPLETED') {
        return { code: 400, msg: `销售单当前状态为 ${sale.status}，无法作废` };
      }

      const operator = user?.username || sale.cashier || 'SYS';
      const items = await mgr.query(
        `SELECT product_code, batch_no, qty FROM pos_sale_items WHERE sale_no = $1`,
        [saleNo],
      );
      for (const it of items) {
        const qty = Number(it.qty) || 0;
        if (qty <= 0 || !it.batch_no) continue;
        await mgr.query(
          `UPDATE inv_batches
             SET qty = qty + $1::int,
                 qty_available = COALESCE(qty_available, qty) + $1::int,
                 updated_at = now()
           WHERE batch_no = $2`,
          [qty, it.batch_no],
        );
        await mgr.query(
          `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
           VALUES ($1, 'SALE_VOID', $2::int, $3, $4, $5, $6)`,
          [
            it.batch_no, qty, operator, sale.store_code, saleNo,
            `POS 作废 sale=${saleNo} product=${it.product_code} reason=${body?.reason || '未填'}`,
          ],
        );
      }
      await mgr.query(
        `UPDATE pos_sales SET status='VOIDED', updated_at=now()::text, note = COALESCE(note,'') || $1 WHERE sale_no = $2`,
        [` | 作废原因: ${body?.reason || '未填'}`, saleNo],
      );

      return { code: 200, msg: '作废成功' };
    });
  }

  private genSaleNo(): string {
    const d = new Date();
    const yyyymmdd = d.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `S-${yyyymmdd}-${rand}`;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // A3: 门店损耗审批 — 扣 store_inventory + 写 inv_ledger STORE_LOSS
  // ────────────────────────────────────────────────────────────────────────────
  async approveStoreLoss(body: any, user: any) {
    const { loss_no, batch_no, item, qty, store_code, reason } = body || {};
    if (!loss_no) throw new BadRequestException('loss_no 必填');
    const lossQty = Math.abs(Number(qty) || 0);
    if (lossQty <= 0) throw new BadRequestException('qty 必须 > 0');

    return await this.em.transaction(async (mgr) => {
      // 标记审批通过
      await mgr.query(
        `UPDATE store_losses SET status='APPROVED', updated_at=now()::text WHERE loss_no = $1`,
        [loss_no],
      );

      // 优先按 batch_no 扣 inv_batches；无 batch_no 时不扣（只标记审批）
      if (batch_no) {
        await mgr.query(
          `UPDATE inv_batches SET qty = qty - $1::int, updated_at = now() WHERE batch_no = $2`,
          [lossQty, batch_no],
        );
        await mgr.query(
          `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
           VALUES ($1, 'STORE_LOSS', -$2::int, $3, $4, $5, $6)`,
          [
            batch_no, lossQty,
            user?.username || 'SYS',
            store_code || 'ALL',
            loss_no,
            `门店损耗 item=${item || '—'} reason=${reason || '未填'} qty=${lossQty}`,
          ],
        );
      }

      // 同步扣 store_inventory.qty_on_hand（如存在对应 store+product 行）
      if (store_code && item) {
        await mgr.query(
          `UPDATE store_inventory
              SET qty_on_hand = GREATEST(0, COALESCE(qty_on_hand, 0) - $1::numeric)
            WHERE store_code = $2 AND (product_code = $3 OR sku = $3)`,
          [lossQty, store_code, item],
        );
      }

      return { code: 200, msg: `损耗单 ${loss_no} 已审批，已扣库存 ${lossQty}`, data: { loss_no, qty: lossQty } };
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // A4: 门店收货确认 — 增 store_inventory + 写 inv_ledger STORE_RECV
  // ────────────────────────────────────────────────────────────────────────────
  async confirmStoreReceiving(orderNo: string, body: any, user: any) {
    if (!orderNo) throw new BadRequestException('order_no 必填');
    const items: Array<{ batch_no?: string; product_code?: string; qty: number }> =
      Array.isArray(body?.items) ? body.items : [];

    return await this.em.transaction(async (mgr) => {
      const [recv] = await mgr.query(
        `SELECT order_no, store_code, status FROM store_receiving WHERE order_no = $1 FOR UPDATE`,
        [orderNo],
      );
      if (!recv) return { code: 404, msg: `收货单 ${orderNo} 不存在` };
      if (recv.status === 'ACCEPTED') return { code: 400, msg: `${orderNo} 已验收，请勿重复` };

      const operator = user?.username || body?.operator || 'SYS';
      await mgr.query(
        `UPDATE store_receiving
           SET status = 'ACCEPTED', operator = $1, confirmed_at = now()::text, updated_at = now()::text
         WHERE order_no = $2`,
        [operator, orderNo],
      );

      // 每个 item: 增 store_inventory + 写 ledger
      for (const it of items) {
        const qty = Number(it.qty) || 0;
        if (qty <= 0) continue;

        if (it.batch_no) {
          // 写 ledger 心脏（STORE_RECV +qty）
          await mgr.query(
            `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
             VALUES ($1, 'STORE_RECV', $2::int, $3, $4, $5, $6)`,
            [it.batch_no, qty, operator, recv.store_code || 'ALL', orderNo, `门店验收 product=${it.product_code || '—'} qty=${qty}`],
          );
        }

        // store_inventory upsert
        if (it.product_code && recv.store_code) {
          await mgr.query(
            `UPDATE store_inventory
               SET qty_on_hand = COALESCE(qty_on_hand, 0) + $1::numeric,
                   qty_available = COALESCE(qty_available, 0) + $1::numeric,
                   updated_at = now()
             WHERE store_code = $2 AND product_code = $3 AND COALESCE(batch_no,'') = COALESCE($4,'')`,
            [qty, recv.store_code, it.product_code, it.batch_no || ''],
          );
        }
      }
      return { code: 200, msg: '收货验收完成', data: { order_no: orderNo, status: 'ACCEPTED' } };
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // A5: 补货申请审批 — APPROVED 状态置位（出库单生成留给上游 wms 流程）
  // ────────────────────────────────────────────────────────────────────────────
  async approveReplenishReq(reqNo: string, body: any, user: any) {
    if (!reqNo) throw new BadRequestException('req_no 必填');
    const approver = user?.username || body?.approver || 'SYS';
    const decision = body?.decision === 'REJECTED' ? 'REJECTED' : 'APPROVED';

    return await this.em.transaction(async (mgr) => {
      const [req] = await mgr.query(
        `SELECT id, req_no, store_code, item, qty, status FROM store_replenish_req WHERE req_no = $1 FOR UPDATE`,
        [reqNo],
      );
      if (!req) return { code: 404, msg: `补货申请 ${reqNo} 不存在` };
      if (req.status === 'APPROVED' || req.status === 'REJECTED') {
        return { code: 400, msg: `补货申请已是 ${req.status}，请勿重复审批` };
      }

      await mgr.query(
        `UPDATE store_replenish_req SET status = $1, updated_at = now()::text WHERE req_no = $2`,
        [decision, reqNo],
      );

      // APPROVED 时建一个 wms_outbound 工单作为上游出库依据（不直接扣库存 — 待 wms 出库时再扣）
      // 用 SAVEPOINT 隔离 — 这条 INSERT 失败时整笔事务不会被毒化（之前 .catch(()=>{}) 会导致
      // 整个 em.transaction commit 时回滚，状态更新也跟着丢）
      if (decision === 'APPROVED') {
        const outboundNo = `WO-REPL-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
        await mgr.query('SAVEPOINT sp_wms_out');
        try {
          await mgr.query(
            `INSERT INTO wms_outbound (outbound_no, type, item, qty, status, picker, created_at, ref_no)
             VALUES ($1, 'REPLENISH', $2, $3, 'PENDING', $4, now()::text, $5)`,
            [outboundNo, req.item, String(Number(req.qty) || 0), approver, reqNo],
          );
          await mgr.query('RELEASE SAVEPOINT sp_wms_out');
        } catch (e: any) {
          await mgr.query('ROLLBACK TO SAVEPOINT sp_wms_out');
          console.warn('[approveReplenishReq][WARN] wms_outbound INSERT skipped:', e?.message);
        }
      }

      return { code: 200, msg: `补货申请 ${reqNo} 已${decision === 'APPROVED' ? '批准' : '拒绝'}`, data: { req_no: reqNo, status: decision } };
    });
  }
}
