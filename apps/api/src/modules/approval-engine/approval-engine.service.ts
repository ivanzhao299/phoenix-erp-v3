import {
  Injectable, ConflictException, NotFoundException, ForbiddenException, BadRequestException, Inject, forwardRef, Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { format } from 'date-fns';

import { WfApprovalRuleEntity }         from './entities/wf-approval-rule.entity';
import { WfApprovalRuleStepEntity }     from './entities/wf-approval-rule-step.entity';
import { WfApprovalInstanceEntity }     from './entities/wf-approval-instance.entity';
import { WfApprovalInstanceStepEntity } from './entities/wf-approval-instance-step.entity';
import { WorkflowBizRegistryService }   from './workflow-biz-registry.service';
import { WorkflowNotificationService }  from '../workflow/workflow-notification.service';
import { AssignmentResolverService, ApproverType } from '../workflow/assignment-resolver.service';
import { ALL_PERM_CODES, hasPerm, PermCode } from '../../auth/permissions.util';

export interface StartApprovalParams {
  moduleCode?: string;
  bizType: string;
  bizId: string;
  bizNo: string;
  amount: number;
  currencyCode?: string;
  companyCode?: string;
  companyName?: string;
  projectCode?: string;
  projectName?: string;
  subject?: string;
  conditionOverrides?: Record<string, any>;
  /** 未固化流程：发起人提交时指定的审批人 userId（开放式选人）。设置后走单步动态实例，不需预配规则。 */
  pickedApproverId?: string;
}

@Injectable()
export class ApprovalEngineService {
  constructor(
    @InjectRepository(WfApprovalRuleEntity)
    private readonly ruleRepo: Repository<WfApprovalRuleEntity>,
    @InjectRepository(WfApprovalRuleStepEntity)
    private readonly ruleStepRepo: Repository<WfApprovalRuleStepEntity>,
    @InjectRepository(WfApprovalInstanceEntity)
    private readonly instanceRepo: Repository<WfApprovalInstanceEntity>,
    @InjectRepository(WfApprovalInstanceStepEntity)
    private readonly stepRepo: Repository<WfApprovalInstanceStepEntity>,
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly bizRegistry: WorkflowBizRegistryService,
    @Inject(forwardRef(() => WorkflowNotificationService))
    private readonly notify: WorkflowNotificationService,
    @Inject(forwardRef(() => AssignmentResolverService))
    private readonly assignmentResolver: AssignmentResolverService,
  ) {}

  // ── 工具 ────────────────────────────────────────────────────────────────

  private currentUser(): { userId: string; userName: string; roles: string[] } {
    const u = this.cls.get('user') as any;
    return {
      userId:   String(u?.userId ?? u?.id ?? '0'),
      userName: String(u?.name ?? u?.username ?? ''),
      roles:    u?.roles ?? (u?.role ? [u.role] : []),
    };
  }

  /**
   * 把第一步审批人摘要存入 CLS（角色中文名 + 持有该角色的人姓名），供响应拦截器注入前端。
   * 角色制审批下"下一审批人"是一个角色 + 可能多人，名字取 sys_user.real_name。
   */
  private async stashApprovalHint(
    approverRole: string | null,
    resolved: { displayName: string }[],
    stepNo: number,
    mgr: EntityManager,
  ): Promise<void> {
    try {
      let roleZh: string | null = null;
      if (approverRole) {
        const r = await mgr.query(
          `SELECT role_name_zh FROM sys_role WHERE role_code = $1 LIMIT 1`,
          [approverRole],
        );
        roleZh = r?.[0]?.role_name_zh ?? approverRole;
      }
      const names = [...new Set(resolved.map((a) => a.displayName).filter(Boolean))];
      this.cls.set('approvalHint', { roleZh, names, stepNo });
    } catch {
      /* 提示性信息，失败不影响主流程 */
    }
  }

  /** 生成实例编号 WF-YYYYMMDD-00001 */
  private async generateInstanceNo(mgr: EntityManager): Promise<string> {
    const today  = format(new Date(), 'yyyyMMdd');
    const prefix = `WF-${today}-`;
    await mgr.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
    const row = await mgr.createQueryBuilder(WfApprovalInstanceEntity, 'i')
      .select('MAX(i.instanceNo)', 'max')
      .where('i.instanceNo LIKE :p', { p: `${prefix}%` })
      .getRawOne<{ max: string | null }>();
    let seq = 1;
    if (row?.max) {
      const last = parseInt(row.max.slice(prefix.length), 10);
      if (!isNaN(last)) seq = last + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  // ── fail-safe 开关 ──────────────────────────────────────────────────────
  /**
   * 是否允许「无规则自动通过」（fail-open）。
   * ⚠ 危险开关：默认 fail-safe（返回 false）——无规则/无步骤时禁止自动批准、禁止提交。
   * 仅当 sys_configs 中 workflow.fail_open_enabled 被显式设为 'true' 时才放行（生产不建议开启）。
   * 配置缺失（未配置）时也必须返回 false（安全默认）。
   */
  private async isFailOpenEnabled(mgr: EntityManager): Promise<boolean> {
    try {
      const rows: Array<{ config_value: string }> = await mgr.query(
        `SELECT config_value FROM sys_configs WHERE config_key = 'workflow.fail_open_enabled' LIMIT 1`,
      );
      return rows?.[0]?.config_value?.trim().toLowerCase() === 'true';
    } catch {
      // 查询异常一律按安全默认处理（fail-safe）
      return false;
    }
  }

  // ── 规则解析 ─────────────────────────────────────────────────────────────

  /**
   * 根据业务类型和金额匹配审批规则
   * 优先级：priority ASC（数值小的先匹配）
   * 金额范围：minAmount <= amount <= maxAmount（maxAmount=null 表示无上限）
   */
  async resolveRule(
    bizType: string,
    amount: number,
    companyCode?: string,
    projectCode?: string,
    _currencyCode?: string,
  ): Promise<WfApprovalRuleEntity | null> {
    const rules = await this.ruleRepo.find({
      where: { bizType, enabled: true },
      order: { priority: 'ASC' },
    });

    for (const rule of rules) {
      // 公司/项目过滤：规则未指定时匹配所有
      if (rule.companyCode && rule.companyCode !== companyCode) continue;
      if (rule.projectCode && rule.projectCode !== projectCode) continue;

      const min = Number(rule.minAmount);
      const max = rule.maxAmount !== null ? Number(rule.maxAmount) : null;

      if (amount >= min && (max === null || amount <= max)) {
        return rule;
      }
    }
    return null;
  }

  // ── 启动审批 ─────────────────────────────────────────────────────────────

  /**
   * 创建审批实例及步骤（在已有事务管理器内执行，保证原子性）
   *
   * 如果没有匹配规则 → 自动将业务状态改为 APPROVED（无需审批）并返回 null
   */
  /** 候选审批人（端点用）：权限 ∩ 数据域过滤，自动排除发起人自己（自审分离） */
  async listEligibleApprovers(query: {
    menuCode: string; requiredPerm?: string; companyCode?: string; projectCode?: string;
  }): Promise<Array<{ userId: string; displayName: string; roleNameZh: string | null }>> {
    const current = this.currentUser();
    const menuCode = String(query.menuCode ?? '').trim();
    if (!menuCode) throw new BadRequestException('menuCode is required');
    if (!this.canQueryApproverCandidates(menuCode)) {
      throw new ForbiddenException('无权查询该业务的审批候选人');
    }
    const { userId } = current;
    return this.assignmentResolver.resolveEligibleApprovers({ ...query, excludeUserId: userId || undefined });
  }

  private canQueryApproverCandidates(menuCode: string): boolean {
    const user = this.cls.get('user') as Record<string, any> | undefined;
    const roles = Array.isArray(user?.roles) ? user?.roles : (user?.role ? [user.role] : []);
    if (roles.includes('ROLE_ADMIN') || user?.role === 'ROLE_ADMIN' || user?.username === 'admin') return true;
    const permissions = user?.permissions as string[] | undefined;
    if (permissions?.includes('*')) return true;
    // 发起人只要拥有该业务菜单任一权限位，即可查询该业务的审批候选人。
    // 候选人本身仍由 AssignmentResolver 按 menuCode + requiredPerm + DataScope 二次筛选。
    return ALL_PERM_CODES.some((perm: PermCode) => hasPerm(permissions, menuCode, perm));
  }

  /**
   * 转交审批（P2）：把进行中实例的「当前步」改派给另一合格审批人。
   * 仅 发起人 / 当前审批人 / ADMIN 可转交；转交对象经 resolveEligibleApprovers 权威校验
   * （权限 ∩ 数据域 ∩ 非发起人）。改派后通知新审批人。
   */
  async reassignStep(instanceId: string, toUserId: string): Promise<{ ok: true; toName: string }> {
    const { userId, roles } = this.currentUser();
    return this.ds.transaction(async (mgr) => {
      const instance = await mgr.findOne(WfApprovalInstanceEntity, { where: { id: instanceId } });
      if (!instance) throw new NotFoundException('审批实例不存在');
      if (instance.status !== 'PENDING') throw new BadRequestException(`实例当前状态 ${instance.status}，不可转交`);

      const pendingSteps = await mgr.find(WfApprovalInstanceStepEntity, {
        where: { instanceId, stepNo: instance.currentStepNo, status: 'PENDING' as any },
      });
      if (pendingSteps.length === 0) throw new BadRequestException('当前步无待审批节点');

      // 权限：发起人 / 当前审批人 / ADMIN 可转交
      const isStarter = String(instance.startedBy ?? '') === String(userId);
      const isCurrentApprover = pendingSteps.some((s) => String(s.approverUserId ?? '') === String(userId));
      if (!isStarter && !isCurrentApprover && !roles.includes('ROLE_ADMIN')) {
        throw new ForbiddenException('只有发起人或当前审批人可转交审批');
      }

      // 转交对象权威校验（权限 ∩ 数据域 ∩ 非发起人）
      const eligible = await this.assignmentResolver.resolveEligibleApprovers({
        menuCode:      instance.moduleCode ?? this.bizRegistry.getModuleCode(instance.bizType),
        requiredPerm:  'E',
        companyCode:   instance.companyCode ?? undefined,
        projectCode:   instance.projectCode ?? undefined,
        excludeUserId: instance.startedBy ?? undefined,
      });
      const picked = eligible.find((e) => e.userId === String(toUserId));
      if (!picked) throw new BadRequestException('转交对象无权审批该单据，或不在其数据域范围内');

      // 改派当前步 → USER 型指向新审批人
      for (const s of pendingSteps) {
        s.approverType = 'USER';
        s.approverUserId = picked.userId;
        s.approverName = picked.displayName;
      }
      await mgr.save(WfApprovalInstanceStepEntity, pendingSteps);

      // 通知新审批人
      setImmediate(() => {
        this.notify
          .onTaskCreated({
            instanceId:     instance.id,
            bizType:        instance.bizType,
            bizId:          instance.bizId,
            bizNo:          instance.bizNo,
            subject:        instance.subject ?? undefined,
            starterUserId:  instance.startedBy ?? undefined,
            assigneeUserId: picked.userId,
          })
          .catch(() => {/* ignore */});
      });

      return { ok: true, toName: picked.displayName };
    });
  }

  /** 转交候选人：用实例自身的 moduleCode/companyCode 解析合格审批人（前端转交下拉用，无需前端拼 menuCode） */
  async reassignCandidates(instanceId: string) {
    const instance = await this.instanceRepo.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('审批实例不存在');
    return this.assignmentResolver.resolveEligibleApprovers({
      menuCode:      instance.moduleCode ?? this.bizRegistry.getModuleCode(instance.bizType),
      requiredPerm:  'E',
      companyCode:   instance.companyCode ?? undefined,
      projectCode:   instance.projectCode ?? undefined,
      excludeUserId: instance.startedBy ?? undefined,
    });
  }

  async startApproval(
    params: StartApprovalParams,
    mgr: EntityManager,
  ): Promise<WfApprovalInstanceEntity | null> {
    const { userId } = this.currentUser();

    // 未固化流程：发起人指定了审批人 → 建单步动态实例（不需预配规则）
    if (params.pickedApproverId) {
      return this.startDynamicApproval(params, mgr, userId);
    }

    // 1. 查找匹配规则
    const rule = await this.resolveRule(
      params.bizType,
      params.amount,
      params.companyCode,
      params.projectCode,
      params.currencyCode,
    );

    if (!rule) {
      // 无规则 → 默认 fail-safe：禁止自动批准，禁止提交
      // 仅当 ADMIN/SYSOPS 在 sys_configs 显式开启危险开关 workflow.fail_open_enabled=true 时才放行（生产不建议）
      if (!(await this.isFailOpenEnabled(mgr))) {
        throw new BadRequestException('当前业务未配置审批规则，请先在审批规则中配置后再提交。');
      }
      // ⚠ fail-open 危险开关已显式开启：保留旧的无规则自动通过行为
      const autoStatus = this.bizRegistry.getApprovedStatus(params.bizType);
      await this.updateBizStatus(params.bizType, params.bizId, autoStatus, mgr);
      const cfg0 = this.bizRegistry.get(params.bizType);
      if (cfg0?.onApproved) await cfg0.onApproved(params.bizId, mgr);
      return null;
    }

    const ruleSteps = await mgr.find(WfApprovalRuleStepEntity, {
      where: { ruleId: rule.id },
      order: { stepNo: 'ASC' },
    });

    if (ruleSteps.length === 0) {
      // 规则存在但无步骤 → 同样默认 fail-safe，禁止自动批准
      if (!(await this.isFailOpenEnabled(mgr))) {
        throw new BadRequestException('当前业务的审批规则未配置任何审批步骤，请先在审批规则中补全步骤后再提交。');
      }
      // ⚠ fail-open 危险开关已显式开启：保留旧的无步骤自动通过行为
      const autoStatus = this.bizRegistry.getApprovedStatus(params.bizType);
      await this.updateBizStatus(params.bizType, params.bizId, autoStatus, mgr);
      const cfg0 = this.bizRegistry.get(params.bizType);
      if (cfg0?.onApproved) await cfg0.onApproved(params.bizId, mgr);
      return null;
    }

    // 幂等：已有实例则返回
    const existing = await mgr.findOne(WfApprovalInstanceEntity, {
      where: { bizType: params.bizType, bizId: params.bizId },
    });
    if (existing) {
      if (existing.status === 'PENDING') return existing;
      throw new ConflictException(`该单据已有审批实例（状态：${existing.status}）`);
    }

    const instanceNo = await this.generateInstanceNo(mgr);

    const instance = mgr.create(WfApprovalInstanceEntity, {
      instanceNo,
      moduleCode:    params.moduleCode ?? this.bizRegistry.getModuleCode(params.bizType),
      bizType:       params.bizType,
      bizId:         params.bizId,
      bizNo:         params.bizNo,
      ruleId:        rule.id,
      totalSteps:    ruleSteps.length,
      currentStepNo: 1,
      status:        'PENDING',
      startedBy:     userId || null,
      // 业务摘要快照（供待办/历史页展示，避免跨表查询）
      amount:       params.amount ?? null,
      currencyCode: params.currencyCode ?? null,
      companyCode:  params.companyCode ?? null,
      companyName:  params.companyName ?? null,
      projectCode:  params.projectCode ?? null,
      projectName:  params.projectName ?? null,
      subject:      params.subject ?? null,
    });
    const savedInstance = await mgr.save(WfApprovalInstanceEntity, instance);

    // 使用 AssignmentResolverService 解析每步的具体审批人
    const stepEntities: WfApprovalInstanceStepEntity[] = [];
    for (const rs of ruleSteps) {
      const bizCtx = {
        companyCode:  params.companyCode,
        projectCode:  params.projectCode,
        starterUserId: userId || undefined,
      };
      const resolved = await this.assignmentResolver.resolveApprovers({
        approverType:   (rs.approverType ?? 'ROLE') as ApproverType,
        approverRole:   rs.approverRole ?? undefined,
        approverUserId: rs.approverUserId ?? undefined,
        bizContext:     bizCtx,
      });

      if (resolved.length === 0) {
        this.assignmentResolver.throwNotFound(
          { approverType: (rs.approverType ?? 'ROLE') as ApproverType, approverRole: rs.approverRole ?? undefined, bizContext: bizCtx },
          rs.stepNo,
        );
      }

      // 第一步审批人 → CLS，供 ApprovalHintInterceptor 注入响应，前端提示"提交给谁审批"
      if (rs.stepNo === ruleSteps[0].stepNo) {
        await this.stashApprovalHint(rs.approverRole ?? null, resolved, rs.stepNo, mgr);
      }

      // 计算 due_at：由 sla_hours 决定，默认 48h
      const slaHours = rs.slaHours ?? 48;
      const dueAt = new Date(Date.now() + slaHours * 3600 * 1000);

      // G85-A：角色类步骤（ROLE/COMPANY_ROLE/PROJECT_ROLE）建「单行、不钉死具体用户」，
      //   approverUserId=null + 保留 approverRole → validateApprover 落到角色校验，
      //   **持有该角色的任一用户均可审批**（resolved 仅用于"是否存在可审批人"校验 + 通知）。
      //   原 per-user 多建行会导致 approveStep 只认第一行那个人，退化成单人审批 → 已修复。
      const roleBasedTypes = ['ROLE', 'COMPANY_ROLE', 'PROJECT_ROLE'];
      if (roleBasedTypes.includes(rs.approverType ?? 'ROLE')) {
        stepEntities.push(
          mgr.create(WfApprovalInstanceStepEntity, {
            instanceId:         savedInstance.id,
            stepNo:             rs.stepNo,
            approverType:       rs.approverType ?? 'ROLE',
            approverRole:       rs.approverRole      ?? null,
            approverUserId:     null,
            requiredRole:       rs.approverRole      ?? null,
            allowAdminOverride: rs.allowAdminOverride ?? false,
            status:             'PENDING',
            dueAt,
          }),
        );
      } else {
        for (const approver of resolved) {
          stepEntities.push(
            mgr.create(WfApprovalInstanceStepEntity, {
              instanceId:         savedInstance.id,
              stepNo:             rs.stepNo,
              approverType:       rs.approverType ?? 'ROLE',
              approverRole:       rs.approverRole      ?? null,
              approverUserId:     approver.userId,
              approverName:       approver.displayName,
              requiredRole:       rs.approverRole      ?? null,
              allowAdminOverride: rs.allowAdminOverride ?? false,
              status:             'PENDING',
              dueAt,
            }),
          );
        }
      }
    }
    await mgr.save(WfApprovalInstanceStepEntity, stepEntities);

    // 通知第一步所有审批人（fire-and-forget）
    const firstStepEntities = stepEntities.filter(s => s.stepNo === ruleSteps[0]?.stepNo);
    setImmediate(() => {
      Promise.all(
        firstStepEntities.map(step =>
          this.notify.onTaskCreated({
            instanceId:        savedInstance.id,
            bizType:           params.bizType,
            bizId:             params.bizId,
            bizNo:             params.bizNo,
            subject:           params.subject,
            starterUserId:     userId || undefined,
            assigneeRoleCode:  step.approverRole  ?? undefined,
            assigneeUserId:    step.approverUserId ?? undefined,
          }),
        ),
      ).catch(() => {/* ignore */});
    });

    return savedInstance;
  }

  /**
   * 单步动态审批实例（开放式选人 / 未固化流程）：用发起人指定的审批人建一步 USER 实例，
   * 不依赖预配审批规则。审批人资格在此用 resolveEligibleApprovers 权威校验（权限 ∩ 数据域 ∩ 非发起人）。
   */
  private async startDynamicApproval(
    params: StartApprovalParams,
    mgr: EntityManager,
    starterUserId: string,
  ): Promise<WfApprovalInstanceEntity> {
    const moduleCode = params.moduleCode ?? this.bizRegistry.getModuleCode(params.bizType);

    // 权威校验：所选人必须有该业务确认权 + 数据域覆盖 + 非发起人（前端下拉不可信）
    const eligible = await this.assignmentResolver.resolveEligibleApprovers({
      menuCode:      moduleCode,
      requiredPerm:  'E',
      companyCode:   params.companyCode,
      projectCode:   params.projectCode,
      excludeUserId: starterUserId || undefined,
    });
    const picked = eligible.find((e) => e.userId === String(params.pickedApproverId));
    if (!picked) {
      throw new BadRequestException('所选审批人无权审批该单据，或不在其数据域范围内');
    }

    // 幂等：已有实例则返回/拒绝
    const existing = await mgr.findOne(WfApprovalInstanceEntity, {
      where: { bizType: params.bizType, bizId: params.bizId },
    });
    if (existing) {
      if (existing.status === 'PENDING') return existing;
      throw new ConflictException(`该单据已有审批实例（状态：${existing.status}）`);
    }

    const instanceNo = await this.generateInstanceNo(mgr);
    const instance = await mgr.save(
      WfApprovalInstanceEntity,
      mgr.create(WfApprovalInstanceEntity, {
        instanceNo,
        moduleCode,
        bizType:       params.bizType,
        bizId:         params.bizId,
        bizNo:         params.bizNo,
        ruleId:        null,
        totalSteps:    1,
        currentStepNo: 1,
        status:        'PENDING',
        startedBy:     starterUserId || null,
        amount:        params.amount ?? null,
        currencyCode:  params.currencyCode ?? null,
        companyCode:   params.companyCode ?? null,
        companyName:   params.companyName ?? null,
        projectCode:   params.projectCode ?? null,
        projectName:   params.projectName ?? null,
        subject:       params.subject ?? null,
      }),
    );
    await mgr.save(
      WfApprovalInstanceStepEntity,
      mgr.create(WfApprovalInstanceStepEntity, {
        instanceId:         instance.id,
        stepNo:             1,
        approverType:       'USER',
        approverUserId:     picked.userId,
        approverName:       picked.displayName,
        allowAdminOverride: false,
        status:             'PENDING',
        dueAt:              new Date(Date.now() + 48 * 3600 * 1000),
      }),
    );

    // 审批人提示（g183 复用）+ 通知被指定的审批人
    this.cls.set('approvalHint', { roleZh: picked.roleNameZh, names: [picked.displayName], stepNo: 1 });
    setImmediate(() => {
      this.notify
        .onTaskCreated({
          instanceId:     instance.id,
          bizType:        params.bizType,
          bizId:          params.bizId,
          bizNo:          params.bizNo,
          subject:        params.subject,
          starterUserId:  starterUserId || undefined,
          assigneeUserId: picked.userId,
        })
        .catch(() => {/* ignore */});
    });

    return instance;
  }

  // ── 严格角色校验（Phase B/C）────────────────────────────────────────────
  //   allowAdminOverride=true 时 ADMIN 可跳过角色限制

  private validateApprover(
    step: WfApprovalInstanceStepEntity,
    userId: string,
    roles: string[],
  ): void {
    if (step.allowAdminOverride && roles.includes('ROLE_ADMIN')) {
      // G85-D 收紧留痕：override 越过正常审批人时必须可追溯（当前无任何规则启用此开关，纯防御）
      new Logger('ApprovalEngine').warn(
        `ADMIN-OVERRIDE used: userId=${userId} step=${step.id} instance=${step.instanceId} requiredRole=${step.approverRole ?? '-'}`,
      );
      return;
    }

    const approverType = step.approverType ?? 'ROLE';
    const userSpecificTypes = ['USER', 'ORG_MANAGER', 'PROJECT_MANAGER', 'COMPANY_FINANCE', 'DIRECT_MANAGER'];

    if (userSpecificTypes.includes(approverType)) {
      // 用户指定类型：必须 approver_user_id 匹配
      if (step.approverUserId && String(step.approverUserId) !== String(userId)) {
        throw new ForbiddenException(
          `APPROVER_USER_MISMATCH: 当前步骤指定审批人 userId=${step.approverUserId}，非本人不可操作`,
        );
      }
    } else if (approverType === 'ROLE' || approverType === 'COMPANY_ROLE' || approverType === 'PROJECT_ROLE') {
      // 角色类型：先检查 approver_user_id（startApproval已解析），再 fallback 到角色
      if (step.approverUserId) {
        if (String(step.approverUserId) !== String(userId)) {
          throw new ForbiddenException(
            `APPROVER_USER_MISMATCH: 当前步骤指定审批人 userId=${step.approverUserId}，非本人不可操作`,
          );
        }
      } else if (step.approverRole) {
        if (!roles.includes(step.approverRole)) {
          throw new ForbiddenException(
            `APPROVER_ROLE_MISMATCH: 当前步骤需要角色 ${step.approverRole}，您的角色（${roles.join(',')}）无审批权`,
          );
        }
      }
    }
  }

  // ── 审批当前步骤 ─────────────────────────────────────────────────────────

  async approveStep(
    instanceId: string,
    comment?: string,
  ): Promise<{ finished: boolean; approved: boolean; currentStepNo?: number; totalSteps?: number }> {
    return this.ds.transaction(async mgr => {
      const { userId, userName, roles } = this.currentUser();

      const instance = await mgr.findOne(WfApprovalInstanceEntity, {
        where: { id: instanceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!instance) throw new NotFoundException(`审批实例 ${instanceId} 不存在`);
      if (instance.status !== 'PENDING') {
        throw new ConflictException(`审批实例已结束（状态：${instance.status}），不可继续操作`);
      }

      const step = await mgr.findOne(WfApprovalInstanceStepEntity, {
        where: { instanceId, stepNo: instance.currentStepNo },
      });
      if (!step) throw new NotFoundException(`步骤 ${instance.currentStepNo} 不存在`);
      if (step.status !== 'PENDING') {
        throw new ConflictException(`该步骤已处理（状态：${step.status}）`);
      }

      // 严格角色校验（Phase B：ADMIN 不自动绕过）
      this.validateApprover(step, userId, roles);

      // 防止同一用户重复审批同一步骤
      if (step.actorUserId && step.actorUserId === userId) {
        throw new ConflictException('您已审批过该步骤，请勿重复操作');
      }

      step.status         = 'APPROVED';
      step.action         = 'APPROVE';
      step.actorUserId    = userId;
      step.actorUsername  = userName;
      step.approverUserId = userId;
      step.approverName   = userName;
      step.requiredRole   = step.approverRole;
      step.comment        = comment ?? null;
      step.actedAt        = new Date();
      await mgr.save(WfApprovalInstanceStepEntity, step);

      const isLastStep = instance.currentStepNo >= instance.totalSteps;

      if (isLastStep) {
        instance.status     = 'APPROVED';
        instance.finishedAt = new Date();
        await mgr.save(WfApprovalInstanceEntity, instance);
        const bizStatus = this.bizRegistry.getApprovedStatus(instance.bizType);
        await this.updateBizStatus(instance.bizType, instance.bizId, bizStatus, mgr);

        // onApproved 回调（同一事务）
        const approvedCfg = this.bizRegistry.get(instance.bizType);
        if (approvedCfg?.onApproved) await approvedCfg.onApproved(instance.bizId, mgr);

        // 通知发起人：审批完成
        const starterUserId = instance.startedBy ?? undefined;
        setImmediate(() => {
          this.notify.onInstanceCompleted({
            instanceId:    instance.id,
            bizType:       instance.bizType,
            bizId:         instance.bizId,
            bizNo:         instance.bizNo,
            subject:       instance.subject ?? undefined,
            starterUserId: starterUserId ?? undefined,
            result:        'APPROVED',
          }).catch(() => {/* ignore */});
        });

        return { finished: true, approved: true };
      } else {
        instance.currentStepNo += 1;
        await mgr.save(WfApprovalInstanceEntity, instance);

        // 通知下一步所有审批人
        const nextStepNo = instance.currentStepNo;
        const instanceSnapshot = { ...instance };
        setImmediate(async () => {
          try {
            const nextSteps = await this.stepRepo.find({
              where: { instanceId: instance.id, stepNo: nextStepNo, status: 'PENDING' as any },
            });
            await Promise.all(
              nextSteps.map(ns =>
                this.notify.onTaskCreated({
                  instanceId:       instanceSnapshot.id,
                  bizType:          instanceSnapshot.bizType,
                  bizId:            instanceSnapshot.bizId,
                  bizNo:            instanceSnapshot.bizNo,
                  subject:          instanceSnapshot.subject ?? undefined,
                  assigneeRoleCode: ns.approverRole   ?? undefined,
                  assigneeUserId:   ns.approverUserId ?? undefined,
                }),
              ),
            );
          } catch {/* ignore */}
        });

        return { finished: false, approved: false, currentStepNo: instance.currentStepNo, totalSteps: instance.totalSteps };
      }
    });
  }

  // ── 拒绝当前步骤 ─────────────────────────────────────────────────────────

  async rejectStep(instanceId: string, comment?: string): Promise<void> {
    return this.ds.transaction(async mgr => {
      const { userId, userName, roles } = this.currentUser();

      const instance = await mgr.findOne(WfApprovalInstanceEntity, {
        where: { id: instanceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!instance) throw new NotFoundException(`审批实例 ${instanceId} 不存在`);
      if (instance.status !== 'PENDING') {
        throw new ConflictException(`审批实例已结束（状态：${instance.status}）`);
      }

      const step = await mgr.findOne(WfApprovalInstanceStepEntity, {
        where: { instanceId, stepNo: instance.currentStepNo },
      });
      if (!step) throw new NotFoundException(`步骤不存在`);
      if (step.status !== 'PENDING') throw new ConflictException(`该步骤已处理`);

      // 严格角色校验（Phase B）
      this.validateApprover(step, userId, roles);

      step.status         = 'REJECTED';
      step.action         = 'REJECT';
      step.actorUserId    = userId;
      step.actorUsername  = userName;
      step.approverUserId = userId;
      step.approverName   = userName;
      step.requiredRole   = step.approverRole;
      step.comment        = comment ?? null;
      step.actedAt        = new Date();
      await mgr.save(WfApprovalInstanceStepEntity, step);

      // 关闭实例
      instance.status     = 'REJECTED';
      instance.finishedAt = new Date();
      await mgr.save(WfApprovalInstanceEntity, instance);

      // 更新业务状态
      await this.updateBizStatus(instance.bizType, instance.bizId, 'REJECTED', mgr);

      // onRejected 回调（同一事务）
      const rejectedCfg = this.bizRegistry.get(instance.bizType);
      if (rejectedCfg?.onRejected) await rejectedCfg.onRejected(instance.bizId, mgr);

      // 通知发起人：审批被拒绝
      const starterUserId = instance.startedBy ?? undefined;
      const snapshot = { ...instance };
      setImmediate(() => {
        this.notify.onInstanceRejected({
          instanceId:    snapshot.id,
          bizType:       snapshot.bizType,
          bizId:         snapshot.bizId,
          bizNo:         snapshot.bizNo,
          subject:       snapshot.subject ?? undefined,
          starterUserId: starterUserId ?? undefined,
          result:        'REJECTED',
        }).catch(() => {/* ignore */});
      });
    });
  }

  // ── 取消实例 ─────────────────────────────────────────────────────────────

  async cancelInstance(instanceId: string, mgr?: EntityManager): Promise<void> {
    const exec = async (em: EntityManager) => {
      const instance = await em.findOne(WfApprovalInstanceEntity, { where: { id: instanceId } });
      if (!instance) return;
      if (instance.status !== 'PENDING') return; // 已结束，忽略

      instance.status     = 'CANCELLED';
      instance.finishedAt = new Date();
      await em.save(WfApprovalInstanceEntity, instance);
    };
    if (mgr) {
      await exec(mgr);
    } else {
      await this.ds.transaction(exec);
    }
  }

  // ── 查询 ─────────────────────────────────────────────────────────────────

  /** 获取我的待办（角色匹配 OR 指定用户匹配） */
  async getMyTodos(): Promise<any[]> {
    const { userId, roles } = this.currentUser();

    // G85-D 待办 DataScope：非全局用户只看本公司范围实例（company_code 为 NULL 的全局单据保留）
    const scope = this.cls.get('dataScope') as
      { isGlobal?: boolean; allowedCompanyCodes?: string[] } | undefined;
    const params: any[] = [roles, userId];
    let scopeWhere = '';
    if (scope && !scope.isGlobal && Array.isArray(scope.allowedCompanyCodes) && scope.allowedCompanyCodes.length > 0) {
      params.push(scope.allowedCompanyCodes);
      scopeWhere = `AND (i.company_code = ANY($${params.length}::varchar[]) OR i.company_code IS NULL)`;
    }

    const rows = await this.ds.query(`
      SELECT
        s.id              AS step_id,
        s.step_no,
        s.approver_type,
        s.approver_role,
        s.approver_user_id,
        s.approver_name,
        s.required_role,
        s.status          AS step_status,
        s.due_at,
        s.is_overdue,
        s.reminder_count,
        s.escalation_level,
        i.id              AS instance_id,
        i.instance_no,
        i.module_code,
        i.biz_type,
        i.biz_id,
        i.biz_no,
        i.total_steps,
        i.current_step_no,
        i.started_at,
        i.started_by,
        i.amount,
        i.currency_code,
        i.company_code,
        i.company_name,
        i.project_code,
        i.project_name,
        i.subject
      FROM wf_approval_instance_steps s
      JOIN wf_approval_instances i ON i.id = s.instance_id
      WHERE s.status = 'PENDING'
        AND i.status = 'PENDING'
        AND s.step_no = i.current_step_no
        AND (
          s.approver_role = ANY($1::varchar[])
          OR s.approver_user_id = $2
          -- G137：ROLE_ADMIN(老板/超管)兜底可见 allow_admin_override 步骤；
          -- G151：兜底改为「仅卡住才进超管待办」——日常步骤不再灌入超管待办(否则老板兼超管时
          --   每一步都进他待办、还能一人连批两步破坏分离)。仅以下三种「卡住」情形才进：
          --   ① 步骤已超期(is_overdue)；② 角色类步骤但该角色无在职持有人；③ 指派用户已停用。
          OR (
            s.allow_admin_override = true
            AND 'ROLE_ADMIN' = ANY($1::varchar[])
            AND (
              s.is_overdue = true
              OR (s.approver_role IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM sys_user u2
                    JOIN sys_user_role ur2 ON ur2.user_id = u2.user_id
                    JOIN sys_role r2 ON r2.role_id = ur2.role_id
                    WHERE r2.role_code = s.approver_role AND u2.status = 1))
              OR (s.approver_user_id IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM sys_user u3 WHERE u3.user_id = s.approver_user_id AND u3.status = 1))
            )
          )
        )
        ${scopeWhere}
      ORDER BY i.started_at ASC
    `, params);

    return rows;
  }

  /** 获取指定实例详情（含步骤列表 + 关联表单提交快照）*/
  async getInstanceDetail(instanceId: string): Promise<any> {
    const instance = await this.instanceRepo.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException(`审批实例 ${instanceId} 不存在`);

    const steps = await this.stepRepo.find({
      where: { instanceId },
      order: { stepNo: 'ASC' },
    });
    this.assertInstanceReadable(instance, steps);

    // Phase I: 若审批实例关联了表单提交，一并返回表单快照（含 schema 用于前端渲染）
    let formSubmission: any = null;
    if (instance.formSubmissionId) {
      const rows = await this.ds.query(`
        SELECT s.id, s.submission_no, s.form_code, s.form_version_id,
               s.biz_type, s.biz_no, s.submitted_by_name,
               s.data_json, s.status, s.created_at,
               fv.schema_json, fv.ui_schema_json,
               fd.name AS form_name
          FROM wf_form_submission s
          JOIN wf_form_version    fv ON fv.id = s.form_version_id
          JOIN wf_form_definition fd ON fd.id = fv.form_id
         WHERE s.id = $1
         LIMIT 1
      `, [instance.formSubmissionId]);
      formSubmission = rows[0] ?? null;
    }

    return { ...instance, steps, formSubmission };
  }

  private assertInstanceReadable(instance: WfApprovalInstanceEntity, steps: WfApprovalInstanceStepEntity[]): void {
    const { userId, roles } = this.currentUser();
    const scope = this.cls.get('dataScope') as
      { isGlobal?: boolean; allowedCompanyCodes?: string[] } | undefined;

    if (scope && !scope.isGlobal && instance.companyCode) {
      const allowedCompanies = new Set((scope.allowedCompanyCodes ?? []).map((code) => String(code)));
      if (!allowedCompanies.has(String(instance.companyCode))) {
        throw new ForbiddenException('无权查看该审批实例：公司数据域不匹配');
      }
    }

    if (roles.includes('ROLE_ADMIN')) return;
    if (String(instance.startedBy ?? '') === String(userId)) return;

    const readableByUser = steps.some((step) => {
      const assignedToUser = step.approverUserId && String(step.approverUserId) === String(userId);
      const assignedToRole = step.approverRole && roles.includes(step.approverRole);
      const actedByUser = step.actorUserId && String(step.actorUserId) === String(userId);
      return assignedToUser || assignedToRole || actedByUser;
    });
    if (!readableByUser) {
      throw new ForbiddenException('无权查看该审批实例');
    }
  }

  async getInstanceByBiz(bizType: string, bizId: string): Promise<any | null> {
    const inst = await this.instanceRepo.findOne({ where: { bizType, bizId } });
    if (!inst) return null;
    const steps = await this.stepRepo.find({ where: { instanceId: inst.id }, order: { stepNo: 'ASC' } });
    this.assertInstanceReadable(inst, steps);
    return { ...inst, steps };
  }

  /** 获取审批历史（已完成的实例） */
  async getHistory(page: number, pageSize: number, bizType?: string): Promise<any> {
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const offset = (safePage - 1) * safePageSize;
    const { userId, roles } = this.currentUser();
    const isAdmin = roles.includes('ROLE_ADMIN');
    const scope = this.cls.get('dataScope') as
      { isGlobal?: boolean; allowedCompanyCodes?: string[] } | undefined;

    const params: any[] = [];
    const where: string[] = ["i.status IN ('APPROVED','REJECTED','CANCELLED')"];

    if (bizType) {
      params.push(bizType);
      where.push(`i.biz_type = $${params.length}`);
    }

    if (scope && !scope.isGlobal && Array.isArray(scope.allowedCompanyCodes) && scope.allowedCompanyCodes.length > 0) {
      params.push(scope.allowedCompanyCodes);
      where.push(`(i.company_code = ANY($${params.length}::varchar[]) OR i.company_code IS NULL)`);
    }

    if (!isAdmin) {
      params.push(userId);
      const userParam = `$${params.length}`;
      params.push(roles);
      const rolesParam = `$${params.length}`;
      where.push(`(
        i.started_by = ${userParam}
        OR EXISTS (
          SELECT 1
            FROM wf_approval_instance_steps s
           WHERE s.instance_id = i.id
             AND (
               s.actor_user_id = ${userParam}
               OR s.approver_user_id = ${userParam}
               OR s.approver_role = ANY(${rolesParam}::varchar[])
             )
        )
      )`);
    }

    const whereSql = where.join('\n        AND ');
    const countRows = await this.ds.query(
      `SELECT COUNT(*)::int AS total
         FROM wf_approval_instances i
        WHERE ${whereSql}`,
      params,
    );

    params.push(safePageSize);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    const list = await this.ds.query(
      `SELECT
          i.id::text             AS "id",
          i.instance_no          AS "instanceNo",
          i.module_code          AS "moduleCode",
          i.biz_type             AS "bizType",
          i.biz_id::text         AS "bizId",
          i.biz_no               AS "bizNo",
          i.total_steps          AS "totalSteps",
          i.current_step_no      AS "currentStepNo",
          i.status               AS "status",
          i.started_by::text     AS "startedBy",
          i.started_at           AS "startedAt",
          i.finished_at          AS "finishedAt",
          i.amount               AS "amount",
          i.currency_code        AS "currencyCode",
          i.company_code         AS "companyCode",
          i.company_name         AS "companyName",
          i.project_code         AS "projectCode",
          i.project_name         AS "projectName",
          i.subject              AS "subject"
         FROM wf_approval_instances i
        WHERE ${whereSql}
        ORDER BY i.finished_at DESC NULLS LAST, i.started_at DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params,
    );

    return { list, total: Number(countRows?.[0]?.total ?? 0), page: safePage, pageSize: safePageSize };
  }

  // ── 内部：更新业务状态 ────────────────────────────────────────────────────

  async updateBizStatus(
    bizType: string,
    bizId: string,
    status: string,
    mgr: EntityManager,
  ): Promise<void> {
    const table = this.bizRegistry.getTableName(bizType);
    if (!table) return;
    await mgr.query(
      `UPDATE ${table} SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, bizId],
    );
  }

  /** 查询待办数量（用于 badge 展示） */
  async getTodosCount(): Promise<number> {
    const { userId, roles } = this.currentUser();
    const rows = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM wf_approval_instance_steps s
       JOIN wf_approval_instances i ON i.id = s.instance_id
       WHERE s.status='PENDING' AND i.status='PENDING'
         AND s.step_no = i.current_step_no
         AND (s.approver_role = ANY($1::varchar[]) OR s.approver_user_id = $2
              OR (s.allow_admin_override = true AND 'ROLE_ADMIN' = ANY($1::varchar[])))`,
      [roles, userId],
    );
    return parseInt(rows[0]?.cnt ?? '0', 10);
  }
}
