import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { format } from 'date-fns';
import { ClsService } from 'nestjs-cls';
import { ApprovalEngineService } from '../../approval-engine/approval-engine.service';
import { CapitalAggregationService } from './capital-aggregation.service';
import { DataScopeContext } from '../../org/services/data-scope.service';

import { ShrProjectEntity } from '../entities/shr-project.entity';
import { ShrShareholderEntity } from '../entities/shr-shareholder.entity';
import { ShrProjectEquityEntity } from '../entities/shr-project-equity.entity';
import { ShrCapitalContributionEntity } from '../entities/shr-capital-contribution.entity';
import { ShrShareholderScopeEntity } from '../entities/shr-shareholder-scope.entity';
import { ShrBeneficialEquityEntity } from '../entities/shr-beneficial-equity.entity';
import {
  CreateProjectDto, UpdateProjectDto, CreateShareholderDto, UpdateShareholderDto,
  CreateEquityDto, UpdateEquityDto, CreateContributionDto, CreateScopeDto,
} from '../dto/shareholder.dto';

@Injectable()
export class ShareholderService {
  constructor(
    @InjectRepository(ShrProjectEntity)        private readonly projectRepo: Repository<ShrProjectEntity>,
    @InjectRepository(ShrShareholderEntity)    private readonly shRepo: Repository<ShrShareholderEntity>,
    @InjectRepository(ShrProjectEquityEntity)  private readonly equityRepo: Repository<ShrProjectEquityEntity>,
    @InjectRepository(ShrCapitalContributionEntity) private readonly contribRepo: Repository<ShrCapitalContributionEntity>,
    @InjectRepository(ShrShareholderScopeEntity)    private readonly scopeRepo: Repository<ShrShareholderScopeEntity>,
    @InjectRepository(ShrBeneficialEquityEntity)    private readonly beneficialRepo: Repository<ShrBeneficialEquityEntity>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly aggregation: CapitalAggregationService,
    private readonly cls: ClsService,
  ) {}

  // ════════════════ 资本流引擎（Phase 3）════════════════
  private readonly financeWriteRoles = new Set([
    'ROLE_ADMIN',
    'ROLE_FIN_CFO',
    'ROLE_FIN_ACCT',
    'ROLE_FIN_COST',
    'ROLE_GROUP_FINANCE',
    'ROLE_HQ_FINANCE',
    'ROLE_FACTORY_ACCOUNTANT',
    'ROLE_CASHIER',
    'ROLE_CASH',
    'ROLE_TREASURY_MANAGER',
    'ROLE_MENGSAI_DONGPENG_TREASURER',
  ]);

  private assertFinanceCapitalOperator(user: { userId?: string; roles?: string[] } | undefined, action: string) {
    const roles = Array.isArray(user?.roles) ? user.roles.map(String) : [];
    const allowed = roles.some(role => this.financeWriteRoles.has(role));
    if (!allowed) {
      throw new ForbiddenException(`仅财务角色或管理员可${action}资本流；股东本人仅允许查看授权范围内记录`);
    }
  }

  /** UX Enhancement：解析用户可见项目集合 → SQL/repo 过滤条件。'ALL'→null(不限)；[]→空集合(看不到)。 */
  private async scopeProjectIn(user?: { userId: string; roles: string[] }): Promise<string[] | null> {
    if (!user || !user.userId) return null; // 无用户上下文(内部调用)不收窄
    const access = await this.resolveAccessibleProjects(user.userId, user.roles ?? []);
    if (access === 'ALL') return null;
    return access; // string[]（可能为空 → 看不到任何项目）
  }

  /** 资本流列表（可按项目/股东/状态过滤；按股东 scope 收窄项目范围，防越权） */
  async listFlows(opts: { projectCode?: string; shareholderCode?: string; status?: string } = {}, user?: { userId: string; roles: string[] }) {
    const where: any = {};
    if (opts.shareholderCode) where.shareholderCode = opts.shareholderCode;
    if (opts.status) where.status = opts.status;
    const allowed = await this.scopeProjectIn(user);
    if (allowed !== null) {
      // 与显式 projectCode 取交集
      const list = opts.projectCode ? allowed.filter(c => c === opts.projectCode) : allowed;
      if (list.length === 0) return [];
      where.projectCode = In(list);
    } else if (opts.projectCode) {
      where.projectCode = opts.projectCode;
    }
    return this.contribRepo.find({ where, order: { createdAt: 'DESC' }, take: 500 });
  }
  async getFlow(id: string, user?: { userId: string; roles: string[] }) {
    const f = await this.contribRepo.findOne({ where: { id } });
    if (!f) throw new NotFoundException(`资本流不存在: ${id}`);
    const allowed = await this.scopeProjectIn(user);
    if (allowed !== null && !allowed.includes(f.projectCode)) {
      throw new NotFoundException(`无权查看该资本流（不在股东查看范围内）`);
    }
    return f;
  }

  /** 草稿期更新附件（attachment_urls + attachment_count 同步；仅 DRAFT 可改） */
  async updateFlowAttachments(id: string, urls: string[], user?: { userId: string; roles: string[] }) {
    this.assertFinanceCapitalOperator(user, '维护');
    const f = await this.getFlow(id, user);
    if (f.status !== 'DRAFT') throw new ConflictException(`仅草稿状态可修改附件，当前: ${f.status}`);
    f.attachmentUrls = Array.isArray(urls) ? urls : [];
    f.attachmentCount = f.attachmentUrls.length;
    return this.contribRepo.save(f);
  }

  /** 新增资本流（草稿） */
  async createFlow(dto: any, user?: { userId: string; roles: string[] }) {
    this.assertFinanceCapitalOperator(user, '新增');
    return this.ds.transaction(async (mgr) => {
      const no = await this.genCapitalFlowNo(mgr);
      const row = mgr.create(ShrCapitalContributionEntity, {
        capitalFlowNo: no,
        contributionNo: no,
        projectCode: dto.projectCode,
        shareholderCode: dto.shareholderCode,
        amount: dto.amount,
        currency: dto.currency ?? 'CNY',
        contributionDate: dto.contributionDate ?? null,
        sourceType: dto.sourceType ?? 'BANK_TRANSFER',
        sourceReference: dto.sourceReference ?? null,
        attachmentUrls: Array.isArray(dto.attachmentUrls) ? dto.attachmentUrls : null,
        attachmentCount: Array.isArray(dto.attachmentUrls) ? dto.attachmentUrls.length : (dto.attachmentCount ?? 0),
        remark: dto.remark ?? null,
        status: 'DRAFT',
        createdBy: user?.userId,
      } as any);
      return mgr.save(row);
    });
  }

  /** 提交审批：DRAFT → SUBMITTED + 发起 Workflow（分档审批） */
  async submitFlow(id: string, user?: { userId: string; roles: string[] }) {
    this.assertFinanceCapitalOperator(user, '提交审批');
    return this.ds.transaction(async (mgr) => {
      const f = await mgr.findOne(ShrCapitalContributionEntity, { where: { id } });
      if (!f) throw new NotFoundException(`资本流不存在: ${id}`);
      if (!['DRAFT', 'CANCELLED'].includes(f.status)) throw new ConflictException(`仅草稿可提交，当前: ${f.status}`);
      f.status = 'SUBMITTED';
      await mgr.save(f);
      const instance = await this.approvalEngine.startApproval(
        { bizType: 'SHAREHOLDER_CAPITAL', bizId: String(f.id), amount: Number(f.amount), projectCode: f.projectCode, currencyCode: f.currency } as any,
        mgr,
      );
      if (instance) { f.wfInstanceId = String((instance as any).id); await mgr.save(f); }
      return mgr.findOne(ShrCapitalContributionEntity, { where: { id } });
    });
  }

  /** 确认到账：APPROVED → CONFIRMED + 自动汇总（+amount） */
  async confirmFlow(id: string, user?: { userId: string; roles: string[] }) {
    this.assertFinanceCapitalOperator(user, '确认到账');
    return this.ds.transaction(async (mgr) => {
      const f = await mgr.findOne(ShrCapitalContributionEntity, { where: { id } });
      if (!f) throw new NotFoundException(`资本流不存在: ${id}`);
      if (f.status !== 'APPROVED') throw new ConflictException(`仅审批通过(APPROVED)可确认到账，当前: ${f.status}`);
      f.status = 'CONFIRMED';
      f.confirmedBy = user?.userId as any;
      f.confirmedAt = new Date();
      await mgr.save(f);
      await this.aggregation.applyConfirmed(f.projectCode, f.shareholderCode, Number(f.amount), mgr);
      return mgr.findOne(ShrCapitalContributionEntity, { where: { id } });
    });
  }

  /** 冲销：CONFIRMED → REVERSED + 自动反向汇总（-amount）+ 保留审计轨迹 */
  async reverseFlow(id: string, user?: { userId: string; roles: string[] }, reason?: string) {
    this.assertFinanceCapitalOperator(user, '冲销');
    return this.ds.transaction(async (mgr) => {
      const f = await mgr.findOne(ShrCapitalContributionEntity, { where: { id } });
      if (!f) throw new NotFoundException(`资本流不存在: ${id}`);
      if (f.status !== 'CONFIRMED') throw new ConflictException(`仅已确认(CONFIRMED)可冲销，当前: ${f.status}`);
      f.status = 'REVERSED';
      f.remark = [f.remark, `冲销: ${reason ?? ''}`].filter(Boolean).join(' | ');
      await mgr.save(f);
      // 反向汇总
      await this.aggregation.applyReversed(f.projectCode, f.shareholderCode, Number(f.amount), mgr);
      // 审计轨迹：插入 REVERSAL 记录（不参与 CONFIRMED 汇总）
      const rno = await this.genCapitalFlowNo(mgr);
      await mgr.save(mgr.create(ShrCapitalContributionEntity, {
        capitalFlowNo: rno, contributionNo: rno, projectCode: f.projectCode, shareholderCode: f.shareholderCode,
        amount: f.amount, currency: f.currency, sourceType: 'REVERSAL', status: 'REVERSED',
        reversalOfId: String(f.id), remark: `冲销 ${f.capitalFlowNo ?? f.contributionNo}: ${reason ?? ''}`, createdBy: user?.userId,
      } as any));
      return mgr.findOne(ShrCapitalContributionEntity, { where: { id } });
    });
  }

  private async genCapitalFlowNo(mgr: DataSource['manager']): Promise<string> {
    await mgr.query(`SELECT pg_advisory_xact_lock(hashtext('shr_capital_flow_no'))`);
    const ymd = format(new Date(), 'yyyyMMdd');
    const prefix = `CAP-${ymd}-`;
    const cnt = await mgr.query(
      `SELECT count(*)::int AS c FROM shr_capital_contributions WHERE capital_flow_no LIKE $1`, [`${prefix}%`]);
    return `${prefix}${String((cnt[0].c ?? 0) + 1).padStart(5, '0')}`;
  }

  /** 资本流仪表板统计：本月新增 / 最近 / 股东排名 / 项目排名 / 12月趋势（按 scope 收窄） */
  async capitalStats(user?: { userId: string; roles: string[] }) {
    const allowed = await this.scopeProjectIn(user);
    // 构造项目范围过滤片段（防越权）。allowed===null → 不限；[]→ 1=0；否则 IN(...)
    let pf = '';
    const params: any[] = [];
    if (allowed !== null) {
      if (allowed.length === 0) pf = ' AND 1=0';
      else { params.push(allowed); pf = ` AND project_code = ANY($1)`; }
    }
    const monthAdded = await this.ds.query(
      `SELECT coalesce(sum(amount),0)::numeric total, count(*)::int cnt
       FROM shr_capital_contributions
       WHERE status='CONFIRMED' AND date_trunc('month', coalesce(confirmed_at, created_at)) = date_trunc('month', now())${pf}`, params);
    const recentWhere: any = { status: 'CONFIRMED' };
    if (allowed !== null) { if (allowed.length === 0) return { monthAdded: { total: 0, count: 0 }, recent: [], shareholderRanking: [], projectRanking: [], monthlyTrend: [] }; recentWhere.projectCode = In(allowed); }
    const recent = await this.contribRepo.find({ where: recentWhere, order: { confirmedAt: 'DESC', createdAt: 'DESC' }, take: 8 });
    const byShareholder = await this.ds.query(
      `SELECT shareholder_code, coalesce(sum(amount),0)::numeric total
       FROM shr_capital_contributions WHERE status='CONFIRMED'${pf} GROUP BY shareholder_code ORDER BY total DESC LIMIT 10`, params);
    const byProject = await this.ds.query(
      `SELECT project_code, coalesce(sum(amount),0)::numeric total
       FROM shr_capital_contributions WHERE status='CONFIRMED'${pf} GROUP BY project_code ORDER BY total DESC`, params);
    // 12 个月趋势（按确认/创建月份分组）
    const trendRows = await this.ds.query(
      `SELECT to_char(date_trunc('month', coalesce(confirmed_at, created_at)),'YYYY-MM') ym,
              coalesce(sum(amount),0)::numeric total, count(*)::int cnt
       FROM shr_capital_contributions
       WHERE status='CONFIRMED'
         AND coalesce(confirmed_at, created_at) >= date_trunc('month', now()) - interval '11 months'${pf}
       GROUP BY 1 ORDER BY 1`, params);
    // 补零：生成最近 12 个月连续序列
    const trendMap = new Map<string, { total: number; count: number }>(
      trendRows.map((r: any) => [r.ym, { total: Number(r.total), count: r.cnt }]));
    const monthlyTrend: { ym: string; total: number; count: number }[] = [];
    const now = await this.ds.query(`SELECT to_char(generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month'),'YYYY-MM') ym`);
    for (const r of now) {
      const v = trendMap.get(r.ym);
      monthlyTrend.push({ ym: r.ym, total: v?.total ?? 0, count: v?.count ?? 0 });
    }
    return {
      monthAdded: { total: Number(monthAdded[0]?.total ?? 0), count: monthAdded[0]?.cnt ?? 0 },
      recent,
      shareholderRanking: byShareholder.map((r: any) => ({ shareholderCode: r.shareholder_code, total: Number(r.total) })),
      projectRanking: byProject.map((r: any) => ({ projectCode: r.project_code, total: Number(r.total) })),
      monthlyTrend,
    };
  }

  /** 实益出资结构（代持关系） */
  // G138：受益所有人也按股东 scope 收窄——原无 user 过滤 → 股东可越权看全部公司
  async listBeneficial(projectCode?: string, user?: { userId: string; roles: string[] }) {
    const allowed = await this.scopeProjectIn(user);
    let where: any = projectCode ? { projectCode } : {};
    if (allowed !== null) {
      const list = projectCode ? allowed.filter(c => c === projectCode) : allowed;
      if (list.length === 0) return [];
      where = { projectCode: In(list) };
    }
    return this.beneficialRepo.find({ where, order: { projectCode: 'ASC' } });
  }

  // ── 项目 ──────────────────────────────────────────────────────────────
  async listProjects(user?: { userId: string; roles: string[] }) {
    const rows = await this.projectRepo.find({ order: { projectCode: 'ASC' } });
    const allowed = await this.scopeProjectIn(user);
    const visibleRows = allowed === null ? rows : rows.filter((p) => allowed.includes(p.projectCode));
    // 附带股东人数与股比合计
    const stats = await this.ds.query(
      `SELECT project_code, count(*)::int AS holders, sum(equity_ratio)::numeric AS ratio_sum
       FROM shr_project_equity GROUP BY project_code`,
    );
    const m = new Map<string, any>(stats.map((s: any) => [s.project_code, s]));
    return visibleRows.map(p => ({
      ...p,
      holders: m.get(p.projectCode)?.holders ?? 0,
      ratioSum: Number(m.get(p.projectCode)?.ratio_sum ?? 0),
    }));
  }
  async getProject(code: string, user?: { userId: string; roles: string[] }) {
    const allowed = await this.scopeProjectIn(user);
    if (allowed !== null && !allowed.includes(code)) {
      throw new NotFoundException('无权查看该项目（不在股东查看范围内）');
    }
    const p = await this.projectRepo.findOne({ where: { projectCode: code } });
    if (!p) throw new NotFoundException(`项目不存在: ${code}`);
    const equity = await this.equityRepo.find({ where: { projectCode: code }, order: { equityRatio: 'DESC' } });
    return { ...p, equity };
  }
  async createProject(dto: CreateProjectDto) {
    const exist = await this.projectRepo.findOne({ where: { projectCode: dto.projectCode } });
    if (exist) throw new ConflictException(`项目编码已存在: ${dto.projectCode}`);
    return this.projectRepo.save(this.projectRepo.create(dto));
  }
  async updateProject(code: string, dto: UpdateProjectDto) {
    const p = await this.projectRepo.findOne({ where: { projectCode: code } });
    if (!p) throw new NotFoundException(`项目不存在: ${code}`);
    Object.assign(p, dto);
    return this.projectRepo.save(p);
  }

  // ── 股东 ──────────────────────────────────────────────────────────────
  listShareholders() { return this.shRepo.find({ order: { shareholderCode: 'ASC' } }); }
  async createShareholder(dto: CreateShareholderDto) {
    const exist = await this.shRepo.findOne({ where: { shareholderCode: dto.shareholderCode } });
    if (exist) throw new ConflictException(`股东编码已存在: ${dto.shareholderCode}`);
    return this.shRepo.save(this.shRepo.create(dto as any));
  }
  async updateShareholder(code: string, dto: UpdateShareholderDto) {
    const s = await this.shRepo.findOne({ where: { shareholderCode: code } });
    if (!s) throw new NotFoundException(`股东不存在: ${code}`);
    Object.assign(s, dto);
    return this.shRepo.save(s);
  }

  // ── 股权结构 ──────────────────────────────────────────────────────────
  // G138：股权结构按股东 scope 收窄——原无 user 过滤 → 股东可越权看全部公司股权（宋雷实证泄漏 SHR-VTE-FOOD）
  async listEquity(projectCode?: string, user?: { userId: string; roles: string[] }) {
    const allowed = await this.scopeProjectIn(user);
    let where: any = projectCode ? { projectCode } : {};
    if (allowed !== null) {
      const list = projectCode ? allowed.filter(c => c === projectCode) : allowed;
      if (list.length === 0) return [];
      where = { projectCode: In(list) };
    }
    return this.equityRepo.find({
      where,
      order: { projectCode: 'ASC', equityRatio: 'DESC' },
    });
  }
  async createEquity(dto: CreateEquityDto) {
    const exist = await this.equityRepo.findOne({ where: { projectCode: dto.projectCode, shareholderCode: dto.shareholderCode } });
    if (exist) throw new ConflictException('该项目下该股东股权已存在');
    return this.equityRepo.save(this.equityRepo.create(dto as any));
  }
  async updateEquity(id: string, dto: UpdateEquityDto) {
    const e = await this.equityRepo.findOne({ where: { id } });
    if (!e) throw new NotFoundException(`股权记录不存在: ${id}`);
    Object.assign(e, dto);
    return this.equityRepo.save(e);
  }

  // ── 出资台账 ──────────────────────────────────────────────────────────
  async listContributions(projectCode?: string, shareholderCode?: string, user?: { userId: string; roles: string[] }) {
    const where: any = {};
    if (shareholderCode) where.shareholderCode = shareholderCode;
    const allowed = await this.scopeProjectIn(user);
    if (allowed !== null) {
      const list = projectCode ? allowed.filter(c => c === projectCode) : allowed;
      if (list.length === 0) return [];
      where.projectCode = In(list);
    } else if (projectCode) {
      where.projectCode = projectCode;
    }
    return this.contribRepo.find({ where, order: { createdAt: 'DESC' } });
  }
  async createContribution(dto: CreateContributionDto, userId?: string) {
    return this.ds.transaction(async (mgr) => {
      await mgr.query(`SELECT pg_advisory_xact_lock(hashtext('shr_contribution_no'))`);
      const ym = format(new Date(), 'yyyyMM');
      const prefix = `SHR-CB-${ym}-`;
      const cnt = await mgr.query(
        `SELECT count(*)::int AS c FROM shr_capital_contributions WHERE contribution_no LIKE $1`, [`${prefix}%`]);
      const no = `${prefix}${String((cnt[0].c ?? 0) + 1).padStart(5, '0')}`;
      const row = mgr.create(ShrCapitalContributionEntity, { ...dto, contributionNo: no, createdBy: userId } as any);
      return mgr.save(row);
    });
  }
  async confirmContribution(id: string) {
    const c = await this.contribRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`出资记录不存在: ${id}`);
    if (c.status !== 'DRAFT') throw new ConflictException(`仅 DRAFT 可确认，当前: ${c.status}`);
    c.status = 'CONFIRMED';
    return this.contribRepo.save(c);
  }
  async cancelContribution(id: string) {
    const c = await this.contribRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`出资记录不存在: ${id}`);
    if (c.status === 'CANCELLED') throw new ConflictException('已取消');
    c.status = 'CANCELLED';
    return this.contribRepo.save(c);
  }

  // ── 股东查看范围 ──────────────────────────────────────────────────────
  listScopes(userId?: string) {
    return this.scopeRepo.find({ where: userId ? { userId } : {}, order: { userId: 'ASC' } });
  }
  createScope(dto: CreateScopeDto) {
    return this.scopeRepo.save(this.scopeRepo.create({ ...dto, userId: String(dto.userId) } as any));
  }
  async deleteScope(id: string) {
    const s = await this.scopeRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`scope 不存在: ${id}`);
    await this.scopeRepo.remove(s);
    return { deleted: true, id };
  }

  // ── 股东驾驶舱（scope 驱动）──────────────────────────────────────────────
  private async resolveDataScopeProjects(): Promise<string[] | 'ALL' | null> {
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    if (!scope) return null;
    if (scope.isGlobal) return 'ALL';

    const codes = new Set<string>(scope.allowedProjectCodes ?? []);
    if ((scope.allowedCompanyCodes ?? []).length > 0) {
      const projects = await this.projectRepo.find({
        where: { companyCode: In(scope.allowedCompanyCodes) },
      });
      projects.forEach((p) => codes.add(p.projectCode));
    }
    if ((scope.allowedSiteCodes ?? []).length > 0) {
      const projects = await this.projectRepo.find({
        where: { siteCode: In(scope.allowedSiteCodes) },
      });
      projects.forEach((p) => codes.add(p.projectCode));
    }
    return Array.from(codes);
  }

  /** 解析用户可见的项目编码集合：GROUP→全部；PROJECT→指定；COMPANY/SITE→匹配项目；无 scope→空 */
  async resolveAccessibleProjects(userId: string, roles: string[]): Promise<string[] | 'ALL'> {
    // 不再按 ROLE_* 硬编码放大全局视野。全局/公司/项目范围以 DataScopeGuard 写入的
    // dataScope 为准；股东专项范围仍通过 shr_shareholder_scopes 叠加。
    const dataScopeAccess = await this.resolveDataScopeProjects();
    if (dataScopeAccess === 'ALL') return 'ALL';

    const scopes = await this.scopeRepo.find({ where: { userId, status: 'ACTIVE' } });
    if (scopes.length === 0) return dataScopeAccess ?? [];
    if (scopes.some(s => s.scopeType === 'GROUP')) return 'ALL';
    const codes = new Set<string>();
    (dataScopeAccess ?? []).forEach((code) => codes.add(code));
    const allProjects = await this.projectRepo.find();
    for (const s of scopes) {
      if (s.scopeType === 'PROJECT' && s.projectCode) codes.add(s.projectCode);
      else if (s.scopeType === 'COMPANY') allProjects.filter(p => p.companyCode === s.scopeCode).forEach(p => codes.add(p.projectCode));
      else if (s.scopeType === 'SITE') allProjects.filter(p => p.siteCode === s.scopeCode).forEach(p => codes.add(p.projectCode));
      else if (s.scopeType === 'BU') return 'ALL'; // BU 简化：暂等同集团范围（待后续按 BU→公司展开）
    }
    return Array.from(codes);
  }

  async dashboard(user: { userId: string; roles: string[] }) {
    const access = await this.resolveAccessibleProjects(user.userId, user.roles ?? []);
    if (Array.isArray(access) && access.length === 0) {
      return { scope: 'NONE', projects: [], note: '未配置股东查看范围（shr_shareholder_scopes），无可见项目' };
    }
    const projects = await this.listProjects();
    const visible = access === 'ALL' ? projects : projects.filter(p => (access as string[]).includes(p.projectCode));
    // Phase 2B：附带各项目累计实缴 + 最近出资时间（实缴口径）
    const paidAgg = await this.ds.query(
      `SELECT project_code, coalesce(sum(amount),0)::numeric AS paid_in, max(contribution_date) AS last_date, count(*)::int AS cnt
       FROM shr_capital_contributions WHERE status='CONFIRMED' GROUP BY project_code`);
    const pm = new Map<string, any>(paidAgg.map((r: any) => [r.project_code, r]));
    const enriched = visible.map(p => ({
      ...p,
      // 项目总实缴资本（实收资本表）优先；无则回退台账累计
      totalPaidInCapital: (p as any).totalPaidInCapital != null ? Number((p as any).totalPaidInCapital) : null,
      ledgerPaidIn: Number(pm.get(p.projectCode)?.paid_in ?? 0),
      paidInTotal: (p as any).totalPaidInCapital != null
        ? Number((p as any).totalPaidInCapital)
        : Number(pm.get(p.projectCode)?.paid_in ?? 0),
      lastContributionDate: pm.get(p.projectCode)?.last_date ?? null,
      contributionCount: pm.get(p.projectCode)?.cnt ?? 0,
    }));
    return { scope: access === 'ALL' ? 'ALL' : 'SCOPED', count: visible.length, projects: enriched };
  }

  async dashboardProject(projectCode: string, user: { userId: string; roles: string[] }) {
    const access = await this.resolveAccessibleProjects(user.userId, user.roles ?? []);
    const allowed = access === 'ALL' || (Array.isArray(access) && access.includes(projectCode));
    if (!allowed) throw new NotFoundException('无权查看该项目（不在股东查看范围内）');
    const detail = await this.getProject(projectCode);
    // Phase 2A：实缴口径 —— 累计实缴 = 已确认出资合计；不计算应缴/未缴/差额
    const paidByShareholder = await this.ds.query(
      `SELECT shareholder_code, coalesce(sum(amount),0)::numeric AS paid
       FROM shr_capital_contributions WHERE project_code=$1 AND status='CONFIRMED'
       GROUP BY shareholder_code`, [projectCode]);
    const paidMap = new Map<string, number>(paidByShareholder.map((r: any) => [r.shareholder_code, Number(r.paid)]));
    const recent = await this.contribRepo.find({
      where: { projectCode, status: 'CONFIRMED' }, order: { contributionDate: 'DESC', createdAt: 'DESC' }, take: 5,
    });
    const beneficial = await this.beneficialRepo.find({ where: { projectCode } });
    return {
      project: {
        projectCode: detail.projectCode, projectName: detail.projectName,
        equityStatus: detail.equityStatus, capitalStatus: detail.capitalStatus,
        totalPaidInCapital: detail.totalPaidInCapital != null ? Number(detail.totalPaidInCapital) : null,
      },
      equityStatus: detail.equityStatus,
      // 项目总实缴资本（实收资本表口径）
      totalPaidInCapital: detail.totalPaidInCapital != null ? Number(detail.totalPaidInCapital) : null,
      // 台账累计实缴（逐笔出资合计，仅有逐笔记录的股东）
      ledgerPaidInTotal: Number([...paidMap.values()].reduce((a, b) => a + b, 0)),
      // 股权结构 vs 实缴资本结构（同列并陈，不混淆）
      shareholders: detail.equity.map(e => ({
        shareholderCode: e.shareholderCode,
        equityRatio: Number(e.equityRatio),               // 股权比例（暂定/已确认）
        equityStatus: e.equityStatus,
        paidInCapital: e.paidInCapital != null ? Number(e.paidInCapital) : 0,  // 实缴金额（实收资本表）
        capitalRatio: e.capitalRatio != null ? Number(e.capitalRatio) : null,  // 实缴资本占比%
        paidInSource: e.paidInSource ?? null,             // LEDGER / CAPITAL_SUMMARY_IMPORT
        ledgerPaidIn: paidMap.get(e.shareholderCode) ?? 0, // 逐笔台账累计（核对用）
      })),
      recentContributions: recent,
      // 实益出资结构（代持）：登记股东 → 实际出资人，与法定股权分离
      beneficialStructure: beneficial.map(b => ({
        nomineeShareholderCode: b.nomineeShareholderCode,
        beneficialShareholderCode: b.beneficialShareholderCode,
        amount: b.amount != null ? Number(b.amount) : 0,
        ownershipRatio: b.ownershipRatio != null ? Number(b.ownershipRatio) : null,
        remark: b.remark,
      })),
      note: detail.equityStatus === 'PROVISIONAL'
        ? '当前股权比例为暂定，仅供参考，最终股权以最终确认结果为准；实缴资本占比为真实实缴口径(PAID-IN BASIS)。'
        : '股权已确认；同时展示实缴资本结构与实益出资结构（代持）。',
    };
  }

  // ── 资本汇总只读桥接数据（Phase 2B-R2：项目总实缴 + 股东累计实缴 + 最近更新）──
  async capitalSummary(projectCode?: string, user?: { userId: string; roles: string[] }) {
    // G138：资本汇总按股东 scope 收窄
    const allowed = await this.scopeProjectIn(user);
    let pWhere: any = projectCode ? { projectCode } : {};
    if (allowed !== null) {
      const list = projectCode ? allowed.filter(c => c === projectCode) : allowed;
      if (list.length === 0) return { mode: 'READ_ONLY', note: '只读资本汇总；不生成凭证、不修改财务流水、不回写 Finance V2。', projects: [] };
      pWhere = { projectCode: In(list) };
    }
    const projects = await this.projectRepo.find({ where: pWhere });
    const out = [];
    for (const p of projects) {
      const equity = await this.equityRepo.find({ where: { projectCode: p.projectCode } });
      out.push({
        projectCode: p.projectCode, projectName: p.projectName, equityStatus: p.equityStatus,
        totalPaidInCapital: p.totalPaidInCapital != null ? Number(p.totalPaidInCapital) : null,
        lastUpdated: p.updatedAt,
        shareholders: equity.map(e => ({
          shareholderCode: e.shareholderCode,
          equityRatio: Number(e.equityRatio),
          paidInCapital: e.paidInCapital != null ? Number(e.paidInCapital) : 0,
          capitalRatio: e.capitalRatio != null ? Number(e.capitalRatio) : null,
          paidInSource: e.paidInSource ?? null,
        })),
      });
    }
    return { mode: 'READ_ONLY', note: '只读资本汇总；不生成凭证、不修改财务流水、不回写 Finance V2。', projects: out };
  }

  // ── Finance V2 只读桥接（Phase 2A：只读，不自动同步/改账/生成凭证）────────────
  async financeBridge(projectCode?: string, user?: { userId: string; roles: string[] }) {
    // G138：Finance V2 桥接也按股东 scope 收窄——原无 user 过滤 → 股东可越权看全部公司股东资金
    const allowed = await this.scopeProjectIn(user);
    let projList: string[] | null = null;   // null=不限；[]=空(直接返回空)
    if (allowed !== null) {
      projList = projectCode ? allowed.filter(c => c === projectCode) : allowed;
      if (projList.length === 0) {
        return { mode: 'READ_ONLY', note: '只读 Finance V2 股东资金桥接（不写入、不改账）。', finRows: [], shrRows: [], shrTotal: 0, finTotal: 0 };
      }
    } else if (projectCode) {
      projList = [projectCode];
    }
    // 只读查看 Finance V2 股东资金记录（不写入、不改账）
    const finRows = await this.ds.query(
      `SELECT * FROM fin_shareholder_contributions ${projList ? 'WHERE project_code = ANY($1)' : ''} ORDER BY id DESC LIMIT 200`,
      projList ? [projList] : [],
    ).catch(() => []);
    const shrRows = await this.contribRepo.find({
      where: projList ? { projectCode: In(projList) } : {}, order: { createdAt: 'DESC' }, take: 200,
    });
    // UX Enhancement：只读对账聚合（不改账）。shr 侧只计 CONFIRMED；fin 侧尽力按 amount 字段求和。
    const shrTotal = shrRows
      .filter((r: any) => r.status === 'CONFIRMED')
      .reduce((a: number, r: any) => a + Number(r.amount || 0), 0);
    const finTotal = (finRows as any[]).reduce((a: number, r: any) => {
      const v = r?.amount ?? r?.amount_base ?? r?.contribution_amount ?? r?.paid_in_amount ?? 0;
      return a + Number(v || 0);
    }, 0);
    return {
      mode: 'READ_ONLY',
      note: 'Phase 2A 桥接为只读：不自动同步、不自动改账、不自动生成凭证。',
      reconciliation: {
        shrTotal,                                  // Shareholder Runtime 累计实缴（CONFIRMED）
        finTotal,                                  // Finance V2 股东资金合计（尽力解析）
        diff: shrTotal - finTotal,                 // 差异金额（正=股东模块多，负=Finance多）
        finParsed: finRows.length > 0,             // 是否解析到 Finance 侧数据
        bridgeStatus: 'READ_ONLY',
      },
      shrCapitalContributions: { count: shrRows.length, rows: shrRows },
      finShareholderContributions: { count: finRows.length, rows: finRows },
      gaps: [
        '两套台账独立：shr_capital_contributions（股东模块）vs fin_shareholder_contributions（Finance V2），暂不互写。',
        '如需一键同步/反向导入，待 Phase 3 股权最终确认后评估。',
        'source_type 口径需对齐（BANK_TRANSFER/DIVIDEND_OFFSET/SHAREHOLDER_ADVANCE/OTHER）。',
      ],
    };
  }
}
