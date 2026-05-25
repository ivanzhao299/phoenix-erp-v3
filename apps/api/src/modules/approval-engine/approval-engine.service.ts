import {
  Injectable, ConflictException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { format } from 'date-fns';

import { WfApprovalRuleEntity }         from './entities/wf-approval-rule.entity';
import { WfApprovalRuleStepEntity }     from './entities/wf-approval-rule-step.entity';
import { WfApprovalInstanceEntity }     from './entities/wf-approval-instance.entity';
import { WfApprovalInstanceStepEntity } from './entities/wf-approval-instance-step.entity';

export interface StartApprovalParams {
  moduleCode: string;
  bizType: string;          // 'PR' | 'PO' | 'PAYMENT' | 'FUND'
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

// 业务表映射（仅限白名单，防止 SQL 注入）
const BIZ_TABLE_MAP: Record<string, string> = {
  PR:      'prc2_purchase_requests',
  PO:      'prc2_purchase_orders',
  PAYMENT: 'prc2_payments',
  FUND:    'prc2_shareholder_funds',
};

// 模块代码映射
const BIZ_MODULE_MAP: Record<string, string> = {
  PR:      'MENU_PRC2_ORDER',
  PO:      'MENU_PRC2_ORDER',
  PAYMENT: 'MENU_PRC2_PAYMENT',
  FUND:    'MENU_PRC2_FUND',
};

// 审批通过后的业务终态：FUND → CONFIRMED，其余 → APPROVED
const APPROVED_STATUS_MAP: Record<string, string> = {
  PR:      'APPROVED',
  PO:      'APPROVED',
  PAYMENT: 'APPROVED',
  FUND:    'CONFIRMED',
};

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
      const autoStatus = APPROVED_STATUS_MAP[params.bizType] ?? 'APPROVED';
      await this.updateBizStatus(params.bizType, params.bizId, autoStatus, mgr);
      return null;
    }

    const ruleSteps = await mgr.find(WfApprovalRuleStepEntity, {
      where: { ruleId: rule.id },
      order: { stepNo: 'ASC' },
    });

    if (ruleSteps.length === 0) {
      const autoStatus = APPROVED_STATUS_MAP[params.bizType] ?? 'APPROVED';
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
      moduleCode:    params.moduleCode ?? BIZ_MODULE_MAP[params.bizType] ?? 'UNKNOWN',
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

    const stepEntities = ruleSteps.map(rs =>
      mgr.create(WfApprovalInstanceStepEntity, {
        instanceId:         savedInstance.id,
        stepNo:             rs.stepNo,
        approverRole:       rs.approverRole      ?? null,
        requiredRole:       rs.approverRole      ?? null,
        allowAdminOverride: rs.allowAdminOverride ?? false,
        status:             'PENDING',
      }),
    );
    await mgr.save(WfApprovalInstanceStepEntity, stepEntities);

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

    if (step.approverRole) {
      if (!roles.includes(step.approverRole)) {
        throw new ForbiddenException(
          `APPROVER_ROLE_MISMATCH: 当前步骤需要角色 ${step.approverRole}，您的角色（${roles.join(',')}）无审批权`,
        );
      }
    } else if (step.approverUserId) {
      if (String(step.approverUserId) !== String(userId)) {
        throw new ForbiddenException(
          `APPROVER_USER_MISMATCH: 当前步骤指定审批人 userId=${step.approverUserId}，非本人不可操作`,
        );
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
        const bizStatus = APPROVED_STATUS_MAP[instance.bizType] ?? 'APPROVED';
        await this.updateBizStatus(instance.bizType, instance.bizId, bizStatus, mgr);
        return { finished: true, approved: true };
      } else {
        instance.currentStepNo += 1;
        await mgr.save(WfApprovalInstanceEntity, instance);
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

  /** 获取我的待办（通过角色匹配） */
  async getMyTodos(): Promise<any[]> {
    const { roles } = this.currentUser();

    const rows = await this.ds.query(`
      SELECT
        s.id            AS step_id,
        s.step_no,
        s.approver_role,
        s.required_role,
        s.status        AS step_status,
        i.id            AS instance_id,
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
        AND s.approver_role = ANY($1::varchar[])
      ORDER BY i.started_at ASC
    `, [roles]);

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
    const table = BIZ_TABLE_MAP[bizType];
    if (!table) return;
    await mgr.query(
      `UPDATE ${table} SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, bizId],
    );
  }

  /** 查询待办数量（用于 badge 展示） */
  async getTodosCount(): Promise<number> {
    const { roles } = this.currentUser();
    const rows = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM wf_approval_instance_steps s
       JOIN wf_approval_instances i ON i.id = s.instance_id
       WHERE s.status='PENDING' AND i.status='PENDING'
         AND s.step_no = i.current_step_no
         AND s.approver_role = ANY($1::varchar[])`,
      [roles],
    );
    return parseInt(rows[0]?.cnt ?? '0', 10);
  }
}
