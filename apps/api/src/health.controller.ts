import { Controller, Get, Header } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * 系统健康检查端点
 * GET /api/health    — 详细配置 + 存活探针（无需 JWT）— 监控系统可拉取
 * GET /api/readiness — 数据库就绪探针（无需 JWT）— K8s readinessProbe 用
 */
const FALLBACK_SECRET = 'DEV_ONLY_INSECURE_FALLBACK_KEY_DO_NOT_USE_IN_PROD';

@Controller('api')
export class HealthController {
  private readonly bootTime = new Date();

  constructor(
    @InjectEntityManager()
    private readonly em: EntityManager,
  ) {}

  /**
   * 详细健康检查 — 包含 JWT 配置、DB、运行时信息
   * 监控系统可周期性拉取并 alert：
   *   - status != 'OK'             → 进程异常
   *   - jwt.loaded == false        → JWT_SECRET 未配置（dev fallback 不算）
   *   - jwt.rotation_active 持续 24h+ → 提醒删除 JWT_SECRET_PREV
   */
  @Get('health')
  async getHealth() {
    const jwtSecretEnv = process.env.JWT_SECRET || '';
    const jwtSecretPrev = process.env.JWT_SECRET_PREV || '';
    const jwtLoaded = !!jwtSecretEnv && jwtSecretEnv !== FALLBACK_SECRET;
    const isProd = (process.env.NODE_ENV || 'development') === 'production';

    let dbConnected = false;
    try {
      await this.em.query('SELECT 1');
      dbConnected = true;
    } catch { /* keep false */ }

    return {
      status: jwtLoaded && dbConnected ? 'OK' : 'DEGRADED',
      service: 'Phoenix ERP V3 API',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      boot_at: this.bootTime.toISOString(),
      env: process.env.NODE_ENV || 'development',
      node_version: process.version,
      jwt: {
        loaded: jwtLoaded,
        // 不暴露密钥，仅露最末 4 字符做配置校对
        fingerprint: jwtSecretEnv ? '...' + jwtSecretEnv.slice(-4) : null,
        rotation_active: !!jwtSecretPrev,
        expires_in: process.env.JWT_EXPIRES_IN || '24h',
        clock_tolerance_sec: 60,
      },
      db: { connected: dbConnected },
      security: {
        jwt_fallback_in_use: jwtSecretEnv === '' || jwtSecretEnv === FALLBACK_SECRET,
        is_production: isProd,
        warning: isProd && !jwtLoaded ? 'CRITICAL: JWT_SECRET not configured in production' : null,
      },
    };
  }

  /**
   * Prometheus metrics 端点（text format / no client lib）
   * GET /api/metrics — Prometheus scrape, no JWT required
   *
   * 暴露指标：
   *   - phoenix_up                          : 1 / 0 (db reachable)
   *   - phoenix_uptime_seconds              : 进程运行秒数
   *   - phoenix_jwt_loaded                  : 0 / 1 (real key configured)
   *   - phoenix_jwt_rotation_active         : 0 / 1 (有 JWT_SECRET_PREV)
   *   - phoenix_node_memory_rss_bytes
   *   - phoenix_node_memory_heap_used_bytes
   *   - phoenix_node_memory_heap_total_bytes
   *   - phoenix_orders_total{status="..."}  : 按状态聚合
   *   - phoenix_inv_batches_total{status="..."}: 按批次状态聚合
   *   - phoenix_pos_sales_today_total       : 当日 POS 销售单数
   *   - phoenix_v2_residual_tables          : V2 残表数（应为 0）
   */
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    const lines: string[] = [];
    const push = (name: string, help: string, type: string, samples: Array<[Record<string, string> | null, number]>) => {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);
      for (const [labels, value] of samples) {
        if (labels) {
          const l = Object.entries(labels).map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`).join(',');
          lines.push(`${name}{${l}} ${value}`);
        } else {
          lines.push(`${name} ${value}`);
        }
      }
    };

    // ── 系统活性 ────────────────────────────────────────────────────────────
    let dbUp = 0;
    try { await this.em.query('SELECT 1'); dbUp = 1; } catch { /* 0 */ }
    push('phoenix_up', 'Whether the API + DB stack is up (1 = healthy)', 'gauge', [[null, dbUp]]);
    push('phoenix_uptime_seconds', 'Process uptime in seconds', 'counter', [[null, Math.round(process.uptime())]]);

    // ── JWT 配置 ────────────────────────────────────────────────────────────
    const jwtLoaded = !!process.env.JWT_SECRET && process.env.JWT_SECRET !== FALLBACK_SECRET;
    const rotationActive = !!process.env.JWT_SECRET_PREV;
    push('phoenix_jwt_loaded', 'JWT_SECRET configured with real key (1=yes)', 'gauge', [[null, jwtLoaded ? 1 : 0]]);
    push('phoenix_jwt_rotation_active', 'Whether JWT_SECRET_PREV is set (rotation in progress)', 'gauge', [[null, rotationActive ? 1 : 0]]);

    // ── 内存 ────────────────────────────────────────────────────────────────
    const mem = process.memoryUsage();
    push('phoenix_node_memory_rss_bytes', 'Resident set size in bytes', 'gauge', [[null, mem.rss]]);
    push('phoenix_node_memory_heap_used_bytes', 'V8 heap used in bytes', 'gauge', [[null, mem.heapUsed]]);
    push('phoenix_node_memory_heap_total_bytes', 'V8 heap allocated in bytes', 'gauge', [[null, mem.heapTotal]]);

    // ── 业务指标（容错；DB 不可用时返 0 而不是 500）─────────────────────────
    if (dbUp) {
      const orderRows: Array<{ status: string; cnt: string }> = await this.em.query(
        `SELECT COALESCE(status,'UNKNOWN') AS status, COUNT(*)::text AS cnt FROM ord_orders GROUP BY status`,
      ).catch(() => []);
      push(
        'phoenix_orders_total',
        'Number of orders grouped by status',
        'gauge',
        orderRows.map((r) => [{ status: String(r.status) }, Number(r.cnt) || 0]),
      );

      const batchRows: Array<{ status: string; cnt: string }> = await this.em.query(
        `SELECT COALESCE(status,'UNKNOWN') AS status, COUNT(*)::text AS cnt FROM inv_batches GROUP BY status`,
      ).catch(() => []);
      push(
        'phoenix_inv_batches_total',
        'Number of inventory batches grouped by status',
        'gauge',
        batchRows.map((r) => [{ status: String(r.status) }, Number(r.cnt) || 0]),
      );

      const [posToday] = await this.em.query(
        `SELECT COUNT(*)::int AS cnt FROM pos_sales WHERE substr(created_at::text,1,10) = to_char(CURRENT_DATE,'YYYY-MM-DD')`,
      ).catch(() => [{ cnt: 0 }]);
      push('phoenix_pos_sales_today_total', 'POS sales count for today', 'gauge', [[null, Number(posToday?.cnt) || 0]]);

      const [v2Resid] = await this.em.query(
        `SELECT COUNT(*)::int AS cnt FROM information_schema.tables WHERE table_name LIKE '_v2_archived_%'`,
      ).catch(() => [{ cnt: 0 }]);
      push('phoenix_v2_residual_tables', 'Count of legacy V2 archived tables (should be 0 post-cutover)', 'gauge', [[null, Number(v2Resid?.cnt) || 0]]);
    } else {
      // db down 时仍输出零值，保持 scrape consistency
      push('phoenix_orders_total', 'Number of orders grouped by status', 'gauge', [[{ status: 'unknown' }, 0]]);
      push('phoenix_inv_batches_total', 'Number of inventory batches grouped by status', 'gauge', [[{ status: 'unknown' }, 0]]);
      push('phoenix_pos_sales_today_total', 'POS sales count for today', 'gauge', [[null, 0]]);
      push('phoenix_v2_residual_tables', 'Count of legacy V2 archived tables', 'gauge', [[null, -1]]); // -1 = unknown
    }

    return lines.join('\n') + '\n';
  }

  /** 数据库就绪探针 — 执行一条轻量 SELECT 确认连接可用 */
  @Get('readiness')
  async getReadiness() {
    try {
      await this.em.query('SELECT 1');
      return {
        status: 'READY',
        db: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (e) {
      return {
        status: 'NOT_READY',
        db: 'disconnected',
        error: (e as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
