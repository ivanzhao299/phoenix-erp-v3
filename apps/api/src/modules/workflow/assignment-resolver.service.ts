import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DataScopeService } from '../org/services/data-scope.service';

export type ApproverType =
  | 'ROLE'
  | 'USER'
  | 'ORG_MANAGER'
  | 'PROJECT_MANAGER'
  | 'COMPANY_FINANCE'
  | 'DIRECT_MANAGER'
  | 'COMPANY_ROLE'
  | 'PROJECT_ROLE';

export interface AssignmentInput {
  approverType: ApproverType;
  /** ROLE / COMPANY_ROLE / PROJECT_ROLE 时必填 */
  approverRole?: string;
  /** USER 时必填 */
  approverUserId?: string;
  /** 业务上下文 — 用于 ORG_MANAGER / PROJECT_MANAGER / COMPANY_FINANCE / DIRECT_MANAGER */
  bizContext?: {
    companyCode?: string;
    projectCode?: string;
    starterUserId?: string;
  };
}

export interface ResolvedApprover {
  userId: string;
  username: string;
  displayName: string;
  roleCode: string | null;
  source: ApproverType;
}

@Injectable()
export class AssignmentResolverService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly dataScope: DataScopeService,
  ) {}

  async resolveApprovers(input: AssignmentInput): Promise<ResolvedApprover[]> {
    const { approverType, approverRole, approverUserId, bizContext } = input;

    switch (approverType) {
      case 'ROLE':
        return this.byRole(approverRole!);

      case 'USER':
        return this.byUserId(approverUserId!, 'USER');

      case 'COMPANY_ROLE':
        return this.byCompanyRole(approverRole!, bizContext?.companyCode);

      case 'PROJECT_ROLE':
        return this.byProjectRole(approverRole!, bizContext?.projectCode);

      case 'ORG_MANAGER':
        return this.byOrgManager(bizContext?.companyCode, bizContext?.projectCode);

      case 'PROJECT_MANAGER':
        return this.byProjectManager(bizContext?.projectCode);

      case 'COMPANY_FINANCE':
        return this.byCompanyFinance(bizContext?.companyCode);

      case 'DIRECT_MANAGER':
        return this.byDirectManager(bizContext?.starterUserId);

      default:
        return [];
    }
  }

  // ── 1. 按角色查全部用户 ────────────────────────────────────────────────────
  private async byRole(roleCode: string): Promise<ResolvedApprover[]> {
    const rows: Array<{ user_id: string; username: string; real_name: string }> =
      await this.ds.query(
        `SELECT u.user_id, u.username, u.real_name
         FROM sys_user u
         JOIN sys_user_role ur ON ur.user_id = u.user_id
         JOIN sys_role r ON r.role_id = ur.role_id
         WHERE r.role_code = $1 AND u.status = 1`,
        [roleCode],
      );
    return rows.map((r) => ({
      userId:      String(r.user_id),
      username:    r.username,
      displayName: r.real_name ?? r.username,
      roleCode,
      source:      'ROLE' as ApproverType,
    }));
  }

  // ── 2. 按用户ID直接解析 ──────────────────────────────────────────────────
  private async byUserId(userId: string, source: ApproverType): Promise<ResolvedApprover[]> {
    const rows: Array<{ user_id: string; username: string; real_name: string }> =
      await this.ds.query(
        `SELECT user_id, username, real_name FROM sys_user WHERE user_id = $1 AND status = 1`,
        [userId],
      );
    return rows.map((r) => ({
      userId:      String(r.user_id),
      username:    r.username,
      displayName: r.real_name ?? r.username,
      roleCode:    null,
      source,
    }));
  }

  // ── 3. 公司范围内的角色（COMPANY_ROLE）─────────────────────────────────────
  private async byCompanyRole(
    roleCode: string,
    companyCode?: string,
  ): Promise<ResolvedApprover[]> {
    if (!companyCode) return this.byRole(roleCode);
    const rows: Array<{ user_id: string; username: string; real_name: string }> =
      await this.ds.query(
        `SELECT DISTINCT u.user_id, u.username, u.real_name
         FROM sys_user u
         JOIN sys_user_role ur ON ur.user_id = u.user_id
         JOIN sys_role r ON r.role_id = ur.role_id
         JOIN sys_user_orgs uo ON uo.user_id = u.user_id
         JOIN sys_organizations o ON o.id = uo.org_id
         WHERE r.role_code = $1
           AND o.company_code = $2
           AND u.status = 1`,
        [roleCode, companyCode],
      );
    if (rows.length > 0) {
      return rows.map((r) => ({
        userId:      String(r.user_id),
        username:    r.username,
        displayName: r.real_name ?? r.username,
        roleCode,
        source:      'COMPANY_ROLE' as ApproverType,
      }));
    }
    // 兜底：全局角色
    return this.byRole(roleCode);
  }

  // ── 4. 项目范围内的角色（PROJECT_ROLE）─────────────────────────────────────
  private async byProjectRole(
    roleCode: string,
    projectCode?: string,
  ): Promise<ResolvedApprover[]> {
    if (!projectCode) return this.byRole(roleCode);
    const rows: Array<{ user_id: string; username: string; real_name: string }> =
      await this.ds.query(
        `SELECT DISTINCT u.user_id, u.username, u.real_name
         FROM sys_user u
         JOIN sys_user_role ur ON ur.user_id = u.user_id
         JOIN sys_role r ON r.role_id = ur.role_id
         WHERE r.role_code = $1
           AND u.status = 1
           AND EXISTS (
             SELECT 1 FROM sys_user_project_scopes ups
             WHERE ups.user_id = u.user_id AND ups.project_code = $2
           )`,
        [roleCode, projectCode],
      );
    if (rows.length > 0) {
      return rows.map((r) => ({
        userId:      String(r.user_id),
        username:    r.username,
        displayName: r.real_name ?? r.username,
        roleCode,
        source:      'PROJECT_ROLE' as ApproverType,
      }));
    }
    return this.byRole(roleCode);
  }

  // ── 5. 组织负责人（ORG_MANAGER）──────────────────────────────────────────
  private async byOrgManager(
    companyCode?: string,
    projectCode?: string,
  ): Promise<ResolvedApprover[]> {
    const code = projectCode ?? companyCode;
    if (!code) return [];

    const field = projectCode ? 'project_code' : 'company_code';
    const rows: Array<{ manager_user_id: string; manager_name: string }> =
      await this.ds.query(
        `SELECT manager_user_id, manager_name FROM sys_organizations
         WHERE ${field} = $1 AND manager_user_id IS NOT NULL
         LIMIT 1`,
        [code],
      );
    if (!rows.length || !rows[0].manager_user_id) return [];
    return this.byUserId(String(rows[0].manager_user_id), 'ORG_MANAGER');
  }

  // ── 6. 项目负责人（PROJECT_MANAGER）──────────────────────────────────────
  private async byProjectManager(projectCode?: string): Promise<ResolvedApprover[]> {
    if (!projectCode) return [];
    const rows: Array<{ project_manager_user_id: string; project_manager_name: string }> =
      await this.ds.query(
        `SELECT project_manager_user_id, project_manager_name FROM prc2_projects
         WHERE project_code = $1 AND project_manager_user_id IS NOT NULL
         LIMIT 1`,
        [projectCode],
      );
    if (!rows.length || !rows[0].project_manager_user_id) return [];
    return this.byUserId(String(rows[0].project_manager_user_id), 'PROJECT_MANAGER');
  }

  // ── 7. 公司财务负责人（COMPANY_FINANCE）───────────────────────────────────
  // 优先级：ROLE_FACTORY_ACCOUNTANT → ROLE_GROUP_FINANCE → ROLE_FIN_CFO
  private async byCompanyFinance(companyCode?: string): Promise<ResolvedApprover[]> {
    const rolePriority = ['ROLE_FACTORY_ACCOUNTANT', 'ROLE_GROUP_FINANCE', 'ROLE_FIN_CFO'];
    for (const role of rolePriority) {
      const candidates = await this.byCompanyRole(role, companyCode);
      if (candidates.length > 0) {
        return candidates.map((c) => ({ ...c, source: 'COMPANY_FINANCE' as ApproverType }));
      }
    }
    return [];
  }

  // ── 8. 直属上级（DIRECT_MANAGER）──────────────────────────────────────────
  private async byDirectManager(starterUserId?: string): Promise<ResolvedApprover[]> {
    if (!starterUserId) return [];
    const rows: Array<{ manager_user_id: string }> = await this.ds.query(
      `SELECT manager_user_id FROM sys_user WHERE user_id = $1 AND manager_user_id IS NOT NULL`,
      [starterUserId],
    );
    if (!rows.length || !rows[0].manager_user_id) return [];
    return this.byUserId(String(rows[0].manager_user_id), 'DIRECT_MANAGER');
  }

  /** 解析失败时抛出带上下文的 400 错误 */
  throwNotFound(input: AssignmentInput, stepNo: number): never {
    throw new BadRequestException({
      code: 'APPROVER_NOT_FOUND',
      approverType: input.approverType,
      approverRole: input.approverRole,
      companyCode:  input.bizContext?.companyCode,
      projectCode:  input.bizContext?.projectCode,
      stepNo,
    });
  }

  /**
   * 候选审批人查询（P0 原子能力，开放式选人 / 转交 / 未来智能引擎共用）。
   * 返回 = 有 menuCode 的 requiredPerm 权限的 ACTIVE 用户 ∩ 数据域覆盖 companyCode。
   * 后端权威校验入口：前端下拉仅展示，PICK/reassign 提交时必须再调本方法复核。
   */
  async resolveEligibleApprovers(input: {
    menuCode: string;
    requiredPerm?: string;
    companyCode?: string;
    projectCode?: string;
    excludeUserId?: string;
  }): Promise<Array<{ userId: string; displayName: string; roleNameZh: string | null }>> {
    const { menuCode, requiredPerm = 'A', companyCode, excludeUserId } = input;
    if (!menuCode) return [];

    const params: unknown[] = [menuCode, requiredPerm];
    let excludeClause = '';
    if (excludeUserId) {
      params.push(excludeUserId);
      excludeClause = `AND u.user_id <> $${params.length}`;
    }

    // 1. 权限筛：持有「该菜单 requiredPerm 权限角色」的 ACTIVE 用户（权限位精确匹配，避免 LIKE 误命中）
    const rows: Array<{ user_id: string; display_name: string; role_name_zh: string | null; role_codes: string | null }> =
      await this.ds.query(
        `SELECT u.user_id,
                COALESCE(u.real_name, u.username) AS display_name,
                (SELECT r2.role_name_zh FROM sys_user_role ur2
                   JOIN sys_role r2 ON ur2.role_id = r2.role_id
                  WHERE ur2.user_id = u.user_id AND ur2.is_primary = true LIMIT 1) AS role_name_zh,
                (SELECT string_agg(DISTINCT r3.role_code, ',') FROM sys_user_role ur3
                   JOIN sys_role r3 ON ur3.role_id = r3.role_id
                  WHERE ur3.user_id = u.user_id) AS role_codes
           FROM sys_user u
          WHERE u.status = 1 ${excludeClause}
            AND EXISTS (
              SELECT 1 FROM sys_user_role ur
                JOIN sys_role r ON ur.role_id = r.role_id
                JOIN sys_role_menu_permission rmp ON rmp.role_code = r.role_code
               WHERE ur.user_id = u.user_id
                 AND rmp.menu_code = $1
                 AND $2 = ANY(string_to_array(rmp.permissions, ','))
            )
          ORDER BY display_name`,
        params,
      );

    // 2. 数据域筛：逐人用 DataScope 判断是否覆盖 companyCode（复用已测逻辑，含 isGlobal）
    const out: Array<{ userId: string; displayName: string; roleNameZh: string | null }> = [];
    for (const r of rows) {
      if (companyCode) {
        const roles = (r.role_codes ?? '').split(',').filter(Boolean);
        const scope = await this.dataScope.resolve(String(r.user_id), roles, menuCode);
        if (!scope.isGlobal && !scope.allowedCompanyCodes.includes(companyCode)) continue;
      }
      out.push({ userId: String(r.user_id), displayName: r.display_name, roleNameZh: r.role_name_zh });
    }
    return out;
  }
}
