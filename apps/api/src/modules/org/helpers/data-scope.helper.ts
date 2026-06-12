/**
 * Phoenix ERP V3 — DataScopeHelper
 * RBAC-2 数据范围过滤注入工具
 * 2026-05-25
 */
import { Injectable, ForbiddenException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { DataScopeContext } from '../services/data-scope.service';

@Injectable()
export class DataScopeHelper {
  constructor(private readonly cls: ClsService) {}

  /**
   * QueryBuilder 模式：追加数据范围 WHERE 过滤
   * @param qb 目标 QueryBuilder
   * @param opts.alias 实体别名
   * @param opts.companyField 公司码字段名（默认 'companyCode'，TypeORM camelCase）
   * @param opts.projectField 项目码字段名（默认 'projectCode'）
   */
  applyToQb<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    opts: {
      alias: string;
      companyField?: string;
      projectField?: string;
      /** G85-C 仓库维度：传入字段名才启用；用户无仓库授权清单（空数组）时不限制（与公司维度的「空=拒绝」语义不同，避免未配仓库授权的用户被一刀切断） */
      warehouseField?: string;
    },
  ): SelectQueryBuilder<T> {
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    if (!scope || scope.isGlobal) return qb;

    const { alias, companyField = 'companyCode', projectField = 'projectCode' } = opts;

    if (scope.allowedCompanyCodes.length > 0) {
      qb.andWhere(`${alias}.${companyField} IN (:...ds_cc)`, {
        ds_cc: scope.allowedCompanyCodes,
      });
    } else {
      // 无合法公司 → 空结果（HTTP 200，total=0）
      qb.andWhere('1 = 0');
      return qb;
    }

    // PROJECT 级别额外追加项目过滤
    if (scope.scopeLevel === 'PROJECT' && scope.allowedProjectCodes.length > 0) {
      qb.andWhere(`${alias}.${projectField} IN (:...ds_pc)`, {
        ds_pc: scope.allowedProjectCodes,
      });
    }

    // G85-C 仓库维度（可选启用）：有授权清单才过滤；保留 warehouse 为 NULL 的单据（无仓库归属的业务行不因此消失）
    if (opts.warehouseField && scope.allowedWarehouseCodes.length > 0) {
      qb.andWhere(
        `(${alias}.${opts.warehouseField} IN (:...ds_wc) OR ${alias}.${opts.warehouseField} IS NULL)`,
        { ds_wc: scope.allowedWarehouseCodes },
      );
    }

    return qb;
  }

  /**
   * Raw SQL 模式：返回 WHERE 片段 + 额外参数
   * @param opts.companyAlias raw SQL 中的公司码列名（默认 'company_code'）
   * @param opts.projectAlias raw SQL 中的项目码列名（默认 'project_code'）
   * @param paramOffset 已有 $n 参数的数量（新参数从 offset+1 开始）
   */
  buildRawCondition(
    opts: {
      companyAlias?: string;
      projectAlias?: string;
    },
    paramOffset: number,
  ): { sql: string; params: unknown[] } {
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    if (!scope || scope.isGlobal) return { sql: '1=1', params: [] };

    const { companyAlias = 'company_code', projectAlias = 'project_code' } = opts;

    let idx = paramOffset;
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (scope.allowedCompanyCodes.length > 0) {
      clauses.push(`${companyAlias} = ANY($${++idx})`);
      params.push(scope.allowedCompanyCodes);
    } else {
      clauses.push('1=0');
    }

    if (scope.scopeLevel === 'PROJECT' && scope.allowedProjectCodes.length > 0) {
      clauses.push(`${projectAlias} = ANY($${++idx})`);
      params.push(scope.allowedProjectCodes);
    }

    return {
      sql: clauses.length > 0 ? clauses.join(' AND ') : '1=1',
      params,
    };
  }

  /**
   * 详情接口归属校验：验证已加载记录是否落在当前用户的数据范围内。
   * 不满足则抛出 ForbiddenException（HTTP 403）。
   *
   * @param opts.companyCode  记录所属公司码（可为 null/undefined）
   * @param opts.projectCode  记录所属项目码（可为 null/undefined）
   * @param label  资源名称，用于错误提示（如 'PO'、'Payment'）
   */
  assertOwnership(
    opts: { companyCode?: string | null; projectCode?: string | null },
    label: string,
  ): void {
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    // 未解析 scope（未挂载 DataScopeGuard 的路由）或全局权限 → 直接放行
    if (!scope || scope.isGlobal) return;

    const { companyCode, projectCode } = opts;

    // 公司码校验：scope 有限制时，记录的 company 必须在允许列表内
    if (scope.allowedCompanyCodes.length > 0 && companyCode) {
      if (!scope.allowedCompanyCodes.includes(companyCode)) {
        throw new ForbiddenException(`无权访问该${label}（公司范围不匹配）`);
      }
    } else if (scope.allowedCompanyCodes.length === 0) {
      // 用户没有任何公司权限 → 全部拒绝
      throw new ForbiddenException(`无权访问该${label}（数据范围未配置）`);
    }

    // 项目码校验：仅 PROJECT 级别需要
    if (
      scope.scopeLevel === 'PROJECT' &&
      scope.allowedProjectCodes.length > 0 &&
      projectCode
    ) {
      if (!scope.allowedProjectCodes.includes(projectCode)) {
        throw new ForbiddenException(`无权访问该${label}（项目范围不匹配）`);
      }
    }
  }
}
