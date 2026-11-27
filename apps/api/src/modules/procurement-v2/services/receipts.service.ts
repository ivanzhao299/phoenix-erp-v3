import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeHelper } from '../../org/helpers/data-scope.helper';
import { WmsService } from '../../wms/wms.service';   // G84 收货→库存统一入库
import { format } from 'date-fns';

import { Prc2ReceiptEntity }       from '../entities/prc2-receipt.entity';
import { Prc2ReceiptItemEntity }   from '../entities/prc2-receipt-item.entity';
import { Prc2ShipmentEntity }      from '../entities/prc2-shipment.entity';
import { Prc2PurchaseOrderEntity } from '../entities/prc2-purchase-order.entity';
import { Prc2OrderItemEntity }     from '../entities/prc2-order-item.entity';
import { Prc2ApprovalEntity }      from '../entities/prc2-approval.entity';

import { CreateReceiptDto }        from '../dto/create-receipt.dto';
import { ReceiptItemDto } from '../dto/receipt-item.dto';
import { QueryReceiptDto }         from '../dto/query-receipt.dto';

// ── 并发安全编号生成 ──────────────────────────────────────────────────────────
async function genNo(
  mgr: EntityManager,
  prefix: string,
  repo: { createQueryBuilder: Function },
  alias: string,
  field: string,
): Promise<string> {
  await mgr.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
  const row = await mgr.createQueryBuilder(repo as never, alias)
    .select(`MAX(${alias}.${field})`, 'max')
    .where(`${alias}.${field} LIKE :p`, { p: `${prefix}%` })
    .getRawOne<{ max: string | null }>();
  let seq = 1;
  if (row?.max) {
    const last = parseInt(row.max.slice(prefix.length), 10);
    if (!isNaN(last)) seq = last + 1;
  }
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

@Injectable()
export class ReceiptsService {
  constructor(
    @InjectRepository(Prc2ReceiptEntity)       private rcpRepo:   Repository<Prc2ReceiptEntity>,
    @InjectRepository(Prc2ReceiptItemEntity)   private itemRepo:  Repository<Prc2ReceiptItemEntity>,
    @InjectRepository(Prc2ShipmentEntity)      private shpRepo:   Repository<Prc2ShipmentEntity>,
    @InjectRepository(Prc2PurchaseOrderEntity) private poRepo:    Repository<Prc2PurchaseOrderEntity>,
    @InjectRepository(Prc2OrderItemEntity)     private poiRepo:   Repository<Prc2OrderItemEntity>,
    @InjectRepository(Prc2ApprovalEntity)      private logRepo:   Repository<Prc2ApprovalEntity>,
    @InjectDataSource() private ds: DataSource,
    private cls: ClsService,
    private scopeHelper: DataScopeHelper,
    private wms: WmsService,   // G84 收货→库存统一入库
  ) {}

  // ── 内部工具 ──────────────────────────────────────────────────────────────

  private userId(): string {
    const u = this.cls.get('user');
    return String(u?.userId ?? u?.id ?? 0);
  }

  private userName(): string {
    const u = this.cls.get('user');
    return u?.name ?? u?.username ?? 'system';
  }

  private async writeLog(mgr: EntityManager, opts: {
    bizType: string; bizId: string; bizNo: string;
    node: string; action: string; comment?: string;
  }) {
    await mgr.save(Prc2ApprovalEntity, mgr.create(Prc2ApprovalEntity, {
      bizType:      opts.bizType,
      bizId:        opts.bizId,
      bizNo:        opts.bizNo,
      approvalNode: opts.node,
      action:       opts.action,
      approverId:   this.userId(),
      approverName: this.userName(),
      comment:      opts.comment,
    }));
  }

  async validateWarehouseUsage(warehouseCode: string) {
    await this.wms.assertPurchaseReceiptWarehouseUsage(this.ds.manager, warehouseCode);
    return { valid: true, warehouseCode };
  }

  /**
   * Return only purchase orders that can still receive goods. This endpoint
   * is guarded by the receipt menu so receiving staff do not need purchase
   * order maintenance permission just to select an approved PO.
   */
  async listEligiblePurchaseOrders(keyword?: string) {
    const qb = this.poRepo.createQueryBuilder('p')
      .where('p.status IN (:...statuses)', { statuses: ['APPROVED', 'PARTIALLY_RECEIVED'] });
    if (keyword?.trim()) {
      qb.andWhere(
        '(p.poNo ILIKE :keyword OR p.subject ILIKE :keyword OR p.supplierName ILIKE :keyword)',
        { keyword: `%${keyword.trim()}%` },
      );
    }
    this.scopeHelper.applyToQb(qb, { alias: 'p' });
    const orders = await qb.orderBy('p.createdAt', 'DESC').addOrderBy('p.id', 'DESC').take(100).getMany();
    return orders.map(po => ({
      id: po.id,
      poNo: po.poNo,
      subject: po.subject,
      supplierName: po.supplierName,
      companyCode: po.companyCode,
      projectCode: po.projectCode,
      status: po.status,
    }));
  }

  async getEligiblePurchaseOrder(id: string) {
    const qb = this.poRepo.createQueryBuilder('p')
      .where('p.id = :id', { id })
      .andWhere('p.status IN (:...statuses)', { statuses: ['APPROVED', 'PARTIALLY_RECEIVED'] });
    this.scopeHelper.applyToQb(qb, { alias: 'p' });
    const po = await qb.getOne();
    if (!po) throw new NotFoundException('未找到可收货的采购订单');
    const lines = this.poiRepo.createQueryBuilder('line').where('line.poId = :id', { id })
      .orderBy('line.id', 'ASC');
    const scope = this.cls.get('dataScope');
    if (scope?.scopeLevel === 'PROJECT' && !scope.isGlobal) {
      lines.andWhere('COALESCE(line.project_code, :headProject) = ANY(CAST(:projects AS text[]))', {
        headProject: po.projectCode, projects: scope.allowedProjectCodes,
      });
    }
    const items = await lines.getMany();
    return {
      id: po.id, poNo: po.poNo,
      companyId: po.companyId, companyCode: po.companyCode, companyName: po.companyName,
      projectId: po.projectId, projectCode: po.projectCode, projectName: po.projectName,
      items: items.filter(item => Number(item.qty) > Number(item.receivedQty)).map(item => ({
        id: item.id, itemCode: item.itemCode, itemName: item.itemName, spec: item.spec,
        unit: item.unit, qty: item.qty, receivedQty: item.receivedQty,
      })),
    };
  }

  private quantityUnits(quantity: number): number {
    return Math.round(Number(quantity) * 10000);
  }

  private validateReceiptLine(
    item: Omit<ReceiptItemDto, 'qualityStatus'> & { qualityStatus?: string },
    orderLine: Prc2OrderItemEntity,
  ) {
    const actual = Number(item.actualQty);
    const rejected = Number(item.rejectedQty ?? 0);
    const expected = Number(item.expectedQty);
    const remaining = this.quantityUnits(orderLine.qty) - this.quantityUnits(orderLine.receivedQty);
    const handled = this.quantityUnits(actual) + this.quantityUnits(rejected);
    if (![actual, rejected, expected].every(quantity => Number.isFinite(quantity) && quantity >= 0)
      || handled > this.quantityUnits(expected) || handled > remaining) {
      throw new BadRequestException(`物料「${item.itemName}」实收及拒收数量超出应收或订单余量`);
    }
    const quality = item.qualityStatus ?? 'PASS';
    if (!['PASS', 'PARTIAL', 'REJECT'].includes(quality)
      || (quality === 'REJECT' && (actual !== 0 || rejected <= 0))
      || (quality === 'PARTIAL' && (actual <= 0 || rejected <= 0))
      || (quality === 'PASS' && rejected > 0)) {
      throw new BadRequestException(`物料「${item.itemName}」质检结果与实收、拒收数量不一致`);
    }
    if ((actual > 0 && !orderLine.itemCode?.trim())
      || (item.itemCode && item.itemCode !== orderLine.itemCode)
      || (item.unit && orderLine.unit && item.unit !== orderLine.unit)) {
      throw new BadRequestException(`物料「${item.itemName}」编码或单位与采购订单不一致`);
    }
  }

  private async resolveShipment(
    mgr: EntityManager, po: Prc2PurchaseOrderEntity, id?: string, no?: string,
  ) {
    if (!id && !no) return null;
    const shipment = await mgr.findOne(Prc2ShipmentEntity, {
      where: id ? { id } : { shipmentNo: no },
    });
    if (!shipment || (shipment.poId ? String(shipment.poId) !== String(po.id) : shipment.poNo !== po.poNo)
      || (shipment.poNo && shipment.poNo !== po.poNo)
      || (shipment.companyCode && shipment.companyCode !== po.companyCode)
      || (shipment.projectCode && shipment.projectCode !== po.projectCode)
      || (no && shipment.shipmentNo !== no)) {
      throw new BadRequestException('运单与采购订单或归属不一致');
    }
    return shipment;
  }

  // ── 列表 ──────────────────────────────────────────────────────────────────

  async list(q: QueryReceiptDto) {
    const page     = Math.max(1, parseInt(q.page     ?? '1',  10));
    const pageSize = Math.max(1, parseInt(q.pageSize ?? '20', 10));

    const qb = this.rcpRepo.createQueryBuilder('r').orderBy('r.id', 'DESC');

    if (q.companyCode)     qb.andWhere('r.companyCode     = :cc',  { cc:  q.companyCode });
    if (q.projectCode)     qb.andWhere('r.projectCode     = :pc',  { pc:  q.projectCode });
    if (q.poNo)            qb.andWhere('r.poNo            = :pn',  { pn:  q.poNo });
    if (q.shipmentNo)      qb.andWhere('r.shipmentNo      = :sn',  { sn:  q.shipmentNo });
    if (q.warehouseCode)   qb.andWhere('r.warehouseCode   = :wc',  { wc:  q.warehouseCode });
    if (q.status)          qb.andWhere('r.status          = :st',  { st:  q.status });
    if (q.receiptDateFrom) qb.andWhere('r.receiptDate    >= :rdf', { rdf: q.receiptDateFrom });
    if (q.receiptDateTo)   qb.andWhere('r.receiptDate    <= :rdt', { rdt: q.receiptDateTo });
    if (q.keyword)         qb.andWhere(
      '(r.receiptNo ILIKE :kw OR r.poNo ILIKE :kw OR r.shipmentNo ILIKE :kw OR r.receiverName ILIKE :kw)',
      { kw: `%${q.keyword}%` },
    );

    // ── RBAC-2 数据范围过滤 ──────────────────────────────────────────────────
    this.scopeHelper.applyToQb(qb, { alias: 'r', warehouseField: 'warehouseCode' });   // G85-C 补仓库维度
    // ────────────────────────────────────────────────────────────────────────

    const [items, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const warehouseCodes = [...new Set(items.map(r => r.warehouseCode).filter(Boolean))];
    const warehouses: any[] = warehouseCodes.length ? await this.ds.query(
      `SELECT warehouse_code, warehouse_name, warehouse_name_zh, warehouse_name_en, warehouse_name_lo
         FROM wms_warehouses WHERE warehouse_code = ANY($1::text[])`, [warehouseCodes],
    ) : [];
    const warehouseMap = new Map(warehouses.map(r => [r.warehouse_code, r]));
    return { items: items.map(r => ({ ...r, ...warehouseMap.get(r.warehouseCode) })), total, page, pageSize };
  }

  // ── 详情 ──────────────────────────────────────────────────────────────────

  async findById(id: string) {
    const qb = this.rcpRepo.createQueryBuilder('r').where('r.id = :id', { id });
    this.scopeHelper.applyToQb(qb, { alias: 'r', warehouseField: 'warehouseCode' });
    const rcp = await qb.getOne();
    if (!rcp) throw new NotFoundException(`收货单 ID=${id} 不存在`);

    // ── RBAC-2.5 详情归属校验 ────────────────────────────────────────────────
    this.scopeHelper.assertOwnership(
      { companyCode: rcp.companyCode, projectCode: rcp.projectCode },
      'Receipt',
    );
    // ─────────────────────────────────────────────────────────────────────────

    const [items, approvals] = await Promise.all([
      this.itemRepo.find({ where: { receiptId: id }, order: { id: 'ASC' } }),
      this.logRepo.find({ where: { bizId: id, bizType: 'RECEIPT' }, order: { id: 'ASC' } }),
    ]);
    let shipment = null;
    if (rcp.shipmentId) {
      const linked = await this.shpRepo.findOne({ where: { id: rcp.shipmentId, poId: rcp.poId } });
      if (linked) shipment = { id: linked.id, shipmentNo: linked.shipmentNo, status: linked.status };
    }
    const po = await this.poRepo.findOne({ where: { id: rcp.poId } });
    const [warehouse] = rcp.warehouseCode ? await this.ds.query(
      `SELECT warehouse_name, warehouse_name_zh, warehouse_name_en, warehouse_name_lo
         FROM wms_warehouses WHERE warehouse_code=$1 LIMIT 1`, [rcp.warehouseCode],
    ) : [];
    const itemCodes = [...new Set(items.map(i => i.itemCode).filter(Boolean))];
    const names: any[] = itemCodes.length ? await this.ds.query(
      `SELECT material_code AS item_code, material_name AS sku_name, material_name_en AS sku_name_en, material_name_lo AS sku_name_lo
         FROM mst_materials m WHERE material_code = ANY($1::text[])
         AND NOT EXISTS (SELECT 1 FROM product_skus s WHERE s.sku_code=m.material_code)`, [itemCodes],
    ) : [];
    const nameMap = new Map(names.map(r => [r.item_code, r]));
    return { ...rcp, ...warehouse, items: items.map(i => ({ ...i, ...nameMap.get(i.itemCode) })), approvals, shipment, po: po && { poNo: po.poNo, planQty: po.planQty, receivedQty: po.receivedQty, status: po.status } };
  }

  // ── 创建 ──────────────────────────────────────────────────────────────────

  async create(dto: CreateReceiptDto) {
    return this.ds.transaction(async mgr => {
      // ── 校验 PO 存在且状态允许收货 ───────────────────────────────────────
      const po = await mgr.findOne(Prc2PurchaseOrderEntity, { where: { id: dto.poId } });
      if (!po) throw new NotFoundException(`PO ID=${dto.poId} 不存在`);
      if (po.poNo !== dto.poNo?.trim()) {
        throw new BadRequestException(`采购订单引用不一致: poId=${po.id} 对应 ${po.poNo}, 不是 ${dto.poNo}`);
      }
      const ownershipFields = [
        ['companyId', dto.companyId, po.companyId, '公司 ID'],
        ['companyCode', dto.companyCode, po.companyCode, '公司'],
        ['projectId', dto.projectId, po.projectId, '项目 ID'],
        ['projectCode', dto.projectCode, po.projectCode, '项目'],
      ] as const;
      for (const [, supplied, canonical, label] of ownershipFields) {
        if (supplied !== undefined && supplied !== canonical) {
          throw new BadRequestException(`采购收货单${label} ${supplied} 与采购订单 ${canonical ?? ''} 不一致`);
        }
      }
      this.scopeHelper.assertWritableOwnership(
        { companyCode: po.companyCode, projectCode: po.projectCode },
        '采购收货单',
      );
      if (!po.companyCode || po.companyCode === 'ALL') throw new BadRequestException('采购订单缺少有效公司归属');
      this.scopeHelper.assertWritableWarehouse(dto.warehouseCode, '采购收货单');
      await this.wms.assertPurchaseReceiptWarehouseUsage(mgr, dto.warehouseCode);
      if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status))
        throw new ConflictException(`PO 状态 ${po.status} 不允许创建收货单`);

      if (!dto.warehouseCode) throw new BadRequestException('请选择收货仓库');
      await this.wms.assertPurchaseReceiptWarehouseCompany(mgr, dto.warehouseCode, po.companyCode);
      const shipment = await this.resolveShipment(mgr, po, dto.shipmentId, dto.shipmentNo);
      if (!dto.items.some(item => item.actualQty > 0 || Number(item.rejectedQty) > 0)) {
        throw new BadRequestException('至少填写一行实收或拒收数量');
      }
      const orderLines = await mgr.find(Prc2OrderItemEntity, { where: { poId: po.id } });
      const byId = new Map(orderLines.map(line => [String(line.id), line]));
      const seen = new Set<string>();
      const receiptLines = [];
      for (const item of dto.items) {
        const key = String(item.poItemId);
        const line = byId.get(key);
        if (!line || seen.has(key)) throw new BadRequestException('收货明细须属于当前采购订单且不能重复');
        seen.add(key);
        this.scopeHelper.assertWritableOwnership(
          { companyCode: po.companyCode, projectCode: line.projectCode ?? po.projectCode }, '采购收货单明细',
        );
        this.validateReceiptLine(item, line);
        const unit = line.unit || (item.actualQty > 0 ? await this.wms.resolvePurchaseReceiptUnit(mgr, line.itemCode, po.companyCode) : undefined);
        receiptLines.push({ ...item, itemCode: line.itemCode, itemName: line.itemName, spec: line.spec, unit,
          projectId: line.projectId, projectCode: line.projectCode, projectName: line.projectName });
      }

      const prefix    = `RCV2-${format(new Date(), 'yyyyMMdd')}-`;
      const receiptNo = await genNo(mgr, prefix, Prc2ReceiptEntity as never, 'r', 'receiptNo');

      const rcp = mgr.create(Prc2ReceiptEntity, {
        receiptNo,
        poId:          dto.poId,
        poNo:          po.poNo,
        shipmentId:    shipment?.id,
        shipmentNo:    shipment?.shipmentNo,
        companyId:     po.companyId,
        companyCode:   po.companyCode,
        companyName:   po.companyName,
        projectId:     po.projectId,
        projectCode:   po.projectCode,
        projectName:   po.projectName,
        warehouseCode: dto.warehouseCode,
        receiverId:    dto.receiverId,
        receiverName:  dto.receiverName,
        receiptDate:   dto.receiptDate ?? format(new Date(), 'yyyy-MM-dd'),
        remark:        dto.remark,
        status:        'DRAFT',
        createdBy:     this.userId(),
      });
      const saved = await mgr.save(Prc2ReceiptEntity, rcp);

      const rows = receiptLines.map(i => mgr.create(Prc2ReceiptItemEntity, {
        receiptId:     saved.id,
        poItemId:      i.poItemId,
        projectId:     i.projectId,
        projectCode:   i.projectCode,
        projectName:   i.projectName,
        itemCode:      i.itemCode,
        itemName:      i.itemName,
        spec:          i.spec,
        expectedQty:   i.expectedQty,
        actualQty:     i.actualQty,
        rejectedQty:   i.rejectedQty ?? 0,
        unit:          i.unit,
        qualityStatus: i.qualityStatus,
        remark:        i.remark,
      }));
      await mgr.save(Prc2ReceiptItemEntity, rows);

      return saved;
    });
  }

  // ── 确认收货（核心事务） ──────────────────────────────────────────────────

  async confirm(id: string, dto: { comment?: string }) {
    return this.ds.transaction(async mgr => {
      // ── 1. 幂等保护 ─────────────────────────────────────────────────────
      // Serialize confirmation attempts for the same receipt.  The status
      // check alone is insufficient under concurrent requests: both callers
      // could observe DRAFT and post inventory before either commit.
      const rcp = await mgr.findOne(Prc2ReceiptEntity, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!rcp) throw new NotFoundException(`收货单 ID=${id} 不存在`);
      this.scopeHelper.assertWritableOwnership(
        { companyCode: rcp.companyCode, projectCode: rcp.projectCode },
        '采购收货单',
      );
      this.scopeHelper.assertWritableWarehouse(rcp.warehouseCode, '采购收货单');
      await this.wms.assertPurchaseReceiptWarehouseUsage(mgr, rcp.warehouseCode);
      if (rcp.status === 'CONFIRMED')
        throw new ConflictException('该收货单已确认，不可重复确认');
      if (!['DRAFT', 'PARTIAL'].includes(rcp.status))
        throw new ConflictException(`当前状态 ${rcp.status} 不允许确认`);

      const items = await mgr.find(Prc2ReceiptItemEntity, { where: { receiptId: id } });
      if (items.length === 0)
        throw new BadRequestException('收货单无明细行，无法确认');

      // ── 2. PO 存在性检查 ─────────────────────────────────────────────────
      const po = await mgr.findOne(Prc2PurchaseOrderEntity, {
        where: { id: rcp.poId }, lock: { mode: 'pessimistic_write' },
      });
      if (!po) throw new NotFoundException(`关联 PO ID=${rcp.poId} 不存在`);
      if (!po.companyCode || po.companyCode === 'ALL') throw new BadRequestException('采购订单缺少有效公司归属');
      if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)
        || rcp.companyCode !== po.companyCode || rcp.projectCode !== po.projectCode) {
        throw new ConflictException('采购订单状态或归属已变更，请重新建立收货单');
      }
      const shipment = await this.resolveShipment(mgr, po, rcp.shipmentId, rcp.shipmentNo);


      // ── 3. 累加 order_items.received_qty，并检查超收 ─────────────────────
      // INV-401：同步收集 PO 明细单价，供第 9 步库存入账写批次 unit_cost
      const storedOrderLines = await mgr.find(Prc2OrderItemEntity, { where: { poId: po.id } });
      const storedReceived = storedOrderLines.reduce((sum, line) => sum + this.quantityUnits(line.receivedQty), 0);
      if (storedReceived !== this.quantityUnits(po.receivedQty)) {
        throw new ConflictException('订单历史已收数量与明细不一致，请先核对历史收货');
      }
      if (!items.some(item => Number(item.actualQty) > 0 || Number(item.rejectedQty) > 0)) {
        throw new BadRequestException('至少填写一行实收或拒收数量');
      }
      const unitPriceByPoItem = new Map<string, number>();
      const seenPoItems = new Set<string>();
      for (const item of items) {
        if (!item.poItemId || seenPoItems.has(item.poItemId)) {
          throw new BadRequestException(`物品「${item.itemName}」缺少采购行或采购行重复，无法确认收货`);
        }

        seenPoItems.add(item.poItemId);
        const poi = await mgr.findOne(Prc2OrderItemEntity, {
          where: { id: item.poItemId }, lock: { mode: 'pessimistic_write' },
        });
        if (!poi) {
          throw new NotFoundException(`采购订单明细 ID=${item.poItemId} 不存在`);
        }
        if (String(poi.poId) !== String(po.id)) {
          throw new BadRequestException(
            `物品「${item.itemName}」的采购订单明细不属于当前 PO ${po.poNo}`,
          );
        }

        this.scopeHelper.assertWritableOwnership(
          { companyCode: po.companyCode, projectCode: poi.projectCode ?? po.projectCode }, '采购收货单明细',
        );
        this.validateReceiptLine(item, poi);
        if (Number(item.actualQty) > 0) {
          if (!item.itemCode) throw new BadRequestException('历史收货明细缺少可核对的物料编码，请重新建立收货单');
          const unit = poi.unit || await this.wms.resolvePurchaseReceiptUnit(mgr, poi.itemCode, po.companyCode);
          if (item.unit && item.unit !== unit) throw new BadRequestException('历史收货明细的物料单位与订单不一致');
          if (!item.unit) {
            item.unit = unit;
            await mgr.update(Prc2ReceiptItemEntity, { id: item.id }, { unit });
          }
        }
        const newReceivedQty = (this.quantityUnits(poi.receivedQty) + this.quantityUnits(item.actualQty)) / 10000;
        unitPriceByPoItem.set(
          String(item.poItemId),
          Number.isFinite(Number(poi.unitPrice)) && Number(poi.unitPrice) >= 0
            ? Number(poi.unitPrice)
            : 0,
        );
        if (this.quantityUnits(newReceivedQty) > this.quantityUnits(poi.qty)) {
          throw new BadRequestException(
            `物品「${item.itemName}」超收：计划 ${poi.qty}，已收 ${poi.receivedQty}，本次 ${item.actualQty}`,
          );
        }
        await mgr.update(Prc2OrderItemEntity, { id: item.poItemId }, {
          receivedQty: newReceivedQty,
        });
      }

      // ── 4. 汇总 PO 头表 received_qty ─────────────────────────────────────
      const allPoItems = await mgr.find(Prc2OrderItemEntity, { where: { poId: po.id } });
      const totalReceived = allPoItems.reduce((sum, line) => sum + this.quantityUnits(line.receivedQty), 0) / 10000;

      // ── 5. 判断 PO 状态联动 ───────────────────────────────────────────────
      let newPoStatus: string;
      if (totalReceived > 0 && allPoItems.every(line => this.quantityUnits(line.receivedQty) >= this.quantityUnits(line.qty))) {
        newPoStatus = 'RECEIVED';
      } else {
        newPoStatus = totalReceived > 0 ? 'PARTIALLY_RECEIVED' : po.status;
      }

      await mgr.update(Prc2PurchaseOrderEntity, { id: po.id }, {
        receivedQty: totalReceived,
        status:      newPoStatus,
      });

      // ── 6. 收货单状态更新 ─────────────────────────────────────────────────
      const now = new Date();
      await mgr.update(Prc2ReceiptEntity, { id }, {
        status:      'CONFIRMED',
        confirmedBy: this.userId(),
        confirmedAt: now,
      });

      // ── 7. Shipment 状态：若 PO 已全部收货 → DELIVERED ───────────────────
      if (newPoStatus === 'RECEIVED' && shipment?.status === 'ARRIVED') {
        await mgr.update(Prc2ShipmentEntity, { id: shipment.id, status: 'ARRIVED' }, { status: 'DELIVERED' });
      }

      // ── 8. 审批日志 ──────────────────────────────────────────────────────
      await this.writeLog(mgr, {
        bizType: 'RECEIPT', bizId: id, bizNo: rcp.receiptNo,
        node: 'CONFIRM', action: 'CONFIRM', comment: dto.comment,
      });

      // ── 9. 库存入账（G84：统一经 WmsService 写 inv_batches/inv_ledger，守唯一写入口 #6 + 状态 AVAILABLE #7）──
      await this.wms.inboundFromReceipt(mgr, {
        refNo:         rcp.receiptNo,
        warehouseCode: rcp.warehouseCode,
        companyCode: po.companyCode,
        inboundDate:   rcp.receiptDate,
        operator:      this.userId(),
        items: items.map(i => ({
          receiptItemId:i.id,unit:i.unit??undefined,
          itemCode:    i.itemCode,
          qty:         Number(i.actualQty),
          // INV-401：采购批次成本 = PO 明细单价（prc2_order_items.unit_price，
          // numeric(18,4) DEFAULT 0）；缺失时 WMS 侧安全回退 0
          unitCost:    unitPriceByPoItem.get(String(i.poItemId)) ?? 0,
        })),
      });

      return { ...rcp, status: 'CONFIRMED', confirmedAt: now };
    });
  }

  // ── 取消（仅 DRAFT/PARTIAL） ──────────────────────────────────────────────

  async cancel(id: string, dto: { comment?: string }) {
    return this.ds.transaction(async mgr => {
      const rcp = await mgr.findOne(Prc2ReceiptEntity, {
        where: { id }, lock: { mode: 'pessimistic_write' },
      });
      if (!rcp) throw new NotFoundException(`收货单 ID=${id} 不存在`);
      this.scopeHelper.assertWritableOwnership(
        { companyCode: rcp.companyCode, projectCode: rcp.projectCode },
        '采购收货单',
      );
      this.scopeHelper.assertWritableWarehouse(rcp.warehouseCode, '采购收货单');
      if (rcp.status === 'CONFIRMED')
        throw new ConflictException('已确认收货单不允许取消');
      if (rcp.status === 'CANCELLED')
        throw new ConflictException('已取消');
      rcp.status = 'CANCELLED';
      await mgr.save(Prc2ReceiptEntity, rcp);
      await this.writeLog(mgr, {
        bizType: 'RECEIPT', bizId: id, bizNo: rcp.receiptNo,
        node: 'CANCEL', action: 'CANCEL', comment: dto.comment,
      });
      return rcp;
    });
  }
}
