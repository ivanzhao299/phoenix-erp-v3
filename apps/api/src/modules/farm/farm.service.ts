import { productionReportFactsSql } from './production-report-facts';
import { normalizeGradeQuantityMap, normalizeReportGrades, sameReportGrades, storedGradeStatus } from './daily-report-grades';
import { refreshDailyFlockLayRate } from './effective-production-source';
import { Injectable, NotFoundException, BadRequestException, Optional, Inject, ForbiddenException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { OrgOwnershipService } from '../org/services/org-ownership.service';
import { INV_LEDGER_CHANGE_TYPE } from '../wms/inv-ledger-change-types';
import { writeInvLedger } from '../wms/inventory-ledger.writer';
import { birdCount, lockDailyFlock, persistDailyBalance, prepareDailyBalances } from './daily-stock-policy';
import { lifecycleDailyBalance } from './flock-lifecycle-daily';
import { ScopedNotificationRecipientService } from '../notification/scoped-notification-recipient.service';

/**
 * FarmService — 养殖中心业务服务
 *
 * V3 重构（A1+A2+A4+A6+B4 合并修复）：
 *   - A6: 移除 FarmDailyEntity 死代码（entity 指向不存在的 biz_farm_daily 表，3 个旧路由全死）
 *   - A1: brd_daily_logs UNIQUE(log_date, house_code) 与"多班次"业务模型冲突 →
 *         INSERT 用 ON CONFLICT (log_date, house_code, shift) DO UPDATE
 *         (前提：migration 已把 UNIQUE 扩到含 shift)
 *   - A2: 日报与鸡群锁内按前后死淘差额更新存栏；不改写历史盘点基线
 *   - A4: 无 PRD-EGG 批次时不再抛 400 阻塞日报，改为告警 + ledger 跳过
 *   - B4: 动态字段名拼接加白名单校验，杜绝 SQL 注入
 */

/** 组织作用域 — 从 JWT storeCode 派生
 *  G16-2：storeCode 可能是 LPH_*（farm）或 SITE-*（site）两类不同维度，
 *         必须按前缀区分；过去把 storeCode 直接当 farmCode 比较，导致
 *         site 用户提交 LPH_ 农场数据被误判为"无权写入其他农场"。
 */
export interface OrgScope {
  isGlobal: boolean;
  farmCode: string | null;   // 首个 farm（遗留单 storeCode 兼容；优先用 farmCodes 全集）
  siteCode: string | null;   // 首个 site
  // G125：多维全集（取代旧 storeCode 单 token 隔离）。
  //   农场/场区/公司均来自 DataScopeGuard 解析的真实数据范围（allowedFarmCodes/SiteCodes/CompanyCodes），
  //   ∪ 遗留单 storeCode（向后兼容单场场长）。全局用户 isGlobal=true，三者皆空 = 不加过滤。
  farmCodes?: string[];
  siteCodes?: string[];
  companyCodes?: string[];
}

/**
 * G98：把 OrgScope 转成 SQL 过滤片段（农场/站点/公司多维并集）。
 *   非全局时按 (farm_code OR site_code OR company_code) 并集过滤——
 *   场长(farm/site)行为不变；股东/高层(company)新可见其公司农场。非全局且无任何维度时拒绝可见范围。
 *   alias 用于列前缀（''=无前缀）。params 原地追加，返回**裸 OR 组**（如 `(farm_code=$2 OR company_code=ANY($3))`），
 *   全局返回空串；非全局空范围返回 1=0；调用方自行用 ' AND ' 拼接或 push 进 where[]。
 */
export function scopeWhere(scope: OrgScope, params: any[], alias = ''): string {
  if (scope.isGlobal) return '';
  const ors: string[] = [];
  // G125：农场/场区支持多场（farmCodes/siteCodes 全集），向后兼容单值 farmCode/siteCode。
  const farms = (scope.farmCodes?.length ? scope.farmCodes : (scope.farmCode ? [scope.farmCode] : [])).filter(Boolean);
  const sites = (scope.siteCodes?.length ? scope.siteCodes : (scope.siteCode ? [scope.siteCode] : [])).filter(Boolean);
  const companies = (scope.companyCodes ?? []).filter(Boolean);
  if (farms.length)     { params.push(farms);     ors.push(`${alias}farm_code = ANY($${params.length})`); }
  if (sites.length)     { params.push(sites);     ors.push(`${alias}site_code = ANY($${params.length})`); }
  if (companies.length) { params.push(companies); ors.push(`${alias}company_code = ANY($${params.length})`); }
  return ors.length ? `(${ors.join(' OR ')})` : '1=0';
}

/**
 * 日报自身 farm/site/company 是落库快照，历史行为空时再沿 house -> ACTIVE farm 权威链派生。
 */
export function dailyLogScopeWhere(
  scope: OrgScope,
  params: any[],
  logAlias = 'dl.',
  houseAlias = 'h.',
  farmAlias = 'hf',
): string {
  if (scope.isGlobal) return '';
  const ors: string[] = [];
  const farms = (scope.farmCodes?.length ? scope.farmCodes : (scope.farmCode ? [scope.farmCode] : [])).filter(Boolean);
  const sites = (scope.siteCodes?.length ? scope.siteCodes : (scope.siteCode ? [scope.siteCode] : [])).filter(Boolean);
  const companies = (scope.companyCodes ?? []).filter(Boolean);
  if (farms.length) {
    params.push(farms);
    ors.push(`COALESCE(${logAlias}farm_code, ${houseAlias}farm_code) = ANY($${params.length})`);
  }
  if (sites.length) {
    params.push(sites);
    ors.push(`COALESCE(${logAlias}site_code, NULLIF(to_jsonb(${farmAlias})->>'mapped_site_code', '')) = ANY($${params.length})`);
  }
  if (companies.length) {
    params.push(companies);
    ors.push(`COALESCE(${logAlias}company_code, ${farmAlias}.company_code) = ANY($${params.length})`);
  }
  return ors.length ? `(${ors.join(' OR ')})` : '1=0';
}

/**
 * 从 req 派生 OrgScope — farm/farm-feed/farm-egg 等 controller 共用。
 *
 * G125 修复（根治「集团/超管/CEO 手机端只看一个场」）：
 *   过去仅看遗留单 token req.user.storeCode + 粗糙 isGlobal 判定（仅 username==='admin' /
 *   权限含 '*' / storeCode 含 ORG-GROUP）——导致 storeCode 被默认绑成单场（如孟赛）的
 *   ROLE_ADMIN/CEO/集团角色被降级为单场场长，看不到全部养殖场。
 *   现以 DataScopeGuard 解析并挂到 req.dataScope 的**真实数据范围**为权威：
 *     · isGlobal（ROLE_ADMIN / GROUP / GROUP 级绑定）→ 看全部；
 *     · allowedFarmCodes / allowedSiteCodes / allowedCompanyCodes → 多场聚合；
 *   已解析的 DataScope 不再合并遗留 storeCode，避免扩大权限；仅缺少 DataScope 时兼容。
 *   req.dataScope 缺失时兼容显式 legacyGlobal 或遗留 farm/site；其余 fail-closed。
 */
export function deriveOrgScope(req: any): OrgScope {
  const storeCode: string | undefined = req.user?.storeCode;
  const isFarm = !!storeCode && (storeCode.startsWith('LPH_') || storeCode.startsWith('LPH-'));
  const isSite = !!storeCode && storeCode.startsWith('SITE-');
  const legacyGlobal =
    storeCode === 'ALL' ||
    storeCode?.startsWith('ORG-GROUP') ||
    (req.user?.permissions || []).includes('*') ||
    req.user?.username === 'admin';

  const ds = req?.dataScope as
    | { isGlobal?: boolean; allowedCompanyCodes?: string[]; allowedFarmCodes?: string[]; allowedSiteCodes?: string[]; allowedBreedingFarmCodes?: string[]; allowedBreedingSiteCodes?: string[]; allowedBreedingCompanyCodes?: string[] }
    | undefined;

  // 全局：真实 DataScope 判全局 或 遗留判全局 → 不加任何过滤
  // DataScopeGuard 已给出结论时必须以它为权威。旧逻辑把“没有遗留 storeCode”
  // 直接视为全局，导致真实场长被误判为管理员，也让日报写入缺少农场归属。
  const isGlobal = ds ? ds.isGlobal === true : legacyGlobal;
  if (isGlobal) {
    return { isGlobal: true, farmCode: null, siteCode: null, farmCodes: [], siteCodes: [], companyCodes: [] };
  }

  // 非全局：优先显式养殖授权；仅无 DataScope 时使用遗留单场。
  const farmCodes = [...(ds?.allowedBreedingFarmCodes ?? ds?.allowedFarmCodes ?? [])];
  const siteCodes = [...(ds?.allowedBreedingSiteCodes ?? ds?.allowedSiteCodes ?? [])];
  const companyCodes = [...(ds?.allowedBreedingCompanyCodes ?? ds?.allowedCompanyCodes ?? [])];
  if (!ds && isFarm && !farmCodes.includes(storeCode!)) farmCodes.push(storeCode!);
  if (!ds && isSite && !siteCodes.includes(storeCode!)) siteCodes.push(storeCode!);

  return {
    isGlobal: false,
    farmCode: farmCodes[0] ?? null,
    siteCode: siteCodes[0] ?? null,
    farmCodes,
    siteCodes,
    companyCodes,
  };
}

// brd_daily_logs 允许写入的列（白名单 — 任何前端伪造的列名都会被丢弃）
const ALLOWED_DAILY_COLS = new Set([
  'flock_no', 'log_date', 'shift', 'feed_consumed', 'water_consumed',
  'mortality_qty', 'eggs_produced', 'bad_eggs', 'temp', 'humidity',
  'note', 'operator', 'farm_code', 'house_code', 'egg_count',
  'updated_at', 'farm_name', 'dirty_eggs', 'broken_eggs',
  'elimination_qty', 'culling_reason', 'mortality_reason',  // G19-A 死亡原因（独立列）
  // 2026-06-06：按 product_grades 9 档分解的产蛋数量（JSONB）
  'eggs_by_grade',
  // G9：孟赛 Excel 实有字段（业务方手动录或自动派生）
  'self_use_qty',   // 自用蛋数（手动录）
  'opening_qty',    // 开栏存栏（自动派生：前一天 closing - 今天 mortality - elimination）
  'closing_qty',    // 封栏存栏（自动派生）
  'lay_rate',       // 产蛋率% （自动派生：eggs_produced / closing_qty × 100）
  'business_date',  // 业务日期（默认 = log_date）
  'occupancy_id', 'site_code', 'company_code', 'project_code',  // MDM-1 主数据回填
]);

// Old handhelds send a saleable total and exactly the two observed defect counts.
function isLegacyMobileSummary(input: Record<string, unknown>): boolean {
  const grades = input.eggs_by_grade;
  if (!grades || typeof grades !== 'object' || Array.isArray(grades)) return false;
  const values = grades as Record<string, unknown>;
  return ['早班', '晚班'].includes(String(input.shift))
    && typeof input.eggs_produced === 'number' && Object.keys(values).length === 2
    && typeof values.DIRTY === 'number' && typeof values.BROKEN === 'number'
    && input.dirty_eggs === values.DIRTY && input.broken_eggs === values.BROKEN;
}

const MISSING_HOUSE_MESSAGE = '请先选择鸡舍后再提交';

export function hasPositiveGradeBreakdown(value: unknown): boolean {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return false; }
  }
  return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    && Object.values(parsed as Record<string, unknown>).some(item => Number(item) > 0));
}

@Injectable()
export class FarmService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly ownership: OrgOwnershipService,
    // Optional so standalone construction (tests) keeps working; production
    // resolves it through NotificationModule and uses real DataScope filters.
    @Optional() @Inject(ScopedNotificationRecipientService)
    private readonly scopedRecipients?: { resolve(companyCode: string, menuCodes: string[]): Promise<string[]> },
  ) {}

  /** 把任意 body 过滤为只剩白名单列；用于动态 SQL 拼接前的安全防线 */
  private sanitize(body: Record<string, unknown>): { fields: string[]; values: unknown[] } {
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const [k, v] of Object.entries(body)) {
      if (ALLOWED_DAILY_COLS.has(k)) {
        fields.push(k);
        values.push(v);
      }
    }
    return { fields, values };
  }

  /**
   * Legacy no-grade daily reports post their eggs into an existing PRD-EGG
   * batch. PRD-EGG batches carry no house dimension, so company + egg-date
   * ceiling is the finest identity the data model expresses; the batch must
   * also still be AVAILABLE with open quantity. A missing batch FAILS the
   * transaction — a silently skipped ledger row would make the daily report
   * lie about stock.
   */
  private async lookupLegacyEggBatch(
    manager: { query: (sql: string, params?: unknown[]) => Promise<any[]> },
    companyCode: string | null | undefined,
    logDate: unknown,
  ): Promise<string | null> {
    const rows = (await manager.query(
      `SELECT batch_no FROM inv_batches
        WHERE product_code LIKE 'PRD-EGG%'
          AND ($1::text IS NULL OR company_code = $1)
          AND egg_date <= $2::date
          AND status = 'AVAILABLE'
          AND COALESCE(qty_available, 0) > 0
        ORDER BY egg_date DESC NULLS LAST, created_at DESC
        LIMIT 1`,
      [companyCode ?? null, logDate as string],
    )) ?? [];
    return rows[0]?.batch_no ?? null;
  }

  private async findLegacyEggBatch(
    manager: { query: (sql: string, params?: unknown[]) => Promise<any[]> },
    companyCode: string | null | undefined,
    logDate: unknown,
  ): Promise<string> {
    const batchNo = await this.lookupLegacyEggBatch(manager, companyCode, logDate);
    if (!batchNo) {
      throw new BadRequestException(
        `无匹配的可用 PRD-EGG 库存批次（公司=${companyCode ?? '全部'}，蛋日≤${String(logDate)}，需 AVAILABLE 且可用量>0），库存记账失败：请先维护蛋品批次后重试`,
      );
    }
    return batchNo;
  }

  /**
   * Compensate the legacy FARM_IN posting when grades are backfilled onto a
   * no-grade report. The reversal is written only against proven reality:
   *  - one reversal per daily report identity (log_date + ref_no) — rerunning
   *    the same transition is an exact no-op, never extra ledger rows;
   *  - the flock's net legacy FARM_IN (originals plus adjustments, minus
   *    prior reversals) must still cover the amount being reversed;
   *  - any shortfall (missing original, already adjusted, already reversed
   *    under another identity) fails the whole transaction.
   */
  private async reverseLegacyFarmIn(
    manager: { query: (sql: string, params?: unknown[]) => Promise<any[]> },
    input: { flockNo: string; logDate: string; houseCode: string; shift?: string; amount: number; companyCode?: string | null; operator?: string },
  ): Promise<void> {
    const refNo = input.flockNo || input.houseCode;
    // Identity is the FULL daily-report coordinate: date + ref + house + shift.
    // Without shift, the evening shift's backfill would be silently swallowed
    // by the morning shift's reversal on the same flock and date.
    const identity = `（${input.logDate} ${input.houseCode}${input.shift ? ` ${input.shift}` : ''}）`;
    const already = (await manager.query(
      `SELECT 1 FROM inv_ledger
        WHERE change_type = 'FARM_REVERSED'
          AND note LIKE '日报补录分级：冲销历史 FARM_IN%'
          AND log_date = $1::date
          AND ref_no = $2
          AND note LIKE '%'
          AND right(note, length($3)) = $3
        LIMIT 1`,
      [input.logDate, refNo, identity],
    )) ?? [];
    if (already.length > 0) return; // idempotent rerun of the same transition

    // Net amount is scoped to this report's date and company. Rows written by
    // the fixed paths carry log_date/company_code; legacy rows predate those
    // columns (NULL) and are the only ones allowed to fall through the filter.
    const netRows = (await manager.query(
      `SELECT COALESCE(SUM(CASE WHEN change_type = 'FARM_IN' THEN qty_change
                                 WHEN change_type = 'FARM_REVERSED' THEN -qty_change END), 0)::numeric AS net_farm_in
        FROM inv_ledger
       WHERE ref_no = $1
         AND (log_date IS NULL OR log_date = $2::date)
         AND ($3::text IS NULL OR company_code IS NULL OR company_code = $3)
         AND (note LIKE '日报产蛋入账%' OR note LIKE '日报补录分级%' OR note LIKE '日报修改差额%')`,
      [refNo, input.logDate, input.companyCode ?? null],
    )) ?? [];
    const netFarmIn = Number(netRows[0]?.net_farm_in ?? 0);
    if (!(netFarmIn >= input.amount) || input.amount <= 0) {
      throw new BadRequestException(
        `补录分级冲销校验失败：${input.houseCode} 在 ${input.logDate} 的历史 FARM_IN 净额为 ${netFarmIn} 枚，不足以冲销 ${input.amount} 枚（原始流水缺失或已被调整）。请先核对库存台账（ref_no=${refNo}，范围=${input.logDate}${input.companyCode ? `/${input.companyCode}` : ''}）`,
      );
    }
    const batchNo = await this.findLegacyEggBatch(manager, input.companyCode, input.logDate);
    // INV-301a：统一共享写入器（store_code 沿用 farm 日报既有 'FACTORY' 占位约定）
    await writeInvLedger(manager, {
      batchNo,
      changeType: INV_LEDGER_CHANGE_TYPE.FARM_REVERSED,
      qtyChange: input.amount,
      operator: input.operator || 'SYS',
      storeCode: 'FACTORY',
      refNo,
      note: `日报补录分级：冲销历史 FARM_IN ${input.amount}枚${identity}`,
      logDate: input.logDate,
      companyCode: input.companyCode ?? null,
    });
  }

  /**
   * Product verdict A: a skipped legacy FARM_IN must survive the HTTP
   * response. Persist one unread pending-ledger notification per recipient
   * for the company's inventory keepers (MENU_INV_BATCH holders resolved
   * through the scoped recipient service; admin only as a fallback when the
   * resolver is unavailable). Deduplication is database-level via the
   * partial unique index on (user_id, biz_type, biz_no), and biz_no carries
   * the company code so two companies sharing a house code never swallow
   * each other's notices.
   */
  private async recordPendingLedgerNotification(
    manager: { query: (sql: string, params?: unknown[]) => Promise<any[]> },
    input: { logDate: string; houseCode: string; eggs: number; companyCode: string | null; flockNo: string },
  ): Promise<void> {
    const company = input.companyCode || '';
    const bizNo = `FARM_LEDGER_PENDING:${company || 'NO-COMPANY'}:${input.logDate}:${input.houseCode}`;
    let recipients: string[];
    if (this.scopedRecipients && company) {
      recipients = await this.scopedRecipients.resolve(company, ['MENU_INV_BATCH']);
    } else {
      const admins = (await manager.query(`SELECT user_id::text FROM sys_user WHERE username = 'admin' AND status = 1 LIMIT 1`)) ?? [];
      recipients = admins.map((row: any) => String(row.user_id));
    }
    if (!recipients.length) return;
    await manager.query(
      `INSERT INTO sys_notifications (user_id, notification_type, title, content, company_code, biz_type, biz_no, status, created_at)
       SELECT u.user_id, 'WORKFLOW_TASK', $1, $2, $3, 'FARM_LEDGER_PENDING', $4, 'UNREAD', NOW()
         FROM sys_user u
        WHERE u.status = 1
          AND u.user_id::text = ANY($5)
        ON CONFLICT (user_id, biz_type, biz_no) WHERE biz_type = 'FARM_LEDGER_PENDING' AND biz_no IS NOT NULL DO NOTHING`,
      [
        '日报 FARM_IN 待补账',
        `日报（${input.logDate} ${input.houseCode}，flock=${input.flockNo || input.houseCode}）产蛋 ${input.eggs} 枚因无可用 PRD-EGG 批次未记入库存台账，请维护批次后补账。`,
        input.companyCode,
        bizNo,
        recipients,
      ],
    );
  }

  /** Grade removal is a stock-affecting transition: refuse it while the
   *  report's eggs already exist as TEMP_PRODUCTION batches. */
  private async assertNoTempProductionForReport(
    manager: { query: (sql: string, params?: unknown[]) => Promise<any[]> },
    logDate: unknown,
    houseCode: string,
  ): Promise<void> {
    const posted = (await manager.query(
      `SELECT 1 FROM inv_batches
        WHERE source_type = 'TEMP_PRODUCTION'
          AND egg_date = $1
          AND collection_batch_ref = $2
        LIMIT 1`,
      [logDate as string, `HOUSE-${houseCode}`],
    )) ?? [];
    if (posted.length > 0) {
      throw new BadRequestException(
        `该日报（${String(logDate)} ${houseCode}）已按分级入库，不能移除分级明细；请先在库存侧处理已入库批次后再修改`,
      );
    }
  }

  async submitBreedingDailyLog(body: any, scope: OrgScope = { isGlobal: false, farmCode: null, siteCode: null }, actor?: string) {
    return this.saveDailyLog(body, scope, undefined, actor);
  }

  async updateBreedingDailyLog(id: number, body: any, scope: OrgScope = { isGlobal: false, farmCode: null, siteCode: null }, actor?: string) {
    return this.saveDailyLog(body, scope, id, actor);
  }

  private async saveDailyLog(input: any, scope: OrgScope, id?: number, actor?: string) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException(MISSING_HOUSE_MESSAGE);
    return this.entityManager.transaction(async manager => {
      // Read identity only, then acquire the same house -> flock -> report locks on both routes.
      const identity = id === undefined ? undefined : (await manager.query(
        'SELECT house_code, log_date::text AS log_date FROM brd_daily_logs WHERE id=$1', [id],
      ))[0];
      if (id !== undefined && !identity) throw new NotFoundException('Daily log not found');
      const houseCode = String(identity?.house_code ?? input.house_code ?? '').trim();
      if (!houseCode || houseCode.startsWith('加载中')) throw new BadRequestException(MISSING_HOUSE_MESSAGE);
      const logDate = identity?.log_date ?? input.log_date;
      const businessToday=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date());
      if(typeof logDate==='string'&&logDate>businessToday)throw new BadRequestException('未来日期只能计划，日报不能提前改变实际存栏');
      if (typeof logDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(logDate)
          || !Number.isFinite(Date.parse(logDate)) || new Date(logDate).toISOString().slice(0,10) !== logDate) {
        throw new BadRequestException('日报日期必须为真实 YYYY-MM-DD');
      }
      const house = await this.ownership.resolveHouse(houseCode);
      const farms = scope.farmCodes?.length ? scope.farmCodes : [scope.farmCode].filter(Boolean);
      const sites = scope.siteCodes?.length ? scope.siteCodes : [scope.siteCode].filter(Boolean);
      const companies = scope.companyCodes ?? [];
      if (!scope.isGlobal && !(farms.includes(house.farmCode) || sites.includes(house.siteCode || '') || companies.includes(house.companyCode))) {
        throw new ForbiddenException('无权写入该鸡舍的日报');
      }
      const owner = { farm_code: house.farmCode, site_code: house.siteCode || null, company_code: house.companyCode };
      const flock = await lockDailyFlock(manager, { house_code: houseCode, log_date: logDate, farm_code: house.farmCode, company_code: house.companyCode,
        flock_no: input.flock_no });
      const prior = (await manager.query(
        `SELECT *, log_date::text AS log_date FROM brd_daily_logs WHERE ${id === undefined
          ? 'log_date=$1 AND house_code=$2 AND shift=$3' : 'id=$1'} FOR UPDATE`,
        id === undefined ? [logDate, houseCode, input.shift || 'DAILY'] : [id],
      ))[0];
      if(!prior&&logDate<new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date()).slice(0,7)+'-01')throw new BadRequestException('跨月缺失日报必须使用独立审核的历史日报更正/补录单；未知占栏须先专项核对');
      if (id !== undefined && !prior) throw new NotFoundException('Daily log not found');
      if (prior) {
        if (prior.flock_no !== flock.flock_no || prior.house_code !== houseCode || prior.log_date !== logDate) {
          throw new BadRequestException('历史日报鸡群身份不明确或已变化，须先核对来源');
        }
        for (const field of ['house_code','flock_no','log_date','shift','farm_code','company_code','site_code']) {
          if (input[field] !== undefined && String(input[field] ?? '') !== String(prior[field] ?? '')) {
            throw new BadRequestException('禁止通过修改日报变更鸡群、日期或组织归属');
          }
        }
      }
      const body = { ...prior, ...input, ...owner, house_code: houseCode, flock_no: flock.flock_no,
        log_date: logDate, shift: prior?.shift ?? input.shift ?? 'DAILY', business_date: logDate };
      if (actor !== undefined) body.operator = prior ? prior.operator : actor;
      delete body.updated_at; // Database timestamps cannot be supplied by a client.
      delete body.occupancy_id; // Source identity is resolved only by the server, never accepted from input/prior.
      // Normalise partial edits from persisted values, never treat an omitted count as zero.
      for (const field of ['mortality_qty','elimination_qty','eggs_produced']) {
        body[field] = birdCount(input[field] === null ? null : body[field] ?? 0, field);
      }
      const legacySummary = isLegacyMobileSummary(input);
      const priorSummary = prior?.production_input_kind === 'LEGACY_MOBILE_SUMMARY';
      if (priorSummary && !legacySummary) {
        throw new BadRequestException('旧手机汇总日报须以原口径录入，分级请办理独立更正');
      }
      if (legacySummary) {
        const [schema] = await manager.query("SELECT to_regclass('production_cutover_scopes') AS scopes");
        if (schema?.scopes && (await manager.query(`
          SELECT id FROM production_cutover_scopes
          WHERE company_code=$1 AND house_code=$2 AND state<>'DRAFT' FOR SHARE`,
          [house.companyCode, houseCode])).length) {
          throw new BadRequestException('该鸡舍已进入正式切换，请使用正式生产日报');
        }
        // Summary rows carry explicit counters but no stock-producing allocations.
        // Do not convert an existing classified report or pooled receipt in place.
        if (flock.lifecycle_managed || (await manager.query(
          "SELECT 1 FROM brd_daily_logs WHERE log_date=$1 AND house_code=$2 AND shift='DAILY' LIMIT 1",
          [logDate, houseCode])).length) {
          throw new BadRequestException('该舍已有正式占栏或全天日报，请核对原单及录入范围');
        }
        if (prior && !priorSummary) {
          throw new BadRequestException('已有日报口径不同，请核对原单后办理更正');
        }
        body.dirty_eggs = birdCount(input.dirty_eggs, 'dirty_eggs');
        body.broken_eggs = birdCount(input.broken_eggs, 'broken_eggs');
        body.eggs_by_grade = JSON.stringify({});
      } else if (input.eggs_by_grade !== undefined) {
        const grades = normalizeReportGrades(input.eggs_by_grade);
        const matchesConfirmed = prior?.occupancy_id && sameReportGrades(prior.eggs_by_grade, grades);
        if (!matchesConfirmed) {
          const active = await manager.query("SELECT grade_code, is_saleable FROM product_grades WHERE status='ACTIVE'");
          if (Object.keys(grades).some(code => !active.some((row: any) => row.grade_code === code))) {
            throw new BadRequestException('分级明细包含未启用等级');
          }
          body.eggs_produced = active.filter((row: any) => row.is_saleable).reduce((sum: number, row: any) => sum + (grades[row.grade_code] ?? 0), 0);
          body.dirty_eggs = grades.DIRTY ?? 0;
          body.broken_eggs = grades.BROKEN ?? 0;
        }
        body.eggs_by_grade = JSON.stringify(grades);
      } else if (hasPositiveGradeBreakdown(prior?.eggs_by_grade) && input.eggs_produced !== undefined
          && Number(input.eggs_produced) !== Number(prior.eggs_produced)) {
        throw new BadRequestException('有分级的日报请修改分级明细，不可单独修改产蛋合计');
      }
      const managedBalance = await lifecycleDailyBalance(manager, flock, prior, body, input);
      if(managedBalance?.replayOnly)return {code:200,msg:'已确认原日报幂等回执，未改动历史事实',ledgerSkipped:false};
      if (managedBalance && !prior) {
        body.feed_consumed ??= null;
        body.water_consumed ??= null;
      }
      const oldHasGrades = hasPositiveGradeBreakdown(prior?.eggs_by_grade);
      const hasGrades = hasPositiveGradeBreakdown(body.eggs_by_grade);
      if (oldHasGrades && !hasGrades) await this.assertNoTempProductionForReport(manager, logDate, houseCode);
      if (input.eggs_by_grade !== undefined && hasGrades) {
        const posted = await manager.query(`SELECT COALESCE(grade_code_std,quality_grade) AS grade, SUM(qty)::numeric AS qty
          FROM inv_batches WHERE source_type='TEMP_PRODUCTION' AND company_code=$1 AND egg_date=$2
            AND collection_batch_ref=$3 GROUP BY COALESCE(grade_code_std,quality_grade)`,
          [house.companyCode, logDate, `HOUSE-${houseCode}`]);
        const others = await manager.query(`SELECT eggs_by_grade FROM brd_daily_logs
          WHERE house_code=$1 AND log_date=$2 AND shift<>$3`, [houseCode, logDate, body.shift]);
        const totals: Record<string, number> = { ...JSON.parse(body.eggs_by_grade) };
        for (const row of others) {
          const map = typeof row.eggs_by_grade === 'string' ? JSON.parse(row.eggs_by_grade) : row.eggs_by_grade;
          for (const [grade, qty] of Object.entries(map ?? {})) totals[grade] = (totals[grade] ?? 0) + Number(qty);
        }
        if (posted.some((row: any) => Number(row.qty) > (totals[row.grade] ?? 0))) {
          throw new BadRequestException('日报分级不能少于已入库数量，请先处理库存单据');
        }
      }
      if(!prior&&(await manager.query('SELECT 1 FROM brd_daily_logs WHERE log_date=$1 AND house_code=$2 AND shift<>$3 LIMIT 1',[logDate,houseCode,body.shift])).length){
        const oldKey=await manager.query(`SELECT 1 FROM pg_index i WHERE i.indrelid='brd_daily_logs'::regclass AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL AND
          (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM unnest(i.indkey) WITH ORDINALITY k(n,pos) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n WHERE k.pos<=i.indnkeyatts)=ARRAY['house_code','log_date']::text[] LIMIT 1`);
        if(oldKey.length)throw new BadRequestException('该历史日报表仍按舍日唯一，不能新增第二班次；请先核对历史粒度并由受控升级处理');
      }
      const balance = managedBalance ?? await prepareDailyBalances(manager, flock, prior, body);
      body.opening_qty = balance.opening;
      body.closing_qty = balance.closing;
      body.lay_rate = balance.closing == null ? null : balance.closing > 0 ? +(body.eggs_produced*100/balance.closing).toFixed(2) : 0;
      const { fields, values } = this.sanitize(body);
      if (legacySummary) {
        fields.push('production_input_kind');
        values.push('LEGACY_MOBILE_SUMMARY');
      }
      const updates = fields.filter(f => !['flock_no','log_date','house_code','shift'].includes(f))
        .map(f => `"${f}"=EXCLUDED."${f}"`).join(',');
      await manager.query(`INSERT INTO "brd_daily_logs" (${fields.map(f => `"${f}"`).join(',')})
        VALUES (${values.map((_, i) => `$${i+1}`).join(',')})
        ON CONFLICT (log_date,house_code,shift) DO UPDATE SET ${updates}`, values);
      if (!managedBalance) await persistDailyBalance(manager, flock.flock_no, balance.quantity, balance.following);
      else await refreshDailyFlockLayRate(manager,flock.flock_no);

      const oldEggs = Number(prior?.eggs_produced ?? 0);
      if (prior && !oldHasGrades && hasGrades && oldEggs > 0) {
        await this.reverseLegacyFarmIn(manager, { flockNo: flock.flock_no, logDate, houseCode,
          shift: body.shift, amount: oldEggs, companyCode: house.companyCode, operator: body.operator });
      }
      let ledgerSkipped = false;
      const diff = body.eggs_produced - oldEggs;
      if (!legacySummary && !hasGrades && diff !== 0) {
        // A legacy pooled batch cannot establish physical flock provenance. Keep the report and hold its posting.
        const [policy] = await manager.query("SELECT to_regprocedure('vet_egg_day_held(text,date)') AS withdrawal");
        if (policy?.withdrawal) {
          const [source] = await manager.query('SELECT vet_egg_day_held($1,$2::date) AS held',[flock.flock_no,logDate]);
          if (source.held) return {code:200,msg:'日报已保存，此产蛋日已隔离，请在兽医核查中核对来源',ledgerSkipped:true};
        }
        const batchNo = await this.lookupLegacyEggBatch(manager, house.companyCode, logDate);
        if (batchNo) {
          await writeInvLedger(manager, { batchNo, changeType: diff > 0 ? INV_LEDGER_CHANGE_TYPE.FARM_IN : INV_LEDGER_CHANGE_TYPE.FARM_REVERSED,
            qtyChange: Math.abs(diff), operator: body.operator || 'SYS', storeCode: 'FACTORY', refNo: flock.flock_no,
            note: prior ? `日报修改差额 ${diff > 0 ? '+' : ''}${diff}` : `日报产蛋入账 ${diff}枚`, logDate, companyCode: house.companyCode });
        } else {
          ledgerSkipped = true;
          await this.recordPendingLedgerNotification(manager, { logDate, houseCode, eggs: Math.abs(diff),
            companyCode: house.companyCode, flockNo: flock.flock_no });
        }
      }
      const msg = id === undefined ? '日报提交成功' : '日报更新成功';
      return { code: 200, msg: ledgerSkipped ? `${msg}（警告：无可用 PRD-EGG 批次，本次未记账，待补账通知已发给库存管理员）` : msg,
        ...(id === undefined || ledgerSkipped ? { ledgerSkipped } : {}) };
    });
  }

  /**
   * 按日期 + 鸡舍 聚合 eggs_by_grade，合并所有班次（早/晚班）。
   * 用于 daily-inbound 页"从今日日报预填"按钮 — 业务方录完日报后，
   * 入库页能一键拉到 9 档数量预填，减少二次录入。
   */
  async getEggsBreakdown(
    date: string,
    houseCode: string | null,
    scope: OrgScope = { isGlobal: true, farmCode: null, siteCode: null },
  ): Promise<{
    code: number;
    date: string;
    houseCode: string | null;
    eggsByGrade: Record<string, number>;
    total: number;
    logs: number;
    missingBreakdownLogs: number;
    reportedEggs: number;
    /** Sum of every stock-managed grade in the report (physical total). */
    reportedGradeTotal: number;
    /** Saleable subset retained for the legacy eggs_produced/lay-rate field. */
    saleableTotal: number;
  }> {
    if (!date) throw new BadRequestException('date 参数必填');

    // 返回结构以 ACTIVE 等级主数据为准，并为未录数量的档位补 0。
    // 日报表单会省略空档；若直接透传稀疏 JSON，入库端会误判为“未按 9 档录入”。
    const activeGrades: Array<{ grade_code: string }> = await this.entityManager.query(
      `SELECT grade_code
       FROM product_grades
       WHERE status = 'ACTIVE'
         AND COALESCE(stock_managed, is_storable, true) = true
       ORDER BY sort_order, grade_code`,
    );

    const params: any[] = [date];
    const where: string[] = [`dl.log_date = $1`];
    if (houseCode) { params.push(houseCode); where.push(`dl.house_code = $${params.length}`); }
    const ebScope = dailyLogScopeWhere(scope, params); // 历史日报 scope 为空时按鸡舍归属兜底
    if (ebScope) where.push(ebScope);

    const rows: Array<{
      house_code: string;
      overlapping_shifts: boolean;
      eggs_by_grade: any;
      eggs_produced: number | string | null;
      inbound_by_grade: any;
    }> = await this.entityManager.query(
      `SELECT dl.house_code, dl.eggs_by_grade, dl.eggs_produced,
              (BOOL_OR(dl.shift='DAILY') OVER (PARTITION BY dl.house_code)
               AND COUNT(*) OVER (PARTITION BY dl.house_code)>1) AS overlapping_shifts,
              COALESCE((
                SELECT jsonb_object_agg(inbound.grade_code, inbound.qty)
                FROM (
                  SELECT COALESCE(ib.grade_code_std, ib.quality_grade) AS grade_code,
                         SUM(ib.qty)::numeric AS qty
                  FROM inv_batches ib
                  WHERE ib.source_type = 'TEMP_PRODUCTION'
                    AND ib.company_code = COALESCE(NULLIF(dl.company_code,''),hf.company_code)
                    AND ib.egg_date = dl.log_date
                    AND (ib.collection_batch_ref = 'HOUSE-' || dl.house_code
                         OR ib.source_no = 'TEMP-' || dl.log_date::text || '-' || dl.house_code)
                  GROUP BY COALESCE(ib.grade_code_std, ib.quality_grade)
                ) inbound
              ), '{}'::jsonb) AS inbound_by_grade
       FROM brd_daily_logs dl
       LEFT JOIN brd_houses h ON h.house_code = dl.house_code
       LEFT JOIN brd_farms hf ON hf.farm_code = h.farm_code AND hf.status = 'ACTIVE'
       WHERE ${where.join(' AND ')}`,
      params,
    );

    const aggregated: Record<string, number> = Object.fromEntries(
      activeGrades.map(({ grade_code }) => [grade_code, 0]),
    );
    let missingBreakdownLogs = 0;
    let reportedEggs = 0;
    let reportedGradeTotal = 0;
    const alreadyInboundByHouse = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const eggs = Math.max(0, Number(r.eggs_produced) || 0);
      reportedEggs += eggs;
      if (r.overlapping_shifts) throw new BadRequestException('同舍日的全天日报与其他日报重复覆盖，请先核对来源');
      let ebg: Record<string, number>;
      try { ebg = normalizeGradeQuantityMap(r.eggs_by_grade); }
      catch { missingBreakdownLogs++; continue; }
      const hasBreakdown = Object.values(ebg).some(qty => qty > 0);
      if (!hasBreakdown) {
        if (eggs > 0) missingBreakdownLogs += 1;
        continue;
      }
      for (const [grade, qty] of Object.entries(ebg as Record<string, unknown>)) {
        const n = Math.max(0, Number(qty) || 0);
        aggregated[grade] = (aggregated[grade] || 0) + n;
        reportedGradeTotal += n;
      }

      // A production inbound batch is the durable marker that a reported quantity
      // has already been posted to sales inventory. Capture it once per house even
      // when the daily report contains multiple shifts.
      if (!alreadyInboundByHouse.has(r.house_code)) {
        let inbound: unknown = r.inbound_by_grade;
        if (typeof inbound === 'string') {
          try { inbound = JSON.parse(inbound); } catch { inbound = null; }
        }
        const byGrade: Record<string, number> = {};
        if (inbound && typeof inbound === 'object') {
          for (const [grade, qty] of Object.entries(inbound as Record<string, unknown>)) {
            byGrade[grade] = Math.max(0, Number(qty) || 0);
          }
        }
        alreadyInboundByHouse.set(r.house_code, byGrade);
      }
    }
    for (const byGrade of alreadyInboundByHouse.values()) {
      for (const [grade, qty] of Object.entries(byGrade)) {
        aggregated[grade] = Math.max(0, (aggregated[grade] || 0) - qty);
      }
    }
    const total = Object.values(aggregated).reduce((s, n) => s + n, 0);
    return {
      code: 200,
      date,
      houseCode,
      eggsByGrade: aggregated,
      total,
      logs: rows.length,
      missingBreakdownLogs,
      reportedEggs,
      reportedGradeTotal,
      saleableTotal: reportedEggs,
    };
  }

  /** Persisted source reports, including zero quantities; callers never infer per-shift facts from a day total. */
  async getProductionReports(date:string,house:string,scope:OrgScope) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)
      throw new BadRequestException('日报日期必须为真实YYYY-MM-DD');
    if(!house?.trim())throw new BadRequestException(MISSING_HOUSE_MESSAGE);
    const params:any[]=[date,house];const allowed=dailyLogScopeWhere(scope,params);
    const reports = await this.entityManager.query(`SELECT dl.id,dl.house_code,dl.flock_no,dl.log_date::text AS log_date,dl.shift,dl.occupancy_id,
      dl.eggs_by_grade,dl.eggs_produced,dl.feed_consumed,dl.water_consumed,dl.note,dl.opening_qty,dl.closing_qty
      FROM brd_daily_logs dl LEFT JOIN brd_houses h ON h.house_code=dl.house_code
      LEFT JOIN brd_farms hf ON hf.farm_code=h.farm_code AND hf.status='ACTIVE'
      WHERE dl.log_date=$1 AND dl.house_code=$2 ${allowed?'AND '+allowed:''} ORDER BY dl.id`,params);
    return reports.map((report:any)=>({...report,grade_status:storedGradeStatus(report.eggs_by_grade)}));
  }

  async getProductionArchive(kind: 'houses' | 'flocks', query: Record<string, unknown>, scope: OrgScope) {
    const page = Number(query.page ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new BadRequestException('页码无效');
    const farm = String(query.farmCode ?? '').trim();
    const status = String(query.status ?? '').trim();
    const text = String(query.search ?? '').trim();
    if ([farm, status, text].some(value => value.length > 100)) throw new BadRequestException('查询条件过长');
    const params: unknown[] = [farm, status, '%' + text.replace(/[\\%_]/g, value => String.fromCharCode(92) + value) + '%', (page - 1) * 25];
    const predicate = scopeWhere(scope, params, 'owner.') || 'TRUE';
    const owners = '(SELECT farm_code, farm_name, company_code, mapped_site_code AS site_code FROM brd_farms)';
    const house = kind === 'houses';
    const source = house
      ? `SELECT h.*, owner.farm_name AS scoped_farm_name, h.house_code AS archive_key,
          CASE WHEN flock.count=0 THEN 0 WHEN flock.count=1 THEN flock.qty END AS archive_birds,
          CASE WHEN flock.count=1 THEN flock.started END AS archive_start,
          CASE WHEN flock.count=1 THEN flock.rate END AS archive_rate,
          COALESCE(h.status='ACTIVE' AND flock.count<2
            AND (limit_qty.value IS NULL OR COALESCE(flock.qty,0) <= limit_qty.value * 1.2),false) AS archive_normal
        FROM brd_houses h JOIN ${owners} owner ON owner.farm_code=h.farm_code
        LEFT JOIN LATERAL (SELECT count(*) AS count,max(f.current_qty) AS qty,
          max(COALESCE(f.placement_date,f.start_date))::text AS started,max(f.current_lay_rate) AS rate
          FROM brd_flocks f WHERE f.house_code=h.house_code AND f.farm_code=owner.farm_code
          AND f.status IN ('ACTIVE','GROWING','LAYING','PEAK','DECLINING')) flock ON true
        CROSS JOIN LATERAL (SELECT min(candidate) AS value FROM (VALUES (h.capacity),(h.max_capacity)) sizes(candidate)
          WHERE candidate>0) limit_qty
        WHERE ${predicate} AND ($1='' OR h.farm_code=$1) AND ($2='' OR h.status=$2)
          AND concat_ws(' ',h.house_code,h.house_name,owner.farm_name,owner.farm_code) ILIKE $3`
      : `SELECT f.*, f.flock_no AS archive_key, f.current_qty AS archive_birds, false AS archive_normal
        FROM brd_flocks f JOIN ${owners} owner ON owner.farm_code=f.farm_code
        LEFT JOIN brd_houses h ON h.house_code=f.house_code AND h.farm_code=owner.farm_code
        WHERE ${predicate} AND ($1='' OR f.farm_code=$1)
          AND ($2='' OR f.status=$2 OR ($2='LAYING' AND f.status='ACTIVE'))
          AND concat_ws(' ',f.flock_no,f.house_code,h.house_name,owner.farm_name,owner.farm_code,
            to_jsonb(f)->>'breed_code',to_jsonb(f)->>'breed_type',to_jsonb(f)->>'strain') ILIKE $3`;
    const [result] = await this.entityManager.query(`WITH matches AS MATERIALIZED (${source}),
      page_rows AS (SELECT * FROM matches ORDER BY archive_key LIMIT 25 OFFSET $4)
      SELECT (SELECT COALESCE(jsonb_agg(to_jsonb(page_rows) ORDER BY archive_key),'[]'::jsonb) FROM page_rows) AS items,
        count(*)::int AS total, COALESCE(sum(archive_birds),0)::numeric AS birds,
        count(*) FILTER (WHERE archive_birds IS NULL)::int AS unknown,
        count(*) FILTER (WHERE archive_normal)::int AS normal
      FROM matches`, params);
    return { ...result, birds: Number(result.birds), pageSize: 25 };
  }

  async getDailyHenReport(date: string, scope: OrgScope = { isGlobal: false, farmCode: null, siteCode: null }) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new BadRequestException('日报日期必须为真实YYYY-MM-DD');
    const businessToday=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date());
    if(date>businessToday)throw new BadRequestException('未来日期没有实际存栏日报，请使用计划流程');
    const [schema]=await this.entityManager.query("SELECT to_regclass('brd_flock_balances') AS ledger");
    const flockParams:any[]=[date];const flockScope=scopeWhere(scope,flockParams,'owner.');
    const legacy=await this.entityManager.query(`SELECT f.flock_no,f.house_code,h.house_name,f.current_qty,f.initial_qty,owner.farm_code,
      COALESCE(f.placement_date,f.start_date)::text AS placement_date,f.status,
      (f.start_date IS NULL OR f.start_date<=$1::date) AS entry_candidate,
      f.start_date IS NOT NULL AND f.farm_code=h.farm_code AND f.status IN ('ACTIVE','GROWING','LAYING','PEAK','DECLINING')
        ${schema?.ledger?'AND NOT EXISTS(SELECT 1 FROM brd_flock_house_states hs WHERE hs.house_code=h.house_code)':''}
        AND NOT EXISTS(SELECT 1 FROM brd_flocks other WHERE other.house_code=h.house_code AND other.flock_no<>f.flock_no
          AND (other.status IS DISTINCT FROM 'RETIRED' OR COALESCE(other.current_qty,0)>0)
          AND (other.start_date IS NULL OR other.start_date<=$1::date)) AS entry_verified
      FROM brd_flocks f JOIN brd_houses h ON h.house_code=f.house_code
      JOIN (SELECT farm_code,company_code,mapped_site_code AS site_code FROM brd_farms WHERE status='ACTIVE') owner ON owner.farm_code=h.farm_code
      WHERE (UPPER(f.status) IN ('ACTIVE','GROWING','LAYING','PEAK','DECLINING') OR COALESCE(f.current_qty,0)>0)
        ${schema?.ledger?'AND NOT EXISTS(SELECT 1 FROM brd_flock_balances b WHERE b.flock_no=f.flock_no)':''}
        ${flockScope?'AND '+flockScope:''} ORDER BY f.house_code`,flockParams);
    const managedParams:any[]=[date];const managedScope=scopeWhere(scope,managedParams,'o.');
    const managed=schema?.ledger?await this.entityManager.query(`SELECT f.flock_no,o.house_code,h.house_name,f.initial_qty,
      COALESCE(f.placement_date,f.start_date)::text AS placement_date,f.status,o.id AS occupancy_id,o.farm_code,
      (SELECT closing_qty FROM brd_flock_daily_balances d WHERE d.flock_no=f.flock_no AND d.balance_date<=$1 ORDER BY d.balance_date DESC LIMIT 1) AS current_qty
      FROM brd_flock_occupancies o JOIN brd_flocks f ON f.flock_no=o.flock_no JOIN brd_houses h ON h.house_code=o.house_code
      WHERE o.began_on<=$1 AND (o.ended_on IS NULL OR o.ended_on>$1) ${managedScope?'AND '+managedScope:''} ORDER BY o.house_code`,managedParams):[];
    const logParams:any[]=[date];const logScope=dailyLogScopeWhere(scope,logParams);
    const logs=await this.entityManager.query(`SELECT COALESCE(dl.house_code,dl.flock_no) AS house_code,dl.flock_no,dl.occupancy_id,
      CASE WHEN count(DISTINCT NULLIF(dl.farm_code,''))=1 AND bool_and(NULLIF(dl.farm_code,'') IS NOT NULL)
        THEN min(dl.farm_code) END AS farm_code,
      SUM(dl.eggs_produced)::int AS eggs,SUM(dl.mortality_qty)::int AS mortality,SUM(dl.elimination_qty)::int AS elimination,
      SUM(dl.dirty_eggs)::int AS dirty,SUM(dl.broken_eggs)::int AS broken,SUM(dl.feed_consumed)::numeric AS feed,
      SUM(dl.water_consumed)::numeric AS water,COUNT(*) FILTER (WHERE dl.has_production_report)::int AS log_count,
      COUNT(*) FILTER (WHERE dl.has_production_report AND dl.feed_consumed IS NULL)::int AS feed_missing,
      COUNT(*) FILTER (WHERE dl.has_production_report AND dl.water_consumed IS NULL)::int AS water_missing,
      (ARRAY_AGG(dl.closing_qty ORDER BY dl.id DESC) FILTER (WHERE dl.has_production_report))[1] AS closing_qty,
      STRING_AGG(DISTINCT dl.culling_reason,'；') AS culling_reason,STRING_AGG(DISTINCT dl.mortality_reason,'；') AS mortality_reason
      FROM (${productionReportFactsSql(Boolean(schema?.ledger))}) dl LEFT JOIN brd_houses h ON h.house_code=dl.house_code
      LEFT JOIN brd_farms hf ON hf.farm_code=h.farm_code AND hf.status='ACTIVE'
      WHERE dl.log_date=$1 ${logScope?'AND '+logScope:''} GROUP BY COALESCE(dl.house_code,dl.flock_no),dl.flock_no,dl.occupancy_id`,logParams);
    const used=new Set<any>();
    const frames=[...managed,...legacy];
    const rows=frames.map((f:any)=>{
      const log=logs.find((r:any)=>r.flock_no===f.flock_no&&r.house_code===f.house_code&&(r.occupancy_id??null)===(f.occupancy_id??null));if(log)used.add(log);
      const raw=f.occupancy_id?f.current_qty:date===businessToday?f.current_qty:log?.closing_qty;
      const quantity=raw==null?null:Number(raw);const eggs=Number(log?.eggs??0);
      const mortality=Number(log?.mortality??0),elimination=Number(log?.elimination??0);
      const reportFarm = log?.farm_code ?? null;
      const farm_code = f.occupancy_id ? f.farm_code
        : log ? reportFarm : f.farm_code;
      return {farm_code,entry_candidate:!!f.occupancy_id||f.entry_candidate,entry_verified:!!f.occupancy_id||f.entry_verified,house_code:log?.house_code??f.house_code,house_name:f.house_name||f.house_code,flock_no:f.flock_no,occupancy_id:f.occupancy_id??null,
        current_qty:quantity,initial_qty:f.initial_qty==null?null:Number(f.initial_qty),age_days:f.placement_date?Math.max(0,Math.floor((Date.parse(date)-Date.parse(f.placement_date))/86400000)):null,
        eggs,lay_rate:log?.log_count>0&&quantity!=null&&quantity>0?(eggs*100/quantity).toFixed(2):null,mortality,elimination,total_loss:mortality+elimination,
        dirty:Number(log?.dirty??0),broken:Number(log?.broken??0),culling_reason:log?.culling_reason??null,mortality_reason:log?.mortality_reason??null,
        feed:log?.feed==null?null:Number(log.feed),water:log?.water==null?null:Number(log.water),
        feed_missing:Number(log?.feed_missing??0),water_missing:Number(log?.water_missing??0),has_daily_log:Number(log?.log_count??0)>0,production_stage:f.occupancy_id?'HISTORICAL_STAGE_UNRECORDED':f.status,current_flock_status:f.status,
        balance_status:f.occupancy_id?'VERIFIED_EVENT_BALANCE':quantity==null?'UNKNOWN_HISTORICAL_BALANCE':'LEGACY_UNVERIFIED'};
    });
    // Keep explicit old report identities, never replace them with today's occupant after a changeover.
    for(const log of logs.filter((r:any)=>!used.has(r)))rows.push({farm_code:log.farm_code??null,entry_candidate:false,entry_verified:false,house_code:log.house_code,house_name:log.house_code,flock_no:log.flock_no,occupancy_id:log.occupancy_id,
      current_qty:log.occupancy_id?0:log.closing_qty==null?null:Number(log.closing_qty),initial_qty:null,age_days:null,eggs:Number(log.eggs),lay_rate:null,
      mortality:Number(log.mortality),elimination:Number(log.elimination),total_loss:Number(log.mortality)+Number(log.elimination),dirty:Number(log.dirty),broken:Number(log.broken),
      culling_reason:log.culling_reason,mortality_reason:log.mortality_reason,feed:log.feed==null?null:Number(log.feed),water:log.water==null?null:Number(log.water),
      feed_missing:log.feed_missing,water_missing:log.water_missing,has_daily_log:log.log_count>0,production_stage:'HISTORICAL_UNVERIFIED',current_flock_status:null,balance_status:log.occupancy_id?'ENDED_OCCUPANCY':'LEGACY_UNVERIFIED'});
    const totals=rows.reduce((acc:any,r:any)=>{for(const key of ['eggs','mortality','elimination','total_loss','feed','water','feed_missing','water_missing'])acc[key]+=Number(r[key]??0);acc.current_qty+=Number(r.current_qty??0);if(r.current_qty==null)acc.balance_complete=false;if(r.has_daily_log)acc.logged_houses++;return acc;},
      {current_qty:0,eggs:0,mortality:0,elimination:0,total_loss:0,feed:0,water:0,feed_missing:0,water_missing:0,logged_houses:0,balance_complete:true});
    totals.lay_rate=totals.balance_complete&&totals.current_qty>0&&rows.every(r=>r.balance_status==='ENDED_OCCUPANCY'||r.has_daily_log)?(totals.eggs*100/totals.current_qty).toFixed(2):null;
    totals.feed=rows.some(r=>r.feed!=null)?Number(totals.feed.toFixed(2)):null;
    totals.water=rows.some(r=>r.water!=null)?Number(totals.water.toFixed(2)):null;
    // One row here describes one occupancy/day, after combining shifts and losses.
    const grouped = new Map<string, typeof rows>();
    let unattributed = false;
    for (const row of rows) {
      if (!row.has_daily_log && !row.entry_candidate && row.balance_status !== 'ENDED_OCCUPANCY') continue;
      if (!row.farm_code) {
        unattributed = true;
        continue;
      }
      const sameFarm = grouped.get(row.farm_code) ?? [];
      sameFarm.push(row);
      grouped.set(row.farm_code, sameFarm);
    }
    const farm_totals = [...grouped].map(([farm_code, reportRows]) => {
      const eggs = reportRows.reduce((total, row) => total + row.eggs, 0);
      const birds = reportRows.reduce((total, row) => total + (row.current_qty ?? 0), 0);
      const complete = !unattributed && reportRows.every(row => row.balance_status === 'ENDED_OCCUPANCY'
        || row.has_daily_log && row.current_qty !== null);
      return { farm_code, eggs, current_qty: birds, lay_rate: complete && birds > 0 ? eggs * 100 / birds : null };
    });
    return {code:200,date,rows,totals,farm_totals,quantity_basis:'业务日有效占栏日末余额；未接续历史缺快照时未知，不用今天存栏回算',lay_rate_basis:'已报产蛋数量/同日末在栏羽数；缺报或未知余额不计算'};
  }

  async getFarmTrend(days: number, scope: OrgScope = { isGlobal: false, farmCode: null, siteCode: null }) {
    const safeDays = Math.min(Math.max(Number(days) || 7, 1), 90);

    const trendParams: any[] = [safeDays];
    let trendWhere = `WHERE dl.log_date >= (CURRENT_DATE - ($1 * 2 - 1) * INTERVAL '1 day')`;
    const trendScope = dailyLogScopeWhere(scope, trendParams);
    if (trendScope) trendWhere += ` AND ${trendScope}`;
    const [ledger]=await this.entityManager.query("SELECT to_regclass('brd_flock_events') AS ledger");
    const rows = await this.entityManager.query(`WITH reports AS (
      SELECT dl.* FROM (${productionReportFactsSql(Boolean(ledger?.ledger))}) dl LEFT JOIN brd_houses h ON h.house_code=dl.house_code
      LEFT JOIN brd_farms hf ON hf.farm_code=h.farm_code AND hf.status='ACTIVE' ${trendWhere}
    ), house_days AS (
      SELECT house_code,flock_no,log_date,SUM(eggs_produced) AS eggs,SUM(mortality_qty) AS mortality,
        SUM(elimination_qty) AS elimination,SUM(feed_consumed) AS feed,SUM(water_consumed) AS water,
        COUNT(*) FILTER (WHERE has_production_report AND feed_consumed IS NULL) AS feed_missing,
        COUNT(*) FILTER (WHERE has_production_report AND water_consumed IS NULL) AS water_missing,
        BOOL_OR(has_production_report) AS reported,
        (ARRAY_AGG(closing_qty ORDER BY id DESC) FILTER (WHERE has_production_report))[1] AS closing_qty
      FROM reports GROUP BY house_code,flock_no,log_date)
      SELECT log_date::text AS date,SUM(eggs)::int AS eggs,SUM(mortality)::int AS mortality,SUM(elimination)::int AS elimination,
        SUM(feed)::numeric AS feed,SUM(water)::numeric AS water,SUM(feed_missing)::int AS feed_missing,SUM(water_missing)::int AS water_missing,
        SUM(closing_qty)::numeric AS reported_qty,BOOL_AND(closing_qty IS NOT NULL) FILTER(WHERE reported) AS quantity_complete,
        COUNT(*) FILTER(WHERE reported)::int AS report_count FROM house_days GROUP BY log_date ORDER BY log_date`,trendParams);

    const today = new Date();
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - safeDays);

    const current: typeof rows = [];
    const prev: typeof rows = [];
    for (const r of rows) {
      const d = new Date(r.date);
      if (d > cutoff) current.push(r); else prev.push(r);
    }

    const avg = (arr: typeof rows, field: string) =>
      arr.length ? Math.round(arr.reduce((s: number, r: any) => s + Number(r[field] || 0), 0) / arr.length) : 0;

    // flock 存栏数也按农场/场区过滤
    const flockParams: any[] = [];
    // 所有在产状态：产蛋期、高峰期、下降期。
    let flockWhere = `WHERE UPPER(f.status) IN ('ACTIVE','GROWING','LAYING','PEAK','DECLINING')`;
    const flockScope = scopeWhere(scope, flockParams, 'f.');   // G98：农场/站点/公司多维并集
    if (flockScope) flockWhere += ` AND ${flockScope}`;
    const flockSum = await this.entityManager.query(
      `SELECT COALESCE(SUM(f.current_qty),0)::int AS total FROM brd_flocks f ${flockWhere}`,
      flockParams,
    );
    const totalQty = Number(flockSum[0]?.total ?? 0);

    const measuredAverage = (series: typeof rows, key: 'eggs'|'feed') => {
      const measured = series.filter((row: any) => row[key] != null && (key !== 'feed' || !row.feed_missing));
      return measured.length ? avg(measured, key) : null;
    };
    const weightedRate=(series:any[])=>{const reported=series.filter(r=>Number(r.report_count)>0);const denominator=reported.reduce((n,r)=>n+Number(r.reported_qty??0),0);return reported.length&&reported.every(r=>r.quantity_complete)&&denominator>0?(reported.reduce((n,r)=>n+Number(r.eggs),0)*100/denominator).toFixed(2):null;};
    const summary = {
      current_days:    current.length,
      avg_eggs:        measuredAverage(current, 'eggs'),
      avg_mortality:   avg(current, 'mortality'),
      avg_elimination: avg(current, 'elimination'),
      avg_feed:        measuredAverage(current, 'feed'),
      lay_rate:        weightedRate(current),
      prev_avg_eggs:   measuredAverage(prev, 'eggs'),
      prev_lay_rate:   weightedRate(prev),
      total_qty:       totalQty,
    };

    return { code: 200, days: safeDays, rows: current, summary,denominator_basis:'各期间已报产蛋舍日的日末羽日；历史缺余额不计算，不使用今日存栏回算' };
  }
}
