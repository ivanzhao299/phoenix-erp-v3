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
import { SysOrganizationEntity } from '../entities/sys-organization.entity';

export type ScopeLevel = 'SELF' | 'PROJECT' | 'COMPANY' | 'REGION' | 'GROUP';

export interface DataScopeContext {
  isGlobal: boolean;
  scopeLevel: ScopeLevel;
  allowedCompanyCodes: string[];
  allowedProjectCodes: string[];
  allowedWarehouseCodes: string[];
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
        userId,
      };
      this._setCache(cacheKey, ctx);
      return ctx;
    }

    // 展开组织范围
    const userIdNum = parseInt(userId, 10);
    // 使用 raw JOIN 查询（避免 TypeORM relations 依赖）
    const userOrgRows: Array<{
      org_id: number; is_primary: boolean; data_scope_level: string;
      company_code: string | null; project_code: string | null;
      warehouse_code: string | null; parent_id: number | null;
    }> = await this.orgRepo.manager.query(`
      SELECT uo.org_id, uo.is_primary, uo.data_scope_level,
             o.company_code, o.project_code, o.warehouse_code, o.parent_id
      FROM sys_user_orgs uo
      JOIN sys_organizations o ON o.id = uo.org_id
      WHERE uo.user_id = $1
    `, [userIdNum]);

    const companyCodes = new Set<string>();
    const projectCodes = new Set<string>();
    const warehouseCodes = new Set<string>();

    if (userOrgRows.length > 0) {
      for (const row of userOrgRows) {
        if (row.company_code) companyCodes.add(row.company_code);
        if (row.project_code) projectCodes.add(row.project_code);
        if (row.warehouse_code) warehouseCodes.add(row.warehouse_code);

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
    } else {
      // 兜底：无 sys_user_orgs 记录，从 CLS 读 storeCode
      const user = this.cls.get('user') as Record<string, unknown> | undefined;
      const storeCode: string = (user?.['storeCode'] as string | undefined) ?? '';
      if (storeCode === 'ALL') {
        // C1 修复（RBAC Hardening Phase 1）：
        //   storeCode='ALL' 语义 = 跨公司全局访问，等同于 GROUP 范围
        //   直接返回 isGlobal=true，避免空 companyCodes 导致数据全部拒绝
        const ctx: DataScopeContext = {
          isGlobal: true,
          scopeLevel: 'GROUP',
          allowedCompanyCodes: [],
          allowedProjectCodes: [],
          allowedWarehouseCodes: [],
          userId,
        };
        this._setCache(cacheKey, ctx);
        return ctx;
      }
      if (storeCode) {
        storeCode.split(',').forEach((c) => companyCodes.add(c.trim()));
      }
    }

    // 追加额外项目/仓库授权
    const extraProjects = await this.userProjRepo.find({ where: { userId: userIdNum } });
    extraProjects.forEach((ep) => projectCodes.add(ep.projectCode));

    const extraWarehouses = await this.userWhRepo.find({ where: { userId: userIdNum } });
    extraWarehouses.forEach((ew) => warehouseCodes.add(ew.warehouseCode));

    const ctx: DataScopeContext = {
      isGlobal: false,
      scopeLevel: topLevel,
      allowedCompanyCodes: [...companyCodes],
      allowedProjectCodes: [...projectCodes],
      allowedWarehouseCodes: [...warehouseCodes],
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
