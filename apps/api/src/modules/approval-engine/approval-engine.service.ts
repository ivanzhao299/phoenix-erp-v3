import {
  Injectable, ConflictException, NotFoundException, ForbiddenException, Inject, forwardRef,
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
  async startApproval(
    params: StartApprovalParams,
    mgr: EntityManager,
  ): Promise<WfApprovalInstanceEntity | null> {
    const { userId } = this.currentUser();

    // 1. 查找匹配规则
    const rule = await this.resolveRule(
      params.bizType,
      params.amount,
      params.companyCode,
      params.projectCode,
      params.currencyCode,
    );

    if (!rule) {
      // 无规则 → 自动审批通过
      const autoStatus = this.bizRegistry.getApprovedStatus(params.bizType);
      await this.updateBizStatus(params.bizType, params.bizId, autoStatus, mgr);
      return null;
    }

    const ruleSteps = await mgr.find(WfApprovalRuleStepEntity, {
      where: { ruleId: rule.id },
      order: { stepNo: 'ASC' },
    });

    if (ruleSteps.length === 0) {
      const autoStatus = this.bizRegistry.getApprovedStatus(params.bizType);
      await this.updateBizStatus(params.bizType, params.bizId, autoStatus, mgr);
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

      // 计算 due_at：由 sla_hours 决定，默认 48h
      const slaHours = rs.slaHours ?? 48;
      const dueAt = new Date(Date.now() + slaHours * 3600 * 1000);

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

  // ── 严格角色校验（Phase B/C）────────────────────────────────────────────
  //   allowAdminOverride=true 时 ADMIN 可跳过角色限制

  private validateApprover(
    step: WfApprovalInstanceStepEntity,
    userId: string,
    roles: string[],
  ): void {
    if (step.allowAdminOverride && roles.includes('ROLE_ADMIN')) return;

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
        )
      ORDER BY i.started_at ASC
    `, [roles, userId]);

    return rows;
  }

  /** 获取指定实例详情（含步骤列表） */
  async getInstanceDetail(instanceId: string): Promise<any> {
    const instance = await this.instanceRepo.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException(`审批实例 ${instanceId} 不存在`);

    const steps = await this.stepRepo.find({
      where: { instanceId },
      order: { stepNo: 'ASC' },
    });

    return { ...instance, steps };
  }

  async getInstanceByBiz(bizType: string, bizId: string): Promise<any | null> {
    const inst = await this.instanceRepo.findOne({ where: { bizType, bizId } });
    if (!inst) return null;
    const steps = await this.stepRepo.find({ where: { instanceId: inst.id }, order: { stepNo: 'ASC' } });
    return { ...inst, steps };
  }

  /** 获取审批历史（已完成的实例） */
  async getHistory(page: number, pageSize: number, bizType?: string): Promise<any> {
    const skip = (page - 1) * pageSize;

    const qb = this.instanceRepo.createQueryBuilder('i')
      .where("i.status IN ('APPROVED','REJECTED','CANCELLED')")
      .orderBy('i.finishedAt', 'DESC')
      .skip(skip)
      .take(pageSize);

    if (bizType) qb.andWhere('i.bizType = :bt', { bt: bizType });

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
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
         AND (s.approver_role = ANY($1::varchar[]) OR s.approver_user_id = $2)`,
      [roles, userId],
    );
    return parseInt(rows[0]?.cnt ?? '0', 10);
  }
}
