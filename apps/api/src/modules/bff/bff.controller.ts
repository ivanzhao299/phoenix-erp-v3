import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards, Req, BadRequestException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { AuthGuard } from '@nestjs/passport';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { PackagingInventoryIntegrationService } from '../sales-v2/services/packaging-inventory-integration.service'; // P1C 包装收口
import { DataScopeService } from '../org/services/data-scope.service';
import {
  normalizeUserRoleAssignments,
  UserRoleAssignmentValidationError,
} from './user-role-assignment';
import { SubmitGradingDto } from './dto/grading.dto';

// ═══════════════════════════════════════════════════════════════
//  Phoenix ERP V3 — BFF Controller
//  统一处理前端所需的跨模块聚合路由，避免多个零散模块
// ═══════════════════════════════════════════════════════════════

// ── Dashboard ─────────────────────────────────────────────────────────────────
@Controller('api/dashboard')
@UseGuards(AuthGuard('jwt'), MenuGuard)
@RequireMenu('MENU_DASHBOARD', 'V')
export class DashboardBffController {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  // ═══ V2 fidelity: 主仪表盘 KPI ═══════════════════════════════════════════
  // 来源：_archive/phoenix-backend-v2-sqlite/src/routes/dashboard.js (kpi)
  @Get('kpi')
  async getKpi(@Req() req: any) {
    // ── 组织隔离 scope ────────────────────────────────────────────
    const userStoreCode: string | undefined = req.user?.storeCode;
    const isGlobalKpi =
      !userStoreCode ||
      userStoreCode === 'ALL' ||
      (req.user?.permissions || []).includes('*') ||
      req.user?.username === 'admin';
    const farmKpiCode = isGlobalKpi ? null : userStoreCode;
    // D2（2026-06-28）：非全局用户（如场区经理）只看本场区/本店数据，绝不显示集团口径。
    //   商业类 KPI（库存/POS/直销/预警）统一按 store_code 收口；收口只会"收窄"，永不泄漏集团。
    //   设备/停药等农场域全局查询对受限用户直接跳过（避免跨场泄漏；设备有独立监控页）。
    const scopeStore: string | null = isGlobalKpi ? null : (userStoreCode || null);

    const today = new Date().toISOString().slice(0, 10);
    const safe = async <T,>(p: Promise<T>, fb: T): Promise<T> => { try { return await p; } catch { return fb; } };

    const [stockRow] = await safe(
      this.em.query(
        scopeStore
          ? `SELECT COALESCE(SUM(qty_available),0)::float8 AS total,
                    COUNT(*) FILTER (WHERE COALESCE(qty_available,0) > 0)::int AS batch_count
               FROM inv_batches
              WHERE status='AVAILABLE' AND store_code = $1`
          : `SELECT COALESCE(SUM(qty_available),0)::float8 AS total,
                    COUNT(*) FILTER (WHERE COALESCE(qty_available,0) > 0)::int AS batch_count
               FROM inv_batches
              WHERE status='AVAILABLE'`,
        scopeStore ? [scopeStore] : [],
      ),
      [{ total: 0, batch_count: 0 }],
    );
    const warnRows = await safe(
      this.em.query(
        scopeStore
          ? `SELECT batch_no, store_code, status FROM inv_batches WHERE status IN ('EXPIRY_WARN','EXPIRED') AND store_code = $1`
          : `SELECT batch_no, store_code, status FROM inv_batches WHERE status IN ('EXPIRY_WARN','EXPIRED')`,
        scopeStore ? [scopeStore] : [],
      ),
      [],
    );
    const recvRows = await safe(
      this.em.query(
        scopeStore
          ? `SELECT order_no, store_code FROM store_receiving WHERE status='PENDING' AND store_code = $1`
          : `SELECT order_no, store_code FROM store_receiving WHERE status='PENDING'`,
        scopeStore ? [scopeStore] : [],
      ),
      [],
    );
    const [todaySales] = await safe(
      this.em.query(
        scopeStore
          ? `SELECT COALESCE(SUM(net_amount),0)::float8 AS total, COUNT(*)::int AS txns
               FROM pos_sales WHERE substr(created_at::text,1,10) = $1 AND store_code = $2`
          : `SELECT COALESCE(SUM(net_amount),0)::float8 AS total, COUNT(*)::int AS txns
               FROM pos_sales WHERE substr(created_at::text,1,10) = $1`,
        scopeStore ? [today, scopeStore] : [today],
      ),
      [{ total: 0, txns: 0 }],
    );

    // 今日农场直销额（手工录入，来源：ord_orders FARM_SALE）
    const [todayFarmSales] = await safe(
      this.em.query(
        scopeStore
          ? `SELECT COALESCE(SUM(total_amount),0)::float8 AS total
               FROM ord_orders
              WHERE order_type = 'FARM_SALE' AND order_date::text = $1 AND status != 'CANCELLED' AND store_code = $2`
          : `SELECT COALESCE(SUM(total_amount),0)::float8 AS total
               FROM ord_orders
              WHERE order_type = 'FARM_SALE' AND order_date::text = $1 AND status != 'CANCELLED'`,
        scopeStore ? [today, scopeStore] : [today],
      ),
      [{ total: 0 }],
    );

    // 今日产蛋
    const [eggsRow] = await safe(
      this.em.query(
        farmKpiCode
          ? `SELECT COALESCE(SUM(eggs_produced),0)::int AS today_eggs
               FROM brd_daily_logs WHERE log_date::text = $1 AND farm_code = $2`
          : `SELECT COALESCE(SUM(eggs_produced),0)::int AS today_eggs
               FROM brd_daily_logs WHERE log_date::text = $1`,
        farmKpiCode ? [today, farmKpiCode] : [today],
      ),
      [{ today_eggs: 0 }],
    );
    const todayEggs = Number(eggsRow?.today_eggs) || 0;
    // Keep all laying flock population aligned with /api/v3/farm overview/trend.
    const [flockRow] = await safe(
      this.em.query(
        farmKpiCode
          ? `SELECT COALESCE(SUM(current_qty),0)::int AS total FROM brd_flocks WHERE UPPER(status) IN ('LAYING','PEAK','DECLINING') AND farm_code = $1`
          : `SELECT COALESCE(SUM(current_qty),0)::int AS total FROM brd_flocks WHERE UPPER(status) IN ('LAYING','PEAK','DECLINING')`,
        farmKpiCode ? [farmKpiCode] : [],
      ),
      [{ total: 0 }],
    );
    const layingTotal = Number(flockRow?.total) || 0;
    const todayLayRate = layingTotal > 0 ? Number(((todayEggs / layingTotal) * 100).toFixed(1)) : null;

    // 停药期预警（农场域全局表；受限用户跳过，避免跨场泄漏）
    const withdrawRows = scopeStore ? [] : await safe(
      this.em.query(
        `SELECT id, batch_no, medicine, farm_house, end_date
           FROM brd_medications
          WHERE end_date::date >= CURRENT_DATE AND end_date::date <= CURRENT_DATE + INTERVAL '5 days'`,
      ),
      [],
    );

    // 设备环境快报（全局；受限用户跳过——设备有独立监控页 /breeding/device，避免跨场泄漏）
    const [deviceAlertRow] = scopeStore ? [{ cnt: 0 }] : await safe(
      this.em.query(`SELECT COUNT(*)::int AS cnt FROM mon_device_alert_event WHERE status IN ('OPEN','CONFIRMED')`),
      [{ cnt: 0 }],
    );
    const [offlineRow] = scopeStore ? [{ cnt: 0 }] : await safe(
      this.em.query(`SELECT COUNT(DISTINCT erp_house_code)::int AS cnt FROM mon_device_realtime_snapshot WHERE COALESCE(updated_at, collect_time) < (now() - INTERVAL '30 minutes')`),
      [{ cnt: 0 }],
    );
    const [hottestRow] = scopeStore ? [null] : await safe(
      this.em.query(`SELECT erp_house_code, value FROM mon_device_realtime_snapshot WHERE property_code='2001' ORDER BY value DESC NULLS LAST LIMIT 1`),
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

    // 7 天销售趋势（POS 收银，按 DOW）
    const chartRows: any[] = await safe(
      this.em.query(
        scopeStore
          ? `SELECT EXTRACT(DOW FROM created_at::timestamp)::int AS dow,
                    COALESCE(SUM(net_amount),0)::float8 AS sales, COUNT(*)::int AS txns
               FROM pos_sales
              WHERE substr(created_at::text,1,10) >= to_char(CURRENT_DATE - INTERVAL '7 days','YYYY-MM-DD') AND store_code = $1
              GROUP BY dow ORDER BY dow`
          : `SELECT EXTRACT(DOW FROM created_at::timestamp)::int AS dow,
                    COALESCE(SUM(net_amount),0)::float8 AS sales, COUNT(*)::int AS txns
               FROM pos_sales
              WHERE substr(created_at::text,1,10) >= to_char(CURRENT_DATE - INTERVAL '7 days','YYYY-MM-DD')
              GROUP BY dow ORDER BY dow`,
        scopeStore ? [scopeStore] : [],
      ),
      [],
    );

    // 7 天农场直销趋势（按 DOW）
    const farmChartRows: any[] = await safe(
      this.em.query(
        scopeStore
          ? `SELECT EXTRACT(DOW FROM order_date)::int AS dow, COALESCE(SUM(total_amount),0)::float8 AS sales
               FROM ord_orders
              WHERE order_type = 'FARM_SALE' AND order_date >= (CURRENT_DATE - INTERVAL '7 days')
                AND status != 'CANCELLED' AND store_code = $1
              GROUP BY dow ORDER BY dow`
          : `SELECT EXTRACT(DOW FROM order_date)::int AS dow, COALESCE(SUM(total_amount),0)::float8 AS sales
               FROM ord_orders
              WHERE order_type = 'FARM_SALE' AND order_date >= (CURRENT_DATE - INTERVAL '7 days')
                AND status != 'CANCELLED'
              GROUP BY dow ORDER BY dow`,
        scopeStore ? [scopeStore] : [],
      ),
      [],
    );

    const days = ['日', '一', '二', '三', '四', '五', '六'];
    const eggsUnit = todayLayRate != null
      ? `枚 (今日·产蛋率 ${todayLayRate}%)`
      : `枚 (今日产蛋)`;

    // 生成最近 7 天（含今日）按日期合并两渠道
    const last7: string[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });
    const eggChartRows: any[] = await safe(
      this.em.query(
        farmKpiCode
          ? `SELECT log_date::text AS day, COALESCE(SUM(eggs_produced),0)::int AS eggs
               FROM brd_daily_logs
              WHERE log_date >= (CURRENT_DATE - INTERVAL '6 days') AND farm_code = $1
              GROUP BY day ORDER BY day`
          : `SELECT log_date::text AS day, COALESCE(SUM(eggs_produced),0)::int AS eggs
               FROM brd_daily_logs
              WHERE log_date >= (CURRENT_DATE - INTERVAL '6 days')
              GROUP BY day ORDER BY day`,
        farmKpiCode ? [farmKpiCode] : [],
      ),
      [],
    );
    const mergedChart = last7.map(dateStr => {
      const dow  = new Date(dateStr).getDay();
      const posR  = chartRows.find((r: any) => Number(r.dow) === dow);
      const farmR = farmChartRows.find((f: any) => Number(f.dow) === dow);
      const eggR = eggChartRows.find((e: any) => String(e.day).slice(0, 10) === dateStr);
      return {
        day:       `周${days[dow]}`,
        sales:     posR  ? Number(posR.sales)  : 0,
        farmSales: farmR ? Number(farmR.sales) : 0,
        prod:      eggR  ? Math.round(Number(eggR.eggs) / 1000) : 0,
      };
    });

    return {
      code: 200,
      data: {
        stats: {
          eggs:      { value: todayEggs.toLocaleString(), unit: '枚', trend: null },
          stock:     {
            value: layingTotal.toLocaleString('zh-CN'),
            unit: '羽',
            trend: null,
          },
          salesPos:  { value: Number(todaySales?.total    || 0).toFixed(0), unit: 'LAK' },
          salesFarm: { value: Number(todayFarmSales?.total || 0).toFixed(0), unit: 'LAK' },
          alerts:    { value: String(totalAlerts + deviceStats.activeAlerts), unit: '条', alert: (totalAlerts + deviceStats.activeAlerts) > 0 },
        },
        chartData: mergedChart,
        alertList,
        deviceStats,
        // D2：标识本次返回是否集团口径（false=已按用户 store/farm 收口），供前端切换标题
        isGroupView: isGlobalKpi,
        scopeCode: scopeStore,
        meta: {
          today,
          layingTotal,
          todayEggs,
          todayLayRate,
          scopeStore,
          posTxnCount: Number(todaySales?.txns) || 0,
          stockAvailableTotal: Number(stockRow?.total || 0),
          stockAvailableBatchCount: Number(stockRow?.batch_count) || 0,
          stockMetricSource: 'UPPER(brd_flocks.status) IN LAYING/PEAK/DECLINING SUM(current_qty)',
          eggInventoryMetricSource: 'inv_batches.status=AVAILABLE SUM(qty_available)',
          farmSalesAmount: Number(todayFarmSales?.total || 0),
        },
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
          WHERE store_code = $1 AND substr(created_at::text,1,10) >= to_char(CURRENT_DATE - INTERVAL '7 days','YYYY-MM-DD')`,
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
          WHERE s.store_code = $1 AND substr(s.created_at::text,1,10) >= to_char(CURRENT_DATE - INTERVAL '7 days','YYYY-MM-DD')`,
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
          WHERE store_code = $1 AND substr(created_at::text,1,10) >= to_char(CURRENT_DATE - INTERVAL '7 days','YYYY-MM-DD')
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
          WHERE s.store_code = $1 AND substr(s.created_at::text,1,10) >= to_char(CURRENT_DATE - INTERVAL '7 days','YYYY-MM-DD')
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
@UseGuards(AuthGuard('jwt'), MenuGuard)
@RequireMenu('MENU_SETTINGS_USER', 'V')
export class UsersBffController {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private userStatusLabel(status: any): string {
    const n = Number(status);
    if (n === 1) return 'ACTIVE';
    if (n === -1) return 'ARCHIVED';
    return 'FROZEN';
  }

  private parseUserStatus(status: any): number | null {
    const s = String(status || '').toUpperCase();
    if (s === 'ACTIVE') return 1;
    if (s === 'FROZEN' || s === 'INACTIVE') return 0;
    if (s === 'ARCHIVED') return -1;
    return null;
  }

  private async validateUserLifecycleChange(
    userId: string,
    actorUserId: number | undefined,
    nextStatus: number,
    action: 'status' | 'archive' | 'restore',
  ): Promise<{ ok: true; user: any } | { ok: false; code: number; msg: string }> {
    const rows = await this.em.query(
      `SELECT u.user_id, u.username, u.real_name, u.status
         FROM sys_user u
        WHERE u.user_id = $1
        LIMIT 1`,
      [userId],
    );
    const user = rows[0];
    if (!user) return { ok: false, code: 404, msg: '用户不存在' };

    if (String(user.username).toLowerCase() === 'admin') {
      return { ok: false, code: 409, msg: '系统特权总控账号不可冻结、归档或恢复' };
    }

    if (actorUserId && Number(user.user_id) === Number(actorUserId) && nextStatus !== 1) {
      return { ok: false, code: 409, msg: '不能冻结或归档当前登录账号' };
    }

    if (action === 'status' && Number(user.status) === -1) {
      return { ok: false, code: 409, msg: '归档用户不能直接启用或冻结，请先执行恢复归档' };
    }

    if (nextStatus !== 1) {
      const roleRows = await this.em.query(
        `SELECT 1
           FROM sys_user_role ur
           JOIN sys_role r ON r.role_id = ur.role_id
          WHERE ur.user_id = $1
            AND r.role_code = 'ROLE_ADMIN'
            AND COALESCE(ur.is_visible, true) = true
          LIMIT 1`,
        [userId],
      );
      if (roleRows[0]) {
        const adminRows = await this.em.query(
          `SELECT COUNT(DISTINCT u.user_id)::int AS c
             FROM sys_user u
             JOIN sys_user_role ur ON ur.user_id = u.user_id
             JOIN sys_role r ON r.role_id = ur.role_id
            WHERE u.status = 1
              AND r.role_code = 'ROLE_ADMIN'
              AND COALESCE(ur.is_visible, true) = true
              AND u.user_id <> $1`,
          [userId],
        );
        if (Number(adminRows[0]?.c || 0) < 1) {
          return { ok: false, code: 409, msg: '不能冻结或归档最后一个有效管理员账号' };
        }
      }
    }

    return { ok: true, user };
  }

  private async ensureUserEditable(userId: string): Promise<{ ok: true } | { ok: false; code: number; msg: string }> {
    const rows = await this.em.query(`SELECT status FROM sys_user WHERE user_id=$1 LIMIT 1`, [userId]);
    if (!rows[0]) return { ok: false, code: 404, msg: '用户不存在' };
    if (Number(rows[0].status) === -1) return { ok: false, code: 409, msg: '归档用户不可编辑，请先恢复归档' };
    return { ok: true };
  }

  /** GET /api/users — 用户列表（含所有角色信息）*/
  @Get()
  async getUsers() {
    try {
	      const data = await this.em.query(
	        `SELECT
	           u.user_id AS id, u.username, u.real_name AS real_name_zh, u.store_code,
	           CASE WHEN u.status = 1 THEN 'ACTIVE' WHEN u.status = -1 THEN 'ARCHIVED' ELSE 'FROZEN' END AS status,
	           u.locale, u.email, u.phone, u.archived_at, u.archive_reason, u.archived_by,
           -- 主组织 id（FIX 2026-06-04: sys_user 表无 org_id 列；通过 sys_user_orgs 取主组织）
           (SELECT uo.org_id FROM sys_user_orgs uo
              WHERE uo.user_id = u.user_id AND uo.is_primary = true LIMIT 1) AS org_id,
           COALESCE(u.note, 'REAL') AS user_type,
           COALESCE(
	             (SELECT r.role_code FROM sys_user_role ur
	              JOIN sys_role r ON ur.role_id = r.role_id
	              WHERE ur.user_id = u.user_id AND ur.is_primary = true
	                AND COALESCE(ur.is_visible, true) = true LIMIT 1),
	             (SELECT r.role_code FROM sys_user_role ur
	              JOIN sys_role r ON ur.role_id = r.role_id
	              WHERE ur.user_id = u.user_id
	                AND COALESCE(ur.is_visible, true) = true LIMIT 1)
	           ) AS role,
	           COALESCE(
	             (SELECT r.role_name_zh FROM sys_user_role ur
	              JOIN sys_role r ON ur.role_id = r.role_id
	              WHERE ur.user_id = u.user_id AND ur.is_primary = true
	                AND COALESCE(ur.is_visible, true) = true LIMIT 1),
	             (SELECT r.role_name_zh FROM sys_user_role ur
	              JOIN sys_role r ON ur.role_id = r.role_id
	              WHERE ur.user_id = u.user_id
	                AND COALESCE(ur.is_visible, true) = true LIMIT 1)
	           ) AS role_name_zh,
	           COALESCE(
	             (SELECT json_agg(json_build_object(
	               'role_code', r.role_code,
	               'role_name_zh', r.role_name_zh,
	               'approval_level', r.approval_level,
	               'is_primary', ur.is_primary,
	               'is_visible', COALESCE(ur.is_visible, true)
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
  @RequireMenu('MENU_SETTINGS_USER', 'C')
  async createUser(@Body() body: any, @Req() req: any) {
    const { username, real_name_zh, role, store_code, password, user_type, org_bindings } = body || {};
    if (!username || !real_name_zh) return { code: 400, msg: '用户名和姓名为必填项' };
    if (!password || password.length < 8) return { code: 400, msg: '密码至少 8 位' };
    try {
      const bcrypt = await import('bcrypt');
      const password_hash = await bcrypt.hash(password, 10);
      // G76：store_code 默认 null（不再 'ALL' 全局）——store_code 已降为 POS 行级专用；
      //   数据范围唯一源 = 组织绑定 sys_user_orgs（下方原子写入）。
      const inserted = await this.em.query(
        `INSERT INTO sys_user (username, password_hash, real_name, store_code, status, locale, note, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 1, 'zh-CN', $5, now(), now()) RETURNING user_id`,
        [username, password_hash, real_name_zh, store_code || null, user_type === 'TEST' ? 'TEST' : null],
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
      // G76：原子写组织绑定（sys_user_orgs）→ 用户在创建时即挂到组织树，决定数据范围
      if (Array.isArray(org_bindings) && userId) {
        await this.writeUserOrgBindings(userId, org_bindings);
      }
      return { code: 200, msg: `用户 ${username} 创建成功`, data: { id: userId } };
    } catch (e: any) {
      if (e?.code === '23505') return { code: 409, msg: `用户名 "${username}" 已存在` };
      return { code: 500, msg: e?.message || '创建失败' };
    }
  }

  /** PUT /api/users/:id — 更新基本信息（含组织绑定 org_bindings）*/
  @Put(':id')
  @RequireMenu('MENU_SETTINGS_USER', 'E')
	  async updateUser(@Param('id') id: string, @Body() body: any) {
	    try {
	      const editable = await this.ensureUserEditable(id);
	      if (!editable.ok) return { code: editable.code, msg: editable.msg };
	      const fields: string[] = [];
      const params: any[] = [];
      let idx = 1;
      if (body.real_name_zh !== undefined) { fields.push(`real_name=$${idx++}`);  params.push(body.real_name_zh); }
      if (body.real_name    !== undefined) { fields.push(`real_name=$${idx++}`);  params.push(body.real_name); }
      // G76：store_code 仅 POS 行级用；不再默认 'ALL'（空即空，范围由组织绑定决定）
      if (body.store_code   !== undefined) { fields.push(`store_code=$${idx++}`); params.push(body.store_code || null); }
      if (body.locale       !== undefined) { fields.push(`locale=$${idx++}`);     params.push(body.locale); }
      if (fields.length) {
        params.push(id);
        await this.em.query(`UPDATE sys_user SET ${fields.join(', ')}, updated_at=now() WHERE user_id=$${idx}`, params);
      }
      // G76：组织绑定（数据范围唯一源）—— 传 org_bindings 则整组替换
      if (Array.isArray(body.org_bindings)) {
        await this.em.query(`DELETE FROM sys_user_orgs WHERE user_id=$1`, [id]);
        await this.writeUserOrgBindings(Number(id), body.org_bindings);
        // 变更范围 → bump perms_version 强制重算（DataScope 缓存 30s，bump 立即失效）
        await this.em.query(`UPDATE sys_user SET perms_version=COALESCE(perms_version,1)+1 WHERE user_id=$1`, [id]);
      }
      if (!fields.length && !Array.isArray(body.org_bindings)) return { code: 400, msg: '无更新内容' };
      return { code: 200, msg: '用户信息已更新' };
    } catch (e: any) { return { code: 500, msg: e?.message }; }
  }

  /**
   * G76：写用户组织绑定（sys_user_orgs）。org_bindings: [{org_code, scope_level?, is_primary?}]。
   *   按 org_code 解析 org_id；幂等（已存在则更新范围级别/主标）。数据范围唯一源。
   */
  private async writeUserOrgBindings(
    userId: number,
    bindings: Array<{ org_code?: string; scope_level?: string; is_primary?: boolean }>,
  ): Promise<void> {
    for (const b of bindings) {
      if (!b?.org_code) continue;
      const orgRow = await this.em.query(
        `SELECT id FROM sys_organizations WHERE org_code=$1 AND status='ACTIVE' LIMIT 1`, [b.org_code],
      );
      if (!orgRow[0]) continue;
      await this.em.query(
        `INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code)
         SELECT $1,$2,$3,$4,$5
         WHERE NOT EXISTS (SELECT 1 FROM sys_user_orgs WHERE user_id=$1 AND org_id=$2)`,
        [userId, orgRow[0].id, !!b.is_primary, b.scope_level || 'COMPANY', b.org_code],
      );
    }
  }

  /** PUT /api/users/:id/status — 启用/冻结 */
  @Put(':id/status')
  @RequireMenu('MENU_SETTINGS_USER', 'E')
  async setStatus(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    try {
      const statusInt = this.parseUserStatus(body?.status);
      if (statusInt === null || statusInt === -1) return { code: 400, msg: '无效状态 (ACTIVE/FROZEN)' };
      const validation = await this.validateUserLifecycleChange(id, req?.user?.userId, statusInt, 'status');
      if (!validation.ok) return { code: validation.code, msg: validation.msg };
      await this.em.query(
        `UPDATE sys_user
            SET status=$1,
                perms_version=COALESCE(perms_version,0)+1,
                updated_at=now()
          WHERE user_id=$2`,
        [statusInt, id],
      );
      return { code: 200, msg: '状态已更新', data: { id, status: this.userStatusLabel(statusInt) } };
    } catch (e: any) { return { code: 500, msg: e?.message }; }
  }

  /** PUT /api/users/:id/archive — 归档用户（保留历史引用，不物理删除） */
  @Put(':id/archive')
  @RequireMenu('MENU_SETTINGS_USER', 'D')
  async archiveUser(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    try {
      const validation = await this.validateUserLifecycleChange(id, req?.user?.userId, -1, 'archive');
      if (!validation.ok) return { code: validation.code, msg: validation.msg };
      await this.em.query(
        `UPDATE sys_user
            SET status=-1,
                archived_at=now(),
                archived_by=$2,
                archive_reason=NULLIF($3, ''),
                perms_version=COALESCE(perms_version,0)+1,
                updated_at=now()
          WHERE user_id=$1`,
        [id, req?.user?.userId || null, String(body?.reason || '').trim()],
      );
      return { code: 200, msg: '用户已归档', data: { id, status: 'ARCHIVED' } };
    } catch (e: any) { return { code: 500, msg: e?.message }; }
  }

  /** PUT /api/users/:id/restore — 恢复归档到冻结态，需再人工启用 */
  @Put(':id/restore')
  @RequireMenu('MENU_SETTINGS_USER', 'E')
  async restoreUser(@Param('id') id: string) {
    try {
      const rows = await this.em.query(
        `UPDATE sys_user
            SET status=0,
                archived_at=NULL,
                archived_by=NULL,
                archive_reason=NULL,
                perms_version=COALESCE(perms_version,0)+1,
                updated_at=now()
          WHERE user_id=$1 AND status=-1
          RETURNING user_id`,
        [id],
      );
      if (!rows[0]) return { code: 404, msg: '归档用户不存在或无需恢复' };
      return { code: 200, msg: '用户已恢复至冻结态，请复核后再启用', data: { id, status: 'FROZEN' } };
    } catch (e: any) { return { code: 500, msg: e?.message }; }
  }

  /** PUT /api/users/:id/role — 设置主角色（保留已有副角色）*/
  @Put(':id/role')
  @RequireMenu('MENU_SETTINGS_USER', 'E')
	  async setRole(@Param('id') id: string, @Body() body: any) {
	    const { role } = body || {};
	    if (!role) return { code: 400, msg: 'role 必填' };
	    try {
	      const editable = await this.ensureUserEditable(id);
	      if (!editable.ok) return { code: editable.code, msg: editable.msg };
	      const roleRow = await this.em.query(`SELECT role_id FROM sys_role WHERE role_code=$1`, [role]);
      if (!roleRow[0]) return { code: 400, msg: `角色 ${role} 不存在` };
      const roleId = roleRow[0].role_id;
      await this.em.transaction(async (mgr) => {
        // 清除旧 primary，再设新 primary；同一事务避免中途失败留下“无主角色”状态。
        await mgr.query(`UPDATE sys_user_role SET is_primary=false WHERE user_id=$1`, [id]);
        await mgr.query(
          `INSERT INTO sys_user_role (user_id, role_id, is_primary, is_visible, granted_at)
           VALUES ($1, $2, true, true, now())
           ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary=true, is_visible=true`,
          [id, roleId],
        );
        await mgr.query(`UPDATE sys_user SET perms_version=COALESCE(perms_version,0)+1, updated_at=now() WHERE user_id=$1`, [id]);
      });
      return { code: 200, msg: '主角色已更新' };
    } catch (e: any) { return { code: 500, msg: e?.message }; }
  }

  /** PUT /api/users/:id/roles — 全量设置用户角色列表（多角色）*/
  @Put(':id/roles')
  @RequireMenu('MENU_SETTINGS_USER', 'E')
	  async setRoles(@Param('id') id: string, @Body() body: any) {
    // body: { roles: [{ role_code, is_primary, is_visible }] }
    const { roles } = body || {};
	    if (!Array.isArray(roles)) return { code: 400, msg: 'roles 必须是数组' };
	    try {
	      const editable = await this.ensureUserEditable(id);
	      if (!editable.ok) return { code: editable.code, msg: editable.msg };
	      // 获取角色 ID 映射
      const allRoles = await this.em.query(`SELECT role_id, role_code FROM sys_role`);
      const resolved = normalizeUserRoleAssignments(roles, allRoles);

      // 事务：删旧 → 插新
      await this.em.transaction(async (mgr) => {
        await mgr.query(`DELETE FROM sys_user_role WHERE user_id=$1`, [id]);
        for (const r of resolved) {
          await mgr.query(
	            `INSERT INTO sys_user_role (user_id, role_id, is_primary, is_visible, granted_at) VALUES ($1, $2, $3, $4, now())`,
	            [id, r.role_id, r.is_primary, r.is_visible],
	          );
	        }
        // 触发权限刷新
        await mgr.query(
          `UPDATE sys_user SET perms_version=COALESCE(perms_version,0)+1, updated_at=now() WHERE user_id=$1`,
          [id],
        );
      });
	      return { code: 200, msg: '角色已更新', data: { count: resolved.length, roles: resolved } };
	    } catch (e: any) {
        if (e instanceof UserRoleAssignmentValidationError) return { code: 400, msg: e.message };
        return { code: 500, msg: e?.message };
      }
	  }

	  /**
	   * PUT /api/users/:id/role-visibility
	   * 历史字段名保留。当前语义：is_visible=false 代表该用户角色授权停用，
	   * 不再参与登录 token、权限计算和前端展示；is_visible=true 恢复该角色授权。
	   */
	  @Put(':id/role-visibility')
	  @RequireMenu('MENU_SETTINGS_USER', 'E')
	  async updateRoleVisibility(@Param('id') id: string, @Body() body: any) {
		    const items: { role_code: string; is_visible: boolean }[] = body?.items || [];
		    if (!Array.isArray(items)) return { code: 400, msg: 'items 必须是数组' };
		    try {
		      const editable = await this.ensureUserEditable(id);
		      if (!editable.ok) return { code: editable.code, msg: editable.msg };
		      await this.em.transaction(async (mgr) => {
	        for (const it of items) {
	          if (typeof it?.role_code !== 'string' || typeof it?.is_visible !== 'boolean') continue;
	          await mgr.query(
	            `UPDATE sys_user_role ur
	                SET is_visible = $1
	               FROM sys_role r
	              WHERE ur.role_id = r.role_id
	                AND ur.user_id = $2
	                AND r.role_code = $3`,
	            [it.is_visible, id, it.role_code],
	          );
	        }
	        await mgr.query(
	          `UPDATE sys_user_role SET is_primary=false WHERE user_id=$1 AND COALESCE(is_visible, true)=false`,
	          [id],
	        );
	        await mgr.query(
	          `UPDATE sys_user_role ur
	              SET is_primary=true
	            WHERE ur.user_id=$1
	              AND COALESCE(ur.is_visible, true)=true
	              AND NOT EXISTS (
	                SELECT 1 FROM sys_user_role current_primary
	                 WHERE current_primary.user_id=$1
	                   AND current_primary.is_primary=true
	                   AND COALESCE(current_primary.is_visible, true)=true
	              )
	              AND ur.role_id=(
	                SELECT candidate.role_id
	                  FROM sys_user_role candidate
	                  JOIN sys_role r ON r.role_id=candidate.role_id
	                 WHERE candidate.user_id=$1 AND COALESCE(candidate.is_visible, true)=true
	                 ORDER BY COALESCE(r.approval_level, 0) DESC, r.role_code
	                 LIMIT 1
	              )`,
	          [id],
	        );
	        await mgr.query(
	          `UPDATE sys_user SET perms_version=COALESCE(perms_version,0)+1, updated_at=now() WHERE user_id=$1`,
	          [id],
	        );
	      });
	      return { code: 200, msg: '角色授权状态已更新', data: { id, updated: items.length } };
	    } catch (e: any) { return { code: 500, msg: e?.message }; }
	  }

	  /** PUT /api/users/:id/password — 重置密码 */
  @Put(':id/password')
  @RequireMenu('MENU_SETTINGS_USER', 'E')
	  async resetPassword(@Param('id') id: string, @Body() body: any) {
	    const { password } = body || {};
	    if (!password || password.length < 8) return { code: 400, msg: '密码至少 8 位' };
	    try {
	      const editable = await this.ensureUserEditable(id);
	      if (!editable.ok) return { code: editable.code, msg: editable.msg };
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
@UseGuards(AuthGuard('jwt'), MenuGuard)
@RequireMenu('MENU_DASHBOARD', 'V', ['MENU_ANALYTICS'])
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
@UseGuards(AuthGuard('jwt'), MenuGuard)
@RequireMenu('MENU_SETTINGS_AUDIT', 'V')
export class AuditBffController {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  @Get('logs')
  async getLogs(
    @Query('limit') limitRaw = '50',
    @Query('offset') offsetRaw = '0',
    @Query('action') action = '',
    @Query('q') q = '',
    @Query('date_from') dateFrom = '',
    @Query('date_to') dateTo = '',
  ) {
    const limit = Math.min(Math.max(Number(limitRaw) || 50, 1), 1000);
    const offset = Math.max(Number(offsetRaw) || 0, 0);
    const where: string[] = [];
    const params: any[] = [];
    const addParam = (value: any) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (action && action !== 'ALL') {
      where.push(`action = ${addParam(action)}`);
    }
    if (q.trim()) {
      const p = addParam(`%${q.trim()}%`);
      where.push(`(doc_type ILIKE ${p} OR action ILIKE ${p} OR comment ILIKE ${p} OR approver_role ILIKE ${p})`);
    }
    if (dateFrom) {
      where.push(`created_at >= ${addParam(dateFrom)}`);
    }
    if (dateTo) {
      where.push(`created_at < (${addParam(dateTo)}::date + INTERVAL '1 day')`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countParams = [...params];
    const rowsParams = [...params, limit, offset];
    try {
      const [countRows, data] = await Promise.all([
        this.em.query(`SELECT COUNT(*)::int AS total FROM sys_approval_log ${whereSql}`, countParams),
        this.em.query(
          `SELECT id, doc_type, doc_id, approver_role, approver_id, action, comment, created_at
             FROM sys_approval_log
             ${whereSql}
            ORDER BY created_at DESC, id DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          rowsParams,
        ),
      ]);
      return { code: 200, data, total: Number(countRows[0]?.total || 0) };
    } catch (e: any) {
      return { code: 200, data: [], total: 0, error: e?.message };
    }
  }

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
  @RequireMenu('MENU_SETTINGS_AUDIT', 'E')
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
  @RequireMenu('MENU_SETTINGS_AUDIT', 'E')
  async freezeAccount(@Param('id') id: string) {
    return { code: 200, msg: `账户 ${id} 已标记冻结`, data: { id } };
  }
}

// ── Pricing ───────────────────────────────────────────────────────────────────
@Controller('api/pricing')
@UseGuards(AuthGuard('jwt'), MenuGuard)
@RequireMenu('MENU_SALES2_PRICE', 'V')
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
  @RequireMenu('MENU_SALES2_PRICE', 'E')
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
@UseGuards(AuthGuard('jwt'), MenuGuard)
@RequireMenu('MENU_SALES2_CUSTOMER', 'V')
export class WholesaleBffController {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  @Get('distributors')
  async getDistributors(@Query('limit') limit = '200') {
    // [Phase G1] 统一读取 sal_customers（customer_type=DISTRIBUTOR）
    // 字段映射兼容原 b2b_customers 响应结构，前端无感知
    try {
      const data = await this.em.query(
        `SELECT id,
                customer_no       AS customer_code,
                customer_name,
                contact_name      AS contact,
                contact_phone     AS phone,
                delivery_address  AS address,
                credit_limit,
                credit_used,
                status,
                created_at,
                updated_at
           FROM sal_customers
          WHERE customer_type = 'DISTRIBUTOR'
          ORDER BY created_at DESC LIMIT $1`,
        [parseInt(limit)],
      ).catch(() => []);
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }

  @Put('distributors/:id')
  @RequireMenu('MENU_SALES2_CUSTOMER', 'E')
  async updateDistributor(@Param('id') id: string, @Body() body: any) {
    return { code: 200, msg: '经销商信息已更新' };
  }
}

// ── Packaging Terminal BFF ─────────────────────────────────────────────────────
// Terminal 作业台专用接口，区别于 PC 端的 PackagingBffController
// 接口前缀：/api/packaging/terminal
@Controller('api/packaging/terminal')
@UseGuards(AuthGuard('jwt'), MenuGuard)
@RequireMenu('MENU_PKG_OP', 'V')
export class PackagingTerminalBffController {
  constructor(
    @InjectEntityManager() private readonly em: EntityManager,
    // P1C 收口：真实车间流 成品交接 → 生成 Sales V2 可售库存（唯一库存入口）
    private readonly pkgInv: PackagingInventoryIntegrationService,
    private readonly dataScopeService?: DataScopeService,
  ) {}

  private get today() { return new Date().toISOString().slice(0, 10); }

  private safe = async <T,>(p: Promise<T>, fb: T): Promise<T> => {
    try { return await p; } catch { return fb; }
  };

  private async assertActiveHouseScope(houseCode: string) {
    if (!this.dataScopeService) throw new InternalServerErrorException('鸡舍归属校验服务不可用');
    await this.dataScopeService.assertActiveHouseOwnership(houseCode);
  }

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
  @RequireMenu('MENU_PKG_OP', 'E', ['MENU_PROD_COLLECTION'])
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
        // R3：不再默认 'site-01'；记录真实场站（前端开班必选）。未传则 NULL（模式回落 COMPANY/GROUP）。
        body.siteId || body.site_id || null,
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
  @RequireMenu('MENU_PKG_OP', 'E', ['MENU_PROD_COLLECTION'])
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
           WHERE production_date = $1 AND status = 'ACTIVE'
         )
         SELECT psb.*,
                COALESCE(bh.house_name, psb.house_code) AS house_name,
                GREATEST(
                  COALESCE(NULLIF(psb.total_qty, 0), NULLIF(psb.received_qty, 0), 0)
                  - COALESCE(psb.dirty_qty, 0) - COALESCE(psb.cracked_qty, 0),
                  0
                )::int AS gradable_qty,
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
                wi.house_code, bh.house_name, wi.shift_no,
                wi.collect_date AS lay_date, wi.qty AS expected_qty,
                wi.weight_kg AS expected_weight,
                'PENDING_RECEIVE' AS batch_status
         FROM wms_inbound wi
         LEFT JOIN brd_houses bh ON bh.house_code = wi.house_code
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
        `SELECT psb.id::text, psb.batch_code, psb.batch_code AS code,
                psb.house_code, bh.house_name, psb.flock_code, psb.lay_date,
                expected_qty, expected_weight, container_count,
                batch_status
         FROM pkg_source_batches psb
         LEFT JOIN brd_houses bh ON bh.house_code = psb.house_code
         WHERE psb.batch_status = 'PENDING_RECEIVE'
         ORDER BY psb.created_at DESC LIMIT 20`,
      ),
      [],
    );
    return { code: 200, data: [...fromPkg, ...fromWms] };
  }

  @Get('grading/pending')
  async getPendingGradingSourceBatches(@Query('shiftId') shiftId: string) {
    const shiftIdNum = Number(shiftId);
    if (!Number.isInteger(shiftIdNum) || shiftIdNum <= 0) {
      throw new BadRequestException('shiftId 必须是正整数');
    }
    const [shift] = await this.em.query<any[]>(
      `SELECT id, status FROM pkg_work_shifts WHERE id = $1`,
      [shiftIdNum],
    );
    if (!shift || shift.status !== 'OPEN') {
      throw new ConflictException('当前班次不存在或已关闭，禁止分级');
    }
    const rows = await this.em.query<any[]>(
      `SELECT psb.id, psb.batch_code, psb.shift_id, psb.house_code,
              COALESCE(bh.house_name, psb.house_code) AS house_name,
              COALESCE(NULLIF(psb.total_qty, 0), NULLIF(psb.received_qty, 0), 0)::int AS received_qty,
              COALESCE(psb.dirty_qty, 0)::int AS dirty_qty,
              COALESCE(psb.cracked_qty, 0)::int AS cracked_qty,
              GREATEST(
                COALESCE(NULLIF(psb.total_qty, 0), NULLIF(psb.received_qty, 0), 0)
                - COALESCE(psb.dirty_qty, 0) - COALESCE(psb.cracked_qty, 0)
                - COALESCE(linked.input_qty, 0), 0
              )::int AS gradable_qty
         FROM pkg_source_batches psb
         LEFT JOIN brd_houses bh ON bh.house_code = psb.house_code
         LEFT JOIN (
           SELECT gsl.source_batch_id, SUM(gsl.input_qty)::int AS input_qty
             FROM pkg_grading_source_links gsl
             JOIN pkg_grading_records gr ON gr.id = gsl.grading_id AND gr.status = 'ACTIVE'
            GROUP BY gsl.source_batch_id
         ) linked ON linked.source_batch_id = psb.id
        WHERE psb.shift_id = $1
          AND GREATEST(
            COALESCE(NULLIF(psb.total_qty, 0), NULLIF(psb.received_qty, 0), 0)
            - COALESCE(psb.dirty_qty, 0) - COALESCE(psb.cracked_qty, 0)
            - COALESCE(linked.input_qty, 0), 0
          ) > 0
        ORDER BY psb.created_at, psb.id`,
      [shiftIdNum],
    );
    for (const row of rows) await this.assertActiveHouseScope(String(row.house_code));
    return { code: 200, data: rows };
  }

  @Post('source-batches/receive')
  @RequireMenu('MENU_PKG_OP', 'E')
  async receiveBatch(@Body() body: any, @Req() req: any) {
    const today = this.today;
    const houseCode = String(body.houseCode || body.house_code || '').trim();
    const totalQty = Number(body.totalQty ?? body.total_qty ?? 0);
    const dirtyQty = Number(body.dirtyQty ?? body.dirty_qty ?? 0);
    const crackedQty = Number(body.crackedQty ?? body.cracked_qty ?? 0);
    const submittedReceivedQty = Number(body.receivedQty ?? body.received_qty ?? 0);
    if (!houseCode) throw new BadRequestException('请选择鸡舍后再提交');
    if (![totalQty, dirtyQty, crackedQty, submittedReceivedQty].every(Number.isFinite)) {
      throw new BadRequestException('集蛋数量格式不正确');
    }
    if (totalQty <= 0 || dirtyQty < 0 || crackedQty < 0 || dirtyQty + crackedQty > totalQty) {
      throw new BadRequestException('总采集数必须大于 0，且脏蛋与裂纹蛋之和不能超过总数');
    }
    const gradableQty = totalQty - dirtyQty - crackedQty;
    // 兼容旧作业台：receivedQty 曾表示扣除脏蛋/裂纹蛋后的可分级数。
    // 当前台账语义统一为总采集数，合法旧值在持久化前规范化，避免重复扣减损耗。
    if (submittedReceivedQty !== totalQty && submittedReceivedQty !== gradableQty) {
      throw new BadRequestException('采集数量与总采集数不一致');
    }
    await this.assertActiveHouseScope(houseCode);
    const receivedQty = totalQty;
    const houseSlug = houseCode.replace(/\s+/g, '').toUpperCase().slice(0, 8);
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
         SET batch_status='RECEIVED', total_qty=$1, dirty_qty=$2, cracked_qty=$3,
             expected_qty=$1, received_qty=$4, received_weight=$5,
             container_count=$6, variance_reason=$7, received_by=$8, shift_id=$9, updated_at=NOW()
         WHERE id=$10`,
        [
          totalQty,
          dirtyQty,
          crackedQty,
          receivedQty,
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
          houseCode,
          body.flockCode || body.flock_code || '',
          body.layDate || body.lay_date || today,
          totalQty,
          dirtyQty,
          crackedQty,
          totalQty,
          receivedQty,
          body.expectedWeight || body.expected_weight || 0,
          body.receivedWeight || body.received_weight || 0,
          body.containerCount || body.container_count || 0,
          body.varianceReason || body.variance_reason || '',
          operatorId,
          body.shiftId || null,
        ],
      );
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
  @RequireMenu('MENU_PKG_OP', 'E')
  async correctBatch(@Body() body: any, @Req() req: any) {
    const operatorId = req.user?.id || req.user?.user_id;
    const date = body.productionDate || this.today;
    const houseCode = body.houseCode || body.house_code;
    const sourceBatchId = Number(body.sourceBatchId ?? body.source_batch_id);
    if (!houseCode) throw new BadRequestException('houseCode 必填');
    if (!Number.isInteger(sourceBatchId) || sourceBatchId <= 0) throw new BadRequestException('sourceBatchId 必填');
    await this.assertActiveHouseScope(String(houseCode));

    const newTotal   = Math.max(0, Number(body.totalQty   ?? 0));
    const newDirty   = Math.max(0, Number(body.dirtyQty   ?? 0));
    const newCracked = Math.max(0, Number(body.crackedQty ?? 0));
    const newReceived = newTotal;
    const reason = String(body.reason || '');

    // 同舍允许多次采集；更正必须精确落到来源批次，禁止合并或清零同舍其他批次。
    const rows: any[] = await this.em.query(
      `SELECT id, batch_code, total_qty, dirty_qty, cracked_qty, received_qty
       FROM pkg_source_batches
       WHERE id = $1 AND house_code = $2 AND production_date = $3
         AND batch_status NOT IN ('WAREHOUSED','SCRAPPED','CANCELLED')
       LIMIT 1`,
      [sourceBatchId, houseCode, date],
    );
    if (rows.length === 0) throw new BadRequestException('未找到该来源批次');

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
  @RequireMenu('MENU_PKG_OP', 'E')
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
  @RequireMenu('MENU_PKG_OP', 'E')
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
  @RequireMenu('MENU_PKG_OP', 'E')
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
    const parsedShiftId = shiftId ? Number(shiftId) : null;
    const requestedShiftId = parsedShiftId !== null && Number.isInteger(parsedShiftId) && parsedShiftId > 0
      ? parsedShiftId
      : null;

    const [shiftRow] = await this.safe(
      requestedShiftId
        ? this.em.query(
            `SELECT * FROM pkg_work_shifts WHERE id = $1 AND production_date = $2 LIMIT 1`,
            [requestedShiftId, targetDate],
          )
        : this.em.query(
            `SELECT * FROM pkg_work_shifts WHERE production_date = $1 ORDER BY opened_at DESC LIMIT 1`,
            [targetDate],
          ),
      [],
    );

    const shiftIdNum = requestedShiftId ?? (shiftRow?.id ? Number(shiftRow.id) : null);
    const shiftFilter = shiftIdNum ? ' AND shift_id = $2' : '';
    const summaryParams = shiftIdNum ? [targetDate, shiftIdNum] : [targetDate];

    const [recvRow] = await this.safe(
      this.em.query(
        `SELECT COALESCE(SUM(received_qty),0)::int AS qty, COALESCE(SUM(received_weight),0)::float AS weight
         FROM pkg_source_batches WHERE production_date=$1${shiftFilter}`,
        summaryParams,
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

    const gradingRows = await this.safe(
      this.em.query(
        `SELECT outputs_json FROM pkg_grading_records WHERE production_date = $1 AND status = 'ACTIVE'${shiftFilter}`,
        summaryParams,
      ),
      [],
    );
    const gradingOutputs: Record<string, number> = {};
    for (const row of gradingRows) {
      try {
        const outputs = typeof row.outputs_json === 'string'
          ? JSON.parse(row.outputs_json)
          : (row.outputs_json ?? {});
        for (const [grade, qty] of Object.entries(outputs)) {
          gradingOutputs[grade] = (gradingOutputs[grade] || 0) + (Number(qty) || 0);
        }
      } catch { /* malformed historical payload contributes zero */ }
    }

    // 本班包装产出（按 shift_id 精确查询）
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

    const [labelRow] = await this.safe(
      this.em.query(
        `SELECT COUNT(*)::int AS count
         FROM pkg_label_print_logs l
         WHERE DATE(l.printed_at) = $1
           AND ($2::int IS NULL OR EXISTS (
             SELECT 1 FROM pkg_packing_records p
             WHERE p.code = l.packaging_batch_id AND p.shift_id = $2
           ))`,
        [targetDate, shiftIdNum],
      ),
      [{ count: 0 }],
    );

    const [handoverRow] = await this.safe(
      this.em.query(
        `SELECT COALESCE(SUM(box_count),0)::int AS boxes,
                COUNT(DISTINCT NULLIF(pallet_code, ''))::int AS pallets
         FROM pkg_handover_records WHERE production_date = $1${shiftFilter}`,
        summaryParams,
      ),
      [{ boxes: 0, pallets: 0 }],
    );

    return {
      code: 200,
      data: {
        shift: shiftRow || null,
        receivedQty: Number(recvRow?.qty) || 0,
        receivedWeight: Number(recvRow?.weight) || 0,
        openExceptionCount: Number(exceptRow?.open_count) || 0,
        closedExceptionCount: Number(exceptRow?.closed_count) || 0,
        gradingOutputs,
        gradedQty: Object.values(gradingOutputs).reduce((sum, qty) => sum + qty, 0),
        shiftPackedBoxes: Number(packRow?.boxes) || 0,
        shiftPackedEggs:  Number(packRow?.eggs)  || 0,
        shiftLabelCount: Number(labelRow?.count) || 0,
        shiftWarehousedBoxes: Number(handoverRow?.boxes) || 0,
        shiftWarehousedPallets: Number(handoverRow?.pallets) || 0,
      },
    };
  }

  @Post('grading/submit')
  @RequireMenu('MENU_PKG_OP', 'E')
  async submitGrading(@Body() body: SubmitGradingDto) {
    const rawOutputs = body.outputs as Record<string, unknown> || {};
    const outputs: Record<string, number> = {};

    // 兼容旧终端把数字序列化为字符串；服务端统一转成有限非负数。
    for (const [k, raw] of Object.entries(rawOutputs)) {
      const v = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : NaN;
      if (!Number.isInteger(v) || v < 0) {
        throw new BadRequestException(`等级 ${k} 的数量无效`);
      }
      outputs[k] = v;
    }

    const totalOutput = Object.values(outputs).reduce((a: number, b: number) => a + b, 0);
    if (totalOutput <= 0) throw new BadRequestException('分级总数必须大于 0');
    const sourceBatchIds = [...new Set(body.sourceBatchIds)].sort((a, b) => a - b);
    if (sourceBatchIds.length !== body.sourceBatchIds.length) {
      throw new BadRequestException('sourceBatchIds 不得重复');
    }
    const canonicalOutputs = Object.fromEntries(Object.entries(outputs).sort(([a], [b]) => a.localeCompare(b)));
    const canonicalPayload = JSON.stringify({ shiftId: body.shiftId, sourceBatchIds, outputs: canonicalOutputs });
    const payloadHash = createHash('sha256').update(canonicalPayload).digest('hex');

    return this.em.transaction(async manager => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [body.idempotencyKey]);
      const [existing] = await manager.query<any[]>(
        `SELECT code, total_output, payload_hash FROM pkg_grading_records WHERE idempotency_key = $1`,
        [body.idempotencyKey],
      );
      if (existing) {
        if (existing.payload_hash !== payloadHash) {
          throw new ConflictException('幂等键已用于不同分级载荷');
        }
        return { code: 200, data: { code: existing.code, totalOutput: Number(existing.total_output), idempotentReplay: true } };
      }

      const [shift] = await manager.query<any[]>(
        `SELECT id, production_date, status FROM pkg_work_shifts WHERE id = $1 FOR UPDATE`,
        [body.shiftId],
      );
      if (!shift || shift.status !== 'OPEN') {
        throw new ConflictException('当前班次不存在或已关闭，禁止分级');
      }
      const sourceRows = await manager.query<any[]>(
        `SELECT id, batch_code, shift_id, house_code,
                GREATEST(COALESCE(NULLIF(total_qty, 0), NULLIF(received_qty, 0), 0)
                  - COALESCE(dirty_qty, 0) - COALESCE(cracked_qty, 0), 0)::int AS net_qty
           FROM pkg_source_batches
          WHERE id = ANY($1::int[])
          ORDER BY id FOR UPDATE`,
        [sourceBatchIds],
      );
      if (sourceRows.length !== sourceBatchIds.length || sourceRows.some(row => Number(row.shift_id) !== body.shiftId)) {
        throw new ConflictException('来源批次不存在或不属于当前班次');
      }
      for (const row of sourceRows) await this.assertActiveHouseScope(String(row.house_code));
      const usedRows = await manager.query<any[]>(
        `SELECT gsl.source_batch_id, COALESCE(SUM(gsl.input_qty), 0)::int AS used_qty
           FROM pkg_grading_source_links gsl
           JOIN pkg_grading_records gr ON gr.id = gsl.grading_id AND gr.status = 'ACTIVE'
          WHERE gsl.source_batch_id = ANY($1::int[])
          GROUP BY gsl.source_batch_id`,
        [sourceBatchIds],
      );
      const usedBySource = new Map(usedRows.map(row => [Number(row.source_batch_id), Number(row.used_qty)]));
      const remainingBySource = sourceRows.map(row => ({
        ...row,
        remaining: Math.max(0, Number(row.net_qty) - (usedBySource.get(Number(row.id)) || 0)),
      }));
      const available = remainingBySource.reduce((sum, row) => sum + row.remaining, 0);
      if (totalOutput > available) {
        throw new ConflictException(`分级数量 ${totalOutput} 超过所选来源剩余量 ${available}`);
      }

      const productionDate = String(shift.production_date).slice(0, 10);
      const code = `GRD-${productionDate.replace(/-/g, '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const [grading] = await manager.query<any[]>(
        `INSERT INTO pkg_grading_records
         (code, shift_id, source_batch_code, production_date, outputs_json, total_output,
          idempotency_key, payload_hash, created_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,NOW())
         RETURNING id, code`,
        [code, body.shiftId, sourceRows[0].batch_code, productionDate,
         JSON.stringify(outputs), totalOutput, body.idempotencyKey, payloadHash],
      );
      let unallocated = totalOutput;
      for (const source of remainingBySource) {
        const inputQty = Math.min(source.remaining, unallocated);
        if (inputQty > 0) {
          await manager.query(
            `INSERT INTO pkg_grading_source_links (grading_id, source_batch_id, input_qty)
             VALUES ($1,$2,$3)`,
            [grading.id, source.id, inputQty],
          );
          unallocated -= inputQty;
        }
      }
      return { code: 200, data: { code: grading.code, totalOutput, idempotentReplay: false } };
    });
  }

  /**
   * GET /grading/active?date=YYYY-MM-DD
   * 按等级汇总当日所有分级批次的产出，减去当日所有包装记录已消耗量，
   * 返回各等级实时剩余（key = dict_code，多终端并发安全）。
   */
  @Get('grading/active')
  async getActiveGrading(@Query('shiftId') shiftId: string) {
    const shiftIdNum = Number(shiftId);
    if (!Number.isInteger(shiftIdNum) || shiftIdNum <= 0) throw new BadRequestException('shiftId 必须是正整数');

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
        `SELECT DISTINCT gr.code, gr.outputs_json
           FROM pkg_grading_records gr
           JOIN pkg_grading_source_links gsl ON gsl.grading_id = gr.id
           JOIN pkg_source_batches psb ON psb.id = gsl.source_batch_id
          WHERE gr.shift_id = $1 AND psb.shift_id = $1 AND gr.status = 'ACTIVE'
          ORDER BY gr.code`,
        [shiftIdNum],
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
        `SELECT batches_json FROM pkg_packing_records WHERE shift_id = $1`,
        [shiftIdNum],
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
  @RequireMenu('MENU_PKG_OP', 'E')
  async submitPacking(@Body() body: Record<string, any>) {
    const today = new Date().toISOString().slice(0, 10);
    const productionDate = body.productionDate || today;
    const code = `PKG-${productionDate.replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;
    if (!Array.isArray(body.batches) || body.batches.length === 0) {
      throw new BadRequestException('batches 必须是非空数组');
    }
    const batches = body.batches as Array<Record<string, unknown>>;
    batches.forEach((batch, index) => {
      if (typeof batch?.grade !== 'string' || batch.grade.trim() === '') {
        throw new BadRequestException(`batches[${index}].grade 必须是非空字符串`);
      }
      if (typeof batch.boxes !== 'number' || !Number.isFinite(batch.boxes) || batch.boxes <= 0) {
        throw new BadRequestException(`batches[${index}].boxes 必须是有限正数`);
      }
      if (typeof batch.eggs !== 'number' || !Number.isFinite(batch.eggs) || batch.eggs <= 0) {
        throw new BadRequestException(`batches[${index}].eggs 必须是有限正数`);
      }
    });
    const totalBoxes = batches.reduce((a, b) => a + (b.boxes as number), 0);
    const totalEggs = batches.reduce((a, b) => a + (b.eggs as number), 0);
    const gradingCodes: string[] = Array.isArray(body.gradingCodes)
      ? body.gradingCodes
        .filter((c: unknown): c is string => typeof c === 'string')
        .map((c: string) => c.trim())
        .filter(Boolean)
      : (typeof body.gradingCode === 'string' && body.gradingCode.trim()
        ? [body.gradingCode.trim()] : []);
    const shiftId = Number(body.shiftId);
    if (!Number.isInteger(shiftId) || shiftId <= 0) throw new BadRequestException('shiftId 必须是正整数');
    if (gradingCodes.length === 0) throw new BadRequestException('gradingCodes 必须是非空数组');
    const gradingOwners = await this.em.query<any[]>(
      `SELECT gr.code, gr.shift_id,
              BOOL_OR(psb.shift_id = $2) AS has_source_in_target_shift
         FROM pkg_grading_records gr
         JOIN pkg_grading_source_links gsl ON gsl.grading_id = gr.id
         JOIN pkg_source_batches psb ON psb.id = gsl.source_batch_id
        WHERE gr.code = ANY($1::varchar[]) AND gr.status = 'ACTIVE'
        GROUP BY gr.code, gr.shift_id`,
      [gradingCodes, shiftId],
    );
    if (gradingOwners.length !== new Set(gradingCodes).size) {
      throw new ConflictException('存在无有效来源关联的分级记录，禁止包装');
    }
    const crossShiftCodes = gradingOwners
      .filter(row => Number(row.shift_id) !== shiftId || row.has_source_in_target_shift !== true)
      .map(row => String(row.code));
    const crossShiftReason = String(body.crossShiftReason || '').trim();
    if (crossShiftCodes.length > 0 && !crossShiftReason) {
      throw new ConflictException('跨班次包装必须填写 crossShiftReason 以生成审计记录');
    }
    try {
      await this.em.query(
        `INSERT INTO pkg_packing_records
         (code, grading_code, grading_codes_json, production_date, batches_json, total_boxes, total_eggs, shift_id, created_at)
         VALUES ($1,$2,$3::jsonb,$4,$5::jsonb,$6,$7,$8,NOW())
         ON CONFLICT (code) DO NOTHING`,
        [code, gradingCodes[0] ?? null, JSON.stringify(gradingCodes),
         productionDate, JSON.stringify(batches), totalBoxes, totalEggs,
         shiftId],
      );
      if (crossShiftCodes.length > 0) {
        await this.em.query(
          `INSERT INTO pkg_audit_logs
           (entity_type, entity_id, action, before_data, after_data, reason, created_at)
           VALUES ('PACKING_RECORD', $1, 'CROSS_SHIFT_GRADING_CONSUME', $2::jsonb, $3::jsonb, $4, NOW())`,
          [code, JSON.stringify({ gradingCodes: crossShiftCodes }),
           JSON.stringify({ targetShiftId: shiftId }), crossShiftReason],
        );
      }
    } catch (error: any) {
      console.error(`[packing/submit][ERR] 包装记录写入失败 code=${code}: ${error?.message}`, error?.stack);
      throw new InternalServerErrorException('包装记录写入失败，请稍后重试或联系管理员');
    }
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

  @Get('warehouse/status')
  @RequireMenu('MENU_PKG_OP', 'V')
  async getWarehouseHandoverStatus(@Query('packingCode') packingCode: string) {
    const normalizedCode = String(packingCode || '').trim();
    if (!normalizedCode) throw new BadRequestException('packingCode 必填');

    const [handoverRows, inventoryRows, inventoryMode, packingRows] = await Promise.all([
      this.em.query(
        `SELECT code, packing_code, box_count, pallet_code, location, receiver,
                production_date, created_at
           FROM pkg_handover_records
          WHERE packing_code = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [normalizedCode],
      ),
      this.em.query(
        `WITH matched_batches AS (
           SELECT batch_no, qty FROM inv_batches
            WHERE packaging_batch_ref = $1 AND source_type = 'PACKAGING'
         )
         SELECT COUNT(*)::int AS batch_count,
                COALESCE(SUM(qty), 0)::int AS total_inbound,
                COALESCE((SELECT SUM(l.qty_change) FROM inv_ledger l
                           WHERE l.batch_no IN (SELECT batch_no FROM matched_batches)
                             AND l.change_type = 'PACKAGING_INBOUND'), 0)::int AS ledger_inbound
           FROM matched_batches`,
        [normalizedCode],
      ),
      this.pkgInv.getTerminalInventoryMode(normalizedCode),
      this.em.query(
        `SELECT total_eggs
           FROM pkg_packing_records
          WHERE code = $1
          LIMIT 1`,
        [normalizedCode],
      ),
    ]);

    const handover = handoverRows[0] || null;
    const handoverQuantity = Number(packingRows[0]?.total_eggs || 0);
    const batchCount = Number(inventoryRows[0]?.batch_count || 0);
    const totalInbound = Number(inventoryRows[0]?.total_inbound || 0);
    const ledgerInbound = Number(inventoryRows[0]?.ledger_inbound || 0);
    const tempMode = inventoryMode === 'TEMP_PRODUCTION_INBOUND';
    const tempEvidence = tempMode
      ? await this.pkgInv.verifyTerminalTempEvidence(normalizedCode)
      : null;
    const inventoryPosted = tempMode
      ? Boolean(tempEvidence?.ok)
      : batchCount > 0 && handoverQuantity > 0
        && totalInbound === handoverQuantity && ledgerInbound === handoverQuantity;
    const committed = Boolean(handover)
      && inventoryPosted;
    const state = committed
      ? 'COMMITTED'
      : handover
        ? 'HANDOVER_ONLY'
        : batchCount > 0
          ? 'INVENTORY_ONLY'
          : 'PENDING';

    return {
      code: 200,
      data: {
        packingCode: normalizedCode,
        state,
        committed,
        handoverCode: handover?.code ?? null,
        boxCount: Number(handover?.box_count || 0),
        handoverQuantity,
        inventoryBatchCount: batchCount,
        totalInbound,
        ledgerInbound,
        inventoryMode,
        inventoryPosted,
        tempEvidence,
        committedAt: handover?.created_at ?? null,
        message: committed
          ? tempMode
            ? '交接完成，库存由日产蛋入口持有，批次与流水数量已对平'
            : '包装交接及库存入账均已完成'
          : state === 'HANDOVER_ONLY'
            ? '交接记录已存在，但库存入账证据缺失，可重试确认'
            : state === 'INVENTORY_ONLY'
              ? '库存已生成，但交接记录缺失，可重试确认'
              : '尚未完成入库交接',
      },
    };
  }

  @Post('warehouse/confirm')
  @RequireMenu('MENU_PKG_OP', 'E')
  async confirmHandover(@Body() body: Record<string, any>) {
    const packingCode = String(body.packingCode || '').trim();
    if (!packingCode) throw new BadRequestException('packingCode 必填');

    const today = new Date().toISOString().slice(0, 10);
    const productionDate = body.productionDate || today;
    const existing = await this.em.query(
      `SELECT code
         FROM pkg_handover_records
        WHERE packing_code = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [packingCode],
    );
    const code = existing[0]?.code
      || `WH-${productionDate.replace(/-/g, '')}-${Date.now().toString(36).toUpperCase()}`;
    const boxes = (body.boxes as string[]) || [];
    const location = String(body.location || '').trim();
    if (!location) throw new BadRequestException('输入的库位编码在系统中不存在，请核实后再试');
    const locationRows = await this.em.query(
      `SELECT location_code, warehouse_code
         FROM wms_locations
        WHERE location_code = $1
          AND COALESCE(status, 'EMPTY') <> 'LOCKED'
        LIMIT 1`,
      [location],
    );
    if (!locationRows[0]) throw new BadRequestException('输入的库位编码在系统中不存在，请核实后再试');
    const warehouseCode = String(locationRows[0].warehouse_code || '').trim();
    if (!warehouseCode) throw new BadRequestException('库位未关联有效仓库，禁止使用默认仓库入账');

    // ── P1C 收口 + P1E 失败显性化：成品交接完成 = 唯一库存入口 ──────────────────
    //   调 PackagingInventoryIntegrationService 生成 Sales V2 可售库存（EGG-YYYYMMDD-*,
    //   change_type=PACKAGING_INBOUND, 进 FIFO）。幂等键 = packingCode；
    //   SITE 级模式门控：仅 PACKAGING_INBOUND 模式生成（TEMP 模式跳过，属正常，非失败）。
    //   P1E：库存生成失败不再 safe 吞错 → 明确 error log + 返回 inventoryOk=false + message，
    //        杜绝"页面显示成功但库存没生成"的静默失败。
    let inventory: any = null;
    let inventoryOk = false;
    let message: string | undefined;
    try {
      await this.em.transaction(async manager => {
        inventory = await this.pkgInv.completeTerminalPacking(packingCode, {
          companyCode: body.companyCode,
          warehouseCode,
          locationCode: location,
          manager,
        });
        if (inventory?.skippedByMode === true && inventory?.mode === 'TEMP_PRODUCTION_INBOUND') {
          const tempEvidence = await this.pkgInv.verifyTerminalTempEvidence(packingCode, manager);
          inventory = { ...inventory, tempEvidence };
          inventoryOk = tempEvidence.ok;
          if (!inventoryOk) {
            throw new Error(
              `TEMP_PRODUCTION_INBOUND 上游库存证据未对平 expected=${tempEvidence.expectedQty} ` +
              `batch=${tempEvidence.batchQty} ledger=${tempEvidence.ledgerQty}`,
            );
          }
        } else {
          inventoryOk = inventory?.idempotent === true || Number(inventory?.totalInbound || 0) > 0;
        }
        if (!inventoryOk) throw new Error(inventory?.note || '包装批次未生成有效库存');

        // PACKAGING 的批次、流水和交接共享 manager；TEMP 也只在上游证据对平后提交交接。
        if (existing.length === 0) {
          await manager.query(
            `INSERT INTO pkg_handover_records
             (code, shift_id, packing_code, boxes_json, box_count, pallet_code, location, receiver, production_date, created_at)
             VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,NOW())
             ON CONFLICT (code) DO NOTHING`,
            [code, body.shiftId || null, packingCode,
             JSON.stringify(boxes), boxes.length,
             body.palletCode || '', location, body.receiver || '', productionDate],
          );
        }
      });
    } catch (e: any) {
      inventoryOk = false;
      message = e?.message?.includes('上游库存证据未对平')
        ? `${e.message}；交接已阻断并生成待处理状态。`
        : '库存生成失败，交接未完成，请修复后重试。';
      console.error(
        `[warehouse/confirm][ERR] 包装库存生成失败 packingCode=${packingCode}: ${e?.message}`,
        e?.stack,
      );
      inventory = { ...(inventory || {}), ok: false, error: e?.message ?? '库存生成失败', message };
    }

    const statusResponse = await this.getWarehouseHandoverStatus(packingCode);
    const status = statusResponse.data;
    inventoryOk = status.committed;
    message = inventoryOk ? undefined : (message || status.message);

    return { code: 200, data: { code, inventory, inventoryOk, message, status } };
  }

  // ── R3：真实场站列表（开班场站选择）────────────────────────────────────────
  // GET /api/packaging/terminal/sites
  @Get('sites')
  async getSites() {
    const rows = await this.safe(
      this.em.query(
        `SELECT farm_code AS site_id, farm_name AS site_name
           FROM brd_farms WHERE status = 'ACTIVE' ORDER BY farm_code`,
      ),
      [] as any[],
    );
    return { code: 200, data: rows };
  }

  // ── R3：扫码标签(PKG-*)→ 定位库存批次(EGG-*)──────────────────────────────────
  // GET /api/packaging/terminal/inventory/by-packing/:packingCode
  @Get('inventory/by-packing/:packingCode')
  async getInventoryByPacking(@Param('packingCode') packingCode: string) {
    const rows = await this.safe(
      this.em.query(
        `SELECT batch_no, product_code, sku_code, grade_code_std, spec_code,
                qty, qty_available, expire_date, company_code,
                packaging_batch_ref, collection_batch_ref
           FROM inv_batches
          WHERE packaging_batch_ref = $1 AND source_type = 'PACKAGING'
          ORDER BY batch_no`,
        [packingCode],
      ),
      [] as any[],
    );
    return { code: 200, data: { packingCode, batches: rows } };
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
    let requested = (typesParam || '').split(',').map(t => t.trim()).filter(t => allowedTypes.includes(t));
    if (requested.length === 0) {
      return { code: 200, data: {} };
    }
    const result: Record<string, any[]> = {};

    // 2026-06-06 收口：PKG_EGG_GRADE 改读 product_grades 主数据，
    // 与 inv_batches.grade_code_std / terminal.service / packaging.service 同源，
    // 杜绝 sys_dict.PKG_EGG_GRADE（XL/L/M/S/XS）与 product_grades（AA/A/B/C/...）漂移。
    if (requested.includes('PKG_EGG_GRADE')) {
      const gradeRows: Array<{
        grade_code: string; grade_name: string; grade_name_lo: string | null;
        sort_order: number; is_saleable: boolean; is_storable: boolean; weight_range: string | null;
      }> = await this.safe(
        this.em.query(
          // G69：只取可售（1~5号），缺陷走 PKG_EGG_DEFECT
          `SELECT grade_code, grade_name, grade_name_lo, sort_order, is_saleable, is_storable, weight_range
             FROM product_grades WHERE status='ACTIVE' AND is_saleable=true ORDER BY sort_order, grade_code`,
        ),
        [] as any[],
      );
      result['PKG_EGG_GRADE'] = gradeRows.map(r => ({
        code:            r.grade_code,
        label:           r.grade_name,
        labelLo:         r.grade_name_lo || '',
        sortNo:          r.sort_order,
        terminalCode:    r.grade_code,
        isTerminalGrade: true,
        saleable:        r.is_saleable,
        storable:        r.is_storable,
        weightRange:     r.weight_range || '',   // G67 透传重量段
        icon:            '🥚',
      }));
      requested = requested.filter(t => t !== 'PKG_EGG_GRADE');
    }

    // G69：缺陷等级统一读 product_grades（is_saleable=false），杜绝包装终端
    //   PKG_EGG_DEFECT 与 product_grades 缺陷双源漂移（脏/裂/破/损坏）。
    if (requested.includes('PKG_EGG_DEFECT')) {
      const defectRows: Array<{
        grade_code: string; grade_name: string; grade_name_lo: string | null;
        sort_order: number; is_storable: boolean;
      }> = await this.safe(
        this.em.query(
          `SELECT grade_code, grade_name, grade_name_lo, sort_order, is_storable
             FROM product_grades WHERE status='ACTIVE' AND is_saleable=false ORDER BY sort_order, grade_code`,
        ),
        [] as any[],
      );
      result['PKG_EGG_DEFECT'] = defectRows.map(r => ({
        code:            r.grade_code,
        label:           r.grade_name,
        labelLo:         r.grade_name_lo || '',
        sortNo:          r.sort_order,
        terminalCode:    r.grade_code,
        isTerminalGrade: true,
        isDefect:        true,
        storable:        r.is_storable,
        icon:            '⚠️',
      }));
      requested = requested.filter(t => t !== 'PKG_EGG_DEFECT');
    }

    if (requested.length === 0) {
      return { code: 200, data: result };
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
