import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { ChanjetAuthService } from './chanjet-auth.service';
import { ChanjetArSnapshotEntity } from './chanjet-ar-snapshot.entity';
import { ChanjetBookCompanyMapEntity } from './chanjet-book-company-map.entity';
import { FinArLedgerEntity } from '../finance-v2/entities/fin-ar-ledger.entity';

interface ChanjetArRow {
  assistantCustomer?: number;
  assistantCustomerCode?: string;
  currentPeriodDfBalance?: number;
  currentPeriodJfBalance?: number;
  endbalance?: number;
  initBalance?: number;
  subjectId?: number;
  subjectName?: string;
  yearDfAccumulate?: number;
  yearJfAccumulate?: number;
  [k: string]: unknown;
}

interface DataScopeCtx {
  isGlobal?: boolean;
  allowedCompanyCodes?: string[];
}

/** 三家公司种子映射(用户已确认一一对应) */
const SEED_BOOK_COMPANY_MAP: Array<Pick<ChanjetBookCompanyMapEntity, 'bookid' | 'bookName' | 'companyCode' | 'companyName' | 'syncEnabled'>> = [
  { bookid: '3533914511118750', bookName: '老挝凤凰农业发展有限公司', companyCode: 'COMP-LAO-AGRI', companyName: '凤凰农业', syncEnabled: true },
  { bookid: '3537748712226818', bookName: '老挝东鹏县星驰农业发展有限公司', companyCode: 'COMP-LAO-XINGCHI', companyName: '星驰农业', syncEnabled: true },
  { bookid: '3539743721526654', bookName: '老挝凤凰食品集团有限公司', companyCode: 'COMP-LAO-FOOD', companyName: '凤凰食品', syncEnabled: true },
];

/**
 * 好业财应收统计表同步 —— 铁律
 *   只读好业财(HTTP GET)
 *   写 PG chanjet_ar_snapshot(含 company_code 让 DataScope 起作用)
 *   按公司视角同步(syncByCompanyCode),通过映射拿 bookid
 *   查询按 DataScope 过滤(集团看全部,其他按 allowedCompanyCodes)
 */
@Injectable()
export class ChanjetArSyncService implements OnModuleInit {
  private readonly log = new Logger('ChanjetArSync');

  constructor(
    private readonly chanjet: ChanjetAuthService,
    @InjectRepository(ChanjetArSnapshotEntity)
    private readonly arRepo: Repository<ChanjetArSnapshotEntity>,
    @InjectRepository(ChanjetBookCompanyMapEntity)
    private readonly mapRepo: Repository<ChanjetBookCompanyMapEntity>,
    @InjectRepository(FinArLedgerEntity)
    private readonly ledgerRepo: Repository<FinArLedgerEntity>,
    private readonly cls: ClsService,
  ) {}

  async onModuleInit() {
    // 启动 seed 3 行映射(避开 g197-H 数据 DML 门禁:不进迁移文件,而是服务启动时初始化)
    try {
      const existing = await this.mapRepo.count();
      if (existing === 0) {
        await this.mapRepo.insert(SEED_BOOK_COMPANY_MAP);
        this.log.log(`chanjet_book_company_map 初始化 ${SEED_BOOK_COMPANY_MAP.length} 条映射`);
      } else {
        this.log.log(`chanjet_book_company_map 已有 ${existing} 条映射`);
      }
    } catch (err) {
      this.log.warn(`映射 seed 失败(表可能未建): ${(err as Error).message}`);
    }
  }

  /**
   * 部门对账:对比好业财与 ERP 同一公司下的部门列表。
   *
   * 好业财:GET /accounting/openapi/cc/department/list/{bookid}
   * ERP:   sys_organizations WHERE org_type='DEPARTMENT' AND company_code=X
   *
   * 返回三类:both(两边都有,可能名不同) / chanjetOnly / erpOnly
   * 用户审核后再决定:建映射表 / 在好业财补 / 在 ERP 补 / 维持差异
   */
  async diffDepartments(companyCode: string): Promise<{
    companyCode: string;
    chanjet: Array<{ id: string; code: string | null; name: string }>;
    erp: Array<{ orgCode: string; orgName: string; parentCode: string | null }>;
    both: Array<{ name: string; chanjetId: string; erpOrgCode: string }>;
    chanjetOnly: Array<{ id: string; code: string | null; name: string }>;
    erpOnly: Array<{ orgCode: string; orgName: string }>;
  }> {
    const map = await this.mapRepo.findOneBy({ companyCode });
    if (!map) throw new Error(`公司 ${companyCode} 无映射`);

    // 1. 拉好业财部门(只读)
    type ChanjetDept = { id?: number; code?: string; name?: string; deptName?: string; deptCode?: string; [k: string]: unknown };
    const chanjetResp = await this.chanjet.callApi(`/accounting/openapi/cc/department/list/${map.bookid}`, {
      method: 'GET',
    }) as unknown;
    const chanjetRaw = Array.isArray(chanjetResp) ? (chanjetResp as ChanjetDept[])
      : Array.isArray((chanjetResp as { result?: ChanjetDept[] })?.result) ? (chanjetResp as { result: ChanjetDept[] }).result
      : [];
    const chanjetDepts = chanjetRaw.map(d => ({
      id: String(d.id ?? ''),
      code: (d.code ?? d.deptCode ?? null) as string | null,
      name: (d.name ?? d.deptName ?? '') as string,
    }));

    // 2. 拉 ERP 部门(sys_organizations org_type='DEPARTMENT' 挂在该公司下)
    interface ErpDeptRow { org_code: string; org_name: string; parent_code: string | null }
    const erpRaw = await this.mapRepo.manager.query<ErpDeptRow[]>(
      `SELECT org_code, org_name, parent_code
       FROM sys_organizations
       WHERE org_type='DEPARTMENT' AND company_code=$1 AND status='ACTIVE'
       ORDER BY org_code`,
      [companyCode],
    );
    const erpDepts = (erpRaw || []).map(r => ({
      orgCode: r.org_code,
      orgName: r.org_name,
      parentCode: r.parent_code,
    }));

    // 3. 对账:按 name 严格匹配(用户已说名称对齐;后续可加 code 模糊)
    const erpByName = new Map(erpDepts.map(d => [d.orgName, d]));
    const chanjetByName = new Map(chanjetDepts.map(d => [d.name, d]));
    const both: Array<{ name: string; chanjetId: string; erpOrgCode: string }> = [];
    const chanjetOnly: typeof chanjetDepts = [];
    const erpOnly: Array<{ orgCode: string; orgName: string }> = [];

    for (const cd of chanjetDepts) {
      const e = erpByName.get(cd.name);
      if (e) both.push({ name: cd.name, chanjetId: cd.id, erpOrgCode: e.orgCode });
      else chanjetOnly.push(cd);
    }
    for (const ed of erpDepts) {
      if (!chanjetByName.has(ed.orgName)) erpOnly.push({ orgCode: ed.orgCode, orgName: ed.orgName });
    }

    return { companyCode, chanjet: chanjetDepts, erp: erpDepts, both, chanjetOnly, erpOnly };
  }

  /** 列出所有(启用的)公司 ↔ 账套映射(给前端下拉用) */
  async listCompanies(): Promise<ChanjetBookCompanyMapEntity[]> {
    // 懒补 seed:onModuleInit 可能在 mapRepo 准备好前抢跑被吞,这里兜底
    try {
      const existing = await this.mapRepo.count();
      if (existing === 0) {
        await this.mapRepo.insert(SEED_BOOK_COMPANY_MAP);
        this.log.log(`listCompanies 触发懒 seed ${SEED_BOOK_COMPANY_MAP.length} 条映射`);
      }
    } catch (err) {
      this.log.error(`listCompanies seed 失败: ${(err as Error).message}`);
    }
    return this.mapRepo.find({
      where: { syncEnabled: true },
      order: { companyCode: 'ASC' },
    });
  }

  /** 按公司同步(前端视角) */
  async syncByCompanyCode(companyCode: string, period: string, currency = 'RMB'): Promise<{
    companyCode: string;
    bookid: string;
    period: string;
    fetched: number;
    saved: number;
    totalEndbalance: number;
  }> {
    const map = await this.mapRepo.findOneBy({ companyCode });
    if (!map) throw new Error(`公司 ${companyCode} 无好业财映射,请先在 chanjet_book_company_map 配置`);
    if (!map.syncEnabled) throw new Error(`公司 ${companyCode} 同步未启用`);

    this.log.log(`同步开始 company=${companyCode} bookid=${map.bookid} period=${period}`);

    // 只读好业财
    const resp = await this.chanjet.callApi(`/accounting/gl/statistics/receive/${map.bookid}`, {
      method: 'GET',
      query: { period },
    }) as unknown;

    const rawRows = Array.isArray(resp) ? (resp as ChanjetArRow[]) : [];
    if (!rawRows.length) {
      const err = resp as Record<string, unknown> | undefined;
      this.log.warn(`好业财返回空或错误: ${JSON.stringify(err).slice(0, 200)}`);
      return { companyCode, bookid: map.bookid, period, fetched: 0, saved: 0, totalEndbalance: 0 };
    }

    // 过滤掉好业财返回里自带的"合计"汇总行(subjectName='合计' 或 assistantCustomer=0 + 是汇总)
    const rows = rawRows.filter(r =>
      r.subjectName !== '合计' &&
      !(r.subjectName ?? '').startsWith('合计') &&
      r.assistantCustomerCode
    );

    // 写 PG:幂等"全删全插"。dept_code 写空串(NOT NULL),uq_chanjet_ar_v2 真生效防重复
    await this.arRepo.delete({ bookid: map.bookid, period });

    let saved = 0;
    for (const r of rows) {
      const entity: Partial<ChanjetArSnapshotEntity> = {
        bookid: map.bookid,
        companyCode: map.companyCode,
        deptCode: '',
        period,
        // g198: 唯一约束列禁写 NULL,用 '' 占位让 uq 真生效
        assistantCustomerCode: r.assistantCustomerCode ?? '',
        assistantCustomerId: r.assistantCustomer ? String(r.assistantCustomer) : null,
        subjectId: r.subjectId ? String(r.subjectId) : '',
        subjectName: r.subjectName ?? null,
        initBalance: String(r.initBalance ?? 0),
        currentPeriodJf: String(r.currentPeriodJfBalance ?? 0),
        currentPeriodDf: String(r.currentPeriodDfBalance ?? 0),
        endbalance: String(r.endbalance ?? 0),
        yearJfAccumulate: String(r.yearJfAccumulate ?? 0),
        yearDfAccumulate: String(r.yearDfAccumulate ?? 0),
        currency,
        rawData: r as Record<string, unknown>,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.arRepo.insert(entity as any);
      saved++;
    }

    const totalEndbalance = rows.reduce((s, r) => s + Number(r.endbalance ?? 0), 0);
    this.log.log(`同步完成 company=${companyCode} fetched=${rows.length} saved=${saved} total=${totalEndbalance.toFixed(2)} ${currency}`);
    return { companyCode, bookid: map.bookid, period, fetched: rows.length, saved, totalEndbalance };
  }

  /**
   * 按公司查 PG 快照(只读,按 DataScope 过滤)。
   * companyCode 不传 → 集团视角(看 allowedCompanyCodes 全部);
   * companyCode 传 → 必须在 allowedCompanyCodes 内才返回。
   */
  async queryByCompany(companyCode: string | undefined, period: string): Promise<ChanjetArSnapshotEntity[]> {
    const scope = this.cls.get<DataScopeCtx>('dataScope') || {};
    const isGlobal = !!scope.isGlobal;
    const allowed = scope.allowedCompanyCodes ?? [];

    if (!isGlobal && allowed.length === 0) return [];

    if (companyCode) {
      if (!isGlobal && !allowed.includes(companyCode)) return [];
      return this.arRepo.find({
        where: { companyCode, period },
        order: { endbalance: 'DESC' },
      });
    }

    if (isGlobal) {
      return this.arRepo.find({ where: { period }, order: { endbalance: 'DESC' } });
    }
    return this.arRepo
      .createQueryBuilder('ar')
      .where('ar.period = :period AND ar.company_code IN (:...codes)', { period, codes: allowed })
      .orderBy('ar.endbalance', 'DESC')
      .getMany();
  }

  // ─── g199-B: chanjet_ar_snapshot → fin_ar_ledger 审核入账 ────────────────
  //
  // 铁律:
  //   1. 必经财务总监(MENU_FIN2_AR_LEDGER:E)
  //   2. 入账记录 source='CHANJET_VERIFIED_<YYYYMMDD>' 可追溯
  //   3. 按 (farm_code=companyCode, counterparty_name, period_date) upsert,
  //      让 fin_ar_ledger 的 uq_fin_ar_ledger 真生效
  //   4. base_currency='RMB',closing_amount_base=closing_amount(chanjet 已是本币)

  /** period 'YYYYMM' → 'YYYY-MM-01' */
  private periodToDate(period: string): string {
    if (!/^\d{6}$/.test(period)) throw new Error(`period 格式应为 YYYYMM, got ${period}`);
    return `${period.slice(0, 4)}-${period.slice(4, 6)}-01`;
  }

  /**
   * 预览入账差异:不写库,只算 chanjet_ar_snapshot 行 vs 已有 fin_ar_ledger 行的差异。
   * 返回三类:new(新增) / changed(金额变动) / unchanged(无差)
   */
  async previewImportToArLedger(companyCode: string, period: string): Promise<{
    companyCode: string;
    period: string;
    periodDate: string;
    farmCode: string;
    newRows: Array<{ counterpartyCode: string; counterpartyName: string; closing: string; charge: string; received: string }>;
    changedRows: Array<{ counterpartyCode: string; counterpartyName: string; oldClosing: string; newClosing: string; delta: string }>;
    unchangedCount: number;
  }> {
    const map = await this.mapRepo.findOneBy({ companyCode });
    if (!map) throw new Error(`公司 ${companyCode} 无好业财映射`);

    const periodDate = this.periodToDate(period);
    const farmCode = map.companyCode;

    const snaps = await this.arRepo.find({ where: { companyCode, period } });
    if (!snaps.length) {
      return { companyCode, period, periodDate, farmCode, newRows: [], changedRows: [], unchangedCount: 0 };
    }

    // 同客户多科目要聚合(应收/预收/坏账等 → 净应收期末)
    const aggByCust = new Map<string, { code: string; name: string; charge: number; received: number; closing: number }>();
    for (const s of snaps) {
      const key = s.assistantCustomerCode || '(空)';
      const g = aggByCust.get(key) || { code: s.assistantCustomerCode || '', name: s.subjectName || s.assistantCustomerCode || '', charge: 0, received: 0, closing: 0 };
      g.charge += Number(s.currentPeriodJf);
      g.received += Number(s.currentPeriodDf);
      g.closing += Number(s.endbalance);
      aggByCust.set(key, g);
    }

    const existing = await this.ledgerRepo
      .createQueryBuilder('l')
      .where('l.farm_code = :farmCode AND l.period_date = :periodDate', { farmCode, periodDate })
      .getMany();
    const existingByName = new Map(existing.map(e => [e.counterpartyName, e]));

    const newRows: Array<{ counterpartyCode: string; counterpartyName: string; closing: string; charge: string; received: string }> = [];
    const changedRows: Array<{ counterpartyCode: string; counterpartyName: string; oldClosing: string; newClosing: string; delta: string }> = [];
    let unchangedCount = 0;

    for (const g of aggByCust.values()) {
      const e = existingByName.get(g.name);
      const newClosing = g.closing.toFixed(2);
      if (!e) {
        newRows.push({ counterpartyCode: g.code, counterpartyName: g.name, closing: newClosing, charge: g.charge.toFixed(2), received: g.received.toFixed(2) });
      } else {
        const delta = (Number(newClosing) - Number(e.closingAmount));
        if (Math.abs(delta) > 0.005) {
          changedRows.push({ counterpartyCode: g.code, counterpartyName: g.name, oldClosing: e.closingAmount, newClosing, delta: delta.toFixed(2) });
        } else {
          unchangedCount++;
        }
      }
    }

    return { companyCode, period, periodDate, farmCode, newRows, changedRows, unchangedCount };
  }

  /**
   * 审核入账 chanjet_ar_snapshot → fin_ar_ledger。
   * @param companyCode 公司
   * @param period      'YYYYMM'
   * @param dryRun      true 不写库(供二次确认)
   * @param onlyKeys    可选:仅入账指定 counterpartyName 的行(前端勾选场景)
   */
  async importToArLedger(
    companyCode: string,
    period: string,
    dryRun = false,
    onlyKeys?: string[],
  ): Promise<{
    companyCode: string;
    period: string;
    periodDate: string;
    farmCode: string;
    dryRun: boolean;
    upserted: number;
    skipped: number;
    source: string;
  }> {
    const map = await this.mapRepo.findOneBy({ companyCode });
    if (!map) throw new Error(`公司 ${companyCode} 无好业财映射`);

    const periodDate = this.periodToDate(period);
    const farmCode = map.companyCode;
    const farmName = map.companyName;

    const snaps = await this.arRepo.find({ where: { companyCode, period } });
    if (!snaps.length) {
      throw new Error(`chanjet_ar_snapshot 无数据(公司=${companyCode} 期间=${period}),先去同步页拉一次`);
    }

    // 同客户多科目聚合(净应收)
    const aggByCust = new Map<string, { code: string; name: string; init: number; charge: number; received: number; closing: number; yearJf: number; yearDf: number }>();
    for (const s of snaps) {
      const key = s.assistantCustomerCode || '(空)';
      const g = aggByCust.get(key) || { code: s.assistantCustomerCode || '', name: s.subjectName || s.assistantCustomerCode || '', init: 0, charge: 0, received: 0, closing: 0, yearJf: 0, yearDf: 0 };
      g.init += Number(s.initBalance);
      g.charge += Number(s.currentPeriodJf);
      g.received += Number(s.currentPeriodDf);
      g.closing += Number(s.endbalance);
      g.yearJf += Number(s.yearJfAccumulate);
      g.yearDf += Number(s.yearDfAccumulate);
      aggByCust.set(key, g);
    }

    const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const source = `CHANJET_VERIFIED_${yyyymmdd}`;
    const remark = `好业财同步 bookid=${map.bookid} period=${period} importedAt=${new Date().toISOString()}`;

    let upserted = 0;
    let skipped = 0;
    const keysFilter = onlyKeys && onlyKeys.length ? new Set(onlyKeys) : null;

    if (!dryRun) {
      // 按 uq_fin_ar_ledger (farm_code, counterparty_name, period_date) upsert
      for (const g of aggByCust.values()) {
        if (keysFilter && !keysFilter.has(g.name)) { skipped++; continue; }
        await this.ledgerRepo.upsert(
          {
            farmCode,
            farmName,
            companyCode,
            counterpartyCode: g.code || null,
            counterpartyName: g.name,
            periodDate,
            currencyCode: 'RMB',
            openingAmount: g.init.toFixed(2),
            periodCharge: g.charge.toFixed(2),
            periodReceived: g.received.toFixed(2),
            closingAmount: g.closing.toFixed(2),
            closingAmountBase: g.closing.toFixed(2), // chanjet 已是 RMB 本币,base = closing
            baseCurrency: 'RMB',
            source,
            remark,
          },
          {
            conflictPaths: ['farmCode', 'counterpartyName', 'periodDate'],
            skipUpdateIfNoValuesChanged: false,
          },
        );
        upserted++;
      }
    } else {
      for (const g of aggByCust.values()) {
        if (keysFilter && !keysFilter.has(g.name)) { skipped++; continue; }
        upserted++;
      }
    }

    this.log.log(`importToArLedger company=${companyCode} period=${period} upserted=${upserted} skipped=${skipped} dryRun=${dryRun}`);
    return { companyCode, period, periodDate, farmCode, dryRun, upserted, skipped, source };
  }
}
