/**
 * Phoenix ERP V3 — DataScopeService
 * RBAC-2 组织范围 + 数据范围解析
 * 2026-05-25
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { SysDataScopeEntity } from '../entities/sys-data-scope.entity';
import { SysUserOrgEntity } from '../entities/sys-user-org.entity';
import { SysUserProjectScopeEntity } from '../entities/sys-user-project-scope.entity';
import { SysUserWarehouseScopeEntity } from '../entities/sys-user-warehouse-scope.entity';
import { SysUserFarmScopeEntity } from '../entities/sys-user-farm-scope.entity'; // G4-E
import { SysOrganizationEntity } from '../entities/sys-organization.entity';

export type ScopeLevel = 'SELF' | 'PROJECT' | 'COMPANY' | 'REGION' | 'GROUP';

export interface DataScopeContext {
  isGlobal: boolean;
  scopeLevel: ScopeLevel;
  allowedCompanyCodes: string[];
  allowedProjectCodes: string[];
  allowedWarehouseCodes: string[];
  allowedFarmCodes: string[]; // G4-E: FarmScope（在 CompanyScope 之下，与 Warehouse 同层）
  allowedSiteCodes: string[]; // G5-D: SiteScope（MDM-1 后 SITE 是独立维度，sys_user_orgs 含 SITE 类型行）
  userId: string;
}

// 范围等级排序（越大权限越宽松）
const SCOPE_RANK: Record<ScopeLevel, number> = {
  SELF: 0,
  PROJECT: 1,
  COMPANY: 2,
  REGION: 3,
  GROUP: 4,
};

// 内存缓存：key = `${userId}:${sortedRoles}:${menuCode}`, TTL = 30s
interface CacheEntry {
  context: DataScopeContext;
  expireAt: number;
}
const cache = new Map<string, CacheEntry>();

@Injectable()
export class DataScopeService {
  constructor(
    @InjectRepository(SysDataScopeEntity)
    private readonly dataScopeRepo: Repository<SysDataScopeEntity>,
    @InjectRepository(SysUserOrgEntity)
    private readonly userOrgRepo: Repository<SysUserOrgEntity>,
    @InjectRepository(SysUserProjectScopeEntity)
    private readonly userProjRepo: Repository<SysUserProjectScopeEntity>,
    @InjectRepository(SysUserWarehouseScopeEntity)
    private readonly userWhRepo: Repository<SysUserWarehouseScopeEntity>,
    @InjectRepository(SysUserFarmScopeEntity)
    private readonly userFarmRepo: Repository<SysUserFarmScopeEntity>, // G4-E
    @InjectRepository(SysOrganizationEntity)
    private readonly orgRepo: Repository<SysOrganizationEntity>,
    private readonly cls: ClsService,
  ) {}

  /**
   * 解析用户在指定菜单下的数据范围
   * 1. ROLE_ADMIN → isGlobal=true（不查DB）
   * 2. 命中缓存 → 直接返回
   * 3. 查 sys_data_scopes → 取最高 scope_type
   * 4. GROUP → isGlobal=true；其余 → 展开 org codes
   * 5. 追加额外 project/warehouse 授权
   * 6. 兜底：无 sys_user_orgs → 用 storeCode
   */
  async resolve(
    userId: string,
    roles: string[],
    menuCode: string,
  ): Promise<DataScopeContext> {
    // ROLE_ADMIN 直接全局
    if (roles.includes('ROLE_ADMIN')) {
      return {
        isGlobal: true,
        scopeLevel: 'GROUP',
        allowedCompanyCodes: [],
        allowedProjectCodes: [],
        allowedWarehouseCodes: [],
        allowedFarmCodes: [], // G4-E
        allowedSiteCodes: [], // G5-D
        userId,
      };
    }

    // 缓存检查
    const cacheKey = `${userId}:${[...roles].sort().join(',')}:${menuCode}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expireAt > Date.now()) {
      return cached.context;
    }

    // 查 sys_data_scopes：取当前角色集合中匹配该菜单的最高 scope_type
    const scopeRules = await this.dataScopeRepo.find({
      where: { enabled: true, moduleCode: menuCode },
    });

    let topLevel: ScopeLevel = 'SELF';
    for (const rule of scopeRules) {
      if (roles.includes(rule.roleCode)) {
        if (SCOPE_RANK[rule.scopeType] > SCOPE_RANK[topLevel]) {
          topLevel = rule.scopeType;
        }
      }
    }

    // GROUP → 全局
    if (topLevel === 'GROUP') {
      const ctx: DataScopeContext = {
        isGlobal: true,
        scopeLevel: 'GROUP',
        allowedCompanyCodes: [],
        allowedProjectCodes: [],
        allowedWarehouseCodes: [],
        allowedFarmCodes: [], // G4-E
        allowedSiteCodes: [], // G5-D
        userId,
      };
      this._setCache(cacheKey, ctx);
      return ctx;
    }

    // 展开组织范围
    const userIdNum = parseInt(userId, 10);
    // 使用 raw JOIN 查询（避免 TypeORM relations 依赖）
    // G5-D：增加 org_type 与 site_code（业务 SITE 维度），让 SITE 类型组织绑定能进入 scope
    const userOrgRows: Array<{
      org_id: number; is_primary: boolean; data_scope_level: string;
      company_code: string | null; project_code: string | null;
      warehouse_code: string | null; parent_id: number | null;
      org_type: string | null; site_code: string | null; org_code: string;
    }> = await this.orgRepo.manager.query(`
      SELECT uo.org_id, uo.is_primary, uo.data_scope_level,
             o.company_code, o.project_code, o.warehouse_code, o.parent_id,
             o.org_type, o.site_code, o.org_code
      FROM sys_user_orgs uo
      JOIN sys_organizations o ON o.id = uo.org_id
      WHERE uo.user_id = $1
    `, [userIdNum]);

    const companyCodes = new Set<string>();
    const projectCodes = new Set<string>();
    const warehouseCodes = new Set<string>();
    const siteCodes = new Set<string>();  // G5-D

    if (userOrgRows.length > 0) {
      for (const row of userOrgRows) {
        if (row.company_code) companyCodes.add(row.company_code);
        if (row.project_code) projectCodes.add(row.project_code);
        if (row.warehouse_code) warehouseCodes.add(row.warehouse_code);
        // G5-D：SITE 类型组织绑定 → 用 org_code（如 'SITE-MENGSAI-LAYER'）作为 site_code
        if (row.org_type === 'SITE') siteCodes.add(row.org_code);
        else if (row.site_code) siteCodes.add(row.site_code); // 兼容 SITE 字段

        // REGION 级别：展开同一父节点下所有子公司
        if (topLevel === 'REGION' && row.parent_id) {
          const siblings = await this.orgRepo.find({
            where: { parentId: row.parent_id, status: 'ACTIVE' },
          });
          for (const s of siblings) {
            if (s.companyCode) companyCodes.add(s.companyCode);
          }
        }

        // Phase B 增强：BU 级别展开——向下穿透到 COMPANY 子节点
        // 当 org 节点本身无 company_code（如 BU-AGRI 这类事业群节点）时，
        // 查找其下所有 COMPANY 类型子节点，收集它们的 company_code
        if (!row.company_code && row.org_id) {
          const childCompanies = await this.orgRepo.manager.query(`
            SELECT company_code FROM sys_organizations
            WHERE parent_id = $1 AND org_type = 'COMPANY' AND status = 'ACTIVE'
              AND company_code IS NOT NULL
          `, [row.org_id]);
          for (const c of childCompanies) {
            if (c.company_code) companyCodes.add(c.company_code);
          }
          // 如果还是空（GROUP/HQ 节点），再向下一层
          if (childCompanies.length === 0) {
            const grandChildren = await this.orgRepo.manager.query(`
              SELECT o2.company_code FROM sys_organizations o1
              JOIN sys_organizations o2 ON o2.parent_id = o1.id
              WHERE o1.parent_id = $1 AND o2.org_type = 'COMPANY'
                AND o2.status = 'ACTIVE' AND o2.company_code IS NOT NULL
            `, [row.org_id]);
            for (const c of grandChildren) {
              if (c.company_code) companyCodes.add(c.company_code);
            }
          }
        }
      }
    }
    // G76：store_code 已降级为 POS 门店行级隔离专用，**不再**作为 DataScope 公司范围回退。
    //   无 sys_user_orgs 绑定的用户 → 空 companyCodes（= 拒绝全部，isGlobal=false）。
    //   全局/跨公司访问只认：ROLE_ADMIN（见上 line ~79）或 sys_data_scopes 的 GROUP 规则，
    //   或在组织树显式绑 GROUP/多公司节点；而**不再**靠 store_code='ALL' 静默全局。
    //   —— 杜绝"新建用户默认 store_code='ALL' → 越权看所有公司"的安全洞（用户范围唯一源=组织绑定）。

    // 追加额外项目/仓库授权
    const extraProjects = await this.userProjRepo.find({ where: { userId: userIdNum } });
    extraProjects.forEach((ep) => projectCodes.add(ep.projectCode));

    const extraWarehouses = await this.userWhRepo.find({ where: { userId: userIdNum } });
    extraWarehouses.forEach((ew) => warehouseCodes.add(ew.warehouseCode));

    // G4-E：追加场站授权
    const farmCodes = new Set<string>();
    const extraFarms = await this.userFarmRepo.find({ where: { userId: userIdNum } });
    extraFarms.forEach((ef) => farmCodes.add(ef.farmCode));

    const ctx: DataScopeContext = {
      isGlobal: false,
      scopeLevel: topLevel,
      allowedCompanyCodes: [...companyCodes],
      allowedProjectCodes: [...projectCodes],
      allowedWarehouseCodes: [...warehouseCodes],
      allowedFarmCodes: [...farmCodes], // G4-E
      allowedSiteCodes: [...siteCodes], // G5-D
      userId,
    };
    this._setCache(cacheKey, ctx);
    return ctx;
  }

  /** 清除指定用户的所有缓存（权限变更时调用） */
  invalidate(userId: string): void {
    for (const key of cache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        cache.delete(key);
      }
    }
  }

  /** 从 CLS 读取当前请求的 DataScopeContext */
  getFromCls(): DataScopeContext | undefined {
    return this.cls.get<DataScopeContext | undefined>('dataScope');
  }

  private _setCache(key: string, ctx: DataScopeContext): void {
    cache.set(key, { context: ctx, expireAt: Date.now() + 30_000 });
  }
}
