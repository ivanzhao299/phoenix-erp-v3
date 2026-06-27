/**
 * Phoenix ERP V3 — OrgService
 * RBAC-2 组织树 CRUD + path/level 自动计算
 * 2026-05-25
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { ClsService } from 'nestjs-cls';
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
    private readonly cls: ClsService, // G73 组织列表公司隔离
  ) {}

  // ── 组织树 CRUD ─────────────────────────────────────────────────────────────

  /**
   * G73：组织列表按公司隔离。
   *   org 树仅 COMPANY 级有 company_code，子组织(部门/场站) company_code 为空、靠 parent_id
   *   挂到公司——故用递归 CTE 取「用户可见公司的整棵子树」，避免简单 company_code 过滤
   *   误删自家子组织、或放行 NULL 泄露他司子组织。
   *   全局(isGlobal/ROLE_ADMIN)/内部调用(无 user) → 返回全部(不收窄)。
   *   已登录用户 scope 缺失或解析失败 → fail-closed，避免异常态透出全量组织树。
   */
  async listOrgs(): Promise<SysOrganizationEntity[]> {
    const scope = await this.resolveOrgCompanyScope();
    if (scope === 'ALL') {
      return this.orgRepo.find({ order: { level: 'ASC', orgCode: 'ASC' } });
    }
    if (scope === 'DENY') return [];
    const rows: Array<{ id: number }> = await this.ds.query(
      `WITH RECURSIVE roots AS (
         SELECT id FROM sys_organizations WHERE company_code = ANY($1)
       ), subtree AS (
         SELECT id FROM sys_organizations WHERE id IN (SELECT id FROM roots)
         UNION
         SELECT o.id FROM sys_organizations o JOIN subtree s ON o.parent_id = s.id
       )
       SELECT id FROM subtree`,
      [scope],
    );
    const ids = rows.map(r => r.id);
    if (!ids.length) return [];
    return this.orgRepo.find({ where: { id: In(ids) }, order: { level: 'ASC', orgCode: 'ASC' } });
  }

  /** G73：解析当前用户对组织树的公司可见范围（'ALL' | 'DENY' | 公司码[]）。 */
  private async resolveOrgCompanyScope(): Promise<'ALL' | 'DENY' | string[]> {
    const user = this.cls.get('user') as Record<string, any> | undefined;
    if (!user) return 'ALL';                                  // 内部调用无用户上下文
    const userId = String(user.userId ?? user.id ?? user.sub ?? '');
    if (!userId) return 'DENY';
    const roles: string[] = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
    try {
      const s = await this.dataScopeService.resolve(userId, roles, 'MENU_MD_ORG');
      if (s.isGlobal) return 'ALL';
      if (!s.allowedCompanyCodes.length) return 'DENY';
      return s.allowedCompanyCodes;
    } catch {
      return 'DENY';
    }
  }

  private async visibleOrgIds(scope: 'ALL' | 'DENY' | string[]): Promise<'ALL' | number[]> {
    if (scope === 'ALL') return 'ALL';
    if (scope === 'DENY') return [];
    const rows: Array<{ id: number }> = await this.ds.query(
      `WITH RECURSIVE roots AS (
         SELECT id FROM sys_organizations WHERE company_code = ANY($1)
       ), subtree AS (
         SELECT id FROM sys_organizations WHERE id IN (SELECT id FROM roots)
         UNION
         SELECT o.id FROM sys_organizations o JOIN subtree s ON o.parent_id = s.id
       )
       SELECT id FROM subtree`,
      [scope],
    );
    return rows.map((r) => Number(r.id));
  }

  private async isOrgVisible(id: number): Promise<boolean> {
    const scope = await this.resolveOrgCompanyScope();
    if (scope === 'ALL') return true;
    if (scope === 'DENY') return false;
    const [row] = await this.ds.query(
      `WITH RECURSIVE ancestors AS (
         SELECT id, parent_id, org_code, org_type, company_code
           FROM sys_organizations
          WHERE id = $1
         UNION ALL
         SELECT p.id, p.parent_id, p.org_code, p.org_type, p.company_code
           FROM sys_organizations p
           JOIN ancestors a ON a.parent_id = p.id
       )
       SELECT 1
         FROM ancestors
        WHERE company_code = ANY($2)
           OR (org_type = 'COMPANY' AND COALESCE(company_code, org_code) = ANY($2))
        LIMIT 1`,
      [id, scope],
    );
    return !!row;
  }

  private async assertOrgVisible(id: number): Promise<void> {
    if (!(await this.isOrgVisible(id))) {
      throw new NotFoundException(`Organization ${id} not found`);
    }
  }

  private async assertOrgWriteScope(dto: CreateOrgDto | UpdateOrgDto, requirePlacement = false): Promise<void> {
    const scope = await this.resolveOrgCompanyScope();
    if (scope === 'ALL') return;
    if (scope === 'DENY') throw new ForbiddenException('DATA_SCOPE_DENIED');

    if ('parentId' in dto && dto.parentId != null) {
      await this.assertOrgVisible(Number(dto.parentId));
    }

    const companyCode = String(dto.companyCode ?? '').trim();
    if (companyCode && !scope.includes(companyCode)) {
      throw new ForbiddenException('DATA_SCOPE_DENIED');
    }

    if ('orgType' in dto && dto.orgType === 'COMPANY') {
      const companyIdentity = companyCode || String((dto as CreateOrgDto).orgCode ?? '').trim();
      if (!companyIdentity || !scope.includes(companyIdentity)) {
        throw new ForbiddenException('DATA_SCOPE_DENIED');
      }
    }

    if (requirePlacement && (!('parentId' in dto) || dto.parentId == null)) {
      if (!companyCode && dto.orgType !== 'COMPANY') {
        throw new ForbiddenException('DATA_SCOPE_DENIED');
      }
    }
  }

  private async assertCompanyScopedCodeVisible(
    table: 'biz_projects' | 'wms_warehouses',
    codeCol: 'project_code' | 'warehouse_code',
    code: string,
    label: string,
  ): Promise<void> {
    const cleanCode = String(code ?? '').trim();
    if (!cleanCode) throw new BadRequestException(`${label}不能为空`);
    const scope = await this.resolveOrgCompanyScope();
    if (scope === 'DENY') throw new ForbiddenException('DATA_SCOPE_DENIED');
    const activeClause = table === 'biz_projects'
      ? `AND COALESCE(status, 'ACTIVE') <> 'ARCHIVED'
          AND deleted_at IS NULL`
      : `AND COALESCE(status, 'ACTIVE') <> 'ARCHIVED'`;

    const [row] = await this.ds.query(
      `SELECT ${codeCol} AS code, company_code
         FROM ${table}
        WHERE ${codeCol} = $1
          ${activeClause}
        LIMIT 1`,
      [cleanCode],
    );
    if (!row) throw new BadRequestException(`${label}「${cleanCode}」不存在或已归档`);
    if (scope === 'ALL') return;
    const companyCode = String(row.company_code ?? '').trim();
    if (!companyCode || !scope.includes(companyCode)) {
      throw new ForbiddenException('DATA_SCOPE_DENIED');
    }
  }

  private async visibleCompanyScopedCodes(
    table: 'biz_projects' | 'wms_warehouses',
    codeCol: 'project_code' | 'warehouse_code',
  ): Promise<'ALL' | string[]> {
    const scope = await this.resolveOrgCompanyScope();
    if (scope === 'ALL') return 'ALL';
    if (scope === 'DENY') return [];
    const activeClause = table === 'biz_projects'
      ? `AND COALESCE(status, 'ACTIVE') <> 'ARCHIVED'
          AND deleted_at IS NULL`
      : `AND COALESCE(status, 'ACTIVE') <> 'ARCHIVED'`;
    const rows: Array<{ code: string }> = await this.ds.query(
      `SELECT ${codeCol} AS code
         FROM ${table}
        WHERE company_code = ANY($1)
          ${activeClause}`,
      [scope],
    );
    return rows.map((r) => String(r.code));
  }

  async getOrg(id: number): Promise<SysOrganizationEntity> {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);
    await this.assertOrgVisible(id);
    return org;
  }

  async createOrg(dto: CreateOrgDto): Promise<SysOrganizationEntity> {
    await this.assertOrgWriteScope(dto, true);
    let level = 1;
    let path = `/${dto.orgCode}/`;

    if (dto.parentId) {
      const parent = await this.orgRepo.findOne({ where: { id: dto.parentId } });
      if (!parent) throw new BadRequestException(`Parent org ${dto.parentId} not found`);
      await this.assertOrgVisible(parent.id);
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
    await this.assertOrgWriteScope(dto);
    const { parentCode, ...rest } = dto;
    Object.assign(org, rest);

    // ── G88 变更上级（原 Object.assign 不处理换父——树有两处分别按 parentId/parentCode 渲染，必须同步）──
    let reparented = false;
    if (parentCode !== undefined && parentCode !== '' && parentCode !== org.parentCode) {
      const parent = await this.orgRepo.findOne({ where: { orgCode: parentCode } });
      if (!parent) throw new BadRequestException(`上级组织「${parentCode}」不存在`);
      await this.assertOrgVisible(parent.id);
      if (Number(parent.id) === Number(org.id)) {
        throw new BadRequestException('不能将组织设为自己的上级');
      }
      const descendants = await this.getDescendantIds(Number(org.id));
      if (descendants.has(Number(parent.id))) {
        throw new BadRequestException('不能将组织挂到其子孙节点下（会形成层级环）');
      }
      org.parentId = parent.id;
      org.parentCode = parent.orgCode;
      reparented = true;
    }

    const saved = await this.orgRepo.save(org);
    if (reparented) await this.recomputeSubtree(Number(saved.id));
    return this.getOrg(id);
  }

  /** G88：某节点的全部子孙 id（含自身）——换父防成环用 */
  private async getDescendantIds(rootId: number): Promise<Set<number>> {
    const rows: Array<{ id: string }> = await this.ds.query(
      `WITH RECURSIVE subtree AS (
         SELECT id FROM sys_organizations WHERE id = $1
         UNION ALL
         SELECT o.id FROM sys_organizations o JOIN subtree s ON o.parent_id = s.id
       ) SELECT id FROM subtree`,
      [rootId],
    );
    return new Set(rows.map((r) => Number(r.id)));
  }

  /** G88：换父后重算「本节点+全部子孙」的 level / path / company_code。
   *  company_code 继承规则：COMPANY 节点保留自身；GROUP/BU 不挂公司；其余继承最近祖先公司——
   *  这是 DataScope 公司隔离的依据（如门店换公司后，必须随之归入新公司的数据范围）。 */
  private async recomputeSubtree(rootId: number): Promise<void> {
    const all = await this.orgRepo.find();
    const byId = new Map(all.map((o) => [Number(o.id), o]));
    const childrenOf = new Map<number, SysOrganizationEntity[]>();
    for (const o of all) {
      if (o.parentId != null) {
        const k = Number(o.parentId);
        if (!childrenOf.has(k)) childrenOf.set(k, []);
        childrenOf.get(k)!.push(o);
      }
    }
    const root = byId.get(rootId);
    if (!root) return;
    const parent = root.parentId != null ? byId.get(Number(root.parentId)) : undefined;
    const effCompanyOf = (n: SysOrganizationEntity | undefined): string | null => {
      if (!n) return null;
      if (n.orgType === 'COMPANY') return n.companyCode ?? n.orgCode;
      return n.companyCode ?? null;
    };
    const queue: Array<{ node: SysOrganizationEntity; pLevel: number; pPath: string; pCompany: string | null }> = [
      { node: root, pLevel: parent?.level ?? 0, pPath: parent?.path ?? '/', pCompany: effCompanyOf(parent) },
    ];
    const updated: SysOrganizationEntity[] = [];
    while (queue.length > 0) {
      const { node, pLevel, pPath, pCompany } = queue.shift()!;
      node.level = pLevel + 1;
      node.path = `${pPath}${node.orgCode}/`;
      if (node.orgType !== 'COMPANY' && node.orgType !== 'GROUP' && node.orgType !== 'BU') {
        node.companyCode = pCompany;
      }
      updated.push(node);
      const eff = node.orgType === 'COMPANY' ? (node.companyCode ?? node.orgCode) : (node.companyCode ?? pCompany);
      for (const c of childrenOf.get(Number(node.id)) ?? []) {
        queue.push({ node: c, pLevel: node.level, pPath: node.path ?? '/', pCompany: eff });
      }
    }
    await this.orgRepo.save(updated);
  }

  async deleteOrg(id: number): Promise<void> {
    await this.assertOrgVisible(id);
    const children = await this.orgRepo.find({ where: { parentId: id } });
    if (children.length > 0) {
      throw new BadRequestException(`该组织下还有 ${children.length} 个子节点，请先迁移或删除子节点`);
    }
    // G88：有成员绑定不可删（防 sys_user_orgs 悬挂引用）
    const memberCount = await this.userOrgRepo.count({ where: { orgId: id } });
    if (memberCount > 0) {
      throw new BadRequestException(`该组织下还有 ${memberCount} 名成员绑定，请先在「成员管理」中移除`);
    }
    await this.orgRepo.delete(id);
  }

  // ── Organization Runtime Phase 1 新增方法 ───────────────────────────────────

  /** 返回全部组织（前端构建树），按 level + sortOrder + orgCode 排序 */
  async getOrgTree(): Promise<SysOrganizationEntity[]> {
    return this.listOrgs();
  }

  /** 按 orgCode 查询单个组织，不存在时抛 404 */
  async getOrgByCode(orgCode: string): Promise<SysOrganizationEntity> {
    const org = await this.orgRepo.findOne({ where: { orgCode } });
    if (!org) throw new NotFoundException(`Organization "${orgCode}" not found`);
    await this.assertOrgVisible(org.id);
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
    const orgs = await this.listOrgs();
    return orgs.filter((org) => org.orgType === orgType);
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
    const visibleIds = await this.visibleOrgIds(await this.resolveOrgCompanyScope());
    if (Array.isArray(visibleIds) && !visibleIds.length) {
      return {
        scopeAll: false,
        groupCodes: [],
        buCodes: [],
        companyCodes: [],
        siteCodes: [],
        departmentCodes: [],
      };
    }
    const params: any[] = [userId];
    const scopeClause = Array.isArray(visibleIds)
      ? ` AND uo.org_id = ANY($${params.push(visibleIds)})`
      : '';
    const rows: Array<{ org_type: string; org_code: string }> = await this.ds.query(
      `SELECT o.org_type, o.org_code
       FROM sys_user_orgs uo
       JOIN sys_organizations o ON o.id = uo.org_id
       WHERE uo.user_id = $1${scopeClause}`,
      params,
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
    const visibleIds = await this.visibleOrgIds(await this.resolveOrgCompanyScope());
    if (Array.isArray(visibleIds) && !visibleIds.length) return [];
    const params: any[] = [userId];
    const scopeClause = Array.isArray(visibleIds)
      ? ` AND uo.org_id = ANY($${params.push(visibleIds)})`
      : '';
    return this.ds.query(`
      SELECT uo.id, uo.user_id, uo.org_id, uo.is_primary, uo.data_scope_level, uo.created_at,
             o.org_code, o.org_name, o.org_type, o.level, o.path, o.status,
             o.company_code, o.project_code, o.warehouse_code
      FROM sys_user_orgs uo
      JOIN sys_organizations o ON o.id = uo.org_id
      WHERE uo.user_id = $1${scopeClause}
      ORDER BY uo.is_primary DESC, o.level ASC
    `, params);
  }

  /** 获取某组织下的所有成员（含用户信息 + 数据范围等级） */
  async getOrgMembers(orgId: number): Promise<any[]> {
    await this.assertOrgVisible(orgId);
    // G88：别名统一 camelCase（原 snake_case 导致前端 m.userOrgId=undefined →
    //      移除/改数据范围实际请求 /user-orgs/undefined，静默失败）
    return this.ds.query(`
      SELECT
        uo.id         AS "userOrgId",
        uo.is_primary AS "isPrimary",
        uo.data_scope_level AS "dataScopeLevel",
        uo.created_at AS "assignedAt",
        u.user_id     AS "id",
        u.username    AS "username",
        u.real_name   AS "realNameZh",
        u.store_code  AS "storeCode",
        u.status      AS "userStatus",
        COALESCE(
          (SELECT r.role_code FROM sys_user_role ur
           JOIN sys_role r ON ur.role_id = r.role_id
           WHERE ur.user_id = u.user_id AND ur.is_primary = true LIMIT 1),
          (SELECT r.role_code FROM sys_user_role ur
           JOIN sys_role r ON ur.role_id = r.role_id
           WHERE ur.user_id = u.user_id LIMIT 1)
        ) AS "role",
        COALESCE(
          (SELECT r.role_name_zh FROM sys_user_role ur
           JOIN sys_role r ON ur.role_id = r.role_id
           WHERE ur.user_id = u.user_id AND ur.is_primary = true LIMIT 1),
          (SELECT r.role_name_zh FROM sys_user_role ur
           JOIN sys_role r ON ur.role_id = r.role_id
           WHERE ur.user_id = u.user_id LIMIT 1)
        ) AS "roleNameZh"
      FROM sys_user_orgs uo
      JOIN sys_user u ON u.user_id = uo.user_id
      WHERE uo.org_id = $1
      ORDER BY uo.is_primary DESC, u.real_name ASC
    `, [orgId]);
  }

  async assignUserOrg(dto: AssignUserOrgDto): Promise<SysUserOrgEntity> {
    await this.assertOrgVisible(dto.orgId);
    const existing = await this.userOrgRepo.findOne({
      where: { userId: dto.userId, orgId: dto.orgId },
    });
    if (existing) {
      existing.isPrimary = dto.isPrimary ?? existing.isPrimary;
      existing.dataScopeLevel = dto.dataScopeLevel ?? existing.dataScopeLevel;
      const saved = await this.userOrgRepo.save(existing);
      this.dataScopeService.invalidate(String(dto.userId));
      await this.syncPrimaryStoreCode(dto.userId);   // G129
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
    await this.syncPrimaryStoreCode(dto.userId);     // G129
    return saved;
  }

  async updateUserOrg(id: number, dto: UpdateUserOrgDto): Promise<SysUserOrgEntity> {
    const uo = await this.userOrgRepo.findOne({ where: { id } });
    if (!uo) throw new NotFoundException(`UserOrg ${id} not found`);
    await this.assertOrgVisible(uo.orgId);
    Object.assign(uo, dto);
    const saved = await this.userOrgRepo.save(uo);
    this.dataScopeService.invalidate(String(uo.userId));
    await this.syncPrimaryStoreCode(uo.userId);      // G129
    return saved;
  }

  async removeUserOrg(id: number): Promise<void> {
    const uo = await this.userOrgRepo.findOne({ where: { id } });
    if (uo) await this.assertOrgVisible(uo.orgId);
    if (uo) this.dataScopeService.invalidate(String(uo.userId));
    await this.userOrgRepo.delete(id);
    if (uo) await this.syncPrimaryStoreCode(uo.userId);  // G129
  }

  /**
   * G129：同步 sys_user.store_code = 主组织绑定的 org_code（GROUP → 'ALL'）。
   * Why：行级数据范围过滤的**实际驱动**是 sys_user.store_code（generic-crud
   *   effectiveQuery[scopeField]=userStoreCode），而非 sys_user_orgs 本身。G122 已一次性
   *   回填，但**管理员在系统设置 UI 改组织绑定时未同步 store_code** → 会重新引入 G122 修过的
   *   行级范围漂移（场长看空养殖、店长看空销售等假空）。此处把 G122 的规则接进 UI 写路径，
   *   使「组织绑定」改动在系统设置 UI 上即等效。bump perms_version 强制目标用户重登拿新 storeCode。
   */
  private async syncPrimaryStoreCode(userId: number): Promise<void> {
    const rows = await this.userOrgRepo.manager.query(
      `SELECT CASE WHEN uo.data_scope_level = 'GROUP' THEN 'ALL' ELSE o.org_code END AS code
         FROM sys_user_orgs uo
         JOIN sys_organizations o ON o.id = uo.org_id
        WHERE uo.user_id = $1 AND uo.is_primary = true
        LIMIT 1`,
      [userId],
    );
    const code: string | undefined = rows[0]?.code;
    if (!code) return;   // 无主绑定 → 保持 store_code 不动（避免误清）
    await this.userOrgRepo.manager.query(
      `UPDATE sys_user
          SET store_code = $1, perms_version = COALESCE(perms_version, 0) + 1, updated_at = NOW()
        WHERE user_id = $2 AND COALESCE(store_code, '') <> $1`,
      [code, userId],
    );
  }

  // ── 用户额外授权 ─────────────────────────────────────────────────────────────

  async getUserScopes(userId: number) {
    const visibleProjectCodes = await this.visibleCompanyScopedCodes('biz_projects', 'project_code');
    const visibleWarehouseCodes = await this.visibleCompanyScopedCodes('wms_warehouses', 'warehouse_code');
    const projects = visibleProjectCodes === 'ALL'
      ? await this.userProjRepo.find({ where: { userId } })
      : visibleProjectCodes.length
        ? await this.userProjRepo.find({ where: { userId, projectCode: In(visibleProjectCodes) } })
        : [];
    const warehouses = visibleWarehouseCodes === 'ALL'
      ? await this.userWhRepo.find({ where: { userId } })
      : visibleWarehouseCodes.length
        ? await this.userWhRepo.find({ where: { userId, warehouseCode: In(visibleWarehouseCodes) } })
        : [];
    return { projects, warehouses };
  }

  async addProjectScope(userId: number, projectCode: string): Promise<SysUserProjectScopeEntity> {
    await this.assertCompanyScopedCodeVisible('biz_projects', 'project_code', projectCode, '项目');
    const existing = await this.userProjRepo.findOne({ where: { userId, projectCode } });
    if (existing) return existing;
    const s = this.userProjRepo.create({ userId, projectCode });
    const saved = await this.userProjRepo.save(s);
    this.dataScopeService.invalidate(String(userId));
    return saved;
  }

  async removeProjectScope(id: number): Promise<void> {
    const s = await this.userProjRepo.findOne({ where: { id } });
    if (s) await this.assertCompanyScopedCodeVisible('biz_projects', 'project_code', s.projectCode, '项目');
    if (s) this.dataScopeService.invalidate(String(s.userId));
    await this.userProjRepo.delete(id);
  }

  async addWarehouseScope(userId: number, warehouseCode: string): Promise<SysUserWarehouseScopeEntity> {
    await this.assertCompanyScopedCodeVisible('wms_warehouses', 'warehouse_code', warehouseCode, '仓库');
    const existing = await this.userWhRepo.findOne({ where: { userId, warehouseCode } });
    if (existing) return existing;
    const s = this.userWhRepo.create({ userId, warehouseCode });
    const saved = await this.userWhRepo.save(s);
    this.dataScopeService.invalidate(String(userId));
    return saved;
  }

  async removeWarehouseScope(id: number): Promise<void> {
    const s = await this.userWhRepo.findOne({ where: { id } });
    if (s) await this.assertCompanyScopedCodeVisible('wms_warehouses', 'warehouse_code', s.warehouseCode, '仓库');
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
