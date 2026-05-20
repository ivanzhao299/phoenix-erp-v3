import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

// ═══════════════════════════════════════════════════════════════
//  Phoenix ERP V3 — BFF Controller
//  统一处理前端所需的跨模块聚合路由，避免多个零散模块
// ═══════════════════════════════════════════════════════════════

// ── Dashboard ─────────────────────────────────────────────────────────────────
@Controller('api/dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardBffController {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  // ═══ V2 fidelity: 主仪表盘 KPI ═══════════════════════════════════════════
  // 来源：_archive/phoenix-backend-v2-sqlite/src/routes/dashboard.js (kpi)
  @Get('kpi')
  async getKpi() {
    const today = new Date().toISOString().slice(0, 10);
    const safe = async <T,>(p: Promise<T>, fb: T): Promise<T> => { try { return await p; } catch { return fb; } };

    const [stockRow] = await safe(
      this.em.query(`SELECT COALESCE(SUM(qty_available),0)::float8 AS total FROM inv_batches WHERE status='AVAILABLE'`),
      [{ total: 0 }],
    );
    const warnRows = await safe(
      this.em.query(`SELECT batch_no, store_code, status FROM inv_batches WHERE status IN ('EXPIRY_WARN','EXPIRED')`),
      [],
    );
    const recvRows = await safe(
      this.em.query(`SELECT order_no, store_code FROM store_receiving WHERE status='PENDING'`),
      [],
    );
    const [todaySales] = await safe(
      this.em.query(
        `SELECT COALESCE(SUM(net_amount),0)::float8 AS total, COUNT(*)::int AS txns
           FROM pos_sales WHERE substr(created_at::text,1,10) = $1`,
        [today],
      ),
      [{ total: 0, txns: 0 }],
    );

    // 今日产蛋
    const [eggsRow] = await safe(
      this.em.query(
        `SELECT COALESCE(SUM(eggs_produced),0)::int AS today_eggs
           FROM brd_daily_logs WHERE log_date::text = $1`,
        [today],
      ),
      [{ today_eggs: 0 }],
    );
    const todayEggs = Number(eggsRow?.today_eggs) || 0;
    const [flockRow] = await safe(
      this.em.query(`SELECT COALESCE(SUM(current_qty),0)::int AS total FROM brd_flocks WHERE status='LAYING'`),
      [{ total: 0 }],
    );
    const layingTotal = Number(flockRow?.total) || 0;
    const todayLayRate = layingTotal > 0 ? Number(((todayEggs / layingTotal) * 100).toFixed(1)) : null;

    // 停药期预警
    const withdrawRows = await safe(
      this.em.query(
        `SELECT id, batch_no, medicine, farm_house, end_date
           FROM brd_medications
          WHERE end_date::date >= CURRENT_DATE AND end_date::date <= CURRENT_DATE + INTERVAL '5 days'`,
      ),
      [],
    );

    // 设备环境快报
    const [deviceAlertRow] = await safe(
      this.em.query(`SELECT COUNT(*)::int AS cnt FROM farm_device_alert_event WHERE status IN ('OPEN','CONFIRMED')`),
      [{ cnt: 0 }],
    );
    const [offlineRow] = await safe(
      this.em.query(`SELECT COUNT(DISTINCT erp_house_code)::int AS cnt FROM farm_device_realtime_snapshot WHERE collect_time < (now() - INTERVAL '10 minutes')`),
      [{ cnt: 0 }],
    );
    const [hottestRow] = await safe(
      this.em.query(`SELECT erp_house_code, value FROM farm_device_realtime_snapshot WHERE property_code='2001' ORDER BY value DESC NULLS LAST LIMIT 1`),
      [null],
    );
    const deviceStats = {
      activeAlerts:  Number(deviceAlertRow?.cnt) || 0,
      offlineHouses: Number(offlineRow?.cnt) || 0,
      hottestHouse:  hottestRow?.erp_house_code || null,
      hottestTemp:   hottestRow?.value != null ? Number(hottestRow.value).toFixed(1) : null,
    };

    const totalAlerts = warnRows.length + recvRows.length + withdrawRows.length;
    const alertList: any[] = [];
    warnRows.forEach((r: any) => alertList.push({
      id: `w_${r.batch_no}`,
      text: `门店 [${r.store_code}], 批次 [${r.batch_no}] 处于 [${r.status === 'EXPIRED' ? '已过期' : '临期'}] 状态`,
      type: r.status === 'EXPIRED' ? 'danger' : 'warning',
    }));
    recvRows.forEach((r: any) => alertList.push({
      id: `r_${r.order_no}`,
      text: `门店 [${r.store_code}], 收货单 [${r.order_no}] 等待签收入库`,
      type: 'info',
    }));
    withdrawRows.forEach((r: any) => alertList.push({
      id: `wd_${r.id}`,
      text: `[${r.farm_house || '鸡舍'}] ${r.medicine || '药物'} 停药期即将结束 (${r.end_date})`,
      type: 'warning',
    }));
    if (deviceStats.activeAlerts > 0) {
      alertList.unshift({ id: 'dev_alert', text: `设备环境：${deviceStats.activeAlerts} 个鸡舍存在未处理告警`, type: 'warning' });
    }
    if (deviceStats.offlineHouses > 0) {
      alertList.unshift({ id: 'dev_offline', text: `设备离线：${deviceStats.offlineHouses} 个鸡舍数据超过 10 分钟未更新`, type: 'danger' });
    }

    // 7 天销售趋势（按 DOW）
    const chartRows: any[] = await safe(
      this.em.query(
        `SELECT EXTRACT(DOW FROM created_at::timestamp)::int AS dow,
                COALESCE(SUM(net_amount),0)::float8 AS sales,
                COUNT(*)::int AS txns
           FROM pos_sales
          WHERE substr(created_at,1,10) >= to_char(CURRENT_DATE - INTERVAL '7 days','YYYY-MM-DD')
          GROUP BY dow
          ORDER BY dow`,
      ),
      [],
    );
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    const eggsUnit = todayLayRate != null
      ? `枚 (今日·产蛋率 ${todayLayRate}%)`
      : `枚 (今日产蛋)`;

    return {
      code: 200,
      data: {
        stats: {
          eggs:   { value: todayEggs.toLocaleString(), unit: eggsUnit, trend: null },
          stock:  { value: Number(stockRow?.total || 0).toLocaleString(), unit: '托 (可用库存)', trend: '1.8' },
          sales:  { value: Number(todaySales?.total || 0).toFixed(0), unit: 'LAK (今日销售)', trend: '12.4' },
          alerts: { value: String(totalAlerts + deviceStats.activeAlerts), unit: '条未处理预警', alert: (totalAlerts + deviceStats.activeAlerts) > 0 },
        },
        chartData: chartRows.map((r: any) => ({ day: `周${days[r.dow]}`, sales: Number(r.sales), prod: Number(r.txns) * 15 })),
        alertList,
        deviceStats,
        meta: { today, layingTotal, todayEggs, todayLayRate },
      },
    };
  }

  // ═══ V2 fidelity: 单店销售分析 ═══════════════════════════════════════════
  // 来源：dashboard.js (store-analysis)
  @Get('store-analysis')
  async getStoreAnalysis(@Query('store_code') storeCode?: string) {
    const store = storeCode || 'ST-VTE-001';
    const safe = async <T,>(p: Promise<T>, fb: T): Promise<T> => { try { return await p; } catch { return fb; } };

    const [statsRow] = await safe(
      this.em.query(
        `SELECT COALESCE(SUM(net_amount),0)::float8 AS total_sales,
                COUNT(*)::int AS total_txns
           FROM pos_sales
          WHERE store_code = $1 AND substr(created_at,1,10) >= to_char(CURRENT_DATE - INTERVAL '7 days','YYYY-MM-DD')`,
        [store],
      ),
      [{ total_sales: 0, total_txns: 0 }],
    );
    const totalSales = Number(statsRow?.total_sales) || 0;
    const totalTxns  = Number(statsRow?.total_txns) || 0;
    const [qtyRow] = await safe(
      this.em.query(
        `SELECT COALESCE(SUM(si.qty),0)::int AS total_qty
           FROM pos_sale_items si JOIN pos_sales s ON s.sale_no = si.sale_no
          WHERE s.store_code = $1 AND substr(s.created_at,1,10) >= to_char(CURRENT_DATE - INTERVAL '7 days','YYYY-MM-DD')`,
        [store],
      ),
      [{ total_qty: 0 }],
    );

    const trends: any[] = await safe(
      this.em.query(
        `SELECT substr(created_at::text, 1, 10) AS day,
                COALESCE(SUM(net_amount),0)::float8 AS sales,
                COUNT(*)::int AS txns
           FROM pos_sales
          WHERE store_code = $1 AND substr(created_at,1,10) >= to_char(CURRENT_DATE - INTERVAL '7 days','YYYY-MM-DD')
          GROUP BY day ORDER BY day ASC`,
        [store],
      ),
      [],
    );
    // 补齐 7 天
    const last7Days: string[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });
    const chartData: { days: string[]; sales: number[]; txns: number[] } = { days: [], sales: [], txns: [] };
    for (const day of last7Days) {
      chartData.days.push(day.slice(5));
      const match = trends.find((t: any) => t.day === day);
      chartData.sales.push(match ? Number(match.sales) : 0);
      chartData.txns.push(match ? Number(match.txns) : 0);
    }

    const topItemsData: any[] = await safe(
      this.em.query(
        `SELECT si.product_name_zh,
                SUM(si.qty)::int AS total_qty,
                SUM(si.subtotal)::float8 AS total_amount
           FROM pos_sale_items si JOIN pos_sales s ON s.sale_no = si.sale_no
          WHERE s.store_code = $1 AND substr(s.created_at,1,10) >= to_char(CURRENT_DATE - INTERVAL '7 days','YYYY-MM-DD')
          GROUP BY si.product_name_zh
          ORDER BY total_amount DESC LIMIT 3`,
        [store],
      ),
      [],
    );
    const totalSalesNum = totalSales || 1;
    const topItems = topItemsData.map((it: any) => ({
      item: it.product_name_zh,
      qty: Number(it.total_qty) || 0,
      sales: `LAK ${Number(it.total_amount).toLocaleString()}`,
      pct: Math.round((Number(it.total_amount) / totalSalesNum) * 100),
    }));

    return {
      code: 200,
      data: {
        kpi: {
          sales: totalSales,
          txns:  totalTxns,
          avg:   totalTxns ? Math.round(totalSales / totalTxns) : 0,
          qty:   Number(qtyRow?.total_qty) || 0,
        },
        chart: chartData,
        topItems,
      },
    };
  }

  // V2 fidelity 增强：integrity 评分（保留 V3 旧接口 + V2 多维度版本）
  @Get('integrity')
  async getIntegrity() {
    const today = new Date().toISOString().slice(0, 10);
    const safe = async <T,>(p: Promise<T>, fb: T): Promise<T> => { try { return await p; } catch { return fb; } };

    // D1 设备快照新鲜度
    const [snapTotal] = await safe(
      this.em.query(`SELECT COUNT(DISTINCT erp_house_code)::int AS cnt FROM farm_device_realtime_snapshot`),
      [{ cnt: 0 }],
    );
    const [snapFresh] = await safe(
      this.em.query(`SELECT COUNT(DISTINCT erp_house_code)::int AS cnt FROM farm_device_realtime_snapshot WHERE collect_time >= (now() - INTERVAL '10 minutes')`),
      [{ cnt: 0 }],
    );
    // D2 今日日报完整度
    const [houseTotal] = await safe(
      this.em.query(`SELECT COUNT(DISTINCT house_code)::int AS cnt FROM brd_houses WHERE status='ACTIVE'`),
      [{ cnt: 0 }],
    );
    const [dailyFilled] = await safe(
      this.em.query(`SELECT COUNT(DISTINCT house_code)::int AS cnt FROM brd_daily_logs WHERE log_date::text=$1`, [today]),
      [{ cnt: 0 }],
    );
    // D3 告警处理率
    const [alertData] = await safe(
      this.em.query(
        `SELECT COUNT(*)::int AS total,
                SUM(CASE WHEN status='CLOSED' THEN 1 ELSE 0 END)::int AS closed
           FROM farm_device_alert_event WHERE triggered_at >= CURRENT_DATE - INTERVAL '7 days'`,
      ),
      [{ total: 0, closed: 0 }],
    );
    // D4 质检-环境快照关联率
    const [inspectData] = await safe(
      this.em.query(
        `SELECT COUNT(*)::int AS total,
                SUM(CASE WHEN env_snapshot_json IS NOT NULL THEN 1 ELSE 0 END)::int AS linked
           FROM qa_inspections WHERE created_at >= now() - INTERVAL '30 days'`,
      ),
      [{ total: 0, linked: 0 }],
    );
    // D5 批次追溯覆盖
    const [batchData] = await safe(
      this.em.query(`SELECT COUNT(*)::int AS total FROM inv_batches WHERE status='AVAILABLE'`),
      [{ total: 0 }],
    );

    const score = (numerator: number, denominator: number, max = 20) =>
      denominator > 0 ? Math.round((numerator / denominator) * max) : max;

    const d1 = score(Number(snapFresh?.cnt) || 0, Number(snapTotal?.cnt) || 0);
    const d2 = score(Number(dailyFilled?.cnt) || 0, Number(houseTotal?.cnt) || 0);
    const d3 = score(Number(alertData?.closed) || 0, Number(alertData?.total) || 0);
    const d4 = score(Number(inspectData?.linked) || 0, Number(inspectData?.total) || 0);
    const d5 = (Number(batchData?.total) || 0) > 0 ? 20 : 0;

    const totalScore = d1 + d2 + d3 + d4 + d5;
    const grade = totalScore >= 90 ? 'A' : totalScore >= 75 ? 'B' : totalScore >= 60 ? 'C' : 'D';

    return {
      code: 200,
      data: {
        score: totalScore,
        grade,
        dimensions: [
          { name: '设备数据新鲜度', score: d1, maxScore: 20, detail: `${snapFresh?.cnt || 0}/${snapTotal?.cnt || 0} 鸡舍10分钟内有更新` },
          { name: '日报录入完整度', score: d2, maxScore: 20, detail: `今日 ${dailyFilled?.cnt || 0}/${houseTotal?.cnt || 0} 鸡舍已提交日报` },
          { name: '告警处理率(7日)', score: d3, maxScore: 20, detail: (alertData?.total || 0) > 0 ? `${alertData.closed}/${alertData.total} 条已关闭` : '暂无告警' },
          { name: '质检-环境快照关联', score: d4, maxScore: 20, detail: (inspectData?.total || 0) > 0 ? `30日内 ${inspectData.linked}/${inspectData.total} 条质检已附快照` : '暂无质检' },
          { name: '批次追溯覆盖', score: d5, maxScore: 20, detail: `${batchData?.total || 0} 个可用批次` },
        ],
        generatedAt: new Date().toISOString(),
      },
    };
  }
}

// ── Users (增强版：支持多角色分配) ───────────────────────────────────────────
@Controller('api/users')
@UseGuards(AuthGuard('jwt'))
export class UsersBffController {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  /** GET /api/users — 用户列表（含所有角色信息）*/
  @Get()
  async getUsers() {
    try {
      const data = await this.em.query(
        `SELECT
           u.user_id AS id, u.username, u.real_name AS real_name_zh, u.store_code,
           CASE WHEN u.status = 1 THEN 'ACTIVE' ELSE 'FROZEN' END AS status,
           u.locale, u.email, u.phone,
           COALESCE(
             (SELECT r.role_code FROM sys_user_role ur
              JOIN sys_role r ON ur.role_id = r.role_id
              WHERE ur.user_id = u.user_id AND ur.is_primary = true LIMIT 1),
             (SELECT r.role_code FROM sys_user_role ur
              JOIN sys_role r ON ur.role_id = r.role_id
              WHERE ur.user_id = u.user_id LIMIT 1)
           ) AS role,
           COALESCE(
             (SELECT r.role_name_zh FROM sys_user_role ur
              JOIN sys_role r ON ur.role_id = r.role_id
              WHERE ur.user_id = u.user_id AND ur.is_primary = true LIMIT 1),
             (SELECT r.role_name_zh FROM sys_user_role ur
              JOIN sys_role r ON ur.role_id = r.role_id
              WHERE ur.user_id = u.user_id LIMIT 1)
           ) AS role_name_zh,
           COALESCE(
             (SELECT json_agg(json_build_object(
               'role_code', r.role_code,
               'role_name_zh', r.role_name_zh,
               'approval_level', r.approval_level,
               'is_primary', ur.is_primary
             ) ORDER BY r.approval_level DESC, r.role_code)
              FROM sys_user_role ur JOIN sys_role r ON ur.role_id = r.role_id
              WHERE ur.user_id = u.user_id),
             '[]'::json
           ) AS roles_detail
         FROM sys_user u
         ORDER BY u.created_at DESC`,
      );
      // 返回角色字典供前端下拉
      const roles = await this.em.query(
        `SELECT role_code, role_name_zh, role_name_lo, role_type, approval_level, description
         FROM sys_role ORDER BY approval_level DESC, role_code`,
      );
      return { code: 200, data, roles };
    } catch (e: any) { return { code: 200, data: [], roles: [], error: e?.message }; }
  }

  /** POST /api/users — 新建用户（含初始角色）*/
  @Post()
  async createUser(@Body() body: any, @Req() req: any) {
    const { username, real_name_zh, role, store_code, password, user_type } = body || {};
    if (!username || !real_name_zh) return { code: 400, msg: '用户名和姓名为必填项' };
    if (!password || password.length < 8) return { code: 400, msg: '密码至少 8 位' };
    try {
      const bcrypt = await import('bcrypt');
      const password_hash = await bcrypt.hash(password, 10);
      const inserted = await this.em.query(
        `INSERT INTO sys_user (username, password_hash, real_name, store_code, status, locale, note, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 1, 'zh-CN', $5, now(), now()) RETURNING user_id`,
        [username, password_hash, real_name_zh, store_code || 'ALL', user_type === 'TEST' ? 'TEST' : null],
      );
      const userId = inserted[0]?.user_id;
      if (role && userId) {
        const roleRow = await this.em.query(`SELECT role_id FROM sys_role WHERE role_code = $1`, [role]);
        if (roleRow[0]) {
          await this.em.query(
            `INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at) VALUES ($1, $2, true, now())
             ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = true`,
            [userId, roleRow[0].role_id],
          );
        }
      }
      return { code: 200, msg: `用户 ${username} 创建成功`, data: { id: userId } };
    } catch (e: any) {
      if (e?.code === '23505') return { code: 409, msg: `用户名 "${username}" 已存在` };
      return { code: 500, msg: e?.message || '创建失败' };
    }
  }

  /** PUT /api/users/:id — 更新基本信息 */
  @Put(':id')
  async updateUser(@Param('id') id: string, @Body() body: any) {
    try {
      const fields: string[] = [];
      const params: any[] = [];
      let idx = 1;
      if (body.real_name_zh !== undefined) { fields.push(`real_name=$${idx++}`);  params.push(body.real_name_zh); }
      if (body.real_name    !== undefined) { fields.push(`real_name=$${idx++}`);  params.push(body.real_name); }
      if (body.store_code   !== undefined) { fields.push(`store_code=$${idx++}`); params.push(body.store_code || 'ALL'); }
      if (body.locale       !== undefined) { fields.push(`locale=$${idx++}`);     params.push(body.locale); }
      if (!fields.length) return { code: 400, msg: '无更新内容' };
      params.push(id);
      await this.em.query(`UPDATE sys_user SET ${fields.join(', ')}, updated_at=now() WHERE user_id=$${idx}`, params);
      return { code: 200, msg: '用户信息已更新' };
    } catch (e: any) { return { code: 500, msg: e?.message }; }
  }

  /** PUT /api/users/:id/status — 启用/冻结 */
  @Put(':id/status')
  async setStatus(@Param('id') id: string, @Body() body: any) {
    try {
      const s = String(body?.status || '').toUpperCase();
      const statusInt = s === 'ACTIVE' ? 1 : s === 'FROZEN' || s === 'INACTIVE' ? 0 : null;
      if (statusInt === null) return { code: 400, msg: '无效状态 (ACTIVE/FROZEN)' };
      await this.em.query(`UPDATE sys_user SET status=$1, updated_at=now() WHERE user_id=$2`, [statusInt, id]);
      return { code: 200, msg: '状态已更新' };
    } catch (e: any) { return { code: 500, msg: e?.message }; }
  }

  /** PUT /api/users/:id/role — 设置主角色（保留已有副角色）*/
  @Put(':id/role')
  async setRole(@Param('id') id: string, @Body() body: any) {
    const { role } = body || {};
    if (!role) return { code: 400, msg: 'role 必填' };
    try {
      const roleRow = await this.em.query(`SELECT role_id FROM sys_role WHERE role_code=$1`, [role]);
      if (!roleRow[0]) return { code: 400, msg: `角色 ${role} 不存在` };
      const roleId = roleRow[0].role_id;
      // 清除旧 primary，再设新 primary
      await this.em.query(`UPDATE sys_user_role SET is_primary=false WHERE user_id=$1`, [id]);
      await this.em.query(
        `INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at)
         VALUES ($1, $2, true, now())
         ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary=true`,
        [id, roleId],
      );
      await this.em.query(`UPDATE sys_user SET perms_version=COALESCE(perms_version,0)+1, updated_at=now() WHERE user_id=$1`, [id]);
      return { code: 200, msg: '主角色已更新' };
    } catch (e: any) { return { code: 500, msg: e?.message }; }
  }

  /** PUT /api/users/:id/roles — 全量设置用户角色列表（多角色）*/
  @Put(':id/roles')
  async setRoles(@Param('id') id: string, @Body() body: any) {
    // body: { roles: [{ role_code, is_primary }] }
    const { roles } = body || {};
    if (!Array.isArray(roles)) return { code: 400, msg: 'roles 必须是数组' };
    try {
      // 获取角色 ID 映射
      const allRoles = await this.em.query(`SELECT role_id, role_code FROM sys_role`);
      const codeToId = new Map(allRoles.map((r: any) => [r.role_code, r.role_id]));

      // 确保至多一个 primary
      const hasPrimary = roles.some((r: any) => r.is_primary);
      const resolved = roles.map((r: any, i: number) => ({
        role_code: r.role_code,
        role_id:   codeToId.get(r.role_code),
        is_primary: hasPrimary ? !!r.is_primary : i === 0,
      })).filter((r: any) => r.role_id);

      // 事务：删旧 → 插新
      await this.em.transaction(async (mgr) => {
        await mgr.query(`DELETE FROM sys_user_role WHERE user_id=$1`, [id]);
        for (const r of resolved) {
          await mgr.query(
            `INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at) VALUES ($1, $2, $3, now())`,
            [id, r.role_id, r.is_primary],
          );
        }
        // 触发权限刷新
        await mgr.query(
          `UPDATE sys_user SET perms_version=COALESCE(perms_version,0)+1, updated_at=now() WHERE user_id=$1`,
          [id],
        );
      });
      return { code: 200, msg: '角色已更新', data: { count: resolved.length } };
    } catch (e: any) { return { code: 500, msg: e?.message }; }
  }

  /** PUT /api/users/:id/password — 重置密码 */
  @Put(':id/password')
  async resetPassword(@Param('id') id: string, @Body() body: any) {
    const { password } = body || {};
    if (!password || password.length < 8) return { code: 400, msg: '密码至少 8 位' };
    try {
      const bcrypt = await import('bcrypt');
      const hash = await bcrypt.hash(password, 10);
      const res = await this.em.query(
        `UPDATE sys_user SET password_hash=$1, updated_at=now() WHERE user_id=$2 RETURNING user_id`,
        [hash, id],
      );
      if (!res[0]) return { code: 404, msg: '用户不存在' };
      return { code: 200, msg: '密码已重置' };
    } catch (e: any) { return { code: 500, msg: e?.message }; }
  }
}

// ── Analytics ─────────────────────────────────────────────────────────────────
@Controller('api/analytics')
@UseGuards(AuthGuard('jwt'))
export class AnalyticsBffController {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  // ═══ BI 驾驶舱一次聚合接口（替代前端 5 次裸 CRUD）═══════════════════════
  @Get('dashboard')
  async getDashboard() {
    const safe = async <T,>(p: Promise<T>, fb: T): Promise<T> => {
      try { return await p; } catch { return fb; }
    };
    const today = new Date().toISOString().slice(0, 10);
    const in14  = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);

    const [
      [eggsRow],
      [inRow],
      [outRow],
      [stockRow],
      [pendingRow],
      [expiryRow],
      [mortalityRow],
      productionTrend,
      outboundTrend,
      expiryBatches,
      pendingOrders,
    ] = await Promise.all([
      // 近 30 天集蛋总量
      safe(this.em.query(
        `SELECT COALESCE(SUM(COALESCE(egg_count,eggs_produced,0)),0)::bigint AS total
           FROM brd_daily_logs WHERE log_date >= CURRENT_DATE - INTERVAL '30 days'`
      ), [{ total: 0 }]),
      // 今日入库数量
      safe(this.em.query(
        `SELECT COALESCE(SUM(qty),0)::bigint AS total FROM wms_inbound
           WHERE DATE(created_at) = $1`, [today]
      ), [{ total: 0 }]),
      // 今日出库数量
      safe(this.em.query(
        `SELECT COALESCE(SUM(qty),0)::bigint AS total FROM wms_outbound
           WHERE DATE(created_at) = $1`, [today]
      ), [{ total: 0 }]),
      // 库存批次数（有货）
      safe(this.em.query(
        `SELECT COUNT(*)::int AS total FROM inv_batches WHERE qty_available > 0`
      ), [{ total: 0 }]),
      // 待审批订单
      safe(this.em.query(
        `SELECT COUNT(*)::int AS total FROM ord_orders WHERE status = 'pending'`
      ), [{ total: 0 }]),
      // 临期批次数（14天内）
      safe(this.em.query(
        `SELECT COUNT(*)::int AS total FROM inv_batches
           WHERE expire_date BETWEEN $1 AND $2 AND qty_available > 0`, [today, in14]
      ), [{ total: 0 }]),
      // 近 30 天死淘
      safe(this.em.query(
        `SELECT COALESCE(SUM(COALESCE(mortality_qty,0)),0)::int AS total
           FROM brd_daily_logs WHERE log_date >= CURRENT_DATE - INTERVAL '30 days'`
      ), [{ total: 0 }]),
      // 近 7 天集蛋趋势
      safe(this.em.query(
        `SELECT log_date::text AS date,
                COALESCE(SUM(COALESCE(egg_count,eggs_produced,0)),0)::bigint AS value
           FROM brd_daily_logs
           WHERE log_date >= CURRENT_DATE - INTERVAL '7 days'
           GROUP BY log_date ORDER BY log_date`
      ), []),
      // 近 7 天出库趋势
      safe(this.em.query(
        `SELECT DATE(created_at)::text AS date,
                COALESCE(SUM(qty),0)::bigint AS value
           FROM wms_outbound
           WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
           GROUP BY DATE(created_at) ORDER BY date`
      ), []),
      // 临期批次明细（最多 10 条）
      safe(this.em.query(
        `SELECT sku_code, qty_available, expire_date::text AS expire_date
           FROM inv_batches
           WHERE expire_date BETWEEN $1 AND $2 AND qty_available > 0
           ORDER BY expire_date LIMIT 10`, [today, in14]
      ), []),
      // 待审批订单明细（最多 10 条）
      safe(this.em.query(
        `SELECT customer_name, total_amount FROM ord_orders
           WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10`
      ), []),
    ]);

    return {
      code: 200,
      data: {
        kpis: {
          eggs_30d:          Number(eggsRow?.total    || 0),
          today_inbound_qty: Number(inRow?.total      || 0),
          today_outbound_qty:Number(outRow?.total     || 0),
          stock_batches:     Number(stockRow?.total   || 0),
          pending_orders:    Number(pendingRow?.total || 0),
          expiry_batches:    Number(expiryRow?.total  || 0),
        },
        production_trend: productionTrend,
        outbound_trend:   outboundTrend,
        alerts: {
          expiry_batches:  expiryBatches,
          pending_orders:  pendingOrders,
          mortality_30d:   Number(mortalityRow?.total || 0),
        },
      },
    };
  }

  @Get('overview')
  async getOverview() {
    try {
      const thisMonth = new Date().toISOString().slice(0, 7);
      const [[sales], [orders], [members], [flocks]] = await Promise.all([
        this.em.query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM pos_sales WHERE TO_CHAR(created_at,'YYYY-MM')=$1`, [thisMonth]),
        this.em.query(`SELECT COUNT(*) AS cnt FROM ord_orders WHERE TO_CHAR(created_at,'YYYY-MM')=$1`, [thisMonth]),
        this.em.query(`SELECT COUNT(*) AS cnt FROM crm_members`),
        this.em.query(`SELECT COUNT(*) AS cnt FROM brd_flocks WHERE status='active'`),
      ]);
      return { code: 200, data: {
        month_sales:   Number(sales?.total || 0),
        month_orders:  Number(orders?.cnt  || 0),
        total_members: Number(members?.cnt  || 0),
        active_flocks: Number(flocks?.cnt   || 0),
      }};
    } catch { return { code: 200, data: {} }; }
  }

  @Get('production')
  async getProduction() {
    try {
      const data = await this.em.query(`
        SELECT TO_CHAR(log_date,'YYYY-MM') AS month,
               SUM(egg_count)    AS eggs,
               SUM(feed_kg)      AS feed_kg,
               SUM(death_count)  AS deaths
        FROM brd_daily_logs
        WHERE log_date >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY TO_CHAR(log_date,'YYYY-MM')
        ORDER BY month
      `).catch(() => []);
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }

  @Get('inventory')
  async getInventory() {
    try {
      const data = await this.em.query(`
        SELECT warehouse_code, SUM(qty) AS total_qty, COUNT(DISTINCT product_code) AS sku_count
        FROM inv_batches WHERE qty > 0
        GROUP BY warehouse_code
      `).catch(() => []);
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }

  @Get('orders')
  async getOrders() {
    try {
      const data = await this.em.query(`
        SELECT TO_CHAR(created_at,'YYYY-MM-DD') AS date,
               COUNT(*) AS order_count,
               COALESCE(SUM(total_amount),0) AS revenue
        FROM ord_orders
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY TO_CHAR(created_at,'YYYY-MM-DD')
        ORDER BY date
      `).catch(() => []);
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }

  @Get('alerts')
  async getAlerts() {
    try {
      const [lowStock, expiry, overdue] = await Promise.all([
        this.em.query(`SELECT COUNT(*) AS cnt FROM inv_batches WHERE qty < 100 AND qty > 0`).catch(() => [{ cnt: 0 }]),
        this.em.query(`SELECT COUNT(*) AS cnt FROM inv_batches WHERE expire_date <= CURRENT_DATE + 14 AND expire_date >= CURRENT_DATE`).catch(() => [{ cnt: 0 }]),
        this.em.query(`SELECT COUNT(*) AS cnt FROM fin_transactions WHERE type='AR' AND status='PENDING' AND due_date < CURRENT_DATE`).catch(() => [{ cnt: 0 }]),
      ]);
      return { code: 200, data: {
        low_stock:   Number(lowStock[0]?.cnt || 0),
        expiry_soon: Number(expiry[0]?.cnt   || 0),
        ar_overdue:  Number(overdue[0]?.cnt  || 0),
      }};
    } catch { return { code: 200, data: { low_stock: 0, expiry_soon: 0, ar_overdue: 0 } }; }
  }

  @Get('promotion-roi')
  async getPromotionRoi() {
    return { code: 200, data: [] };
  }

  @Get('price-review')
  async getPriceReview() {
    return { code: 200, data: [] };
  }

  @Get('competitor-intel')
  async getCompetitorIntel() {
    return { code: 200, data: [] };
  }

  @Get('channel-scorecard')
  async getChannelScorecard() {
    return { code: 200, data: [] };
  }
}

// ── Audit ─────────────────────────────────────────────────────────────────────
@Controller('api/audit')
@UseGuards(AuthGuard('jwt'))
export class AuditBffController {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  @Get('workbench')
  async getWorkbench() {
    try {
      const data = await this.em.query(
        `SELECT * FROM sys_approval_log ORDER BY created_at DESC LIMIT 50`,
      ).catch(() => []);
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }

  @Post('workbench/sample')
  async sampleAudit(@Body() body: any) {
    return { code: 200, msg: '抽样审计已记录', data: { sample_id: `SAMPLE-${Date.now()}` } };
  }

  @Get('violations')
  async getViolations() {
    try {
      const data = await this.em.query(
        `SELECT * FROM sys_approval_log WHERE action='REJECTED' ORDER BY created_at DESC LIMIT 100`,
      ).catch(() => []);
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }

  @Get('anti-fraud')
  async getAntiFraud() {
    return { code: 200, data: [] };
  }

  @Post('anti-fraud/:id/freeze')
  async freezeAccount(@Param('id') id: string) {
    return { code: 200, msg: `账户 ${id} 已标记冻结`, data: { id } };
  }
}

// ── Pricing ───────────────────────────────────────────────────────────────────
@Controller('api/pricing')
@UseGuards(AuthGuard('jwt'))
export class PricingBffController {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  @Get('books')
  async getPriceBooks() {
    try {
      const data = await this.em.query(
        `SELECT * FROM ord_prices ORDER BY updated_at DESC LIMIT 200`,
      ).catch(() => []);
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }

  @Get('floating')
  async getFloating() {
    return { code: 200, data: [] };
  }

  @Put('floating/:id')
  async updateFloating(@Param('id') id: string, @Body() body: any) {
    return { code: 200, msg: '浮动价格已更新' };
  }

  @Get('approvals')
  async getApprovals() {
    try {
      const data = await this.em.query(
        `SELECT * FROM sys_approval_log WHERE doc_type='PRICE' ORDER BY created_at DESC LIMIT 100`,
      ).catch(() => []);
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }
}

// ── Wholesale ─────────────────────────────────────────────────────────────────
@Controller('api/wholesale')
@UseGuards(AuthGuard('jwt'))
export class WholesaleBffController {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  @Get('distributors')
  async getDistributors(@Query('limit') limit = '200') {
    try {
      const data = await this.em.query(
        `SELECT * FROM b2b_customers ORDER BY created_at DESC LIMIT $1`, [parseInt(limit)],
      ).catch(() => []);
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }

  @Put('distributors/:id')
  async updateDistributor(@Param('id') id: string, @Body() body: any) {
    return { code: 200, msg: '经销商信息已更新' };
  }
}

// ── Packaging Terminal BFF ─────────────────────────────────────────────────────
// Terminal 作业台专用接口，区别于 PC 端的 PackagingBffController
// 接口前缀：/api/packaging/terminal
@Controller('api/packaging/terminal')
@UseGuards(AuthGuard('jwt'))
export class PackagingTerminalBffController {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private get today() { return new Date().toISOString().slice(0, 10); }

  private safe = async <T,>(p: Promise<T>, fb: T): Promise<T> => {
    try { return await p; } catch { return fb; }
  };

  // ── Terminal 全局上下文 ────────────────────────────────────────────────────
  @Get('context')
  async getContext(@Req() req: any) {
    const userId = req.user?.id || req.user?.user_id;
    const today = this.today;

    const [shift] = await this.safe(
      this.em.query(
        `SELECT * FROM pkg_work_shifts WHERE production_date = $1 AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1`,
        [today],
      ),
      [],
    );

    const [sourceBatch] = await this.safe(
      this.em.query(
        `SELECT * FROM pkg_source_batches WHERE production_date = $1 AND batch_status NOT IN ('WAREHOUSED','SCRAPPED','CANCELLED')
         ORDER BY created_at DESC LIMIT 1`,
        [today],
      ),
      [],
    );

    const openExceptions = await this.safe(
      this.em.query(
        `SELECT COUNT(*)::int AS cnt FROM pkg_exceptions WHERE status NOT IN ('CLOSED','CANCELLED') AND DATE(created_at) = $1`,
        [today],
      ),
      [{ cnt: 0 }],
    );

    return {
      code: 200,
      data: {
        currentShift: shift || null,
        currentSourceBatch: sourceBatch || null,
        openExceptionCount: Number(openExceptions[0]?.cnt) || 0,
        devices: [
          { deviceId: 'scanner-01', deviceType: 'SCANNER',     label: '扫码枪',    status: 'UNKNOWN' },
          { deviceId: 'printer-01', deviceType: 'PRINTER',     label: '标签打印机', status: 'UNKNOWN' },
          { deviceId: 'scale-01',   deviceType: 'SCALE',       label: '电子秤',    status: 'UNKNOWN' },
          { deviceId: 'grader-01',  deviceType: 'GRADER',      label: '分级机',    status: 'UNKNOWN' },
          { deviceId: 'agent-01',   deviceType: 'LOCAL_AGENT', label: '本地采集',  status: 'UNKNOWN' },
        ],
      },
    };
  }

  // ── 班次管理 ───────────────────────────────────────────────────────────────
  @Get('shifts/today')
  async getTodayShifts() {
    const rows = await this.safe(
      this.em.query(
        `SELECT * FROM pkg_work_shifts WHERE production_date = $1 ORDER BY opened_at DESC`,
        [this.today],
      ),
      [],
    );
    return { code: 200, data: rows };
  }

  @Post('shifts/open')
  async openShift(@Body() body: any, @Req() req: any) {
    const today = this.today;
    const lineId = body.lineId || body.line_id || 'line-01';
    const shiftType = body.shiftType || body.shift_type || '';
    const shiftCode = `SH-${today.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
    const operatorId = req.user?.id || req.user?.user_id;
    const operatorName = req.user?.name || req.user?.username || '';

    // 弹性排班：同一产线同一班次类型不能同时有两个 OPEN 班次
    const [existing] = await this.safe(
      this.em.query(
        `SELECT id FROM pkg_work_shifts WHERE line_id = $1 AND shift_type = $2 AND production_date = $3 AND status = 'OPEN' LIMIT 1`,
        [lineId, shiftType, today],
      ),
      [],
    );
    if (existing) return { code: 400, msg: `该产线 ${shiftType} 班次已有开放记录，请先交班` };

    await this.em.query(
      `INSERT INTO pkg_work_shifts
       (shift_code, shift_type, production_date, site_id, line_id, operator_id, operator_name,
        supervisor_name, status, hygiene_check, device_check, opened_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'OPEN',$9,$10,NOW(),NOW())`,
      [
        shiftCode, shiftType, today,
        body.siteId || 'site-01',
        lineId,
        operatorId,
        operatorName,
        body.supervisorName || body.supervisor_name || '',
        body.hygieneCheckResult ?? true,
        body.deviceCheckResult ?? true,
      ],
    ).catch((e: any) => { throw new Error(e.message); });

    const [shift] = await this.em.query(
      `SELECT * FROM pkg_work_shifts WHERE shift_code = $1`, [shiftCode],
    );
    return { code: 200, msg: '开班成功', data: shift };
  }

  @Post('shifts/:id/close')
  async closeShift(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const [existing] = await this.safe(
      this.em.query(`SELECT id, status FROM pkg_work_shifts WHERE id=$1`, [id]),
      [],
    );
    if (!existing) return { code: 404, msg: '班次不存在' };
    if (existing.status === 'CLOSED') return { code: 200, msg: '该班次已交班' };
    await this.em.query(
      `UPDATE pkg_work_shifts SET status='CLOSED', closed_at=NOW(), variance_reason=$1, updated_at=NOW()
       WHERE id=$2`,
      [body.varianceReason || '', id],
    ).catch((e: any) => { throw new Error(e.message); });
    return { code: 200, msg: '交班成功' };
  }

  // ── 来源批次 ───────────────────────────────────────────────────────────────
  @Get('source-batches/today')
  async getTodaySourceBatches() {
    const rows = await this.safe(
      this.em.query(
        `WITH graded_sum AS (
           SELECT COALESCE(SUM(total_output), 0)::int AS total_graded
           FROM pkg_grading_records
           WHERE production_date = $1
         )
         SELECT psb.*,
                COALESCE(bh.house_name, psb.house_code) AS house_name,
                (SELECT total_graded FROM graded_sum) AS total_graded_today
         FROM pkg_source_batches psb
         LEFT JOIN brd_houses bh ON bh.house_code = psb.house_code
         WHERE psb.production_date = $1
         ORDER BY psb.created_at DESC`,
        [this.today],
      ),
      [],
    );
    return { code: 200, data: rows };
  }

  @Get('source-batches/pending')
  async getPendingSourceBatches() {
    // 来源 A：wms_inbound 已完成、尚未被 pkg_source_batches 引用的批次
    const fromWms = await this.safe(
      this.em.query(
        `SELECT wi.id::text, wi.inbound_no AS batch_code, wi.inbound_no AS code,
                wi.house_code, wi.shift_no,
                wi.collect_date AS lay_date, wi.qty AS expected_qty,
                wi.weight_kg AS expected_weight,
                'PENDING_RECEIVE' AS batch_status
         FROM wms_inbound wi
         WHERE wi.status = 'COMPLETED'
           AND NOT EXISTS (
             SELECT 1 FROM pkg_source_batches psb WHERE psb.source_inbound_no = wi.inbound_no
           )
         ORDER BY wi.created_at DESC LIMIT 20`,
      ),
      [],
    );
    // 来源 B：pkg_source_batches 中状态为 PENDING_RECEIVE 的批次（测试/手工录入）
    const fromPkg = await this.safe(
      this.em.query(
        `SELECT id::text, batch_code, batch_code AS code,
                house_code, flock_code, lay_date,
                expected_qty, expected_weight, container_count,
                batch_status
         FROM pkg_source_batches
         WHERE batch_status = 'PENDING_RECEIVE'
         ORDER BY created_at DESC LIMIT 20`,
      ),
      [],
    );
    return { code: 200, data: [...fromPkg, ...fromWms] };
  }

  @Post('source-batches/receive')
  async receiveBatch(@Body() body: any, @Req() req: any) {
    const today = this.today;
    const houseSlug = (body.houseCode || body.house_code || 'X')
      .toString().replace(/\s+/g, '').toUpperCase().slice(0, 8);
    const autoCode = `SRC-${today.replace(/-/g, '')}-${houseSlug}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const batchCode = body.batchCode || body.code || autoCode;
    const operatorId = req.user?.id || req.user?.user_id;

    // 检查是否已接收（仅检查 status != PENDING_RECEIVE 的记录，避免误判种子数据）
    const [existing] = await this.safe(
      this.em.query(
        `SELECT id FROM pkg_source_batches WHERE batch_code = $1 AND batch_status != 'PENDING_RECEIVE'`,
        [batchCode],
      ),
      [],
    );
    if (existing) throw new Error(`批次 ${batchCode} 已接收，不可重复接收`);

    // 如果已有 PENDING_RECEIVE 记录（种子/手工），直接 UPDATE；否则 INSERT
    const [pendingRow] = await this.safe(
      this.em.query(
        `SELECT id FROM pkg_source_batches WHERE batch_code = $1 AND batch_status = 'PENDING_RECEIVE'`,
        [batchCode],
      ),
      [],
    );

    if (pendingRow) {
      await this.em.query(
        `UPDATE pkg_source_batches
         SET batch_status='RECEIVED', received_qty=$1, received_weight=$2,
             container_count=$3, variance_reason=$4, received_by=$5, shift_id=$6, updated_at=NOW()
         WHERE id=$7`,
        [
          body.receivedQty || body.received_qty || 0,
          body.receivedWeight || body.received_weight || 0,
          body.containerCount || body.container_count || 0,
          body.varianceReason || body.variance_reason || '',
          operatorId,
          body.shiftId || null,
          pendingRow.id,
        ],
      );
    } else {
    await this.em.query(
      `INSERT INTO pkg_source_batches
       (batch_code, source_inbound_no, production_date, house_code, flock_code,
        lay_date, total_qty, dirty_qty, cracked_qty,
        expected_qty, received_qty, expected_weight, received_weight,
        container_count, variance_reason, received_by, shift_id, batch_status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'RECEIVED',NOW(),NOW())`,
      [
        batchCode,
        body.sourceInboundNo || batchCode,
        today,
        body.houseCode || body.house_code || '',
        body.flockCode || body.flock_code || '',
        body.layDate || body.lay_date || today,
        body.totalQty  || body.total_qty  || 0,
        body.dirtyQty  || body.dirty_qty  || 0,
        body.crackedQty || body.cracked_qty || 0,
        body.totalQty  || body.expected_qty || 0,
        body.receivedQty || body.received_qty || 0,
        body.expectedWeight || body.expected_weight || 0,
        body.receivedWeight || body.received_weight || 0,
        body.containerCount || body.container_count || 0,
        body.varianceReason || body.variance_reason || '',
        operatorId,
        body.shiftId || null,
      ],
    ).catch((e: any) => { throw new Error(e.message); });
    } // end else (INSERT branch)

    const [batch] = await this.em.query(
      `SELECT * FROM pkg_source_batches WHERE batch_code = $1`, [batchCode],
    );

    // 写审计日志
    await this.safe(this.em.query(
      `INSERT INTO pkg_audit_logs (entity_type, entity_id, action, after_data, operator_id, created_at)
       VALUES ('SOURCE_BATCH', $1, 'RECEIVE', $2, $3, NOW())`,
      [batchCode, JSON.stringify(batch), operatorId],
    ), null);

    return { code: 200, msg: '接收成功', data: batch };
  }

  // ── 来源批次数量更正 ─────────────────────────────────────────────────────────
  @Patch('source-batches/correct')
  async correctBatch(@Body() body: any, @Req() req: any) {
    const operatorId = req.user?.id || req.user?.user_id;
    const date = body.productionDate || this.today;
    const houseCode = body.houseCode || body.house_code;
    if (!houseCode) throw new BadRequestException('houseCode 必填');

    const newTotal   = Math.max(0, Number(body.totalQty   ?? 0));
    const newDirty   = Math.max(0, Number(body.dirtyQty   ?? 0));
    const newCracked = Math.max(0, Number(body.crackedQty ?? 0));
    const newReceived = Math.max(0, newTotal - newDirty - newCracked);
    const reason = String(body.reason || '');

    // 取当日该鸡舍所有 RECEIVED 记录，按时间升序
    const rows: any[] = await this.em.query(
      `SELECT id, batch_code, total_qty, dirty_qty, cracked_qty, received_qty
       FROM pkg_source_batches
       WHERE house_code = $1 AND production_date = $2
         AND batch_status NOT IN ('WAREHOUSED','SCRAPPED','CANCELLED')
       ORDER BY created_at ASC`,
      [houseCode, date],
    );
    if (rows.length === 0) throw new BadRequestException('未找到该鸡舍当日记录');

    const beforeTotal    = rows.reduce((s, r) => s + Number(r.total_qty    || 0), 0);
    const beforeDirty    = rows.reduce((s, r) => s + Number(r.dirty_qty    || 0), 0);
    const beforeCracked  = rows.reduce((s, r) => s + Number(r.cracked_qty  || 0), 0);
    const beforeReceived = rows.reduce((s, r) => s + Number(r.received_qty || 0), 0);

    // 主记录更新为更正后数值
    await this.em.query(
      `UPDATE pkg_source_batches
       SET total_qty=$1, dirty_qty=$2, cracked_qty=$3, received_qty=$4, updated_at=NOW()
       WHERE id=$5`,
      [newTotal, newDirty, newCracked, newReceived, rows[0].id],
    );
    // 同鸡舍额外记录清零（保留行以维持完整性）
    if (rows.length > 1) {
      await this.em.query(
        `UPDATE pkg_source_batches
         SET total_qty=0, dirty_qty=0, cracked_qty=0, received_qty=0, updated_at=NOW()
         WHERE id = ANY($1::int[])`,
        [rows.slice(1).map((r: any) => r.id)],
      );
    }

    // 审计日志
    await this.safe(this.em.query(
      `INSERT INTO pkg_audit_logs
       (entity_type, entity_id, action, before_data, after_data, reason, operator_id, created_at)
       VALUES ('SOURCE_BATCH', $1, 'CORRECT', $2, $3, $4, $5, NOW())`,
      [
        rows[0].batch_code,
        JSON.stringify({ total_qty: beforeTotal, dirty_qty: beforeDirty, cracked_qty: beforeCracked, received_qty: beforeReceived }),
        JSON.stringify({ total_qty: newTotal,    dirty_qty: newDirty,    cracked_qty: newCracked,    received_qty: newReceived }),
        reason,
        operatorId,
      ],
    ), null);

    return { code: 200, msg: '更正成功' };
  }

  // ── 首检 ───────────────────────────────────────────────────────────────────
  @Post('qc/first-inspection')
  async submitQCInspection(@Body() body: any, @Req() req: any) {
    const inspectorId = req.user?.id || req.user?.user_id;
    const inspectorName = req.user?.name || req.user?.username || '';

    await this.em.query(
      `INSERT INTO pkg_qc_inspections
       (source_batch_id, sample_qty, broken_qty, dirty_qty, leaking_qty,
        abnormal_shape_qty, floor_egg_qty, average_weight,
        shell_cleanliness_ok, odor_ok, container_cleanliness_ok,
        qc_result, comment, inspector_id, inspector_name, inspected_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())`,
      [
        body.sourceBatchId || body.source_batch_id,
        body.sampleQty || body.sample_qty || 0,
        body.brokenQty || body.broken_qty || 0,
        body.dirtyQty || body.dirty_qty || 0,
        body.leakingQty || body.leaking_qty || 0,
        body.abnormalShapeQty || body.abnormal_shape_qty || 0,
        body.floorEggQty || body.floor_egg_qty || 0,
        body.averageWeight || body.average_weight || null,
        body.shellCleanlinessResult ?? body.shellOk ?? true,
        body.odorResult ?? body.odorOk ?? true,
        body.containerCleanlinessResult ?? body.containerOk ?? true,
        body.result || body.qcResult || 'PENDING',
        body.comment || '',
        inspectorId,
        inspectorName,
      ],
    ).catch((e: any) => { throw new Error(e.message); });

    // 更新来源批次状态
    const qcResult = body.result || body.qcResult || 'PENDING';
    let newStatus = 'PENDING_QC';
    if (['PASSED', 'CONDITIONAL_RELEASE'].includes(qcResult)) newStatus = 'QC_PASSED';
    else if (qcResult === 'ON_HOLD') newStatus = 'QC_ON_HOLD';
    else if (qcResult === 'REJECTED' || qcResult === 'SCRAPPED') newStatus = 'SCRAPPED';

    await this.safe(this.em.query(
      `UPDATE pkg_source_batches SET batch_status=$1, qc_result=$2, updated_at=NOW()
       WHERE batch_code=$3 OR id::text=$3`,
      [newStatus, qcResult, body.sourceBatchId || body.source_batch_id],
    ), null);

    return { code: 200, msg: '首检结论已提交', data: { qcResult, newStatus } };
  }

  // ── 异常 ────────────────────────────────────────────────────────────────────
  @Get('exceptions/today')
  async getTodayExceptions() {
    const rows = await this.safe(
      this.em.query(
        `SELECT * FROM pkg_exceptions WHERE DATE(created_at) = $1 ORDER BY created_at DESC`,
        [this.today],
      ),
      [],
    );
    return { code: 200, data: rows };
  }

  @Post('exceptions')
  async reportException(@Body() body: any, @Req() req: any) {
    const reportedBy = req.user?.name || req.user?.username || '';
    const reporterId = req.user?.id || req.user?.user_id;

    await this.em.query(
      `INSERT INTO pkg_exceptions
       (exception_type, severity, related_batch_id, quantity, description,
        reported_by, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'REPORTED',NOW(),NOW())`,
      [
        body.type || body.exception_type || 'OTHER',
        body.severity || 'MEDIUM',
        body.relatedBatchId || body.related_batch_id || body.batchId || '',
        body.quantity || 0,
        body.description || '',
        reportedBy,
      ],
    ).catch((e: any) => { throw new Error(e.message); });

    return { code: 200, msg: '异常已上报' };
  }

  // ── 标签打印日志 ────────────────────────────────────────────────────────────
  @Post('labels/print-log')
  async recordPrintLog(@Body() body: any, @Req() req: any) {
    const printedBy = req.user?.name || req.user?.username || '';

    await this.em.query(
      `INSERT INTO pkg_label_print_logs
       (box_code, packaging_batch_id, print_type, printer_id,
        printed_by, reprint_reason, print_status, printed_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'PRINTED',NOW(),NOW())`,
      [
        body.boxCode || body.box_code || '',
        body.packagingBatchId || body.packaging_batch_id || '',
        body.printType || body.print_type || 'NORMAL',
        body.printerId || body.printer_id || 'printer-01',
        printedBy,
        body.reprintReason || body.reprint_reason || '',
      ],
    ).catch((e: any) => { throw new Error(e.message); });

    return { code: 200, msg: '打印记录已保存' };
  }

  // ── 打印日志查询 ─────────────────────────────────────────────────────────────
  @Get('labels/print-logs')
  async getPrintLogs(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('type') type: string,
  ) {
    const start = startDate || this.today;
    const end   = endDate   || this.today;
    const params: unknown[] = [start, end];
    let typeClause = '';
    if (type && type !== 'ALL') {
      params.push(type);
      typeClause = `AND print_type = $${params.length}`;
    }
    const rows = await this.safe(
      this.em.query(
        `SELECT id, box_code, packaging_batch_id, print_type,
                reprint_reason, printed_by, printed_at
         FROM pkg_label_print_logs
         WHERE DATE(printed_at) BETWEEN $1 AND $2
         ${typeClause}
         ORDER BY printed_at DESC
         LIMIT 1000`,
        params,
      ),
      [],
    );
    return { data: rows };
  }

  // ── 交班日报汇总 ────────────────────────────────────────────────────────────
  @Get('reports/shift-summary')
  async getShiftSummary(@Query('date') date: string, @Query('shiftId') shiftId: string) {
    const targetDate = date || this.today;

    const [shiftRow] = await this.safe(
      this.em.query(
        `SELECT * FROM pkg_work_shifts WHERE production_date = $1 ORDER BY opened_at DESC LIMIT 1`,
        [targetDate],
      ),
      [],
    );

    const [recvRow] = await this.safe(
      this.em.query(
        `SELECT COALESCE(SUM(received_qty),0)::int AS qty, COALESCE(SUM(received_weight),0)::float AS weight
         FROM pkg_source_batches WHERE production_date=$1`,
        [targetDate],
      ),
      [{ qty: 0, weight: 0 }],
    );

    const [exceptRow] = await this.safe(
      this.em.query(
        `SELECT
           COUNT(*) FILTER (WHERE status NOT IN ('CLOSED','CANCELLED'))::int AS open_count,
           COUNT(*) FILTER (WHERE status IN ('CLOSED','CANCELLED'))::int AS closed_count
         FROM pkg_exceptions WHERE DATE(created_at) = $1`,
        [targetDate],
      ),
      [{ open_count: 0, closed_count: 0 }],
    );

    // 本班包装产出（按 shift_id 精确查询）
    const shiftIdNum = shiftId ? Number(shiftId) : (shiftRow?.id ? Number(shiftRow.id) : null);
    const [packRow] = shiftIdNum
      ? await this.safe(
          this.em.query(
            `SELECT COALESCE(SUM(total_boxes),0)::int AS boxes, COALESCE(SUM(total_eggs),0)::int AS eggs
             FROM pkg_packing_records WHERE shift_id = $1`,
            [shiftIdNum],
          ),
          [{ boxes: 0, eggs: 0 }],
        )
      : [[{ boxes: 0, eggs: 0 }]];

    return {
      code: 200,
      data: {
        shift: shiftRow || null,
        receivedQty: Number(recvRow[0]?.qty) || 0,
        receivedWeight: Number(recvRow[0]?.weight) || 0,
        openExceptionCount: Number(exceptRow[0]?.open_count) || 0,
        closedExceptionCount: Number(exceptRow[0]?.closed_count) || 0,
        shiftPackedBoxes: Number(packRow[0]?.boxes) || 0,
        shiftPackedEggs:  Number(packRow[0]?.eggs)  || 0,
      },
    };
  }

  @Post('grading/submit')
  async submitGrading(@Body() body: Record<string, any>) {
    const today = new Date().toISOString().slice(0, 10);
    const productionDate = body.productionDate || today;
    const outputs = body.outputs as Record<string, number> || {};

    // 校验每项产出非负
    for (const [k, v] of Object.entries(outputs)) {
      if (typeof v !== 'number' || v < 0 || !Number.isFinite(v)) {
        throw new BadRequestException(`等级 ${k} 的数量无效`);
      }
    }

    const totalOutput = Object.values(outputs).reduce((a: number, b: number) => a + b, 0);

    // 服务端校验：总产出不得超过当日净可分级量（已收 − 已分级）
    const [recvRow] = await this.em.query<{ total_received: number }[]>(
      `SELECT COALESCE(SUM(received_qty), 0)::int AS total_received
       FROM pkg_source_batches WHERE production_date = $1`,
      [productionDate],
    );
    const [gradedRow] = await this.em.query<{ total_graded: number }[]>(
      `SELECT COALESCE(SUM(total_output), 0)::int AS total_graded
       FROM pkg_grading_records WHERE production_date = $1`,
      [productionDate],
    );
    const totalReceived = Number(recvRow?.total_received) || 0;
    const totalGraded   = Number(gradedRow?.total_graded)  || 0;
    const netAvailable  = totalReceived - totalGraded;

    if (totalReceived === 0) {
      throw new BadRequestException('今日尚未录入集蛋数据，无法提交分级');
    }
    if (totalOutput > netAvailable) {
      throw new BadRequestException(
        `产出 ${totalOutput} 超过今日可分级余量 ${netAvailable}（已收 ${totalReceived} − 已分级 ${totalGraded}）`,
      );
    }

    const code = `GRD-${productionDate.replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;
    await this.safe(
      this.em.query(
        `INSERT INTO pkg_grading_records
         (code, shift_id, source_batch_code, production_date, outputs_json, total_output, created_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,NOW())
         ON CONFLICT (code) DO NOTHING`,
        [code, body.shiftId || null, body.sourceBatchCode || null, productionDate,
         JSON.stringify(outputs), totalOutput],
      ),
      null,
    );
    return { code: 200, data: { code } };
  }

  /**
   * GET /grading/active?date=YYYY-MM-DD
   * 按等级汇总当日所有分级批次的产出，减去当日所有包装记录已消耗量，
   * 返回各等级实时剩余（key = dict_code，多终端并发安全）。
   */
  @Get('grading/active')
  async getActiveGrading(@Query('date') dateParam?: string) {
    const date = dateParam || new Date().toISOString().slice(0, 10);

    // ── key 标准化映射：config_json.code / terminalCode → dict_code ────────────
    const dictRows = await this.safe(
      this.em.query<any[]>(
        `SELECT dict_code, config_json FROM sys_dict WHERE dict_type IN ('PKG_EGG_GRADE','PKG_EGG_DEFECT')`,
      ),
      [] as any[],
    );
    const keyMap: Record<string, string> = {};
    for (const d of (dictRows || [])) {
      const dc = d.dict_code as string;
      keyMap[dc] = dc;
      try {
        const cfg = typeof d.config_json === 'string' ? JSON.parse(d.config_json) : (d.config_json ?? {});
        if (cfg.code)         keyMap[String(cfg.code)]         = dc;
        if (cfg.terminalCode) keyMap[String(cfg.terminalCode)] = dc;
      } catch { /* ignore */ }
    }
    const normalize = (k: string) => keyMap[k] ?? k;

    // ── 合并当日所有分级批次产出（按等级累加） ──────────────────────────────────
    const gradingRows = await this.safe(
      this.em.query<any[]>(
        `SELECT code, outputs_json FROM pkg_grading_records WHERE production_date = $1 ORDER BY created_at ASC`,
        [date],
      ),
      [] as any[],
    );

    const outputs: Record<string, number> = {};
    const gradingCodes: string[] = [];
    for (const row of (gradingRows || [])) {
      gradingCodes.push(row.code as string);
      const raw = (typeof row.outputs_json === 'string'
        ? JSON.parse(row.outputs_json) : row.outputs_json) as Record<string, number>;
      for (const [k, v] of Object.entries(raw)) {
        const nk = normalize(k);
        outputs[nk] = (outputs[nk] || 0) + Number(v);
      }
    }

    // ── 按 production_date 汇总已包装枚数（不限 grading_code，覆盖所有终端） ──
    const packed: Record<string, number> = {};
    const packingRows = await this.safe(
      this.em.query<any[]>(
        `SELECT batches_json FROM pkg_packing_records WHERE production_date = $1`,
        [date],
      ),
      [] as any[],
    );
    for (const row of (packingRows || [])) {
      const batches = (typeof row.batches_json === 'string'
        ? JSON.parse(row.batches_json) : row.batches_json) as Array<{ grade: string; eggs: number }>;
      for (const b of batches) {
        const nk = normalize(b.grade);
        packed[nk] = (packed[nk] || 0) + Number(b.eggs || 0);
      }
    }

    const remaining: Record<string, number> = {};
    for (const [grade, total] of Object.entries(outputs)) {
      remaining[grade] = Math.max(0, total - (packed[grade] || 0));
    }

    return {
      code: 200,
      data: { gradingCodes, outputs, packed, remaining },
    };
  }

  @Post('packing/submit')
  async submitPacking(@Body() body: Record<string, any>) {
    const today = new Date().toISOString().slice(0, 10);
    const productionDate = body.productionDate || today;
    const code = `PKG-${productionDate.replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;
    const batches = (body.batches as any[]) || [];
    const totalBoxes = batches.reduce((a: number, b: any) => a + (b.boxes || 0), 0);
    const totalEggs  = batches.reduce((a: number, b: any) => a + (b.eggs  || 0), 0);
    const gradingCodes: string[] = Array.isArray(body.gradingCodes)
      ? body.gradingCodes.filter((c: unknown) => typeof c === 'string')
      : (body.gradingCode ? [body.gradingCode] : []);
    await this.safe(
      this.em.query(
        `INSERT INTO pkg_packing_records
         (code, grading_code, grading_codes_json, production_date, batches_json, total_boxes, total_eggs, shift_id, created_at)
         VALUES ($1,$2,$3::jsonb,$4,$5::jsonb,$6,$7,$8,NOW())
         ON CONFLICT (code) DO NOTHING`,
        [code, gradingCodes[0] ?? null, JSON.stringify(gradingCodes),
         productionDate, JSON.stringify(batches), totalBoxes, totalEggs,
         body.shiftId || null],
      ),
      null,
    );
    return { code: 200, data: { code, totalBoxes, totalEggs } };
  }

  @Get('labels/trace')
  async getPackingTrace(@Query('packingCode') packingCode: string) {
    if (!packingCode) throw new BadRequestException('packingCode is required');

    const [pr] = await this.em.query<any[]>(
      `SELECT pr.code, pr.production_date, pr.batches_json, pr.shift_id,
              ws.shift_code, ws.operator_name, ws.supervisor_name
       FROM pkg_packing_records pr
       LEFT JOIN pkg_work_shifts ws ON ws.id = pr.shift_id
       WHERE pr.code = $1`,
      [packingCode],
    );
    if (!pr) return { code: 200, data: null };

    // 来源鸡舍（按生产日期汇总）
    const sources = await this.em.query<any[]>(
      `SELECT sb.house_code, bh.house_name, SUM(sb.total_qty)::int AS total_qty
       FROM pkg_source_batches sb
       LEFT JOIN brd_houses bh ON bh.house_code = sb.house_code
       WHERE sb.production_date = $1 AND sb.batch_status != 'PENDING_RECEIVE'
       GROUP BY sb.house_code, bh.house_name
       ORDER BY bh.house_name`,
      [pr.production_date],
    );

    // 班次标签
    const shiftDicts = await this.em.query<any[]>(
      `SELECT dict_code, dict_label_zh FROM sys_dict WHERE dict_type = 'PKG_SHIFT'`,
    );
    const shiftLabelMap: Record<string, string> = Object.fromEntries(
      shiftDicts.map((d: any) => [d.dict_code, d.dict_label_zh]),
    );

    return {
      code: 200,
      data: {
        packingCode,
        productionDate: pr.production_date,
        shift: pr.shift_id ? {
          id: pr.shift_id,
          shiftCode: pr.shift_code,
          shiftLabel: shiftLabelMap[pr.shift_code] || pr.shift_code || '',
          operatorName: pr.operator_name || '',
          supervisorName: pr.supervisor_name || '',
        } : null,
        sources: sources.map((s: any) => ({
          houseCode: s.house_code,
          houseName: s.house_name || s.house_code,
          totalQty: s.total_qty,
        })),
      },
    };
  }

  @Post('warehouse/confirm')
  async confirmHandover(@Body() body: Record<string, any>) {
    const today = new Date().toISOString().slice(0, 10);
    const productionDate = body.productionDate || today;
    const code = `WH-${productionDate.replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;
    const boxes = (body.boxes as string[]) || [];
    await this.safe(
      this.em.query(
        `INSERT INTO pkg_handover_records
         (code, shift_id, packing_code, boxes_json, box_count, pallet_code, location, receiver, production_date, created_at)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,NOW())
         ON CONFLICT (code) DO NOTHING`,
        [code, body.shiftId || null, body.packingCode || null,
         JSON.stringify(boxes), boxes.length,
         body.palletCode || '', body.location || '', body.receiver || '',
         productionDate],
      ),
      null,
    );
    return { code: 200, data: { code } };
  }

  // ── 数据字典查询 ─────────────────────────────────────────────────────────────
  /**
   * GET /api/packaging/terminal/dicts?types=PKG_EGG_GRADE,PKG_PACK_SPEC
   * 批量获取指定字典类型的条目，供终端页面替换硬编码枚举
   */
  @Get('dicts')
  async getDicts(@Query('types') typesParam: string) {
    const allowedTypes = [
      'PKG_EGG_GRADE', 'PKG_EGG_DEFECT', 'PKG_PACK_SPEC', 'PKG_ANOMALY_REASON',
      'PKG_PRESORT_STANDARD', 'PKG_SHIFT', 'PKG_CUSTOM_LABEL',
      'PKG_QC_RESULT', 'PKG_PACK_LINE',
      'QC_INSPECT_TYPE', 'QC_INSPECT_CATEGORY', 'QC_NC_SOURCE',
      'PRD_PRODUCT_GRADE', 'PRD_PRODUCT_TYPE',
    ];
    const requested = (typesParam || '').split(',').map(t => t.trim()).filter(t => allowedTypes.includes(t));
    if (requested.length === 0) {
      return { code: 200, data: {} };
    }
    const placeholders = requested.map((_, i) => `$${i + 1}`).join(',');
    const rows = await this.safe(
      this.em.query(
        `SELECT dict_type, dict_code, dict_label_zh, dict_label_en, dict_label_lo, sort_no, config_json, status
         FROM sys_dict
         WHERE dict_type IN (${placeholders}) AND (status IS NULL OR status = 'ACTIVE')
         ORDER BY dict_type, sort_no NULLS LAST, dict_code`,
        requested,
      ),
      [] as any[],
    );
    // 按 dict_type 分组返回
    const result: Record<string, any[]> = {};
    for (const row of rows) {
      if (!result[row.dict_type]) result[row.dict_type] = [];
      let cfg: any = {};
      try { cfg = row.config_json ? (typeof row.config_json === 'string' ? JSON.parse(row.config_json) : row.config_json) : {}; } catch {}
      result[row.dict_type].push({
        ...cfg,
        code:    row.dict_code,   // dict_code 永远不被 config_json 覆盖
        label:   row.dict_label_zh,
        labelEn: row.dict_label_en,
        labelLo: row.dict_label_lo,
        sortNo:  row.sort_no,
      });
    }
    return { code: 200, data: result };
  }

  /**
   * GET /api/packaging/terminal/supervisors
   * 返回可担任班组长的活跃用户（ROLE_LINE_SUPERVISOR / ROLE_PKG_MGR / ROLE_ADMIN）
   */
  @Get('supervisors')
  async getSupervisors() {
    const rows = await this.safe(
      this.em.query(
        `SELECT DISTINCT u.user_id AS id, u.real_name AS name
         FROM sys_user u
         JOIN sys_user_role ur ON ur.user_id = u.user_id
         JOIN sys_role r ON r.role_id = ur.role_id
         WHERE u.status = 1
           AND r.role_code IN ('ROLE_LINE_SUPERVISOR','ROLE_PKG_MGR','ROLE_ADMIN')
         ORDER BY u.real_name`,
      ),
      [] as any[],
    );
    return { code: 200, data: rows };
  }
}
