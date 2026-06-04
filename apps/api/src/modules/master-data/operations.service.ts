import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * G5.5-E — Master Data Operations Service
 *
 * 把主数据中心从"治理系统"升级为"运营平台"所需的聚合查询：
 *   1. 6 中心实时统计（对象数/待审批/异常/健康评分）
 *   2. 全局搜索（跨 9 类主数据）
 *   3. 趋势分析（30 天新增/冻结/归档曲线）
 *   4. 待办列表（待审批 + 待补资料）
 *   5. 风险列表（重复编码 / 冻结引用 / 归档阻断历史）
 */

export interface CenterStat {
  key: string;        // org / biz / product / wms / fin / gov
  label: string;
  objectCount:    number;
  pendingCount:   number;
  riskCount:      number;
  healthScore:    number;
  members: Array<{ type: string; table: string; total: number; active: number; pending: number; frozen: number; archived: number }>;
}

export interface SearchResult {
  type: string;
  code: string;
  name: string;
  status: string;
  refLink: string;
}

export interface TrendPoint {
  day: string;
  created: number;
  frozen: number;
  archived: number;
}

@Injectable()
export class MasterDataOperationsService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private async safe<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    try { return await this.em.query(sql, params); } catch { return []; }
  }

  // 6 中心 → 主数据 type 映射（与 master-data-runtime.service TYPES 对齐）
  private readonly CENTERS = [
    {
      key: 'org', label: '组织中心',
      members: [
        { type: 'organization', table: 'sys_organizations', codeCol: 'org_code',  href: '/master-data/organizations' },
        { type: 'company',      table: 'sys_organizations', codeCol: 'org_code',  href: '/master-data/companies', filter: "org_type='COMPANY'" },
        { type: 'project',      table: 'shr_projects',      codeCol: 'project_code', href: '/master-data/projects' },
      ],
    },
    {
      key: 'biz', label: '商业主体中心',
      members: [
        { type: 'customer', table: 'sal_customers',  codeCol: 'customer_no', href: '/master-data/customers' },
        { type: 'supplier', table: 'prc2_suppliers', codeCol: 'supplier_code', href: '/master-data/suppliers' },
        { type: 'store',    table: 'mst_stores',     codeCol: 'store_code',  href: '/master-data/stores' },
      ],
    },
    {
      key: 'product', label: '产品中心',
      members: [
        { type: 'product', table: 'product_master',  codeCol: 'product_code', href: '/master-data/products' },
        { type: 'grade',   table: 'product_grades',  codeCol: 'grade_code',   href: '/master-data/product-grades' },
        { type: 'spec',    table: 'packaging_specs', codeCol: 'spec_code',    href: '/master-data/packaging-specs' },
        { type: 'sku',     table: 'product_skus',    codeCol: 'sku_code',     href: '/master-data/product-skus' },
      ],
    },
    {
      key: 'wms', label: '仓储物流中心',
      members: [
        { type: 'warehouse', table: 'wms_warehouses', codeCol: 'warehouse_code', href: '/master-data/warehouses' },
        { type: 'driver',    table: 'sal_drivers',    codeCol: 'driver_name',    href: '/master-data/drivers' },
        { type: 'vehicle',   table: 'sal_vehicles',   codeCol: 'vehicle_no',     href: '/master-data/vehicles' },
      ],
    },
    {
      key: 'fin', label: '财务主数据中心',
      members: [
        { type: 'cash-account', table: 'fin_cash_accounts', codeCol: 'account_code',     href: '/master-data/cash-accounts' },
        { type: 'bank-account', table: 'fin_bank_accounts', codeCol: 'bank_account_code', href: '/master-data/bank-accounts' },
      ],
    },
    {
      key: 'gov', label: '治理中心',
      members: [
        { type: 'dict',    table: 'sys_dict',     codeCol: 'dict_code', href: '/master-data/dictionaries' },
      ],
    },
  ];

  /** 6 中心实时统计（运营首页用） */
  async getCenters(): Promise<CenterStat[]> {
    const out: CenterStat[] = [];
    for (const c of this.CENTERS) {
      const members: CenterStat['members'] = [];
      let objectCount = 0, pendingCount = 0, riskCount = 0, scoreSum = 0;
      for (const m of c.members) {
        const where = (m as any).filter ? `WHERE ${(m as any).filter}` : '';
        const rows = await this.safe<{ status: string; c: string }>(
          `SELECT COALESCE(status,'ACTIVE') AS status, COUNT(*)::text AS c
             FROM ${m.table} ${where}
             GROUP BY COALESCE(status,'ACTIVE')`,
        );
        let total = 0, active = 0, pending = 0, frozen = 0, archived = 0;
        for (const r of rows) {
          const n = parseInt(r.c, 10);
          total += n;
          if (r.status === 'ACTIVE') active = n;
          else if (r.status === 'PENDING_APPROVAL') pending = n;
          else if (r.status === 'FROZEN') frozen = n;
          else if (r.status === 'ARCHIVED') archived = n;
        }
        members.push({ type: m.type, table: m.table, total, active, pending, frozen, archived });
        objectCount += total;
        pendingCount += pending;
        riskCount += frozen;   // FROZEN 暂作为风险
      }
      // 健康评分：活跃 / 总数（排除归档）
      const activeTotal = members.reduce((s, m) => s + m.active, 0);
      const liveTotal = members.reduce((s, m) => s + (m.total - m.archived), 0);
      const healthScore = liveTotal > 0 ? Math.round((activeTotal / liveTotal) * 100) : 100;

      out.push({
        key: c.key, label: c.label,
        objectCount, pendingCount, riskCount, healthScore,
        members,
      });
      scoreSum += healthScore;
    }
    return out;
  }

  /** 全局搜索：跨 9 类主数据按 code/name 匹配，每类最多 5 条 */
  async search(keyword: string): Promise<SearchResult[]> {
    const kw = String(keyword || '').trim();
    if (!kw) return [];
    const pattern = `%${kw.replace(/[%_]/g, '\\$&')}%`;

    const queries = [
      { type: 'customer',  sql: `SELECT customer_no AS code, customer_name AS name, status FROM sal_customers WHERE customer_no ILIKE $1 OR customer_name ILIKE $1 LIMIT 5`, href: '/master-data/customers' },
      { type: 'supplier',  sql: `SELECT supplier_code AS code, supplier_name AS name, status FROM prc2_suppliers WHERE supplier_code ILIKE $1 OR supplier_name ILIKE $1 LIMIT 5`, href: '/master-data/suppliers' },
      { type: 'product',   sql: `SELECT product_code AS code, product_name AS name, status FROM product_master WHERE product_code ILIKE $1 OR product_name ILIKE $1 LIMIT 5`, href: '/master-data/products' },
      { type: 'sku',       sql: `SELECT sku_code AS code, COALESCE(sku_name,product_name) AS name, status FROM product_skus WHERE sku_code ILIKE $1 OR sku_name ILIKE $1 OR product_name ILIKE $1 LIMIT 5`, href: '/master-data/product-skus' },
      { type: 'warehouse', sql: `SELECT warehouse_code AS code, COALESCE(warehouse_name_zh,warehouse_name) AS name, status FROM wms_warehouses WHERE warehouse_code ILIKE $1 OR warehouse_name ILIKE $1 OR warehouse_name_zh ILIKE $1 LIMIT 5`, href: '/master-data/warehouses' },
      { type: 'store',     sql: `SELECT store_code AS code, store_name AS name, status FROM mst_stores WHERE store_code ILIKE $1 OR store_name ILIKE $1 LIMIT 5`, href: '/master-data/stores' },
      { type: 'cash-account', sql: `SELECT account_code AS code, account_name AS name, status FROM fin_cash_accounts WHERE account_code ILIKE $1 OR account_name ILIKE $1 LIMIT 5`, href: '/master-data/cash-accounts' },
      { type: 'bank-account', sql: `SELECT bank_account_code AS code, bank_name AS name, status FROM fin_bank_accounts WHERE bank_account_code ILIKE $1 OR bank_name ILIKE $1 OR account_holder ILIKE $1 LIMIT 5`, href: '/master-data/bank-accounts' },
      { type: 'driver',    sql: `SELECT driver_name AS code, driver_name AS name, status FROM sal_drivers WHERE driver_name ILIKE $1 LIMIT 5`, href: '/master-data/drivers' },
      { type: 'vehicle',   sql: `SELECT vehicle_no AS code, plate_no AS name, status FROM sal_vehicles WHERE vehicle_no ILIKE $1 OR plate_no ILIKE $1 LIMIT 5`, href: '/master-data/vehicles' },
      { type: 'project',   sql: `SELECT project_code AS code, project_name AS name, status FROM shr_projects WHERE project_code ILIKE $1 OR project_name ILIKE $1 LIMIT 5`, href: '/master-data/projects' },
      { type: 'organization', sql: `SELECT org_code AS code, org_name AS name, status FROM sys_organizations WHERE org_code ILIKE $1 OR org_name ILIKE $1 LIMIT 5`, href: '/master-data/organizations' },
    ];

    const out: SearchResult[] = [];
    for (const q of queries) {
      const rows = await this.safe<any>(q.sql, [pattern]);
      for (const r of rows) {
        out.push({
          type: q.type,
          code: r.code,
          name: r.name ?? r.code,
          status: r.status ?? 'ACTIVE',
          refLink: `${q.href}?keyword=${encodeURIComponent(r.code)}`,
        });
      }
    }
    return out;
  }

  /** 30 天趋势：按主数据 type 维度统计 created/frozen/archived */
  async getTrend(days = 30): Promise<TrendPoint[]> {
    const result: TrendPoint[] = [];
    // 用 master_data_audit 日志聚合（CREATE / FREEZE / ARCHIVE 事件）
    const rows = await this.safe<{ day: string; action: string; c: string }>(
      `SELECT DATE_TRUNC('day', created_at)::date::text AS day,
              action,
              COUNT(*)::text AS c
         FROM master_data_audit
         WHERE created_at > NOW() - INTERVAL '${days} days'
           AND action IN ('CREATE','FREEZE','ARCHIVE')
         GROUP BY DATE_TRUNC('day', created_at), action
         ORDER BY day`,
    );
    const map = new Map<string, { created: number; frozen: number; archived: number }>();
    for (const r of rows) {
      const existing = map.get(r.day) ?? { created: 0, frozen: 0, archived: 0 };
      if (r.action === 'CREATE') existing.created = parseInt(r.c, 10);
      else if (r.action === 'FREEZE') existing.frozen = parseInt(r.c, 10);
      else if (r.action === 'ARCHIVE') existing.archived = parseInt(r.c, 10);
      map.set(r.day, existing);
    }
    // 补全所有日期（最近 N 天）
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const day = d.toISOString().slice(0, 10);
      result.push({ day, ...(map.get(day) ?? { created: 0, frozen: 0, archived: 0 }) });
    }
    return result;
  }

  /** 运营待办：待审批 + 待补资料 + 重复风险 */
  async getOperationsTodo() {
    // 待审批：所有 PENDING_APPROVAL 状态的主数据
    const pendingByType: Array<{ type: string; count: number; examples: string[]; href: string }> = [];
    for (const c of this.CENTERS) {
      for (const m of c.members) {
        const where = (m as any).filter ? `WHERE status='PENDING_APPROVAL' AND ${(m as any).filter}` : `WHERE status='PENDING_APPROVAL'`;
        const cnt = await this.safe<{ c: string; sample: string }>(
          `SELECT COUNT(*)::text AS c, STRING_AGG(${m.codeCol}, ',') AS sample FROM ${m.table} ${where}`,
        );
        const c0 = parseInt(cnt[0]?.c ?? '0', 10);
        if (c0 > 0) {
          pendingByType.push({ type: m.type, count: c0,
            examples: (cnt[0]?.sample ?? '').split(',').filter(Boolean).slice(0, 5),
            href: m.href });
        }
      }
    }

    // 缺联系人/电话（客户 + 供应商）
    const missingContactRows = await this.safe<{ table: string; cnt: string }>(
      `SELECT 'customer' AS table, COUNT(*)::text AS cnt
         FROM sal_customers WHERE COALESCE(status,'ACTIVE')='ACTIVE'
           AND (contact_phone IS NULL OR contact_phone='')
       UNION ALL
       SELECT 'supplier', COUNT(*)::text FROM prc2_suppliers
         WHERE COALESCE(status,'ACTIVE')='ACTIVE' AND (contact_phone IS NULL OR contact_phone='')`,
    );

    // 重复编码（同 type 下 code 重复）
    const dupRows = await this.safe<{ src: string; cnt: string }>(
      `SELECT 'customer' AS src, COUNT(*)::text AS cnt FROM (
         SELECT customer_no FROM sal_customers GROUP BY customer_no HAVING COUNT(*)>1
       ) x
       UNION ALL SELECT 'supplier', COUNT(*)::text FROM (
         SELECT supplier_code FROM prc2_suppliers GROUP BY supplier_code HAVING COUNT(*)>1
       ) x
       UNION ALL SELECT 'sku', COUNT(*)::text FROM (
         SELECT sku_code FROM product_skus GROUP BY sku_code HAVING COUNT(*)>1
       ) x`,
    );

    // 归档阻断历史（近 7 天事件）
    const blockedEvents = await this.safe<any>(
      `SELECT object_type, object_code, message, created_at
         FROM md_governance_events
         WHERE event_type='ARCHIVE_BLOCKED'
           AND resolved_at IS NULL
           AND created_at > NOW() - INTERVAL '7 days'
         ORDER BY created_at DESC LIMIT 20`,
    );

    return {
      pendingApprovals: pendingByType,
      missingContact: missingContactRows.map(r => ({ source: r.table, count: parseInt(r.cnt, 10) })),
      duplicateCodes: dupRows.map(r => ({ source: r.src, count: parseInt(r.cnt, 10) })),
      archiveBlocked: blockedEvents,
      asOf: new Date().toISOString(),
    };
  }
}
