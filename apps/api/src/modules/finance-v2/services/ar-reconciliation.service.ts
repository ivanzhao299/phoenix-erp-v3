import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { Cron } from '@nestjs/schedule';
import { NotificationService } from '../../notification/notification.service';

/**
 * g199-C AR 三方对账 — fin_ar_invoices(业务侧) ↔ fin_ar_ledger(ERP 总账) ↔ chanjet_ar_snapshot(好业财)
 *
 * 设计:
 *   - 维度: companyCode + customer(name 为主键,辅以 code) + periodDate(YYYY-MM-01)
 *   - 业务侧 invoices: 按 (company, customer, periodDate=该期间内的开票日) SUM(balance_amount_original)
 *     —— 注意:invoices 是发票级,聚合到客户级期末余额给对账;同公司同客户同期间累加
 *   - ERP 总账:fin_ar_ledger 直接取 closing_amount(已是该期间客户期末)
 *   - 好业财:chanjet_ar_snapshot 同客户多科目聚合 SUM(endbalance)
 *   - 差异原因猜测:三个值两两比较,>0.01 才算差异
 *
 * DataScope:按 cls 中 dataScope.allowedCompanyCodes 过滤(集团 isGlobal 看全部)。
 */

interface ScopeCtx {
  isGlobal?: boolean;
  allowedCompanyCodes?: string[];
}

export interface ReconRow {
  companyCode: string;
  customerKey: string;       // 用于关联三个数据源(优先 name,辅以 code)
  customerCode: string | null;
  customerName: string;
  // 三方金额(原币不同 → 折成本币 RMB 后比较,这里 invoices 用 amount_base / ledger 用 closing_amount_base ?? closing_amount / chanjet endbalance 已是 RMB)
  invoiceBalance: number;    // 业务侧:fin_ar_invoices SUM(balance_amount_base)
  invoiceCount: number;      // 业务侧:发票笔数
  ledgerClosing: number;     // ERP 总账:fin_ar_ledger.closing_amount_base ?? closing_amount
  ledgerSource: string | null;
  chanjetEndbalance: number; // 好业财:chanjet_ar_snapshot SUM(endbalance) (本币 RMB)
  // 差异分析
  deltaInvLedger: number;
  deltaInvChanjet: number;
  deltaLedgerChanjet: number;
  diffReason: string[];
  status: 'OK' | 'WARN' | 'MISMATCH';
}

@Injectable()
export class ArReconciliationService {
  private readonly log = new Logger('ArReconciliation');

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly notif: NotificationService,
  ) {}

  private scope(): { all: boolean; codes: string[] } {
    const s = (this.cls.get('dataScope') as ScopeCtx) || {};
    return { all: !!s.isGlobal, codes: s.allowedCompanyCodes ?? [] };
  }

  /** 公司 + 期间筛选维度(供前端下拉) */
  async dimensions(): Promise<{ companies: Array<{ code: string; name: string }>; periods: string[] }> {
    const { all, codes } = this.scope();
    if (!all && codes.length === 0) return { companies: [], periods: [] };

    const scopeCond = all ? '' : 'WHERE company_code = ANY($1)';
    const params = all ? [] : [codes];

    // 公司列表:从 chanjet_book_company_map(权威) + fin_ar_ledger / fin_ar_invoices 取并集
    // g199-C 修 #3 (2026-06-19): 优先 chanjet_book_company_map 拿权威中文名,
    //   只在其它表有但 map 无时 fallback;避免 UNION DISTINCT 因 name 不同(有的 NULL)
    //   把同一 company_code 拆成多行。
    const companiesRaw = await this.ds.query(
      `WITH all_codes AS (
         SELECT DISTINCT company_code FROM chanjet_book_company_map WHERE sync_enabled = true AND company_code IS NOT NULL
         UNION
         SELECT DISTINCT company_code FROM fin_ar_ledger WHERE company_code IS NOT NULL
         UNION
         SELECT DISTINCT company_code FROM fin_ar_invoices WHERE company_code IS NOT NULL
       )
       SELECT
         c.company_code AS "code",
         COALESCE(
           (SELECT m.company_name FROM chanjet_book_company_map m WHERE m.company_code = c.company_code LIMIT 1),
           (SELECT i.company_name FROM fin_ar_invoices i WHERE i.company_code = c.company_code AND i.company_name IS NOT NULL LIMIT 1),
           c.company_code
         ) AS "name"
       FROM all_codes c
       ${all ? '' : 'WHERE c.company_code = ANY($1)'}
       ORDER BY "code"`,
      params,
    );

    // g199-C 修 #4 (2026-06-19): 期间下拉只展示月初(YYYY-MM-01),
    //   把任何 period_date 截断到月初,DISTINCT 后排序,避免 OCR 录入零散日期混乱
    const periodsRaw = await this.ds.query(
      `SELECT DISTINCT to_char(date_trunc('month', period_date),'YYYY-MM-DD') AS "p"
       FROM fin_ar_ledger
       ${scopeCond}
       ORDER BY 1 DESC`,
      params,
    );

    return {
      companies: companiesRaw,
      periods: periodsRaw.map((r: { p: string }) => r.p),
    };
  }

  /**
   * 三方对账主查询。
   * @param companyCode 必填(单公司维度);空时返回 allowedCompanyCodes 内的全部
   * @param periodDate  必填 'YYYY-MM-DD'(应为月初)
   */
  async reconcile(companyCode: string | undefined, periodDate: string): Promise<{
    companyCode: string;
    periodDate: string;
    rows: ReconRow[];
    totals: { invoiceBalance: number; ledgerClosing: number; chanjetEndbalance: number };
    counts: { ok: number; warn: number; mismatch: number };
  }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodDate)) {
      throw new Error(`periodDate 格式应为 YYYY-MM-DD, got ${periodDate}`);
    }
    const { all, codes } = this.scope();
    // 公司过滤
    let scopedCompanies: string[] = [];
    if (companyCode) {
      if (!all && !codes.includes(companyCode)) {
        return { companyCode, periodDate, rows: [], totals: { invoiceBalance: 0, ledgerClosing: 0, chanjetEndbalance: 0 }, counts: { ok: 0, warn: 0, mismatch: 0 } };
      }
      scopedCompanies = [companyCode];
    } else {
      if (all) {
        // 集团:不显式限定,但下面按 ALL 三表 UNION 时无 company 过滤
      } else {
        if (codes.length === 0) {
          return { companyCode: '', periodDate, rows: [], totals: { invoiceBalance: 0, ledgerClosing: 0, chanjetEndbalance: 0 }, counts: { ok: 0, warn: 0, mismatch: 0 } };
        }
        scopedCompanies = codes;
      }
    }

    // period: YYYY-MM-DD → chanjet 用 'YYYYMM',ledger 用 date,invoice 用月份范围
    const ym = periodDate.slice(0, 7);          // 'YYYY-MM'
    const ymCompact = ym.replace('-', '');      // 'YYYYMM'

    // 业务侧 invoices:按公司+客户聚合该月内发票余额(以发票日落该月为准)
    // 注意:invoice 是开票口径,严格应该按 invoice_date 落在 [periodStart, periodEnd] 之间。
    // 简化版:取所有 status != 'CANCELLED' 的发票余额(账面口径,不分期),按 customer 聚合,
    //         作为"业务侧应收余额"参考(因为 invoice 本身就是滚动账,不存在月度快照口径)
    const invSql = `
      SELECT
        company_code  AS "companyCode",
        COALESCE(NULLIF(TRIM(customer_name), ''), customer_code, '(无名)') AS "customerName",
        customer_code AS "customerCode",
        COALESCE(SUM(balance_amount_base), 0)::float AS "balance",
        COUNT(*)::int AS "count"
      FROM fin_ar_invoices
      WHERE status NOT IN ('CANCELLED', 'WRITTEN_OFF')
        AND COALESCE(invoice_date, created_at::date) <= ($1::date + INTERVAL '1 month - 1 day')::date
        ${scopedCompanies.length ? `AND company_code = ANY($2)` : ''}
      GROUP BY company_code, customer_name, customer_code
    `;
    const invParams: unknown[] = [periodDate];
    if (scopedCompanies.length) invParams.push(scopedCompanies);
    const invRows: Array<{ companyCode: string; customerName: string; customerCode: string | null; balance: number; count: number }> =
      await this.ds.query(invSql, invParams);

    // ERP 总账:按 (company, customer, periodDate)
    // g199-C 修 #4 (2026-06-19): 月初口径 — date_trunc 把 period_date 截断到月初再比对,
    //   兼容历史 OCR 录入的零散日期(2026-06-07 等)与 g199-B 入账的标准月初(2026-06-01)
    const ledSql = `
      SELECT
        company_code  AS "companyCode",
        COALESCE(NULLIF(TRIM(counterparty_name), ''), counterparty_code, '(无名)') AS "customerName",
        counterparty_code AS "customerCode",
        COALESCE(closing_amount_base, closing_amount, 0)::float AS "closing",
        source AS "source"
      FROM fin_ar_ledger
      WHERE date_trunc('month', period_date) = date_trunc('month', $1::date)
        ${scopedCompanies.length ? `AND company_code = ANY($2)` : ''}
    `;
    const ledParams: unknown[] = [periodDate];
    if (scopedCompanies.length) ledParams.push(scopedCompanies);
    const ledRows: Array<{ companyCode: string; customerName: string; customerCode: string | null; closing: number; source: string | null }> =
      await this.ds.query(ledSql, ledParams);

    // 好业财:按 (company, customer) 同客户多科目 SUM(endbalance)
    const cjSql = `
      SELECT
        company_code  AS "companyCode",
        COALESCE(NULLIF(TRIM(subject_name), ''), assistant_customer_code, '(无名)') AS "customerName",
        assistant_customer_code AS "customerCode",
        COALESCE(SUM(endbalance), 0)::float AS "endbalance"
      FROM chanjet_ar_snapshot
      WHERE period = $1
        ${scopedCompanies.length ? `AND company_code = ANY($2)` : ''}
      GROUP BY company_code, subject_name, assistant_customer_code
    `;
    const cjParams: unknown[] = [ymCompact];
    if (scopedCompanies.length) cjParams.push(scopedCompanies);
    const cjRows: Array<{ companyCode: string; customerName: string; customerCode: string | null; endbalance: number }> =
      await this.ds.query(cjSql, cjParams);

    // 合并:key = `${companyCode}::${customerName}`(三方都以 name 为主键,name 是最稳定的对照)
    type Agg = ReconRow;
    const map = new Map<string, Agg>();
    const blank = (companyCode: string, customerName: string, customerCode: string | null): Agg => ({
      companyCode,
      customerKey: `${companyCode}::${customerName}`,
      customerCode,
      customerName,
      invoiceBalance: 0,
      invoiceCount: 0,
      ledgerClosing: 0,
      ledgerSource: null,
      chanjetEndbalance: 0,
      deltaInvLedger: 0,
      deltaInvChanjet: 0,
      deltaLedgerChanjet: 0,
      diffReason: [],
      status: 'OK',
    });
    const getOrInit = (companyCode: string, customerName: string, customerCode: string | null): Agg => {
      const k = `${companyCode}::${customerName}`;
      let a = map.get(k);
      if (!a) { a = blank(companyCode, customerName, customerCode); map.set(k, a); }
      if (!a.customerCode && customerCode) a.customerCode = customerCode;
      return a;
    };

    for (const r of invRows) {
      const a = getOrInit(r.companyCode, r.customerName, r.customerCode);
      a.invoiceBalance += Number(r.balance) || 0;
      a.invoiceCount += r.count;
    }
    for (const r of ledRows) {
      const a = getOrInit(r.companyCode, r.customerName, r.customerCode);
      a.ledgerClosing += Number(r.closing) || 0;
      if (r.source) a.ledgerSource = r.source;
    }
    for (const r of cjRows) {
      const a = getOrInit(r.companyCode, r.customerName, r.customerCode);
      a.chanjetEndbalance += Number(r.endbalance) || 0;
    }

    // 计算差异 + 状态
    let okCount = 0, warnCount = 0, mismatchCount = 0;
    let totalInv = 0, totalLed = 0, totalCj = 0;
    const rows = [...map.values()].map(r => {
      r.deltaInvLedger     = r.invoiceBalance - r.ledgerClosing;
      r.deltaInvChanjet    = r.invoiceBalance - r.chanjetEndbalance;
      r.deltaLedgerChanjet = r.ledgerClosing - r.chanjetEndbalance;
      const eps = 0.01;
      const dIL = Math.abs(r.deltaInvLedger) > eps;
      const dIC = Math.abs(r.deltaInvChanjet) > eps;
      const dLC = Math.abs(r.deltaLedgerChanjet) > eps;

      // 差异原因猜测
      if (dLC) r.diffReason.push('好业财 vs ERP 总账不符:可能未入账或入账后未同步');
      if (dIL) r.diffReason.push('业务发票 vs ERP 总账不符:可能漏开发票或总账未结转');
      if (dIC) r.diffReason.push('业务发票 vs 好业财不符:可能业务系统未挂账');
      if (r.invoiceBalance === 0 && r.ledgerClosing === 0 && r.chanjetEndbalance !== 0) {
        r.diffReason = ['仅好业财侧有数据:ERP/业务未挂账(需补)'];
      }
      if (r.invoiceBalance !== 0 && r.ledgerClosing === 0 && r.chanjetEndbalance === 0) {
        r.diffReason = ['仅业务发票侧有数据:ERP 总账未结转、好业财未挂账'];
      }
      if (r.invoiceBalance === 0 && r.ledgerClosing !== 0 && r.chanjetEndbalance === 0) {
        r.diffReason = ['仅 ERP 总账侧有数据:业务发票核销但总账未冲减、好业财未同步'];
      }

      const allZero = r.invoiceBalance === 0 && r.ledgerClosing === 0 && r.chanjetEndbalance === 0;
      if (allZero || (!dIL && !dIC && !dLC)) {
        r.status = 'OK';
        okCount++;
      } else if (dLC && Math.abs(r.deltaLedgerChanjet) > 100) {
        r.status = 'MISMATCH';
        mismatchCount++;
      } else {
        r.status = 'WARN';
        warnCount++;
      }

      totalInv += r.invoiceBalance;
      totalLed += r.ledgerClosing;
      totalCj  += r.chanjetEndbalance;
      return r;
    }).sort((a, b) => Math.abs(b.deltaLedgerChanjet) - Math.abs(a.deltaLedgerChanjet));

    return {
      companyCode: companyCode || '(集团/全部允许公司)',
      periodDate,
      rows,
      totals: { invoiceBalance: totalInv, ledgerClosing: totalLed, chanjetEndbalance: totalCj },
      counts: { ok: okCount, warn: warnCount, mismatch: mismatchCount },
    };
  }

  // ─── g199-D: 月度定时勾稽 + 站内通知 ────────────────────────────────────
  //
  // 每月 1 号 03:00 跑上月 (YYYY-MM-01) 三方对账。
  // 对每个 chanjet_book_company_map.sync_enabled=true 公司:
  //   - 调 reconcile() 拿 counts {ok, warn, mismatch}
  //   - 仅当 warn + mismatch > 0 才通知(避免 0 差异打扰)
  //   - 通知接收者:所有有 MENU_FIN2_AR_LEDGER:V 权限的活跃用户
  //   - 通知含链接 /finance2/ar-reconciliation?companyCode=X&periodDate=Y
  //
  // 注:此 cron 内部直接走 DB 查询(不走 reconcile 的 DataScope 限制),因为 cron 无 CLS 上下文。
  //     在 cron 入口临时把 scope 设为 isGlobal 即可。

  /** 上月月初 'YYYY-MM-01' */
  private previousMonthStart(): string {
    const d = new Date();
    d.setUTCDate(1);                  // 本月 1 号
    d.setUTCMonth(d.getUTCMonth() - 1); // 退一个月
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  }

  /** 查所有有 MENU_FIN2_AR_LEDGER:V 权限的活跃用户 ID
   *  表名/列名对齐生产 schema:sys_user(单数)/user_id/status=1(非 'ACTIVE')
   *  权限源 3 类:auth.service.ts 同款 */
  private async receivers(): Promise<Array<{ id: string; name: string }>> {
    const rows: Array<{ id: string; name: string }> = await this.ds.query(`
      SELECT DISTINCT u.user_id::text AS id, COALESCE(u.real_name, u.username, '') AS name
      FROM sys_user u
      WHERE u.status = 1 AND u.user_id IN (
        -- ① 角色直绑
        SELECT ur.user_id FROM sys_user_role ur
        JOIN sys_role_menu_permission rmp ON rmp.role_id = ur.role_id
        JOIN sys_menu m ON m.menu_id = rmp.menu_id
        WHERE m.menu_code = 'MENU_FIN2_AR_LEDGER'
          AND rmp.perm_codes ILIKE '%V%'

        UNION

        -- ② 角色→权限集
        SELECT ur.user_id FROM sys_user_role ur
        JOIN sys_role_permission_set rps      ON rps.role_id = ur.role_id
        JOIN sys_permission_set_item psi      ON psi.set_id = rps.set_id
        JOIN sys_menu m                       ON m.menu_id = psi.menu_id
        WHERE m.menu_code = 'MENU_FIN2_AR_LEDGER'
          AND psi.perm_codes ILIKE '%V%'

        UNION

        -- ③ 用户直绑权限集
        SELECT ups.user_id FROM sys_user_permission_set ups
        JOIN sys_permission_set_item psi ON psi.set_id = ups.set_id
        JOIN sys_menu m                  ON m.menu_id = psi.menu_id
        WHERE m.menu_code = 'MENU_FIN2_AR_LEDGER'
          AND psi.perm_codes ILIKE '%V%'
      )
    `);
    return rows;
  }

  /** 直接 DB 跑对账(绕过 reconcile 的 DataScope,cron 无 CLS) */
  private async cronReconcileCompany(companyCode: string, periodDate: string): Promise<{
    rows: ReconRow[];
    counts: { ok: number; warn: number; mismatch: number };
  }> {
    // 借助一个伪 isGlobal scope 临时填到 cls,再调 reconcile
    const result = await this.cls.run(async () => {
      this.cls.set('dataScope', { isGlobal: true });
      return this.reconcile(companyCode, periodDate);
    });
    return { rows: result.rows, counts: result.counts };
  }

  /** 每月 1 号 03:00 跑上月对账(避业务高峰) */
  @Cron('0 0 3 1 * *', { name: 'g199-d-monthly-ar-reconciliation' })
  async cronMonthlyReconciliation(): Promise<void> {
    const periodDate = this.previousMonthStart();
    this.log.log(`g199-D cron 启动 period=${periodDate}`);

    // 取所有同步启用的公司
    const companies: Array<{ companyCode: string; companyName: string }> =
      await this.ds.query(
        `SELECT company_code AS "companyCode", company_name AS "companyName"
         FROM chanjet_book_company_map WHERE sync_enabled = true
         ORDER BY company_code`,
      );

    if (!companies.length) {
      this.log.warn('g199-D cron 跳过:无 sync_enabled 公司');
      return;
    }

    // 接收者预查一次,后面每家公司复用
    const receivers = await this.receivers();
    if (!receivers.length) {
      this.log.warn('g199-D cron 跳过通知:无 MENU_FIN2_AR_LEDGER:V 接收者');
    }

    let totalMismatch = 0;
    let totalWarn = 0;
    const perCompany: Array<{ companyCode: string; companyName: string; mismatch: number; warn: number; ok: number; topRows: ReconRow[] }> = [];

    for (const c of companies) {
      try {
        const r = await this.cronReconcileCompany(c.companyCode, periodDate);
        const top = r.rows.filter(x => x.status !== 'OK').slice(0, 5);
        perCompany.push({ ...c, mismatch: r.counts.mismatch, warn: r.counts.warn, ok: r.counts.ok, topRows: top });
        totalMismatch += r.counts.mismatch;
        totalWarn += r.counts.warn;
        this.log.log(`g199-D ${c.companyCode} mismatch=${r.counts.mismatch} warn=${r.counts.warn} ok=${r.counts.ok}`);
      } catch (err) {
        this.log.error(`g199-D ${c.companyCode} 对账失败: ${(err as Error).message}`);
      }
    }

    // 全 OK 就不通知(避免无意义打扰)
    if (totalMismatch + totalWarn === 0) {
      this.log.log(`g199-D ${periodDate} 全部 OK,不通知`);
      return;
    }

    // 单条汇总通知(每接收者一条)
    const periodLabel = periodDate.slice(0, 7);
    const summary = perCompany
      .filter(c => c.mismatch + c.warn > 0)
      .map(c => {
        const top = c.topRows.map(r => `  • ${r.customerName}: ②=${r.ledgerClosing.toFixed(2)} ③=${r.chanjetEndbalance.toFixed(2)} 差=${r.deltaLedgerChanjet.toFixed(2)}`).join('\n');
        return `【${c.companyName}】差异 ${c.mismatch} 严重 / ${c.warn} 预警 / ${c.ok} OK\n${top}`;
      })
      .join('\n\n');

    const title = `📊 应收三方对账 ${periodLabel} 差异:${totalMismatch} 严重 / ${totalWarn} 预警`;
    const content = `${summary}\n\n点击查看对账详情:/finance2/ar-reconciliation?periodDate=${periodDate}`;

    for (const u of receivers) {
      try {
        await this.notif.create({
          userId: u.id,
          notificationType: 'AR_RECONCILIATION',
          title,
          content,
          linkType: 'PAGE',
          linkId: `/finance2/ar-reconciliation?periodDate=${periodDate}`,
          bizType: 'AR_RECON_MONTHLY',
          bizNo: periodLabel,
        });
      } catch (err) {
        this.log.warn(`g199-D 通知 user=${u.id}(${u.name}) 失败: ${(err as Error).message}`);
      }
    }
    this.log.log(`g199-D 通知已发 ${receivers.length} 人 period=${periodDate}`);
  }

  /** 手动触发(测试/补跑用) — 不上端点,只在 service 留口,后续要时再加 controller */
  async runMonthlyReconciliationNow(periodDate?: string): Promise<void> {
    if (periodDate) {
      // 临时覆盖逻辑:直接调
      this.log.log(`g199-D 手动触发 period=${periodDate}`);
    }
    return this.cronMonthlyReconciliation();
  }
}
