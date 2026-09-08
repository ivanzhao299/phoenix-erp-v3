import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeHelper } from '../../org/helpers/data-scope.helper';
import { format } from 'date-fns';
import { ApprovalEngineService } from '../../approval-engine/approval-engine.service';

import { Prc2PurchaseRequestEntity } from '../entities/prc2-purchase-request.entity';
import { Prc2RequestItemEntity }     from '../entities/prc2-request-item.entity';
import { Prc2ApprovalEntity }        from '../entities/prc2-approval.entity';

import { CreatePurchaseRequestDto }  from '../dto/create-purchase-request.dto';
import { UpdatePurchaseRequestDto }  from '../dto/update-purchase-request.dto';
import { QueryPurchaseRequestDto }   from '../dto/query-purchase-request.dto';
import { SubmitPurchaseRequestDto }  from '../dto/submit-purchase-request.dto';
import { ApprovePurchaseRequestDto } from '../dto/approve-purchase-request.dto';
import { RejectPurchaseRequestDto }  from '../dto/reject-purchase-request.dto';
import { CancelPurchaseRequestDto }  from '../dto/cancel-purchase-request.dto';

/** PR 状态枚举（仅内部使用） */
const STATUS = {
  DRAFT:            'DRAFT',
  SUBMITTED:        'SUBMITTED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED:         'APPROVED',
  REJECTED:         'REJECTED',
  CANCELLED:        'CANCELLED',
  CONVERTED:        'CONVERTED',
} as const;

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(Prc2PurchaseRequestEntity)
    private readonly reqRepo: Repository<Prc2PurchaseRequestEntity>,
    @InjectRepository(Prc2RequestItemEntity)
    private readonly itemRepo: Repository<Prc2RequestItemEntity>,
    @InjectRepository(Prc2ApprovalEntity)
    private readonly approvalRepo: Repository<Prc2ApprovalEntity>,
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly scopeHelper: DataScopeHelper,
    private readonly approvalEngine: ApprovalEngineService,
  ) {}

  // ── 内部工具 ─────────────────────────────────────────────────────────

  private getUser(): { userId: string; userName: string } {
    const user = this.cls.get('user') as Record<string, unknown> | undefined;
    const userId   = String(user?.userId ?? user?.id ?? '0');
    const userName = String(user?.name   ?? user?.username ?? '');
    return { userId, userName };
  }

  /**
   * 生成 req_no：PR2-YYYYMMDD-00001
   * 在事务内用 advisory lock + SELECT MAX 保证并发安全
   */
  private async generateReqNo(mgr: EntityManager): Promise<string> {
    const today   = format(new Date(), 'yyyyMMdd');
    const prefix  = `PR2-${today}-`;

    // 用 PostgreSQL advisory lock 防并发重复（锁 key = hash of prefix）
    await mgr.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);

    const row = await mgr
      .createQueryBuilder(Prc2PurchaseRequestEntity, 'r')
      .select('MAX(r.reqNo)', 'max')
      .where('r.reqNo LIKE :p', { p: `${prefix}%` })
      .getRawOne<{ max: string | null }>();

    let seq = 1;
    if (row?.max) {
      const last = parseInt(row.max.slice(prefix.length), 10);
      if (!isNaN(last)) seq = last + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  /** 写审批日志（在当前事务管理器内执行） */
  private async writeApprovalLog(
    mgr: EntityManager,
    opts: {
      bizId:    string;
      bizNo:    string;
      node:     string;
      action:   string;
      comment?: string;
      userId:   string;
      userName: string;
    },
  ): Promise<void> {
    const log = mgr.create(Prc2ApprovalEntity, {
      bizType:      'PR',
      bizId:        opts.bizId,
      bizNo:        opts.bizNo,
      approvalNode: opts.node,
      action:       opts.action,
      comment:      opts.comment,
      approverId:   opts.userId,
      approverName: opts.userName,
    });
    await mgr.save(Prc2ApprovalEntity, log);
  }

  // ── 计算明细金额 ──────────────────────────────────────────────────────
  private calcItemAmount(qty: number, unitPrice: number): number {
    return Math.round(qty * unitPrice * 100) / 100;
  }

  // ── 保存明细行（全量替换） ────────────────────────────────────────────
  private async saveItems(
    mgr:      EntityManager,
    reqId:    string,
    reqItems: CreatePurchaseRequestDto['items'],
    defaults: { projectId?: string; projectCode?: string; projectName?: string },
  ): Promise<Prc2RequestItemEntity[]> {
    // 先删旧行
    await mgr.delete(Prc2RequestItemEntity, { requestId: reqId });

    const entities = reqItems.map(it => {
      const unitPrice = it.estimatedUnitPrice ?? 0;
      const amount    = it.estimatedAmount ?? this.calcItemAmount(it.qty, unitPrice);
      return mgr.create(Prc2RequestItemEntity, {
        requestId:          reqId,
        projectId:          it.projectId   ?? defaults.projectId,
        projectCode:        it.projectCode ?? defaults.projectCode,
        projectName:        it.projectName ?? defaults.projectName,
        itemCode:           it.itemCode,
        itemName:           it.itemName,
        spec:               it.spec,
        qty:                it.qty,
        unit:               it.unit,
        estimatedUnitPrice: unitPrice,
        estimatedAmount:    amount,
        warehouseCode:      it.warehouseCode,
        usageDesc:          it.usageDesc,
      });
    });
    return mgr.save(Prc2RequestItemEntity, entities);
  }

  // ── 汇总金额 ──────────────────────────────────────────────────────────
  private sumItems(items: Prc2RequestItemEntity[]): number {
    return items.reduce((s, it) => s + Number(it.estimatedAmount), 0);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────

  /** 分页列表 */
  async list(query: QueryPurchaseRequestDto) {
    const page     = Math.max(1, query.page     ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const skip     = (page - 1) * pageSize;

    const qb = this.reqRepo.createQueryBuilder('r')
      .leftJoin(
        'sys_organizations',
        'company_org',
        `company_org.org_type = 'COMPANY'
         AND COALESCE(company_org.company_code, company_org.org_code) = r.company_code`,
      )
      .leftJoin(
        'biz_projects',
        'project',
        `project.project_code = r.project_code
         AND (project.company_code = r.company_code OR project.company_code IS NULL)`,
      )
      .leftJoin('sys_user', 'requester', 'requester.user_id = r.requester_id')
      .addSelect('COALESCE(company_org.org_name_cn, company_org.org_name, r.company_name, r.company_code)', 'companyDisplayName')
      .addSelect('COALESCE(project.project_name, r.project_name, r.project_code)', 'projectDisplayName')
      .addSelect('requester.real_name', 'requesterRealName')
      .addSelect('requester.username', 'requesterUsername');

    if (query.companyCode)    qb.andWhere('r.companyCode = :cc',     { cc: query.companyCode });
    if (query.projectCode)    qb.andWhere('r.projectCode = :pc',     { pc: query.projectCode });
    if (query.purchaseType)   qb.andWhere('r.purchaseType = :pt',    { pt: query.purchaseType });
    if (query.status)         qb.andWhere('r.status = :st',          { st: query.status });
    if (query.urgency)        qb.andWhere('r.urgency = :ug',         { ug: query.urgency });
    if (query.requesterId)    qb.andWhere('r.requesterId = :rid',    { rid: query.requesterId });
    if (query.deptCode)       qb.andWhere('r.deptCode = :dc',        { dc: query.deptCode });
    if (query.expectedDateFrom) qb.andWhere('r.expectedDate >= :edf', { edf: query.expectedDateFrom });
    if (query.expectedDateTo)   qb.andWhere('r.expectedDate <= :edt', { edt: query.expectedDateTo });
    if (query.keyword) {
      qb.andWhere(
        '(r.reqNo ILIKE :kw OR r.subject ILIKE :kw OR r.requesterName ILIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }

    // ── RBAC-2 数据范围过滤 ──────────────────────────────────────────────────
    this.scopeHelper.applyToQb(qb, { alias: 'r' });
    // ────────────────────────────────────────────────────────────────────────

    const { entities: items, raw } = await qb
      .orderBy('r.createdAt', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .skip(skip)
      .take(pageSize)
      .getRawAndEntities();
    const total = await qb.getCount();

    // 附带每条 PR 的明细行数
    const ids = items.map(r => r.id);
    let itemCountMap: Record<string, number> = {};
    if (ids.length > 0) {
      const counts = await this.itemRepo
        .createQueryBuilder('i')
        .select('i.requestId', 'reqId')
        .addSelect('COUNT(*)', 'cnt')
        .where('i.requestId IN (:...ids)', { ids })
        .groupBy('i.requestId')
        .getRawMany<{ reqId: string; cnt: string }>();
      itemCountMap = Object.fromEntries(counts.map(c => [c.reqId, parseInt(c.cnt, 10)]));
    }

    const displayById = new Map(raw.map(row => [String(row.r_id), row]));
    const result = items.map(r => {
      const display = displayById.get(r.id) ?? {};
      return {
        ...r,
        companyDisplayName: display.companyDisplayName ?? r.companyName ?? r.companyCode,
        projectDisplayName: display.projectDisplayName ?? r.projectName ?? r.projectCode,
        requesterRealName: display.requesterRealName ?? null,
        requesterUsername: display.requesterUsername ?? null,
        itemCount: itemCountMap[r.id] ?? 0,
      };
    });
    return { items: result, total, page, pageSize };
  }

  /** 详情（含明细行 + 审批日志） */
  async findById(id: string) {
    const detailQb = this.reqRepo.createQueryBuilder('r')
      .leftJoin(
        'sys_organizations',
        'company_org',
        `company_org.org_type = 'COMPANY'
         AND COALESCE(company_org.company_code, company_org.org_code) = r.company_code`,
      )
      .leftJoin(
        'biz_projects',
        'project',
        `project.project_code = r.project_code
         AND (project.company_code = r.company_code OR project.company_code IS NULL)`,
      )
      .leftJoin('sys_user', 'requester', 'requester.user_id = r.requester_id')
      .addSelect('COALESCE(company_org.org_name_cn, company_org.org_name, r.company_name, r.company_code)', 'companyDisplayName')
      .addSelect('COALESCE(project.project_name, r.project_name, r.project_code)', 'projectDisplayName')
      .addSelect('requester.real_name', 'requesterRealName')
      .addSelect('requester.username', 'requesterUsername')
      .where('r.id = :id', { id });
    const { entities: detailEntities, raw: detailRaw } = await detailQb.getRawAndEntities();
    const req = detailEntities[0];
    if (!req) throw new NotFoundException(`采购申请 ID=${id} 不存在`);

    // ── RBAC-2.5 详情归属校验 ────────────────────────────────────────────────
    this.scopeHelper.assertOwnership(
      { companyCode: req.companyCode, projectCode: req.projectCode },
      'PR',
    );
    // ─────────────────────────────────────────────────────────────────────────

    const [items, approvals] = await Promise.all([
      this.itemRepo.find({ where: { requestId: id }, order: { createdAt: 'ASC' } }),
      this.approvalRepo.find({ where: { bizType: 'PR', bizId: id }, order: { createdAt: 'ASC' } }),
    ]);

    const itemCodes = [...new Set(items.map(i => i.itemCode).filter(Boolean))];
    const names: any[] = itemCodes.length ? await this.ds.query(
      `SELECT material_code AS item_code, material_name, material_name_en, material_name_lo
         FROM mst_materials WHERE material_code = ANY($1::text[])`, [itemCodes],
    ) : [];
    const nameMap = new Map(names.map(r => [r.item_code, r]));
    const display = detailRaw[0] ?? {};
    return {
      ...req,
      companyDisplayName: display.companyDisplayName ?? req.companyName ?? req.companyCode,
      projectDisplayName: display.projectDisplayName ?? req.projectName ?? req.projectCode,
      requesterRealName: display.requesterRealName ?? null,
      requesterUsername: display.requesterUsername ?? null,
      items: items.map(i => ({ ...i, ...nameMap.get(i.itemCode) })),
      approvals,
    };
  }

  /** 新建（DRAFT） */
  async create(dto: CreatePurchaseRequestDto) {
    return this.ds.transaction(async mgr => {
      const { userId, userName } = this.getUser();
      this.scopeHelper.assertWritableOwnership(
        { companyCode: dto.companyCode, projectCode: dto.projectCode },
        '采购申请',
      );

      const reqNo = await this.generateReqNo(mgr);

      const entity = mgr.create(Prc2PurchaseRequestEntity, {
        reqNo,
        subject:       dto.subject,
        companyId:     dto.companyId,
        companyCode:   dto.companyCode,
        companyName:   dto.companyName,
        projectId:     dto.projectId,
        projectCode:   dto.projectCode,
        projectName:   dto.projectName,
        purchaseType:  dto.purchaseType,
        urgency:       dto.urgency ?? 'NORMAL',
        currencyCode:  dto.currencyCode ?? 'LAK',
        deptCode:      dto.deptCode,
        expectedDate:  dto.expectedDate,
        reason:        dto.reason,
        attachmentUrl: dto.attachmentUrl,
        remark:        dto.remark,
        requesterId:   userId,
        requesterName: userName,
        status:        STATUS.DRAFT,
        createdBy:     userId,
      });

      const saved = await mgr.save(Prc2PurchaseRequestEntity, entity);

      const savedItems = await this.saveItems(mgr, saved.id, dto.items, {
        projectId:   dto.projectId,
        projectCode: dto.projectCode,
        projectName: dto.projectName,
      });

      // 回写汇总金额
      saved.estimatedAmount = this.sumItems(savedItems);
      await mgr.save(Prc2PurchaseRequestEntity, saved);

      return { ...saved, items: savedItems };
    });
  }

  /** 更新（仅 DRAFT） */
  async update(id: string, dto: UpdatePurchaseRequestDto) {
    return this.ds.transaction(async mgr => {
      const req = await mgr.findOne(Prc2PurchaseRequestEntity, { where: { id } });
      if (!req) throw new NotFoundException(`采购申请 ID=${id} 不存在`);
      this.scopeHelper.assertWritableOwnership(
        { companyCode: req.companyCode, projectCode: req.projectCode },
        '采购申请',
      );
      if (req.status !== STATUS.DRAFT) {
        throw new ConflictException(`只有草稿状态的申请才能编辑（当前状态：${req.status}）`);
      }

      if (dto.subject       !== undefined) req.subject       = dto.subject;
      if (dto.projectId     !== undefined) req.projectId     = dto.projectId;
      if (dto.projectCode   !== undefined) req.projectCode   = dto.projectCode;
      if (dto.projectName   !== undefined) req.projectName   = dto.projectName;
      if (dto.purchaseType  !== undefined) req.purchaseType  = dto.purchaseType;
      if (dto.urgency       !== undefined) req.urgency       = dto.urgency;
      if (dto.currencyCode  !== undefined) req.currencyCode  = dto.currencyCode;
      if (dto.deptCode      !== undefined) req.deptCode      = dto.deptCode;
      if (dto.expectedDate  !== undefined) req.expectedDate  = dto.expectedDate;
      if (dto.reason        !== undefined) req.reason        = dto.reason;
      if (dto.attachmentUrl !== undefined) req.attachmentUrl = dto.attachmentUrl;
      if (dto.remark        !== undefined) req.remark        = dto.remark;

      this.scopeHelper.assertWritableOwnership(
        { companyCode: req.companyCode, projectCode: req.projectCode },
        '采购申请',
      );

      let savedItems: Prc2RequestItemEntity[] | null = null;
      if (dto.items !== undefined) {
        savedItems = await this.saveItems(mgr, id, dto.items, {
          projectId:   req.projectId,
          projectCode: req.projectCode,
          projectName: req.projectName,
        });
        req.estimatedAmount = this.sumItems(savedItems);
      }

      const saved = await mgr.save(Prc2PurchaseRequestEntity, req);

      if (savedItems === null) {
        savedItems = await mgr.find(Prc2RequestItemEntity, { where: { requestId: id } });
      }
      return { ...saved, items: savedItems };
    });
  }

  /** 提交审批（DRAFT → SUBMITTED） */
  async submit(id: string, dto: SubmitPurchaseRequestDto) {
    return this.ds.transaction(async mgr => {
      const req = await mgr.findOne(Prc2PurchaseRequestEntity, { where: { id } });
      if (!req) throw new NotFoundException(`采购申请 ID=${id} 不存在`);
      this.scopeHelper.assertWritableOwnership(
        { companyCode: req.companyCode, projectCode: req.projectCode },
        '采购申请',
      );
      if (req.status !== STATUS.DRAFT) {
        throw new ConflictException(`只有草稿状态才可提交（当前状态：${req.status}）`);
      }

      // 检查是否有明细行
      const itemCount = await mgr.count(Prc2RequestItemEntity, { where: { requestId: id } });
      if (itemCount === 0) {
        throw new BadRequestException('采购申请至少需要一条明细行才能提交');
      }

      // ── 启动审批引擎 ────────────────────────────────────────────
      req.status = STATUS.PENDING_APPROVAL;
      const saved = await mgr.save(Prc2PurchaseRequestEntity, req);

      await this.approvalEngine.startApproval({
        moduleCode:   'MENU_PRC2_REQUEST',
        bizType:      'PR',
        bizId:        id,
        bizNo:        req.reqNo,
        amount:       Number(req.estimatedAmount ?? 0),
        currencyCode: req.currencyCode,
        companyCode:  req.companyCode,
        companyName:  req.companyName,
        projectCode:  req.projectCode,
        subject:      req.subject,
        pickedApproverId: dto.approverUserId,
      }, mgr);
      // ─────────────────────────────────────────────────────────────

      const { userId, userName } = this.getUser();
      await this.writeApprovalLog(mgr, {
        bizId:    id,
        bizNo:    req.reqNo,
        node:     'SUBMIT',
        action:   'SUBMIT',
        comment:  dto.comment,
        userId,
        userName,
      });

      return saved;
    });
  }

  /** 批准（SUBMITTED / PENDING_APPROVAL → APPROVED）
   * @deprecated 请使用 /api/approval/instances/:id/approve 接口
   */
  async approve(id: string, dto: ApprovePurchaseRequestDto) {
    return this.ds.transaction(async mgr => {
      const req = await mgr.findOne(Prc2PurchaseRequestEntity, { where: { id } });
      if (!req) throw new NotFoundException(`采购申请 ID=${id} 不存在`);
      this.scopeHelper.assertWritableOwnership(
        { companyCode: req.companyCode, projectCode: req.projectCode },
        '采购申请',
      );
      if (![STATUS.SUBMITTED, STATUS.PENDING_APPROVAL].includes(req.status as any)) {
        throw new ConflictException(`只有已提交的申请才可批准（当前状态：${req.status}）`);
      }

      req.status = STATUS.APPROVED;
      const saved = await mgr.save(Prc2PurchaseRequestEntity, req);

      const { userId, userName } = this.getUser();
      await this.writeApprovalLog(mgr, {
        bizId:    id,
        bizNo:    req.reqNo,
        node:     'APPROVE',
        action:   'APPROVE',
        comment:  dto.comment,
        userId,
        userName,
      });

      return saved;
    });
  }

  /** 拒绝（SUBMITTED / PENDING_APPROVAL → REJECTED）
   * @deprecated 请使用 /api/approval/instances/:id/reject 接口
   */
  async reject(id: string, dto: RejectPurchaseRequestDto) {
    return this.ds.transaction(async mgr => {
      const req = await mgr.findOne(Prc2PurchaseRequestEntity, { where: { id } });
      if (!req) throw new NotFoundException(`采购申请 ID=${id} 不存在`);
      this.scopeHelper.assertWritableOwnership(
        { companyCode: req.companyCode, projectCode: req.projectCode },
        '采购申请',
      );
      if (![STATUS.SUBMITTED, STATUS.PENDING_APPROVAL].includes(req.status as any)) {
        throw new ConflictException(`只有已提交的申请才可拒绝（当前状态：${req.status}）`);
      }

      req.status = STATUS.REJECTED;
      const saved = await mgr.save(Prc2PurchaseRequestEntity, req);

      const { userId, userName } = this.getUser();
      await this.writeApprovalLog(mgr, {
        bizId:    id,
        bizNo:    req.reqNo,
        node:     'APPROVE',
        action:   'REJECT',
        comment:  dto.comment,
        userId,
        userName,
      });

      return saved;
    });
  }

  /** 取消（DRAFT 或 SUBMITTED / PENDING_APPROVAL → CANCELLED） */
  async cancel(id: string, dto: CancelPurchaseRequestDto) {
    return this.ds.transaction(async mgr => {
      const req = await mgr.findOne(Prc2PurchaseRequestEntity, { where: { id } });
      if (!req) throw new NotFoundException(`采购申请 ID=${id} 不存在`);
      this.scopeHelper.assertWritableOwnership(
        { companyCode: req.companyCode, projectCode: req.projectCode },
        '采购申请',
      );

      const cancellable = [STATUS.DRAFT, STATUS.SUBMITTED, STATUS.PENDING_APPROVAL];
      if (!cancellable.includes(req.status as typeof cancellable[number])) {
        throw new ConflictException(
          `当前状态 [${req.status}] 不允许取消，只有草稿/已提交/待审批状态可取消`,
        );
      }

      req.status = STATUS.CANCELLED;
      const saved = await mgr.save(Prc2PurchaseRequestEntity, req);

      const { userId, userName } = this.getUser();
      await this.writeApprovalLog(mgr, {
        bizId:    id,
        bizNo:    req.reqNo,
        node:     'CANCEL',
        action:   'CANCEL',
        comment:  dto.comment,
        userId,
        userName,
      });

      return saved;
    });
  }

  /** 审批日志列表 */
  async getApprovals(id: string) {
    const req = await this.reqRepo.findOne({ where: { id } });
    if (!req) throw new NotFoundException(`采购申请 ID=${id} 不存在`);
    this.scopeHelper.assertOwnership(
      { companyCode: req.companyCode, projectCode: req.projectCode },
      '采购申请',
    );
    return this.approvalRepo.find({
      where: { bizType: 'PR', bizId: id },
      order: { createdAt: 'ASC' },
    });
  }
}
