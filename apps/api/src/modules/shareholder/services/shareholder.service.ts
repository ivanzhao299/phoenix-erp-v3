import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { format } from 'date-fns';

import { ShrProjectEntity } from '../entities/shr-project.entity';
import { ShrShareholderEntity } from '../entities/shr-shareholder.entity';
import { ShrProjectEquityEntity } from '../entities/shr-project-equity.entity';
import { ShrCapitalContributionEntity } from '../entities/shr-capital-contribution.entity';
import { ShrShareholderScopeEntity } from '../entities/shr-shareholder-scope.entity';
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
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

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
    return { scope: access === 'ALL' ? 'ALL' : 'SCOPED', count: visible.length, projects: visible };
  }

  async dashboardProject(projectCode: string, user: { userId: string; roles: string[] }) {
    const access = await this.resolveAccessibleProjects(user.userId, user.roles ?? []);
    const allowed = access === 'ALL' || (Array.isArray(access) && access.includes(projectCode));
    if (!allowed) throw new NotFoundException('无权查看该项目（不在股东查看范围内）');
    const detail = await this.getProject(projectCode);
    const contribAgg = await this.ds.query(
      `SELECT coalesce(sum(amount),0)::numeric AS confirmed_total
       FROM shr_capital_contributions WHERE project_code=$1 AND status='CONFIRMED'`, [projectCode]);
    return {
      project: detail,
      capital: {
        subscribedTotal: detail.equity.reduce((a, e) => a + Number(e.subscribedCapital ?? 0), 0),
        paidInTotal: detail.equity.reduce((a, e) => a + Number(e.paidInCapital ?? 0), 0),
        unpaidTotal: detail.equity.reduce((a, e) => a + Number(e.unpaidCapital ?? 0), 0),
        confirmedContributions: Number(contribAgg[0]?.confirmed_total ?? 0),
      },
    };
  }
}
