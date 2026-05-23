import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

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

/** 组织作用域 — 从 JWT storeCode 派生 */
export interface OrgScope {
  isGlobal: boolean;
  farmCode: string | null;
}

// brd_daily_logs 允许写入的列（白名单 — 任何前端伪造的列名都会被丢弃）
const ALLOWED_DAILY_COLS = new Set([
  'flock_no', 'log_date', 'shift', 'feed_consumed', 'water_consumed',
  'mortality_qty', 'eggs_produced', 'bad_eggs', 'temp', 'humidity',
  'note', 'operator', 'farm_code', 'house_code', 'egg_count',
  'updated_at', 'farm_name', 'dirty_eggs', 'broken_eggs',
  'elimination_qty', 'culling_reason',
]);

@Injectable()
export class FarmService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
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

  async submitBreedingDailyLog(body: any, scope: OrgScope = { isGlobal: true, farmCode: null }) {
    const eggs = Number(body.eggs_produced) || 0;
    const mortality = Number(body.mortality_qty) || 0;
    const flock_no = body.flock_no || body.house_code;

    // 安全校验：非全局用户只能写自己农场的数据
    if (!scope.isGlobal && scope.farmCode) {
      if (body.farm_code && body.farm_code !== scope.farmCode) {
        throw new BadRequestException('无权写入其他农场的数据');
      }
      // 自动补全 farm_code
      body.farm_code = scope.farmCode;
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

      // A4: inv_ledger 记账 — 无 PRD-EGG 批次时不阻塞日报，只记 warning
      if (eggs > 0) {
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

  async getDailyHenReport(date: string, scope: OrgScope = { isGlobal: true, farmCode: null }) {
    // ── 鸡群查询 ──────────────────────────────────────────────
    const flockParams: any[] = [];
    let flockWhere = `WHERE status IN ('LAYING','ACTIVE','laying','active')`;
    if (!scope.isGlobal && scope.farmCode) {
      flockParams.push(scope.farmCode);
      flockWhere += ` AND farm_code = $1`;
    }
    const flocks = await this.entityManager.query(
      `SELECT flock_no, house_code, current_qty, initial_qty, placement_date, current_lay_rate
       FROM brd_flocks ${flockWhere} ORDER BY house_code`,
      flockParams,
    );

    // ── 日报查询 ──────────────────────────────────────────────
    const logParams: any[] = [date];
    let logWhere = `WHERE log_date = $1`;
    if (!scope.isGlobal && scope.farmCode) {
      logParams.push(scope.farmCode);
      logWhere += ` AND farm_code = $${logParams.length}`;
    }
    const logs = await this.entityManager.query(
      `SELECT
         COALESCE(house_code, flock_no) AS house_code,
         flock_no,
         SUM(eggs_produced)::int           AS eggs,
         SUM(mortality_qty)::int           AS mortality,
         SUM(COALESCE(elimination_qty,0))::int AS elimination,
         SUM(feed_consumed)::numeric(12,2) AS feed,
         string_agg(DISTINCT culling_reason, '；')
           FILTER (WHERE culling_reason IS NOT NULL AND culling_reason <> '') AS culling_reason
       FROM brd_daily_logs
       ${logWhere}
       GROUP BY COALESCE(house_code, flock_no), flock_no`,
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
      const currentQty = Number(f.current_qty ?? 0);
      const layRate = currentQty > 0 ? ((eggs / currentQty) * 100).toFixed(2) : '0.00';
      const placementDate = f.placement_date ? new Date(f.placement_date) : null;
      const ageDays = placementDate
        ? Math.max(0, Math.floor((today.getTime() - placementDate.getTime()) / 86400000))
        : null;
      return {
        house_code: f.house_code,
        flock_no: f.flock_no,
        current_qty: currentQty,
        initial_qty: Number(f.initial_qty ?? 0),
        age_days: ageDays,
        eggs,
        lay_rate: layRate,
        mortality,
        elimination,
        total_loss: mortality + elimination,
        culling_reason: log?.culling_reason ?? null,
        feed,
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
        return acc;
      },
      { current_qty: 0, eggs: 0, mortality: 0, elimination: 0, total_loss: 0, feed: 0 },
    );
    totals.lay_rate =
      totals.current_qty > 0 ? ((totals.eggs / totals.current_qty) * 100).toFixed(2) : '0.00';
    totals.feed = Number(totals.feed.toFixed(2));

    return { code: 200, date, rows, totals };
  }

  async getFarmTrend(days: number, scope: OrgScope = { isGlobal: true, farmCode: null }) {
    const safeDays = Math.min(Math.max(Number(days) || 7, 1), 90);

    const trendParams: any[] = [safeDays];
    let trendWhere = `WHERE log_date >= (CURRENT_DATE - ($1 * 2 - 1) * INTERVAL '1 day')`;
    if (!scope.isGlobal && scope.farmCode) {
      trendParams.push(scope.farmCode);
      trendWhere += ` AND farm_code = $${trendParams.length}`;
    }
    const rows = await this.entityManager.query(
      `SELECT
         log_date::text                           AS date,
         SUM(eggs_produced)::int                  AS eggs,
         SUM(mortality_qty)::int                  AS mortality,
         SUM(COALESCE(elimination_qty,0))::int    AS elimination,
         SUM(COALESCE(feed_consumed,0))::numeric  AS feed
       FROM brd_daily_logs
       ${trendWhere}
       GROUP BY log_date
       ORDER BY log_date ASC`,
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

    // flock 存栏数也按农场过滤
    const flockParams: any[] = [];
    let flockWhere = `WHERE status IN ('LAYING','ACTIVE','laying','active')`;
    if (!scope.isGlobal && scope.farmCode) {
      flockParams.push(scope.farmCode);
      flockWhere += ` AND farm_code = $1`;
    }
    const flockSum = await this.entityManager.query(
      `SELECT COALESCE(SUM(current_qty),0)::int AS total FROM brd_flocks ${flockWhere}`,
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
