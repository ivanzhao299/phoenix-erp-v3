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
    this.scopeHelper.applyToQb(qb, { alias: 'r' });
    // ────────────────────────────────────────────────────────────────────────

    const [items, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items, total, page, pageSize };
  }

  // ── 详情 ──────────────────────────────────────────────────────────────────

  async findById(id: string) {
    const rcp = await this.rcpRepo.findOne({ where: { id } });
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
      shipment = await this.shpRepo.findOne({ where: { id: rcp.shipmentId } });
    }
    const po = await this.poRepo.findOne({ where: { id: rcp.poId } });
    return { ...rcp, items, approvals, shipment, po };
  }

  // ── 创建 ──────────────────────────────────────────────────────────────────

  async create(dto: CreateReceiptDto) {
    return this.ds.transaction(async mgr => {
      // ── 校验 PO 存在且状态允许收货 ───────────────────────────────────────
      const po = await mgr.findOne(Prc2PurchaseOrderEntity, { where: { id: dto.poId } });
      if (!po) throw new NotFoundException(`PO ID=${dto.poId} 不存在`);
      if (!['APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(po.status))
        throw new ConflictException(`PO 状态 ${po.status} 不允许创建收货单`);

      // ── 校验每行 actual_qty + rejected_qty <= expected_qty ───────────────
      for (const item of dto.items) {
        const actual   = Number(item.actualQty ?? 0);
        const rejected = Number(item.rejectedQty ?? 0);
        const expected = Number(item.expectedQty ?? 0);
        if (actual + rejected > expected + 0.0001) {
          throw new BadRequestException(
            `物品「${item.itemName}」实收 ${actual} + 拒收 ${rejected} 超过期望数量 ${expected}`,
          );
        }
      }

      const prefix    = `RCV2-${format(new Date(), 'yyyyMMdd')}-`;
      const receiptNo = await genNo(mgr, prefix, Prc2ReceiptEntity as never, 'r', 'receiptNo');

      const rcp = mgr.create(Prc2ReceiptEntity, {
        receiptNo,
        poId:          dto.poId,
        poNo:          dto.poNo,
        shipmentId:    dto.shipmentId,
        shipmentNo:    dto.shipmentNo,
        companyId:     dto.companyId,
        companyCode:   dto.companyCode,
        companyName:   dto.companyName,
        projectId:     dto.projectId,
        projectCode:   dto.projectCode,
        projectName:   dto.projectName,
        warehouseCode: dto.warehouseCode,
        receiverId:    dto.receiverId,
        receiverName:  dto.receiverName,
        receiptDate:   dto.receiptDate ?? format(new Date(), 'yyyy-MM-dd'),
        remark:        dto.remark,
        status:        'DRAFT',
        createdBy:     this.userId(),
      });
      const saved = await mgr.save(Prc2ReceiptEntity, rcp);

      const rows = dto.items.map(i => mgr.create(Prc2ReceiptItemEntity, {
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
      const rcp = await mgr.findOne(Prc2ReceiptEntity, { where: { id } });
      if (!rcp) throw new NotFoundException(`收货单 ID=${id} 不存在`);
      if (rcp.status === 'CONFIRMED')
        throw new ConflictException('该收货单已确认，不可重复确认');
      if (!['DRAFT', 'PARTIAL'].includes(rcp.status))
        throw new ConflictException(`当前状态 ${rcp.status} 不允许确认`);

      const items = await mgr.find(Prc2ReceiptItemEntity, { where: { receiptId: id } });
      if (items.length === 0)
        throw new BadRequestException('收货单无明细行，无法确认');

      // ── 2. PO 存在性检查 ─────────────────────────────────────────────────
      const po = await mgr.findOne(Prc2PurchaseOrderEntity, { where: { id: rcp.poId } });
      if (!po) throw new NotFoundException(`关联 PO ID=${rcp.poId} 不存在`);

      // ── 3. 累加 order_items.received_qty，并检查超收 ─────────────────────
      for (const item of items) {
        if (!item.poItemId) continue;

        const poi = await mgr.findOne(Prc2OrderItemEntity, { where: { id: item.poItemId } });
        if (!poi) continue;

        const newReceivedQty = Number(poi.receivedQty) + Number(item.actualQty);
        if (newReceivedQty > Number(poi.qty) + 0.0001) {
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
      const totalReceived = allPoItems.reduce((s, i) => s + Number(i.receivedQty), 0);
      const totalPlan     = allPoItems.reduce((s, i) => s + Number(i.qty), 0);

      // ── 5. 判断 PO 状态联动 ───────────────────────────────────────────────
      let newPoStatus: string;
      if (totalPlan > 0 && totalReceived >= totalPlan - 0.0001) {
        newPoStatus = 'RECEIVED';
      } else {
        newPoStatus = 'PARTIALLY_RECEIVED';
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
      if (newPoStatus === 'RECEIVED' && rcp.shipmentId) {
        const shp = await mgr.findOne(Prc2ShipmentEntity, { where: { id: rcp.shipmentId } });
        if (shp && shp.status === 'ARRIVED') {
          await mgr.update(Prc2ShipmentEntity, { id: rcp.shipmentId }, { status: 'DELIVERED' });
        }
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
        operator:      this.userId(),
        items: items.map(i => ({
          productCode: i.itemCode,
          qty:         Number(i.actualQty),
        })),
      });

      return { ...rcp, status: 'CONFIRMED', confirmedAt: now };
    });
  }

  // ── 取消（仅 DRAFT/PARTIAL） ──────────────────────────────────────────────

  async cancel(id: string, dto: { comment?: string }) {
    return this.ds.transaction(async mgr => {
      const rcp = await mgr.findOne(Prc2ReceiptEntity, { where: { id } });
      if (!rcp) throw new NotFoundException(`收货单 ID=${id} 不存在`);
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
