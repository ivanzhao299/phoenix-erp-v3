import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
import { ClsService } from 'nestjs-cls';

import { WfApprovalRuleEntity }     from './entities/wf-approval-rule.entity';
import { WfApprovalRuleStepEntity } from './entities/wf-approval-rule-step.entity';
import {
  QueryApprovalRuleDto,
  CreateApprovalRuleDto,
  UpdateApprovalRuleDto,
} from './dto/approval-rule.dto';

@Injectable()
export class ApprovalRulesService {
  constructor(
    @InjectRepository(WfApprovalRuleEntity)
    private readonly ruleRepo: Repository<WfApprovalRuleEntity>,
    @InjectRepository(WfApprovalRuleStepEntity)
    private readonly stepRepo: Repository<WfApprovalRuleStepEntity>,
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  private currentUser() {
    const u = this.cls.get('user') as any;
    return {
      userId:   String(u?.userId ?? u?.id ?? '0'),
      userName: String(u?.name ?? u?.username ?? ''),
      roles:    (u?.roles ?? (u?.role ? [u.role] : [])) as string[],
    };
  }

  private async writeLog(
    mgr: EntityManager,
    action: string,
    beforeData: Record<string, any> | null,
    afterData: Record<string, any> | null,
    bizId?: string,
    bizNo?: string,
  ): Promise<void> {
    const { userId, userName, roles } = this.currentUser();
    await mgr.query(
      `INSERT INTO sys_operation_logs
         (user_id, username, role_code, module_code, action_code,
          biz_type, biz_id, biz_no, before_data, after_data, result_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        userId || null,
        userName || null,
        roles[0] || null,
        'MENU_WORKFLOW_RULES',
        action,
        'APPROVAL_RULE',
        bizId || null,
        bizNo || null,
        beforeData ? JSON.stringify(beforeData) : null,
        afterData  ? JSON.stringify(afterData)  : null,
        'SUCCESS',
      ],
    );
  }

  // ── 列表 ─────────────────────────────────────────────────────────────────

  async list(q: QueryApprovalRuleDto) {
    const page     = q.page     ?? 1;
    const pageSize = q.pageSize ?? 20;

    const qb = this.ruleRepo.createQueryBuilder('r')
      .orderBy('r.priority', 'ASC')
      .addOrderBy('r.bizType', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (q.bizType)   qb.andWhere('r.bizType = :bt',    { bt: q.bizType });
    if (q.moduleCode) qb.andWhere('r.moduleCode = :mc', { mc: q.moduleCode });
    if (q.enabled !== undefined) qb.andWhere('r.enabled = :en', { en: q.enabled });

    const [rules, total] = await qb.getManyAndCount();

    const ruleIds = rules.map(r => r.id);
    const stepsMap: Record<string, WfApprovalRuleStepEntity[]> = {};

    if (ruleIds.length > 0) {
      const steps = await this.stepRepo.find({
        where: { ruleId: In(ruleIds) },
        order: { stepNo: 'ASC' },
      });
      for (const s of steps) {
        (stepsMap[s.ruleId] ??= []).push(s);
      }
    }

    return {
      items: rules.map(r => ({ ...r, steps: stepsMap[r.id] ?? [] })),
      total,
      page,
      pageSize,
    };
  }

  // ── 详情 ─────────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const rule = await this.ruleRepo.findOne({ where: { id } });
    if (!rule) throw new NotFoundException(`审批规则 ID=${id} 不存在`);
    const steps = await this.stepRepo.find({
      where: { ruleId: id },
      order: { stepNo: 'ASC' },
    });
    return { ...rule, steps };
  }

  // ── 创建 ─────────────────────────────────────────────────────────────────

  async create(dto: CreateApprovalRuleDto) {
    // [Phase R2 — Config Governance] 读取 SLA 全局默认值（规则步骤未配置时使用）
    const slaDefaultHours     = await this._cfgInt('sla.default_hours', 48);
    const slaReminderInterval = await this._cfgInt('sla.reminder_interval_minutes', 720) / 60; // 转小时
    const slaMaxReminders     = await this._cfgInt('sla.max_reminder_count', 3);

    return this.ds.transaction(async mgr => {
      const existing = await mgr.findOne(WfApprovalRuleEntity, {
        where: { ruleCode: dto.ruleCode },
      });
      if (existing) throw new ConflictException(`规则代码 "${dto.ruleCode}" 已存在`);

      const rule = Object.assign(new WfApprovalRuleEntity(), {
        ruleCode:     dto.ruleCode,
        moduleCode:   dto.moduleCode,
        bizType:      dto.bizType,
        orgType:      dto.orgType       ?? null,
        companyCode:  dto.companyCode   ?? null,
        projectCode:  dto.projectCode   ?? null,
        currencyCode: dto.currencyCode  ?? null,
        minAmount:    dto.minAmount     ?? 0,
        maxAmount:    dto.maxAmount     ?? null,
        conditionJson: dto.conditionJson ?? null,
        approvalMode: dto.approvalMode  ?? 'SEQUENTIAL',
        priority:     dto.priority      ?? 100,
        enabled:      dto.enabled       ?? true,
        remark:       dto.remark        ?? null,
      });
      const saved = await mgr.save(WfApprovalRuleEntity, rule);

      if (dto.steps?.length) {
        const stepEntities = dto.steps.map(s =>
          Object.assign(new WfApprovalRuleStepEntity(), {
            ruleId:                saved.id,
            stepNo:                s.stepNo,
            approverType:          s.approverType          ?? 'ROLE',
            approverRole:          s.approverRole          ?? null,
            approverUserId:        s.approverUserId        ?? null,
            orgScope:              s.orgScope              ?? null,
            requiredApprovalCount: s.requiredApprovalCount ?? 1,
            allowAdminOverride:    s.allowAdminOverride    ?? false,
            // SLA 配置（Phase G + R2：未配置时从 sys_configs 全局默认读取）
            slaHours:              s.slaHours              ?? slaDefaultHours,
            reminderIntervalHours: s.reminderIntervalHours ?? slaReminderInterval,
            maxReminders:          s.maxReminders          ?? slaMaxReminders,
            escalationEnabled:     s.escalationEnabled     ?? false,
            escalationAfterHours:  s.escalationAfterHours  ?? null,
            escalationRole:        s.escalationRole        ?? null,
          }),
        );
        await mgr.save(WfApprovalRuleStepEntity, stepEntities);
      }

      await this.writeLog(mgr, 'CREATE', null,
        { ruleCode: dto.ruleCode, bizType: dto.bizType, steps: dto.steps?.length ?? 0 },
        saved.id, dto.ruleCode,
      );

      const steps = await mgr.find(WfApprovalRuleStepEntity, {
        where: { ruleId: saved.id },
        order: { stepNo: 'ASC' },
      });
      return { ...saved, steps };
    });
  }

  // ── 更新 ─────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateApprovalRuleDto) {
    // [Phase R2 — Config Governance] 读取 SLA 全局默认值
    const slaDefaultHours     = await this._cfgInt('sla.default_hours', 48);
    const slaReminderInterval = await this._cfgInt('sla.reminder_interval_minutes', 720) / 60;
    const slaMaxReminders     = await this._cfgInt('sla.max_reminder_count', 3);

    return this.ds.transaction(async mgr => {
      const rule = await mgr.findOne(WfApprovalRuleEntity, { where: { id } });
      if (!rule) throw new NotFoundException(`审批规则 ID=${id} 不存在`);

      const beforeData = { ...rule };

      if (dto.moduleCode   !== undefined) rule.moduleCode   = dto.moduleCode;
      if (dto.bizType      !== undefined) rule.bizType      = dto.bizType;
      if (dto.orgType      !== undefined) rule.orgType      = dto.orgType;
      if (dto.companyCode  !== undefined) rule.companyCode  = dto.companyCode;
      if (dto.projectCode  !== undefined) rule.projectCode  = dto.projectCode;
      if (dto.currencyCode !== undefined) rule.currencyCode = dto.currencyCode;
      if (dto.minAmount    !== undefined) rule.minAmount    = dto.minAmount;
      if (dto.maxAmount    !== undefined) rule.maxAmount    = dto.maxAmount;
      if (dto.conditionJson !== undefined) rule.conditionJson = dto.conditionJson;
      if (dto.approvalMode !== undefined) rule.approvalMode = dto.approvalMode;
      if (dto.priority     !== undefined) rule.priority     = dto.priority;
      if (dto.remark       !== undefined) rule.remark       = dto.remark;
      await mgr.save(WfApprovalRuleEntity, rule);

      if (dto.steps !== undefined) {
        await mgr.delete(WfApprovalRuleStepEntity, { ruleId: id });
        if (dto.steps.length > 0) {
          const stepEntities = dto.steps.map(s =>
            Object.assign(new WfApprovalRuleStepEntity(), {
              ruleId:                id,
              stepNo:                s.stepNo,
              approverType:          s.approverType          ?? 'ROLE',
              approverRole:          s.approverRole          ?? null,
              approverUserId:        s.approverUserId        ?? null,
              orgScope:              s.orgScope              ?? null,
              requiredApprovalCount: s.requiredApprovalCount ?? 1,
              allowAdminOverride:    s.allowAdminOverride    ?? false,
              // SLA 配置（Phase G + R2：未配置时从 sys_configs 全局默认读取）
              slaHours:              s.slaHours              ?? slaDefaultHours,
              reminderIntervalHours: s.reminderIntervalHours ?? slaReminderInterval,
              maxReminders:          s.maxReminders          ?? slaMaxReminders,
              escalationEnabled:     s.escalationEnabled     ?? false,
              escalationAfterHours:  s.escalationAfterHours  ?? null,
              escalationRole:        s.escalationRole        ?? null,
            }),
          );
          await mgr.save(WfApprovalRuleStepEntity, stepEntities);
        }
      }

      await this.writeLog(mgr, 'MODIFY', beforeData, { ...rule }, id, rule.ruleCode);

      const steps = await mgr.find(WfApprovalRuleStepEntity, {
        where: { ruleId: id },
        order: { stepNo: 'ASC' },
      });
      return { ...rule, steps };
    });
  }

  // ── 状态切换 ──────────────────────────────────────────────────────────────

  async updateStatus(id: string, enabled: boolean) {
    return this.ds.transaction(async mgr => {
      const rule = await mgr.findOne(WfApprovalRuleEntity, { where: { id } });
      if (!rule) throw new NotFoundException(`审批规则 ID=${id} 不存在`);

      const before = { id: rule.id, ruleCode: rule.ruleCode, enabled: rule.enabled };
      rule.enabled = enabled;
      await mgr.save(WfApprovalRuleEntity, rule);

      await this.writeLog(
        mgr,
        enabled ? 'ENABLE' : 'DISABLE',
        before, { ...before, enabled },
        id, rule.ruleCode,
      );
      return rule;
    });
  }

  // ── 删除 ─────────────────────────────────────────────────────────────────

  async remove(id: string): Promise<void> {
    return this.ds.transaction(async mgr => {
      const rule = await mgr.findOne(WfApprovalRuleEntity, { where: { id } });
      if (!rule) throw new NotFoundException(`审批规则 ID=${id} 不存在`);

      const rows = await mgr.query(
        `SELECT COUNT(*)::int AS cnt FROM wf_approval_instances WHERE rule_id = $1 AND status = 'PENDING'`,
        [id],
      );
      if ((rows[0]?.cnt ?? 0) > 0) {
        throw new ConflictException('存在进行中的审批实例，无法删除该规则');
      }

      await this.writeLog(mgr, 'DELETE', { ...rule }, null, id, rule.ruleCode);
      await mgr.delete(WfApprovalRuleStepEntity, { ruleId: id });
      await mgr.delete(WfApprovalRuleEntity, id);
    });
  }

  // ── Config Governance helpers ─────────────────────────────────────────────
  /** [Phase R2] 从 sys_configs 读取整数配置，失败时返回 defaultVal */
  private async _cfgInt(key: string, defaultVal: number): Promise<number> {
    try {
      const rows: Array<{ config_value: string }> = await this.ds.query(
        `SELECT config_value FROM sys_configs WHERE config_key = $1`, [key],
      );
      const v = rows[0]?.config_value;
      if (v == null) return defaultVal;
      const n = parseInt(v, 10);
      return isNaN(n) ? defaultVal : n;
    } catch {
      return defaultVal;
    }
  }
}
