import {
  Injectable, NotFoundException, ConflictException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeHelper } from '../../org/helpers/data-scope.helper';
import { format } from 'date-fns';
import { ApprovalEngineService } from '../../approval-engine/approval-engine.service';

import { Prc2PurchaseOrderEntity }  from '../entities/prc2-purchase-order.entity';
import { Prc2OrderItemEntity }       from '../entities/prc2-order-item.entity';
import { Prc2PurchaseRequestEntity } from '../entities/prc2-purchase-request.entity';
import { Prc2RequestItemEntity }     from '../entities/prc2-request-item.entity';
import { Prc2ApLedgerEntity }        from '../entities/prc2-ap-ledger.entity';
import { Prc2ApprovalEntity }        from '../entities/prc2-approval.entity';

import { CreatePurchaseOrderDto }         from '../dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto }         from '../dto/update-purchase-order.dto';
import { QueryPurchaseOrderDto }          from '../dto/query-purchase-order.dto';
import { SubmitPurchaseOrderDto }         from '../dto/submit-purchase-order.dto';
import { ApprovePurchaseOrderDto }        from '../dto/approve-purchase-order.dto';
import { RejectPurchaseOrderDto }         from '../dto/reject-purchase-order.dto';
import { CancelPurchaseOrderDto }         from '../dto/cancel-purchase-order.dto';
import { ConvertRequestToOrderDto }       from '../dto/convert-request-to-order.dto';
import { PurchaseOrderItemDto }           from '../dto/purchase-order-item.dto';

const logger = new Logger('OrdersService');

/** PO 状态 */
const PO_STATUS = {
  DRAFT:            'DRAFT',
  SUBMITTED:        'SUBMITTED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED:         'APPROVED',
  REJECTED:         'REJECTED',
  CANCELLED:        'CANCELLED',
} as const;

/** 审批状态 */
const APPROVAL_STATUS = {
  NONE:      'NONE',
  PENDING:   'PENDING',
  APPROVED:  'APPROVED',
  REJECTED:  'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Prc2PurchaseOrderEntity)
    private readonly poRepo: Repository<Prc2PurchaseOrderEntity>,
    @InjectRepository(Prc2OrderItemEntity)
    private readonly itemRepo: Repository<Prc2OrderItemEntity>,
    @InjectRepository(Prc2PurchaseRequestEntity)
    private readonly reqRepo: Repository<Prc2PurchaseRequestEntity>,
    @InjectRepository(Prc2RequestItemEntity)
    private readonly reqItemRepo: Repository<Prc2RequestItemEntity>,
    @InjectRepository(Prc2ApLedgerEntity)
    private readonly apRepo: Repository<Prc2ApLedgerEntity>,
    @InjectRepository(Prc2ApprovalEntity)
    private readonly approvalRepo: Repository<Prc2ApprovalEntity>,
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly scopeHelper: DataScopeHelper,
    private readonly approvalEngine: ApprovalEngineService,
  ) {}

  // ── 内部工具 ─────────────────────────────────────────────────────────────

  private getUser() {
    const user = this.cls.get('user') as Record<string, unknown> | undefined;
    return {
      userId:   String(user?.userId ?? user?.id ?? '0'),
      userName: String(user?.name   ?? user?.username ?? ''),
    };
  }

  /**
   * 生成 po_no：PO2-YYYYMMDD-00001
   * 使用 pg_advisory_xact_lock 防并发
   */
  private async generatePoNo(mgr: EntityManager): Promise<string> {
    const today  = format(new Date(), 'yyyyMMdd');
    const prefix = `PO2-${today}-`;
    await mgr.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
    const row = await mgr
      .createQueryBuilder(Prc2PurchaseOrderEntity, 'p')
      .select('MAX(p.poNo)', 'max')
      .where('p.poNo LIKE :p', { p: `${prefix}%` })
      .getRawOne<{ max: string | null }>();
    let seq = 1;
    if (row?.max) {
      const last = parseInt(row.max.slice(prefix.length), 10);
      if (!isNaN(last)) seq = last + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  /**
   * 生成 ap_no：AP2-YYYYMMDD-00001
   */
  private async generateApNo(mgr: EntityManager): Promise<string> {
    const today  = format(new Date(), 'yyyyMMdd');
    const prefix = `AP2-${today}-`;
    await mgr.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
    const row = await mgr
      .createQueryBuilder(Prc2ApLedgerEntity, 'a')
      .select('MAX(a.apNo)', 'max')
      .where('a.apNo LIKE :p', { p: `${prefix}%` })
      .getRawOne<{ max: string | null }>();
    let seq = 1;
    if (row?.max) {
      const last = parseInt(row.max.slice(prefix.length), 10);
      if (!isNaN(last)) seq = last + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  /** 写审批日志 */
  private async writeLog(
    mgr: EntityManager,
    opts: {
      bizType: string; bizId: string; bizNo: string;
      node: string; action: string;
      comment?: string; userId: string; userName: string;
    },
  ): Promise<void> {
    await mgr.save(Prc2ApprovalEntity, mgr.create(Prc2ApprovalEntity, {
      bizType:      opts.bizType,
      bizId:        opts.bizId,
      bizNo:        opts.bizNo,
      approvalNode: opts.node,
      action:       opts.action,
      comment:      opts.comment,
      approverId:   opts.userId,
      approverName: opts.userName,
    }));
  }

  /** 保存明细行（全量替换），返回保存后的实体数组 */
  private async saveItems(
    mgr:      EntityManager,
    poId:     string,
    poNo:     string,
    items:    PurchaseOrderItemDto[],
    defaults: { projectId?: string; projectCode?: string; projectName?: string },
  ): Promise<Prc2OrderItemEntity[]> {
    await mgr.delete(Prc2OrderItemEntity, { poId });
    const entities = items.map(it => {
      const amount = it.amount ?? Math.round(it.qty * it.unitPrice * 100) / 100;
      return mgr.create(Prc2OrderItemEntity, {
        poId,
        poNo,
        projectId:   it.projectId   ?? defaults.projectId,
        projectCode: it.projectCode ?? defaults.projectCode,
        projectName: it.projectName ?? defaults.projectName,
        itemCode:    it.itemCode,
        itemName:    it.itemName,
        spec:        it.spec,
        productCode: it.productCode,   // G85-C SKU 带出
        gradeCode:   it.gradeCode,     // G85-C SKU 带出
        qty:         it.qty,
        unit:        it.unit,
        unitPrice:   it.unitPrice,
        amount,
        warehouseCode: it.warehouseCode,
        usageDesc:   it.usageDesc,
      });
    });
    return mgr.save(Prc2OrderItemEntity, entities);
  }

  private sumItems(items: Prc2OrderItemEntity[]) {
    return {
      totalAmount: Math.round(items.reduce((s, i) => s + Number(i.amount), 0) * 100) / 100,
      planQty:     Math.round(items.reduce((s, i) => s + Number(i.qty),    0) * 10000) / 10000,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /** 分页列表 */
  async list(query: QueryPurchaseOrderDto) {
    const page     = Math.max(1, query.page     ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const skip     = (page - 1) * pageSize;

    const qb = this.poRepo.createQueryBuilder('p');

    if (query.companyCode)    qb.andWhere('p.companyCode = :cc',     { cc: query.companyCode });
    if (query.projectCode)    qb.andWhere('p.projectCode = :pc',     { pc: query.projectCode });
    if (query.supplierCode)   qb.andWhere('p.supplierCode = :sc',    { sc: query.supplierCode });
    if (query.purchaseType)   qb.andWhere('p.purchaseType = :pt',    { pt: query.purchaseType });
    if (query.status)         qb.andWhere('p.status = :st',          { st: query.status });
    if (query.approvalStatus) qb.andWhere('p.approvalStatus = :as',  { as: query.approvalStatus });
    if (query.crossBorderFlag !== undefined && query.crossBorderFlag !== '') {
      qb.andWhere('p.crossBorderFlag = :cb', { cb: query.crossBorderFlag === 'true' });
    }
    if (query.expectedDateFrom) qb.andWhere('p.expectedDate >= :edf', { edf: query.expectedDateFrom });
    if (query.expectedDateTo)   qb.andWhere('p.expectedDate <= :edt', { edt: query.expectedDateTo });
    if (query.keyword) {
      qb.andWhere(
        '(p.poNo ILIKE :kw OR p.subject ILIKE :kw OR p.supplierName ILIKE :kw OR p.supplierCode ILIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }

    // ── RBAC-2 数据范围过滤 ──────────────────────────────────────────────────
    this.scopeHelper.applyToQb(qb, { alias: 'p' });
    // ────────────────────────────────────────────────────────────────────────

    const [items, total] = await qb
      .orderBy('p.createdAt', 'DESC')
      .skip(skip)
      .take(pageSize)
      .getManyAndCount();

    // itemCount
    const ids = items.map(p => p.id);
    let countMap: Record<string, number> = {};
    if (ids.length > 0) {
      const rows = await this.itemRepo
        .createQueryBuilder('i')
        .select('i.poId', 'poId')
        .addSelect('COUNT(*)', 'cnt')
        .where('i.poId IN (:...ids)', { ids })
        .groupBy('i.poId')
        .getRawMany<{ poId: string; cnt: string }>();
      countMap = Object.fromEntries(rows.map(r => [r.poId, parseInt(r.cnt, 10)]));
    }

    return {
      items: items.map(p => ({ ...p, itemCount: countMap[p.id] ?? 0 })),
      total,
      page,
      pageSize,
    };
  }

  /** 详情（含明细行 + 审批日志 + AP 摘要） */
  async findById(id: string) {
    const po = await this.poRepo.findOne({ where: { id } });
    if (!po) throw new NotFoundException(`采购订单 ID=${id} 不存在`);

    // ── RBAC-2.5 详情归属校验 ────────────────────────────────────────────────
    this.scopeHelper.assertOwnership(
      { companyCode: po.companyCode, projectCode: po.projectCode },
      'PO',
    );
    // ─────────────────────────────────────────────────────────────────────────

    const [items, approvals, ap] = await Promise.all([
      this.itemRepo.find({ where: { poId: id }, order: { createdAt: 'ASC' } }),
      this.approvalRepo.find({ where: { bizType: 'PO', bizId: id }, order: { createdAt: 'ASC' } }),
      this.apRepo.findOne({ where: { poId: id } }),
    ]);

    return { ...po, items, approvals, apLedger: ap ?? null };
  }

  /** 创建 PO（直接创建） */
  async create(dto: CreatePurchaseOrderDto) {
    return this.ds.transaction(async mgr => {
      const { userId, userName } = this.getUser();
      const poNo = await this.generatePoNo(mgr);

      const po = mgr.create(Prc2PurchaseOrderEntity, {
        poNo,
        subject:            dto.subject,
        companyId:          dto.companyId,
        companyCode:        dto.companyCode,
        companyName:        dto.companyName,
        projectId:          dto.projectId,
        projectCode:        dto.projectCode,
        projectName:        dto.projectName,
        supplierId:         dto.supplierId,
        supplierCode:       dto.supplierCode,
        supplierName:       dto.supplierName,
        purchaseType:       dto.purchaseType,
        currencyCode:       dto.currencyCode ?? 'LAK',
        expectedDate:       dto.expectedDate,
        payDeadline:        dto.payDeadline,
        crossBorderFlag:    dto.crossBorderFlag ?? false,
        originCountry:      dto.originCountry,
        destinationCountry: dto.destinationCountry,
        contractNo:         dto.contractNo || undefined,
        contractUrl:        dto.contractUrl,
        contractNote:       dto.contractNote,
        payTerms:           dto.payTerms,
        remark:             dto.remark,
        status:             PO_STATUS.DRAFT,
        approvalStatus:     APPROVAL_STATUS.NONE,
        createdBy:          userId,
      });

      const saved = await mgr.save(Prc2PurchaseOrderEntity, po);

      const savedItems = await this.saveItems(mgr, saved.id, poNo, dto.items, {
        projectId:   dto.projectId,
        projectCode: dto.projectCode,
        projectName: dto.projectName,
      });

      const { totalAmount, planQty } = this.sumItems(savedItems);
      saved.totalAmount = totalAmount;
      saved.planQty     = planQty;
      await mgr.save(Prc2PurchaseOrderEntity, saved);

      return { ...saved, items: savedItems };
    });
  }

  /** 从 APPROVED PR 转 PO（幂等：同一 PR 只能转���次） */
  async convertFromRequest(reqId: string, dto: ConvertRequestToOrderDto) {
    return this.ds.transaction(async mgr => {
      const { userId, userName } = this.getUser();

      // 查 PR（加行锁防并发）
      const req = await mgr.findOne(Prc2PurchaseRequestEntity, { where: { id: reqId } });
      if (!req) throw new NotFoundException(`采购申请 ID=${reqId} 不存在`);

      if (req.status !== 'APPROVED') {
        throw new ConflictException(
          `只有已���批的申请才可转 PO（当前状态：${req.status}）`,
        );
      }
      // 幂等保护：已转过
      if (req.convertedPoId) {
        throw new ConflictException(
          `该申请已转为 PO：${req.convertedPoNo}，不可重复转换`,
        );
      }

      // 生成 PO 编号
      const poNo = await this.generatePoNo(mgr);

      const po = mgr.create(Prc2PurchaseOrderEntity, {
        poNo,
        sourceRequestId: req.id,
        sourceReqNo:     req.reqNo,
        subject:         req.subject,
        companyId:       req.companyId,
        companyCode:     req.companyCode,
        companyName:     req.companyName,
        projectId:       req.projectId,
        projectCode:     req.projectCode,
        projectName:     req.projectName,
        supplierId:      dto.supplierId,
        supplierCode:    dto.supplierCode,
        supplierName:    dto.supplierName,
        purchaseType:    req.purchaseType,
        currencyCode:    req.currencyCode ?? 'LAK',
        expectedDate:    dto.expectedDate,
        payDeadline:     dto.payDeadline,
        crossBorderFlag: dto.crossBorderFlag ?? false,
        originCountry:   dto.originCountry,
        destinationCountry: dto.destinationCountry,
        contractNo:      dto.contractNo || undefined,
        contractUrl:     dto.contractUrl,
        contractNote:    dto.contractNote,
        payTerms:        dto.payTerms,
        remark:          dto.remark,
        status:          PO_STATUS.DRAFT,
        approvalStatus:  APPROVAL_STATUS.NONE,
        createdBy:       userId,
      });

      const savedPo = await mgr.save(Prc2PurchaseOrderEntity, po);

      // 复制 PR 明细为 PO 明细（G96：按明细 id 应用采购员议价后的单价覆盖）
      const reqItems = await mgr.find(Prc2RequestItemEntity, { where: { requestId: reqId } });
      const priceMap = new Map<string, number>(
        (dto.items ?? []).map(i => [String(i.id), Number(i.unitPrice)]),
      );
      const poItemDtos = reqItems.map(ri => {
        const overridden = priceMap.has(String(ri.id));
        const qty = Number(ri.qty);
        const unitPrice = overridden ? Number(priceMap.get(String(ri.id))) : (Number(ri.estimatedUnitPrice) || 0);
        return {
          itemCode:    ri.itemCode,
          itemName:    ri.itemName,
          spec:        ri.spec,
          qty,
          unit:        ri.unit,
          unitPrice,
          amount:      overridden ? qty * unitPrice : (Number(ri.estimatedAmount) || 0),
          warehouseCode: ri.warehouseCode,
          usageDesc:   ri.usageDesc,
          projectId:   ri.projectId   ?? req.projectId,
          projectCode: ri.projectCode ?? req.projectCode,
          projectName: ri.projectName ?? req.projectName,
        };
      });

      const savedItems = poItemDtos.length > 0
        ? await this.saveItems(mgr, savedPo.id, poNo, poItemDtos as PurchaseOrderItemDto[], {
            projectId:   req.projectId,
            projectCode: req.projectCode,
            projectName: req.projectName,
          })
        : [];

      const { totalAmount, planQty } = this.sumItems(savedItems);
      savedPo.totalAmount = totalAmount;
      savedPo.planQty     = planQty;
      await mgr.save(Prc2PurchaseOrderEntity, savedPo);

      // 更新 PR 状态为 CONVERTED
      await mgr.update(Prc2PurchaseRequestEntity, { id: reqId }, {
        status:        'CONVERTED',
        convertedPoId: savedPo.id,
        convertedPoNo: poNo,
      });

      // 写审批日志（PR 侧）
      await this.writeLog(mgr, {
        bizType: 'PR', bizId: reqId, bizNo: req.reqNo,
        node: 'CONVERT', action: 'CONVERT_TO_PO',
        comment: `已转 PO：${poNo}`, userId, userName,
      });

      return { ...savedPo, items: savedItems };
    });
  }

  /** 编辑 PO（仅 DRAFT） */
  async update(id: string, dto: UpdatePurchaseOrderDto) {
    return this.ds.transaction(async mgr => {
      const po = await mgr.findOne(Prc2PurchaseOrderEntity, { where: { id } });
      if (!po) throw new NotFoundException(`采购订单 ID=${id} 不存在`);
      if (po.status !== PO_STATUS.DRAFT) {
        throw new ConflictException(`只有草稿状态的订单才能编辑（当前状态：${po.status}）`);
      }

      if (dto.subject        !== undefined) po.subject        = dto.subject;
      if (dto.projectId      !== undefined) po.projectId      = dto.projectId;
      if (dto.projectCode    !== undefined) po.projectCode    = dto.projectCode;
      if (dto.projectName    !== undefined) po.projectName    = dto.projectName;
      if (dto.supplierId     !== undefined) po.supplierId     = dto.supplierId;
      if (dto.supplierCode   !== undefined) po.supplierCode   = dto.supplierCode;
      if (dto.supplierName   !== undefined) po.supplierName   = dto.supplierName;
      if (dto.purchaseType   !== undefined) po.purchaseType   = dto.purchaseType;
      if (dto.currencyCode   !== undefined) po.currencyCode   = dto.currencyCode;
      if (dto.expectedDate   !== undefined) po.expectedDate   = dto.expectedDate;
      if (dto.payDeadline    !== undefined) po.payDeadline    = dto.payDeadline;
      if (dto.crossBorderFlag !== undefined) po.crossBorderFlag = dto.crossBorderFlag;
      if (dto.originCountry  !== undefined) po.originCountry  = dto.originCountry;
      if (dto.destinationCountry !== undefined) po.destinationCountry = dto.destinationCountry;
      if (dto.contractNo !== undefined) po.contractNo = (dto.contractNo && dto.contractNo.trim()) ? dto.contractNo : (po.contractNo ?? '');
      if (dto.contractUrl    !== undefined) po.contractUrl    = dto.contractUrl;
      if (dto.contractNote   !== undefined) po.contractNote   = dto.contractNote;
      if (dto.payTerms       !== undefined) po.payTerms       = dto.payTerms;
      if (dto.remark         !== undefined) po.remark         = dto.remark;

      let savedItems: Prc2OrderItemEntity[] | null = null;
      if (dto.items !== undefined) {
        savedItems = await this.saveItems(mgr, id, po.poNo, dto.items, {
          projectId:   po.projectId,
          projectCode: po.projectCode,
          projectName: po.projectName,
        });
        const { totalAmount, planQty } = this.sumItems(savedItems);
        po.totalAmount = totalAmount;
        po.planQty     = planQty;
      }

      const saved = await mgr.save(Prc2PurchaseOrderEntity, po);
      if (!savedItems) {
        savedItems = await mgr.find(Prc2OrderItemEntity, { where: { poId: id } });
      }
      return { ...saved, items: savedItems };
    });
  }

  /** 提交审批（DRAFT → SUBMITTED） */
  async submit(id: string, dto: SubmitPurchaseOrderDto) {
    return this.ds.transaction(async mgr => {
      const { userId, userName } = this.getUser();
      const po = await mgr.findOne(Prc2PurchaseOrderEntity, { where: { id } });
      if (!po) throw new NotFoundException(`采购订单 ID=${id} 不存在`);
      if (po.status !== PO_STATUS.DRAFT) {
        throw new ConflictException(`只有草稿状态才可提交（当前状态：${po.status}）`);
      }

      const itemCount = await mgr.count(Prc2OrderItemEntity, { where: { poId: id } });
      if (itemCount === 0) throw new BadRequestException('采购订单至��需要一条明细行才能提交');

      if (Number(po.totalAmount) <= 0) {
        logger.warn(`PO ${po.poNo} total_amount <= 0，允许提交但请核查`);
      }

      // ── 启动审批引擎 ────────────────────────────────────────────
      po.status         = PO_STATUS.PENDING_APPROVAL;
      po.approvalStatus = APPROVAL_STATUS.PENDING;
      const saved = await mgr.save(Prc2PurchaseOrderEntity, po);

      await this.approvalEngine.startApproval({
        moduleCode:   'MENU_PRC2_ORDER',
        bizType:      'PO',
        bizId:        id,
        bizNo:        po.poNo,
        amount:       Number(po.totalAmount ?? 0),
        currencyCode: po.currencyCode,
        companyCode:  po.companyCode,
        companyName:  po.companyName,
        projectCode:  po.projectCode,
        subject:      po.subject,
      }, mgr);
      // ─────────────────────────────────────────────────────────────

      await this.writeLog(mgr, {
        bizType: 'PO', bizId: id, bizNo: po.poNo,
        node: 'SUBMIT', action: 'SUBMIT',
        comment: dto.comment, userId, userName,
      });
      return saved;
    });
  }

  /** 审批通过（SUBMITTED / PENDING_APPROVAL → APPROVED），同时生成 AP 台账
   * @deprecated 请使用 /api/approval/instances/:id/approve 接口
   */
  async approve(id: string, dto: ApprovePurchaseOrderDto) {
    return this.ds.transaction(async mgr => {
      const { userId, userName } = this.getUser();
      const po = await mgr.findOne(Prc2PurchaseOrderEntity, { where: { id } });
      if (!po) throw new NotFoundException(`采购订单 ID=${id} 不存在`);
      if (![PO_STATUS.SUBMITTED, PO_STATUS.PENDING_APPROVAL].includes(po.status as any)) {
        throw new ConflictException(`只有已提交的订单才可审批通过（当前状态：${po.status}）`);
      }

      // 幂等：检查是��已有 AP
      const existAp = await mgr.findOne(Prc2ApLedgerEntity, { where: { poId: id } });
      if (existAp) {
        throw new ConflictException(`该订单已存在 AP 台账（${existAp.apNo}），不可重复审批`);
      }

      po.status         = PO_STATUS.APPROVED;
      po.approvalStatus = APPROVAL_STATUS.APPROVED;
      po.approvedBy     = userId;
      po.approvedAt     = new Date();
      await mgr.save(Prc2PurchaseOrderEntity, po);

      // 写审批日志
      await this.writeLog(mgr, {
        bizType: 'PO', bizId: id, bizNo: po.poNo,
        node: 'APPROVE', action: 'APPROVE',
        comment: dto.comment, userId, userName,
      });

      // 生成 AP 台账
      const apNo = await this.generateApNo(mgr);
      const totalAmt = Number(po.totalAmount);
      const ap = mgr.create(Prc2ApLedgerEntity, {
        apNo,
        poId:            id,
        poNo:            po.poNo,
        supplierId:      po.supplierId,
        supplierCode:    po.supplierCode,
        supplierName:    po.supplierName,
        companyId:       po.companyId,
        companyCode:     po.companyCode,
        companyName:     po.companyName,
        projectId:       po.projectId,
        projectCode:     po.projectCode,
        projectName:     po.projectName,
        currencyCode:    po.currencyCode,
        amountOriginal:         totalAmt,
        paidAmountOriginal:     0,
        balanceAmountOriginal:  totalAmt,
        exchangeRate:           1,
        amountBase:             totalAmt,
        status:                 'OPEN',
        dueDate:                po.payDeadline,
        createdBy:              userId,
      });
      const savedAp = await mgr.save(Prc2ApLedgerEntity, ap);

      return { ...po, apLedger: savedAp };
    });
  }

  /** 审批拒绝（SUBMITTED / PENDING_APPROVAL → REJECTED）
   * @deprecated 请使用 /api/approval/instances/:id/reject 接口
   */
  async reject(id: string, dto: RejectPurchaseOrderDto) {
    return this.ds.transaction(async mgr => {
      const { userId, userName } = this.getUser();
      const po = await mgr.findOne(Prc2PurchaseOrderEntity, { where: { id } });
      if (!po) throw new NotFoundException(`采购订单 ID=${id} 不存在`);
      if (![PO_STATUS.SUBMITTED, PO_STATUS.PENDING_APPROVAL].includes(po.status as any)) {
        throw new ConflictException(`只有已提交的订单才可拒绝（当前状态：${po.status}）`);
      }

      po.status         = PO_STATUS.REJECTED;
      po.approvalStatus = APPROVAL_STATUS.REJECTED;
      await mgr.save(Prc2PurchaseOrderEntity, po);

      await this.writeLog(mgr, {
        bizType: 'PO', bizId: id, bizNo: po.poNo,
        node: 'APPROVE', action: 'REJECT',
        comment: dto.comment, userId, userName,
      });
      return po;
    });
  }

  /** 取消（DRAFT / SUBMITTED → CANCELLED） */
  async cancel(id: string, dto: CancelPurchaseOrderDto) {
    return this.ds.transaction(async mgr => {
      const { userId, userName } = this.getUser();
      const po = await mgr.findOne(Prc2PurchaseOrderEntity, { where: { id } });
      if (!po) throw new NotFoundException(`采购订单 ID=${id} 不存在`);

      const cancellable = [PO_STATUS.DRAFT, PO_STATUS.SUBMITTED, PO_STATUS.PENDING_APPROVAL] as string[];
      if (!cancellable.includes(po.status)) {
        throw new ConflictException(
          `当前状态 [${po.status}] 不允许取消（只有草稿/已提交/待审批可取消）`,
        );
      }

      po.status         = PO_STATUS.CANCELLED;
      po.approvalStatus = APPROVAL_STATUS.CANCELLED;
      await mgr.save(Prc2PurchaseOrderEntity, po);

      await this.writeLog(mgr, {
        bizType: 'PO', bizId: id, bizNo: po.poNo,
        node: 'CANCEL', action: 'CANCEL',
        comment: dto.comment, userId, userName,
      });
      return po;
    });
  }

  /** 审批日志 */
  async getApprovals(id: string) {
    const po = await this.poRepo.findOne({ where: { id } });
    if (!po) throw new NotFoundException(`采购订单 ID=${id} 不存在`);
    return this.approvalRepo.find({
      where: { bizType: 'PO', bizId: id },
      order: { createdAt: 'ASC' },
    });
  }

  /** AP 台账查询 */
  async getApLedger(id: string) {
    const po = await this.poRepo.findOne({ where: { id } });
    if (!po) throw new NotFoundException(`采购订单 ID=${id} 不存在`);
    const ap = await this.apRepo.findOne({ where: { poId: id } });
    return ap ?? null;
  }
}
