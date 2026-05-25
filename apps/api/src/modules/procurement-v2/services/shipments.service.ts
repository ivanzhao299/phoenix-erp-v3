import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeHelper } from '../../org/helpers/data-scope.helper';
import { format } from 'date-fns';

import { Prc2ShipmentEntity }  from '../entities/prc2-shipment.entity';
import { Prc2ReceiptEntity }   from '../entities/prc2-receipt.entity';
import { Prc2ApprovalEntity }  from '../entities/prc2-approval.entity';

import { CreateShipmentDto }   from '../dto/create-shipment.dto';
import { UpdateShipmentDto }   from '../dto/update-shipment.dto';
import { QueryShipmentDto }    from '../dto/query-shipment.dto';
import { ArriveShipmentDto }   from '../dto/arrive-shipment.dto';
import { CustomsShipmentDto }  from '../dto/customs-shipment.dto';

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
export class ShipmentsService {
  constructor(
    @InjectRepository(Prc2ShipmentEntity) private shpRepo:  Repository<Prc2ShipmentEntity>,
    @InjectRepository(Prc2ReceiptEntity)  private rcpRepo:  Repository<Prc2ReceiptEntity>,
    @InjectRepository(Prc2ApprovalEntity) private logRepo:  Repository<Prc2ApprovalEntity>,
    @InjectDataSource() private ds: DataSource,
    private cls: ClsService,
    private scopeHelper: DataScopeHelper,
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

  async list(q: QueryShipmentDto) {
    const page     = Math.max(1, parseInt(q.page     ?? '1',  10));
    const pageSize = Math.max(1, parseInt(q.pageSize ?? '20', 10));

    const qb = this.shpRepo.createQueryBuilder('s').orderBy('s.id', 'DESC');

    if (q.companyCode)        qb.andWhere('s.companyCode        = :cc',  { cc:  q.companyCode });
    if (q.projectCode)        qb.andWhere('s.projectCode        = :pc',  { pc:  q.projectCode });
    if (q.poNo)               qb.andWhere('s.poNo               = :pn',  { pn:  q.poNo });
    if (q.shipmentType)       qb.andWhere('s.shipmentType       = :st',  { st:  q.shipmentType });
    if (q.status)             qb.andWhere('s.status             = :s',   { s:   q.status });
    if (q.customsStatus)      qb.andWhere('s.customsStatus      = :cs',  { cs:  q.customsStatus });
    if (q.originCountry)      qb.andWhere('s.originCountry      = :oc',  { oc:  q.originCountry });
    if (q.destinationCountry) qb.andWhere('s.destinationCountry = :dc',  { dc:  q.destinationCountry });
    if (q.departureDateFrom)  qb.andWhere('s.departureDate     >= :ddf', { ddf: q.departureDateFrom });
    if (q.departureDateTo)    qb.andWhere('s.departureDate     <= :ddt', { ddt: q.departureDateTo });
    if (q.arrivalDateFrom)    qb.andWhere('s.arrivalDate       >= :adf', { adf: q.arrivalDateFrom });
    if (q.arrivalDateTo)      qb.andWhere('s.arrivalDate       <= :adt', { adt: q.arrivalDateTo });
    if (q.keyword)            qb.andWhere(
      '(s.shipmentNo ILIKE :kw OR s.poNo ILIKE :kw OR s.trackingNo ILIKE :kw OR s.carrierName ILIKE :kw)',
      { kw: `%${q.keyword}%` },
    );

    // ── RBAC-2 数据范围过滤 ──────────────────────────────────────────────────
    this.scopeHelper.applyToQb(qb, { alias: 's' });
    // ────────────────────────────────────────────────────────────────────────

    const [items, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items, total, page, pageSize };
  }

  // ── 详情 ──────────────────────────────────────────────────────────────────

  async findById(id: string) {
    const shp = await this.shpRepo.findOne({ where: { id } });
    if (!shp) throw new NotFoundException(`运单 ID=${id} 不存在`);

    // ── RBAC-2.5 详情归属校验 ────────────────────────────────────────────────
    this.scopeHelper.assertOwnership(
      { companyCode: shp.companyCode, projectCode: shp.projectCode },
      'Shipment',
    );
    // ─────────────────────────────────────────────────────────────────────────

    const receipts = await this.rcpRepo.find({ where: { shipmentId: id }, order: { id: 'ASC' } });
    return { ...shp, receipts };
  }

  // ── 创建 ──────────────────────────────────────────────────────────────────

  async create(dto: CreateShipmentDto) {
    return this.ds.transaction(async mgr => {
      const prefix = `SHP2-${format(new Date(), 'yyyyMMdd')}-`;
      const shipmentNo = await genNo(mgr, prefix, Prc2ShipmentEntity as never, 's', 'shipmentNo');

      const shp = mgr.create(Prc2ShipmentEntity, {
        shipmentNo,
        poId:                dto.poId,
        poNo:                dto.poNo,
        companyId:           dto.companyId,
        companyCode:         dto.companyCode,
        companyName:         dto.companyName,
        projectId:           dto.projectId,
        projectCode:         dto.projectCode,
        projectName:         dto.projectName,
        shipmentType:        dto.shipmentType,
        carrierName:         dto.carrierName,
        trackingNo:          dto.trackingNo,
        originCountry:       dto.originCountry,
        originAddress:       dto.originAddress,
        destinationCountry:  dto.destinationCountry,
        destinationAddress:  dto.destinationAddress,
        customsRequired:     dto.customsRequired ?? false,
        customsStatus:       dto.customsStatus,
        customsDeclNo:       dto.customsDeclNo,
        departureDate:       dto.departureDate,
        arrivalDate:         dto.arrivalDate,
        freightAmount:       dto.freightAmount,
        freightCurrency:     dto.freightCurrency,
        customsDuty:         dto.customsDuty,
        customsCurrency:     dto.customsCurrency,
        remark:              dto.remark,
        status:              'DRAFT',
        createdBy:           this.userId(),
      });

      return mgr.save(Prc2ShipmentEntity, shp);
    });
  }

  // ── 更新（仅 DRAFT/READY） ─────────────────────────────────────────────────

  async update(id: string, dto: UpdateShipmentDto) {
    return this.ds.transaction(async mgr => {
      const shp = await mgr.findOne(Prc2ShipmentEntity, { where: { id } });
      if (!shp) throw new NotFoundException(`运单 ID=${id} 不存在`);
      if (!['DRAFT', 'READY'].includes(shp.status))
        throw new ConflictException(`当前状态 ${shp.status} 不允许编辑`);

      if (dto.poId               !== undefined) shp.poId               = dto.poId;
      if (dto.poNo               !== undefined) shp.poNo               = dto.poNo;
      if (dto.companyId          !== undefined) shp.companyId          = dto.companyId;
      if (dto.companyCode        !== undefined) shp.companyCode        = dto.companyCode;
      if (dto.companyName        !== undefined) shp.companyName        = dto.companyName;
      if (dto.projectId          !== undefined) shp.projectId          = dto.projectId;
      if (dto.projectCode        !== undefined) shp.projectCode        = dto.projectCode;
      if (dto.projectName        !== undefined) shp.projectName        = dto.projectName;
      if (dto.shipmentType       !== undefined) shp.shipmentType       = dto.shipmentType;
      if (dto.carrierName        !== undefined) shp.carrierName        = dto.carrierName;
      if (dto.trackingNo         !== undefined) shp.trackingNo         = dto.trackingNo;
      if (dto.originCountry      !== undefined) shp.originCountry      = dto.originCountry;
      if (dto.originAddress      !== undefined) shp.originAddress      = dto.originAddress;
      if (dto.destinationCountry !== undefined) shp.destinationCountry = dto.destinationCountry;
      if (dto.destinationAddress !== undefined) shp.destinationAddress = dto.destinationAddress;
      if (dto.customsRequired    !== undefined) shp.customsRequired    = dto.customsRequired;
      if (dto.customsStatus      !== undefined) shp.customsStatus      = dto.customsStatus;
      if (dto.customsDeclNo      !== undefined) shp.customsDeclNo      = dto.customsDeclNo;
      if (dto.departureDate      !== undefined) shp.departureDate      = dto.departureDate;
      if (dto.arrivalDate        !== undefined) shp.arrivalDate        = dto.arrivalDate;
      if (dto.freightAmount      !== undefined) shp.freightAmount      = dto.freightAmount;
      if (dto.freightCurrency    !== undefined) shp.freightCurrency    = dto.freightCurrency;
      if (dto.customsDuty        !== undefined) shp.customsDuty        = dto.customsDuty;
      if (dto.customsCurrency    !== undefined) shp.customsCurrency    = dto.customsCurrency;
      if (dto.remark             !== undefined) shp.remark             = dto.remark;

      return mgr.save(Prc2ShipmentEntity, shp);
    });
  }

  // ── DRAFT → READY ─────────────────────────────────────────────────────────

  async ready(id: string, dto: { comment?: string }) {
    return this.ds.transaction(async mgr => {
      const shp = await mgr.findOne(Prc2ShipmentEntity, { where: { id } });
      if (!shp) throw new NotFoundException(`运单 ID=${id} 不存在`);
      if (shp.status !== 'DRAFT') throw new ConflictException(`当前状态 ${shp.status} 不允许备货`);
      shp.status = 'READY';
      await mgr.save(Prc2ShipmentEntity, shp);
      await this.writeLog(mgr, { bizType: 'SHIPMENT', bizId: id, bizNo: shp.shipmentNo, node: 'READY', action: 'READY', comment: dto.comment });
      return shp;
    });
  }

  // ── READY → IN_TRANSIT ────────────────────────────────────────────────────

  async dispatch(id: string, dto: { comment?: string }) {
    return this.ds.transaction(async mgr => {
      const shp = await mgr.findOne(Prc2ShipmentEntity, { where: { id } });
      if (!shp) throw new NotFoundException(`运单 ID=${id} 不存在`);
      if (shp.status !== 'READY') throw new ConflictException(`当前状态 ${shp.status} 不允许发运`);
      shp.status = 'IN_TRANSIT';
      if (!shp.departureDate) shp.departureDate = format(new Date(), 'yyyy-MM-dd');
      await mgr.save(Prc2ShipmentEntity, shp);
      await this.writeLog(mgr, { bizType: 'SHIPMENT', bizId: id, bizNo: shp.shipmentNo, node: 'DISPATCH', action: 'DISPATCH', comment: dto.comment });
      return shp;
    });
  }

  // ── IN_TRANSIT → CUSTOMS_CLEARING ─────────────────────────────────────────

  async customs(id: string, dto: CustomsShipmentDto) {
    return this.ds.transaction(async mgr => {
      const shp = await mgr.findOne(Prc2ShipmentEntity, { where: { id } });
      if (!shp) throw new NotFoundException(`运单 ID=${id} 不存在`);
      if (shp.status !== 'IN_TRANSIT') throw new ConflictException(`当前状态 ${shp.status} 不允许进入报关`);
      shp.status        = 'CUSTOMS_CLEARING';
      shp.customsStatus = 'CLEARING';
      if (dto.customsDeclNo) shp.customsDeclNo = dto.customsDeclNo;
      await mgr.save(Prc2ShipmentEntity, shp);
      await this.writeLog(mgr, { bizType: 'SHIPMENT', bizId: id, bizNo: shp.shipmentNo, node: 'CUSTOMS', action: 'CUSTOMS', comment: dto.comment });
      return shp;
    });
  }

  // ── CUSTOMS_CLEARING / IN_TRANSIT → ARRIVED ───────────────────────────────

  async arrive(id: string, dto: ArriveShipmentDto) {
    return this.ds.transaction(async mgr => {
      const shp = await mgr.findOne(Prc2ShipmentEntity, { where: { id } });
      if (!shp) throw new NotFoundException(`运单 ID=${id} 不存在`);
      if (!['CUSTOMS_CLEARING', 'IN_TRANSIT'].includes(shp.status))
        throw new ConflictException(`当前状态 ${shp.status} 不允许到货`);
      shp.status       = 'ARRIVED';
      shp.customsStatus = shp.customsRequired ? 'CLEARED' : shp.customsStatus;
      if (dto.actualArrivalDate) shp.arrivalDate = dto.actualArrivalDate;
      else if (!shp.arrivalDate) shp.arrivalDate = format(new Date(), 'yyyy-MM-dd');
      await mgr.save(Prc2ShipmentEntity, shp);
      await this.writeLog(mgr, { bizType: 'SHIPMENT', bizId: id, bizNo: shp.shipmentNo, node: 'ARRIVE', action: 'ARRIVE', comment: dto.comment });
      return shp;
    });
  }

  // ── DRAFT/READY → CANCELLED ───────────────────────────────────────────────

  async cancel(id: string, dto: { comment?: string }) {
    return this.ds.transaction(async mgr => {
      const shp = await mgr.findOne(Prc2ShipmentEntity, { where: { id } });
      if (!shp) throw new NotFoundException(`运单 ID=${id} 不存在`);
      if (!['DRAFT', 'READY'].includes(shp.status))
        throw new ConflictException(`当前状态 ${shp.status} 不允许取消`);
      shp.status = 'CANCELLED';
      await mgr.save(Prc2ShipmentEntity, shp);
      await this.writeLog(mgr, { bizType: 'SHIPMENT', bizId: id, bizNo: shp.shipmentNo, node: 'CANCEL', action: 'CANCEL', comment: dto.comment });
      return shp;
    });
  }
}
