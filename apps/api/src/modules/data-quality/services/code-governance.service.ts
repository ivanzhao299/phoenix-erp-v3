import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

export interface CodeGovernanceReport {
  score: number;
  rules: Array<{
    domain: string;
    table: string;
    field: string;
    expectedPattern: string;
    totalCount: number;
    nonconformingCount: number;
    examples: string[];
  }>;
  totalViolations: number;
  asOf: string;
}

/**
 * G5 — 编码规范率
 *
 * 检查 9 大编码族（CUS/SUP/PRJ/SHR/SKU/INV/SO/PO/PAY）的命名规则。
 *
 * 评分：(1 - 不合规数 / 总数) × 100
 */
@Injectable()
export class CodeGovernanceService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private async safe<T = any>(sql: string): Promise<T[]> {
    try { return await this.em.query(sql); } catch { return []; }
  }

  async compute(): Promise<CodeGovernanceReport> {
    // 编码规则定义（与主数据中心约定）
    const RULES = [
      { domain: 'CUS', table: 'customer_master', field: 'customer_code', pattern: '^(CUS|CUST|C)[-_]?\\w+$' },
      { domain: 'SUP', table: 'supplier',        field: 'supplier_code', pattern: '^(SUP|SUPP|S)[-_]?\\w+$' },
      { domain: 'PRJ', table: 'shr_projects',    field: 'project_code',  pattern: '^[A-Z][A-Z0-9_-]+$' },
      { domain: 'SHR', table: 'shareholders',    field: 'shareholder_code', pattern: '^(SH|SHR|SHAREH)[-_]?\\w+$' },
      { domain: 'SKU', table: 'product_skus',    field: 'sku_code',      pattern: '^[A-Z][A-Z0-9_-]+$' },
      { domain: 'INV', table: 'wms_inbound',     field: 'inbound_no',    pattern: '^WI[-_]?[A-Z0-9]+$' },
      { domain: 'SO',  table: 'sales_orders',   field: 'so_no',          pattern: '^SO[-_]?[A-Z0-9]+$' },
      { domain: 'PO',  table: 'prc_orders',     field: 'po_no',          pattern: '^PO[-_]?[A-Z0-9]+$' },
      { domain: 'PAY', table: 'prc_payments',   field: 'pay_no',         pattern: '^PAY[-_]?[A-Z0-9]+$' },
    ];

    const out: CodeGovernanceReport['rules'] = [];
    let totalViolations = 0;
    let totalRows = 0;

    for (const r of RULES) {
      const totalRowsRes = await this.safe<{ c: string }>(`SELECT COUNT(*)::text AS c FROM ${r.table}`);
      const totalCount = parseInt(totalRowsRes[0]?.c ?? '0', 10);
      if (totalCount === 0) {
        out.push({ ...r, expectedPattern: r.pattern, totalCount: 0, nonconformingCount: 0, examples: [] });
        continue;
      }

      const violRes = await this.safe<{ code: string }>(
        `SELECT ${r.field} AS code FROM ${r.table}
           WHERE ${r.field} IS NOT NULL
             AND ${r.field} !~ '${r.pattern.replace(/'/g, "''")}'
           LIMIT 1000`,
      );
      const nonconformingCount = violRes.length;
      const examples = violRes.slice(0, 5).map(v => v.code);

      out.push({
        domain: r.domain, table: r.table, field: r.field,
        expectedPattern: r.pattern, totalCount, nonconformingCount, examples,
      });
      totalRows += totalCount;
      totalViolations += nonconformingCount;
    }

    const score = totalRows === 0
      ? 100
      : Math.max(0, Math.min(100, Math.round((1 - totalViolations / totalRows) * 100)));

    return { score, rules: out, totalViolations, asOf: new Date().toISOString() };
  }
}
