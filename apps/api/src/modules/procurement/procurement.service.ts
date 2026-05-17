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
    remark?: string;
  }) {
    const po = new PurchaseOrderEntity();
    po.po_no          = `PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    po.supplier_code  = dto.supplier_code;
    po.supplier_name  = dto.supplier_name || '';
    po.subject        = dto.subject || '';
    po.plan_qty       = dto.plan_qty;
    po.total_amount   = dto.total_amount;
    po.currency_code  = dto.currency_code || (dto.total_amount > 50000 ? 'LAK' : 'CNY');
    po.expected_date  = dto.expected_date || '';
    po.remark         = dto.remark || '';
    po.store_code     = this.cls.get('user.storeCode') || 'ALL';
    po.created_by     = this.cls.get('user.userId');
    return await this.em.save(PurchaseOrderEntity, po);
  }

  async getRequests() {
    try {
      const data = await this.em.query(
        `SELECT * FROM prc_purchase_orders WHERE status IN ('DRAFT','PENDING_APPROVAL') ORDER BY created_at DESC`,
      );
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }

  async getOrders() {
    try {
      const data = await this.em.query(
        `SELECT * FROM prc_purchase_orders WHERE status NOT IN ('DRAFT') ORDER BY created_at DESC`,
      );
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }

  async submitForApproval(poNo: string) {
    const po = await this.em.findOne(PurchaseOrderEntity, { where: { po_no: poNo } });
    if (!po) throw new BadRequestException('采购单不存在');
    if (po.status !== 'DRAFT') throw new BadRequestException('只能提交草稿状态的采购单');
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
}
