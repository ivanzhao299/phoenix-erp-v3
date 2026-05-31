/**
 * Phoenix ERP V3 — OrgService
 * RBAC-2 组织树 CRUD + path/level 自动计算
 * 2026-05-25
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SysOrganizationEntity } from '../entities/sys-organization.entity';
import { SysUserOrgEntity } from '../entities/sys-user-org.entity';
import { SysUserProjectScopeEntity } from '../entities/sys-user-project-scope.entity';
import { SysUserWarehouseScopeEntity } from '../entities/sys-user-warehouse-scope.entity';
import { SysDataScopeEntity } from '../entities/sys-data-scope.entity';
import { CreateOrgDto } from '../dto/create-org.dto';
import { UpdateOrgDto } from '../dto/update-org.dto';
import { AssignUserOrgDto, UpdateUserOrgDto } from '../dto/assign-user-org.dto';
import { CreateDataScopeDto, UpdateDataScopeDto } from '../dto/update-data-scope.dto';
import { DataScopeService } from './data-scope.service';

@Injectable()
export class OrgService {
  constructor(
    @InjectRepository(SysOrganizationEntity)
    private readonly orgRepo: Repository<SysOrganizationEntity>,
    @InjectRepository(SysUserOrgEntity)
    private readonly userOrgRepo: Repository<SysUserOrgEntity>,
    @InjectRepository(SysUserProjectScopeEntity)
    private readonly userProjRepo: Repository<SysUserProjectScopeEntity>,
    @InjectRepository(SysUserWarehouseScopeEntity)
    private readonly userWhRepo: Repository<SysUserWarehouseScopeEntity>,
    @InjectRepository(SysDataScopeEntity)
    private readonly dataScopeRepo: Repository<SysDataScopeEntity>,
    private readonly dataScopeService: DataScopeService,
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  // ── 组织树 CRUD ─────────────────────────────────────────────────────────────

  async listOrgs(): Promise<SysOrganizationEntity[]> {
    return this.orgRepo.find({ order: { level: 'ASC', orgCode: 'ASC' } });
  }

  async getOrg(id: number): Promise<SysOrganizationEntity> {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);
    return org;
  }

  async createOrg(dto: CreateOrgDto): Promise<SysOrganizationEntity> {
    let level = 1;
    let path = `/${dto.orgCode}/`;

    if (dto.parentId) {
      const parent = await this.orgRepo.findOne({ where: { id: dto.parentId } });
      if (!parent) throw new BadRequestException(`Parent org ${dto.parentId} not found`);
      level = parent.level + 1;
      path = `${parent.path}${dto.orgCode}/`;
    }

    const org = this.orgRepo.create({
      orgCode: dto.orgCode,
      orgName: dto.orgName,
      parentId: dto.parentId ?? null,
      orgType: dto.orgType,
      level,
      path,
      status: 'ACTIVE',
      companyCode: dto.companyCode ?? null,
      projectCode: dto.projectCode ?? null,
      warehouseCode: dto.warehouseCode ?? null,
      remark: dto.remark ?? null,
    });

    return this.orgRepo.save(org);
  }

  async updateOrg(id: number, dto: UpdateOrgDto): Promise<SysOrganizationEntity> {
    const org = await this.getOrg(id);
    Object.assign(org, dto);
    return this.orgRepo.save(org);
  }

  async deleteOrg(id: number): Promise<void> {
    const children = await this.orgRepo.find({ where: { parentId: id } });
    if (children.length > 0) {
      throw new BadRequestException('Cannot delete org with children. Remove children first.');
    }
    await this.orgRepo.delete(id);
  }

  // ── Organization Runtime Phase 1 新增方法 ───────────────────────────────────

  /** 返回全部组织（前端构建树），按 level + sortOrder + orgCode 排序 */
  async getOrgTree(): Promise<SysOrganizationEntity[]> {
    return this.orgRepo.find({
      order: { level: 'ASC', sortOrder: 'ASC', orgCode: 'ASC' },
    });
  }

  /** 按 orgCode 查询单个组织，不存在时抛 404 */
  async getOrgByCode(orgCode: string): Promise<SysOrganizationEntity> {
    const org = await this.orgRepo.findOne({ where: { orgCode } });
    if (!org) throw new NotFoundException(`Organization "${orgCode}" not found`);
    return org;
  }

  /** 停用组织（status → INACTIVE） */
  async disableOrg(orgCode: string): Promise<void> {
    const org = await this.getOrgByCode(orgCode);
    org.status = 'INACTIVE';
    await this.orgRepo.save(org);
  }

  /** 启用组织（status → ACTIVE） */
  async enableOrg(orgCode: string): Promise<void> {
    const org = await this.getOrgByCode(orgCode);
    org.status = 'ACTIVE';
    await this.orgRepo.save(org);
  }

  /** 按 orgType 过滤 */
  async getOrgsByType(orgType: string): Promise<SysOrganizationEntity[]> {
    return this.orgRepo.find({
      where: { orgType: orgType as SysOrganizationEntity['orgType'] },
      order: { level: 'ASC', sortOrder: 'ASC', orgCode: 'ASC' },
    });
  }

  /**
   * 查询用户的组织授权范围分桶（用于 DataScope 扩展）
   * 返回：{ scopeAll, groupCodes, buCodes, companyCodes, siteCodes, departmentCodes }
   */
  async getUserOrgScopes(userId: number): Promise<{
    scopeAll: boolean;
    groupCodes: string[];
    buCodes: string[];
    companyCodes: string[];
    siteCodes: string[];
    departmentCodes: string[];
  }> {
    const rows: Array<{ org_type: string; org_code: string }> = await this.ds.query(
      `SELECT o.org_type, o.org_code
       FROM sys_user_orgs uo
       JOIN sys_organizations o ON o.id = uo.org_id
       WHERE uo.user_id = $1`,
      [userId],
    );

    const groupCodes: string[] = [];
    const buCodes: string[] = [];
    const companyCodes: string[] = [];
    const siteCodes: string[] = [];
    const departmentCodes: string[] = [];

    for (const row of rows) {
      switch (row.org_type) {
        case 'GROUP':      groupCodes.push(row.org_code);      break;
        case 'BU':         buCodes.push(row.org_code);         break;
        case 'COMPANY':    companyCodes.push(row.org_code);    break;
        case 'SITE':       siteCodes.push(row.org_code);       break;
        case 'DEPARTMENT': departmentCodes.push(row.org_code); break;
      }
    }

    return {
      scopeAll: groupCodes.length > 0,
      groupCodes,
      buCodes,
      companyCodes,
      siteCodes,
      departmentCodes,
    };
  }

  // ── 用户-组织关系 ───────────────────────────────────────────────────────────

  async getUserOrgs(userId: number): Promise<any[]> {
    return this.ds.query(`
      SELECT uo.id, uo.user_id, uo.org_id, uo.is_primary, uo.data_scope_level, uo.created_at,
             o.org_code, o.org_name, o.org_type, o.level, o.path, o.status,
             o.company_code, o.project_code, o.warehouse_code
      FROM sys_user_orgs uo
      JOIN sys_organizations o ON o.id = uo.org_id
      WHERE uo.user_id = $1
      ORDER BY uo.is_primary DESC, o.level ASC
    `, [userId]);
  }

  /** 获取某组织下的所有成员（含用户信息 + 数据范围等级） */
  async getOrgMembers(orgId: number): Promise<any[]> {
    return this.ds.query(`
      SELECT
        uo.id         AS user_org_id,
        uo.is_primary,
        uo.data_scope_level,
        uo.created_at AS assigned_at,
        u.user_id     AS id,
        u.username,
        u.real_name   AS real_name_zh,
        u.store_code,
        u.status      AS user_status,
        COALESCE(
          (SELECT r.role_code FROM sys_user_role ur
           JOIN sys_role r ON ur.role_id = r.role_id
           WHERE ur.user_id = u.user_id AND ur.is_primary = true LIMIT 1),
          (SELECT r.role_code FROM sys_user_role ur
           JOIN sys_role r ON ur.role_id = r.role_id
           WHERE ur.user_id = u.user_id LIMIT 1)
        ) AS role,
        COALESCE(
          (SELECT r.role_name_zh FROM sys_user_role ur
           JOIN sys_role r ON ur.role_id = r.role_id
           WHERE ur.user_id = u.user_id AND ur.is_primary = true LIMIT 1),
          (SELECT r.role_name_zh FROM sys_user_role ur
           JOIN sys_role r ON ur.role_id = r.role_id
           WHERE ur.user_id = u.user_id LIMIT 1)
        ) AS role_name_zh
      FROM sys_user_orgs uo
      JOIN sys_user u ON u.user_id = uo.user_id
      WHERE uo.org_id = $1
      ORDER BY uo.is_primary DESC, u.real_name ASC
    `, [orgId]);
  }

  async assignUserOrg(dto: AssignUserOrgDto): Promise<SysUserOrgEntity> {
    const existing = await this.userOrgRepo.findOne({
      where: { userId: dto.userId, orgId: dto.orgId },
    });
    if (existing) {
      existing.isPrimary = dto.isPrimary ?? existing.isPrimary;
      existing.dataScopeLevel = dto.dataScopeLevel ?? existing.dataScopeLevel;
      const saved = await this.userOrgRepo.save(existing);
      this.dataScopeService.invalidate(String(dto.userId));
      return saved;
    }

    const uo = this.userOrgRepo.create({
      userId: dto.userId,
      orgId: dto.orgId,
      isPrimary: dto.isPrimary ?? false,
      dataScopeLevel: (dto.dataScopeLevel ?? 'COMPANY') as 'SELF' | 'PROJECT' | 'COMPANY' | 'REGION' | 'GROUP',
    });
    const saved = await this.userOrgRepo.save(uo);
    this.dataScopeService.invalidate(String(dto.userId));
    return saved;
  }

  async updateUserOrg(id: number, dto: UpdateUserOrgDto): Promise<SysUserOrgEntity> {
    const uo = await this.userOrgRepo.findOne({ where: { id } });
    if (!uo) throw new NotFoundException(`UserOrg ${id} not found`);
    Object.assign(uo, dto);
    const saved = await this.userOrgRepo.save(uo);
    this.dataScopeService.invalidate(String(uo.userId));
    return saved;
  }

  async removeUserOrg(id: number): Promise<void> {
    const uo = await this.userOrgRepo.findOne({ where: { id } });
    if (uo) this.dataScopeService.invalidate(String(uo.userId));
    await this.userOrgRepo.delete(id);
  }

  // ── 用户额外授权 ─────────────────────────────────────────────────────────────

  async getUserScopes(userId: number) {
    const projects = await this.userProjRepo.find({ where: { userId } });
    const warehouses = await this.userWhRepo.find({ where: { userId } });
    return { projects, warehouses };
  }

  async addProjectScope(userId: number, projectCode: string): Promise<SysUserProjectScopeEntity> {
    const existing = await this.userProjRepo.findOne({ where: { userId, projectCode } });
    if (existing) return existing;
    const s = this.userProjRepo.create({ userId, projectCode });
    const saved = await this.userProjRepo.save(s);
    this.dataScopeService.invalidate(String(userId));
    return saved;
  }

  async removeProjectScope(id: number): Promise<void> {
    const s = await this.userProjRepo.findOne({ where: { id } });
    if (s) this.dataScopeService.invalidate(String(s.userId));
    await this.userProjRepo.delete(id);
  }

  async addWarehouseScope(userId: number, warehouseCode: string): Promise<SysUserWarehouseScopeEntity> {
    const existing = await this.userWhRepo.findOne({ where: { userId, warehouseCode } });
    if (existing) return existing;
    const s = this.userWhRepo.create({ userId, warehouseCode });
    const saved = await this.userWhRepo.save(s);
    this.dataScopeService.invalidate(String(userId));
    return saved;
  }

  async removeWarehouseScope(id: number): Promise<void> {
    const s = await this.userWhRepo.findOne({ where: { id } });
    if (s) this.dataScopeService.invalidate(String(s.userId));
    await this.userWhRepo.delete(id);
  }

  // ── 数据范围规则管理 ─────────────────────────────────────────────────────────

  async listDataScopes(): Promise<SysDataScopeEntity[]> {
    return this.dataScopeRepo.find({ order: { roleCode: 'ASC', moduleCode: 'ASC' } });
  }

  async createDataScope(dto: CreateDataScopeDto): Promise<SysDataScopeEntity> {
    const existing = await this.dataScopeRepo.findOne({
      where: { roleCode: dto.roleCode, moduleCode: dto.moduleCode },
    });
    if (existing) {
      existing.scopeType = dto.scopeType;
      existing.enabled = true;
      return this.dataScopeRepo.save(existing);
    }
    const ds = this.dataScopeRepo.create(dto);
    return this.dataScopeRepo.save(ds);
  }

  async updateDataScope(id: number, dto: UpdateDataScopeDto): Promise<SysDataScopeEntity> {
    const ds = await this.dataScopeRepo.findOne({ where: { id } });
    if (!ds) throw new NotFoundException(`DataScope ${id} not found`);
    Object.assign(ds, dto);
    return this.dataScopeRepo.save(ds);
  }

  async deleteDataScope(id: number): Promise<void> {
    await this.dataScopeRepo.delete(id);
  }
}
