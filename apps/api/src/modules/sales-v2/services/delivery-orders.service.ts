import {
  Injectable, NotFoundException, ForbiddenException,
  BadRequestException, ConflictException, Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeContext } from '../../org/services/data-scope.service';
import { EggInventoryService } from './egg-inventory.service';      // Phase 7
import { SalesOrderLifecycleService } from './sales-order-lifecycle.service';
import {
  CreateDeliveryOrderDto, UpdateDeliveryOrderDto, QueryDeliveryOrderDto,
  LoadDeliveryDto, DepartDeliveryDto, ArriveDeliveryDto,
  CompleteDeliveryDto, CancelDeliveryDto,
  CreateDriverDto, UpdateDriverDto, CreateVehicleDto, UpdateVehicleDto,
} from '../dto/delivery.dto';

// ── 状态机 ────────────────────────────────────────────────────
const ALLOWED_TRANSITIONS: Record<string, string> = {
  PLANNED:          'LOADING',
  LOADING:          'LOADED',
  LOADED:           'DEPARTED',
  DEPARTED:         'ARRIVED',
  ARRIVED:          'PARTIALLY_SIGNED',
  PARTIALLY_SIGNED: 'COMPLETED',
};
const CANCELLABLE = new Set(['PLANNED', 'LOADING']);
const TERMINAL    = new Set(['COMPLETED', 'CANCELLED']);

/**
 * Sales V2 Phase 4 — Delivery Orders Service
 *
 * 负责：配送单 CRUD、状态机流转、司机/车辆档案
 * 关键链路：Delivery → Receipt → SalesOrder RECEIVED → Finance AR
 */
@Injectable()
export class DeliveryOrdersService {
  private readonly logger = new Logger(DeliveryOrdersService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly eggInventory: EggInventoryService,             // Phase 7
    private readonly lifecycle: SalesOrderLifecycleService,
  ) {}

  // ── 当前用户 ─────────────────────────────────────────────────────────────

  private currentUser() {
    const u = this.cls.get('user') as any;
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    return {
      userId:       String(u?.userId ?? u?.id ?? '0'),
      userName:     String(u?.name ?? u?.username ?? ''),
      roles:        (u?.roles ?? (u?.role ? [u.role] : [])) as string[],
      companyCodes: scope ? scope.allowedCompanyCodes : [] as string[],
      warehouseCodes: scope ? scope.allowedWarehouseCodes : [] as string[],
      scopeAll:     scope ? scope.isGlobal : false,
    };
  }

  // ── DataScope 断言 ────────────────────────────────────────────────────────

  private async assertOwnership(id: string): Promise<any> {
    const rows = await this.ds.query(
      `SELECT * FROM sal_delivery_orders WHERE id = $1`, [id],
    );
    if (!rows?.length) throw new NotFoundException(`配送单 ${id} 不存在`);
    const rec = rows[0];
    const user = this.currentUser();
    if (!user.scopeAll) {
      if (user.companyCodes.length === 0 || !user.companyCodes.includes(rec.company_code)) {
        throw new ForbiddenException(`无权访问公司 ${rec.company_code} 的配送单`);
      }
    }
    return rec;
  }

  // ── 自动编号 ──────────────────────────────────────────────────────────────

  private async genDeliveryNo(): Promise<string> {
    const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `DV-${today}-`;
    const row = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM sal_delivery_orders WHERE delivery_no LIKE $1`,
      [`${prefix}%`],
    );
    const seq = String(Number(row[0].cnt) + 1).padStart(4, '0');
    return `${prefix}${seq}`;
  }

  private async genReceiptNo(): Promise<string> {
    const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `RC-${today}-`;
    const row = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM sal_receipts WHERE receipt_no LIKE $1`,
      [`${prefix}%`],
    );
    const seq = String(Number(row[0].cnt) + 1).padStart(4, '0');
    return `${prefix}${seq}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. 配送单列表
  // ─────────────────────────────────────────────────────────────────────────

  async listOrders(q: QueryDeliveryOrderDto) {
    const user  = this.currentUser();
    const page  = q.page  ?? 1;
    const limit = q.limit ?? 20;
    const offset = (page - 1) * limit;

    const params: any[] = [];
    const where: string[] = ['1=1'];

    if (!user.scopeAll) {
      if (user.companyCodes.length > 0) {
        params.push(user.companyCodes); where.push(`d.company_code = ANY($${params.length})`);
      } else {
        where.push('1=0');  // 未配置数据范围 → 拒绝访问
      }
    }
    if (q.companyCode) { params.push(q.companyCode); where.push(`d.company_code = $${params.length}`); }
    if (q.status)      { params.push(q.status);      where.push(`d.status = $${params.length}`); }
    if (q.driverId)    { params.push(q.driverId);    where.push(`d.driver_id = $${params.length}`); }
    if (q.vehicleId)   { params.push(q.vehicleId);   where.push(`d.vehicle_id = $${params.length}`); }
    if (q.waveDate)    { params.push(q.waveDate);    where.push(`d.wave_date = $${params.length}`); }
    if (q.dateFrom)    { params.push(q.dateFrom);    where.push(`d.created_at >= $${params.length}`); }
    if (q.dateTo)      { params.push(q.dateTo);      where.push(`d.created_at < ($${params.length}::date + 1)`); }
    if (q.keyword) {
      params.push(`%${q.keyword}%`);
      where.push(`(d.delivery_no ILIKE $${params.length} OR d.driver_name ILIKE $${params.length} OR d.vehicle_no ILIKE $${params.length})`);
    }

    const wc = where.join(' AND ');

    const [rows, totalRow] = await Promise.all([
      this.ds.query(
        `SELECT d.*,
                MAX((SELECT COALESCE(o.org_name_cn, o.org_name)
                     FROM sys_organizations o
                     WHERE COALESCE(o.company_code, o.org_code) = d.company_code
                       AND o.org_type = 'COMPANY')) AS company_name_display,
                MAX((SELECT sd.driver_name FROM sal_drivers sd WHERE sd.id = d.driver_id)) AS driver_name_master,
                MAX((SELECT sd.driver_name_en FROM sal_drivers sd WHERE sd.id = d.driver_id)) AS driver_name_en,
                MAX((SELECT sd.driver_name_lo FROM sal_drivers sd WHERE sd.id = d.driver_id)) AS driver_name_lo,
                MAX((SELECT sv.vehicle_type FROM sal_vehicles sv WHERE sv.id = d.vehicle_id)) AS vehicle_type_master,
                COUNT(i.id) AS item_count
         FROM sal_delivery_orders d
         LEFT JOIN sal_delivery_order_items i ON i.delivery_order_id = d.id
         WHERE ${wc}
         GROUP BY d.id
         ORDER BY d.created_at DESC, d.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      this.ds.query(`SELECT COUNT(*) AS cnt FROM sal_delivery_orders d WHERE ${wc}`, params),
    ]);

    return {
      data:  rows,
      total: Number(totalRow[0].cnt),
      page,
      limit,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. 配送单详情（含 items + receipts）
  // ─────────────────────────────────────────────────────────────────────────

  async findById(id: string) {
    const order = await this.assertOwnership(id);
    const [enrichedRows, items, receipts] = await Promise.all([
      this.ds.query(
        `SELECT d.*,
                (SELECT COALESCE(o.org_name_cn, o.org_name)
                 FROM sys_organizations o
                 WHERE COALESCE(o.company_code, o.org_code) = d.company_code
                   AND o.org_type = 'COMPANY' LIMIT 1) AS company_name_display,
                (SELECT sd.driver_name FROM sal_drivers sd WHERE sd.id = d.driver_id) AS driver_name_master,
                (SELECT sd.driver_name_en FROM sal_drivers sd WHERE sd.id = d.driver_id) AS driver_name_en,
                (SELECT sd.driver_name_lo FROM sal_drivers sd WHERE sd.id = d.driver_id) AS driver_name_lo,
                (SELECT sv.vehicle_type FROM sal_vehicles sv WHERE sv.id = d.vehicle_id) AS vehicle_type_master
         FROM sal_delivery_orders d WHERE d.id = $1`, [id],
      ),
      this.ds.query(
        `SELECT * FROM sal_delivery_order_items WHERE delivery_order_id = $1 ORDER BY id`, [id],
      ),
      this.ds.query(
        `SELECT * FROM sal_receipts WHERE delivery_order_id = $1 ORDER BY created_at DESC`, [id],
      ),
    ]);
    return { ...order, ...(enrichedRows[0] ?? {}), items, receipts };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. 创建配送单
  // ─────────────────────────────────────────────────────────────────────────

  async create(dto: CreateDeliveryOrderDto) {
    const user = this.currentUser();

    // 前端字段历史名为 salesOrderIds，但业务人员实际使用可见的 SO-* 订单号。
    // 将纯数字引用作为主键查询，其余引用作为订单号查询，避免 Number('SO-*')
    // 产生 NaN 后触发 PostgreSQL 22P02。
    const orderRefs = [...new Set(dto.salesOrderIds.map((ref) => ref.trim()).filter(Boolean))];
    const soIds = orderRefs.filter((ref) => /^\d+$/.test(ref));
    const orderNos = orderRefs.filter((ref) => !/^\d+$/.test(ref));
    const orders = await this.ds.query(
      `SELECT so.id, so.order_no, so.customer_code, so.customer_name, so.delivery_address,
              so.status, so.company_code, so.fulfillment_warehouse_code,
              COALESCE(items.order_qty, 0) AS order_qty,
              COALESCE(outbound.outbound_qty, 0) AS outbound_qty
       FROM sal_sales_orders so
       LEFT JOIN (
         SELECT sales_order_id, SUM(qty) AS order_qty
         FROM sal_order_items
         GROUP BY sales_order_id
       ) items ON items.sales_order_id = so.id
       LEFT JOIN (
         SELECT oi.sales_order_id,SUM(a.outbound_qty) AS outbound_qty
         FROM sal_order_items oi JOIN sal_order_item_batch_allocations a ON a.sales_order_item_id=oi.id
         GROUP BY oi.sales_order_id
       ) outbound ON outbound.sales_order_id=so.id
       WHERE so.id = ANY($1::bigint[]) OR so.order_no = ANY($2::text[])`,
      [soIds, orderNos],
    );

    if (!orders.length) throw new BadRequestException('未找到有效的销售订单');
    if (orders.some((o: any) => o.company_code !== dto.companyCode)) {
      throw new BadRequestException('配送公司必须与全部销售订单公司一致');
    }
    const warehouses = [...new Set(orders.map((o: any) => o.fulfillment_warehouse_code).filter(Boolean))];
    if (warehouses.length > 1) throw new BadRequestException('一个配送单只能继承一个履约仓');
    const fulfillmentWarehouseCode = warehouses[0] ?? null;
    if (fulfillmentWarehouseCode && !user.scopeAll && !user.warehouseCodes.includes(String(fulfillmentWarehouseCode))) {
      throw new ForbiddenException(`无权使用履约仓 ${fulfillmentWarehouseCode}`);
    }

    const requestedItems = dto.items ?? [];
    const requestedKeys = requestedItems.map((x) => String(x.salesOrderId));
    if (new Set(requestedKeys).size !== requestedKeys.length) {
      throw new BadRequestException('本次配送计划不允许重复销售订单');
    }
    const validOrderKeys = new Set(orders.flatMap((o: any) => [String(o.id), String(o.order_no)]));
    const unknownKeys = requestedKeys.filter((key) => !validOrderKeys.has(key));
    if (unknownKeys.length) {
      throw new BadRequestException(`配送计划包含未关联的销售订单：${unknownKeys.join(', ')}`);
    }
    const requested = new Map(requestedItems.map((x) => [String(x.salesOrderId), Number(x.qty)]));
    for (const order of orders) {
      const remaining = Number(order.order_qty) - Number(order.outbound_qty);
      const qty = requested.get(String(order.id)) ?? requested.get(String(order.order_no)) ?? remaining;
      if (!(qty > 0) || qty > remaining) {
        throw new ConflictException(`订单 ${order.order_no} 本次配送 ${qty} 超过剩余可配送 ${remaining}`);
      }
      order.planned_qty = qty;
    }

    const invalidStatuses = orders.filter((o: any) =>
      !['APPROVED', 'ALLOCATED', 'PICKED', 'LOADED'].includes(o.status),
    );
    if (invalidStatuses.length) {
      throw new BadRequestException(
        `以下订单状态不允许创建配送单：${invalidStatuses.map((o: any) => o.order_no).join(', ')}`,
      );
    }

    // DataScope 检查
    if (!user.scopeAll) {
      if (user.companyCodes.length === 0) {
        throw new ForbiddenException('包含无权限的销售订单');
      }
      const out = orders.filter((o: any) => !user.companyCodes.includes(o.company_code));
      if (out.length) throw new ForbiddenException('包含无权限的销售订单');
    }

    const deliveryNo = await this.genDeliveryNo();
    const totalOrders = orders.length;
    const totalQty = orders.reduce((s: number, o: any) => s + Number(o.planned_qty || 0), 0);
    const resolvedOrderIds = orders.map((order: any) => String(order.id));

    const deliveryOrderId = await this.ds.transaction(async (mgr) => {
      // 写配送单主表
      const [doRow] = await mgr.query(
        `INSERT INTO sal_delivery_orders (
          delivery_no, company_code, company_name, fulfillment_warehouse_code,
          route_code, route_name,
          vehicle_id, vehicle_no, driver_id, driver_name,
          wave_date, expected_arrival_at,
          total_orders, total_qty, remark, created_by, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'PLANNED')
        RETURNING *`,
        [
          deliveryNo, dto.companyCode, dto.companyName ?? null, fulfillmentWarehouseCode,
          dto.routeCode ?? null, dto.routeName ?? null,
          dto.vehicleId ?? null, dto.vehicleNo ?? null,
          dto.driverId ?? null, dto.driverName ?? null,
          dto.waveDate ?? null, dto.expectedArrivalAt ?? null,
          totalOrders, totalQty, dto.remark ?? null,
          user.userName || user.userId,
        ],
      );

      // 写配送明细
      for (const so of orders) {
        await mgr.query(`SELECT id FROM sal_sales_orders WHERE id=$1 FOR UPDATE`, [so.id]);
        await mgr.query(
          `INSERT INTO sal_delivery_order_items (
            delivery_order_id, sales_order_id, sales_order_no,
            customer_code, customer_name, delivery_address,
            planned_qty, status
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING')`,
          [
            doRow.id, so.id, so.order_no,
            so.customer_code ?? null,
            so.customer_name ?? null,
            so.delivery_address ?? null,
            so.planned_qty ?? 0,
          ],
        );
      }

      // 销售订单 → ALLOCATED（已安排配送）
      await mgr.query(
        `UPDATE sal_sales_orders SET status='ALLOCATED', updated_at=NOW()
         WHERE id = ANY($1::bigint[]) AND status IN ('APPROVED')`,
        [resolvedOrderIds],
      );
      for (const so of orders) {
        await this.lifecycle.appendEvent(mgr, {
          salesOrderId: String(so.id), orderNo: so.order_no, eventType: 'DELIVERY_CREATED',
          fromStatus: so.status === 'APPROVED' ? 'APPROVED' : null,
          toStatus: so.status === 'APPROVED' ? 'ALLOCATED' : null,
          actorType: 'USER', actorUserId: user.userId, actorName: user.userName,
          sourceModule: 'DELIVERY', sourceRefType: 'DELIVERY', sourceRefId: String(doRow.id),
          sourceRefNo: deliveryNo, comment: dto.remark ?? null,
        });
      }

      this.logger.log(`配送单 ${deliveryNo} 已创建，关联 ${totalOrders} 张销售订单`);
      return String(doRow.id);
    });

    // 详情查询必须发生在事务提交后。事务内使用 DataSource 的另一连接查询，
    // 无法看到尚未提交的新配送单，会误报“配送单不存在”并回滚整笔创建。
    return this.findById(deliveryOrderId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. 更新配送单（仅 PLANNED 状态可改）
  // ─────────────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateDeliveryOrderDto) {
    const rec = await this.assertOwnership(id);
    if (!['PLANNED', 'LOADING'].includes(rec.status)) {
      throw new BadRequestException(`状态 ${rec.status} 不可修改基本信息`);
    }

    const sets: string[] = [];
    const params: any[] = [];

    const add = (col: string, val: any) => {
      if (val !== undefined) { params.push(val); sets.push(`${col}=$${params.length}`); }
    };

    add('route_code',          dto.routeCode);
    add('route_name',          dto.routeName);
    add('vehicle_id',          dto.vehicleId);
    add('vehicle_no',          dto.vehicleNo);
    add('driver_id',           dto.driverId);
    add('driver_name',         dto.driverName);
    add('wave_date',           dto.waveDate);
    add('expected_arrival_at', dto.expectedArrivalAt);
    add('remark',              dto.remark);

    if (!sets.length) return this.findById(id);

    params.push(id);
    await this.ds.query(
      `UPDATE sal_delivery_orders SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${params.length}`,
      params,
    );
    return this.findById(id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. 开始装车  PLANNED → LOADING
  // ─────────────────────────────────────────────────────────────────────────

  async startLoading(id: string, _dto: LoadDeliveryDto) {
    const rec = await this.assertOwnership(id);
    if (rec.status !== 'PLANNED') throw new BadRequestException(`当前状态 ${rec.status} 不可开始装车`);

    await this.ds.query(
      `UPDATE sal_delivery_orders SET status='LOADING', loading_start_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [id],
    );
    // 明细 → LOADED（装车中）
    await this.ds.query(
      `UPDATE sal_delivery_order_items SET status='LOADED', updated_at=NOW() WHERE delivery_order_id=$1`,
      [id],
    );
    this.logger.log(`配送单 ${rec.delivery_no} 开始装车`);
    return this.findById(id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. 装车完成  LOADING → LOADED
  // ─────────────────────────────────────────────────────────────────────────

  async finishLoading(id: string, _dto: LoadDeliveryDto) {
    const rec = await this.assertOwnership(id);

    await this.ds.transaction(async (mgr) => {
      const [locked] = await mgr.query(
        `SELECT id,delivery_no,status FROM sal_delivery_orders WHERE id=$1 FOR UPDATE`, [id],
      );
      if (!locked) throw new NotFoundException(`配送单 ${id} 不存在`);
      if (locked.status !== 'LOADING') {
        throw new ConflictException(`配送单 ${locked.delivery_no} 状态已变为 ${locked.status}，不可重复完成装车`);
      }
      const changed = await mgr.query(
        `WITH changed AS (
           UPDATE sal_delivery_orders SET status='LOADED',loading_end_at=NOW(),updated_at=NOW()
            WHERE id=$1 AND status='LOADING' RETURNING id
         ) SELECT id FROM changed`,
        [id],
      );
      if (changed.length !== 1) throw new ConflictException(`配送单 ${locked.delivery_no} 装车状态冲突`);
      const soItems = await mgr.query(
      `SELECT doi.id AS delivery_item_id,doi.sales_order_id,doi.planned_qty,so.order_no,so.company_code,so.status
       FROM sal_delivery_order_items doi
       JOIN sal_sales_orders so ON so.id = doi.sales_order_id
       WHERE doi.delivery_order_id=$1`, [id],
      );
      for (const item of soItems) {
        const outboundQty = await this.eggInventory.confirmOutbound(
          String(item.sales_order_id),
          String(item.order_no),
          String(item.company_code ?? 'ALL'),
          String(locked.delivery_no),
          id,
          Number(item.planned_qty),
          mgr,
        );
        await mgr.query(
          `UPDATE sal_delivery_order_items SET loaded_qty=$1,outbound_qty=$1,updated_at=NOW() WHERE id=$2`,
          [outboundQty, item.delivery_item_id],
        );
        await this.lifecycle.appendEvent(mgr, {
          salesOrderId: String(item.sales_order_id), orderNo: item.order_no,
          eventType: 'OUTBOUND_CONFIRMED', fromStatus: item.status, toStatus: item.status,
          actorType: 'USER', actorUserId: this.currentUser().userId,
          actorName: this.currentUser().userName, sourceModule: 'WMS',
          sourceEndpoint: '/api/v2/sales/delivery/:id/finish-loading',
          sourceRefType: 'DELIVERY', sourceRefId: id, sourceRefNo: locked.delivery_no,
        });
      }
    });
    this.logger.log(`配送单 ${rec.delivery_no} 装车完成`);

    return this.findById(id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. 发车  LOADED → DEPARTED
  // ─────────────────────────────────────────────────────────────────────────

  async depart(id: string, _dto: DepartDeliveryDto) {
    const rec = await this.assertOwnership(id);
    if (rec.status !== 'LOADED') throw new BadRequestException(`当前状态 ${rec.status} 不可发车`);

    // 获取关联销售订单 ID
    const items = await this.ds.query(
      `SELECT i.sales_order_id,so.order_no,so.status,
              (SELECT COALESCE(SUM(a.outbound_qty),0) FROM sal_order_items oi
               JOIN sal_order_item_batch_allocations a ON a.sales_order_item_id=oi.id
               WHERE oi.sales_order_id=so.id)
              >= (SELECT COALESCE(SUM(oi.qty),0) FROM sal_order_items oi WHERE oi.sales_order_id=so.id)
                AS fully_outbound
       FROM sal_delivery_order_items i JOIN sal_sales_orders so ON so.id=i.sales_order_id
       WHERE i.delivery_order_id=$1`, [id],
    );
    const soIds = items.map((i: any) => Number(i.sales_order_id));
    const invalid = items.filter((i: any) => i.status !== 'ALLOCATED');
    if (invalid.length) throw new BadRequestException(`关联订单状态必须为 ALLOCATED：${invalid.map((i: any) => i.order_no).join(',')}`);

    await this.ds.transaction(async (mgr) => {
      await mgr.query(
        `UPDATE sal_delivery_orders SET status='DEPARTED', departure_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [id],
      );
      // 明细 → DELIVERED（在途）
      await mgr.query(
        `UPDATE sal_delivery_order_items SET status='DELIVERED', updated_at=NOW() WHERE delivery_order_id=$1`,
        [id],
      );
      // 只有累计出库达到订单总量才进入 SHIPPED；部分配送保持 ALLOCATED。
      if (soIds.length) {
        await mgr.query(
          `UPDATE sal_sales_orders SET status='SHIPPED', updated_at=NOW()
           WHERE id = ANY($1) AND status='ALLOCATED'
             AND (SELECT COALESCE(SUM(a.outbound_qty),0) FROM sal_order_items oi
                  JOIN sal_order_item_batch_allocations a ON a.sales_order_item_id=oi.id WHERE oi.sales_order_id=sal_sales_orders.id)
                 >= (SELECT COALESCE(SUM(oi.qty),0) FROM sal_order_items oi WHERE oi.sales_order_id=sal_sales_orders.id)`,
          [soIds],
        );
      }
      for (const item of items) {
        await this.lifecycle.appendEvent(mgr, {
          salesOrderId: String(item.sales_order_id), orderNo: item.order_no,
          eventType: 'DELIVERY_DEPARTED', fromStatus: item.status,
          toStatus: item.fully_outbound ? 'SHIPPED' : item.status,
          actorType: 'USER', actorUserId: this.currentUser().userId, actorName: this.currentUser().userName,
          sourceModule: 'DELIVERY', sourceRefType: 'DELIVERY', sourceRefId: id, sourceRefNo: rec.delivery_no,
        });
      }
    });

    this.logger.log(`配送单 ${rec.delivery_no} 已发车，${soIds.length} 张订单标记为 SHIPPED`);
    return this.findById(id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8. 到达  DEPARTED → ARRIVED
  // ─────────────────────────────────────────────────────────────────────────

  async arrive(id: string, _dto: ArriveDeliveryDto) {
    const rec = await this.assertOwnership(id);
    if (rec.status !== 'DEPARTED') throw new BadRequestException(`当前状态 ${rec.status} 不可标记到达`);

    const items = await this.ds.query(
      `SELECT i.sales_order_id,so.order_no,so.status FROM sal_delivery_order_items i JOIN sal_sales_orders so ON so.id=i.sales_order_id WHERE i.delivery_order_id=$1`, [id],
    );
    const soIds = items.map((i: any) => Number(i.sales_order_id));
    const invalid = items.filter((i: any) => !['SHIPPED','ALLOCATED'].includes(i.status));
    if (invalid.length) throw new BadRequestException(`关联订单状态必须为 SHIPPED/ALLOCATED：${invalid.map((i: any) => i.order_no).join(',')}`);

    await this.ds.transaction(async (mgr) => {
      await mgr.query(
        `UPDATE sal_delivery_orders SET status='ARRIVED', actual_arrival_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [id],
      );
      // 部分配送订单保持 ALLOCATED；全量已发货订单才进入 DELIVERED。
      if (soIds.length) {
        await mgr.query(
          `UPDATE sal_sales_orders SET status='DELIVERED', delivered_at=NOW(), updated_at=NOW()
           WHERE id = ANY($1) AND status='SHIPPED'`,
          [soIds],
        );
      }
      for (const item of items) {
        await this.lifecycle.appendEvent(mgr, {
          salesOrderId: String(item.sales_order_id), orderNo: item.order_no,
          eventType: 'DELIVERY_ARRIVED', fromStatus: item.status,
          toStatus: item.status === 'SHIPPED' ? 'DELIVERED' : item.status,
          actorType: 'USER', actorUserId: this.currentUser().userId, actorName: this.currentUser().userName,
          sourceModule: 'DELIVERY', sourceRefType: 'DELIVERY', sourceRefId: id, sourceRefNo: rec.delivery_no,
        });
      }
    });

    this.logger.log(`配送单 ${rec.delivery_no} 到达，${soIds.length} 张订单标记为 DELIVERED`);
    return this.findById(id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 9. 完成  ARRIVED/PARTIALLY_SIGNED → COMPLETED（全部签收后内部调用）
  // ─────────────────────────────────────────────────────────────────────────

  async complete(id: string, dto: CompleteDeliveryDto) {
    const rec = await this.assertOwnership(id);
    if (!['ARRIVED', 'PARTIALLY_SIGNED'].includes(rec.status)) {
      throw new BadRequestException(`状态 ${rec.status} 不可完成配送单`);
    }

    // 检查是否所有明细已签收
    const [unsignedRow] = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM sal_delivery_order_items
       WHERE delivery_order_id=$1
         AND (status NOT IN ('SIGNED','EXCEPTION','RETURNED') OR receipt_id IS NULL)`,
      [id],
    );
    if (Number(unsignedRow.cnt) > 0) {
      throw new BadRequestException(`仍有 ${unsignedRow.cnt} 条明细缺少终态签收记录，不可完成`);
    }

    const user = this.currentUser();
    await this.ds.transaction(async (mgr) => {
      await mgr.query(
        `UPDATE sal_delivery_orders SET status='COMPLETED', completed_at=NOW(), updated_at=NOW()
         WHERE id=$1 AND status IN ('ARRIVED','PARTIALLY_SIGNED')`, [id],
      );
      const orders = await mgr.query(
        `SELECT so.id,so.order_no FROM sal_sales_orders so JOIN sal_delivery_order_items i ON i.sales_order_id=so.id WHERE i.delivery_order_id=$1`, [id],
      );
      for (const order of orders) {
        await this.lifecycle.appendEvent(mgr, {
          salesOrderId: String(order.id), orderNo: order.order_no,
          eventType: 'DELIVERY_COMPLETED_OVERRIDE', actorType: 'USER',
          actorUserId: user.userId, actorName: user.userName,
          reasonCode: 'DELIVERY_FORCE_COMPLETE', comment: dto.remark,
          sourceModule: 'DELIVERY', sourceRefType: 'DELIVERY', sourceRefId: id, sourceRefNo: rec.delivery_no,
        });
      }
    });
    this.logger.log(`配送单 ${rec.delivery_no} 已完成`);
    return this.findById(id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 10. 取消  PLANNED / LOADING → CANCELLED
  // ─────────────────────────────────────────────────────────────────────────

  async cancel(id: string, dto: CancelDeliveryDto) {
    const rec = await this.assertOwnership(id);
    if (!CANCELLABLE.has(rec.status)) {
      throw new BadRequestException(`状态 ${rec.status} 不可取消`);
    }

    // 恢复销售订单状态
    const items = await this.ds.query(
      `SELECT i.sales_order_id,so.order_no,so.status
       FROM sal_delivery_order_items i JOIN sal_sales_orders so ON so.id=i.sales_order_id
       WHERE i.delivery_order_id=$1`, [id],
    );
    const soIds = items.map((i: any) => Number(i.sales_order_id));

    await this.ds.transaction(async (mgr) => {
      await mgr.query(
        `UPDATE sal_delivery_orders SET status='CANCELLED', remark=COALESCE($2,remark), updated_at=NOW() WHERE id=$1`,
        [id, dto.remark ?? null],
      );
      await mgr.query(
        `UPDATE sal_delivery_order_items SET status='RETURNED', updated_at=NOW() WHERE delivery_order_id=$1`,
        [id],
      );
      // 恢复销售订单至 APPROVED
      if (soIds.length) {
        await mgr.query(
          `UPDATE sal_sales_orders SET status='APPROVED', updated_at=NOW()
           WHERE id = ANY($1) AND status = 'ALLOCATED'`,
          [soIds],
        );
      }
      const user = this.currentUser();
      for (const item of items.filter((x: any) => x.status === 'ALLOCATED')) {
        await this.lifecycle.appendEvent(mgr, {
          salesOrderId: String(item.sales_order_id), orderNo: item.order_no,
          eventType: 'DELIVERY_CANCELLED', fromStatus: 'ALLOCATED', toStatus: 'APPROVED',
          actorType: 'USER', actorUserId: user.userId, actorName: user.userName,
          comment: dto.remark ?? null, sourceModule: 'DELIVERY',
          sourceRefType: 'DELIVERY', sourceRefId: id, sourceRefNo: rec.delivery_no,
        });
      }
    });

    this.logger.log(`配送单 ${rec.delivery_no} 已取消`);
    return this.findById(id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 11. Dashboard 统计
  // ─────────────────────────────────────────────────────────────────────────

  async getDashboardStats(companyCode?: string) {
    const user = this.currentUser();
    const params: any[] = [];
    const where: string[] = ['1=1'];

    if (!user.scopeAll) {
      if (user.companyCodes.length > 0) {
        params.push(user.companyCodes); where.push(`company_code = ANY($${params.length})`);
      } else {
        where.push('1=0');  // 未配置数据范围 → 拒绝访问
      }
    }
    if (companyCode) { params.push(companyCode); where.push(`company_code = $${params.length}`); }

    const wc = where.join(' AND ');

    const [today, planned, departed, completed, cancelled, pendingSign, todayComplete] = await Promise.all([
      this.ds.query(`SELECT COUNT(*) AS cnt FROM sal_delivery_orders WHERE ${wc} AND wave_date = CURRENT_DATE`, params),
      this.ds.query(`SELECT COUNT(*) AS cnt FROM sal_delivery_orders WHERE ${wc} AND status = 'PLANNED'`, params),
      this.ds.query(`SELECT COUNT(*) AS cnt FROM sal_delivery_orders WHERE ${wc} AND status IN ('DEPARTED','ARRIVED')`, params),
      this.ds.query(`SELECT COUNT(*) AS cnt FROM sal_delivery_orders WHERE ${wc} AND status = 'COMPLETED'`, params),
      this.ds.query(`SELECT COUNT(*) AS cnt FROM sal_delivery_orders WHERE ${wc} AND status = 'CANCELLED'`, params),
      this.ds.query(`SELECT COUNT(*) AS cnt FROM sal_delivery_orders WHERE ${wc} AND status IN ('ARRIVED','PARTIALLY_SIGNED')`, params),
      this.ds.query(`SELECT COUNT(*) AS cnt FROM sal_delivery_orders WHERE ${wc} AND status='COMPLETED' AND completed_at >= CURRENT_DATE`, params),
    ]);

    return {
      todayWave:      Number(today[0].cnt),
      planned:        Number(planned[0].cnt),
      inTransit:      Number(departed[0].cnt),
      completed:      Number(completed[0].cnt),
      cancelled:      Number(cancelled[0].cnt),
      pendingSign:    Number(pendingSign[0].cnt),
      todayCompleted: Number(todayComplete[0].cnt),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 12. 司机绩效统计
  // ─────────────────────────────────────────────────────────────────────────

  async getDriverPerformance(driverId: string, period: string = 'today') {
    const user = this.currentUser();
    const params: any[] = [];
    const where: string[] = ['1=1'];

    if (!user.scopeAll) {
      if (user.companyCodes.length > 0) {
        params.push(user.companyCodes);
        where.push(`company_code = ANY($${params.length})`);
      } else {
        where.push('1=0');
      }
    }
    if (driverId) {
      params.push(driverId);
      where.push(`driver_id = $${params.length}`);
    }

    const wc = where.join(' AND ');
    // JOIN 查询里需要加表名前缀
    const wcJ = wc.replace(/\b(company_code|driver_id)\b/g, 'd.$1');

    // period 参数预留扩展（目前统计维度固定为今日/本周）
    void period;

    const [todayDoneRow, weekDoneRow, weekExRow, weekRetRow] = await Promise.all([
      this.ds.query(
        `SELECT COUNT(*) AS cnt FROM sal_delivery_orders
         WHERE ${wc} AND status='COMPLETED' AND wave_date = CURRENT_DATE`,
        params,
      ),
      this.ds.query(
        `SELECT COUNT(*) AS cnt FROM sal_delivery_orders
         WHERE ${wc} AND status='COMPLETED'
           AND wave_date >= date_trunc('week', CURRENT_DATE)::date`,
        params,
      ),
      this.ds.query(
        `SELECT COUNT(*) AS cnt FROM sal_delivery_orders
         WHERE ${wc} AND status='EXCEPTION'
           AND wave_date >= date_trunc('week', CURRENT_DATE)::date`,
        params,
      ),
      (async () => {
        try {
          return await this.ds.query(
            `SELECT COUNT(*) AS cnt
             FROM sal_return_orders r
             JOIN sal_delivery_orders d ON d.id::text = r.delivery_order_id::text
             WHERE ${wcJ} AND r.return_type='DELIVERY_REJECT'
               AND r.created_at >= date_trunc('week', CURRENT_DATE)`,
            params,
          );
        } catch {
          return [{ cnt: '0' }];
        }
      })(),
    ]);

    const todayDone  = Number(todayDoneRow[0].cnt);
    const weekDone   = Number(weekDoneRow[0].cnt);
    const weekEx     = Number(weekExRow[0].cnt);
    const weekReturn = Number(weekRetRow[0].cnt);
    const weekTotal  = weekDone + weekEx;

    const onTimeRate    = weekTotal > 0 ? Math.round(((weekTotal - weekEx) / weekTotal) * 100) : 100;
    const exceptionRate = weekTotal > 0 ? Math.round((weekEx / weekTotal) * 100) : 0;
    const returnRate    = weekDone  > 0 ? Math.round((weekReturn / weekDone) * 100) : 0;

    return { todayCompleted: todayDone, weekCompleted: weekDone, onTimeRate, exceptionRate, returnRate };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 司机 CRUD
  // ─────────────────────────────────────────────────────────────────────────

  async listDrivers(companyCode?: string) {
    const user = this.currentUser();
    const where: string[] = ['1=1'];
    const params: any[] = [];

    if (!user.scopeAll) {
      if (user.companyCodes.length > 0) {
        params.push(user.companyCodes); where.push(`company_code = ANY($${params.length})`);
      } else {
        where.push('1=0');  // 未配置数据范围 → 拒绝访问
      }
    }
    if (companyCode) { params.push(companyCode); where.push(`company_code = $${params.length}`); }

    return this.ds.query(
      `SELECT * FROM sal_drivers WHERE ${where.join(' AND ')} ORDER BY driver_name`,
      params,
    );
  }

  async createDriver(dto: CreateDriverDto) {
    const user = this.currentUser();
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [row] = await this.ds.query(`SELECT COUNT(*) AS cnt FROM sal_drivers`);
    const code = `DRV-${today}-${String(Number(row.cnt) + 1).padStart(4, '0')}`;

    const [r] = await this.ds.query(
      `INSERT INTO sal_drivers (driver_code,driver_name,phone,license_no,company_code,remark)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [code, dto.driverName, dto.phone ?? null, dto.licenseNo ?? null, dto.companyCode, dto.remark ?? null],
    );
    return r;
  }

  async updateDriver(id: string, dto: UpdateDriverDto) {
    const sets: string[] = []; const params: any[] = [];
    const add = (col: string, v: any) => { if (v !== undefined) { params.push(v); sets.push(`${col}=$${params.length}`); } };
    add('driver_name', dto.driverName);
    add('phone',       dto.phone);
    add('license_no',  dto.licenseNo);
    add('status',      dto.status);
    add('remark',      dto.remark);
    if (!sets.length) return;
    params.push(id);
    const [r] = await this.ds.query(
      `UPDATE sal_drivers SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${params.length} RETURNING *`,
      params,
    );
    if (!r) throw new NotFoundException(`司机 ${id} 不存在`);
    return r;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 车辆 CRUD
  // ─────────────────────────────────────────────────────────────────────────

  async listVehicles(companyCode?: string) {
    const user = this.currentUser();
    const where: string[] = ['1=1'];
    const params: any[] = [];

    if (!user.scopeAll) {
      if (user.companyCodes.length > 0) {
        params.push(user.companyCodes); where.push(`company_code = ANY($${params.length})`);
      } else {
        where.push('1=0');  // 未配置数据范围 → 拒绝访问
      }
    }
    if (companyCode) { params.push(companyCode); where.push(`company_code = $${params.length}`); }

    return this.ds.query(
      `SELECT * FROM sal_vehicles WHERE ${where.join(' AND ')} ORDER BY vehicle_no`,
      params,
    );
  }

  async createVehicle(dto: CreateVehicleDto) {
    const [r] = await this.ds.query(
      `INSERT INTO sal_vehicles (vehicle_no,plate_no,vehicle_type,capacity,company_code,remark)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [dto.vehicleNo, dto.plateNo ?? null, dto.vehicleType ?? null, dto.capacity ?? null, dto.companyCode, dto.remark ?? null],
    );
    return r;
  }

  async updateVehicle(id: string, dto: UpdateVehicleDto) {
    const sets: string[] = []; const params: any[] = [];
    const add = (col: string, v: any) => { if (v !== undefined) { params.push(v); sets.push(`${col}=$${params.length}`); } };
    add('plate_no',     dto.plateNo);
    add('vehicle_type', dto.vehicleType);
    add('capacity',     dto.capacity);
    add('status',       dto.status);
    add('remark',       dto.remark);
    if (!sets.length) return;
    params.push(id);
    const [r] = await this.ds.query(
      `UPDATE sal_vehicles SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${params.length} RETURNING *`,
      params,
    );
    if (!r) throw new NotFoundException(`车辆 ${id} 不存在`);
    return r;
  }
}
