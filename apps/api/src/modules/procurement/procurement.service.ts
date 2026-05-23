import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { PurchaseOrderEntity } from './entities/purchase-order.entity';
import { ApprovalService } from '../approval/approval.service';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class ProcurementService {
  constructor(
    @InjectEntityManager() private readonly em: EntityManager,
    private readonly approvalService: ApprovalService,
    private readonly cls: ClsService,
  ) {}

  // ─── 采购单 CRUD ─────────────────────────────────────────────────────────────
  async createPurchaseOrder(dto: {
    supplier_code: string;
    supplier_name?: string;
    subject?: string;
    plan_qty: number;
    total_amount: number;
    currency_code?: string;
    expected_date?: string;
    pay_deadline?: string;
    contract_note?: string;
    remark?: string;
  }) {
    // 原子性生成合同编号，序列保证并发不重号
    const year = new Date().getFullYear();
    const [{ seq }] = await this.em.query(
      `SELECT LPAD(nextval('prc_contract_no_seq')::text, 5, '0') AS seq`,
    );
    const po = new PurchaseOrderEntity();
    po.po_no          = `PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    po.contract_no    = `HT-${year}-${seq}`;
    po.status         = 'DRAFT';
    po.supplier_code  = dto.supplier_code;
    po.supplier_name  = dto.supplier_name || '';
    po.subject        = dto.subject || '';
    po.plan_qty       = dto.plan_qty;
    po.total_amount   = dto.total_amount;
    po.currency_code  = dto.currency_code || (dto.total_amount > 50000 ? 'LAK' : 'CNY');
    po.expected_date  = dto.expected_date || (null as any);
    po.pay_deadline   = dto.pay_deadline  || (null as any);
    po.contract_note  = dto.contract_note || '';
    po.remark         = dto.remark || '';
    po.store_code     = this.cls.get('user.storeCode') || 'ALL';
    po.created_by     = this.cls.get('user.userId');
    return await this.em.save(PurchaseOrderEntity, po);
  }

  // ─── 获取可用审批人列表（有审批权限的在职用户） ───────────────────────────
  async getApprovers() {
    try {
      const data = await this.em.query(`
        SELECT DISTINCT u.user_id, u.username, u.real_name, u.store_code,
               r.role_code, r.role_name_zh
        FROM sys_user u
        JOIN sys_user_role ur ON u.user_id = ur.user_id
        JOIN sys_role r ON ur.role_id = r.role_id
        WHERE r.role_code IN ('ROLE_ADMIN', 'ROLE_REGION_MGR', 'ROLE_CEO')
          AND u.status = 1
        ORDER BY u.real_name
      `);
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }

  // ─── Org 隔离辅助：全局角色（集团层）可见所有，场级用户只见本场 ──────────────
  private get isGlobalUser(): boolean {
    const storeCode: string = this.cls.get('user.storeCode') || 'ALL';
    return !storeCode || storeCode === 'ALL';
  }

  private get userStoreCode(): string {
    return this.cls.get('user.storeCode') || 'ALL';
  }

  async getRequests() {
    try {
      const params: any[] = [];
      let scopeClause = '';
      if (!this.isGlobalUser) {
        params.push(this.userStoreCode);
        scopeClause = ` AND store_code = $${params.length}`;
      }
      const data = await this.em.query(
        `SELECT * FROM prc_purchase_orders WHERE status IN ('DRAFT','PENDING_APPROVAL')${scopeClause} ORDER BY created_at DESC`,
        params,
      );
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }

  async getOrders() {
    try {
      const params: any[] = [];
      let scopeClause = '';
      if (!this.isGlobalUser) {
        params.push(this.userStoreCode);
        scopeClause = ` AND store_code = $${params.length}`;
      }
      const data = await this.em.query(
        `SELECT * FROM prc_purchase_orders WHERE status NOT IN ('DRAFT')${scopeClause} ORDER BY created_at DESC`,
        params,
      );
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }

  async submitForApproval(
    poNo: string,
    extra?: { approver_id?: number; approver_name?: string; contract_url?: string },
  ) {
    const po = await this.em.findOne(PurchaseOrderEntity, { where: { po_no: poNo } });
    if (!po) throw new BadRequestException('采购单不存在');
    if (po.status !== 'DRAFT') throw new BadRequestException('只能提交草稿状态的采购单');
    if (extra?.approver_id)   po.approver_id   = extra.approver_id;
    if (extra?.approver_name) po.approver_name  = extra.approver_name;
    if (extra?.contract_url)  po.contract_url   = extra.contract_url;
    po.status = 'PENDING_APPROVAL';
    await this.em.save(PurchaseOrderEntity, po);
    await this.approvalService.submitForApproval({
      docType: 'PURCHASE_ORDER', docId: Number(po.id),
      amount: Number(po.total_amount), currencyCode: po.currency_code,
      submitterId: po.created_by ? Number(po.created_by) : 1,
    });
    return { code: 200, msg: '已提交审批', po };
  }

  async onApproved(docId: string) {
    await this.em.update(PurchaseOrderEntity, { id: docId }, { status: 'APPROVED' });
  }

  // ─── 批准采购单（同时生成待付款记录） ─────────────────────────────────────────
  async approvePO(poNo: string) {
    const po = await this.em.findOne(PurchaseOrderEntity, { where: { po_no: poNo } });
    if (!po) throw new BadRequestException('采购单不存在');

    await this.em.transaction(async (manager) => {
      // 1. 更新 PO 状态
      await manager.query(
        `UPDATE prc_purchase_orders SET status='APPROVED', updated_at=CURRENT_TIMESTAMP WHERE po_no=$1`,
        [poNo],
      );
      // 2. 幂等：若已有此 PO 的待付款记录则跳过
      const [exists] = await manager.query(
        `SELECT 1 FROM fin_transactions WHERE po_no=$1 AND type='AP' LIMIT 1`,
        [poNo],
      );
      if (!exists) {
        const txnNo = `AP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        await manager.query(
          `INSERT INTO fin_transactions
             (txn_no, type, account_code, amount, currency_code, status, ref_no, po_no, description, created_at)
           VALUES ($1,'AP','AP-TRADE',$2,$3,'PENDING',$4,$5,$6,CURRENT_TIMESTAMP)`,
          [
            txnNo,
            po.total_amount,
            po.currency_code || 'LAK',
            poNo,
            poNo,
            `采购单：${po.subject || ''} / ${po.supplier_name || po.supplier_code || ''}`,
          ],
        );
      }
    });
    return { code: 200, msg: '采购单已批准，待付款记录已生成' };
  }

  // ─── 待付款列表（来自PO批准的AP记录）─────────────────────────────────────────
  async getPendingPayments() {
    try {
      const params: any[] = [];
      let scopeClause = '';
      if (!this.isGlobalUser) {
        params.push(this.userStoreCode);
        scopeClause = ` AND po.store_code = $${params.length}`;
      }
      const data = await this.em.query(`
        SELECT ft.id, ft.txn_no, ft.amount, ft.currency_code, ft.status,
               ft.description, ft.due_date, ft.created_at, ft.po_no,
               po.subject, po.supplier_name, po.supplier_code,
               po.contract_no, po.pay_deadline, po.plan_qty, po.currency_code AS po_currency,
               po.store_code
        FROM fin_transactions ft
        LEFT JOIN prc_purchase_orders po ON ft.po_no = po.po_no
        WHERE ft.type = 'AP' AND ft.status = 'PENDING' AND ft.po_no IS NOT NULL${scopeClause}
        ORDER BY ft.created_at DESC
      `, params);
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }

  // ─── 确认付款（财务操作）─────────────────────────────────────────────────────
  async confirmPayment(
    txnId: number,
    dto: { payment_ref?: string; payment_proof?: string; method?: string },
  ) {
    const [txn] = await this.em.query(
      `SELECT * FROM fin_transactions WHERE id=$1`, [txnId],
    );
    if (!txn) throw new BadRequestException('付款记录不存在');
    if (txn.status === 'PAID') throw new BadRequestException('该笔款项已确认付款');

    await this.em.transaction(async (manager) => {
      const methodNote = dto.method ? ` | 付款方式：${dto.method}` : '';
      await manager.query(
        `UPDATE fin_transactions
         SET status='PAID', payment_ref=$1, payment_proof=$2,
             note=COALESCE(note,'')||$3, updated_at=CURRENT_TIMESTAMP
         WHERE id=$4`,
        [dto.payment_ref || null, dto.payment_proof || null, methodNote, txnId],
      );
      if (txn.po_no) {
        await manager.query(
          `UPDATE prc_purchase_orders
           SET status='PAID', updated_at=CURRENT_TIMESTAMP
           WHERE po_no=$1`,
          [txn.po_no],
        );
      }
    });
    return { code: 200, msg: '付款已确认' };
  }

  // ─── 收货确认 ─────────────────────────────────────────────────────────────────
  async confirmReceipt(poNo: string, items: any[]) {
    await this.em.transaction(async (manager) => {
      await manager.query(
        `UPDATE prc_purchase_orders SET status = 'RECEIVED' WHERE po_no = $1`, [poNo],
      );
      for (const item of items) {
        const batchNo = `B-${Date.now()}${Math.floor(Math.random() * 1000)}`;
        await manager.query(
          `INSERT INTO inv_batches (batch_no, product_code, qty, warehouse_code, location_code)
           VALUES ($1, $2, $3, $4, $5)`,
          [batchNo, item.product_code, item.qty, item.warehouse || 'WH-B', 'INBOUND-TMP'],
        );
      }
      const totalAmount = items.reduce((s, i) => s + (i.qty * (i.price || 0)), 0);
      if (totalAmount > 0) {
        const txnNo = `AP-${Date.now()}`;
        await manager.query(
          `INSERT INTO fin_transactions (txn_no, type, amount, currency_code, status, description, created_at)
           VALUES ($1,'AP',$2,'LAK','PENDING',$3,CURRENT_TIMESTAMP)`,
          [txnNo, totalAmount, `采购收货自动生成应付账款 PO:${poNo}`],
        );
      }
    });
    return { code: 200, msg: '收货确认成功，库存已入账，应付账款已生成' };
  }

  async updateReceiveProgress(poNo: string, receivedQty: number) {
    const po = await this.em.findOne(PurchaseOrderEntity, { where: { po_no: poNo } });
    if (!po) throw new BadRequestException(`采购单 ${poNo} 不存在`);
    po.received_qty += receivedQty;
    po.status = po.received_qty >= po.plan_qty ? 'COMPLETED' : 'PARTIAL_RECEIVED';
    await this.em.save(PurchaseOrderEntity, po);
    return { code: 200, data: po };
  }

  // ─── 供应商 ──────────────────────────────────────────────────────────────────
  async getSuppliers() {
    try {
      const data = await this.em.query(
        `SELECT * FROM prc_suppliers WHERE status = 'ACTIVE' ORDER BY supplier_name`,
      );
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }

  async getSupplierKpi() {
    try {
      const data = await this.em.query(`
        SELECT s.supplier_name, s.supplier_code,
               COUNT(po.po_no)                                           AS total_orders,
               SUM(CASE WHEN po.status = 'COMPLETED' THEN 1 ELSE 0 END) AS fulfilled_orders,
               COALESCE(SUM(po.total_amount), 0)                         AS total_spend,
               ROUND(
                 100.0 * SUM(CASE WHEN po.status = 'COMPLETED' THEN 1 ELSE 0 END)
                       / NULLIF(COUNT(po.po_no), 0), 1
               )                                                          AS fulfillment_rate
        FROM prc_suppliers s
        LEFT JOIN prc_purchase_orders po ON s.supplier_code = po.supplier_code
        GROUP BY s.supplier_name, s.supplier_code
        ORDER BY total_spend DESC
      `);
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }

  // ─── 三单比对 (Three-Way Match) ──────────────────────────────────────────────
  async getThreeWayMatch(poNo: string) {
    try {
      const [order] = await this.em.query(
        `SELECT * FROM prc_purchase_orders WHERE po_no = $1`, [poNo],
      );
      if (!order) return { code: 404, msg: '采购单不存在' };

      // 收货单（入库记录）
      const receipts = await this.em.query(
        `SELECT * FROM wms_inbound WHERE source_po_no = $1`, [poNo],
      ).catch(() => []);

      // 发票（应付账款凭证）
      const invoices = await this.em.query(
        `SELECT * FROM fin_transactions WHERE type='AP' AND description LIKE $1`,
        [`%${poNo}%`],
      ).catch(() => []);

      const orderAmt   = Number(order.total_amount || 0);
      const receiptAmt = receipts.reduce((s: number, r: any) => s + Number(r.total_amount || r.amount || 0), 0);
      const invoiceAmt = invoices.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);

      const matchStatus =
        orderAmt === 0                                          ? 'EMPTY' :
        receiptAmt === 0 && invoiceAmt === 0                   ? 'PENDING_RECEIPT' :
        invoiceAmt === 0                                        ? 'PENDING_INVOICE' :
        Math.abs(orderAmt - receiptAmt) / orderAmt < 0.02 &&
        Math.abs(receiptAmt - invoiceAmt) / receiptAmt < 0.02  ? 'MATCHED' : 'MISMATCH';

      return {
        code: 200,
        data: {
          po: order,
          receipts,
          invoices,
          match: {
            order_amount:   orderAmt,
            receipt_amount: receiptAmt,
            invoice_amount: invoiceAmt,
            status: matchStatus,
            order_vs_receipt_diff:  orderAmt - receiptAmt,
            receipt_vs_invoice_diff: receiptAmt - invoiceAmt,
          },
        },
      };
    } catch (e: any) {
      return { code: 500, msg: '三单比对失败', detail: e.message };
    }
  }

  // ─── 采购看板汇总 ─────────────────────────────────────────────────────────────
  async getDashboardSummary() {
    try {
      const thisMonth = new Date().toISOString().slice(0, 7);
      const [[pending], [approved], [monthSpend], [overdue]] = await Promise.all([
        this.em.query(`SELECT COUNT(*) AS cnt FROM prc_purchase_orders WHERE status='PENDING_APPROVAL'`),
        this.em.query(`SELECT COUNT(*) AS cnt FROM prc_purchase_orders WHERE status='APPROVED'`),
        this.em.query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM prc_purchase_orders
                       WHERE TO_CHAR(created_at,'YYYY-MM')=$1`, [thisMonth]),
        this.em.query(`SELECT COUNT(*) AS cnt FROM prc_purchase_orders
                       WHERE status NOT IN ('COMPLETED','CANCELLED') AND expected_date < CURRENT_DATE`),
      ]);
      return {
        code: 200,
        data: {
          pending_approval: Number(pending?.cnt || 0),
          approved_orders:  Number(approved?.cnt || 0),
          month_spend:      Number(monthSpend?.total || 0),
          overdue_orders:   Number(overdue?.cnt || 0),
        },
      };
    } catch {
      return { code: 200, data: { pending_approval: 0, approved_orders: 0, month_spend: 0, overdue_orders: 0 } };
    }
  }

  // ─── 饲料耗料对账 ─────────────────────────────────────────────────────────────
  async getFeedReconciliation(startDate: string, endDate: string, houseCode?: string) {
    if (!startDate || !endDate) return { code: 400, msg: '缺少时间范围' };
    try {
      let deviceSql = `
        SELECT erp_house_code AS house, SUM(max_val) AS total, COUNT(*) AS days
        FROM mon_device_property_daily_agg
        WHERE property_code = '2488' AND agg_date >= $1 AND agg_date <= $2
      `;
      const deviceParams: any[] = [startDate, endDate];
      if (houseCode) { deviceSql += ` AND erp_house_code = $3`; deviceParams.push(houseCode); }
      deviceSql += ` GROUP BY erp_house_code`;

      const deviceRows = await this.em.query(deviceSql, deviceParams).catch(() => []);
      let deviceTotal = 0;
      const deviceByHouse: Record<string, any> = {};
      for (const r of deviceRows) {
        deviceTotal += Number(r.total) || 0;
        deviceByHouse[r.house] = { device_total: Number(r.total), days: r.days };
      }

      const procRows = await this.em.query(`
        SELECT DATE(created_at) AS receipt_date, product_code AS item,
               SUM(qty) AS proc_qty, COUNT(*) AS receipt_count
        FROM inv_batches
        WHERE created_at >= $1::date AND created_at <= $2::date + interval '1 day'
        GROUP BY DATE(created_at), product_code
        ORDER BY receipt_date DESC
      `, [startDate, endDate]).catch(() => []);

      let procTotal = 0;
      for (const r of procRows) procTotal += Number(r.proc_qty) || 0;

      const variance    = Math.round(procTotal - deviceTotal);
      const variancePct = procTotal > 0 ? Math.round((variance / procTotal) * 100) : 0;
      let status = 'OK', note = '采购入库与设备消耗基本平衡';
      if (variance > procTotal * 0.1)                           { status = 'OVER_PROCURED';  note = '采购量显著大于设备消耗，可能存在库存积压。'; }
      else if (variance < -(procTotal * 0.1) && deviceTotal > 0) { status = 'UNDER_PROCURED'; note = '设备消耗大于采购入库，可能存在未记账采购。'; }

      return {
        code: 200,
        data: {
          device_consumption:   { total_kg: Math.round(deviceTotal), by_house: deviceByHouse },
          procurement_receipts: { total_kg: Math.round(procTotal),   detail: procRows },
          reconciliation:       { status, variance_kg: variance, variance_pct: Math.abs(variancePct), note },
        },
      };
    } catch (e: any) {
      return { code: 500, msg: e.message };
    }
  }

  // ─── 采购申请 (prc_purchase_requests) ──────────────────────────────────────

  /** 获取采购申请列表（org 隔离） */
  async getPurchaseRequests() {
    try {
      const params: any[] = [];
      let scopeClause = '';
      if (!this.isGlobalUser) {
        params.push(this.userStoreCode);
        scopeClause = ` AND store_code = $${params.length}`;
      }
      const data = await this.em.query(
        `SELECT * FROM prc_purchase_requests WHERE 1=1${scopeClause} ORDER BY created_at DESC LIMIT 200`,
        params,
      );
      return { code: 200, data };
    } catch (e) { return { code: 200, data: [] }; }
  }

  /** 发起采购申请（业务用户） */
  async createPurchaseRequest(dto: {
    subject: string;
    item?: string;
    qty?: string;
    urgency?: string;
    budget_amount?: number;
    currency_code?: string;
    expected_date?: string;
    reason?: string;
    category?: string;
    attachment_url?: string;   // 合同/报价单/图片附件（POST /api/upload/contract 返回的路径）
    supplier_name?: string;    // 已知供应商（可选，申请阶段可不填）
    supplier_code?: string;
  }) {
    if (!dto.subject?.trim()) throw new BadRequestException('申请主题不能为空');
    const year = new Date().getFullYear();
    const ts   = Date.now();
    const reqNo = `REQ-${year}-${ts.toString().slice(-6)}`;
    await this.em.query(
      `INSERT INTO prc_purchase_requests
         (req_no, subject, item, qty, urgency, budget_amount, currency_code,
          expected_date, reason, category, attachment_url, supplier_name, supplier_code,
          status, store_code, requester_id, applicant, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
               'PENDING',$14,$15,$16,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      [
        reqNo,
        dto.subject.trim(),
        dto.item || '',
        dto.qty || '',
        dto.urgency || 'NORMAL',
        dto.budget_amount || 0,
        dto.currency_code || 'LAK',
        dto.expected_date || null,
        dto.reason || '',
        dto.category || 'OTHER',
        dto.attachment_url || null,
        dto.supplier_name || null,
        dto.supplier_code || null,
        this.cls.get('user.storeCode') || 'ALL',
        this.cls.get('user.userId') || null,
        this.cls.get('user.realNameZh') || this.cls.get('user.username') || '',
      ],
    );
    return { code: 200, msg: '采购申请已提交', reqNo };
  }

  /** 采购员拒绝申请 */
  async rejectRequest(id: number, note: string) {
    const [req] = await this.em.query(
      `SELECT id, status FROM prc_purchase_requests WHERE id=$1`, [id],
    );
    if (!req) throw new BadRequestException('采购申请不存在');
    if (req.status !== 'PENDING') throw new BadRequestException(`当前状态 ${req.status} 不可拒绝，只能拒绝待处理申请`);

    await this.em.query(
      `UPDATE prc_purchase_requests
       SET status='REJECTED', reject_note=$1, approved_by=$2, reviewer_name=$3,
           approved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
       WHERE id=$4`,
      [
        note || '不符合采购条件',
        String(this.cls.get('user.userId') || ''),
        this.cls.get('user.realNameZh') || this.cls.get('user.username') || '',
        id,
      ],
    );
    return { code: 200, msg: '已拒绝该申请' };
  }

  /** 采购员将申请转为采购单（DRAFT PO） */
  async convertRequestToPO(
    id: number,
    dto: {
      supplier_code: string;
      supplier_name?: string;
      total_amount: number;
      currency_code?: string;
      expected_date?: string;
      pay_deadline?: string;
      contract_note?: string;
    },
  ) {
    if (!(dto.total_amount > 0)) throw new BadRequestException('采购金额必须大于 0');

    const [req] = await this.em.query(
      `SELECT * FROM prc_purchase_requests WHERE id=$1`, [id],
    );
    if (!req) throw new BadRequestException('采购申请不存在');
    if (req.status !== 'PENDING') throw new BadRequestException('只能转换待处理状态的申请');

    // 复用 createPurchaseOrder 生成合同号并建 PO（DRAFT）
    const po = await this.createPurchaseOrder({
      supplier_code:  dto.supplier_code,
      supplier_name:  dto.supplier_name || req.supplier_name || '',
      subject:        req.subject || '',
      plan_qty:       Number(req.qty) || 1,
      total_amount:   dto.total_amount,
      currency_code:  dto.currency_code || req.currency_code || 'LAK',
      expected_date:  dto.expected_date || req.expected_date || '',
      pay_deadline:   dto.pay_deadline || '',
      contract_note:  dto.contract_note || req.reason || '',
      remark:         `来自采购申请 ${req.req_no}`,
    });

    // 标记申请为已转换
    await this.em.query(
      `UPDATE prc_purchase_requests
       SET status='CONVERTED', po_no=$1, approved_by=$2, reviewer_name=$3,
           approved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
       WHERE id=$4`,
      [
        (po as any).po_no,
        String(this.cls.get('user.userId') || ''),
        this.cls.get('user.realNameZh') || this.cls.get('user.username') || '',
        id,
      ],
    );
    return { code: 200, msg: '已成功转为采购单（草稿）', po };
  }
}
