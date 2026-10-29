import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { OrgOwnershipService } from '../org/services/org-ownership.service';

/**
 * FarmService — 养殖中心业务服务
 *
 * V3 重构（A1+A2+A4+A6+B4 合并修复）：
 *   - A6: 移除 FarmDailyEntity 死代码（entity 指向不存在的 biz_farm_daily 表，3 个旧路由全死）
 *   - A1: brd_daily_logs UNIQUE(log_date, house_code) 与"多班次"业务模型冲突 →
 *         INSERT 用 ON CONFLICT (log_date, house_code, shift) DO UPDATE
 *         (前提：migration 已把 UNIQUE 扩到含 shift)
 *   - A2: current_qty 双扣 → 提交/更新都重新按"当日总死淘"计算，不再用 diff
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
 *   场长(farm/site)行为不变；股东/高层(company)新可见其公司农场。无任何维度则不加过滤（保持旧行为）。
 *   alias 用于列前缀（''=无前缀）。params 原地追加，返回**裸 OR 组**（如 `(farm_code=$2 OR company_code=ANY($3))`），
 *   无任何维度或全局则返回空串；调用方自行用 ' AND ' 拼接或 push 进 where[]。
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
  return ors.length ? `(${ors.join(' OR ')})` : '';
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
  return ors.length ? `(${ors.join(' OR ')})` : '';
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
 *   再 ∪ 遗留单 storeCode（向后兼容单场场长——其 storeCode=本场而无 farmScope 行）。
 *   req.dataScope 缺失时仅保留显式 legacyGlobal；其余一律 fail-closed。
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
    | { isGlobal?: boolean; allowedCompanyCodes?: string[]; allowedFarmCodes?: string[]; allowedSiteCodes?: string[] }
    | undefined;

  // 全局：真实 DataScope 判全局 或 遗留判全局 → 不加任何过滤
  // DataScopeGuard 已给出结论时必须以它为权威。旧逻辑把“没有遗留 storeCode”
  // 直接视为全局，导致真实场长被误判为管理员，也让日报写入缺少农场归属。
  const isGlobal = ds ? ds.isGlobal === true : legacyGlobal;
  if (isGlobal) {
    return { isGlobal: true, farmCode: null, siteCode: null, farmCodes: [], siteCodes: [], companyCodes: [] };
  }

  // 非全局：合并真实多场范围 ∪ 遗留单场
  const farmCodes = [...(ds?.allowedFarmCodes ?? [])];
  const siteCodes = [...(ds?.allowedSiteCodes ?? [])];
  const companyCodes = [...(ds?.allowedCompanyCodes ?? [])];
  if (isFarm && !farmCodes.includes(storeCode!)) farmCodes.push(storeCode!);
  if (isSite && !siteCodes.includes(storeCode!)) siteCodes.push(storeCode!);

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
  'site_code', 'company_code', 'project_code',  // MDM-1 主数据回填
]);

const MISSING_HOUSE_MESSAGE = '请先选择鸡舍后再提交';

@Injectable()
export class FarmService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly ownership: OrgOwnershipService,
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

  async submitBreedingDailyLog(body: any, scope: OrgScope = { isGlobal: true, farmCode: null, siteCode: null }) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException(MISSING_HOUSE_MESSAGE);
    }
    const houseCode = typeof body.house_code === 'string' ? body.house_code.trim() : body.house_code;
    if (typeof houseCode !== 'string' || houseCode === '' || houseCode.startsWith('加载中')) {
      throw new BadRequestException(MISSING_HOUSE_MESSAGE);
    }
    body.house_code = houseCode;

    // 2026-06-06: 若提供了 eggs_by_grade，自动派生 eggs_produced/dirty_eggs/broken_eggs
    // 保持向后兼容；权威字段是 eggs_by_grade（与 product_grades 同源）。
    let hasGradeBreakdown = false;
    if (body.eggs_by_grade && typeof body.eggs_by_grade === 'object') {
      const ebg = body.eggs_by_grade as Record<string, unknown>;
      const num = (k: string) => Math.max(0, Number(ebg[k]) || 0);
      hasGradeBreakdown = Object.values(ebg).some(value => Number(value) > 0);
      // G67 已将可售编码从 XL/L/M/S/XS 切换为 GRADE_1..5；以 ACTIVE
      // 等级主数据判断可售档，避免旧硬编码将日报总产蛋数算成 0。
      const saleableRows: Array<{ grade_code: string }> = await this.entityManager.query(
        `SELECT grade_code FROM product_grades WHERE status = 'ACTIVE' AND is_saleable = true`,
      );
      const saleableSum = saleableRows.reduce((sum, { grade_code }) => sum + num(grade_code), 0);
      // 仅在前端未显式传 eggs_produced/dirty/broken 时回填，避免覆盖业务方手动校正
      if (body.eggs_produced == null) body.eggs_produced = saleableSum;
      if (body.dirty_eggs == null)    body.dirty_eggs    = num('DIRTY');
      if (body.broken_eggs == null)   body.broken_eggs   = num('BROKEN');
      // 序列化为 JSON 字符串供 INSERT JSONB 列
      body.eggs_by_grade = JSON.stringify(ebg);
    }

    const eggs = Number(body.eggs_produced) || 0;
    const mortality = Number(body.mortality_qty) || 0;
    const elimination = Number(body.elimination_qty) || 0;
    const flock_no = body.flock_no || body.house_code;

    // G9 自动派生 opening_qty / closing_qty / lay_rate（业务方无需手动算）
    // opening = 前一天同舍 closing（或 brd_flocks.current_qty）
    // closing = opening - mortality - elimination
    // lay_rate = eggs_produced / closing × 100
    // business_date 默认 = log_date
    if (body.opening_qty == null && body.house_code) {
      try {
        const prev: Array<{ closing_qty: number }> = await this.entityManager.query(
          `SELECT closing_qty FROM brd_daily_logs
            WHERE house_code=$1 AND log_date < $2 AND closing_qty IS NOT NULL
            ORDER BY log_date DESC, shift DESC LIMIT 1`,
          [body.house_code, body.log_date],
        );
        if (prev.length > 0 && prev[0].closing_qty) {
          body.opening_qty = Number(prev[0].closing_qty);
        } else {
          // 首日 / 无历史：从 brd_flocks.current_qty 取
          const flockRow: Array<{ current_qty: number }> = await this.entityManager.query(
            `SELECT current_qty FROM brd_flocks WHERE house_code=$1 OR flock_no=$1 LIMIT 1`,
            [body.house_code],
          );
          if (flockRow.length > 0) body.opening_qty = Number(flockRow[0].current_qty) || 0;
        }
      } catch { /* 派生失败不阻塞，留 NULL */ }
    }
    if (body.opening_qty != null && body.closing_qty == null) {
      body.closing_qty = Math.max(0, Number(body.opening_qty) - mortality - elimination);
    }
    if (body.lay_rate == null && body.closing_qty && Number(body.closing_qty) > 0 && eggs > 0) {
      body.lay_rate = +((eggs / Number(body.closing_qty)) * 100).toFixed(2);
    }
    if (body.business_date == null) body.business_date = body.log_date;

    // G16-2 安全校验：从 house_code 经 ACTIVE farm 反查唯一归属，
    //   再用 scope.farmCode / scope.siteCode 比对真实归属，避免把 SITE-*
    //   误当 LPH_* 比较导致同农场用户被拒。
    if (!scope.isGlobal && body.house_code) {
      const house = await this.ownership.resolveHouse(body.house_code);
      const realFarm = house.farmCode;
      const realSite = house.siteCode;
      const realCompany = house.companyCode;
      const allowedFarms = (scope.farmCodes?.length ? scope.farmCodes : (scope.farmCode ? [scope.farmCode] : [])).filter(Boolean);
      const allowedSites = (scope.siteCodes?.length ? scope.siteCodes : (scope.siteCode ? [scope.siteCode] : [])).filter(Boolean);
      if (!scope.isGlobal && allowedFarms.length && realFarm && !allowedFarms.includes(realFarm)) {
        throw new BadRequestException(`无权写入其他农场的数据（鸡舍 ${body.house_code} 属于 ${realFarm}）`);
      }
      if (!scope.isGlobal && allowedSites.length && realSite && !allowedSites.includes(realSite)) {
        throw new BadRequestException(`无权写入其他场区的数据（鸡舍 ${body.house_code} 属于 ${realSite}）`);
      }
      // 公司维度强校验：鸡舍归属公司必须在用户数据域内（farm/site 同农场但跨公司时兜底拦截，堵住静默越权）
      const allowedCompanies = (scope.companyCodes ?? []).filter(Boolean);
      if (!scope.isGlobal && allowedCompanies.length && realCompany && !allowedCompanies.includes(realCompany)) {
        throw new BadRequestException(`无权写入其他公司的数据（鸡舍 ${body.house_code} 属于 ${realCompany}）`);
      }
      if (!realFarm && !realSite && !realCompany) {
        throw new BadRequestException(`鸡舍 ${body.house_code} 尚未配置农场、场区或公司归属`);
      }
      // 强绑定：farm/site/company 一律以鸡舍权威值落库，不信前端传值（防跨公司错绑/漏绑）
      if (realFarm) body.farm_code = realFarm;
      if (realSite) body.site_code = realSite;
      if (realCompany) body.company_code = realCompany;
    }

    if (eggs < 0 || mortality < 0) {
      throw new BadRequestException('产蛋数和死淘数不能为负数！');
    }

    return await this.entityManager.transaction(async (manager) => {
      const { fields, values } = this.sanitize(body);
      if (fields.length === 0) {
        throw new BadRequestException('提交数据为空或全部字段非法');
      }
      const placeholders = fields.map((_, i) => `$${i + 1}`).join(',');
      const quotedFields = fields.map(f => `"${f}"`).join(',');

      // A1: ON CONFLICT 兜底 — 同一 (log_date, house_code, shift) 重复提交不再 23505 失败
      // 用 EXCLUDED 表示新值；保留 id 自增
      const updateCols = fields
        .filter(f => f !== 'flock_no' && f !== 'log_date' && f !== 'house_code' && f !== 'shift')
        .map(f => `"${f}" = EXCLUDED."${f}"`)
        .join(',');
      const conflictClause = updateCols
        ? `ON CONFLICT (log_date, house_code, shift) DO UPDATE SET ${updateCols}`
        : `ON CONFLICT DO NOTHING`;

      await manager.query(
        `INSERT INTO "brd_daily_logs" (${quotedFields}) VALUES (${placeholders}) ${conflictClause}`,
        values,
      );

      // A2: 业务钩子 — 按"当日总死淘"重算 current_qty，避免 diff 双扣
      if (flock_no && (mortality > 0 || eggs > 0)) {
        const sum = await manager.query(
          `SELECT
             COALESCE(SUM(mortality_qty), 0) AS total_mortality,
             COALESCE(SUM(eggs_produced), 0) AS total_eggs
           FROM brd_daily_logs
           WHERE log_date = $1 AND (flock_no = $2 OR house_code = $2)`,
          [body.log_date, flock_no],
        );
        const totalMortalityToday = Number(sum[0]?.total_mortality ?? 0);
        const totalEggsToday = Number(sum[0]?.total_eggs ?? 0);

        const flocks = await manager.query(
          `SELECT current_qty, initial_qty FROM "brd_flocks" WHERE flock_no = $1 OR house_code = $1`,
          [flock_no],
        );
        if (flocks.length > 0) {
          const initialQty = Number(flocks[0].initial_qty) || Number(flocks[0].current_qty) || 0;
          const newCurrentQty = Math.max(0, initialQty - totalMortalityToday);
          const layRate = newCurrentQty > 0
            ? ((totalEggsToday / newCurrentQty) * 100).toFixed(2)
            : '0.00';
          await manager.query(
            `UPDATE "brd_flocks" SET current_qty = $1, current_lay_rate = $2 WHERE flock_no = $3 OR house_code = $3`,
            [newCurrentQty, layRate, flock_no],
          );
        }
      }

      // A4: 无分级明细的旧日报才写 FARM_IN；有分级时由用户确认后的
      // production-inbound 统一写库存，避免同一批蛋被日报和分级各记一次。
      if (eggs > 0 && !hasGradeBreakdown) {
        try {
          const batches = await manager.query(
            `SELECT batch_no FROM inv_batches WHERE product_code LIKE 'PRD-EGG%' ORDER BY created_at DESC LIMIT 1`,
          );
          if (batches.length > 0) {
            await manager.query(
              `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
               VALUES ($1, 'FARM_IN', $2::int, $3, 'FACTORY', $4, $5)`,
              [batches[0].batch_no, eggs, body.operator || 'SYS', flock_no || '', `日报产蛋入账 ${eggs}枚`],
            );
          } else {
            console.warn(
              '[FarmService][WARN] 无可用 PRD-EGG 批次，产蛋入账已跳过；请仓储部门新建批次后补账',
              { flock_no, eggs, log_date: body.log_date },
            );
          }
        } catch (e: any) {
          console.warn('[FarmService][WARN] inv_ledger 记账失败（不阻塞日报）:', e?.message);
        }
      }

      return { code: 200, msg: '日报提交成功' };
    });
  }

  async updateBreedingDailyLog(id: number, body: any) {
    const eggs = Number(body.eggs_produced) || 0;
    const mortality = Number(body.mortality_qty) || 0;
    const flock_no = body.flock_no || body.house_code;

    if (eggs < 0 || mortality < 0) {
      throw new BadRequestException('产蛋数和死淘数不能为负数！');
    }

    return await this.entityManager.transaction(async (manager) => {
      const oldRecords = await manager.query(
        `SELECT eggs_produced, mortality_qty, log_date, flock_no, house_code
         FROM brd_daily_logs WHERE id = $1`,
        [id],
      );
      if (oldRecords.length === 0) {
        throw new NotFoundException('Daily log not found');
      }
      const old = oldRecords[0];
      const oldEggs = Number(old.eggs_produced) || 0;

      const { fields, values } = this.sanitize(body);
      if (fields.length === 0) {
        throw new BadRequestException('更新数据为空或全部字段非法');
      }
      const setClauses = fields.map((f, i) => `"${f}" = $${i + 1}`).join(',');
      values.push(id);
      await manager.query(
        `UPDATE "brd_daily_logs" SET ${setClauses} WHERE id = $${fields.length + 1}`,
        values,
      );

      // A2: 重新按当日总和覆写 current_qty
      const effectiveFlockNo = flock_no || old.flock_no || old.house_code;
      const logDate = body.log_date || old.log_date;
      if (effectiveFlockNo && logDate) {
        const sum = await manager.query(
          `SELECT COALESCE(SUM(mortality_qty),0) AS total_mortality,
                  COALESCE(SUM(eggs_produced),0) AS total_eggs
           FROM brd_daily_logs
           WHERE log_date = $1 AND (flock_no = $2 OR house_code = $2)`,
          [logDate, effectiveFlockNo],
        );
        const totalMortality = Number(sum[0]?.total_mortality ?? 0);
        const totalEggs = Number(sum[0]?.total_eggs ?? 0);
        const flocks = await manager.query(
          `SELECT current_qty, initial_qty FROM brd_flocks WHERE flock_no = $1 OR house_code = $1`,
          [effectiveFlockNo],
        );
        if (flocks.length > 0) {
          const initialQty = Number(flocks[0].initial_qty) || Number(flocks[0].current_qty) || 0;
          const newQty = Math.max(0, initialQty - totalMortality);
          const layRate = newQty > 0 ? ((totalEggs / newQty) * 100).toFixed(2) : '0.00';
          await manager.query(
            `UPDATE brd_flocks SET current_qty = $1, current_lay_rate = $2 WHERE flock_no = $3 OR house_code = $3`,
            [newQty, layRate, effectiveFlockNo],
          );
        }
      }

      // A4: 库存差额冲销 — 无批次时降级 warning
      const eggsDiff = eggs - oldEggs;
      if (eggsDiff !== 0) {
        try {
          const batches = await manager.query(
            `SELECT batch_no FROM inv_batches WHERE product_code LIKE 'PRD-EGG%' ORDER BY created_at DESC LIMIT 1`,
          );
          if (batches.length > 0) {
            await manager.query(
              `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
               VALUES ($1, $2, $3::int, $4, 'FACTORY', $5, $6)`,
              [
                batches[0].batch_no,
                eggsDiff > 0 ? 'FARM_IN' : 'FARM_REVERSED',
                Math.abs(eggsDiff),
                body.operator || 'SYS',
                effectiveFlockNo || '',
                `日报修改差额 ${eggsDiff > 0 ? '+' : ''}${eggsDiff}`,
              ],
            );
          } else {
            console.warn('[FarmService][WARN] 修改差额记账跳过，无 PRD-EGG 批次');
          }
        } catch (e: any) {
          console.warn('[FarmService][WARN] inv_ledger 差额记账失败:', e?.message);
        }
      }

      return { code: 200, msg: '日报更新成功' };
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
  }> {
    if (!date) throw new BadRequestException('date 参数必填');

    // 返回结构以 ACTIVE 等级主数据为准，并为未录数量的档位补 0。
    // 日报表单会省略空档；若直接透传稀疏 JSON，入库端会误判为“未按 9 档录入”。
    const activeGrades: Array<{ grade_code: string }> = await this.entityManager.query(
      `SELECT grade_code
       FROM product_grades
       WHERE status = 'ACTIVE'
       ORDER BY sort_order, grade_code`,
    );

    const params: any[] = [date];
    const where: string[] = [`dl.log_date = $1`];
    if (houseCode) { params.push(houseCode); where.push(`dl.house_code = $${params.length}`); }
    const ebScope = dailyLogScopeWhere(scope, params); // 历史日报 scope 为空时按鸡舍归属兜底
    if (ebScope) where.push(ebScope);

    const rows: Array<{
      house_code: string;
      eggs_by_grade: any;
      eggs_produced: number | string | null;
      inbound_by_grade: any;
    }> = await this.entityManager.query(
      `SELECT dl.house_code, dl.eggs_by_grade, dl.eggs_produced,
              COALESCE((
                SELECT jsonb_object_agg(inbound.grade_code, inbound.qty)
                FROM (
                  SELECT COALESCE(ib.grade_code_std, ib.quality_grade) AS grade_code,
                         SUM(ib.qty)::numeric AS qty
                  FROM inv_batches ib
                  WHERE ib.source_type = 'TEMP_PRODUCTION'
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
    const alreadyInboundByHouse = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const eggs = Math.max(0, Number(r.eggs_produced) || 0);
      reportedEggs += eggs;
      let ebg: unknown = r.eggs_by_grade;
      if (typeof ebg === 'string') {
        try { ebg = JSON.parse(ebg); } catch { ebg = null; }
      }
      const hasBreakdown = ebg && typeof ebg === 'object'
        && Object.values(ebg as Record<string, unknown>).some(qty => Number(qty) > 0);
      if (!hasBreakdown) {
        if (eggs > 0) missingBreakdownLogs += 1;
        continue;
      }
      for (const [grade, qty] of Object.entries(ebg as Record<string, unknown>)) {
        const n = Math.max(0, Number(qty) || 0);
        aggregated[grade] = (aggregated[grade] || 0) + n;
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
    };
  }

  async getDailyHenReport(date: string, scope: OrgScope = { isGlobal: true, farmCode: null, siteCode: null }) {
    // ── 鸡群查询 ──────────────────────────────────────────────
    const flockParams: any[] = [];
    // 所有在产状态：产蛋期、高峰期、下降期。
    let flockWhere = `WHERE UPPER(f.status) IN ('LAYING','PEAK','DECLINING')`;
    const flockScope = scopeWhere(scope, flockParams, 'f.');   // G98：农场/站点/公司多维并集
    if (flockScope) flockWhere += ` AND ${flockScope}`;
    const flocks = await this.entityManager.query(
      `SELECT
         f.flock_no,
         f.house_code,
         COALESCE(NULLIF(h.house_name, ''), f.house_code) AS house_name,
         f.current_qty,
         f.initial_qty,
         f.placement_date,
         f.current_lay_rate
       FROM brd_flocks f
       LEFT JOIN brd_houses h ON h.house_code = f.house_code
       ${flockWhere}
       ORDER BY f.house_code`,
      flockParams,
    );

    // ── 日报查询 ──────────────────────────────────────────────
    const logParams: any[] = [date];
    let logWhere = `WHERE dl.log_date = $1`;
    const logScope = dailyLogScopeWhere(scope, logParams); // 日志归属为空时按鸡舍权威归属兜底
    if (logScope) logWhere += ` AND ${logScope}`;
    const logs = await this.entityManager.query(
      `SELECT
         COALESCE(dl.house_code, dl.flock_no) AS house_code,
         dl.flock_no,
         SUM(dl.eggs_produced)::int           AS eggs,
         SUM(dl.mortality_qty)::int           AS mortality,
         SUM(COALESCE(dl.elimination_qty,0))::int AS elimination,
         SUM(COALESCE(dl.dirty_eggs,0))::int     AS dirty,
         SUM(COALESCE(dl.broken_eggs,0))::int    AS broken,
         SUM(COALESCE(dl.feed_consumed,0))::numeric(12,2) AS feed,
         SUM(COALESCE(dl.water_consumed,0))::numeric(12,2) AS water,
         COUNT(*)::int AS log_count,
         string_agg(DISTINCT dl.culling_reason, '；')
           FILTER (WHERE dl.culling_reason IS NOT NULL AND dl.culling_reason <> '') AS culling_reason,
         -- G27-D：mobile/henreport 显示 mortality_reason（G19-A 字段同步）
         string_agg(DISTINCT dl.mortality_reason, '；')
           FILTER (WHERE dl.mortality_reason IS NOT NULL AND dl.mortality_reason <> '') AS mortality_reason
       FROM brd_daily_logs dl
       LEFT JOIN brd_houses h ON h.house_code = dl.house_code
       LEFT JOIN brd_farms hf ON hf.farm_code = h.farm_code AND hf.status = 'ACTIVE'
       ${logWhere}
       GROUP BY COALESCE(dl.house_code, dl.flock_no), dl.flock_no`,
      logParams,
    );

    const logMap = new Map<string, (typeof logs)[0]>();
    for (const l of logs) {
      logMap.set(l.house_code, l);
      if (l.flock_no && l.flock_no !== l.house_code) logMap.set(l.flock_no, l);
    }

    const today = new Date(date);
    const rows = flocks.map((f: any) => {
      const log = logMap.get(f.house_code) ?? logMap.get(f.flock_no) ?? null;
      const eggs = Number(log?.eggs ?? 0);
      const mortality = Number(log?.mortality ?? 0);
      const elimination = Number(log?.elimination ?? 0);
      const feed = Number(log?.feed ?? 0);
      const water = Number(log?.water ?? 0);
      const currentQty = Number(f.current_qty ?? 0);
      const layRate = currentQty > 0 ? ((eggs / currentQty) * 100).toFixed(2) : '0.00';
      const placementDate = f.placement_date ? new Date(f.placement_date) : null;
      const ageDays = placementDate
        ? Math.max(0, Math.floor((today.getTime() - placementDate.getTime()) / 86400000))
        : null;
      return {
        house_code: f.house_code,
        house_name: f.house_name || f.house_code,
        flock_no: f.flock_no,
        current_qty: currentQty,
        initial_qty: Number(f.initial_qty ?? 0),
        age_days: ageDays,
        eggs,
        lay_rate: layRate,
        mortality,
        elimination,
        total_loss: mortality + elimination,
        dirty: Number(log?.dirty ?? 0),
        broken: Number(log?.broken ?? 0),
        culling_reason: log?.culling_reason ?? null,
        feed,
        water,
        has_daily_log: Number(log?.log_count ?? 0) > 0,
      };
    });

    const totals = rows.reduce(
      (acc: any, r: any) => {
        acc.current_qty += r.current_qty;
        acc.eggs += r.eggs;
        acc.mortality += r.mortality;
        acc.elimination += r.elimination;
        acc.total_loss += r.total_loss;
        acc.feed += r.feed;
        acc.water += r.water;
        if (r.has_daily_log) acc.logged_houses += 1;
        return acc;
      },
      { current_qty: 0, eggs: 0, mortality: 0, elimination: 0, total_loss: 0, feed: 0, water: 0, logged_houses: 0 },
    );
    totals.lay_rate =
      totals.current_qty > 0 ? ((totals.eggs / totals.current_qty) * 100).toFixed(2) : '0.00';
    totals.feed = Number(totals.feed.toFixed(2));
    totals.water = Number(totals.water.toFixed(2));

    return { code: 200, date, rows, totals };
  }

  async getFarmTrend(days: number, scope: OrgScope = { isGlobal: true, farmCode: null, siteCode: null }) {
    const safeDays = Math.min(Math.max(Number(days) || 7, 1), 90);

    const trendParams: any[] = [safeDays];
    let trendWhere = `WHERE dl.log_date >= (CURRENT_DATE - ($1 * 2 - 1) * INTERVAL '1 day')`;
    const trendScope = dailyLogScopeWhere(scope, trendParams);
    if (trendScope) trendWhere += ` AND ${trendScope}`;
    const rows = await this.entityManager.query(
      `SELECT
         dl.log_date::text                           AS date,
         SUM(dl.eggs_produced)::int                  AS eggs,
         SUM(dl.mortality_qty)::int                  AS mortality,
         SUM(COALESCE(dl.elimination_qty,0))::int    AS elimination,
         SUM(COALESCE(dl.feed_consumed,0))::numeric  AS feed
       FROM brd_daily_logs dl
       LEFT JOIN brd_houses h ON h.house_code = dl.house_code
       LEFT JOIN brd_farms hf ON hf.farm_code = h.farm_code AND hf.status = 'ACTIVE'
       ${trendWhere}
       GROUP BY dl.log_date
       ORDER BY dl.log_date ASC`,
      trendParams,
    );

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
    let flockWhere = `WHERE UPPER(f.status) IN ('LAYING','PEAK','DECLINING')`;
    const flockScope = scopeWhere(scope, flockParams, 'f.');   // G98：农场/站点/公司多维并集
    if (flockScope) flockWhere += ` AND ${flockScope}`;
    const flockSum = await this.entityManager.query(
      `SELECT COALESCE(SUM(f.current_qty),0)::int AS total FROM brd_flocks f ${flockWhere}`,
      flockParams,
    );
    const totalQty = Number(flockSum[0]?.total ?? 0);

    const summary = {
      current_days:    current.length,
      avg_eggs:        avg(current, 'eggs'),
      avg_mortality:   avg(current, 'mortality'),
      avg_elimination: avg(current, 'elimination'),
      avg_feed:        avg(current, 'feed'),
      lay_rate:        totalQty > 0 ? ((avg(current, 'eggs') / totalQty) * 100).toFixed(2) : '0.00',
      prev_avg_eggs:   avg(prev, 'eggs'),
      prev_lay_rate:   totalQty > 0 ? ((avg(prev, 'eggs') / totalQty) * 100).toFixed(2) : '0.00',
      total_qty:       totalQty,
    };

    return { code: 200, days: safeDays, rows: current, summary };
  }
}
