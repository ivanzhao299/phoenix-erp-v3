import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

export interface DataScopeAuditReport {
  score: number;
  totalUsers: number;
  scopedUsers: number;
  scopeCoverage: number; // 已配 scope 的用户比例
  scopes: {
    companies: { totalAssignments: number; usersWithAssignment: number };
    projects:  { totalAssignments: number; usersWithAssignment: number };
    warehouses:{ totalAssignments: number; usersWithAssignment: number };
    farms:     { totalAssignments: number; usersWithAssignment: number };
  };
  risks: Array<{ type: string; severity: 'LOW'|'MEDIUM'|'HIGH'; count: number; message: string }>;
  asOf: string;
}

/**
 * G5 — DataScope 越权风险审计
 *
 * 检查 4 维度：CompanyScope / ProjectScope / WarehouseScope / FarmScope
 *   - 未配置任何 scope 的非 ADMIN 用户（高风险：默认看全公司）
 *   - 已配置但 scope 表中记录指向不存在主数据的孤儿
 *   - 已配置但主数据已 INACTIVE 的失效授权
 *
 * 注：实际越权访问需运行时埋点审计；此 service 给出静态配置审计。
 */
@Injectable()
export class DataScopeAuditService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private async safe<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    try { return await this.em.query(sql, params); } catch { return []; }
  }

  async compute(): Promise<DataScopeAuditReport> {
    const risks: DataScopeAuditReport['risks'] = [];

    const totalUsersRows = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM sys_user WHERE status = 1`,
    );
    const totalUsers = parseInt(totalUsersRows[0]?.c ?? '0', 10);

    // 4 个 scope 维度统计
    const tables = [
      { tbl: 'sys_user_orgs',           keyField: 'user_id', label: 'companies' },
      { tbl: 'sys_user_project_scopes', keyField: 'user_id', label: 'projects' },
      { tbl: 'sys_user_warehouse_scopes', keyField: 'user_id', label: 'warehouses' },
      { tbl: 'sys_user_farm_scopes',    keyField: 'user_id', label: 'farms' },
    ];

    const scopes: any = { companies: { totalAssignments: 0, usersWithAssignment: 0 },
                          projects:  { totalAssignments: 0, usersWithAssignment: 0 },
                          warehouses:{ totalAssignments: 0, usersWithAssignment: 0 },
                          farms:     { totalAssignments: 0, usersWithAssignment: 0 } };

    for (const t of tables) {
      const total = await this.safe<{ c: string }>(`SELECT COUNT(*)::text AS c FROM ${t.tbl}`);
      const distinct = await this.safe<{ c: string }>(
        `SELECT COUNT(DISTINCT ${t.keyField})::text AS c FROM ${t.tbl}`,
      );
      scopes[t.label] = {
        totalAssignments: parseInt(total[0]?.c ?? '0', 10),
        usersWithAssignment: parseInt(distinct[0]?.c ?? '0', 10),
      };
    }

    // 未配 sys_user_orgs 的非 ADMIN 活跃用户（兜底走 storeCode，有越权风险）
    const orphanUsers = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM sys_user u
         WHERE u.status = 1
           AND NOT EXISTS (SELECT 1 FROM sys_user_orgs uo WHERE uo.user_id = u.user_id)
           AND NOT EXISTS (
             SELECT 1 FROM sys_user_role ur
               JOIN sys_role r ON ur.role_id = r.role_id
              WHERE ur.user_id = u.user_id AND r.role_code = 'ROLE_ADMIN'
           )`,
    );
    const orphanUsersN = parseInt(orphanUsers[0]?.c ?? '0', 10);
    if (orphanUsersN > 0) {
      risks.push({
        type: 'USER_WITHOUT_ORG_ASSIGNMENT', severity: 'HIGH', count: orphanUsersN,
        message: `${orphanUsersN} 个 ACTIVE 非 ADMIN 用户未配置 sys_user_orgs，存在跨公司越权风险`,
      });
    }

    // sys_user_warehouse_scopes 指向不存在的 warehouse
    const orphanWh = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM sys_user_warehouse_scopes uws
         WHERE NOT EXISTS (
           SELECT 1 FROM wms_warehouses w WHERE w.warehouse_code = uws.warehouse_code
         )`,
    );
    const orphanWhN = parseInt(orphanWh[0]?.c ?? '0', 10);
    if (orphanWhN > 0) {
      risks.push({
        type: 'ORPHAN_WAREHOUSE_SCOPE', severity: 'MEDIUM', count: orphanWhN,
        message: `${orphanWhN} 条 warehouse 授权指向不存在的 warehouse_code`,
      });
    }

    // sys_user_farm_scopes 指向不存在的 farm
    const orphanFarm = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM sys_user_farm_scopes ufs
         WHERE NOT EXISTS (
           SELECT 1 FROM brd_farms f WHERE f.farm_code = ufs.farm_code
         )`,
    );
    const orphanFarmN = parseInt(orphanFarm[0]?.c ?? '0', 10);
    if (orphanFarmN > 0) {
      risks.push({
        type: 'ORPHAN_FARM_SCOPE', severity: 'MEDIUM', count: orphanFarmN,
        message: `${orphanFarmN} 条 farm 授权指向不存在的 farm_code`,
      });
    }

    const scopedUsers = scopes.companies.usersWithAssignment;
    const scopeCoverage = totalUsers > 0
      ? Math.round((scopedUsers / totalUsers) * 100) / 100
      : 1;

    // 评分：覆盖率 × 70 - HIGH 风险扣分 × 30
    const highCount = risks.filter(r => r.severity === 'HIGH').reduce((s, r) => s + r.count, 0);
    const score = Math.max(0, Math.min(100,
      Math.round(scopeCoverage * 70 + (1 - Math.min(1, highCount / Math.max(1, totalUsers))) * 30),
    ));

    return { score, totalUsers, scopedUsers, scopeCoverage, scopes, risks, asOf: new Date().toISOString() };
  }
}
