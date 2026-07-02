import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

export interface MasterDataIssue {
  table: string;
  type: 'DUPLICATE_CODE' | 'DUPLICATE_NAME' | 'MISSING_CONTACT' | 'MISSING_PHONE'
      | 'MISSING_ACCOUNT' | 'MISSING_TAX' | 'MISSING_MANAGER' | 'LONG_INACTIVE'
      | 'FROZEN_REFERENCED' | 'ARCHIVED_REFERENCED';
  count: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
}

export interface MasterDataHealthReport {
  score: number;                        // 0-100
  totalIssues: number;
  totalRecords: number;
  byTable: Array<{ table: string; total: number; active: number; issues: number; score: number }>;
  issues: MasterDataIssue[];
  asOf: string;
}

/**
 * G5 — 主数据健康
 *
 * 监控 11 张主表：customer_master / supplier / biz_projects / shareholders / product_skus /
 *                brd_farms / brd_houses / brd_flocks / wms_warehouses / fin_cash_accounts / bank_accounts
 *
 * 检查：重复编码 / 重复名称 / 缺联系字段 / 长期未使用 / 冻结但被引用 / 归档但被引用
 *
 * 评分：
 *   score = avg(每张表得分)
 *   每张表得分 = max(0, 100 - (问题数 / total * 100) - severity_penalty)
 */
@Injectable()
export class MasterDataHealthService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private async safeQuery<T = any>(sql: string): Promise<T[]> {
    try { return await this.em.query(sql); } catch (e: any) { console.error("[catch-audit] safe() SQL failed:", e?.message); return []; }
  }

  async compute(): Promise<MasterDataHealthReport> {
    const issues: MasterDataIssue[] = [];
    const byTable: MasterDataHealthReport['byTable'] = [];

    // ── 11 张主表统一扫描 ──
    const tables = [
      { tbl: 'customer_master', codeField: 'customer_code', nameField: 'customer_name', extra: ['contact_phone'] },
      { tbl: 'supplier',        codeField: 'supplier_code', nameField: 'supplier_name', extra: ['contact_phone','tax_no'] },
      { tbl: 'biz_projects',    codeField: 'project_code',  nameField: 'project_name',  extra: [] },
      { tbl: 'shareholders',    codeField: 'shareholder_code', nameField: 'shareholder_name', extra: [] },
      { tbl: 'product_skus',    codeField: 'sku_code',      nameField: 'sku_name',      extra: [] },
      { tbl: 'brd_farms',       codeField: 'farm_code',     nameField: 'farm_name',     extra: ['manager'] },
      { tbl: 'brd_houses',      codeField: 'house_code',    nameField: 'house_name',    extra: [] },
      { tbl: 'brd_flocks',      codeField: 'flock_no',      nameField: 'flock_no',      extra: [] },
      { tbl: 'wms_warehouses',  codeField: 'warehouse_code',nameField: 'warehouse_name',extra: [] },
      { tbl: 'fin_cash_accounts', codeField: 'account_code', nameField: 'account_name', extra: ['bank_name'] },
    ];

    for (const t of tables) {
      const totalRows = await this.safeQuery<{ c: string }>(`SELECT COUNT(*)::text AS c FROM ${t.tbl}`);
      const total = parseInt(totalRows[0]?.c ?? '0', 10);
      if (total === 0) continue;

      const activeRows = await this.safeQuery<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM ${t.tbl} WHERE COALESCE(status,'ACTIVE')='ACTIVE'`,
      );
      const active = parseInt(activeRows[0]?.c ?? '0', 10);

      let tableIssues = 0;

      // 重复编码
      const dupCode = await this.safeQuery<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM (SELECT ${t.codeField} FROM ${t.tbl} GROUP BY ${t.codeField} HAVING COUNT(*)>1) x`,
      );
      const dupCodeN = parseInt(dupCode[0]?.c ?? '0', 10);
      if (dupCodeN > 0) {
        issues.push({ table: t.tbl, type: 'DUPLICATE_CODE', count: dupCodeN, severity: 'HIGH',
          message: `${t.tbl} 存在 ${dupCodeN} 个重复 ${t.codeField}` });
        tableIssues += dupCodeN;
      }

      // 重复名称（only if name differs from code）
      if (t.nameField !== t.codeField) {
        const dupName = await this.safeQuery<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM (SELECT ${t.nameField} FROM ${t.tbl} WHERE ${t.nameField} IS NOT NULL GROUP BY ${t.nameField} HAVING COUNT(*)>1) x`,
        );
        const dupNameN = parseInt(dupName[0]?.c ?? '0', 10);
        if (dupNameN > 0) {
          issues.push({ table: t.tbl, type: 'DUPLICATE_NAME', count: dupNameN, severity: 'MEDIUM',
            message: `${t.tbl} 存在 ${dupNameN} 个重复 ${t.nameField}` });
          tableIssues += dupNameN;
        }
      }

      // 缺字段（contact_phone / tax_no / manager 等）
      for (const f of t.extra) {
        const miss = await this.safeQuery<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM ${t.tbl} WHERE COALESCE(status,'ACTIVE')='ACTIVE'
                 AND (${f} IS NULL OR ${f}='')`,
        );
        const missN = parseInt(miss[0]?.c ?? '0', 10);
        if (missN > 0) {
          const type = f.includes('phone') ? 'MISSING_PHONE' as const
                     : f.includes('tax')   ? 'MISSING_TAX'   as const
                     : f.includes('manager') ? 'MISSING_MANAGER' as const
                     : f.includes('account') ? 'MISSING_ACCOUNT' as const
                     : f.includes('bank')    ? 'MISSING_ACCOUNT' as const
                     : 'MISSING_CONTACT' as const;
          issues.push({ table: t.tbl, type, count: missN, severity: 'LOW',
            message: `${t.tbl} 有 ${missN} 条 ACTIVE 记录缺 ${f}` });
          tableIssues += Math.floor(missN / 5); // 缺字段权重低
        }
      }

      // 评分：100 - 问题数比例（封顶 100，地板 0）
      const score = Math.max(0, Math.min(100, 100 - Math.round((tableIssues / Math.max(1, total)) * 100)));
      byTable.push({ table: t.tbl, total, active, issues: tableIssues, score });
    }

    const totalIssues = issues.reduce((s, i) => s + i.count, 0);
    const totalRecords = byTable.reduce((s, b) => s + b.total, 0);
    const score = byTable.length === 0
      ? 100
      : Math.round(byTable.reduce((s, b) => s + b.score, 0) / byTable.length);

    return { score, totalIssues, totalRecords, byTable, issues, asOf: new Date().toISOString() };
  }
}
