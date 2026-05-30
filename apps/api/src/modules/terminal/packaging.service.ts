import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { randomBytes } from 'crypto';

/**
 * PackagingService — V3 包装模块业务服务
 * 覆盖：集蛋班次、分级任务、包装任务、日报、操作员、规格配置
 */
@Injectable()
export class PackagingService {
  constructor(
    @InjectEntityManager()
    private readonly em: EntityManager,
  ) {}

  // ─── 包装规格配置 ────────────────────────────────────────────────────────────
  async getPackSpecConfig() {
    // [Fix Pack 1 — CRITICAL] 改为从 packaging_specs 主数据表读取，
    // 不再读取 sys_dict PKG_PACK_SPEC（原 dict_value 字段不存在，导致空数据）
    try {
      const rows = await this.em.query(
        `SELECT spec_code AS name, spec_name AS label, qty_per_unit AS qty
         FROM packaging_specs WHERE status = 'ACTIVE'
         ORDER BY sort_order ASC`,
      );
      const specs = rows.length > 0
        ? rows.map((r: any) => ({ name: r.label || r.name, qty: Number(r.qty) || 30 }))
        : [
            { name: '30枚/托', qty: 30 },
            { name: '20枚/托', qty: 20 },
            { name: '6枚/盒',  qty: 6  },
            { name: '10枚/盒', qty: 10 },
          ];
      return { code: 200, specs };
    } catch {
      return { code: 200, specs: [
        { name: '30枚/托', qty: 30 }, { name: '20枚/托', qty: 20 },
        { name: '6枚/盒', qty: 6 }, { name: '10枚/盒', qty: 10 },
      ]};
    }
  }

  // ─── 操作员列表 ──────────────────────────────────────────────────────────────
  // V3 真实 schema: sys_user (单数) + 角色通过 sys_user_role/sys_role JOIN
  // status 是 smallint (1=ACTIVE, 0=DISABLED)；real_name 列无 _zh 后缀；role_code 不在 sys_user 上
  async getOperators() {
    const rows = await this.em.query(
      `SELECT u.username,
              u.real_name AS real_name_zh,
              r.role_name_zh
       FROM sys_user u
       LEFT JOIN sys_user_role ur ON ur.user_id = u.user_id AND ur.is_primary = TRUE
       LEFT JOIN sys_role r       ON r.role_id  = ur.role_id
       WHERE u.status = 1
         AND (r.role_code IN ('ROLE_ADMIN','ROLE_PKG_MGR','ROLE_PKG_OP','ROLE_FARM_MGR','ROLE_GRADER')
              OR u.username = 'admin')
       ORDER BY u.real_name ASC
       LIMIT 200`,
    );
    return { code: 200, data: rows };
  }

  // ─── 集蛋班次 ────────────────────────────────────────────────────────────────
  async getShifts(query: Record<string, string>) {
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      if (query.date) {
        params.push(query.date);
        conditions.push(`DATE(shift_date) = $${params.length}`);
      }
      if (query.status && query.status !== 'all') {
        params.push(query.status);
        conditions.push(`status = $${params.length}`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = await this.em.query(
        `SELECT * FROM pkg_shifts ${where} ORDER BY created_at DESC LIMIT 100`,
        params,
      );
      return { code: 200, data: rows };
    } catch {
      return { code: 200, data: [] };
    }
  }

  async createShift(body: any, userId: number) {
    try {
      const shiftNo = `SHIFT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`;
      await this.em.query(
        `INSERT INTO pkg_shifts (shift_no, house_code, shift_type, operator, shift_date, status, created_by)
         VALUES ($1,$2,$3,$4,$5,'PENDING',$6)`,
        [shiftNo, body.house_code, body.shift_type || 'AM', body.operator, body.shift_date || new Date().toISOString().slice(0,10), userId],
      );
      const row = await this.em.query(`SELECT * FROM pkg_shifts WHERE shift_no = $1`, [shiftNo]);
      return { code: 200, data: row[0], msg: '班次创建成功' };
    } catch (e: any) {
      return { code: 500, msg: e?.message || '创建失败' };
    }
  }

  /**
   * 集蛋班次完成 — 完整复刻 V2 phoenix-backend/src/routes/packaging.js#/shifts/:id/complete 5 步事务
   * ① UPDATE pkg_shifts → DONE
   * ② INSERT/UPDATE brd_daily_logs（产蛋日报，按日期+鸡舍+班次去重累加）
   * ③ INSERT mst_products PRD-EGG-RAW（鲜蛋原料产品，幂等）
   * ④ INSERT inv_batches 鲜蛋批次 + inv_ledger EGG_IN 流水（保质 7 天）
   * ⑤ INSERT pkg_tasks 分级任务（task_no=GRADE-..., status=IN_PROGRESS,
   *    source_item="鸡舍名·班次"，触发分级作业页显示）
   */
  async completeShift(id: number, body: any, userId: number) {
    const qty    = Number(body.total_qty ?? body.eggs_collected ?? 0);
    const dirty  = Math.max(0, Number(body.dirty_qty  ?? body.dirty_eggs  ?? 0));
    const broken = Math.max(0, Number(body.broken_qty ?? body.broken_eggs ?? 0));
    const badQty = dirty + broken;
    if (qty <= 0)          return { code: 400, msg: '集蛋数量必须大于 0' };
    if (badQty > qty)      return { code: 400, msg: `脏蛋+破损 ${badQty} 枚超过总数 ${qty} 枚` };
    const goodQty = Math.max(0, qty - badQty);
    const today   = new Date().toISOString().slice(0, 10);

    // 事务外读取 shift 信息
    const shifts = await this.em.query(`SELECT * FROM pkg_shifts WHERE id = $1`, [id]);
    const shift = shifts[0];
    if (!shift) return { code: 404, msg: '集蛋班次不存在' };
    if (shift.status === 'DONE' || shift.status === 'COMPLETED') {
      return { code: 400, msg: '该班次已完成，请勿重复提交' };
    }
    const houseCode = shift.house_code  || 'UNKNOWN';
    // shift_date may be returned as a JS Date object by node-postgres — use toISOString() to get YYYY-MM-DD
    const shiftDate = shift.shift_date
      ? (shift.shift_date instanceof Date
          ? shift.shift_date.toISOString().slice(0, 10)
          : String(shift.shift_date).slice(0, 10))
      : today;

    // 班次显示名：shift_time 已是中文标签优先；为空则查 sys_dict.PKG_SHIFT 用 dict_code 反查中文 label
    // 避免 source_item 显示 "NIGHT" 这种英文 code，给操作员看的应该是 "夜班"
    let shiftTime: string = shift.shift_time || '';
    if (!shiftTime) {
      const code = shift.shift_type || shift.shift_name || '';
      if (code) {
        try {
          const d = await this.em.query(
            `SELECT dict_label_zh FROM sys_dict
             WHERE dict_type='PKG_SHIFT' AND dict_code=$1 AND status='ACTIVE'
             LIMIT 1`,
            [code],
          );
          shiftTime = d[0]?.dict_label_zh || code;
        } catch {
          shiftTime = code;
        }
      }
    }
    if (!shiftTime) shiftTime = '早班';

    // 鸡舍中文名（用于分级任务源描述）
    let houseName = houseCode;
    try {
      const h = await this.em.query(
        `SELECT house_name FROM brd_houses WHERE house_code = $1 LIMIT 1`,
        [houseCode],
      );
      if (h[0]?.house_name) houseName = h[0].house_name;
    } catch { /* brd_houses 不存在则用 houseCode */ }

    const ts5 = String(Date.now()).slice(-5);
    const dateKey = shiftDate.replace(/-/g, '');
    const batchNo = `EGG-${dateKey}-${houseCode}-${ts5}`;
    const taskNo  = `GRADE-${dateKey}-${houseCode}-${ts5}`;
    const expireDate = new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 10);

    try {
      // 鲜蛋原料产品幂等创建（无 UNIQUE 约束，用 WHERE NOT EXISTS 替代 ON CONFLICT）
      await this.em.query(
        `INSERT INTO mst_products (product_code, product_name_zh, product_name_lo,
            unit_zh, unit_lo, shelf_life_days, price_retail, price_wholesale, status)
         SELECT 'PRD-EGG-RAW', '鲜蛋原料（未分级）', 'ໄຂ່ສົດດິບ',
                '枚', 'ໜ່ວຍ', 7, 0, 0, 'ACTIVE'
         WHERE NOT EXISTS (SELECT 1 FROM mst_products WHERE product_code = 'PRD-EGG-RAW')`,
      ).catch(() => { /* mst_products schema 兼容性差异静默 */ });

      // ── 事务：5 步原子提交 ──────────────────────────────────────
      await this.em.transaction(async (mgr) => {
        // ① pkg_shifts → DONE
        // 显式 ::int 类型 cast，避免 V2 老列(TEXT) + V3 新列(INT) 让 pg 类型推断失败
        // completed_time 是 V2 历史 TEXT 列，用 to_char 而非 NOW() 防类型不匹配
        await mgr.query(
          `UPDATE pkg_shifts
           SET status='DONE',
               total_qty=$1::int, dirty_qty=$2::int, broken_qty=$3::int,
               qualified_qty=$4::int,
               eggs_collected=$1::int, dirty_eggs=$2::int, broken_eggs=$3::int, bad_eggs=$5::int,
               completed_at=NOW(),
               completed_time=to_char(NOW(),'YYYY-MM-DD HH24:MI:SS'),
               updated_at=NOW(), updated_by=$6
           WHERE id=$7`,
          [qty, dirty, broken, goodQty, badQty, userId || null, id],
        );

        // ② brd_daily_logs（同日+鸡舍+班次去重累加）
        // 用 SAVEPOINT 隔离：列差异 / FK 缺失等错误不污染主事务
        await mgr.query('SAVEPOINT sp_daily_logs');
        try {
          const existed = await mgr.query(
            `SELECT id FROM brd_daily_logs
             WHERE log_date=$1 AND shift=$2 AND flock_no=$3
             LIMIT 1`,
            [shiftDate, shiftTime, houseCode],
          );
          if (existed[0]) {
            await mgr.query(
              `UPDATE brd_daily_logs
               SET eggs_produced = COALESCE(eggs_produced,0) + $1::int,
                   bad_eggs      = COALESCE(bad_eggs,0)      + $2::int
               WHERE id = $3`,
              [qty, badQty, existed[0].id],
            );
          } else {
            await mgr.query(
              `INSERT INTO brd_daily_logs
                 (flock_no, log_date, shift, eggs_produced, bad_eggs,
                  feed_consumed, water_consumed, mortality_qty, operator, note,
                  house_code)
               VALUES ($1,$2,$3,$4::int,$5::int,0,0,0,$6,$7,$1)`,
              [
                houseCode, shiftDate, shiftTime, qty, badQty,
                String(userId || 'SYS'),
                `集蛋作业台自动写入 | 班次:${shift.shift_no || id} | 合格:${goodQty}枚`,
              ],
            );
          }
          await mgr.query('RELEASE SAVEPOINT sp_daily_logs');
        } catch (e: any) {
          await mgr.query('ROLLBACK TO SAVEPOINT sp_daily_logs');
          console.warn('[completeShift][WARN] brd_daily_logs skipped:', e?.message);
        }

        // ③ inv_batches 鲜蛋批次（V3 实际 schema 仅 batch_no/product_code/qty/expire_date/store_code/warehouse_code）
        await mgr.query('SAVEPOINT sp_inv_batches');
        try {
          // batch_no 带毫秒级时间戳后缀天然唯一；表上无 UNIQUE 约束，不需要 ON CONFLICT
          await mgr.query(
            `INSERT INTO inv_batches
               (batch_no, product_code, qty, expire_date, store_code, warehouse_code)
             VALUES ($1, 'PRD-EGG-RAW', $2::int, $3, 'FACTORY', 'WMS-VTE-MAIN')`,
            [batchNo, goodQty, expireDate],
          );
          await mgr.query('RELEASE SAVEPOINT sp_inv_batches');
        } catch (e: any) {
          await mgr.query('ROLLBACK TO SAVEPOINT sp_inv_batches');
          console.warn('[completeShift][WARN] inv_batches skipped:', e?.message);
        }

        // ④ inv_ledger EGG_IN 流水
        await mgr.query('SAVEPOINT sp_inv_ledger');
        try {
          await mgr.query(
            `INSERT INTO inv_ledger
               (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
             VALUES ($1, 'EGG_IN', $2::int, $3, 'FACTORY', $4, $5)`,
            [
              batchNo, goodQty, String(userId || 'SYS'),
              shift.shift_no || `SHIFT-${id}`,
              `集蛋入库 | 鸡舍:${houseCode} | ${shiftTime} | 合格:${goodQty}枚 破损:${badQty}枚`,
            ],
          );
          await mgr.query('RELEASE SAVEPOINT sp_inv_ledger');
        } catch (e: any) {
          await mgr.query('ROLLBACK TO SAVEPOINT sp_inv_ledger');
          console.warn('[completeShift][WARN] inv_ledger skipped:', e?.message);
        }

        // ⑤ pkg_tasks 分级任务（V2 兼容：GRADE-... + source_item + IN_PROGRESS）
        // 这一步是最关键的（决定分级作业页能不能看到新任务）；用 SAVEPOINT 保证即使
        // 某列类型差异/约束冲突也至少把 pkg_shifts 的状态 commit 掉，操作员看到"已完成"
        await mgr.query('SAVEPOINT sp_pkg_tasks');
        try {
          // task_no 由毫秒时间戳+house_code 组合天然唯一，pkg_tasks 表无 UNIQUE 约束
          // 不能用 ON CONFLICT；同一 shift 二次提交会被外层 status='DONE' 校验拦截
          await mgr.query(
            `INSERT INTO pkg_tasks
               (task_no, batch_no, source_item, plan_qty, packed_qty,
                status, task_type, shift_id, house_code,
                start_time, created_at, updated_at, created_by)
             VALUES ($1, $2, $3, $4::int, 0,
                     'IN_PROGRESS', 'GRADING', $5::bigint, $6,
                     NOW(), NOW(), NOW(), $7)`,
            [taskNo, batchNo, `${houseName} · ${shiftTime}`, goodQty, id, houseCode, userId || null],
          );
          await mgr.query('RELEASE SAVEPOINT sp_pkg_tasks');
        } catch (e: any) {
          await mgr.query('ROLLBACK TO SAVEPOINT sp_pkg_tasks');
          console.error('[completeShift][ERR] pkg_tasks INSERT failed:', e?.message);
          // 这一步失败要往外抛，让整个 complete 操作显式报错而不是给用户假成功
          throw e;
        }
      });

      return {
        code: 200,
        msg: `集蛋提交成功！合格 ${goodQty} 枚已入库，分级任务 ${taskNo} 已生成`,
        batch_no:       batchNo,
        task_no:        taskNo,
        eggs_collected: qty,
        bad_eggs:       badQty,
        good_eggs:      goodQty,
      };
    } catch (e: any) {
      console.error('[completeShift][ERR]', e?.message, e?.stack);
      return { code: 500, msg: e?.message || '操作失败' };
    }
  }

  /**
   * 集蛋班次"申请更正"重开 — 把已 DONE 的 shift 拨回 PENDING 允许重录
   *
   * 旧实现 (V2/V3 早期) 只 UPDATE pkg_shifts.status，**不清理 completeShift 已产生的副作用**：
   *   - pkg_tasks GRADE-... 行（继续躺在分级列表里）
   *   - inv_batches EGG-... 行（继续占库存）
   *   - inv_ledger EGG_IN 流水（继续累计产量）
   * 操作员重新提交时，completeShift 又会插入第二份 → 分级列表出现 2 条重复任务。
   *
   * 本次修复：reopen 必须在同一事务内完成下列清理：
   *   ① 把此 shift 的活跃 pkg_tasks 全部置 CANCELLED（保留行做审计；
   *      getGradingTasks 已过滤 CANCELLED，不会在列表显示）
   *   ② 对每个被作废的 batch_no 写一条 EGG_REVERSED 反向流水（审计可追溯）
   *   ③ 把 inv_batches.qty 清零（避免库存被双计；记录本身保留）
   *   ④ UPDATE pkg_shifts → PENDING
   */
  async reopenShift(id: number, body: any, userId: number) {
    try {
      await this.em.transaction(async (mgr) => {
        // ① 找此班次关联的活跃 GRADING 任务
        const tasks: Array<{ id: number; task_no: string; batch_no: string; plan_qty: number }> =
          await mgr.query(
            `SELECT id, task_no, batch_no, plan_qty
               FROM pkg_tasks
              WHERE shift_id = $1::bigint
                AND COALESCE(status, '') <> 'CANCELLED'
                AND COALESCE(task_type, 'GRADING') = 'GRADING'`,
            [id],
          );

        // ② 批量置 CANCELLED
        if (tasks.length > 0) {
          await mgr.query(
            `UPDATE pkg_tasks
                SET status = 'CANCELLED',
                    updated_at = NOW()
              WHERE shift_id = $1::bigint
                AND COALESCE(status, '') <> 'CANCELLED'
                AND COALESCE(task_type, 'GRADING') = 'GRADING'`,
            [id],
          );
        }

        // ③ 对每条被作废的 batch 做反向流水 + qty 清零
        for (const t of tasks) {
          if (!t.batch_no) continue;
          await mgr.query('SAVEPOINT sp_reopen_void');
          try {
            await mgr.query(
              `INSERT INTO inv_ledger
                 (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
               VALUES ($1, 'EGG_REVERSED', -$2::int, $3, 'FACTORY', $4, $5)`,
              [
                t.batch_no,
                Number(t.plan_qty) || 0,
                String(userId || 'SYS'),
                `SHIFT-${id}-REOPEN`,
                `集蛋班次重开作废 | 原任务=${t.task_no} | 原因=${body.reason || '未填'}`,
              ],
            );
            await mgr.query(
              `UPDATE inv_batches SET qty = 0, updated_at = NOW() WHERE batch_no = $1`,
              [t.batch_no],
            );
            await mgr.query('RELEASE SAVEPOINT sp_reopen_void');
          } catch (e: any) {
            await mgr.query('ROLLBACK TO SAVEPOINT sp_reopen_void');
            console.warn('[reopenShift][WARN] void batch skipped:', t.batch_no, e?.message);
          }
        }

        // ④ 班次状态拨回
        await mgr.query(
          `UPDATE pkg_shifts
              SET status='PENDING',
                  reopen_reason=$1,
                  updated_by=$2,
                  updated_at=NOW()
            WHERE id=$3`,
          [body.reason || '', userId, id],
        );
      });

      return {
        code: 200,
        msg: '已重开班次，原任务已作废，可重新录入',
      };
    } catch (e: any) {
      console.error('[reopenShift][ERR]', e?.message, e?.stack);
      return { code: 500, msg: e?.message || '操作失败' };
    }
  }

  // ─── 分级任务 ────────────────────────────────────────────────────────────────
  async getGradingTasks(query: Record<string, string>) {
    try {
      // P0-4: 默认只查分级任务（PACKING 任务由 getPackagingTasks 走）+ 排除取消
      const conditions: string[] = [
        `(t.task_type IS NULL OR t.task_type = 'GRADING')`,
        `(t.status IS NULL OR t.status <> 'CANCELLED')`,
      ];
      const params: any[] = [];
      if (query.status && query.status !== 'all') {
        params.push(query.status);
        conditions.push(`t.status = $${params.length}`);
      }
      if (query.date && query.date !== 'all') {
        params.push(query.date);
        conditions.push(`DATE(t.created_at) = $${params.length}`);
      }
      const where = `WHERE ${conditions.join(' AND ')}`;
      // P0-4: ORDER BY 按业务状态优先级 — 进行中 → 待分级 → 已完成；同组内 updated_at 倒序
      const rows = await this.em.query(
        `SELECT t.*, s.house_code AS src_house, s.shift_type, s.shift_date
         FROM pkg_tasks t
         LEFT JOIN pkg_shifts s ON s.id = t.shift_id
         ${where}
         ORDER BY
           CASE
             WHEN UPPER(COALESCE(t.status,'')) = 'IN_PROGRESS' THEN 0
             WHEN UPPER(COALESCE(t.status,'')) = 'PENDING'     THEN 1
             ELSE 2
           END,
           COALESCE(t.updated_at::timestamp, t.created_at) DESC,  -- updated_at 是 timestamptz / created_at 是 timestamp，需统一
           t.id DESC
         LIMIT 200`,
        params,
      );
      // 读取异常原因字典
      let anomalyReasons: any[] = [];
      try {
        anomalyReasons = await this.em.query(
          `SELECT dict_code AS code, dict_label_zh AS label
           FROM sys_dict WHERE dict_type = 'PKG_ANOMALY_REASON' AND status = 'ACTIVE'
           ORDER BY sort_no`,
        );
      } catch { /* ignore */ }
      return { code: 200, data: rows, anomalyReasons };
    } catch (e: any) {
      console.error('[getGradingTasks][ERR]', e?.message, e?.stack);
      return { code: 200, data: [], anomalyReasons: [] };
    }
  }

  /**
   * 分级结果提交 — 复刻 V2 phoenix-backend tasks/:no/grade 逻辑
   * ① UPDATE pkg_tasks：grade_results JSON + anomaly_reason + 预分拣三项 + status=GRADED
   * ② 对每个非零等级 INSERT inv_batches（产品码 PRD-EGG-{code}, 单独批次号 BAT-...)
   * ③ 对每个等级 INSERT inv_ledger EGG_GRADED 流水（关联 ref_no=原 EGG- 批次号）
   * ④ INSERT 包装任务 PACK-... (保留 V3 原有逻辑)
   * ⑤ 返回 grade_batches: [{ grade, qty, batch_no }] 供前端展示批次生成清单
   */
  async submitGrade(taskId: string, body: any, userId: number) {
    const rawResults = body.grade_results;
    const gr: Record<string, number> = (() => {
      if (!rawResults) return {};
      if (typeof rawResults === 'object') return rawResults as Record<string, number>;
      try { return JSON.parse(rawResults); } catch { return {}; }
    })();
    const gradeResults = typeof rawResults === 'object'
      ? JSON.stringify(rawResults)
      : (rawResults || '{}');
    const presortXl    = Math.max(0, Number(body.presort?.xl_qty    ?? 0));
    const presortDirty = Math.max(0, Number(body.presort?.dirty_qty ?? 0));
    const presortBrk   = Math.max(0, Number(body.presort?.broken_qty ?? 0));

    // 取原任务（拿原 batch_no + house_code 用于后续 inv_batches 关联）
    const tasks = await this.em.query(
      `SELECT * FROM pkg_tasks WHERE task_no = $1 OR id::text = $1 LIMIT 1`,
      [taskId],
    );
    if (!tasks[0]) return { code: 404, msg: '分级任务不存在' };
    const task = tasks[0];
    const origBatchNo = task.batch_no || '';
    const houseCode   = task.house_code || 'UNKNOWN';
    const today       = new Date().toISOString().slice(0, 10);
    const dateKey     = today.replace(/-/g, '');
    const expireDate  = new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 10);

    const gradeBatches: Array<{ grade: string; qty: number; batch_no: string; status?: string }> = [];

    // ── P0-1: 计算 4 个派生字段（V2 同款语义，让 done 卡片数字不再是 0） ───
    // packed_qty       = Σ grade_results          (实际分级出货量)
    // breakage_qty     = Σ 非可售等级 + 预分拣破损 (破损/不可售总量)
    // breakage_rate    = breakage_qty / plan_qty   (破损率，分母用计划量)
    // discrepancy_qty  = plan_qty - packed - presortTotal (差额；正=少 负=多)
    const packedQty = Object.values(gr).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0);
    const presortTotal = presortXl + presortDirty + presortBrk;
    // [Fix Pack 1 — HIGH-4] 从 product_grades 主数据表读取非可售等级，
    // 不再读取 sys_dict PKG_EGG_GRADE（已迁移至 product_grades.is_saleable）
    let nonSaleableCodes = new Set<string>();
    try {
      const gradeRows: Array<{ grade_code: string; is_saleable: boolean }> = await this.em.query(
        `SELECT grade_code, is_saleable FROM product_grades WHERE status = 'ACTIVE'`,
      );
      for (const r of gradeRows) {
        if (!r.is_saleable) {
          nonSaleableCodes.add(r.grade_code);
        }
      }
    } catch { /* product_grades 不可用时 nonSaleable 为空，breakage 只计预分拣破损 */ }
    const nonSaleableQty = Object.entries(gr).reduce(
      (s, [code, v]) => s + (nonSaleableCodes.has(code) ? Math.max(0, Number(v) || 0) : 0),
      0,
    );
    const breakageQty = nonSaleableQty + presortBrk;
    const planQty = Math.max(0, Number(task.plan_qty) || 0);
    const breakageRate = planQty > 0 ? breakageQty / planQty : 0;
    const discrepancyQty = planQty - packedQty - presortTotal;  // 正=少 负=多

    try {
      await this.em.transaction(async (mgr) => {
        // ① UPDATE pkg_tasks（列名用实际 V3 schema 的 _qty 后缀）
        //    P0-1 补齐 packed_qty / breakage_qty / breakage_rate / discrepancy_qty
        await mgr.query(
          `UPDATE pkg_tasks SET
             grade_results       = $1,
             anomaly_reason      = $2,
             presort_xl_qty      = $3::int,
             presort_dirty_qty   = $4::int,
             presort_broken_qty  = $5::int,
             packed_qty          = $6::int,
             breakage_qty        = $7::int,
             breakage_rate       = $8::numeric,
             discrepancy_qty     = $9::int,
             status              = 'DONE',
             graded_at           = NOW(),
             graded_by           = $10,
             updated_at          = NOW()
           WHERE task_no = $11 OR id::text = $11`,
          [gradeResults, body.anomaly_reason || null, presortXl, presortDirty, presortBrk,
           packedQty, breakageQty, breakageRate, discrepancyQty, userId || null, taskId],
        );

        // ② + ③ 对每个非零等级生成 inv_batches + inv_ledger（V2 同款行为）
        // V2 fidelity: 非可售等级 (saleable=false) → status=QUARANTINE qty_available=0
        // 食品安全：破损/不合格蛋必须可追溯但不可流入销售
        let counter = 0;
        for (const [gradeCode, qtyValue] of Object.entries(gr)) {
          const qty = Math.max(0, Number(qtyValue) || 0);
          if (qty === 0) continue;
          counter++;
          // P1-3: batch_no 加 4 字节 hex 随机后缀，毫秒级循环也不会重复
          const newBatchNo = `BAT-${dateKey}-${houseCode}-G${gradeCode}-${String(Date.now()).slice(-4)}${counter}-${randomBytes(2).toString('hex')}`;
          const productCode = `PRD-EGG-${gradeCode}`;
          const isQuarantine = nonSaleableCodes.has(gradeCode);
          const batchStatus = isQuarantine ? 'QUARANTINE' : 'AVAILABLE';
          const qtyAvailable = isQuarantine ? 0 : qty;

          await mgr.query('SAVEPOINT sp_grade_batch');
          try {
            await mgr.query(
              `INSERT INTO inv_batches
                 (batch_no, product_code, qty, qty_available, status, expire_date, store_code, warehouse_code)
               VALUES ($1, $2, $3::int, $4::int, $5, $6, 'FACTORY', 'WMS-VTE-MAIN')`,
              [newBatchNo, productCode, qty, qtyAvailable, batchStatus, expireDate],
            );
            await mgr.query(
              `INSERT INTO inv_ledger
                 (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
               VALUES ($1, $2, $3::int, $4, 'FACTORY', $5, $6)`,
              [
                newBatchNo,
                isQuarantine ? 'EGG_GRADED_QUARANTINE' : 'EGG_GRADED',
                qty, String(userId || 'SYS'),
                origBatchNo || taskId,
                isQuarantine
                  ? `分级隔离 from ${origBatchNo} | 等级${gradeCode}(不可售) | ${qty}枚`
                  : `分级入库 from ${origBatchNo} | 等级${gradeCode} | ${qty}枚`,
              ],
            );
            await mgr.query('RELEASE SAVEPOINT sp_grade_batch');
            gradeBatches.push({ grade: gradeCode, qty, batch_no: newBatchNo, status: batchStatus });
          } catch (e: any) {
            await mgr.query('ROLLBACK TO SAVEPOINT sp_grade_batch');
            console.warn(`[submitGrade][WARN] grade ${gradeCode} batch skipped:`, e?.message);
          }
        }

        // P0-5: 移除自动建 PACKING 任务的逻辑 —
        //   V2 不在分级提交时自动创建包装任务（包装是独立流程，按需手动开任务）。
        //   旧实现会在 pkg_tasks 里塞 task_type='PACKING' 的 PENDING 行，污染分级列表
        //   （前端无 task_type 过滤）。现在 getGradingTasks 也加了 task_type='GRADING' 兜底。
      });

      return {
        code: 200,
        msg: `分级结果提交成功，已生成 ${gradeBatches.length} 个等级批次`,
        grade_batches: gradeBatches,
      };
    } catch (e: any) {
      console.error('[submitGrade][ERR]', e?.message, e?.stack);
      return { code: 500, msg: e?.message || '提交失败' };
    }
  }

  // ─── 包装任务 ────────────────────────────────────────────────────────────────
  async getPackagingTasks(query: Record<string, string>) {
    try {
      const rows = await this.em.query(
        `SELECT t.*, s.house_code AS src_house, s.shift_date
         FROM pkg_tasks t
         LEFT JOIN pkg_shifts s ON s.id = t.shift_id
         WHERE t.task_type = 'PACKING' AND t.status IN ('PENDING','IN_PROGRESS')
         ORDER BY t.created_at ASC
         LIMIT 100`,
      );
      // 查尾数任务
      const remainderTasks = await this.em.query(
        `SELECT * FROM pkg_tasks
         WHERE task_type = 'REMAINDER' AND status = 'PENDING'
         ORDER BY created_at DESC LIMIT 50`,
      ).catch(() => []);
      return { code: 200, data: rows, remainderTasks };
    } catch {
      return { code: 200, data: [], remainderTasks: [] };
    }
  }

  async packComplete(taskId: string, body: any, userId: number) {
    try {
      await this.em.query(
        `UPDATE pkg_tasks SET
           packed_qty   = $1,
           output_qty   = $2,
           pack_spec    = $3,
           status       = 'COMPLETED',
           completed_at = NOW(),
           completed_by = $4
         WHERE task_no = $5 OR id::text = $5`,
        [body.packed_qty, body.output_qty, body.pack_spec, userId, taskId],
      );
      // A1 修正：原 INSERT 用了 inv_batches 不存在的列 (sku_code / pack_type / grading_date / status)
      //          → SQL 必失败但 catch 静默吞错 → 用户看似包装成功实际仓库零库存。
      // B4 修正：按 grade_results 拆分多条 inv_batches，不再把整个 JSON 塞 sku_code 丢失多等级信息。
      // V2 fidelity:
      //   - 非可售等级 (saleable=false) → 写 QUARANTINE 隔离 batch (qty_available=0)
      //   - packComplete 完成后自动创建 wms_inbound 任务，等待仓库验收上架
      const packBatches: Array<{ batch_no: string; qty: number; status: string }> = [];
      try {
        const task = await this.em.query(
          `SELECT task_no, batch_no, grade_results, house_code FROM pkg_tasks
           WHERE task_no = $1 OR id::text = $1 LIMIT 1`,
          [taskId],
        );
        if (task[0]) {
          const gr: Record<string, number> = (() => {
            const v = task[0].grade_results;
            if (!v) return {};
            try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return {}; }
          })();
          const houseCode = task[0].house_code || 'UNKNOWN';
          const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const expireDate = new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 10);

          // [Fix Pack 1 — HIGH-4] 从 product_grades 主数据表读取非可售等级
          let packNonSaleable = new Set<string>();
          try {
            const gradeRows: Array<{ grade_code: string; is_saleable: boolean }> = await this.em.query(
              `SELECT grade_code, is_saleable FROM product_grades WHERE status = 'ACTIVE'`,
            );
            for (const r of gradeRows) {
              if (!r.is_saleable) {
                packNonSaleable.add(r.grade_code);
              }
            }
          } catch { /* product_grades 不可用时视为全部可售 */ }

          const grades = Object.entries(gr).filter(([, v]) => Number(v) > 0);
          if (grades.length === 0) {
            // 无等级明细 → 用 packed_qty 整体入一条 (默认 AVAILABLE)
            const batchNo = `PACK-${dateKey}-${houseCode}-${String(Date.now()).slice(-4)}-${randomBytes(2).toString('hex')}`;
            const totalQty = Number(body.packed_qty) || 0;
            await this.em.query(
              `INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, expire_date, store_code, warehouse_code)
               VALUES ($1, 'PRD-EGG-PACKED', $2::int, $2::int, 'AVAILABLE', $3, 'FACTORY', 'WMS-VTE-MAIN')`,
              [batchNo, totalQty, expireDate],
            );
            packBatches.push({ batch_no: batchNo, qty: totalQty, status: 'AVAILABLE' });
          } else {
            // 多等级 → 拆多条 inv_batches + 每条配一条 inv_ledger PACK_DONE 流水
            // 注：packComplete 主流程不在 transaction() 内（外层只有 UPDATE pkg_tasks 一条），
            //     所以这里不能用 SAVEPOINT（会报 "can only be used in transaction blocks"）。
            //     改为 per-grade try/catch — 单等级失败不影响其它等级。
            for (const [gradeCode, qtyValue] of grades) {
              const qty = Math.max(0, Number(qtyValue) || 0);
              if (qty === 0) continue;
              const isQuarantine = packNonSaleable.has(gradeCode);
              const batchStatus = isQuarantine ? 'QUARANTINE' : 'AVAILABLE';
              const qtyAvailable = isQuarantine ? 0 : qty;
              const batchNo = `PACK-${dateKey}-${houseCode}-G${gradeCode}-${String(Date.now()).slice(-4)}-${randomBytes(2).toString('hex')}`;
              try {
                await this.em.query(
                  `INSERT INTO inv_batches
                     (batch_no, product_code, qty, qty_available, status, expire_date, store_code, warehouse_code)
                   VALUES ($1, $2, $3::int, $4::int, $5, $6, 'FACTORY', 'WMS-VTE-MAIN')`,
                  [batchNo, `PRD-EGG-${gradeCode}-PACK`, qty, qtyAvailable, batchStatus, expireDate],
                );
                await this.em.query(
                  `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
                   VALUES ($1, $2, $3::int, $4, 'FACTORY', $5, $6)`,
                  [
                    batchNo,
                    isQuarantine ? 'PACK_DONE_QUARANTINE' : 'PACK_DONE',
                    qty, String(userId || 'SYS'),
                    task[0].task_no || taskId,
                    isQuarantine
                      ? `包装隔离 等级${gradeCode}(不可售) ${qty}枚`
                      : `包装入库 等级${gradeCode} ${qty}枚`,
                  ],
                );
                packBatches.push({ batch_no: batchNo, qty, status: batchStatus });
              } catch (e: any) {
                console.warn('[packComplete][WARN] pack batch skipped:', gradeCode, e?.message);
              }
            }
          }

          // V2 fidelity: 包装完结 → 自动建 wms_inbound PENDING 任务，等待仓库上架收货
          // 只对 AVAILABLE 批次建任务（QUARANTINE 不进 WMS 主流通）
          const availableBatches = packBatches.filter(b => b.status === 'AVAILABLE');
          if (availableBatches.length > 0) {
            const wmsTaskNo = `WMS-IB-${task[0].task_no || taskId}-${randomBytes(2).toString('hex')}`;
            const totalAvailQty = availableBatches.reduce((s, b) => s + b.qty, 0);
            try {
              await this.em.query(
                `INSERT INTO wms_inbound (task_no, status, warehouse_code, type, item, qty, store_code, operator, created_at)
                 VALUES ($1, 'PENDING', 'WMS-VTE-MAIN', 'PACKING', $2, $3::int, 'ALL', $4, now())`,
                [wmsTaskNo, `PKG-${task[0].task_no}-完成入库`, totalAvailQty, String(userId || 'SYS')],
              );
            } catch (e: any) {
              console.warn('[packComplete][WARN] wms_inbound 自建跳过:', e?.message);
            }
          }
        }
      } catch (e: any) {
        // 不再静默吞错 — 上次审计就是这种 catch {} 把列错误 bug 埋了 N 个月
        console.error('[packComplete][ERR] inv_batches write failed:', e?.message);
      }
      return { code: 200, msg: '包装结单成功', data: { pack_batches: packBatches } };
    } catch (e: any) {
      return { code: 500, msg: e?.message || '结单失败' };
    }
  }

  async mergeRemainder(body: any, userId: number) {
    try {
      // A5 修正：旧版用 grade_results::text LIKE '%A%' 当过滤条件 → 会误撞 AAA/AA，把不该合并的合并掉。
      //         改为 jsonb_exists：等级码必须是 grade_results 这个 JSON object 的 KEY 才命中。
      //         同时把 UPDATE ... IN (${ids}) 字符串拼接改为参数化数组，杜绝任何 SQL 注入隐患。
      const gradeCode = String(body.grade || '').trim();
      if (!gradeCode) return { code: 400, msg: 'grade 参数缺失' };
      const rems = await this.em.query(
        `SELECT id, remainder_qty FROM pkg_tasks
         WHERE task_type='REMAINDER'
           AND status='PENDING'
           AND grade_results IS NOT NULL
           AND grade_results <> ''
           AND (grade_results::jsonb) ? $1`,
        [gradeCode],
      );
      const totalMerged = rems.reduce((s: number, r: any) => s + Number(r.remainder_qty || 0), 0);
      if (rems.length > 0) {
        const idList: number[] = rems.map((r: any) => Number(r.id)).filter((n: number) => Number.isFinite(n));
        await this.em.query(
          `UPDATE pkg_tasks SET status='MERGED', updated_at=NOW() WHERE id = ANY($1::bigint[])`,
          [idList],
        );
      }
      return { code: 200, merged_qty: totalMerged, msg: `已合拼 ${totalMerged} 枚尾数` };
    } catch (e: any) {
      return { code: 500, merged_qty: 0, msg: e?.message || '合拼失败' };
    }
  }

  // ─── 标签补打审计 ─────────────────────────────────────────────────────────
  // body: { operator?, reason, label_count? }
  // 任务上次打印 >= 2 次时触发；写一条 lbl_records 条目 label_type='reprint_reason'
  async reprintLog(taskId: string, body: any, userId: number) {
    try {
      const task = await this.em.query(
        `SELECT task_no, batch_no FROM pkg_tasks WHERE task_no = $1 OR id::text = $1 LIMIT 1`,
        [taskId],
      );
      const batchNo = task[0]?.batch_no || task[0]?.task_no || taskId;
      await this.em.query(
        `INSERT INTO lbl_records (
           code, label_type, batch_no, qty_printed, desc_text, printed_by
         ) VALUES ($1, 'reprint_reason', $2, $3, $4, $5)`,
        [
          batchNo,
          batchNo,
          Math.max(1, Number(body.label_count) || 1),
          `补打原因: ${(body.reason || '').slice(0, 500)} | operator=${body.operator || ''}`,
          userId || null,
        ],
      );
      return { code: 200, msg: '补打记录已保存' };
    } catch (e: any) {
      return { code: 500, msg: e?.message || '保存失败' };
    }
  }

  // ─── 包装日报 ────────────────────────────────────────────────────────────────
  async getDailyReport(date: string) {
    const d = date || new Date().toISOString().slice(0, 10);
    try {
      const summary = await this.em.query(
        `SELECT
           COUNT(DISTINCT id)          AS total_tasks,
           COALESCE(SUM(packed_qty),0) AS total_packed
         FROM pkg_tasks
         WHERE task_type = 'PACKING' AND DATE(completed_at) = $1`,
        [d],
      );
      // A2 修正：旧 SQL 用 grade_results（JSON text）当 GROUP BY 维度 → 多等级任务被当成独立 group，
      //          {"AAA":50,"AA":30} 与 {"AAA":40,"AA":10} 不会聚合到 AAA/AA 而是两条独立行。
      //          现在用 jsonb_each_text 展开后按真实等级 code 聚合。
      const byGrade = await this.em.query(
        `SELECT
           gr.key                       AS grade,
           COALESCE(SUM((gr.value)::int),0) AS qty,
           COUNT(DISTINCT t.id)         AS tasks
         FROM pkg_tasks t
         CROSS JOIN LATERAL jsonb_each_text(
           CASE
             WHEN t.grade_results IS NULL OR t.grade_results = '' THEN '{}'::jsonb
             ELSE t.grade_results::jsonb
           END
         ) AS gr
         WHERE t.task_type = 'PACKING'
           AND DATE(t.completed_at) = $1
           AND gr.key IS NOT NULL
           AND (gr.value)::int > 0
         GROUP BY gr.key
         ORDER BY qty DESC`,
        [d],
      );
      return {
        code: 200,
        data: {
          date: d,
          summary: summary[0] || { total_tasks: 0, total_packed: 0 },
          by_grade: byGrade,
        },
      };
    } catch {
      return { code: 200, data: { date: d, summary: { total_tasks: 0, total_packed: 0 }, by_grade: [] } };
    }
  }

  /**
   * B6: 一次返回 N 天的日报趋势（替代前端 Promise.all 串发 N 次 /daily-report）
   * 用单条按日 GROUP BY 完成，前端拿到数组直接画图。
   */
  async getDailyReportRange(endDate: string, days: number) {
    const end = endDate || new Date().toISOString().slice(0, 10);
    const n = Math.max(1, Math.min(31, Number(days) || 7));
    try {
      const rows: Array<{ d: string; total_tasks: string; total_packed: string }> =
        await this.em.query(
          `WITH series AS (
             SELECT generate_series($1::date - ($2::int - 1), $1::date, '1 day'::interval)::date AS d
           )
           SELECT
             to_char(series.d, 'YYYY-MM-DD')        AS d,
             COUNT(DISTINCT t.id)                    AS total_tasks,
             COALESCE(SUM(t.packed_qty), 0)          AS total_packed
           FROM series
           LEFT JOIN pkg_tasks t
             ON t.task_type = 'PACKING'
            AND DATE(t.completed_at) = series.d
           GROUP BY series.d
           ORDER BY series.d ASC`,
          [end, n],
        );
      return {
        code: 200,
        data: rows.map(r => ({
          date: r.d,
          summary: {
            total_tasks:  Number(r.total_tasks)  || 0,
            total_packed: Number(r.total_packed) || 0,
          },
        })),
      };
    } catch (e: any) {
      console.error('[getDailyReportRange][ERR]', e?.message);
      return { code: 200, data: [] };
    }
  }
}
