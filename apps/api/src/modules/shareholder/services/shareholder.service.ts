import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { format } from 'date-fns';
import { ApprovalEngineService } from '../../approval-engine/approval-engine.service';
import { CapitalAggregationService } from './capital-aggregation.service';

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
  ) {}

  // ════════════════ 资本流引擎（Phase 3）════════════════
  /** 资本流列表（可按项目/股东/状态过滤） */
  listFlows(opts: { projectCode?: string; shareholderCode?: string; status?: string } = {}) {
    const where: any = {};
    if (opts.projectCode) where.projectCode = opts.projectCode;
    if (opts.shareholderCode) where.shareholderCode = opts.shareholderCode;
    if (opts.status) where.status = opts.status;
    return this.contribRepo.find({ where, order: { createdAt: 'DESC' }, take: 500 });
  }
  async getFlow(id: string) {
    const f = await this.contribRepo.findOne({ where: { id } });
    if (!f) throw new NotFoundException(`资本流不存在: ${id}`);
    return f;
  }

  /** 新增资本流（草稿） */
  async createFlow(dto: any, userId?: string) {
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
        attachmentCount: dto.attachmentCount ?? 0,
        remark: dto.remark ?? null,
        status: 'DRAFT',
        createdBy: userId,
      } as any);
      return mgr.save(row);
    });
  }

  /** 提交审批：DRAFT → SUBMITTED + 发起 Workflow（分档审批） */
  async submitFlow(id: string) {
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
  async confirmFlow(id: string, userId?: string) {
    return this.ds.transaction(async (mgr) => {
      const f = await mgr.findOne(ShrCapitalContributionEntity, { where: { id } });
      if (!f) throw new NotFoundException(`资本流不存在: ${id}`);
      if (f.status !== 'APPROVED') throw new ConflictException(`仅审批通过(APPROVED)可确认到账，当前: ${f.status}`);
      f.status = 'CONFIRMED';
      f.confirmedBy = userId as any;
      f.confirmedAt = new Date();
      await mgr.save(f);
      await this.aggregation.applyConfirmed(f.projectCode, f.shareholderCode, Number(f.amount), mgr);
      return mgr.findOne(ShrCapitalContributionEntity, { where: { id } });
    });
  }

  /** 冲销：CONFIRMED → REVERSED + 自动反向汇总（-amount）+ 保留审计轨迹 */
  async reverseFlow(id: string, userId?: string, reason?: string) {
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
        reversalOfId: String(f.id), remark: `冲销 ${f.capitalFlowNo ?? f.contributionNo}: ${reason ?? ''}`, createdBy: userId,
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

  /** 资本流仪表板统计：本月新增 / 最近 / 股东排名 / 项目排名 */
  async capitalStats() {
    const monthAdded = await this.ds.query(
      `SELECT coalesce(sum(amount),0)::numeric total, count(*)::int cnt
       FROM shr_capital_contributions
       WHERE status='CONFIRMED' AND date_trunc('month', coalesce(confirmed_at, created_at)) = date_trunc('month', now())`);
    const recent = await this.contribRepo.find({ where: { status: 'CONFIRMED' }, order: { confirmedAt: 'DESC', createdAt: 'DESC' }, take: 8 });
    const byShareholder = await this.ds.query(
      `SELECT shareholder_code, coalesce(sum(amount),0)::numeric total
       FROM shr_capital_contributions WHERE status='CONFIRMED' GROUP BY shareholder_code ORDER BY total DESC LIMIT 10`);
    const byProject = await this.ds.query(
      `SELECT project_code, coalesce(sum(amount),0)::numeric total
       FROM shr_capital_contributions WHERE status='CONFIRMED' GROUP BY project_code ORDER BY total DESC`);
    return {
      monthAdded: { total: Number(monthAdded[0]?.total ?? 0), count: monthAdded[0]?.cnt ?? 0 },
      recent,
      shareholderRanking: byShareholder.map((r: any) => ({ shareholderCode: r.shareholder_code, total: Number(r.total) })),
      projectRanking: byProject.map((r: any) => ({ projectCode: r.project_code, total: Number(r.total) })),
    };
  }

  /** 实益出资结构（代持关系） */
  listBeneficial(projectCode?: string) {
    return this.beneficialRepo.find({ where: projectCode ? { projectCode } : {}, order: { projectCode: 'ASC' } });
  }

  // ── 项目 ──────────────────────────────────────────────────────────────
  async listProjects() {
    const rows = await this.projectRepo.find({ order: { projectCode: 'ASC' } });
    // 附带股东人数与股比合计
    const stats = await this.ds.query(
      `SELECT project_code, count(*)::int AS holders, sum(equity_ratio)::numeric AS ratio_sum
       FROM shr_project_equity GROUP BY project_code`,
    );
    const m = new Map<string, any>(stats.map((s: any) => [s.project_code, s]));
    return rows.map(p => ({
      ...p,
      holders: m.get(p.projectCode)?.holders ?? 0,
      ratioSum: Number(m.get(p.projectCode)?.ratio_sum ?? 0),
    }));
  }
  async getProject(code: string) {
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
  listEquity(projectCode?: string) {
    return this.equityRepo.find({
      where: projectCode ? { projectCode } : {},
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
  listContributions(projectCode?: string, shareholderCode?: string) {
    const where: any = {};
    if (projectCode) where.projectCode = projectCode;
    if (shareholderCode) where.shareholderCode = shareholderCode;
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
  /** 解析用户可见的项目编码集合：GROUP→全部；PROJECT→指定；COMPANY/SITE→匹配项目；无 scope→空 */
  async resolveAccessibleProjects(userId: string, roles: string[]): Promise<string[] | 'ALL'> {
    if (roles?.includes('ROLE_ADMIN')) return 'ALL';
    const scopes = await this.scopeRepo.find({ where: { userId, status: 'ACTIVE' } });
    if (scopes.length === 0) return [];
    if (scopes.some(s => s.scopeType === 'GROUP')) return 'ALL';
    const codes = new Set<string>();
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
  async capitalSummary(projectCode?: string) {
    const projects = await this.projectRepo.find({ where: projectCode ? { projectCode } : {} });
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
  async financeBridge(projectCode?: string) {
    // 只读查看 Finance V2 股东资金记录（不写入、不改账）
    const finRows = await this.ds.query(
      `SELECT * FROM fin_shareholder_contributions ${projectCode ? 'WHERE project_code = $1' : ''} ORDER BY id DESC LIMIT 200`,
      projectCode ? [projectCode] : [],
    ).catch(() => []);
    const shrRows = await this.contribRepo.find({
      where: projectCode ? { projectCode } : {}, order: { createdAt: 'DESC' }, take: 200,
    });
    return {
      mode: 'READ_ONLY',
      note: 'Phase 2A 桥接为只读：不自动同步、不自动改账、不自动生成凭证。',
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
