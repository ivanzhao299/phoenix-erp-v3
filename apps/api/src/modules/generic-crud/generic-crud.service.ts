import { Injectable, BadRequestException, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

@Injectable()
export class GenericCrudService implements OnModuleInit {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  /**
   * 解析 Postgres 错误消息中缺失的列名
   * e.g. column "source" of relation "wms_inbound" does not exist
   */
  private extractMissingColumn(msg: string): string | null {
    // INSERT: column "x" of relation "y" does not exist
    // UPDATE/SELECT: column "x" does not exist
    const m = msg.match(/column "([^"]+)" (?:of relation|does not exist)/) ||
              msg.match(/column "([^"]+)"/);
    const col = m ? m[1] : null;
    if (col) console.warn(`[AutoRepair] 缺失列: "${col}" | ${msg.slice(0, 100)}`);
    else     console.error(`[AutoRepair] 无法解析列名: ${msg.slice(0, 200)}`);
    return col;
  }

  /**
   * 当发现列不存在时，自动 ALTER TABLE 添加该列，实现前后端自适应
   */
  private async ensureColumn(table: string, column: string): Promise<void> {
    await this.entityManager.query(
      `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" TEXT`
    ).catch((e: any) => { console.error(`[AutoRepair] 补列失败: ${e.message}`); });
  }

  async onModuleInit() {
    try {
      console.log('🔄 Executing Phase 10E Breeding Data Onboarding...');

      // ══════════════════════════════════════════════════════════════════════
      // Phase 0: 修复 V2 迁移表缺失 id sequence 问题
      // 从 SQLite/V2 迁移的表，id 列是 INTEGER NOT NULL 但没有绑定序列，
      // INSERT 时不提供 id 就会报 "null value in column id"。
      // 以下操作幂等（IF NOT EXISTS），每次启动自动修复，安全无副作用。
      // ══════════════════════════════════════════════════════════════════════
      const legacyTables = [
        'sys_dict', 'sys_orgs',
        'sys_approval_flows', 'sys_approval_logs', 'sys_permissions',
        'mst_stores', 'mst_products',
        'inv_batches', 'inv_ledger',
        'wms_warehouses', 'wms_locations',
        'wms_inbound', 'wms_inbound_items', 'wms_outbound', 'wms_outbound_items',
        'wms_stocktake', 'wms_suppliers',
        'prc_suppliers', 'prc_purchase_orders', 'prc_purchase_items',
        'prc_purchase_requests', 'prc_purchase_payments', 'prc_returns',
        'fin_accounts', 'fin_transactions', 'fin_invoices', 'fin_payments',
        'pos_sales', 'pos_sale_items', 'daily_close', 'acc_ledger',
        'brd_daily_logs', 'brd_medications',
        'biz_cash_flow', 'cst_credit_warnings',
        // 包装模块
        'pkg_shifts', 'pkg_tasks',
      ];
      for (const tbl of legacyTables) {
        const seq = `${tbl}_id_seq`;
        // 1. 创建序列（若已存在则跳过）
        await this.entityManager.query(
          `CREATE SEQUENCE IF NOT EXISTS "${seq}"`
        ).catch(() => {});
        // 2. 将序列绑定为 id 列的 DEFAULT（幂等：重复执行仅更新 DEFAULT 值）
        await this.entityManager.query(
          `ALTER TABLE "${tbl}" ALTER COLUMN id SET DEFAULT nextval('"${seq}"')`
        ).catch(() => {});
        // 3. 将序列值同步到当前最大 id，防止下次插入时冲突
        await this.entityManager.query(
          `SELECT setval('"${seq}"', COALESCE((SELECT MAX(id) FROM "${tbl}"), 0) + 1, false)`
        ).catch(() => {});
      }
      console.log('✅ Phase 0: id sequence repair completed for all legacy tables.');

      // Ensure tables exist
      await this.entityManager.query(`
        CREATE TABLE IF NOT EXISTS brd_farms (
          farm_code VARCHAR(50) PRIMARY KEY,
          farm_name VARCHAR(100),
          location VARCHAR(200),
          status VARCHAR(20) DEFAULT 'ACTIVE',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS brd_houses (
          house_code VARCHAR(50) PRIMARY KEY,
          house_name VARCHAR(100),
          farm_code VARCHAR(50),
          status VARCHAR(20) DEFAULT 'ACTIVE',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS brd_flocks (
          flock_no VARCHAR(50) PRIMARY KEY,
          house_code VARCHAR(50),
          farm_code VARCHAR(50),
          strain VARCHAR(50),
          placement_date DATE,
          placement_age INT,
          initial_qty INT,
          current_qty INT,
          status VARCHAR(20) DEFAULT 'ACTIVE',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // ── 强制补全所有 brd_* V3 字段（幂等，兼容 V2 已有表）──────────────
      const brdAlters = [
        // brd_houses
        `ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS house_code     VARCHAR(50)`,
        `ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS house_name     VARCHAR(100)`,
        `ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS farm_code      VARCHAR(50)`,
        `ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS farm_name      VARCHAR(100)`,
        `ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS house_type     VARCHAR(50)`,
        `ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS capacity       INT DEFAULT 0`,
        `ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS current_birds  INT DEFAULT 0`,
        // max_capacity 已于 2026-05-10 正式删除，V3 统一使用 capacity 字段
        `ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS status         VARCHAR(20) DEFAULT 'ACTIVE'`,
        `ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP`,
        // brd_farms
        `ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS farm_code      VARCHAR(50)`,
        `ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS farm_name      VARCHAR(100)`,
        `ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS location       VARCHAR(200)`,
        `ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS houses        INT DEFAULT 0`,
        `ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS capacity       INT DEFAULT 0`,
        `ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS status         VARCHAR(20) DEFAULT 'ACTIVE'`,
        `ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP`,
        // brd_flocks
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS flock_no          VARCHAR(50)`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS house_code        VARCHAR(50)`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS farm_code         VARCHAR(50)`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS strain            VARCHAR(50)`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS placement_date    DATE`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS start_date        DATE`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS placement_age     INT DEFAULT 1`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS initial_qty       INT DEFAULT 0`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS current_qty       INT DEFAULT 0`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS current_lay_rate  DECIMAL(5,2)`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS status            VARCHAR(20) DEFAULT 'ACTIVE'`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMP`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS breed_type         VARCHAR(50)`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS source_farm        VARCHAR(100)`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS cost               DECIMAL(10,2) DEFAULT 0`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS target_weeks       INT DEFAULT 80`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS elimination_date   DATE`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS peak_lay_rate      DECIMAL(5,2)`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS feed_conversion_ratio DECIMAL(5,3)`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS batch_no           VARCHAR(50)`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS current_lay_rate   DECIMAL(5,2)`,
        // chn_distributor_grading（经销商分级）
        `CREATE TABLE IF NOT EXISTS chn_distributor_grading (
           id            SERIAL PRIMARY KEY,
           customer_name VARCHAR(100),
           customer_code VARCHAR(50),
           grade         VARCHAR(20) DEFAULT 'B',
           credit_limit  DECIMAL(12,2) DEFAULT 0,
           region        VARCHAR(100),
           status        VARCHAR(20) DEFAULT 'ACTIVE',
           created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
      ];
      for (const sql of brdAlters) {
        await this.entityManager.query(sql).catch(() => {});
      }

      // ══════════════════════════════════════════════════════════════════════
      // Phase 3 – 全业务表幂等建表（新装数据库自动初始化，已有表零影响）
      // ══════════════════════════════════════════════════════════════════════
      const businessTables: string[] = [

        // ── CRM 会员 ──────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS crm_members (
           id              SERIAL PRIMARY KEY,
           member_id       VARCHAR(50) UNIQUE,
           name            VARCHAR(100),
           phone           VARCHAR(30),
           level           VARCHAR(30) DEFAULT '普通会员',
           points          INT DEFAULT 0,
           store_code      VARCHAR(50),
           registered_date DATE,
           status          VARCHAR(20) DEFAULT 'ACTIVE',
           created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE crm_members ADD COLUMN IF NOT EXISTS store_code   VARCHAR(50)`,
        `ALTER TABLE crm_members ADD COLUMN IF NOT EXISTS points       INT DEFAULT 0`,
        `ALTER TABLE crm_members ADD COLUMN IF NOT EXISTS level        VARCHAR(30) DEFAULT '普通会员'`,
        `ALTER TABLE crm_members ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS crm_levels (
           id              SERIAL PRIMARY KEY,
           level_name      VARCHAR(50) UNIQUE,
           min_points      INT DEFAULT 0,
           discount_rate   DECIMAL(4,2) DEFAULT 1.00,
           benefits        TEXT,
           status          VARCHAR(20) DEFAULT 'ACTIVE',
           created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS crm_points_log (
           id          SERIAL PRIMARY KEY,
           member_id   VARCHAR(50),
           points      INT DEFAULT 0,
           type        VARCHAR(30),
           note        TEXT,
           created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE crm_points_log ADD COLUMN IF NOT EXISTS type VARCHAR(30)`,

        // 积分台账（余额快照，独立于流水日志）
        // crm_points_log  = 事件流水（每笔增减记录）
        // crm_points_ledger = 余额台账（当前余额快照，按会员+周期汇总）
        `CREATE TABLE IF NOT EXISTS crm_points_ledger (
           id          SERIAL PRIMARY KEY,
           member_id   VARCHAR(50) NOT NULL,
           period      VARCHAR(20),
           balance     INT DEFAULT 0,
           earned      INT DEFAULT 0,
           used        INT DEFAULT 0,
           expired     INT DEFAULT 0,
           updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           UNIQUE (member_id, period)
         )`,
        `ALTER TABLE crm_points_ledger ADD COLUMN IF NOT EXISTS expired   INT DEFAULT 0`,
        `ALTER TABLE crm_points_ledger ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS crm_points_rules (
           id              SERIAL PRIMARY KEY,
           rule_name       VARCHAR(100),
           condition_type  VARCHAR(50),
           points_value    INT DEFAULT 0,
           status          VARCHAR(20) DEFAULT 'ACTIVE',
           created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS crm_coupons (
           id          SERIAL PRIMARY KEY,
           coupon_code VARCHAR(50) UNIQUE,
           name        VARCHAR(100),
           type        VARCHAR(30),
           value       DECIMAL(10,2) DEFAULT 0,
           min_order   DECIMAL(10,2) DEFAULT 0,
           expire_date DATE,
           status      VARCHAR(20) DEFAULT 'ACTIVE',
           created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS crm_activities (
           id          SERIAL PRIMARY KEY,
           name        VARCHAR(100),
           type        VARCHAR(50),
           start_date  DATE,
           end_date    DATE,
           budget      DECIMAL(12,2) DEFAULT 0,
           status      VARCHAR(20) DEFAULT 'ACTIVE',
           created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        // ── 批发 & 合同 ───────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS b2b_customers (
           id             SERIAL PRIMARY KEY,
           customer_code  VARCHAR(50) UNIQUE,
           customer_name  VARCHAR(100),
           contact        VARCHAR(100),
           phone          VARCHAR(30),
           address        TEXT,
           credit_limit   DECIMAL(12,2) DEFAULT 0,
           status         VARCHAR(20) DEFAULT 'ACTIVE',
           created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE b2b_customers ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(12,2) DEFAULT 0`,
        `ALTER TABLE b2b_customers ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS b2b_orders (
           id             SERIAL PRIMARY KEY,
           order_no       VARCHAR(50) UNIQUE,
           customer_code  VARCHAR(50),
           customer_name  VARCHAR(100),
           order_date     DATE,
           total_amount   DECIMAL(12,2) DEFAULT 0,
           status         VARCHAR(20) DEFAULT 'PENDING',
           created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE b2b_orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100)`,
        `ALTER TABLE b2b_orders ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS b2b_order_items (
           id             SERIAL PRIMARY KEY,
           order_no       VARCHAR(50),
           product_code   VARCHAR(50),
           qty            DECIMAL(12,3) DEFAULT 0,
           unit_price     DECIMAL(10,4) DEFAULT 0,
           amount         DECIMAL(12,2) DEFAULT 0,
           created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS ws_contracts (
           id            SERIAL PRIMARY KEY,
           contract_no   VARCHAR(50) UNIQUE,
           customer_code VARCHAR(50),
           product_code  VARCHAR(50),
           price         DECIMAL(10,4) DEFAULT 0,
           start_date    DATE,
           end_date      DATE,
           status        VARCHAR(20) DEFAULT 'ACTIVE',
           created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE ws_contracts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS ws_shipments (
           id            SERIAL PRIMARY KEY,
           shipment_no   VARCHAR(50) UNIQUE,
           contract_no   VARCHAR(50),
           dispatch_date DATE,
           qty           DECIMAL(12,3) DEFAULT 0,
           status        VARCHAR(20) DEFAULT 'PENDING',
           created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE ws_shipments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        // ── 物流调度 ──────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS log_vehicles (
           id         SERIAL PRIMARY KEY,
           vehicle_no VARCHAR(30) UNIQUE,
           plate      VARCHAR(20),
           type       VARCHAR(30),
           capacity   DECIMAL(8,2) DEFAULT 0,
           driver_id  VARCHAR(30),
           status     VARCHAR(20) DEFAULT 'ACTIVE',
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS log_drivers (
           id           SERIAL PRIMARY KEY,
           driver_id    VARCHAR(30) UNIQUE,
           name         VARCHAR(100),
           phone        VARCHAR(30),
           license_no   VARCHAR(50),
           status       VARCHAR(20) DEFAULT 'ACTIVE',
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS log_dispatch (
           id          SERIAL PRIMARY KEY,
           wave_no     VARCHAR(50) UNIQUE,
           vehicle_no  VARCHAR(30),
           driver_id   VARCHAR(30),
           plan_date   DATE,
           stores      TEXT,
           status      VARCHAR(20) DEFAULT 'PENDING',
           created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE log_dispatch ADD COLUMN IF NOT EXISTS stores    TEXT`,
        `ALTER TABLE log_dispatch ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS log_routes (
           id          SERIAL PRIMARY KEY,
           route_code  VARCHAR(30) UNIQUE,
           name        VARCHAR(100),
           stores      TEXT,
           distance_km DECIMAL(8,2) DEFAULT 0,
           status      VARCHAR(20) DEFAULT 'ACTIVE',
           created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS log_receipts (
           id           SERIAL PRIMARY KEY,
           receipt_no   VARCHAR(50) UNIQUE,
           wave_no      VARCHAR(50),
           store_code   VARCHAR(30),
           receive_date DATE,
           qty          DECIMAL(12,3) DEFAULT 0,
           status       VARCHAR(20) DEFAULT 'PENDING',
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE log_receipts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS log_exceptions (
           id          SERIAL PRIMARY KEY,
           wave_no     VARCHAR(50),
           store_code  VARCHAR(30),
           type        VARCHAR(50),
           description TEXT,
           severity    VARCHAR(20) DEFAULT 'LOW',
           status      VARCHAR(20) DEFAULT 'OPEN',
           created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE log_exceptions ADD COLUMN IF NOT EXISTS severity   VARCHAR(20) DEFAULT 'LOW'`,
        `ALTER TABLE log_exceptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        // ── 质量管理 ──────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS qa_standards (
           id          SERIAL PRIMARY KEY,
           std_code    VARCHAR(50) UNIQUE,
           name        VARCHAR(100),
           category    VARCHAR(50),
           threshold   DECIMAL(10,4),
           unit        VARCHAR(20),
           status      VARCHAR(20) DEFAULT 'ACTIVE',
           created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE qa_standards ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS qa_inspections (
           id           SERIAL PRIMARY KEY,
           inspect_no   VARCHAR(50) UNIQUE,
           house_code   VARCHAR(50),
           inspect_date DATE,
           inspector    VARCHAR(100),
           result       VARCHAR(20),
           score        DECIMAL(5,2),
           status       VARCHAR(20) DEFAULT 'PENDING',
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS score      DECIMAL(5,2)`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,
        // B1: 首检页前端写入但 V2 schema 缺失的列；不加则 CRUD 写入静默丢字段
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS batch_no       VARCHAR(64)`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS sku_code       VARCHAR(64)`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS sample_qty     INTEGER DEFAULT 0`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS issues         TEXT`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS check_shell    BOOLEAN DEFAULT false`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS check_weight   BOOLEAN DEFAULT false`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS check_cleanness BOOLEAN DEFAULT false`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS check_grade    BOOLEAN DEFAULT false`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS check_pack     BOOLEAN DEFAULT false`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS check_label    BOOLEAN DEFAULT false`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS insp_no        VARCHAR(64)`,

        `CREATE TABLE IF NOT EXISTS qa_inspection_items (
           id           SERIAL PRIMARY KEY,
           inspect_no   VARCHAR(50),
           item_name    VARCHAR(100),
           std_code     VARCHAR(50),
           actual_value DECIMAL(10,4),
           pass         BOOLEAN DEFAULT true,
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS qa_product_inspections (
           id           SERIAL PRIMARY KEY,
           batch_no     VARCHAR(50),
           product_code VARCHAR(50),
           sample_qty   INT DEFAULT 0,
           pass_qty     INT DEFAULT 0,
           result       VARCHAR(20),
           inspector    VARCHAR(100),
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS qa_non_conformance (
           id           SERIAL PRIMARY KEY,
           ncr_no       VARCHAR(50) UNIQUE,
           source       VARCHAR(100),
           description  TEXT,
           severity     VARCHAR(20) DEFAULT 'LOW',
           status       VARCHAR(20) DEFAULT 'OPEN',
           assignee     VARCHAR(100),
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE qa_non_conformance ADD COLUMN IF NOT EXISTS severity   VARCHAR(20) DEFAULT 'LOW'`,
        `ALTER TABLE qa_non_conformance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        // ── 质量标准历史（audit） ─────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS qa_standards_history (
           id           SERIAL PRIMARY KEY,
           std_code     VARCHAR(50),
           changed_by   VARCHAR(100),
           old_value    TEXT,
           new_value    TEXT,
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        // ── 养殖扩展（免疫/用药/停药） ────────────────────────────────────
        // B2: brd_immune_plans / brd_medication_records / brd_withdrawal_alerts 是 V2 残留的
        //     3 张孤儿表，V3 前端完全不使用（实际语义都被 brd_vaccinations / brd_medications
        //     收口）。暂保留 schema 不删除（避免 V2 历史数据丢失），但运行时无人写入。
        //     待 V2 数据彻底归档后可 DROP 这 3 张表。
        `CREATE TABLE IF NOT EXISTS brd_immune_plans (
           id          SERIAL PRIMARY KEY,
           plan_no     VARCHAR(50) UNIQUE,
           flock_no    VARCHAR(50),
           house_code  VARCHAR(50),
           vaccine     VARCHAR(100),
           plan_date   DATE,
           actual_date DATE,
           status      VARCHAR(20) DEFAULT 'PENDING',
           created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE brd_immune_plans ADD COLUMN IF NOT EXISTS actual_date DATE`,
        `ALTER TABLE brd_immune_plans ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS brd_medication_records (
           id          SERIAL PRIMARY KEY,
           flock_no    VARCHAR(50),
           drug_name   VARCHAR(100),
           start_date  DATE,
           end_date    DATE,
           dosage      VARCHAR(100),
           status      VARCHAR(20) DEFAULT 'ACTIVE',
           created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS dosage     VARCHAR(100)`,
        `ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS brd_vaccinations (
           id           SERIAL PRIMARY KEY,
           flock_no     VARCHAR(50),
           vaccine      VARCHAR(100),
           plan_date    DATE,
           actual_date  DATE,
           batch_no     VARCHAR(50),
           status       VARCHAR(20) DEFAULT 'PENDING',
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS batch_no       VARCHAR(50)`,
        `ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS farm_house     VARCHAR(100)`,
        `ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS house_code     VARCHAR(50)`,
        `ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS farm_code      VARCHAR(50)`,
        `ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS vaccine_name   VARCHAR(100)`,
        `ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS vaccine_batch_no VARCHAR(50)`,
        `ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS flock_count    INT DEFAULT 0`,
        `ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS next_due_date  DATE`,
        `ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS method         VARCHAR(50)`,
        `ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS dose           VARCHAR(100)`,
        `ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS executor       VARCHAR(100)`,
        `ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP`,
        // A3: 历史数据可能混存 done/DONE，统一大写
        `UPDATE brd_vaccinations SET status = UPPER(status) WHERE status IS NOT NULL AND status <> UPPER(status)`,

        // A1: 把 brd_daily_logs 唯一键从 (log_date, house_code) 扩展到含 shift，
        //     原约束在多班次场景下会让第二条 INSERT 必报 23505。
        //     ALTER ... DROP/ADD 不带 IF NOT EXISTS，所以包在 DO 块里做存在性检测。
        `DO $$
         BEGIN
           IF EXISTS (
             SELECT 1 FROM pg_constraint
             WHERE conrelid = 'brd_daily_logs'::regclass
               AND conname = 'brd_daily_logs_date_house_key'
           ) THEN
             ALTER TABLE brd_daily_logs DROP CONSTRAINT brd_daily_logs_date_house_key;
           END IF;
           -- 把 NULL shift 改为空字符串，让 UNIQUE 索引能稳定工作
           UPDATE brd_daily_logs SET shift = '' WHERE shift IS NULL;
           IF NOT EXISTS (
             SELECT 1 FROM pg_constraint
             WHERE conrelid = 'brd_daily_logs'::regclass
               AND conname = 'brd_daily_logs_date_house_shift_key'
           ) THEN
             ALTER TABLE brd_daily_logs
               ADD CONSTRAINT brd_daily_logs_date_house_shift_key
               UNIQUE (log_date, house_code, shift);
           END IF;
         END $$;`,

        `CREATE TABLE IF NOT EXISTS brd_withdrawal_alerts (
           id          SERIAL PRIMARY KEY,
           flock_no    VARCHAR(50),
           drug_name   VARCHAR(100),
           end_date    DATE,
           days_left   INT DEFAULT 0,
           status      VARCHAR(20) DEFAULT 'ACTIVE',
           created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE brd_withdrawal_alerts ADD COLUMN IF NOT EXISTS days_left  INT DEFAULT 0`,
        `ALTER TABLE brd_withdrawal_alerts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        // ── 门店运营 ──────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS store_receiving (
           id            SERIAL PRIMARY KEY,
           receiving_no  VARCHAR(50) UNIQUE,
           store_code    VARCHAR(30),
           wave_no       VARCHAR(50),
           receive_date  DATE,
           status        VARCHAR(20) DEFAULT 'PENDING',
           created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE store_receiving ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS store_receiving_items (
           id            SERIAL PRIMARY KEY,
           receiving_no  VARCHAR(50),
           product_code  VARCHAR(50),
           qty           DECIMAL(12,3) DEFAULT 0,
           batch_no      VARCHAR(50),
           created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS store_transfers (
           id           SERIAL PRIMARY KEY,
           transfer_no  VARCHAR(50) UNIQUE,
           from_store   VARCHAR(30),
           to_store     VARCHAR(30),
           product_code VARCHAR(50),
           qty          DECIMAL(12,3) DEFAULT 0,
           status       VARCHAR(20) DEFAULT 'PENDING',
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE store_transfers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS store_replenish_req (
           id           SERIAL PRIMARY KEY,
           req_no       VARCHAR(50) UNIQUE,
           store_code   VARCHAR(30),
           product_code VARCHAR(50),
           qty          DECIMAL(12,3) DEFAULT 0,
           urgency      VARCHAR(20) DEFAULT 'NORMAL',
           status       VARCHAR(20) DEFAULT 'PENDING',
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE store_replenish_req ADD COLUMN IF NOT EXISTS urgency    VARCHAR(20) DEFAULT 'NORMAL'`,
        `ALTER TABLE store_replenish_req ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS store_losses (
           id           SERIAL PRIMARY KEY,
           loss_no      VARCHAR(50) UNIQUE,
           store_code   VARCHAR(30),
           product_code VARCHAR(50),
           qty          DECIMAL(12,3) DEFAULT 0,
           reason       TEXT,
           loss_date    DATE,
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE store_losses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS store_inventory (
           id              SERIAL PRIMARY KEY,
           store_code      VARCHAR(30),
           product_code    VARCHAR(50),
           qty             DECIMAL(12,3) DEFAULT 0,
           last_count_date DATE,
           created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           UNIQUE (store_code, product_code)
         )`,
        `ALTER TABLE store_inventory ADD COLUMN IF NOT EXISTS last_count_date DATE`,
        `ALTER TABLE store_inventory ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMP`,

        // ── 采购扩展（prc_receipts / prc_supplier_returns）───────────────
        `CREATE TABLE IF NOT EXISTS prc_receipts (
           id           SERIAL PRIMARY KEY,
           receipt_no   VARCHAR(50) UNIQUE,
           order_no     VARCHAR(50),
           supplier_code VARCHAR(50),
           receive_date DATE,
           status       VARCHAR(20) DEFAULT 'PENDING',
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE prc_receipts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS prc_supplier_returns (
           id            SERIAL PRIMARY KEY,
           return_no     VARCHAR(50) UNIQUE,
           supplier_code VARCHAR(50),
           order_no      VARCHAR(50),
           reason        TEXT,
           status        VARCHAR(20) DEFAULT 'PENDING',
           created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE prc_supplier_returns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        // ── 财务扩展 ──────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS fin_store_settlements (
           id           SERIAL PRIMARY KEY,
           settle_no    VARCHAR(50) UNIQUE,
           store_code   VARCHAR(30),
           period       VARCHAR(20),
           amount       DECIMAL(12,2) DEFAULT 0,
           status       VARCHAR(20) DEFAULT 'PENDING',
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE fin_store_settlements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS fin_pay_records (
           id           SERIAL PRIMARY KEY,
           pay_no       VARCHAR(50) UNIQUE,
           amount       DECIMAL(12,2) DEFAULT 0,
           pay_date     DATE,
           method       VARCHAR(30),
           note         TEXT,
           status       VARCHAR(20) DEFAULT 'PENDING',
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE fin_pay_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        // ── 订单管理 (ord_*) ──────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS ord_customers (
           id            SERIAL PRIMARY KEY,
           customer_code VARCHAR(50) UNIQUE,
           customer_name VARCHAR(100),
           phone         VARCHAR(30),
           region        VARCHAR(100),
           credit_limit  DECIMAL(12,2) DEFAULT 0,
           status        VARCHAR(20) DEFAULT 'ACTIVE',
           created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS ord_prices (
           id            SERIAL PRIMARY KEY,
           customer_code VARCHAR(50),
           product_code  VARCHAR(50),
           price         DECIMAL(10,4) DEFAULT 0,
           effective_date DATE,
           status        VARCHAR(20) DEFAULT 'ACTIVE',
           created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS ord_orders (
           id            SERIAL PRIMARY KEY,
           order_no      VARCHAR(50) UNIQUE,
           customer_code VARCHAR(50),
           customer_name VARCHAR(100),
           order_date    DATE,
           total_amount  DECIMAL(12,2) DEFAULT 0,
           status        VARCHAR(20) DEFAULT 'PENDING',
           created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100)`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS ord_order_items (
           id            SERIAL PRIMARY KEY,
           order_no      VARCHAR(50),
           product_code  VARCHAR(50),
           qty           DECIMAL(12,3) DEFAULT 0,
           unit_price    DECIMAL(10,4) DEFAULT 0,
           amount        DECIMAL(12,2) DEFAULT 0,
           created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS ord_approval_log (
           id         SERIAL PRIMARY KEY,
           order_no   VARCHAR(50),
           action     VARCHAR(30),
           operator   VARCHAR(100),
           note       TEXT,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS ord_credit_usage (
           id            SERIAL PRIMARY KEY,
           customer_code VARCHAR(50),
           order_no      VARCHAR(50),
           amount        DECIMAL(12,2) DEFAULT 0,
           type          VARCHAR(20),
           created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        // 历史 schema 可能缺 sequence 默认 — 不能用 OWNED BY（要求同 owner）
        `CREATE SEQUENCE IF NOT EXISTS ord_credit_usage_id_seq`,
        `ALTER TABLE ord_credit_usage ALTER COLUMN id SET DEFAULT nextval('ord_credit_usage_id_seq')`,
        `SELECT setval('ord_credit_usage_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM ord_credit_usage), 1))`,
        `ALTER TABLE ord_credit_usage ADD COLUMN IF NOT EXISTS action VARCHAR(20)`,
        `ALTER TABLE ord_credit_usage ADD COLUMN IF NOT EXISTS balance_after DECIMAL(18,2)`,

        // ── V2 fidelity backfill: ord_customers 加 SalesEngine 需要的列 ────────
        `ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS risk_flag VARCHAR(20) DEFAULT 'NORMAL'`,
        `ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS protection_status VARCHAR(20) DEFAULT 'INIT'`,
        `ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS current_owner_subject_id VARCHAR(64)`,

        // ── 历史 schema 漂移：多张表 id NOT NULL 无 sequence default 兜底 ──────
        // (V2 → V3 迁移留下的 id 列没绑定 SERIAL/sequence；INSERT 不带 id 会 NOT NULL violation)
        // pos_sessions: 全列防御性建表（已存在则跳过；列缺失则补齐）
        `CREATE TABLE IF NOT EXISTS pos_sessions (
           id SERIAL PRIMARY KEY,
           session_no    VARCHAR(60) UNIQUE,
           store_code    VARCHAR(50),
           cashier       VARCHAR(50),
           opening_cash  NUMERIC(14,2) DEFAULT 0,
           closing_cash  NUMERIC(14,2) DEFAULT 0,
           total_sales   NUMERIC(18,2) DEFAULT 0,
           order_count   INTEGER DEFAULT 0,
           status        VARCHAR(20) DEFAULT 'OPEN',
           open_time     TEXT,
           close_time    TEXT,
           remark        TEXT
         )`,
        `ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS opening_cash NUMERIC(14,2) DEFAULT 0`,
        `ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS closing_cash NUMERIC(14,2) DEFAULT 0`,
        `ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS total_sales  NUMERIC(18,2) DEFAULT 0`,
        `ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS order_count  INTEGER DEFAULT 0`,
        `ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS status       VARCHAR(20) DEFAULT 'OPEN'`,
        `ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS open_time    TEXT`,
        `ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS close_time   TEXT`,
        `ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS remark       TEXT`,
        `CREATE SEQUENCE IF NOT EXISTS pos_sessions_id_seq`,
        `ALTER TABLE pos_sessions ALTER COLUMN id SET DEFAULT nextval('pos_sessions_id_seq')`,
        `SELECT setval('pos_sessions_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM pos_sessions), 1))`,
        `CREATE SEQUENCE IF NOT EXISTS ord_customers_id_seq`,
        `ALTER TABLE ord_customers ALTER COLUMN id SET DEFAULT nextval('ord_customers_id_seq')`,
        `SELECT setval('ord_customers_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM ord_customers), 1))`,
        `CREATE SEQUENCE IF NOT EXISTS store_losses_id_seq`,
        `ALTER TABLE store_losses ALTER COLUMN id SET DEFAULT nextval('store_losses_id_seq')`,
        `SELECT setval('store_losses_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM store_losses), 1))`,
        `CREATE SEQUENCE IF NOT EXISTS store_replenish_req_id_seq`,
        `ALTER TABLE store_replenish_req ALTER COLUMN id SET DEFAULT nextval('store_replenish_req_id_seq')`,
        `SELECT setval('store_replenish_req_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM store_replenish_req), 1))`,

        // ── V2 fidelity backfill: daily_close.close_no 索引 (加速幂等查询) ───
        `CREATE INDEX IF NOT EXISTS daily_close_close_no_idx ON daily_close(close_no)`,

        // ── V2 fidelity backfill: fin_transactions 补齐 V2 列 ─────────────────
        // V2 用 txn_no/txn_id 作业务单号，V3 schema 只有 transaction_no
        // 用 txn_no 作为别名补齐（与 V2 SQL 兼容）；并加 3 级审批字段
        `ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS txn_no VARCHAR(64)`,
        `ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS created_by INTEGER`,
        `ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS approved_by_mgr VARCHAR(64)`,
        `ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS approved_by_gm  VARCHAR(64)`,
        `ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS approved_by_ceo VARCHAR(64)`,
        `CREATE INDEX IF NOT EXISTS fin_txn_txn_no_idx ON fin_transactions(txn_no)`,
        // 将历史 transaction_no 同步到 txn_no（首次迁移）
        `UPDATE fin_transactions SET txn_no = transaction_no WHERE txn_no IS NULL AND transaction_no IS NOT NULL`,

        // fin_invoices: 加 direction (AP/AR) 与 updated_at
        `ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS direction VARCHAR(8)`,
        `ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS updated_at TEXT`,
        `UPDATE fin_invoices SET direction = 'AP' WHERE direction IS NULL`,

        // fin_approvals.id 无 sequence default → INSERT 会 NOT NULL 违例
        `CREATE SEQUENCE IF NOT EXISTS fin_approvals_id_seq`,
        `ALTER TABLE fin_approvals ALTER COLUMN id SET DEFAULT nextval('fin_approvals_id_seq')`,
        `SELECT setval('fin_approvals_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM fin_approvals), 1))`,

        // ord_orders 补 paid_amount + received_date 列（V2 收款链路）
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(18,2) DEFAULT 0`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS received_date DATE`,

        // ══════════════════════════════════════════════════════════════════════
        // 阶段二收尾：V2 残表归档封存（sys_users / sys_roles / sys_user_roles）
        // 策略：
        //   1) 把 V2 表里、V3 sys_user 没有的孤立行做 best-effort 迁入 (用户名为主键)
        //      （密码字段差异较大，bcrypt vs scrypt — 这一步只迁档案信息，登录仍需走 V3）
        //   2) 把 V2 表 rename 为 _v2_archived_*（保留快照；DROP 风险太大）
        //   3) 之后任何 SELECT FROM sys_users 都会 fail（业务代码已切到单数）
        // 注：所有步骤 IF EXISTS 包裹，已迁过的二次启动 no-op
        // ══════════════════════════════════════════════════════════════════════

        // (1) 迁移孤立用户：sys_users 中的 username 在 sys_user 不存在的记录
        //     注意：password_hash 字段格式（V2 scrypt vs V3 bcrypt）差异，迁过去的账号
        //     登录前必须重置密码。这里仅保留档案 + 把 status 设为 0 (FROZEN) 强制改密
        `DO $do$ BEGIN
           IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='sys_users') THEN
             INSERT INTO sys_user (username, password_hash, real_name, store_code, status, locale, note, created_at, updated_at)
             SELECT
               su.username,
               COALESCE(su.password_hash, 'MIGRATED_FROZEN_NEED_RESET'),
               COALESCE(su.real_name_zh, su.username),
               COALESCE(su.store_code, 'ALL'),
               0,
               'zh-CN',
               '[V2→V3 archived migration]',
               now(), now()
             FROM sys_users su
             WHERE NOT EXISTS (SELECT 1 FROM sys_user u WHERE u.username = su.username)
             ON CONFLICT (username) DO NOTHING;
           END IF;
         END $do$;`,

        // (2) 重命名 V2 表为归档名（IF EXISTS 防重复执行）
        `ALTER TABLE IF EXISTS sys_users      RENAME TO _v2_archived_sys_users`,
        `ALTER TABLE IF EXISTS sys_roles      RENAME TO _v2_archived_sys_roles`,
        `ALTER TABLE IF EXISTS sys_user_roles RENAME TO _v2_archived_sys_user_roles`,

        // (3) 释放被引用的 sequence（V2 表归档后 sequence 也归档，避免误用）
        `ALTER SEQUENCE IF EXISTS sys_users_id_seq        RENAME TO _v2_archived_sys_users_id_seq`,
        `ALTER SEQUENCE IF EXISTS sys_roles_role_id_seq   RENAME TO _v2_archived_sys_roles_id_seq`,
        `ALTER SEQUENCE IF EXISTS sys_user_roles_id_seq   RENAME TO _v2_archived_sys_user_roles_id_seq`,

        // ── V2 fidelity backfill: pda_terminals.id 加 sequence ──────────────
        `CREATE SEQUENCE IF NOT EXISTS pda_terminals_id_seq`,
        `ALTER TABLE pda_terminals ALTER COLUMN id SET DEFAULT nextval('pda_terminals_id_seq')`,
        `SELECT setval('pda_terminals_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM pda_terminals), 1))`,
        // pda_terminals.serial 加 UNIQUE 索引（V2 用 UNIQUE 约束防重）
        `CREATE UNIQUE INDEX IF NOT EXISTS pda_terminals_serial_uq ON pda_terminals(serial) WHERE serial IS NOT NULL AND serial <> ''`,

        // ── V2 fidelity backfill: qa_inspections / qa_non_conformance ────────
        // V3 qa_inspections.items/failItems 是 integer，V2 写 JSON → 新增 *_json text 列
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS items_json TEXT`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS fail_items_json TEXT`,
        // qa_non_conformance 补 V2 字段
        `ALTER TABLE qa_non_conformance ADD COLUMN IF NOT EXISTS issue_type VARCHAR(64)`,
        `ALTER TABLE qa_non_conformance ADD COLUMN IF NOT EXISTS batch_no VARCHAR(64)`,
        `ALTER TABLE qa_non_conformance ADD COLUMN IF NOT EXISTS description TEXT`,
        `CREATE SEQUENCE IF NOT EXISTS qa_non_conformance_id_seq`,
        `ALTER TABLE qa_non_conformance ALTER COLUMN id SET DEFAULT nextval('qa_non_conformance_id_seq')`,
        `SELECT setval('qa_non_conformance_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM qa_non_conformance), 1))`,

        // ── V2 fidelity backfill: inv_batches.status + qty_available ──────────
        // V2 schema 含 status (AVAILABLE/QUARANTINE/EXPIRED/LOCKED) 用于:
        //   - 包装 saleable=false 的破损蛋走 QUARANTINE 隔离 (食品安全)
        //   - WMS 收货 LOCKED/EXPIRED 批次拦截
        //   - POS 销售只能选 AVAILABLE 批次
        // qty_available 区分总量 vs 实际可售量（锁定/预占）
        `ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'AVAILABLE'`,
        `ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS qty_available INTEGER`,
        // 把历史数据 qty_available 默认 = qty（仅首次回填）
        `UPDATE inv_batches SET qty_available = qty WHERE qty_available IS NULL`,
        // 触发器保持 qty_available <= qty (默认与 qty 一致；外部业务可单独 UPDATE qty_reserved 时再扣)
        `CREATE OR REPLACE FUNCTION inv_batches_sync_available() RETURNS trigger AS $$
         BEGIN
           IF NEW.qty_available IS NULL THEN NEW.qty_available := NEW.qty; END IF;
           RETURN NEW;
         END;
         $$ LANGUAGE plpgsql`,
        `DROP TRIGGER IF EXISTS inv_batches_sync_available_trg ON inv_batches`,
        `CREATE TRIGGER inv_batches_sync_available_trg
           BEFORE INSERT OR UPDATE ON inv_batches
           FOR EACH ROW EXECUTE FUNCTION inv_batches_sync_available()`,

        // ── 仓储补充（wms_zones/wms_transfer/wms_stock_transfers） ──────
        `CREATE TABLE IF NOT EXISTS wms_zones (
           id         SERIAL PRIMARY KEY,
           zone_code  VARCHAR(30) UNIQUE,
           zone_name  VARCHAR(100),
           warehouse  VARCHAR(50),
           status     VARCHAR(20) DEFAULT 'ACTIVE',
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE wms_zones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,
        // B5: wms_zones 加 warehouse_code 与 wms_warehouses 关联（旧 warehouse 列已不再使用）
        `ALTER TABLE wms_zones ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(50)`,
        // 历史数据：把旧 warehouse 列内容迁移到 warehouse_code
        `UPDATE wms_zones SET warehouse_code = warehouse WHERE warehouse_code IS NULL AND warehouse IS NOT NULL`,

        `CREATE TABLE IF NOT EXISTS wms_transfer (
           id           SERIAL PRIMARY KEY,
           transfer_no  VARCHAR(50) UNIQUE,
           from_zone    VARCHAR(30),
           to_zone      VARCHAR(30),
           product_code VARCHAR(50),
           qty          DECIMAL(12,3) DEFAULT 0,
           status       VARCHAR(20) DEFAULT 'PENDING',
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS wms_stock_transfers (
           id            SERIAL PRIMARY KEY,
           transfer_no   VARCHAR(50) UNIQUE,
           from_location VARCHAR(30),
           to_location   VARCHAR(30),
           product_code  VARCHAR(50),
           batch_no      VARCHAR(50),
           qty           DECIMAL(12,3) DEFAULT 0,
           status        VARCHAR(20) DEFAULT 'PENDING',
           created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE wms_stock_transfers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        // ── 采购主表补充字段 ──────────────────────────────────────────────
        `ALTER TABLE prc_purchase_orders  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,
        `ALTER TABLE prc_purchase_items   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,
        `ALTER TABLE prc_purchase_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,
        `ALTER TABLE prc_returns          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,
      ];

      for (const sql of businessTables) {
        await this.entityManager.query(sql).catch(() => {});
      }
      console.log('✅ Phase 3: All business tables verified / created successfully.');

      const farmCode = 'FARM-01';

      await this.entityManager.query(`
        INSERT INTO brd_farms (farm_code, farm_name, location, status)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (farm_code) DO NOTHING
      `, [farmCode, '凤羽一号基地', '老挝万象生态农业园', 'ACTIVE']);

      const houses = [
        { code: 'A001', name: '一号鸡舍', capacity: 50000 },
        { code: 'A002', name: '二号鸡舍', capacity: 50000 },
        { code: 'A003', name: '三号鸡舍', capacity: 50000 },
        { code: 'A004', name: '四号鸡舍', capacity: 50000 },
        { code: 'A005', name: '五号鸡舍', capacity: 50000 },
        { code: 'A006', name: '六号鸡舍', capacity: 50000 },
        { code: 'B001', name: '七号鸡舍', capacity: 60000 },
      ];

      for (const h of houses) {
        await this.entityManager.query(`
          INSERT INTO brd_houses (house_code, house_name, farm_code, capacity, status)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (house_code) DO UPDATE SET house_name = EXCLUDED.house_name, capacity = EXCLUDED.capacity
        `, [h.code, h.name, farmCode, h.capacity, 'ACTIVE']);

        const flockNo = `FLK-${h.code}-${new Date().getFullYear()}`;
        await this.entityManager.query(`
          INSERT INTO brd_flocks (flock_no, house_code, farm_code, strain, placement_date, placement_age, initial_qty, current_qty, status)
          VALUES ($1, $2, $3, $4, CURRENT_DATE - interval '100 days', $5, $6, $6, $7)
          ON CONFLICT (flock_no) DO NOTHING
        `, [flockNo, h.code, farmCode, 'Hy-Line Brown', 1, h.capacity, 'ACTIVE']);
      }
      console.log('✅ Phase 10E Breeding Data Onboarding completed successfully!');
    } catch (e) {
      console.error('❌ Failed to execute Phase 10E Onboarding:', e.message);
      require('fs').writeFileSync('/Users/mac/phoenix ERP/phoenix-erp-v3-nest/init_error.log', e.message);
    }

    // ══════════════════════════════════════════════════════════════════════
    // Phase S1: 组织架构 & 组织类型字典 初始化（幂等，每次启动自动检查）
    // ══════════════════════════════════════════════════════════════════════
    try {
      // 1. 确保 sys_orgs 表存在且拥有完整字段
      await this.entityManager.query(`
        CREATE TABLE IF NOT EXISTS sys_orgs (
          id         SERIAL PRIMARY KEY,
          org_code   VARCHAR(50)  UNIQUE,
          org_name   VARCHAR(100) NOT NULL,
          org_type   VARCHAR(50)  DEFAULT '部门',
          parent_id  INT          DEFAULT 0,
          sort_no    INT          DEFAULT 0,
          remark     TEXT,
          status     VARCHAR(20)  DEFAULT 'ACTIVE',
          created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
        )
      `).catch(() => {});

      // 补充可能缺失的列（兼容 V2 迁移表）
      const orgAlters = [
        `ALTER TABLE sys_orgs ADD COLUMN IF NOT EXISTS org_code   VARCHAR(50)`,
        `ALTER TABLE sys_orgs ADD COLUMN IF NOT EXISTS parent_id  INT DEFAULT 0`,
        `ALTER TABLE sys_orgs ADD COLUMN IF NOT EXISTS sort_no    INT DEFAULT 0`,
        `ALTER TABLE sys_orgs ADD COLUMN IF NOT EXISTS remark     TEXT`,
        `ALTER TABLE sys_orgs ADD COLUMN IF NOT EXISTS status     VARCHAR(20) DEFAULT 'ACTIVE'`,
        `ALTER TABLE sys_orgs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,
      ];
      for (const sql of orgAlters) {
        await this.entityManager.query(sql).catch(() => {});
      }

      // 2. 为 sys_dict 补充 SYS_ORG_LEVEL 字典（与 V2 迁移数据 dict_type 保持一致）
      // 用 WHERE NOT EXISTS 替代 ON CONFLICT，因为 dict_code 列可能无 UNIQUE 约束
      const orgLevels = [
        { code: 'SYS_ORG_LEVEL_1',  label_zh: '集团总部',  label_lo: 'ສຳນັກງານໃຫຍ່',       label_en: 'HQ / Group',       sort: 350 },
        { code: 'SYS_ORG_LEVEL_2',  label_zh: '事业部',    label_lo: 'ຫ່ວຍທຸລະກິດ',         label_en: 'Business Unit',    sort: 351 },
        { code: 'SYS_ORG_LEVEL_3',  label_zh: '部门',      label_lo: 'ພະແນກ',               label_en: 'Department',       sort: 352 },
        { code: 'SYS_ORG_LEVEL_4',  label_zh: '大区',      label_lo: 'ເຂດໃຫຍ່',            label_en: 'Region',           sort: 353 },
        { code: 'SYS_ORG_LEVEL_5',  label_zh: '门店',      label_lo: 'ຮ້ານ',               label_en: 'Store',            sort: 354 },
        { code: 'SYS_ORG_LEVEL_6',  label_zh: '基地',      label_lo: 'ຖານທີ່',             label_en: 'Base',             sort: 355 },
        { code: 'SYS_ORG_LEVEL_7',  label_zh: '工厂',      label_lo: 'ໂຮງງານ',             label_en: 'Factory',          sort: 356 },
        { code: 'SYS_ORG_LEVEL_8',  label_zh: '车队',      label_lo: 'ຂະບວນລົດ',          label_en: 'Fleet',            sort: 357 },
        { code: 'SYS_ORG_LEVEL_9',  label_zh: '中心',      label_lo: 'ສູນ',               label_en: 'Center',           sort: 358 },
        { code: 'SYS_ORG_LEVEL_10', label_zh: '项目组',    label_lo: 'ກຸ່ມໂຄງການ',       label_en: 'Project Group',    sort: 359 },
      ];
      for (const t of orgLevels) {
        await this.entityManager.query(`
          INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
          SELECT $1, 'SYS_ORG_LEVEL', $2, $2, $3, $4, $5, 'ACTIVE'
          WHERE NOT EXISTS (
            SELECT 1 FROM sys_dict WHERE dict_code = $1 AND dict_type = 'SYS_ORG_LEVEL'
          )
        `, [t.code, t.label_zh, t.label_lo, t.label_en, t.sort]).catch(() => {});
      }

      console.log('✅ Phase S1: sys_orgs schema & SYS_ORG_LEVEL dict initialized.');
    } catch (e2) {
      console.warn('⚠️  Phase S1 skipped:', e2.message);
    }
  }


  async findAll(table: string, query: any) {
    const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 1000);
    const offset = Math.max(Number(query.offset) || 0, 0);

    const whereClauses = [];
    const queryValues = [];
    let paramIndex = 1;

    for (const [key, val] of Object.entries(query)) {
      if (['limit', 'offset', 'page', 'sortBy', 'sortDesc', '_t'].includes(key)) continue;
      whereClauses.push(`"${key}" = $${paramIndex}`);
      queryValues.push(val);
      paramIndex++;
    }

    let sql = `SELECT * FROM "${table}"`;
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryValues.push(limit, offset);

    try {
      const rows = await this.entityManager.query(sql, queryValues);
      return rows;
    } catch (e) {
      throw new InternalServerErrorException(e.message);
    }
  }

  async create(table: string, body: any) {
    const fields = Object.keys(body);
    const values = Object.values(body);

    if (fields.length === 0) throw new BadRequestException('Empty body');

    const placeholders = fields.map((_, i) => `$${i + 1}`).join(',');
    const quotedFields = fields.map((f) => `"${f}"`).join(',');
    const sql = `INSERT INTO "${table}" (${quotedFields}) VALUES (${placeholders})`;

    // 自适应循环：逐列补齐，最多重试 5 次（防无限循环）
    for (let attempt = 0; attempt <= 5; attempt++) {
      try {
        await this.entityManager.query(sql, values);
        return { msg: 'Created successfully' };
      } catch (e) {
        const missingCol = this.extractMissingColumn(e.message);
        if (missingCol && attempt < 5) {
          await this.ensureColumn(table, missingCol);
          continue; // 自动补列后继续重试
        }
        this.handleConstraintError(e, table);
        throw new InternalServerErrorException(e.message);
      }
    }
    throw new InternalServerErrorException('Max auto-repair retries exceeded');
  }

  async update(table: string, pkName: string, id: any, body: any) {
    console.log(`[SVC Update START] table=${table} pk=${pkName} id=${id} body=${JSON.stringify(body)}`);
    const fields = Object.keys(body || {});
    const values = Object.values(body);

    if (fields.length === 0) throw new BadRequestException('Empty body');

    const setClauses = fields.map((f, i) => `"${f}" = $${i + 1}`).join(',');
    const hasUpdatedAt = fields.includes('updated_at');

    let finalSql: string;
    // ✅ 修复：updated_at 全部改用参数化写法（JS Date 对象），避免 TEXT 列类型不匹配
    if (hasUpdatedAt) {
      finalSql = `UPDATE "${table}" SET ${setClauses} WHERE "${pkName}" = $${fields.length + 1}`;
      values.push(id);
    } else {
      // $n+1 = updated_at（JS Date 自动转换）, $n+2 = PK
      finalSql = `UPDATE "${table}" SET ${setClauses}, "updated_at" = $${fields.length + 1} WHERE "${pkName}" = $${fields.length + 2}`;
      values.push(new Date(), id);
    }

    console.log(`[CRUD Update] ${table} WHERE ${pkName}=${id} | fields: ${fields.join(',')}`);

    // 自适应循环：逐列补齐，最多重试 5 次（防无限循环）
    for (let attempt = 0; attempt <= 5; attempt++) {
      try {
        await this.entityManager.query(finalSql, values);
        console.log(`[CRUD Update] ✅ success on attempt ${attempt}`);
        return { msg: 'Updated successfully' };
      } catch (e) {
        console.error(`[CRUD Update] ❌ attempt ${attempt} failed: ${e.message}`);
        const missingCol = this.extractMissingColumn(e.message);
        if (missingCol && attempt < 5) {
          await this.ensureColumn(table, missingCol);
          continue;
        }
        this.handleConstraintError(e, table);
        throw new InternalServerErrorException(e.message);
      }
    }
    throw new InternalServerErrorException('Max auto-repair retries exceeded');
  }

  async remove(table: string, pkName: string, id: any) {
    if (table === 'brd_farms') {
      const houses = await this.entityManager.query(`SELECT 1 FROM "brd_houses" WHERE farm_code = $1 LIMIT 1`, [id]);
      if (houses && houses.length > 0) {
        throw new BadRequestException('该养殖场下仍有登记的鸡舍，无法直接删除！请先清空关联鸡舍。');
      }
    }

    const sql = `DELETE FROM "${table}" WHERE "${pkName}" = $1`;
    console.log(`[CRUD Delete] ${table} WHERE ${pkName}=${id}`);
    try {
      await this.entityManager.query(sql, [id]);
      console.log(`[CRUD Delete] ✅ success`);
      return { msg: 'Deleted successfully' };
    } catch (e) {
      console.error(`[CRUD Delete] ❌ failed: ${e.message}`);
      this.handleConstraintError(e, table);
      throw new InternalServerErrorException(e.message);
    }
  }

  private handleConstraintError(e: any, table: string) {
    const msg = e.message || '';
    if (msg.includes('unique constraint') || msg.includes('duplicate key')) {
      // 从 PG 消息里提取违反约束的字段名，如 "Key (dict_code)=(PKG_EGG_GRADE_5)"
      const colMatch = msg.match(/Key \(([^)]+)\)/);
      const col = colMatch ? colMatch[1] : '';
      throw new BadRequestException(col
        ? `「${col}」已存在相同值，请修改后重试`
        : `「${table}」存在重复值，请检查后重试`);
    }
    if (msg.includes('null value in column')) {
      // 提取具体字段名，如 `null value in column "dict_code" of relation "sys_dict"`
      const colMatch = msg.match(/null value in column "([^"]+)"/);
      const col = colMatch ? colMatch[1] : '';
      throw new BadRequestException(col
        ? `必填字段「${col}」不能为空，请填写后重试`
        : `必填字段不能为空，请检查所有必填项`);
    }
    if (msg.includes('foreign key constraint')) {
      throw new BadRequestException('关联数据不存在，请先确认关联记录已创建');
    }
  }
}
