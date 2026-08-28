import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { WmsService } from '../../wms/wms.service';
import { StoreScopePolicy } from './store-scope-policy.service';

@Injectable()
export class StoreReplenishmentService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly storeScope: StoreScopePolicy,
    private readonly wms: WmsService,
  ) {}

  private get scope(): any { try { return this.cls.get('dataScope'); } catch { return null; } }
  private get user(): any { try { return this.cls.get('user') ?? {}; } catch { return {}; } }

  async list(filters: { storeCode?: string; status?: string }) {
    const scope = this.scope;
    if (!scope) throw new ForbiddenException('缺少数据范围上下文');
    const memberships = await this.storeScope.listMembershipStores();
    const membershipCodes = memberships.map(s => s.storeCode);
    const warehouses = scope.isGlobal ? null : (scope.allowedWarehouseCodes ?? []);
    const roles: string[] = Array.isArray(this.user?.roles) ? this.user.roles : [this.user?.role].filter(Boolean);
    const isWarehouseOperator = roles.some(role => ['ROLE_WMS_OP','ROLE_WMS_MGR'].includes(role));
    if (!scope.isGlobal && !membershipCodes.length && !(isWarehouseOperator && warehouses.length)) return [];
    const rows = await this.ds.query<any[]>(`
      SELECT r.*,s.store_code,s.store_name,
        MAX(source_w.warehouse_name) AS source_warehouse_name,
        MAX(source_w.warehouse_name_zh) AS source_warehouse_name_zh,
        MAX(source_w.warehouse_name_en) AS source_warehouse_name_en,
        MAX(source_w.warehouse_name_lo) AS source_warehouse_name_lo,
        MAX(target_w.warehouse_name) AS target_warehouse_name,
        MAX(target_w.warehouse_name_zh) AS target_warehouse_name_zh,
        MAX(target_w.warehouse_name_en) AS target_warehouse_name_en,
        MAX(target_w.warehouse_name_lo) AS target_warehouse_name_lo,
        COALESCE(json_agg(json_build_object('id',l.id,'skuCode',l.sku_code,'skuName',l.sku_name,
          'requestedQty',l.requested_qty,'approvedQty',l.approved_qty,'receivedQty',l.received_qty,'remark',l.remark)
          ORDER BY l.id) FILTER (WHERE l.id IS NOT NULL),'[]') AS lines
      FROM store_replenishment_requests r
      JOIN store_master s ON s.id=r.store_id
      LEFT JOIN wms_warehouses source_w ON source_w.warehouse_code=r.source_warehouse_code
      LEFT JOIN wms_warehouses target_w ON target_w.warehouse_code=r.target_warehouse_code
      LEFT JOIN store_replenishment_request_lines l ON l.request_id=r.id
      WHERE ($1::text IS NULL OR s.store_code=$1)
        AND ($2::text IS NULL OR r.status=$2)
        AND ($3::boolean OR s.store_code=ANY($4::text[]) OR ($6::boolean AND r.company_code=ANY($7::text[])
          AND (r.source_warehouse_code IS NULL OR r.source_warehouse_code=ANY($5::text[]))))
      GROUP BY r.id,s.store_code,s.store_name ORDER BY r.created_at DESC`,
      [filters.storeCode || null, filters.status || null, !!scope.isGlobal, membershipCodes, warehouses ?? [],
        isWarehouseOperator, scope.allowedCompanyCodes ?? []]);
    return rows;
  }

  async sourceWarehouses(storeCode: string) {
    const context = await this.storeScope.resolveStoreContext(storeCode, 'SALES');
    const scope = this.scope;
    return this.ds.query(`SELECT warehouse_code AS "warehouseCode",warehouse_name AS "warehouseName",
        warehouse_name_zh AS "warehouseNameZh",warehouse_name_en AS "warehouseNameEn",warehouse_name_lo AS "warehouseNameLo"
      FROM wms_warehouses WHERE company_code=$1 AND status='ACTIVE' AND domain='OPERATIONAL'
       AND NOT (warehouse_code=ANY($2::text[]))
       AND ($3::boolean OR warehouse_code=ANY($4::text[])) ORDER BY warehouse_code`,
      [context.companyCode, context.warehouseCodes, !!scope?.isGlobal, scope?.allowedWarehouseCodes ?? []]);
  }

  async create(dto: any) {
    const context = await this.storeScope.resolve(dto.storeCode, 'SALES');
    const lines = Array.isArray(dto.lines) ? dto.lines : [];
    if (!lines.length) throw new BadRequestException('至少需要一条补货明细');
    for (const line of lines) if (!line.skuCode || !(Number(line.qty) > 0)) throw new BadRequestException('SKU 与正数数量必填');
    const requestNo = `SR-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    return this.ds.transaction(async manager => {
      const [row] = await manager.query(`INSERT INTO store_replenishment_requests
        (request_no,store_id,company_code,target_warehouse_code,source_warehouse_code,requested_date,urgency,reason,requested_by)
        VALUES ($1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE),$7,$8,$9) RETURNING *`,
        [requestNo, context.storeId, context.companyCode, context.warehouseCodes[0], dto.sourceWarehouseCode || null,
          dto.requestedDate || null, dto.urgency === 'URGENT' ? 'URGENT' : 'NORMAL', String(dto.reason || ''), String(this.user?.username || 'SYS')]);
      for (const line of lines) await manager.query(`INSERT INTO store_replenishment_request_lines
        (request_id,sku_code,sku_name,requested_qty,remark) VALUES ($1,$2,$3,$4::numeric,$5)`,
        [row.id, line.skuCode, String(line.skuName || ''), Number(line.qty), String(line.remark || '')]);
      return { ...row, storeCode: context.storeCode, lines };
    });
  }

  async submit(id: number) {
    const request = await this.assertStoreRequest(id);
    if (request.status !== 'DRAFT') throw new BadRequestException('仅草稿可提交');
    const [row] = await this.ds.query(`UPDATE store_replenishment_requests SET status='SUBMITTED',submitted_at=now(),updated_at=now() WHERE id=$1 AND status='DRAFT' RETURNING *`, [id]);
    return row;
  }

  async approve(id: number, dto: any, user: any) {
    const request = await this.assertVisibleRequest(id);
    if (request.status !== 'SUBMITTED') throw new BadRequestException('仅已提交申请可审批');
    const source = dto.sourceWarehouseCode || request.source_warehouse_code;
    if (!source) throw new BadRequestException('审批时必须指定源仓');
    const scope = this.scope;
    if (!scope?.isGlobal && !(scope?.allowedWarehouseCodes ?? []).includes(source)) throw new ForbiddenException('源仓不在仓库 DataScope');
    const lines = await this.ds.query<any[]>(`SELECT * FROM store_replenishment_request_lines WHERE request_id=$1 ORDER BY id`, [id]);
    const transferItems: Array<{ batch_no: string; qty: number }> = [];
    for (const line of lines) {
      let needed = Number(line.requested_qty);
      const batches = await this.ds.query<any[]>(`SELECT batch_no,COALESCE(qty_available,qty) available FROM inv_batches
        WHERE warehouse_code=$1 AND sku_code=$2 AND status='AVAILABLE' AND COALESCE(qty_available,qty)>0
        ORDER BY expire_date NULLS LAST,created_at,batch_no`, [source, line.sku_code]);
      for (const batch of batches) {
        if (needed <= 0) break;
        const qty = Math.min(needed, Number(batch.available));
        transferItems.push({ batch_no: batch.batch_no, qty }); needed -= qty;
      }
      if (needed > 0) throw new BadRequestException(`SKU ${line.sku_code} 源仓可用库存不足`);
    }
    const transfer = await this.wms.createTransfer({ from_warehouse: source, to_warehouse: request.target_warehouse_code,
      reason: `门店补货 ${request.request_no}`, items: transferItems }, user);
    const [updated] = await this.ds.query(`UPDATE store_replenishment_requests SET status='APPROVED',source_warehouse_code=$2,
      transfer_no=$3,approved_by=$4,approved_at=now(),updated_at=now() WHERE id=$1 AND status='SUBMITTED' RETURNING *`,
      [id, source, transfer.transfer_no, String(user?.username || 'SYS')]);
    await this.ds.query(`UPDATE store_replenishment_request_lines SET approved_qty=requested_qty,updated_at=now() WHERE request_id=$1`, [id]);
    return updated;
  }

  async dispatch(id: number, user: any) {
    const request = await this.assertWarehouseRequest(id, 'APPROVED');
    const result = await this.wms.dispatchTransfer(request.transfer_no, user);
    await this.ds.query(`UPDATE store_replenishment_requests SET status='DISPATCHED',updated_at=now() WHERE id=$1 AND status='APPROVED'`, [id]);
    return result;
  }

  async receive(id: number, body: any, user: any) {
    const request = await this.assertStoreRequest(id);
    if (request.status !== 'DISPATCHED') throw new BadRequestException('仅已发运申请可签收');
    const result = await this.wms.receiveTransfer(request.transfer_no, body, user);
    await this.ds.query(`UPDATE store_replenishment_requests SET status=$2,updated_at=now() WHERE id=$1 AND status='DISPATCHED'`, [id, result.status === 'COMPLETED' ? 'CLOSED' : 'RECEIVED']);
    await this.ds.query(`UPDATE store_replenishment_request_lines l SET received_qty=x.qty,updated_at=now() FROM (
      SELECT r.id,SUM(i.received_qty) qty FROM store_replenishment_request_lines r
      JOIN wms_transfer_items i ON i.transfer_no=$2 JOIN inv_batches b ON b.batch_no=i.source_batch_no AND b.sku_code=r.sku_code
      WHERE r.request_id=$1 GROUP BY r.id) x WHERE l.id=x.id`, [id, request.transfer_no]);
    return result;
  }

  async close(id: number, body: any, user: any) {
    const request = await this.assertStoreRequest(id);
    if (request.status !== 'RECEIVED') throw new BadRequestException('仅差异待确认申请可关闭');
    const result = await this.wms.completeTransfer(request.transfer_no, body, user);
    await this.ds.query(`UPDATE store_replenishment_requests SET status='CLOSED',updated_at=now() WHERE id=$1 AND status='RECEIVED'`, [id]);
    return result;
  }

  async transferDetail(id: number) {
    const request = await this.assertVisibleRequest(id);
    if (!request.transfer_no) return null;
    const [transfer] = await this.ds.query<any[]>(`SELECT t.*,
      fw.warehouse_name AS from_warehouse_name,fw.warehouse_name_zh AS from_warehouse_name_zh,
      fw.warehouse_name_en AS from_warehouse_name_en,fw.warehouse_name_lo AS from_warehouse_name_lo,
      tw.warehouse_name AS to_warehouse_name,tw.warehouse_name_zh AS to_warehouse_name_zh,
      tw.warehouse_name_en AS to_warehouse_name_en,tw.warehouse_name_lo AS to_warehouse_name_lo
      FROM wms_transfer t
      LEFT JOIN wms_warehouses fw ON fw.warehouse_code=t.from_warehouse
      LEFT JOIN wms_warehouses tw ON tw.warehouse_code=t.to_warehouse
      WHERE t.transfer_no=$1`, [request.transfer_no]);
    if (!transfer) return null;
    transfer.items = await this.ds.query(`SELECT i.*,b.sku_code,s.sku_name,s.sku_name_en,s.sku_name_lo
      FROM wms_transfer_items i
      LEFT JOIN inv_batches b ON b.batch_no=i.source_batch_no
      LEFT JOIN product_skus s ON s.sku_code=b.sku_code
      WHERE i.transfer_no=$1 ORDER BY i.id`, [request.transfer_no]);
    transfer.discrepancies = await this.ds.query(`SELECT * FROM wms_transfer_discrepancies WHERE transfer_no=$1 ORDER BY id`, [request.transfer_no]);
    return transfer;
  }

  private async assertVisibleRequest(id: number) {
    const rows = await this.list({}); const request = rows.find((r: any) => Number(r.id) === id);
    if (!request) throw new ForbiddenException('补货申请不存在或不在授权范围');
    return request;
  }
  private async assertStoreRequest(id: number) {
    const request = await this.assertVisibleRequest(id);
    await this.storeScope.resolve(request.store_code, 'SALES');
    return request;
  }
  private async assertWarehouseRequest(id: number, status: string) {
    const request = await this.assertVisibleRequest(id);
    if (request.status !== status) throw new BadRequestException(`当前状态 ${request.status} 不允许此操作`);
    const scope = this.scope;
    if (!scope?.isGlobal && !(scope?.allowedWarehouseCodes ?? []).includes(request.source_warehouse_code)) throw new ForbiddenException('源仓不在仓库 DataScope');
    return request;
  }
}
