import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';

export type LifecycleActorType = 'USER' | 'WORKFLOW' | 'SYSTEM' | 'MOBILE' | 'INTEGRATION';

export interface AppendLifecycleEvent {
  eventId?: string;
  salesOrderId: string;
  orderNo: string;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
  actorType: LifecycleActorType;
  reasonCode?: string | null;
  comment?: string | null;
  sourceEndpoint?: string | null;
  sourceModule: string;
  sourceRefType?: string | null;
  sourceRefId?: string | null;
  sourceRefNo?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

@Injectable()
export class SalesOrderLifecycleService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async appendEvent(manager: EntityManager, event: AppendLifecycleEvent): Promise<string> {
    const eventId = event.eventId ?? randomUUID();
    await manager.query(
      `INSERT INTO sal_order_lifecycle_events (
         event_id, sales_order_id, order_no, event_type, from_status, to_status,
         actor_user_id, actor_name, actor_type, reason_code, comment,
         source_endpoint, source_module, source_ref_type, source_ref_id, source_ref_no,
         request_id, metadata, occurred_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,COALESCE($19,NOW())
       ) ON CONFLICT (event_id) DO NOTHING`,
      [
        eventId, event.salesOrderId, event.orderNo, event.eventType,
        event.fromStatus ?? null, event.toStatus ?? null,
        event.actorUserId ?? null, event.actorName ?? null, event.actorType,
        event.reasonCode ?? null, event.comment ?? null, event.sourceEndpoint ?? null,
        event.sourceModule, event.sourceRefType ?? null, event.sourceRefId ?? null,
        event.sourceRefNo ?? null, event.requestId ?? null,
        JSON.stringify(event.metadata ?? {}), event.occurredAt ?? null,
      ],
    );
    return eventId;
  }

  async transitionStatus(
    manager: EntityManager,
    id: string,
    fromStatus: string,
    toStatus: string,
    extraSetSql = '',
    extraParams: unknown[] = [],
  ): Promise<any> {
    const params = [toStatus, id, fromStatus, ...extraParams];
    const rows = await manager.query(
      `UPDATE sal_sales_orders
       SET status=$1, updated_at=NOW()${extraSetSql}
       WHERE id=$2 AND status=$3
       RETURNING *`,
      params,
    );
    if (!rows.length) {
      throw new ConflictException(`订单状态已变化，预期 ${fromStatus}，请刷新后重试`);
    }
    return rows[0];
  }

  async getProcessLog(order: any) {
    const id = String(order.id);
    const [events, deliveries, receipts, workflow, ledgers, arInvoices, returns] = await Promise.all([
      this.ds.query(`SELECT * FROM sal_order_lifecycle_events WHERE sales_order_id=$1 ORDER BY occurred_at,id`, [id]),
      this.ds.query(`SELECT DISTINCT d.* FROM sal_delivery_orders d JOIN sal_delivery_order_items i ON i.delivery_order_id=d.id WHERE i.sales_order_id=$1 AND d.company_code=$2 ORDER BY d.created_at`, [id, order.company_code]),
      this.ds.query(`SELECT * FROM sal_receipts WHERE sales_order_id=$1 ORDER BY COALESCE(signed_at,created_at),id`, [id]),
      this.ds.query(
        `SELECT s.*, i.instance_no, i.status AS instance_status, i.current_step_no
         FROM wf_approval_instance_steps s
         JOIN wf_approval_instances i ON i.id=s.instance_id
         WHERE i.biz_type='SALES_ORDER' AND i.biz_id=$1
         ORDER BY COALESCE(s.acted_at,s.created_at),s.step_no,s.id`,
        [id],
      ),
      this.ds.query(`SELECT * FROM inv_ledger WHERE ref_no IN (SELECT DISTINCT d.delivery_no FROM sal_delivery_orders d JOIN sal_delivery_order_items i ON i.delivery_order_id=d.id WHERE i.sales_order_id=$1) ORDER BY created_at,id`, [id]),
      this.ds.query(`SELECT * FROM fin_ar_invoices WHERE company_code=$3 AND ((source_type='SALES_ORDER' AND source_id=$1) OR id=$2) ORDER BY created_at,id`, [id, order.ar_invoice_id ?? null, order.company_code]),
      this.ds.query(`SELECT * FROM sal_return_orders WHERE sales_order_id=$1 AND company_code=$2 ORDER BY created_at,id`, [id, order.company_code]),
    ]);

    const documents = [
      ...deliveries.map((x: any) => ({ type: 'DELIVERY', id: String(x.id), no: x.delivery_no, status: x.status, href: `/sales2/delivery?deliveryId=${x.id}` })),
      ...receipts.map((x: any) => ({ type: 'RECEIPT', id: String(x.id), no: x.receipt_no, status: x.status, href: `/sales2/delivery?deliveryId=${x.delivery_order_id}&receiptId=${x.id}` })),
      ...arInvoices.map((x: any) => ({ type: 'AR', id: String(x.id), no: x.ar_no, status: x.status, href: `/finance2/ar?invoiceId=${x.id}` })),
      ...returns.map((x: any) => ({ type: 'RETURN', id: String(x.id), no: x.return_no, status: x.status, href: `/sales2/returns?returnId=${x.id}` })),
    ];
    const timeline = [
      ...events.map((x: any) => ({ id: `event-${x.id}`, time: x.occurred_at, docType: 'SALES_ORDER', docNo: x.order_no, action: x.event_type, operator: x.actor_name, fromStatus: x.from_status, toStatus: x.to_status, comment: x.comment, source: x.source_module, reasonCode: x.reason_code })),
      ...workflow.map((x: any) => ({
        id: `workflow-${x.id}`,
        time: x.acted_at ?? x.created_at,
        docType: 'WORKFLOW',
        docNo: x.instance_no ?? String(x.instance_id),
        action: x.action ?? `STEP_${x.status}`,
        operator: x.actor_username ?? x.approver_name,
        fromStatus: x.action ? 'PENDING' : null,
        toStatus: x.status,
        comment: x.comment,
        source: 'WORKFLOW',
      })),
      ...ledgers.map((x: any) => ({ id: `ledger-${x.id}`, time: x.created_at, docType: 'INVENTORY', docNo: x.ref_no, action: x.change_type, operator: x.operator, comment: x.note, source: 'WMS' })),
    ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime() || a.id.localeCompare(b.id));

    const warnings: string[] = [];
    if (!order.fulfillment_warehouse_code || order.warehouse_governance_pending) warnings.push('FULFILLMENT_WAREHOUSE_PENDING');
    if (order.status === 'RECEIVED' && !order.ar_invoice_id && arInvoices.length === 0) warnings.push('RECEIVED_WITHOUT_AR');
    if (deliveries.some((x: any) => x.status === 'COMPLETED') && receipts.length === 0) warnings.push('DELIVERY_COMPLETED_WITHOUT_RECEIPT');
    if (workflow.some((x: any) => x.instance_status === 'PENDING'
      && x.status === 'PENDING' && Number(x.step_no) === Number(x.current_step_no)
      && x.due_at && new Date(x.due_at).getTime() < Date.now())) warnings.push('APPROVAL_OVERDUE');
    if (deliveries.some((x: any) => ['DEPARTED', 'IN_TRANSIT'].includes(x.status) && x.departure_at && Date.now() - new Date(x.departure_at).getTime() > 48 * 60 * 60 * 1000)) warnings.push('DELIVERY_DEPARTED_OVERDUE');
    if (returns.some((x: any) => !['COMPLETED', 'REJECTED', 'CANCELLED'].includes(x.status) && Date.now() - new Date(x.updated_at ?? x.created_at).getTime() > 72 * 60 * 60 * 1000)) warnings.push('RETURN_FLOW_STALLED');
    return {
      orderNo: order.order_no,
      currentStatus: order.status,
      fulfillmentWarehouseCode: order.fulfillment_warehouse_code ?? null,
      warehouseGovernancePending: Boolean(order.warehouse_governance_pending),
      documents, timeline, warnings,
    };
  }
}
