import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeHelper } from '../../org/helpers/data-scope.helper';

/**
 * ApAdapterService — Finance V2 Phase 0 过渡层
 *
 * 从 prc2_ap_ledger（Procurement V2 的真实 AP 台账）读取数据，
 * 供 Finance V2 页面只读展示。
 *
 * 这是一个 Adapter（适配器），不修改任何采购数据，仅读取。
 * Phase 1 正式建立 fin_ap_invoices 后，本 Service 将逐步替换。
 *
 * DataScope：严格按当前用户的 company/project 权限过滤。
 */
@Injectable()
export class ApAdapterService {
  private readonly logger = new Logger(ApAdapterService.name);

  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly scopeHelper: DataScopeHelper,
  ) {}

  private currentUser() {
    const u = this.cls.get('user') as any;
    return {
      userId:   String(u?.userId ?? u?.id ?? '0'),
      roles:    (u?.roles ?? (u?.role ? [u.role] : [])) as string[],
      companyCodes: (u?.companyCodes ?? []) as string[],
      projectCodes: (u?.projectCodes ?? []) as string[],
      scopeAll: !!(u?.scopeAll),
    };
  }

  /**
   * GET /api/v2/finance/ap/legacy-source
   *
   * 从 prc2_ap_ledger 读取 AP 数据，支持：
   * - DataScope 公司/项目过滤
   * - status / supplier / 关键字 筛选
   * - 分页
   */
  async listLegacyApSource(query: {
    status?:       string;
    companyCode?:  string;
    supplierCode?: string;
    keyword?:      string;
    page?:         number;
    pageSize?:     number;
  }) {
    const page     = Math.max(1, query.page     ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const offset   = (page - 1) * pageSize;

    const user = this.currentUser();

    // DataScope WHERE 子句
    let scopeClause = '';
    const scopeParams: any[] = [];
    if (!user.scopeAll && user.companyCodes.length > 0) {
      scopeClause = ` AND a.company_code = ANY($${scopeParams.length + 1}::text[])`;
      scopeParams.push(user.companyCodes);
    }

    // 业务过滤参数
    const filters: string[] = [];
    const params: any[] = [...scopeParams];

    if (query.status) {
      filters.push(`a.status = $${params.length + 1}`);
      params.push(query.status);
    }
    if (query.companyCode) {
      filters.push(`a.company_code = $${params.length + 1}`);
      params.push(query.companyCode);
    }
    if (query.supplierCode) {
      filters.push(`a.supplier_code = $${params.length + 1}`);
      params.push(query.supplierCode);
    }
    if (query.keyword) {
      filters.push(`(a.ap_no ILIKE $${params.length + 1} OR a.supplier_name ILIKE $${params.length + 1} OR a.po_no ILIKE $${params.length + 1})`);
      params.push(`%${query.keyword}%`);
    }

    const whereExtra = filters.length > 0 ? ' AND ' + filters.join(' AND ') : '';
    const where      = `WHERE 1=1${scopeClause}${whereExtra}`;

    const sql = `
      SELECT
        a.id,
        a.ap_no,
        a.po_id,
        a.po_no,
        a.company_code,
        a.company_name,
        a.project_code,
        a.project_name,
        a.supplier_code,
        a.supplier_name,
        a.currency_code,
        a.amount_original,
        a.paid_amount_original,
        a.balance_amount_original,
        a.exchange_rate,
        a.amount_base,
        a.status,
        a.due_date,
        a.remark,
        a.created_at
      FROM prc2_ap_ledger a
      ${where}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(pageSize, offset);

    const countSql = `
      SELECT COUNT(*)::int AS cnt
      FROM prc2_ap_ledger a
      ${where}
    `;
    const countParams = params.slice(0, params.length - 2);

    const [rows, countRows] = await Promise.all([
      this.ds.query(sql, params),
      this.ds.query(countSql, countParams),
    ]);

    this.logger.debug(`[ApAdapter] listLegacyApSource page=${page} total=${countRows[0]?.cnt ?? 0}`);

    return {
      items:    rows,
      total:    Number(countRows[0]?.cnt ?? 0),
      page,
      pageSize,
      source:   'prc2_ap_ledger',          // 明确标注数据源
      note:     'Finance V2 Phase 0 过渡层，正式 fin_ap_invoices 将在 Phase 1 建立',
    };
  }

  /**
   * AP 汇总统计（用于 Finance V2 Dashboard）
   */
  async getApSummary(companyCodes?: string[]) {
    const user = this.currentUser();
    const effectiveCodes = companyCodes ?? (user.scopeAll ? [] : user.companyCodes);

    let scopeClause = '';
    const params: any[] = [];
    if (!user.scopeAll && effectiveCodes.length > 0) {
      scopeClause = `WHERE company_code = ANY($1::text[])`;
      params.push(effectiveCodes);
    }

    const rows = await this.ds.query(`
      SELECT
        COUNT(*)                                                    AS total_count,
        COUNT(*) FILTER (WHERE status = 'OPEN')                    AS open_count,
        COUNT(*) FILTER (WHERE status = 'PARTIALLY_PAID')          AS partial_count,
        COUNT(*) FILTER (WHERE status = 'PAID')                    AS paid_count,
        SUM(amount_original)                                       AS total_amount,
        SUM(balance_amount_original)                               AS total_balance,
        SUM(balance_amount_original) FILTER (WHERE due_date < CURRENT_DATE AND status != 'PAID') AS overdue_balance
      FROM prc2_ap_ledger
      ${scopeClause}
    `, params);

    return {
      ...rows[0],
      source: 'prc2_ap_ledger',
      asOf:   new Date().toISOString(),
    };
  }
}
