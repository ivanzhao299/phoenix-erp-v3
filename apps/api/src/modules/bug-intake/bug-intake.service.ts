import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'fs';
import { basename, extname, join, resolve } from 'path';
import { DataSource, Repository } from 'typeorm';
import { BugReportEntity } from './bug-report.entity';

const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf']);
const MAX_SCREENSHOT_COUNT = 5;
const MAX_JSON_ITEMS = 30;
const BUG_STORAGE_ROOT = 'storage/bug-reports';
const VALID_STATUSES = ['OPEN', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED'] as const;
const VALID_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
const STALE_AGENT_RUNNING_MINUTES = 45;
const STALE_AGENT_APPROVED_MINUTES = 30;

export interface BugReportPayload {
  title?: string;
  description?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  route?: string;
  url?: string;
  roles?: string[];
  companyCode?: string;
  projectCode?: string;
  consoleErrors?: unknown[];
  failedRequests?: unknown[];
  clientContext?: Record<string, unknown>;
}

export interface BugReportUser {
  userId?: string | number;
  id?: string | number;
  username?: string;
  name?: string;
  realNameZh?: string;
  role?: string;
  roles?: string[];
}

interface BugAttachment {
  fileName: string;
  originalName?: string;
  mimeType?: string;
  relativePath?: string;
}

interface BugRepairTaskPayload {
  acceptanceCriteria?: string;
  suggestedOwner?: string;
}

interface BugTriagePayload {
  status?: string;
  priority?: string;
  moduleCode?: string;
  assigneeUsername?: string;
  assigneeName?: string;
  resolutionNote?: string;
}

interface BugAgentApprovalPayload {
  approvalScope?: string;
}

interface BugRedispatchPayload {
  mode?: 'REQUEUE' | 'REPLAN_AND_REQUEUE';
  approvalScope?: string;
  note?: string;
}

interface BugAgentResultPayload {
  taskId?: string;
  agent?: string;
  conclusion?: string;
  resultFile?: string;
  commitHash?: string;
  changedFiles?: unknown[];
  validationResults?: unknown;
  summary?: string;
  nextAction?: string;
}

interface FailureClassification {
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  ownerRecommendation: string;
  recommendedAgents: string[];
  autoFixEligible: boolean;
  requiresHumanGate: boolean;
  evidence: string[];
  suggestedFix: string;
}

@Injectable()
export class BugIntakeService {
  constructor(
    @InjectRepository(BugReportEntity)
    private readonly repo: Repository<BugReportEntity>,
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  async pipelineStatus() {
    const [
      statusRows,
      repairRows,
      staleRunningRows,
      staleApprovedRows,
      holdRows,
      latestRows,
      queueRows,
      alertRows,
    ] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT status, COUNT(*)::int AS count
           FROM bug_reports
          GROUP BY status
          ORDER BY status`,
      ),
      this.ds.query<any[]>(
        `SELECT COALESCE(repair_task_status, 'NONE') AS status, COUNT(*)::int AS count
           FROM bug_reports
          GROUP BY COALESCE(repair_task_status, 'NONE')
          ORDER BY status`,
      ),
      this.ds.query<any[]>(
        `SELECT bug_no, title, repair_task_status, updated_at
           FROM bug_reports
          WHERE repair_task_status = 'AGENT_RUNNING'
            AND updated_at < NOW() - ($1 || ' minutes')::interval
          ORDER BY updated_at ASC
          LIMIT 20`,
        [STALE_AGENT_RUNNING_MINUTES],
      ),
      this.ds.query<any[]>(
        `SELECT bug_no, title, repair_task_status, updated_at
           FROM bug_reports
          WHERE repair_task_status = 'AGENT_APPROVED'
            AND updated_at < NOW() - ($1 || ' minutes')::interval
          ORDER BY updated_at ASC
          LIMIT 20`,
        [STALE_AGENT_APPROVED_MINUTES],
      ),
      this.ds.query<any[]>(
        `SELECT bug_no, title, severity, priority, repair_task_status, updated_at, repair_task_payload
           FROM bug_reports
          WHERE repair_task_status = 'HOLD'
          ORDER BY updated_at DESC
          LIMIT 20`,
      ),
      this.ds.query<any[]>(
        `SELECT bug_no, title, status, severity, priority, repair_task_status, route, updated_at
           FROM bug_reports
          ORDER BY updated_at DESC
          LIMIT 10`,
      ),
      this.ds.query<any[]>(
        `SELECT bug_no, title, status, severity, priority, module_code, assignee_username, assignee_name,
                repair_task_no, repair_task_status, route, updated_at, repair_task_payload
           FROM bug_reports
          WHERE status IN ('OPEN','TRIAGED','IN_PROGRESS')
             OR COALESCE(repair_task_status, '') IN ('READY','ROUTED','AGENT_APPROVED','AGENT_RUNNING','AGENT_EXECUTION_FINISHED','FIX_READY_FOR_UAT','HOLD','AGENT_COMPLETED')
          ORDER BY
            CASE COALESCE(repair_task_status, '')
              WHEN 'HOLD' THEN 0
              WHEN 'AGENT_RUNNING' THEN 1
              WHEN 'AGENT_EXECUTION_FINISHED' THEN 2
              WHEN 'FIX_READY_FOR_UAT' THEN 3
              WHEN 'AGENT_APPROVED' THEN 4
              WHEN 'READY' THEN 5
              WHEN 'ROUTED' THEN 6
              ELSE 5
            END,
            updated_at DESC
          LIMIT 30`,
      ),
      this.ds.query<any[]>(
        `SELECT id, alert_type, severity, title, related_path, created_at
           FROM sys_alerts
          WHERE resolved = FALSE
            AND alert_type IN ('BUG_INTAKE_PIPELINE_HOLD','BUG_INTAKE_RUNNER_TIMEOUT','BUG_INTAKE_AUTO_TRIAGE','BUG_INTAKE_REDISPATCH')
          ORDER BY created_at DESC
          LIMIT 10`,
      ).catch(() => []),
    ]);

    const byStatus = Object.fromEntries(statusRows.map((row) => [row.status, Number(row.count ?? 0)]));
    const byRepairTaskStatus = Object.fromEntries(repairRows.map((row) => [row.status, Number(row.count ?? 0)]));
    const openTotal = ['OPEN', 'TRIAGED', 'IN_PROGRESS'].reduce((sum, key) => sum + Number(byStatus[key] ?? 0), 0);
    const staleTotal = staleRunningRows.length + staleApprovedRows.length;
    const holdTotal = Number(byRepairTaskStatus.HOLD ?? 0);

    return {
      generatedAt: new Date().toISOString(),
      decision: staleTotal > 0 || holdTotal > 0 ? 'ATTENTION_REQUIRED' : 'GO',
      counts: {
        openTotal,
        byStatus,
        byRepairTaskStatus,
        staleRunning: staleRunningRows.length,
        staleApproved: staleApprovedRows.length,
        hold: holdTotal,
      },
      staleThresholds: {
        agentRunningMinutes: STALE_AGENT_RUNNING_MINUTES,
        agentApprovedMinutes: STALE_AGENT_APPROVED_MINUTES,
      },
      staleRunning: staleRunningRows,
      staleApproved: staleApprovedRows,
      holdReports: holdRows.map((row) => ({
        bugNo: row.bug_no,
        title: row.title,
        severity: row.severity,
        priority: row.priority,
        repairTaskStatus: row.repair_task_status,
        updatedAt: row.updated_at,
        failureClassification: this.payloadObject(row.repair_task_payload).failureClassification ?? null,
        holdDispatch: this.payloadObject(row.repair_task_payload).holdDispatch ?? null,
      })),
      latestReports: latestRows.map((row) => ({
        bugNo: row.bug_no,
        title: row.title,
        status: row.status,
        severity: row.severity,
        priority: row.priority,
        repairTaskStatus: row.repair_task_status,
        route: row.route,
        updatedAt: row.updated_at,
      })),
      queueItems: queueRows.map((row) => this.toPipelineQueueItem(row)),
      runtimeSummary: this.buildPipelineRuntimeSummary(queueRows),
      alerts: alertRows,
      operations: {
        autoClassifyRecoverDispatch: 'POST /api/bug-intake/pipeline/auto-triage',
        localRunner: 'LaunchAgent + scripts/ops/bug-intake-local-runner.mjs',
      },
    };
  }

  async reconcileFalseCompletions(
    apply: boolean,
    user: BugReportUser,
    reqMeta: { ip?: string; userAgent?: string },
  ) {
    const reports = await this.repo.find({ where: { repairTaskStatus: 'AGENT_COMPLETED' } });
    const candidates = reports.filter((report) => (
      report.status !== 'CLOSED' ||
      this.safeText(report.resolutionNote, 10_000).startsWith('Agent 修复链路已完成')
    ) && !this.safeText(report.title, 500).startsWith('[SMOKE]'));
    if (!apply) {
      return {
        decision: candidates.length ? 'RECONCILIATION_REQUIRED' : 'NO_FALSE_COMPLETIONS',
        apply: false,
        count: candidates.length,
        reports: candidates.map((report) => ({
          bugNo: report.bugNo,
          title: report.title,
          status: report.status,
          repairTaskStatus: report.repairTaskStatus,
        })),
      };
    }

    const reconciled = [];
    for (const report of candidates) {
      const before = this.toWorkflowSnapshot(report);
      const payload = this.payloadObject(report.repairTaskPayload);
      report.status = 'IN_PROGRESS';
      report.closedAt = null;
      report.repairTaskStatus = 'HOLD';
      report.resolutionNote = '历史 Agent 结果缺少严格实现、验证或发布证据，已自动转为 HOLD；需要按新证据门禁重新派发和验收。';
      report.repairTaskPayload = {
        ...payload,
        evidenceReconciliation: {
          previousStatus: before.status,
          previousRepairTaskStatus: before.repairTaskStatus,
          reason: 'legacy AGENT_COMPLETED did not prove implementation commit, acceptance validation, CI/CD, and production smoke',
          reconciledAt: new Date().toISOString(),
          reconciledBy: this.safeText(user.username ?? user.name ?? 'bug-intake-reconciler', 128),
        },
      };
      report.updatedBy = this.safeText(user.username ?? user.name ?? 'bug-intake-reconciler', 128);
      const saved = await this.repo.save(report);
      await this.writeAudit('RECONCILE_FALSE_COMPLETION', saved.bugNo, user, before, this.toWorkflowSnapshot(saved), reqMeta);
      reconciled.push(saved.bugNo);
    }
    return { decision: 'FALSE_COMPLETIONS_RECONCILED', apply: true, count: reconciled.length, bugNos: reconciled };
  }

  async autoTriagePipeline(user: BugReportUser, reqMeta: { ip?: string; userAgent?: string }) {
    const candidates = await this.repo.createQueryBuilder('b')
      .where('b.status IN (:...statuses)', { statuses: ['OPEN', 'TRIAGED', 'IN_PROGRESS'] })
      .orWhere('b.repairTaskStatus IN (:...repairStatuses)', { repairStatuses: ['HOLD', 'AGENT_RUNNING', 'AGENT_APPROVED'] })
      .orderBy('b.updatedAt', 'ASC')
      .take(100)
      .getMany();

    const results: Array<Record<string, unknown>> = [];
    for (const report of candidates) {
      const before = this.toWorkflowSnapshot(report);
      const payload = this.payloadObject(report.repairTaskPayload);
      const classification = this.classifyReport(report);
      const stale = this.staleWorkflowState(report);
      let changed = false;
      let action = 'CLASSIFIED';

      const nextPayload: Record<string, unknown> = {
        ...payload,
        failureClassification: classification,
        failureClassificationUpdatedAt: new Date().toISOString(),
      };

      if (!report.priority || report.priority === 'P2') {
        report.priority = classification.priority;
        changed = true;
      }
      if (!report.moduleCode) {
        report.moduleCode = classification.category;
        changed = true;
      }

      if (!report.repairTaskNo && classification.autoFixEligible) {
        const taskNo = await this.nextRepairTaskNo();
        report.repairTaskNo = taskNo;
        report.repairTaskStatus = 'READY';
        report.status = report.status === 'OPEN' ? 'TRIAGED' : report.status;
        Object.assign(nextPayload, this.buildRepairTaskPayload(report, taskNo, user, {
          acceptanceCriteria: `按自动分类 ${classification.category} 修复：${classification.suggestedFix}`,
          suggestedOwner: classification.ownerRecommendation,
        }));
        action = 'REPAIR_TASK_CREATED';
        changed = true;
      }

      if (report.repairTaskNo && !nextPayload.agentPlan && classification.autoFixEligible) {
        const agentPlan = this.buildAgentPlan(this.buildAgentRouteText(report), report, classification);
        nextPayload.agentPlan = agentPlan;
        nextPayload.agentPlanGeneratedAt = new Date().toISOString();
        nextPayload.agentPlanGeneratedBy = 'bug-intake-auto-triage';
        report.repairTaskStatus = agentPlan.route_decision === 'HOLD' ? 'HOLD' : 'ROUTED';
        action = action === 'CLASSIFIED' ? 'AGENT_PLAN_CREATED' : `${action}+AGENT_PLAN_CREATED`;
        changed = true;
      }

      if (stale.isStale) {
        nextPayload.timeoutRecovery = {
          previousStatus: report.repairTaskStatus,
          staleMinutes: stale.ageMinutes,
          recoveredAt: new Date().toISOString(),
          action: 'set HOLD and require local runner recovery/re-dispatch',
        };
        report.repairTaskStatus = 'HOLD';
        report.status = 'IN_PROGRESS';
        action = `${action}+TIMEOUT_HOLD`;
        changed = true;
        await this.createPipelineAlert('BUG_INTAKE_RUNNER_TIMEOUT', 'WARNING', `问题修复任务超时：${report.bugNo}`, {
          bugNo: report.bugNo,
          title: report.title,
          staleMinutes: stale.ageMinutes,
          classification,
        }, `/bug-reports?bugNo=${encodeURIComponent(report.bugNo)}`);
      }

      if (report.repairTaskStatus === 'HOLD' && classification.recommendedAgents.length > 0) {
        nextPayload.holdDispatch = {
          generatedAt: new Date().toISOString(),
          source: 'auto-triage',
          recommendedAgents: classification.recommendedAgents,
          ownerRecommendation: classification.ownerRecommendation,
          requiresApproval: true,
          nextAction: '管理员确认后投入 Agent 队列；安全类/DB/部署类仍需人工 Gate。',
          reason: classification.suggestedFix,
        };
        action = `${action}+HOLD_DISPATCH_CANDIDATE`;
        changed = true;
        await this.createPipelineAlert('BUG_INTAKE_PIPELINE_HOLD', classification.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING', `问题进入 HOLD 分派：${report.bugNo}`, {
          bugNo: report.bugNo,
          title: report.title,
          classification,
        }, `/bug-reports?bugNo=${encodeURIComponent(report.bugNo)}`);
      }

      if (changed) {
        report.repairTaskPayload = nextPayload;
        report.updatedBy = this.safeText(user.username ?? user.name ?? 'bug-intake-auto-triage', 128);
        const saved = await this.repo.save(report);
        await this.writeAudit('BUG_PIPELINE_AUTO_TRIAGE', saved.bugNo, user, before, {
          ...this.toWorkflowSnapshot(saved),
          failureClassification: classification,
          action,
        }, reqMeta);
        results.push({ bugNo: saved.bugNo, action, classification, repairTaskStatus: saved.repairTaskStatus });
      } else {
        results.push({ bugNo: report.bugNo, action: 'CLASSIFIED_NO_STATE_CHANGE', classification, repairTaskStatus: report.repairTaskStatus });
      }
    }

    await this.createPipelineAlert('BUG_INTAKE_AUTO_TRIAGE', results.some((row) => String(row.action).includes('HOLD')) ? 'WARNING' : 'INFO', 'Bug Intake 自动分类/恢复已运行', {
      processed: results.length,
      holdDispatch: results.filter((row) => String(row.action).includes('HOLD_DISPATCH')).length,
      timeoutHold: results.filter((row) => String(row.action).includes('TIMEOUT_HOLD')).length,
    }, '/bug-reports');

    return {
      generatedAt: new Date().toISOString(),
      decision: results.some((row) => String(row.action).includes('TIMEOUT_HOLD')) ? 'GO_WITH_HOLD_ITEMS' : 'GO',
      processed: results.length,
      results,
      status: await this.pipelineStatus(),
    };
  }

  async create(payload: BugReportPayload, files: Express.Multer.File[], user: BugReportUser, reqMeta: { ip?: string; userAgent?: string }) {
    if (!payload.title?.trim()) throw new BadRequestException('问题标题不能为空');
    const bugNo = await this.nextBugNo();
    const attachments = this.saveAttachments(bugNo, files ?? []);
    const roles = this.normalizeRoles(payload.roles, user);

    const report = this.repo.create({
      bugNo,
      title: this.safeText(payload.title, 160),
      description: this.safeText(payload.description ?? '', 10_000),
      severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(payload.severity ?? '')
        ? payload.severity
        : 'MEDIUM',
      status: 'OPEN',
      route: this.safeText(payload.route ?? '', 255),
      url: this.safeText(payload.url ?? '', 2048),
      reporterUserId: this.safeText(String(user.userId ?? user.id ?? ''), 64),
      reporterUsername: this.safeText(user.username ?? '', 128),
      reporterName: this.safeText(user.name ?? user.realNameZh ?? user.username ?? '', 128),
      roles,
      companyCode: this.safeCode(payload.companyCode ?? ''),
      projectCode: this.safeCode(payload.projectCode ?? ''),
      consoleErrors: this.limitArray(payload.consoleErrors),
      failedRequests: this.limitArray(payload.failedRequests),
      attachments,
      clientContext: this.safeContext(payload.clientContext, reqMeta),
    });

    const saved = await this.repo.save(report);
    await this.writeAudit('CREATE', saved.bugNo, user, null, {
      bugNo: saved.bugNo,
      title: saved.title,
      route: saved.route,
      attachmentCount: attachments.length,
    }, reqMeta);
    return this.toDto(saved);
  }

  async list(params: { page?: number; limit?: number; status?: string; keyword?: string }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const qb = this.repo.createQueryBuilder('b');
    if (params.status) qb.andWhere('b.status = :status', { status: params.status });
    if (params.keyword?.trim()) {
      qb.andWhere('(b.bugNo ILIKE :kw OR b.title ILIKE :kw OR b.route ILIKE :kw OR b.reporterUsername ILIKE :kw)', {
        kw: `%${params.keyword.trim()}%`,
      });
    }
    const [items, total] = await qb
      .orderBy('b.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { items: items.map(row => this.toListDto(row)), total, page, limit };
  }

  async detail(bugNo: string) {
    const report = await this.repo.findOne({ where: { bugNo } });
    if (!report) throw new NotFoundException(`问题 ${bugNo} 不存在`);
    return this.toDto(report);
  }

  async updateStatus(bugNo: string, body: { status?: string; resolutionNote?: string }, user: BugReportUser, reqMeta: { ip?: string; userAgent?: string }) {
    const report = await this.repo.findOne({ where: { bugNo } });
    if (!report) throw new NotFoundException(`问题 ${bugNo} 不存在`);
    if (!body.status || !(VALID_STATUSES as readonly string[]).includes(body.status)) {
      throw new BadRequestException(`无效状态: ${body.status ?? ''}`);
    }
    this.assertVerifiedClosure(report, body.status, body.resolutionNote);
    const before = { status: report.status, resolutionNote: report.resolutionNote };
    report.status = body.status;
    report.resolutionNote = this.safeText(body.resolutionNote ?? report.resolutionNote ?? '', 10_000);
    if (body.status === 'RESOLVED' && report.repairTaskNo) report.repairTaskStatus = 'BUSINESS_VERIFIED';
    report.closedAt = ['RESOLVED', 'CLOSED', 'REJECTED'].includes(body.status) ? (report.closedAt ?? new Date()) : null;
    report.updatedBy = this.safeText(user.username ?? user.name ?? '', 128);
    const saved = await this.repo.save(report);
    await this.writeAudit('UPDATE', saved.bugNo, user, before, {
      status: saved.status,
      resolutionNote: saved.resolutionNote,
    }, reqMeta);
    return this.toDto(saved);
  }

  async updateTriage(bugNo: string, body: BugTriagePayload, user: BugReportUser, reqMeta: { ip?: string; userAgent?: string }) {
    const report = await this.repo.findOne({ where: { bugNo } });
    if (!report) throw new NotFoundException(`问题 ${bugNo} 不存在`);

    const nextStatus = body.status || report.status;
    if (!(VALID_STATUSES as readonly string[]).includes(nextStatus)) {
      throw new BadRequestException(`无效状态: ${nextStatus}`);
    }
    const nextPriority = body.priority || report.priority || 'P2';
    if (!(VALID_PRIORITIES as readonly string[]).includes(nextPriority)) {
      throw new BadRequestException(`无效优先级: ${nextPriority}`);
    }
    this.assertVerifiedClosure(report, nextStatus, body.resolutionNote);

    const before = this.toWorkflowSnapshot(report);
    report.status = nextStatus;
    report.priority = nextPriority;
    report.moduleCode = this.safeCode(body.moduleCode ?? report.moduleCode ?? '').slice(0, 64);
    report.assigneeUsername = this.safeCode(body.assigneeUsername ?? report.assigneeUsername ?? '').slice(0, 128);
    report.assigneeName = this.safeText(body.assigneeName ?? report.assigneeName ?? '', 128);
    report.resolutionNote = this.safeText(body.resolutionNote ?? report.resolutionNote ?? '', 10_000);
    report.updatedBy = this.safeText(user.username ?? user.name ?? '', 128);
    if (nextStatus === 'RESOLVED' && report.repairTaskNo) report.repairTaskStatus = 'BUSINESS_VERIFIED';
    if (['RESOLVED', 'CLOSED', 'REJECTED'].includes(nextStatus)) {
      report.closedAt = report.closedAt ?? new Date();
    } else {
      report.closedAt = null;
    }

    const saved = await this.repo.save(report);
    await this.writeAudit('TRIAGE', saved.bugNo, user, before, this.toWorkflowSnapshot(saved), reqMeta);
    return this.toDto(saved);
  }

  async createRepairTask(bugNo: string, body: BugRepairTaskPayload, user: BugReportUser, reqMeta: { ip?: string; userAgent?: string }) {
    const report = await this.repo.findOne({ where: { bugNo } });
    if (!report) throw new NotFoundException(`问题 ${bugNo} 不存在`);
    const taskNo = report.repairTaskNo || await this.nextRepairTaskNo();
    const before = this.toWorkflowSnapshot(report);
    const payload = this.buildRepairTaskPayload(report, taskNo, user, body);

    report.repairTaskNo = taskNo;
    report.repairTaskStatus = 'READY';
    report.repairTaskPayload = payload;
    report.status = report.status === 'OPEN' ? 'TRIAGED' : report.status;
    report.updatedBy = this.safeText(user.username ?? user.name ?? '', 128);
    const saved = await this.repo.save(report);
    await this.writeAudit('CREATE_REPAIR_TASK', saved.bugNo, user, before, this.toWorkflowSnapshot(saved), reqMeta);
    return this.toDto(saved);
  }

  async generateAgentPlan(bugNo: string, user: BugReportUser, reqMeta: { ip?: string; userAgent?: string }) {
    const report = await this.repo.findOne({ where: { bugNo } });
    if (!report) throw new NotFoundException(`问题 ${bugNo} 不存在`);
    if (!report.repairTaskNo) throw new BadRequestException('请先生成修复任务包');
    const before = this.toWorkflowSnapshot(report);
    const routeText = this.buildAgentRouteText(report);
    const agentPlan = this.buildAgentPlan(routeText, report);
    const payload = {
      ...(report.repairTaskPayload || {}),
      agentPlan,
      agentPlanGeneratedAt: new Date().toISOString(),
      agentPlanGeneratedBy: this.safeText(user.username ?? user.name ?? '', 128),
    };
    report.repairTaskPayload = payload;
    report.repairTaskStatus = agentPlan.route_decision === 'HOLD' ? 'HOLD' : 'ROUTED';
    report.updatedBy = this.safeText(user.username ?? user.name ?? '', 128);
    const saved = await this.repo.save(report);
    await this.writeAudit('GENERATE_AGENT_PLAN', saved.bugNo, user, before, this.toWorkflowSnapshot(saved), reqMeta);
    return this.toDto(saved);
  }

  async approveAgentExecution(
    bugNo: string,
    body: BugAgentApprovalPayload,
    user: BugReportUser,
    reqMeta: { ip?: string; userAgent?: string },
  ) {
    const report = await this.repo.findOne({ where: { bugNo } });
    if (!report) throw new NotFoundException(`问题 ${bugNo} 不存在`);
    if (!report.repairTaskNo) throw new BadRequestException('请先生成修复任务包');

    const payload = report.repairTaskPayload && typeof report.repairTaskPayload === 'object'
      ? report.repairTaskPayload as Record<string, unknown>
      : {};
    if (!payload.agentPlan) throw new BadRequestException('请先生成 Agent 修复计划');

    const before = this.toWorkflowSnapshot(report);
    const approval = {
      approved: true,
      approvedBy: this.safeText(user.username ?? user.name ?? '', 128),
      approvedAt: new Date().toISOString(),
      approvalScope: this.safeText(body.approvalScope ?? 'approve agent queue handoff for generated agentPlan only', 1000),
      forbiddenActions: [
        'production deploy without separate approval',
        'database write without separate gate',
        'migration execution without separate gate',
        'push without release approval',
        'force push',
      ],
    };
    report.repairTaskPayload = {
      ...payload,
      agentExecutionApproval: approval,
    };
    report.repairTaskStatus = 'AGENT_APPROVED';
    report.status = report.status === 'OPEN' ? 'TRIAGED' : report.status;
    report.updatedBy = this.safeText(user.username ?? user.name ?? '', 128);

    const saved = await this.repo.save(report);
    await this.writeAudit('APPROVE_AGENT_EXECUTION', saved.bugNo, user, before, this.toWorkflowSnapshot(saved), reqMeta);
    return this.toDto(saved);
  }

  async redispatchRepairTask(
    bugNo: string,
    body: BugRedispatchPayload,
    user: BugReportUser,
    reqMeta: { ip?: string; userAgent?: string },
  ) {
    const report = await this.repo.findOne({ where: { bugNo } });
    if (!report) throw new NotFoundException(`问题 ${bugNo} 不存在`);
    if (['CLOSED', 'REJECTED'].includes(report.status)) {
      throw new BadRequestException('已关闭或已驳回的问题不能直接重新派发，请先重新打开并确认仍需修复');
    }

    const before = this.toWorkflowSnapshot(report);
    const operator = this.safeText(user.username ?? user.name ?? 'bug-intake-admin', 128);
    const mode = body.mode === 'REPLAN_AND_REQUEUE' ? 'REPLAN_AND_REQUEUE' : 'REQUEUE';
    const taskNo = report.repairTaskNo || await this.nextRepairTaskNo();
    let payload: Record<string, unknown> = this.payloadObject(report.repairTaskPayload);

    if (!report.repairTaskNo || Object.keys(payload).length === 0) {
      payload = this.buildRepairTaskPayload(report, taskNo, user, {
        acceptanceCriteria: report.resolutionNote || '管理员重新派发原问题，按当前上下文完成修复、回测、回写。',
        suggestedOwner: report.assigneeUsername || '',
      });
    }

    const classification = this.classifyReport(report);
    let agentPlan = this.payloadObject(payload.agentPlan);
    if (mode === 'REPLAN_AND_REQUEUE' || Object.keys(agentPlan).length === 0) {
      agentPlan = this.buildAgentPlan(this.buildAgentRouteText(report), report, classification);
      payload = {
        ...payload,
        failureClassification: classification,
        failureClassificationUpdatedAt: new Date().toISOString(),
        agentPlan,
        agentPlanGeneratedAt: new Date().toISOString(),
        agentPlanGeneratedBy: `redispatch:${operator}`,
      };
    }

    const selectedAgents = Array.isArray(agentPlan.selected_agents) ? agentPlan.selected_agents.map(String) : [];
    if (selectedAgents.length === 0 || agentPlan.route_decision === 'HOLD') {
      report.repairTaskNo = taskNo;
      report.repairTaskStatus = 'HOLD';
      report.status = 'IN_PROGRESS';
      report.repairTaskPayload = {
        ...payload,
        redispatchRejectedAt: new Date().toISOString(),
        redispatchRejectedBy: operator,
        redispatchRejectedReason: 'agent plan is HOLD or has no selected_agents',
      };
      report.updatedBy = operator;
      const saved = await this.repo.save(report);
      await this.writeAudit('REDISPATCH_AGENT_TASK_HOLD', saved.bugNo, user, before, this.toWorkflowSnapshot(saved), reqMeta);
      return this.toDto(saved);
    }

    const previousResults = Array.isArray(payload.agentResults) ? payload.agentResults : [];
    const redispatchCount = Number(payload.redispatchCount || 0) + 1;
    const redispatchHistory = [
      ...(Array.isArray(payload.redispatchHistory) ? payload.redispatchHistory : []),
      {
        redispatchNo: redispatchCount,
        mode,
        redispatchedAt: new Date().toISOString(),
        redispatchedBy: operator,
        previousStatus: report.status,
        previousRepairTaskStatus: report.repairTaskStatus || '',
        selectedAgents,
        approvalScope: this.safeText(body.approvalScope ?? '', 1000),
        note: this.safeText(body.note ?? '', 1000),
      },
    ].slice(-20);

    report.repairTaskNo = taskNo;
    report.status = 'IN_PROGRESS';
    report.repairTaskStatus = 'AGENT_APPROVED';
    report.repairTaskPayload = {
      ...payload,
      taskNo,
      bugNo: report.bugNo,
      agentPlan,
      agentExecutionApproval: {
        approved: true,
        approvedBy: operator,
        approvedAt: new Date().toISOString(),
        approvalScope: this.safeText(
          body.approvalScope
          ?? 'redispatch original bug intake repair task to the local Agent queue',
          1000,
        ),
        redispatch: true,
        redispatchCount,
        forbiddenActions: [
          'production deploy without separate approval',
          'database write without separate gate',
          'migration execution without separate gate',
          'push without release approval',
          'force push',
        ],
      },
      redispatchCount,
      redispatchHistory,
      previousAgentResultsBeforeRedispatch: previousResults.slice(-10),
      timeoutRecovery: this.payloadObject(payload.timeoutRecovery),
      latestAgentResult: this.payloadObject(payload.latestAgentResult),
    };
    report.updatedBy = operator;

    const saved = await this.repo.save(report);
    await this.writeAudit('REDISPATCH_AGENT_TASK', saved.bugNo, user, before, {
      ...this.toWorkflowSnapshot(saved),
      redispatchCount,
      selectedAgents,
      mode,
    }, reqMeta);
    await this.createPipelineAlert('BUG_INTAKE_REDISPATCH', 'INFO', `问题已重新派发：${saved.bugNo}`, {
      bugNo: saved.bugNo,
      title: saved.title,
      redispatchCount,
      selectedAgents,
      mode,
    }, `/bug-reports?bugNo=${encodeURIComponent(saved.bugNo)}`);
    return this.toDto(saved);
  }

  async recordAgentResult(
    bugNo: string,
    body: BugAgentResultPayload,
    user: BugReportUser,
    reqMeta: { ip?: string; userAgent?: string },
  ) {
    const report = await this.repo.findOne({ where: { bugNo } });
    if (!report) throw new NotFoundException(`问题 ${bugNo} 不存在`);
    if (!report.repairTaskNo) throw new BadRequestException('请先生成修复任务包');

    const payload = report.repairTaskPayload && typeof report.repairTaskPayload === 'object'
      ? report.repairTaskPayload as Record<string, unknown>
      : {};
    const before = this.toWorkflowSnapshot(report);
    const normalizedConclusion = this.normalizeAgentConclusion(body.conclusion);
    const agentResult = {
      taskId: this.safeCode(body.taskId ?? ''),
      agent: this.safeText(body.agent ?? '', 128),
      conclusion: normalizedConclusion,
      resultFile: this.safeText(body.resultFile ?? '', 512),
      commitHash: this.safeText(body.commitHash ?? '', 64),
      changedFiles: this.limitArray(body.changedFiles),
      validationResults: body.validationResults ?? null,
      summary: this.safeText(body.summary ?? '', 4000),
      nextAction: this.safeText(body.nextAction ?? '', 1000),
      recordedBy: this.safeText(user.username ?? user.name ?? 'agent-result-sync', 128),
      recordedAt: new Date().toISOString(),
    };
    const existing = Array.isArray(payload.agentResults) ? payload.agentResults as Record<string, unknown>[] : [];
    const agentResults = [
      ...existing.filter((item) => item.taskId !== agentResult.taskId || !agentResult.taskId),
      agentResult,
    ];

    report.repairTaskPayload = {
      ...payload,
      agentResults,
      latestAgentResult: agentResult,
    };
    const isRunnerLifecycle = agentResult.agent === 'BugIntakeLocalRunner';
    if (isRunnerLifecycle) {
      const lifecycle = this.runnerLifecycleEvidence(agentResult);
      report.repairTaskStatus = lifecycle.passed ? 'FIX_READY_FOR_UAT' : 'HOLD';
      report.status = 'IN_PROGRESS';
      report.resolutionNote = lifecycle.passed
        ? '实现证据、CI/CD 与生产路由 smoke 已通过，等待管理员执行业务验收；验收通过后方可标记已解决。'
        : `自动修复生命周期证据不完整，保持 HOLD：${lifecycle.reason}`;
    } else if (['HOLD', 'FAIL'].includes(normalizedConclusion)) {
      report.repairTaskStatus = 'HOLD';
      report.status = 'IN_PROGRESS';
    } else if (this.agentPlanCompleted(payload.agentPlan, agentResults)) {
      const evidence = this.agentPlanEvidence(payload.agentPlan, agentResults);
      report.repairTaskStatus = evidence.passed ? 'AGENT_EXECUTION_FINISHED' : 'HOLD';
      report.status = 'IN_PROGRESS';
      report.resolutionNote = evidence.passed
        ? 'Agent 执行证据已齐全，等待 push、CI/CD 和生产路由 smoke；此状态不代表问题已解决。'
        : `Agent 任务虽然结束，但修复证据不完整，保持 HOLD：${evidence.reason}`;
    } else {
      report.repairTaskStatus = 'AGENT_RUNNING';
      report.status = report.status === 'OPEN' ? 'TRIAGED' : 'IN_PROGRESS';
    }
    report.updatedBy = this.safeText(user.username ?? user.name ?? 'agent-result-sync', 128);

    const saved = await this.repo.save(report);
    await this.writeAudit('RECORD_AGENT_RESULT', saved.bugNo, user, before, this.toWorkflowSnapshot(saved), reqMeta);
    return this.toDto(saved);
  }

  async getAttachment(bugNo: string, fileName: string) {
    const report = await this.repo.findOne({ where: { bugNo } });
    if (!report) throw new NotFoundException(`问题 ${bugNo} 不存在`);
    const attachments = Array.isArray(report.attachments) ? report.attachments as BugAttachment[] : [];
    const target = attachments.find(item => item?.fileName === fileName);
    if (!target?.relativePath) throw new NotFoundException('附件不存在');
    const root = resolve(process.cwd(), BUG_STORAGE_ROOT);
    const filePath = resolve(process.cwd(), target.relativePath);
    if (filePath !== root && !filePath.startsWith(`${root}/`)) {
      throw new BadRequestException('附件路径非法');
    }
    if (!existsSync(filePath)) {
      throw new NotFoundException('附件文件不存在');
    }
    const stat = statSync(filePath);
    if (!stat.isFile()) {
      throw new NotFoundException('附件文件不存在');
    }
    return {
      stream: createReadStream(filePath),
      mimeType: this.safeText(target.mimeType ?? 'application/octet-stream', 128),
      originalName: this.safeText(target.originalName ?? fileName, 255),
    };
  }

  private buildRepairTaskPayload(report: BugReportEntity, taskNo: string, user: BugReportUser, body: BugRepairTaskPayload) {
    return {
      taskNo,
      bugNo: report.bugNo,
      title: report.title,
      severity: report.severity,
      priority: report.priority || 'P2',
      moduleCode: report.moduleCode,
      route: report.route,
      url: report.url,
      reporter: {
        username: report.reporterUsername,
        name: report.reporterName,
        roles: report.roles,
        companyCode: report.companyCode,
        projectCode: report.projectCode,
      },
      context: {
        consoleErrors: report.consoleErrors,
        failedRequests: report.failedRequests,
        clientContext: report.clientContext,
        attachments: report.attachments,
      },
      repairGuardrails: {
        autoRepairExecuted: false,
        requiresHumanApproval: true,
        noProductionDeploy: true,
        noDbWriteWithoutGate: true,
      },
      acceptanceCriteria: this.safeText(body.acceptanceCriteria ?? '', 4000),
      suggestedOwner: this.safeText(body.suggestedOwner ?? report.assigneeUsername ?? '', 128),
      createdBy: this.safeText(user.username ?? user.name ?? 'bug-intake-auto-triage', 128),
      createdAt: new Date().toISOString(),
    };
  }

  private classifyReport(report: BugReportEntity): FailureClassification {
    const failedText = Array.isArray(report.failedRequests) ? JSON.stringify(report.failedRequests).toLowerCase() : '';
    const consoleText = Array.isArray(report.consoleErrors) ? JSON.stringify(report.consoleErrors).toLowerCase() : '';
    const text = [
      report.title,
      report.description,
      report.route,
      report.url,
      report.moduleCode,
      failedText,
      consoleText,
      JSON.stringify(report.clientContext || {}),
      JSON.stringify(this.payloadObject(report.repairTaskPayload).latestAgentResult || {}),
    ].join('\n').toLowerCase();
    const evidence: string[] = [];
    const has = (pattern: RegExp, label: string) => {
      const matched = pattern.test(text);
      if (matched) evidence.push(label);
      return matched;
    };

    if (has(/pg|postgres|sql|column .* ambiguous|does not exist|violates|syntax error|parameter \$\d|数据库|字段|迁移|migration/, '数据库/PG/SQL 信号')) {
      return this.classification('PG_SQL', 'HIGH', 0.92, 'P1', 'A3-Backend-Critical-Path', ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate'], true, true, evidence, '定位 SQL/ORM 查询并补充类型、别名、字段或迁移门禁验证。');
    }
    if (has(/http[^\n]*(500|502|503)|\b500\b|unhandled|exception|请求失败|接口报错|api/i, 'API 5xx/异常信号')) {
      return this.classification('API_5XX', 'HIGH', 0.88, 'P1', 'A3-Backend-Critical-Path', ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate'], true, true, evidence, '复现失败接口，修正后端异常并补充 A1 回归验证。');
    }
    if (has(/\b403\b|forbidden|menu_permission_denied|rbac|datascope|权限|角色|越权|无权限|guard|acl/, '权限/RBAC/DataScope 信号')) {
      return this.classification('RBAC_403', 'HIGH', 0.9, 'P1', 'A2-Security-Regression-Gate', ['A2-Security-Regression-Gate', 'A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate'], true, true, evidence, '对齐菜单码、角色权限和 DataScope，避免前端透传无权限入口。');
    }
    if (has(/\b401\b|unauthorized|token|登录|认证|auth|session/, '认证/Token 信号')) {
      return this.classification('AUTH_401', 'HIGH', 0.86, 'P1', 'A2-Security-Regression-Gate', ['A2-Security-Regression-Gate', 'A1-CI-Runtime-Gate'], true, true, evidence, '检查登录态、token 刷新、拦截器和权限 Guard。');
    }
    if (has(/页面加载失败|render|hydration|component|react|next\.js|typeerror|cannot read|undefined|前端|页面|ui|ux|样式|按钮|弹窗|抽屉|手机端|移动端|卡片|不好看|丑/, '前端渲染/UI 信号')) {
      return this.classification('FRONTEND_RENDER', 'MEDIUM', 0.82, 'P2', 'A4-Frontend-UAT-Smoke', ['A4-Frontend-UAT-Smoke', 'A1-CI-Runtime-Gate'], true, false, evidence, '修正页面状态、空态、样式或组件交互，并执行 Web typecheck/route smoke。');
    }
    if (has(/主数据|字典|重复|mapping|readiness|门店|公司|供应商|客户|项目|账户|好业财|chanjet|数据不准|口径/, '数据 readiness/主数据/好业财信号')) {
      return this.classification('DATA_READINESS', 'MEDIUM', 0.8, 'P2', 'A5-Data-Readiness', ['A5-Data-Readiness', 'A1-CI-Runtime-Gate'], true, true, evidence, '只读核验主数据/中间层/字段映射，输出差异与安全修正候选。');
    }
    if (has(/deploy|部署|push|ci|cd|runner|queue|队列|卡住|timeout|超时|hold|finalize|baseline/, '部署/Runner/队列信号')) {
      return this.classification('RUNNER_OR_DEPLOY', 'HIGH', 0.78, 'P1', 'Codex-Orchestrator', ['Codex-Orchestrator', 'A1-CI-Runtime-Gate'], false, true, evidence, '先做队列/Runner/CI 状态诊断，禁止盲目部署或写库。');
    }
    return this.classification('UNKNOWN', 'MEDIUM', 0.42, 'P2', 'Codex-Orchestrator', ['Codex-Orchestrator'], false, true, ['未命中稳定分类规则'], '进入 route-review，补充复现路径后再分派。');
  }

  private classification(
    category: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    confidence: number,
    priority: 'P0' | 'P1' | 'P2' | 'P3',
    ownerRecommendation: string,
    recommendedAgents: string[],
    autoFixEligible: boolean,
    requiresHumanGate: boolean,
    evidence: string[],
    suggestedFix: string,
  ): FailureClassification {
    return {
      category,
      severity,
      confidence,
      priority,
      ownerRecommendation,
      recommendedAgents,
      autoFixEligible,
      requiresHumanGate,
      evidence: evidence.slice(0, 8),
      suggestedFix,
    };
  }

  private staleWorkflowState(report: BugReportEntity) {
    if (!['AGENT_RUNNING', 'AGENT_APPROVED'].includes(report.repairTaskStatus || '')) {
      return { isStale: false, ageMinutes: 0 };
    }
    const updatedAt = report.updatedAt ? new Date(report.updatedAt).getTime() : Date.now();
    const ageMinutes = Math.max(0, Math.round((Date.now() - updatedAt) / 60000));
    const threshold = report.repairTaskStatus === 'AGENT_RUNNING' ? STALE_AGENT_RUNNING_MINUTES : STALE_AGENT_APPROVED_MINUTES;
    return { isStale: ageMinutes >= threshold, ageMinutes };
  }

  private async createPipelineAlert(alertType: string, severity: 'INFO' | 'WARNING' | 'CRITICAL', title: string, detail: Record<string, unknown>, relatedPath: string) {
    try {
      const duplicate = await this.ds.query<any[]>(
        `SELECT id
           FROM sys_alerts
          WHERE resolved = FALSE
            AND alert_type = $1
            AND title = $2
            AND COALESCE(related_path, '') = COALESCE($3, '')
            AND created_at > NOW() - INTERVAL '10 minutes'
          ORDER BY created_at DESC
          LIMIT 1`,
        [alertType, title, relatedPath],
      );
      if (duplicate[0]?.id) return Number(duplicate[0].id);
      const rows = await this.ds.query<any[]>(
        `INSERT INTO sys_alerts (alert_type, severity, title, detail, related_path)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [alertType, severity, title, JSON.stringify(detail), relatedPath],
      );
      return Number(rows[0]?.id ?? 0);
    } catch {
      return 0;
    }
  }

  private payloadObject(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  }

  private toPipelineQueueItem(row: Record<string, any>) {
    const payload = this.payloadObject(row.repair_task_payload);
    const runtime = this.extractPipelineRuntime(payload);
    const updatedAt = row.updated_at ? new Date(row.updated_at) : new Date();
    const ageMinutes = Math.max(0, Math.round((Date.now() - updatedAt.getTime()) / 60000));
    const failureClassification = this.payloadObject(payload.failureClassification);
    const holdDispatch = this.payloadObject(payload.holdDispatch);
    const timeoutRecovery = this.payloadObject(payload.timeoutRecovery);
    const redispatchHistory = Array.isArray(payload.redispatchHistory)
      ? payload.redispatchHistory.filter((item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      : [];
    const lastRedispatch = redispatchHistory[redispatchHistory.length - 1] || null;
    const nextAction = String(
      holdDispatch.nextAction
      || runtime.latestAgentResult?.nextAction
      || timeoutRecovery.action
      || this.pipelineNextAction(row.repair_task_status, row.status, runtime),
    );
    const blockingReason = this.pipelineBlockingReason(row.repair_task_status, row.status, runtime, timeoutRecovery, failureClassification);
    const recommendedOperation = this.pipelineRecommendedOperation(row.repair_task_status, runtime, blockingReason);
    const autoRecoveryEligible = this.pipelineAutoRecoveryEligible(row.repair_task_status, runtime, blockingReason);
    const recommendedAgents = Array.isArray(holdDispatch.recommendedAgents)
      ? holdDispatch.recommendedAgents.map(String)
      : runtime.selectedAgents;
    const safetyLane = this.pipelineSafetyLane(row.repair_task_status, row.status, runtime, recommendedAgents);
    const canRedispatchSafely = this.pipelineCanRedispatchSafely(
      row.repair_task_no,
      row.repair_task_status,
      row.status,
      runtime,
      safetyLane,
      autoRecoveryEligible,
    );

    return {
      bugNo: row.bug_no,
      title: row.title,
      status: row.status,
      severity: row.severity,
      priority: row.priority,
      moduleCode: row.module_code,
      assigneeUsername: row.assignee_username,
      assigneeName: row.assignee_name,
      repairTaskNo: row.repair_task_no,
      repairTaskStatus: row.repair_task_status,
      route: row.route,
      updatedAt: row.updated_at,
      ageMinutes,
      failureCategory: failureClassification.category || null,
      classificationConfidence: failureClassification.confidence ?? null,
      suggestedFix: failureClassification.suggestedFix || null,
      recommendedAgents,
      selectedAgents: runtime.selectedAgents,
      safetyLane,
      canRedispatchSafely,
      retryCount: runtime.retryCount,
      redispatchCount: Number(payload.redispatchCount || 0),
      lastRedispatchAt: typeof lastRedispatch?.redispatchedAt === 'string' ? lastRedispatch.redispatchedAt : null,
      failedAttemptCount: runtime.failedAttemptCount,
      latestAgentConclusion: runtime.latestAgentResult?.conclusion || null,
      latestAgentName: runtime.latestAgentResult?.agent || null,
      latestRunnerConclusion: runtime.latestRunnerResult?.conclusion || null,
      latestRunnerSummary: runtime.latestRunnerResult?.summary || null,
      latestCommitHash: runtime.latestCommitHash,
      resultFiles: runtime.resultFiles,
      validationSummary: runtime.validationSummary,
      timeoutRecovery: Object.keys(timeoutRecovery).length > 0 ? timeoutRecovery : null,
      blockingReason,
      recommendedOperation,
      autoRecoveryEligible,
      nextAction,
      artifactReady: runtime.resultFiles.length > 0 || Boolean(runtime.latestCommitHash),
    };
  }

  private extractPipelineRuntime(payload: Record<string, any>) {
    const agentPlan = this.payloadObject(payload.agentPlan);
    const selectedAgents = Array.isArray(agentPlan.selected_agents) ? agentPlan.selected_agents.map(String) : [];
    const agentResults = Array.isArray(payload.agentResults)
      ? payload.agentResults.filter((item: unknown): item is Record<string, any> => Boolean(item && typeof item === 'object'))
      : [];
    const latestAgentResultPayload = this.payloadObject(payload.latestAgentResult);
    const runnerResults = agentResults.filter((item) => String(item.agent || '') === 'BugIntakeLocalRunner');
    const latestRunnerResult = runnerResults.length ? runnerResults[runnerResults.length - 1] : null;
    const latestAgentResult = Object.keys(latestAgentResultPayload).length > 0
      ? latestAgentResultPayload
      : agentResults[agentResults.length - 1] || null;
    const failedAttemptCount = agentResults.filter((item) => /HOLD|FAIL|ERROR/.test(String(item.conclusion || '').toUpperCase())).length;
    const resultFiles = Array.from(new Set(agentResults.map((item) => String(item.resultFile || '')).filter(Boolean))).slice(-6);
    const commitHashes = Array.from(new Set(agentResults.map((item) => String(item.commitHash || '')).filter(Boolean))).slice(-4);
    const latestCommitHash = commitHashes[commitHashes.length - 1] || '';
    const retryCount = Math.max(
      failedAttemptCount,
      Number(payload.retryCount || 0),
      Number(this.payloadObject(payload.timeoutRecovery).retryCount || 0),
    );
    const validationSummary = this.compactValidationSummary(latestRunnerResult?.validationResults || latestAgentResult?.validationResults);

    return {
      selectedAgents,
      agentResults,
      latestAgentResult,
      latestRunnerResult,
      retryCount,
      failedAttemptCount,
      resultFiles,
      latestCommitHash,
      validationSummary,
    };
  }

  private compactValidationSummary(value: unknown) {
    if (!value) return null;
    if (typeof value === 'string') return value.slice(0, 300);
    if (Array.isArray(value)) {
      return value.slice(0, 5).map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('；').slice(0, 300);
    }
    if (typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .slice(0, 8)
        .map(([key, val]) => `${key}: ${typeof val === 'string' ? val : JSON.stringify(val)}`)
        .join('；')
        .slice(0, 300);
    }
    return String(value).slice(0, 300);
  }

  private pipelineNextAction(repairTaskStatus: unknown, status: unknown, runtime: ReturnType<BugIntakeService['extractPipelineRuntime']>) {
    const repairStatus = String(repairTaskStatus || '');
    if (!repairStatus) return '等待管理员受理并生成修复任务包';
    if (repairStatus === 'READY') return '等待生成 Agent 修复计划';
    if (repairStatus === 'ROUTED') return '等待管理员批准投入本地 runner 队列';
    if (repairStatus === 'AGENT_APPROVED') return '等待本地 runner 领取任务';
    if (repairStatus === 'AGENT_RUNNING') return '本地 runner 执行中，超时后自动 HOLD';
    if (repairStatus === 'HOLD') return runtime.latestAgentResult?.nextAction || '需要重新分派或人工 Gate';
    if (repairStatus === 'AGENT_COMPLETED' || String(status) === 'RESOLVED') return '等待业务验收关闭';
    return '等待下一步处理';
  }

  private pipelineBlockingReason(
    repairTaskStatus: unknown,
    status: unknown,
    runtime: ReturnType<BugIntakeService['extractPipelineRuntime']>,
    timeoutRecovery: Record<string, any>,
    failureClassification: Record<string, any>,
  ) {
    const repairStatus = String(repairTaskStatus || '');
    if (Object.keys(timeoutRecovery).length > 0) {
      return `超时恢复：${timeoutRecovery.action || 'runner lease 已进入 HOLD'}`;
    }
    if (repairStatus === 'HOLD') {
      if (runtime.failedAttemptCount > 0) return `Agent/Runner 最近失败 ${runtime.failedAttemptCount} 次`;
      return failureClassification.category ? `自动分类后等待分派：${failureClassification.category}` : 'HOLD 等待管理员重新派发';
    }
    if (repairStatus === 'AGENT_APPROVED') return '已批准，等待本地常驻 runner 领取';
    if (repairStatus === 'AGENT_RUNNING') return '本地 runner 正在执行，若超时会自动 HOLD';
    if (repairStatus === 'READY') return '已有修复任务包，等待生成 Agent 计划';
    if (repairStatus === 'ROUTED') return '已生成 Agent 计划，等待管理员批准';
    if (repairStatus === 'AGENT_COMPLETED' || String(status) === 'RESOLVED') {
      return runtime.latestCommitHash ? '已有提交回写，等待业务验收' : 'Agent 已完成，等待产物/提交回写确认';
    }
    return '未发现阻塞';
  }

  private pipelineRecommendedOperation(
    repairTaskStatus: unknown,
    runtime: ReturnType<BugIntakeService['extractPipelineRuntime']>,
    blockingReason: string,
  ) {
    const repairStatus = String(repairTaskStatus || '');
    if (repairStatus === 'HOLD') {
      if (runtime.failedAttemptCount >= 3) return '人工复核后重算 Agent 计划再派发';
      return '点击“重算后派发”或“重新派发”进入本地 runner';
    }
    if (repairStatus === 'AGENT_APPROVED') return '保持本地 runner 常驻；必要时运行自动分类/恢复';
    if (repairStatus === 'AGENT_RUNNING') return '等待 runner 回写；超时后由自动分类转 HOLD';
    if (repairStatus === 'ROUTED') return '管理员确认范围后批准投入 Agent 队列';
    if (repairStatus === 'READY') return '生成 Agent 修复计划';
    if (/已有提交|已完成/.test(blockingReason)) return '安排业务验收，通过后关闭问题';
    return '无阻塞，等待下一轮处理';
  }

  private pipelineAutoRecoveryEligible(
    repairTaskStatus: unknown,
    runtime: ReturnType<BugIntakeService['extractPipelineRuntime']>,
    blockingReason: string,
  ) {
    const repairStatus = String(repairTaskStatus || '');
    if (repairStatus === 'AGENT_APPROVED' || repairStatus === 'AGENT_RUNNING') return true;
    if (repairStatus === 'HOLD' && runtime.failedAttemptCount > 0 && runtime.failedAttemptCount < 3) return true;
    if (/超时恢复|runner/i.test(blockingReason) && runtime.failedAttemptCount < 3) return true;
    return false;
  }

  private pipelineSafetyLane(
    repairTaskStatus: unknown,
    status: unknown,
    runtime: ReturnType<BugIntakeService['extractPipelineRuntime']>,
    recommendedAgents: string[],
  ) {
    const repairStatus = String(repairTaskStatus || '');
    if (repairStatus === 'AGENT_COMPLETED' || String(status) === 'RESOLVED' || String(status) === 'CLOSED') {
      return 'DONE_OR_VERIFY';
    }
    const agents = Array.from(new Set([...(recommendedAgents || []), ...(runtime.selectedAgents || [])].filter(Boolean)));
    if (agents.some((agent) => agent.includes('A6-') || agent.includes('A7-'))) return 'RELEASE_GATE';
    if (agents.some((agent) => agent.includes('A3-') || agent.includes('A4-'))) return 'CODE_REPAIR';
    if (agents.length > 0 && agents.every((agent) => agent.includes('A1-') || agent.includes('A2-') || agent.includes('A5-'))) {
      return 'READ_ONLY_VALIDATION';
    }
    if (agents.some((agent) => agent.includes('Codex-Orchestrator')) || repairStatus === 'HOLD' || repairStatus === 'READY' || repairStatus === 'ROUTED') {
      return 'ROUTE_REVIEW';
    }
    return 'ROUTE_REVIEW';
  }

  private pipelineCanRedispatchSafely(
    repairTaskNo: unknown,
    repairTaskStatus: unknown,
    status: unknown,
    runtime: ReturnType<BugIntakeService['extractPipelineRuntime']>,
    safetyLane: string,
    autoRecoveryEligible: boolean,
  ) {
    if (!repairTaskNo) return false;
    const repairStatus = String(repairTaskStatus || '');
    if (['RESOLVED', 'CLOSED', 'REJECTED'].includes(String(status || ''))) return false;
    if (repairStatus === 'AGENT_COMPLETED') return false;
    if (runtime.failedAttemptCount >= 3) return false;
    if (safetyLane === 'CODE_REPAIR' || safetyLane === 'RELEASE_GATE') return false;
    if (autoRecoveryEligible) return true;
    return ['READY', 'ROUTED', 'HOLD', 'AGENT_APPROVED'].includes(repairStatus);
  }

  private buildPipelineRuntimeSummary(rows: Record<string, any>[]) {
    const items = rows.map((row) => this.toPipelineQueueItem(row));
    const latestRunner = items.find((item) => item.latestRunnerConclusion || item.latestCommitHash);
    const blocked = items.filter((item) => item.repairTaskStatus === 'HOLD');
    const waitingRunner = items.filter((item) => item.repairTaskStatus === 'AGENT_APPROVED');
    const running = items.filter((item) => item.repairTaskStatus === 'AGENT_RUNNING');
    const artifactCount = items.filter((item) => item.artifactReady).length;
    const autoRecoverableCount = items.filter((item) => item.autoRecoveryEligible).length;
    const readOnlyValidationCount = items.filter((item) => item.safetyLane === 'READ_ONLY_VALIDATION').length;
    const codeRepairCount = items.filter((item) => item.safetyLane === 'CODE_REPAIR').length;
    const releaseGateCount = items.filter((item) => item.safetyLane === 'RELEASE_GATE').length;
    const routeReviewCount = items.filter((item) => item.safetyLane === 'ROUTE_REVIEW').length;
    const queueHealthScore = Math.max(
      0,
      Math.min(100, 100 - blocked.length * 18 - running.length * 5 - waitingRunner.length * 4 + artifactCount * 3),
    );

    return {
      queueVisibleCount: items.length,
      blockedCount: blocked.length,
      waitingRunnerCount: waitingRunner.length,
      runningCount: running.length,
      artifactReadyCount: artifactCount,
      autoRecoverableCount,
      readOnlyValidationCount,
      codeRepairCount,
      releaseGateCount,
      routeReviewCount,
      queueHealthScore,
      latestRunnerConclusion: latestRunner?.latestRunnerConclusion || null,
      latestRunnerSummary: latestRunner?.latestRunnerSummary || null,
      latestCommitHash: latestRunner?.latestCommitHash || null,
      recommendedImmediateAction: blocked[0]?.nextAction || running[0]?.nextAction || waitingRunner[0]?.nextAction || '队列无明显阻塞，保持 runner 常驻监听。',
    };
  }

  private async nextBugNo() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (let i = 0; i < 5; i++) {
      const rows = await this.ds.query<{ bug_no: string }[]>(
        `SELECT bug_no FROM bug_reports WHERE bug_no LIKE $1 ORDER BY bug_no DESC LIMIT 1`,
        [`BUG-${dateStr}-%`],
      );
      const last = rows[0]?.bug_no?.split('-').pop() ?? '0000';
      const seq = String(Number(last) + 1 + i).padStart(4, '0');
      const candidate = `BUG-${dateStr}-${seq}`;
      const exists = await this.repo.exist({ where: { bugNo: candidate } });
      if (!exists) return candidate;
    }
    return `BUG-${dateStr}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private async nextRepairTaskNo() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (let i = 0; i < 5; i++) {
      const rows = await this.ds.query<{ repair_task_no: string }[]>(
        `SELECT repair_task_no FROM bug_reports WHERE repair_task_no LIKE $1 ORDER BY repair_task_no DESC LIMIT 1`,
        [`BUGTASK-${dateStr}-%`],
      );
      const last = rows[0]?.repair_task_no?.split('-').pop() ?? '0000';
      const seq = String(Number(last) + 1 + i).padStart(4, '0');
      const candidate = `BUGTASK-${dateStr}-${seq}`;
      const exists = await this.repo.exist({ where: { repairTaskNo: candidate } });
      if (!exists) return candidate;
    }
    return `BUGTASK-${dateStr}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private saveAttachments(bugNo: string, files: Express.Multer.File[]) {
    if (files.length > MAX_SCREENSHOT_COUNT) {
      throw new BadRequestException(`最多上传 ${MAX_SCREENSHOT_COUNT} 个截图/附件`);
    }
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dir = join(process.cwd(), BUG_STORAGE_ROOT, year, month, day, bugNo);
    mkdirSync(dir, { recursive: true });

    return files.map((file, index) => {
      const ext = extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) throw new BadRequestException('截图仅支持 PNG/JPG/WebP/PDF');
      const fileName = `${String(index + 1).padStart(2, '0')}-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
      const absPath = join(dir, fileName);
      writeFileSync(absPath, file.buffer);
      const relativePath = join(BUG_STORAGE_ROOT, year, month, day, bugNo, fileName);
      return {
        fileName,
        originalName: basename(file.originalname).slice(0, 255),
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: file.size,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
        relativePath,
        previewEndpoint: `/api/bug-intake/reports/${bugNo}/attachments/${encodeURIComponent(fileName)}`,
      };
    });
  }

  private normalizeRoles(payloadRoles: unknown, user: BugReportUser) {
    const roles = Array.isArray(payloadRoles) ? payloadRoles : (Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []));
    return roles.map(role => this.safeCode(role)).filter(Boolean).slice(0, 20);
  }

  private limitArray(value: unknown) {
    return (Array.isArray(value) ? value : []).slice(-MAX_JSON_ITEMS);
  }

  private safeContext(context: unknown, reqMeta: { ip?: string; userAgent?: string }) {
    const obj = context && typeof context === 'object' && !Array.isArray(context) ? context as Record<string, unknown> : {};
    return {
      ...obj,
      userAgent: reqMeta.userAgent ?? obj.userAgent ?? '',
      capturedAt: new Date().toISOString(),
    };
  }

  private async writeAudit(action: string, bugNo: string, user: BugReportUser, beforeValue: unknown, afterValue: unknown, reqMeta: { ip?: string; userAgent?: string }) {
    const rawUserId = Number(user.userId ?? user.id ?? 0);
    const userId = Number.isFinite(rawUserId) && rawUserId > 0 ? rawUserId : 0;
    const userName = this.safeText(user.name ?? user.realNameZh ?? user.username ?? 'unknown', 64) || 'unknown';
    try {
      await this.ds.query(
        `INSERT INTO sys_audit_log
          (user_id, user_name, action, entity_type, entity_id, before_value, after_value, ip_addr, user_agent)
         VALUES ($1,$2,$3,'BUG_REPORT',$4,$5,$6,$7,$8)`,
        [
          userId,
          userName,
          action,
          bugNo,
          beforeValue ? JSON.stringify(beforeValue) : null,
          afterValue ? JSON.stringify(afterValue) : null,
          reqMeta.ip ?? null,
          reqMeta.userAgent ?? null,
        ],
      );
    } catch {
      /* audit failure must not block bug intake */
    }
  }

  private toListDto(report: BugReportEntity) {
    return {
      id: report.id,
      bugNo: report.bugNo,
      title: report.title,
      severity: report.severity,
      status: report.status,
      priority: report.priority,
      moduleCode: report.moduleCode,
      assigneeUsername: report.assigneeUsername,
      assigneeName: report.assigneeName,
      repairTaskNo: report.repairTaskNo,
      repairTaskStatus: report.repairTaskStatus,
      route: report.route,
      reporterUsername: report.reporterUsername,
      reporterName: report.reporterName,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      closedAt: report.closedAt,
      attachmentCount: Array.isArray(report.attachments) ? report.attachments.length : 0,
    };
  }

  private toDto(report: BugReportEntity) {
    return {
      ...this.toListDto(report),
      description: report.description,
      url: report.url,
      reporterUserId: report.reporterUserId,
      roles: report.roles,
      companyCode: report.companyCode,
      projectCode: report.projectCode,
      consoleErrors: report.consoleErrors,
      failedRequests: report.failedRequests,
      attachments: report.attachments,
      clientContext: report.clientContext,
      resolutionNote: report.resolutionNote,
      repairTaskPayload: report.repairTaskPayload,
      updatedBy: report.updatedBy,
    };
  }

  private toWorkflowSnapshot(report: BugReportEntity) {
    return {
      status: report.status,
      priority: report.priority,
      moduleCode: report.moduleCode,
      assigneeUsername: report.assigneeUsername,
      assigneeName: report.assigneeName,
      repairTaskNo: report.repairTaskNo,
      repairTaskStatus: report.repairTaskStatus,
      resolutionNote: report.resolutionNote,
      closedAt: report.closedAt,
    };
  }

  private buildAgentRouteText(report: BugReportEntity) {
    const failedRequests = Array.isArray(report.failedRequests)
      ? report.failedRequests.map((item) => JSON.stringify(item)).join('\n')
      : '';
    const consoleErrors = Array.isArray(report.consoleErrors)
      ? report.consoleErrors.map((item) => JSON.stringify(item)).join('\n')
      : '';
    return [
      report.title,
      report.description,
      `route: ${report.route}`,
      `module: ${report.moduleCode}`,
      `severity: ${report.severity}`,
      `failed requests: ${failedRequests}`,
      `console errors: ${consoleErrors}`,
      `attachments: ${JSON.stringify(report.attachments || [])}`,
      `client context: ${JSON.stringify(report.clientContext || {})}`,
      '需要生成修复计划并执行 A1 验证。',
    ].filter(Boolean).join('\n');
  }

  private buildAgentPlan(routeText: string, report: BugReportEntity, classification?: FailureClassification) {
    const text = routeText.toLowerCase();
    const selected = new Set<string>();
    const reasons: Record<string, string[]> = {};
    const add = (agent: string, reason: string) => {
      selected.add(agent);
      reasons[agent] = [...(reasons[agent] || []), reason];
    };

    if (/apps\/web|frontend|前端|页面|ui|ux|样式|按钮|弹窗|抽屉|移动端|web|dashboard|卡片|截图|视觉|不好看|丑|layout|style/.test(text)) {
      add('A4-Frontend-UAT-Smoke', 'frontend/UI route or wording matched');
    }
    if (/apps\/api|backend|后端|api|500|sql|pg|controller|service|接口|unhandled|http 5/.test(text)) {
      add('A3-Backend-Critical-Path', 'backend/API/error route matched');
    }
    if (/rbac|datascope|权限|角色|越权|菜单|guard|acl|auth|401|403/.test(text)) {
      add('A2-Security-Regression-Gate', 'security/RBAC/DataScope signal matched');
    }
    if (/数据|字典|主数据|mapping|readiness|门店|公司|供应商|客户|项目|账户|好业财|chanjet/.test(text)) {
      add('A5-Data-Readiness', 'data readiness/master data signal matched');
    }
    if (/deploy|部署|staging|production|上线|rollback|回滚/.test(text)) {
      add('A6-Staging-Deploy-Runbook', 'deploy/runbook signal matched');
      add('A7-Final-QA-Gate', 'release gate signal matched');
    }
    for (const agent of classification?.recommendedAgents ?? []) {
      add(agent, `failure classification ${classification?.category ?? 'UNKNOWN'}`);
    }
    add('A1-CI-Runtime-Gate', 'required validation after repair');

    if (selected.size === 1 && selected.has('A1-CI-Runtime-Gate')) {
      add('Codex-Orchestrator', 'low-confidence route review required');
    }

    const order = [
      'A2-Security-Regression-Gate',
      'A3-Backend-Critical-Path',
      'A4-Frontend-UAT-Smoke',
      'A5-Data-Readiness',
      'A1-CI-Runtime-Gate',
      'A6-Staging-Deploy-Runbook',
      'A7-Final-QA-Gate',
      'Codex-Orchestrator',
    ];
    const selectedAgents = order.filter((agent) => selected.has(agent));
    const routeDecision = selectedAgents.includes('Codex-Orchestrator') && selectedAgents.length <= 2 ? 'ROUTE_REVIEW' : 'PLAN_READY';
    return {
      route_decision: routeDecision,
      source_bug_no: report.bugNo,
      source_repair_task_no: report.repairTaskNo,
      failure_category: classification?.category ?? null,
      route_confidence: classification?.confidence ?? null,
      selected_agents: selectedAgents,
      split_strategy: selectedAgents.map((agent) => ({
        agent,
        reasons: reasons[agent] || [],
        approval_required: true,
        execution_mode: 'dry-run-first',
      })),
      hard_constraints: [
        'no automatic production deploy',
        'no automatic DB write',
        'no automatic migration',
        'human approval required before code repair execution',
      ],
    };
  }

  private safeText(value: unknown, maxLength: number) {
    return String(value ?? '').trim().slice(0, maxLength);
  }

  private assertVerifiedClosure(report: BugReportEntity, nextStatus: string, resolutionNote: unknown) {
    if (!report.repairTaskNo) return;
    if (nextStatus === 'RESOLVED') {
      if (report.repairTaskStatus !== 'FIX_READY_FOR_UAT') {
        throw new BadRequestException('问题尚未通过实现证据、CI/CD 和生产 smoke，不能标记已解决');
      }
      if (this.safeText(resolutionNote ?? report.resolutionNote, 10_000).length < 5) {
        throw new BadRequestException('业务验收通过后必须填写验收结论');
      }
    }
    if (nextStatus === 'CLOSED' && !(report.status === 'RESOLVED' && report.repairTaskStatus === 'BUSINESS_VERIFIED')) {
      throw new BadRequestException('问题必须先完成业务验收并标记已解决，之后才能关闭');
    }
  }

  private safeCode(value: unknown) {
    return String(value ?? '').trim().replace(/[^\w:.-]/g, '_').slice(0, 128);
  }

  private normalizeAgentConclusion(value: unknown) {
    const normalized = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '_');
    if (['GO', 'PASS', 'PASS_WITH_CONDITIONS', 'GO_WITH_CONDITIONS', 'NOT_APPLICABLE', 'HOLD', 'FAIL'].includes(normalized)) {
      return normalized;
    }
    return 'HOLD';
  }

  private agentPlanCompleted(agentPlan: unknown, agentResults: Record<string, unknown>[]) {
    const plan = agentPlan && typeof agentPlan === 'object' ? agentPlan as Record<string, unknown> : {};
    const selectedAgents = Array.isArray(plan.selected_agents) ? plan.selected_agents.map((item) => String(item)) : [];
    if (selectedAgents.length === 0) return false;
    const completedAgents = new Set<string>();
    for (const item of agentResults) {
      const conclusion = String(item.conclusion ?? '');
      if (['GO', 'PASS', 'PASS_WITH_CONDITIONS', 'GO_WITH_CONDITIONS', 'NOT_APPLICABLE'].includes(conclusion)) {
        completedAgents.add(String(item.agent ?? ''));
      }

    }
    return selectedAgents.every((agent) => completedAgents.has(agent));
  }

  private agentPlanEvidence(agentPlan: unknown, agentResults: Record<string, unknown>[]) {
    const plan = this.payloadObject(agentPlan);
    const selectedAgents = Array.isArray(plan.selected_agents) ? plan.selected_agents.map(String) : [];
    const selectedResults = selectedAgents.map((agent) => [...agentResults].reverse().find((item) => String(item.agent ?? '') === agent));
    if (selectedResults.some((item) => !item)) return { passed: false, reason: 'selected Agent result is missing' };
    const implementation = selectedResults.filter((item) => {
      const validation = this.payloadObject(item?.validationResults);
      const gate = this.payloadObject(validation.evidenceGate);
      return gate.passed === true && gate.role === 'implementation' &&
        Array.isArray(item?.changedFiles) && item.changedFiles.length > 0 && Boolean(item?.commitHash);
    });
    if (implementation.length === 0) return { passed: false, reason: 'no Agent supplied verified business implementation evidence' };
    if (selectedAgents.includes('A1-CI-Runtime-Gate')) {
      const a1 = selectedResults.find((item) => String(item?.agent ?? '') === 'A1-CI-Runtime-Gate');
      const a1Gate = this.payloadObject(this.payloadObject(a1?.validationResults).evidenceGate);
      if (a1Gate.passed !== true || a1Gate.role !== 'validation') return { passed: false, reason: 'A1 validation evidence is missing' };
    }
    return { passed: true, reason: '' };
  }

  private runnerLifecycleEvidence(agentResult: Record<string, unknown>) {
    const validation = this.payloadObject(agentResult.validationResults);
    const required = ['releaseEvidence', 'push', 'ci', 'productionSmoke'];
    const failed = required.filter((key) => String(validation[key] ?? '') !== 'PASS');
    if (failed.length > 0) return { passed: false, reason: `missing PASS: ${failed.join(', ')}` };
    return { passed: true, reason: '' };
  }
}
