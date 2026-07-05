import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { createReadStream, mkdirSync, writeFileSync } from 'fs';
import { basename, extname, join, resolve } from 'path';
import { DataSource, Repository } from 'typeorm';
import { BugReportEntity } from './bug-report.entity';

const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf']);
const MAX_SCREENSHOT_COUNT = 5;
const MAX_JSON_ITEMS = 30;
const BUG_STORAGE_ROOT = 'storage/bug-reports';
const VALID_STATUSES = ['OPEN', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED'] as const;
const VALID_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;

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

@Injectable()
export class BugIntakeService {
  constructor(
    @InjectRepository(BugReportEntity)
    private readonly repo: Repository<BugReportEntity>,
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

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
    const before = { status: report.status, resolutionNote: report.resolutionNote };
    report.status = body.status;
    report.resolutionNote = this.safeText(body.resolutionNote ?? report.resolutionNote ?? '', 10_000);
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

    const before = this.toWorkflowSnapshot(report);
    report.status = nextStatus;
    report.priority = nextPriority;
    report.moduleCode = this.safeCode(body.moduleCode ?? report.moduleCode ?? '').slice(0, 64);
    report.assigneeUsername = this.safeCode(body.assigneeUsername ?? report.assigneeUsername ?? '').slice(0, 128);
    report.assigneeName = this.safeText(body.assigneeName ?? report.assigneeName ?? '', 128);
    report.resolutionNote = this.safeText(body.resolutionNote ?? report.resolutionNote ?? '', 10_000);
    report.updatedBy = this.safeText(user.username ?? user.name ?? '', 128);
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
    const payload = {
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
      createdBy: this.safeText(user.username ?? user.name ?? '', 128),
      createdAt: new Date().toISOString(),
    };

    report.repairTaskNo = taskNo;
    report.repairTaskStatus = 'READY';
    report.repairTaskPayload = payload;
    report.status = report.status === 'OPEN' ? 'TRIAGED' : report.status;
    report.updatedBy = this.safeText(user.username ?? user.name ?? '', 128);
    const saved = await this.repo.save(report);
    await this.writeAudit('CREATE_REPAIR_TASK', saved.bugNo, user, before, this.toWorkflowSnapshot(saved), reqMeta);
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
    if (!filePath.startsWith(root)) throw new BadRequestException('附件路径非法');
    return {
      stream: createReadStream(filePath),
      mimeType: this.safeText(target.mimeType ?? 'application/octet-stream', 128),
      originalName: this.safeText(target.originalName ?? fileName, 255),
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

  private safeText(value: unknown, maxLength: number) {
    return String(value ?? '').trim().slice(0, maxLength);
  }

  private safeCode(value: unknown) {
    return String(value ?? '').trim().replace(/[^\w:.-]/g, '_').slice(0, 128);
  }
}
