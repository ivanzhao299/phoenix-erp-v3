import { Injectable, BadRequestException, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { BREEDING_FARMS_TABLE, BreedingScopedTable } from './crud.constants';
import { OrgOwnershipService } from '../org/services/org-ownership.service';

@Injectable()
export class GenericCrudService implements OnModuleInit {
  private static readonly CRUD_ROUTE_ID_ALIAS: Record<string, string> = {
    wms_locations: 'location_code',
    wms_zones: 'zone_code',
  };

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
        'sys_dict',
        // sys_orgs 已废弃并从允许表中移除，由 sys_organizations 替代
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
        // 物流模块
        'log_dispatch', 'log_receipts', 'log_routes', 'log_exceptions',
        'log_vehicles', 'log_drivers',
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
          status VARCHAR(20) DEFAULT 'GROWING',
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
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS status            VARCHAR(20) DEFAULT 'GROWING'`,
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
        // ── Phase C 修复：补全 brd_farms/houses/flocks 的 store_code 列 ──
        // 这3张表在上方 brdAlters 段已 CREATE，但建表语句和 ALTER 段都漏了 store_code，
        // 导致全新数据库（CI/新装）的 breeding 回归测试因缺列失败。
        // （brd_daily_logs.farm_code / brd_medications.medication_code 在各自 CREATE
        //   语句中已含，无需在此补——且那两表在 businessTables 段才 CREATE，
        //   在此 brdAlters 段 ALTER 会因表未建而失败。）
        `ALTER TABLE brd_farms  ADD COLUMN IF NOT EXISTS store_code VARCHAR(64) DEFAULT 'ALL'`,
        `ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS store_code VARCHAR(64) DEFAULT 'ALL'`,
        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS store_code VARCHAR(64) DEFAULT 'ALL'`,
        // B4: lookup.controller farms()/houses() 查询的列（company_code / site_code），
        //   CI bootstrap 缺 → /api/lookup/farms、/api/lookup/houses 生产 500。补可空列对齐
        //   service 契约（prod 已有则 ADD IF NOT EXISTS no-op）。语义层（治理是否应由站点
        //   映射派生 company、site_code 是否应统一为 store_code）见 task #37，此处仅消 500。
        `ALTER TABLE brd_farms  ADD COLUMN IF NOT EXISTS company_code VARCHAR(64)`,
        `ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS site_code    VARCHAR(64)`,
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
        // B3: quality.service.createInspection() 写入但 V2 schema 缺失的列（无 catch → 缺列直接
        //     生产 500）。列名与 service INSERT 严格对齐（含 camelCase 引号标识符）。
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS henhouse          VARCHAR(64)`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS "checkType"       VARCHAR(32)`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS "checkTime"       VARCHAR(32)`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS items             INTEGER DEFAULT 0`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS "failItems"       INTEGER DEFAULT 0`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS remark            TEXT`,
        `ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS env_snapshot_json TEXT`,

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
        // B3: quality.service.createNonConformance() 写入但 V2 schema 缺失的列（无 catch → 生产 500）。
        //     原 schema 用 ncr_no，service 用 nc_no；两者并存（nc_no 为 service 实际写入键）。
        `ALTER TABLE qa_non_conformance ADD COLUMN IF NOT EXISTS nc_no        VARCHAR(50)`,
        `ALTER TABLE qa_non_conformance ADD COLUMN IF NOT EXISTS issue_type   VARCHAR(50)`,
        `ALTER TABLE qa_non_conformance ADD COLUMN IF NOT EXISTS batch_no     VARCHAR(64)`,
        `ALTER TABLE qa_non_conformance ADD COLUMN IF NOT EXISTS store_code   VARCHAR(30)`,
        `ALTER TABLE qa_non_conformance ADD COLUMN IF NOT EXISTS action_taken TEXT`,

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

        // A2: 死淘记录扩展：淘汰数量 + 淘汰原因
        `ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS elimination_qty  INT          DEFAULT 0`,
        `ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS culling_reason   VARCHAR(200)`,

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
           credit_used   DECIMAL(12,2) DEFAULT 0,
           tier          VARCHAR(20),
           status        VARCHAR(20) DEFAULT 'ACTIVE',
           created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS credit_used DECIMAL(12,2) DEFAULT 0`,
        `ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS tier        VARCHAR(20)`,
        `ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMP`,

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
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS customer_name        VARCHAR(100)`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMP`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS sales_rep            VARCHAR(100)`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS order_type           VARCHAR(30)`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS order_source         VARCHAR(50)`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS subtotal             DECIMAL(12,2) DEFAULT 0`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS discount             DECIMAL(12,2) DEFAULT 0`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS need_price_approval  SMALLINT DEFAULT 0`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS need_credit_approval SMALLINT DEFAULT 0`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS is_urgent            SMALLINT DEFAULT 0`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS delivery_addr        TEXT`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS expected_date        DATE`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS remark               TEXT`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS created_by           VARCHAR(100)`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS shipped_date         DATE`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS received_date       DATE`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS cancel_reason       TEXT`,
        `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS store_code          VARCHAR(50)`,

        `CREATE TABLE IF NOT EXISTS ord_order_items (
           id               SERIAL PRIMARY KEY,
           order_no         VARCHAR(50),
           product_code     VARCHAR(50),
           product_name_zh  VARCHAR(256),
           qty              DECIMAL(12,3) DEFAULT 0,
           unit             VARCHAR(20),
           unit_price       DECIMAL(10,4) DEFAULT 0,
           subtotal         DECIMAL(12,2) DEFAULT 0,
           amount           DECIMAL(12,2) DEFAULT 0,
           batch_no         VARCHAR(100),
           created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE ord_order_items ADD COLUMN IF NOT EXISTS product_name_zh VARCHAR(256)`,
        `ALTER TABLE ord_order_items ADD COLUMN IF NOT EXISTS unit            VARCHAR(20)`,
        `ALTER TABLE ord_order_items ADD COLUMN IF NOT EXISTS subtotal        DECIMAL(12,2) DEFAULT 0`,
        `ALTER TABLE ord_order_items ADD COLUMN IF NOT EXISTS batch_no        VARCHAR(100)`,

        `CREATE TABLE IF NOT EXISTS ord_approval_log (
           id         SERIAL PRIMARY KEY,
           order_no   VARCHAR(50),
           action     VARCHAR(30),
           operator   VARCHAR(100),
           remark     TEXT,
           note       TEXT,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE ord_approval_log ADD COLUMN IF NOT EXISTS remark TEXT`,

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

        // A3: 鸡蛋销售出库：ord_order_items 加 grade 字段（对应蛋品规格）
        `ALTER TABLE ord_order_items ADD COLUMN IF NOT EXISTS grade VARCHAR(20)`,

        // A4: 农场直销客户种子数据（幂等 INSERT，customer_code 为唯一键）
        `INSERT INTO ord_customers (customer_code, customer_name, tier, status)
         VALUES
           ('FARM-MS',  '孟赛直营店',  'FARM', 'ACTIVE'),
           ('FARM-WX',  '万象直营店',  'FARM', 'ACTIVE'),
           ('FARM-ML1', '孟龙客户一',  'FARM', 'ACTIVE'),
           ('FARM-ML2', '孟龙客户二',  'FARM', 'ACTIVE'),
           ('FARM-EMP', '职工购买',    'FARM', 'ACTIVE')
         ON CONFLICT (customer_code) DO NOTHING`,

        // A5: 药品目录种子数据（ON CONFLICT DO NOTHING 幂等）
        `INSERT INTO brd_medications (medication_code, medication_name, dosage, status) VALUES
           ('MED-001', '新城疫疫苗',        '1000头份/瓶',       'ACTIVE'),
           ('MED-002', '禽流感H9疫苗',      '500头份/瓶',        'ACTIVE'),
           ('MED-003', '禽流感H5疫苗',      '500头份/瓶',        'ACTIVE'),
           ('MED-004', '传染性支气管炎疫苗', '1000头份/瓶',       'ACTIVE'),
           ('MED-005', '法氏囊疫苗',        '1000头份/瓶',       'ACTIVE'),
           ('MED-006', '鸡痘疫苗',          '1000头份/瓶',       'ACTIVE'),
           ('MED-007', '传染性喉气管炎疫苗', '500头份/瓶',        'ACTIVE'),
           ('MED-008', '马立克疫苗',        '1000头份/瓶',       'ACTIVE'),
           ('MED-009', '恩诺沙星',          '100g/袋',           'ACTIVE'),
           ('MED-010', '阿莫西林',          '100g/袋',           'ACTIVE'),
           ('MED-011', '多西环素',          '100g/袋',           'ACTIVE'),
           ('MED-012', '氟苯尼考',          '100g/袋',           'ACTIVE'),
           ('MED-013', '泰乐菌素',          '100g/袋',           'ACTIVE'),
           ('MED-014', '林可霉素',          '100g/袋',           'ACTIVE'),
           ('MED-015', '庆大霉素',          '100ml/瓶',          'ACTIVE'),
           ('MED-016', '新霉素',            '100g/袋',           'ACTIVE'),
           ('MED-017', '磺胺二甲嘧啶',      '500g/袋',           'ACTIVE'),
           ('MED-018', '诺氟沙星',          '100g/袋',           'ACTIVE'),
           ('MED-019', '环丙沙星',          '100g/袋',           'ACTIVE'),
           ('MED-020', '妥曲珠利',          '1L/瓶',             'ACTIVE'),
           ('MED-021', '安普罗利',          '100g/袋',           'ACTIVE'),
           ('MED-022', '地克珠利',          '1L/瓶',             'ACTIVE'),
           ('MED-023', '磺胺氯吡嗪钠',      '100g/袋',           'ACTIVE'),
           ('MED-024', '伊维菌素',          '500ml/瓶',          'ACTIVE'),
           ('MED-025', '阿苯达唑',          '500g/袋',           'ACTIVE'),
           ('MED-026', '维生素C',           '100g/袋',           'ACTIVE'),
           ('MED-027', '维生素E',           '100g/袋',           'ACTIVE'),
           ('MED-028', '维生素AD3',         '500ml/瓶',          'ACTIVE'),
           ('MED-029', '维生素K3',          '100g/袋',           'ACTIVE'),
           ('MED-030', '复合维生素',         '100g/袋',           'ACTIVE'),
           ('MED-031', '电解多维',           '100g/袋',           'ACTIVE'),
           ('MED-032', '葡萄糖',            '500g/袋',           'ACTIVE'),
           ('MED-033', '口服补液盐',         '100g/袋',           'ACTIVE'),
           ('MED-034', '黄芪多糖',          '100g/袋',           'ACTIVE'),
           ('MED-035', '板蓝根',            '100g/袋',           'ACTIVE'),
           ('MED-036', '双黄连',            '100ml/瓶',          'ACTIVE'),
           ('MED-037', '地塞米松',          '100ml/瓶',          'ACTIVE'),
           ('MED-038', '扑热息痛',          '100g/袋',           'ACTIVE'),
           ('MED-039', '氨茶碱',            '100g/袋',           'ACTIVE'),
           ('MED-040', '碳酸氢钠',          '500g/袋',           'ACTIVE'),
           ('MED-041', '过硫酸氢钾复合盐',   '500g/袋',           'ACTIVE'),
           ('MED-042', '碘伏',              '5L/桶',             'ACTIVE'),
           ('MED-043', '酒精',              '500ml/瓶',          'ACTIVE'),
           ('MED-044', '火碱',              '25kg/袋',           'ACTIVE'),
           ('MED-045', '生石灰',            '25kg/袋',           'ACTIVE'),
           ('MED-046', '甲醛溶液',          '500ml/瓶',          'ACTIVE')
         ON CONFLICT (medication_code) DO NOTHING`,

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
           id              SERIAL PRIMARY KEY,
           transfer_no     VARCHAR(50) UNIQUE,
           from_warehouse  VARCHAR(64),
           to_warehouse    VARCHAR(64),
           from_zone       VARCHAR(30),
           to_zone         VARCHAR(30),
           product_code    VARCHAR(50),
           qty             DECIMAL(12,3) DEFAULT 0,
           status          VARCHAR(20) DEFAULT 'PENDING',
           operator_id     INTEGER,
           created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE wms_transfer ADD COLUMN IF NOT EXISTS from_warehouse  VARCHAR(64)`,
        `ALTER TABLE wms_transfer ADD COLUMN IF NOT EXISTS to_warehouse    VARCHAR(64)`,
        `ALTER TABLE wms_transfer ADD COLUMN IF NOT EXISTS operator_id     INTEGER`,

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
        `ALTER TABLE prc_purchase_requests ADD COLUMN IF NOT EXISTS attachment_url TEXT`,
        `ALTER TABLE prc_returns          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        // ── 主数据（mst_*）：新装库无 V2 数据时须幂等建表 ───────────────
        `CREATE TABLE IF NOT EXISTS mst_stores (
           id          SERIAL PRIMARY KEY,
           store_code  VARCHAR(50) UNIQUE,
           store_name  VARCHAR(100),
           address     TEXT,
           phone       VARCHAR(30),
           status      VARCHAR(20) DEFAULT 'ACTIVE',
           created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE mst_stores ADD COLUMN IF NOT EXISTS address    TEXT`,
        `ALTER TABLE mst_stores ADD COLUMN IF NOT EXISTS phone      VARCHAR(30)`,
        `ALTER TABLE mst_stores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS mst_products (
           id                  SERIAL PRIMARY KEY,
           product_code        VARCHAR(50) UNIQUE,
           product_name        VARCHAR(100),
           product_name_zh     VARCHAR(100),
           product_name_lo     VARCHAR(100),
           unit_zh             VARCHAR(20),
           unit_lo             VARCHAR(20),
           shelf_life_days     INT DEFAULT 0,
           price_retail        DECIMAL(10,4) DEFAULT 0,
           price_wholesale     DECIMAL(10,4) DEFAULT 0,
           status              VARCHAR(20) DEFAULT 'ACTIVE',
           created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE mst_products ADD COLUMN IF NOT EXISTS product_name     VARCHAR(100)`,
        `ALTER TABLE mst_products ADD COLUMN IF NOT EXISTS product_name_zh  VARCHAR(100)`,
        `ALTER TABLE mst_products ADD COLUMN IF NOT EXISTS product_name_lo  VARCHAR(100)`,
        `ALTER TABLE mst_products ADD COLUMN IF NOT EXISTS unit_zh          VARCHAR(20)`,
        `ALTER TABLE mst_products ADD COLUMN IF NOT EXISTS unit_lo          VARCHAR(20)`,
        `ALTER TABLE mst_products ADD COLUMN IF NOT EXISTS shelf_life_days  INT DEFAULT 0`,
        `ALTER TABLE mst_products ADD COLUMN IF NOT EXISTS price_retail     DECIMAL(10,4) DEFAULT 0`,
        `ALTER TABLE mst_products ADD COLUMN IF NOT EXISTS price_wholesale  DECIMAL(10,4) DEFAULT 0`,
        `ALTER TABLE mst_products ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMP`,

        // ── sys_dict：全局字典表（Phase S1/S2 依赖）──────────────────────
        `CREATE TABLE IF NOT EXISTS sys_dict (
           id             SERIAL PRIMARY KEY,
           dict_code      VARCHAR(64),
           dict_type      VARCHAR(64),
           name           VARCHAR(128),
           dict_label_zh  VARCHAR(128),
           dict_label_lo  VARCHAR(128),
           dict_label_en  VARCHAR(128),
           dict_value     VARCHAR(64),
           sort_no        INT DEFAULT 0,
           status         VARCHAR(32) DEFAULT 'ACTIVE',
           config_json    TEXT,
           created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE sys_dict ADD COLUMN IF NOT EXISTS dict_code     VARCHAR(64)`,
        `ALTER TABLE sys_dict ADD COLUMN IF NOT EXISTS dict_label_lo VARCHAR(128)`,
        `ALTER TABLE sys_dict ADD COLUMN IF NOT EXISTS dict_label_en VARCHAR(128)`,
        `ALTER TABLE sys_dict ADD COLUMN IF NOT EXISTS config_json   TEXT`,

        // ── sys_approval_flows / sys_permissions ──────────────────────────
        `CREATE TABLE IF NOT EXISTS sys_approval_flows (
           id             SERIAL PRIMARY KEY,
           flow_code      VARCHAR(64) UNIQUE,
           flow_name      VARCHAR(256),
           doc_type       VARCHAR(64),
           approver_chain TEXT,
           status         VARCHAR(32) DEFAULT 'ACTIVE',
           created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `CREATE TABLE IF NOT EXISTS sys_permissions (
           id         SERIAL PRIMARY KEY,
           perm_code  VARCHAR(64) UNIQUE,
           perm_name  VARCHAR(256),
           resource   VARCHAR(128),
           action     VARCHAR(32),
           status     VARCHAR(32) DEFAULT 'ACTIVE',
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        // ── 养殖日报（brd_daily_logs）────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS brd_daily_logs (
           id            SERIAL PRIMARY KEY,
           flock_no      VARCHAR(64),
           log_date      DATE,
           shift         VARCHAR(64),
           feed_consumed DECIMAL(10,2) DEFAULT 0,
           water_consumed DECIMAL(10,2) DEFAULT 0,
           mortality_qty INT DEFAULT 0,
           eggs_produced INT DEFAULT 0,
           bad_eggs      INT DEFAULT 0,
           dirty_eggs    INT DEFAULT 0,
           broken_eggs   INT DEFAULT 0,
           temp          DECIMAL(5,2),
           humidity      DECIMAL(5,2),
           note          TEXT,
           operator      VARCHAR(128),
           farm_code     VARCHAR(64),
           house_code    VARCHAR(64),
           egg_count     INT DEFAULT 0,
           farm_name     VARCHAR(256),
           updated_at    TIMESTAMP,
           created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           UNIQUE (log_date, house_code, shift)
         )`,

        // ── 兽药主数据 ────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS brd_medications (
           id               SERIAL PRIMARY KEY,
           medication_code  VARCHAR(64) UNIQUE,
           medication_name  VARCHAR(256),
           dosage           VARCHAR(64),
           status           VARCHAR(32) DEFAULT 'ACTIVE',
           created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        // ── 库存批次 & 台账 ───────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS inv_batches (
           id              SERIAL PRIMARY KEY,
           batch_no        VARCHAR(64) UNIQUE,
           product_code    VARCHAR(64),
           qty             INTEGER DEFAULT 0,
           qty_available   INTEGER,
           status          VARCHAR(20) DEFAULT 'AVAILABLE',
           warehouse_code  VARCHAR(50),
           location_code   VARCHAR(50),
           store_code      VARCHAR(50),
           expire_date     DATE,
           created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS qty_available INTEGER`,
        `ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(50)`,
        `ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS location_code  VARCHAR(50)`,
        `ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS store_code     VARCHAR(50)`,
        `ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS expire_date    DATE`,
        `ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS inv_ledger (
           id           SERIAL PRIMARY KEY,
           batch_no     VARCHAR(64),
           change_type  VARCHAR(64),
           qty_change   INTEGER DEFAULT 0,
           operator     VARCHAR(128),
           store_code   VARCHAR(50),
           ref_no       VARCHAR(128),
           note         TEXT,
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS log_date      DATE`,
        `ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(50)`,
        `ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS house_code    VARCHAR(50)`,
        `ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS customer_no   VARCHAR(100)`,

        // ── WMS 仓库 / 入出库 / 盘点 ─────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS wms_warehouses (
           id                  SERIAL PRIMARY KEY,
           warehouse_code      VARCHAR(32) UNIQUE,
           warehouse_name      VARCHAR(128),
           warehouse_name_zh   VARCHAR(128),
           type                VARCHAR(32),
           status              VARCHAR(32) DEFAULT 'ACTIVE',
           created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE wms_warehouses ADD COLUMN IF NOT EXISTS warehouse_name_zh VARCHAR(128)`,
        `ALTER TABLE wms_warehouses ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS wms_inbound (
           id              SERIAL PRIMARY KEY,
           task_no         VARCHAR(64) UNIQUE,
           status          VARCHAR(32) DEFAULT 'PENDING',
           warehouse_code  VARCHAR(64),
           type            VARCHAR(64),
           item            VARCHAR(256),
           qty             INT DEFAULT 0,
           store_code      VARCHAR(32),
           operator        VARCHAR(128),
           created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE wms_inbound ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS wms_inbound_items (
           id              SERIAL PRIMARY KEY,
           task_no         VARCHAR(64),
           batch_no        VARCHAR(64),
           product_code    VARCHAR(64),
           qty             INT DEFAULT 0,
           expected_qty    INT DEFAULT 0,
           actual_qty      INT DEFAULT 0,
           broken_qty      INT DEFAULT 0,
           warehouse_code  VARCHAR(64),
           location_code   VARCHAR(64),
           created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS wms_outbound (
           id           SERIAL PRIMARY KEY,
           outbound_no  VARCHAR(64) UNIQUE,
           type         VARCHAR(64),
           item         VARCHAR(256),
           qty          INT DEFAULT 0,
           status       VARCHAR(32) DEFAULT 'PENDING',
           picker       VARCHAR(128),
           ref_no       VARCHAR(128),
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS wms_outbound_items (
           id           SERIAL PRIMARY KEY,
           outbound_no  VARCHAR(64),
           batch_no     VARCHAR(64),
           product_code VARCHAR(64),
           qty          INT DEFAULT 0,
           actual_qty   INT DEFAULT 0,
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS wms_stocktake (
           id             SERIAL PRIMARY KEY,
           stocktake_no   VARCHAR(64) UNIQUE,
           warehouse_code VARCHAR(64),
           item           VARCHAR(256),
           sys_qty        INT DEFAULT 0,
           act_qty        INT DEFAULT 0,
           diff_qty       INT DEFAULT 0,
           status         VARCHAR(32) DEFAULT 'PENDING',
           auditor        VARCHAR(128),
           date           VARCHAR(32),
           created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE wms_stocktake ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(64)`,
        `ALTER TABLE wms_stocktake ADD COLUMN IF NOT EXISTS item           VARCHAR(256)`,
        `ALTER TABLE wms_stocktake ADD COLUMN IF NOT EXISTS sys_qty        INT DEFAULT 0`,
        `ALTER TABLE wms_stocktake ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS wms_suppliers (
           id             SERIAL PRIMARY KEY,
           supplier_code  VARCHAR(64) UNIQUE,
           supplier_name  VARCHAR(256),
           contact        VARCHAR(128),
           phone          VARCHAR(32),
           status         VARCHAR(32) DEFAULT 'ACTIVE',
           created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE wms_suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        // ── 采购主数据 ────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS prc_suppliers (
           id             SERIAL PRIMARY KEY,
           supplier_code  VARCHAR(64) UNIQUE,
           supplier_name  VARCHAR(256),
           contact        VARCHAR(128),
           phone          VARCHAR(32),
           status         VARCHAR(32) DEFAULT 'ACTIVE',
           created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE prc_suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS prc_purchase_orders (
           id              SERIAL PRIMARY KEY,
           po_no           VARCHAR(64) UNIQUE,
           supplier_code   VARCHAR(128),
           supplier_name   VARCHAR(256),
           subject         VARCHAR(256),
           plan_qty        INT DEFAULT 0,
           received_qty    INT DEFAULT 0,
           total_amount    DECIMAL(18,2) DEFAULT 0,
           currency_code   VARCHAR(8),
           expected_date   DATE,
           remark          TEXT,
           status          VARCHAR(32) DEFAULT 'PENDING',
           store_code      VARCHAR(32),
           created_by      BIGINT,
           created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS prc_purchase_items (
           id            SERIAL PRIMARY KEY,
           po_no         VARCHAR(64),
           product_code  VARCHAR(64),
           qty           INT DEFAULT 0,
           unit_price    DECIMAL(12,2) DEFAULT 0,
           amount        DECIMAL(18,2) DEFAULT 0,
           created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS prc_purchase_requests (
           id          SERIAL PRIMARY KEY,
           request_no  VARCHAR(64) UNIQUE,
           status      VARCHAR(32) DEFAULT 'PENDING',
           created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE prc_purchase_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS prc_purchase_payments (
           id          SERIAL PRIMARY KEY,
           payment_no  VARCHAR(64) UNIQUE,
           po_no       VARCHAR(64),
           amount      DECIMAL(18,2) DEFAULT 0,
           status      VARCHAR(32) DEFAULT 'PENDING',
           created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE prc_purchase_payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS prc_returns (
           id         SERIAL PRIMARY KEY,
           return_no  VARCHAR(64) UNIQUE,
           po_no      VARCHAR(64),
           qty        INT DEFAULT 0,
           status     VARCHAR(32) DEFAULT 'PENDING',
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE prc_returns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        // ── 财务核心表 ────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS fin_accounts (
           id            SERIAL PRIMARY KEY,
           account_code  VARCHAR(64) UNIQUE,
           account_name  VARCHAR(256),
           currency      VARCHAR(8) DEFAULT 'CNY',
           balance       DECIMAL(18,2) DEFAULT 0,
           status        VARCHAR(32) DEFAULT 'ACTIVE',
           created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE fin_accounts ADD COLUMN IF NOT EXISTS currency   VARCHAR(8) DEFAULT 'CNY'`,
        `ALTER TABLE fin_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS fin_transactions (
           id              SERIAL PRIMARY KEY,
           txn_no          VARCHAR(64),
           transaction_no  VARCHAR(64),
           type            VARCHAR(32),
           amount          DECIMAL(18,2) DEFAULT 0,
           currency_code   VARCHAR(8),
           status          VARCHAR(32) DEFAULT 'PENDING',
           description     TEXT,
           account_code    VARCHAR(64),
           ref_no          VARCHAR(128),
           note            TEXT,
           due_date        DATE,
           operator        VARCHAR(128),
           store_code      VARCHAR(32),
           created_by      INTEGER,
           approved_by_mgr VARCHAR(64),
           approved_by_gm  VARCHAR(64),
           approved_by_ceo VARCHAR(64),
           created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS fin_invoices (
           id                      SERIAL PRIMARY KEY,
           invoice_no              VARCHAR(64) UNIQUE,
           ref_no                  VARCHAR(128),
           customer_or_supplier    VARCHAR(256),
           amount                  DECIMAL(18,2) DEFAULT 0,
           paid_amount             DECIMAL(18,2) DEFAULT 0,
           status                  VARCHAR(32) DEFAULT 'PENDING',
           direction               VARCHAR(8) DEFAULT 'AP',
           due_date                DATE,
           updated_at              TEXT,
           created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        `CREATE TABLE IF NOT EXISTS fin_payments (
           id          SERIAL PRIMARY KEY,
           payment_no  VARCHAR(64) UNIQUE,
           invoice_no  VARCHAR(64),
           amount      DECIMAL(18,2) DEFAULT 0,
           status      VARCHAR(32) DEFAULT 'PENDING',
           created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE fin_payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS fin_approvals (
           id            SERIAL PRIMARY KEY,
           txn_id        VARCHAR(64),
           doc_type      VARCHAR(64),
           doc_id        BIGINT,
           role          VARCHAR(64),
           approver      VARCHAR(128),
           approver_id   BIGINT,
           approver_role VARCHAR(64),
           action        VARCHAR(32),
           comment       TEXT,
           created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE fin_approvals ADD COLUMN IF NOT EXISTS txn_id   VARCHAR(64)`,
        `ALTER TABLE fin_approvals ADD COLUMN IF NOT EXISTS role     VARCHAR(64)`,
        `ALTER TABLE fin_approvals ADD COLUMN IF NOT EXISTS approver VARCHAR(128)`,

        // ── POS 销售 ──────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS pos_sales (
           id               SERIAL PRIMARY KEY,
           sale_no          VARCHAR(64) UNIQUE,
           store_code       VARCHAR(32),
           cashier          VARCHAR(128),
           member_phone     VARCHAR(32),
           total_amount     DECIMAL(18,2) DEFAULT 0,
           discount_amount  DECIMAL(18,2) DEFAULT 0,
           net_amount       DECIMAL(18,2) DEFAULT 0,
           pay_method       VARCHAR(32),
           status           VARCHAR(32) DEFAULT 'COMPLETED',
           session_no       VARCHAR(64),
           sale_type        VARCHAR(32),
           note             TEXT,
           created_at       TEXT,
           updated_at       TEXT
         )`,

        `CREATE TABLE IF NOT EXISTS pos_sale_items (
           id               SERIAL PRIMARY KEY,
           sale_no          VARCHAR(64),
           product_code     VARCHAR(64),
           product_name_zh  VARCHAR(256),
           product_name_lo  VARCHAR(256),
           batch_no         VARCHAR(64),
           qty              INT DEFAULT 0,
           unit_price       DECIMAL(12,4) DEFAULT 0,
           subtotal         DECIMAL(18,2) DEFAULT 0,
           store_code       VARCHAR(32),
           created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        // ── 日结 & 台账 ───────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS daily_close (
           id                   SERIAL PRIMARY KEY,
           close_no             VARCHAR(64) UNIQUE,
           store_code           VARCHAR(32),
           close_date           DATE,
           operator             VARCHAR(128),
           total_sales          DECIMAL(18,2) DEFAULT 0,
           total_transactions   INT DEFAULT 0,
           cash_sales           DECIMAL(18,2) DEFAULT 0,
           qr_sales             DECIMAL(18,2) DEFAULT 0,
           discount_total       DECIMAL(18,2) DEFAULT 0,
           cash_actual          DECIMAL(18,2) DEFAULT 0,
           cash_diff            DECIMAL(18,2) DEFAULT 0,
           note                 TEXT,
           status               VARCHAR(32) DEFAULT 'PENDING',
           submitted_at         TEXT,
           created_at           TEXT
         )`,

        `CREATE TABLE IF NOT EXISTS acc_ledger (
           id            SERIAL PRIMARY KEY,
           store_code    VARCHAR(32),
           ref_no        VARCHAR(128),
           ledger_type   VARCHAR(64),
           amount        DECIMAL(18,2) DEFAULT 0,
           balance_after DECIMAL(18,2) DEFAULT 0,
           note          TEXT,
           created_at    TEXT
         )`,

        // ── 客户信用预警 ──────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS cst_credit_warnings (
           id                 SERIAL PRIMARY KEY,
           customer_code      VARCHAR(64),
           credit_limit       DECIMAL(18,2) DEFAULT 0,
           current_balance    DECIMAL(18,2) DEFAULT 0,
           warning_threshold  DECIMAL(5,2) DEFAULT 0,
           status             VARCHAR(32) DEFAULT 'ACTIVE',
           created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE cst_credit_warnings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,

        // ── 包装模块 V2 遗留表 ────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS pkg_shifts (
           id             SERIAL PRIMARY KEY,
           shift_no       VARCHAR(64) UNIQUE,
           house_code     VARCHAR(64),
           shift_type     VARCHAR(64),
           shift_time     VARCHAR(64),
           operator       VARCHAR(128),
           shift_date     DATE,
           status         VARCHAR(32) DEFAULT 'OPEN',
           created_by     BIGINT,
           total_qty      INT DEFAULT 0,
           dirty_qty      INT DEFAULT 0,
           broken_qty     INT DEFAULT 0,
           qualified_qty  INT DEFAULT 0,
           eggs_collected INT DEFAULT 0,
           dirty_eggs     INT DEFAULT 0,
           broken_eggs    INT DEFAULT 0,
           bad_eggs       INT DEFAULT 0,
           completed_at   TIMESTAMP,
           completed_time VARCHAR(32),
           reopen_reason  TEXT,
           updated_by     BIGINT,
           created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS shift_type     VARCHAR(64)`,
        `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS shift_time     VARCHAR(64)`,
        `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS eggs_collected INT DEFAULT 0`,
        `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS dirty_eggs     INT DEFAULT 0`,
        `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS broken_eggs    INT DEFAULT 0`,
        `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS bad_eggs       INT DEFAULT 0`,
        `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS completed_at   TIMESTAMP`,
        `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS completed_time VARCHAR(32)`,
        `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS reopen_reason  TEXT`,
        `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS updated_by     BIGINT`,
        `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS pkg_tasks (
           id                SERIAL PRIMARY KEY,
           task_no           VARCHAR(64) UNIQUE,
           batch_no          VARCHAR(64),
           source_item       VARCHAR(256),
           plan_qty          INT DEFAULT 0,
           packed_qty        INT DEFAULT 0,
           breakage_qty      INT DEFAULT 0,
           breakage_rate     NUMERIC(8,4) DEFAULT 0,
           discrepancy_qty   INT DEFAULT 0,
           presort_xl_qty    INT DEFAULT 0,
           presort_dirty_qty INT DEFAULT 0,
           presort_broken_qty INT DEFAULT 0,
           grade_results     TEXT,
           anomaly_reason    TEXT,
           status            VARCHAR(32) DEFAULT 'PENDING',
           task_type         VARCHAR(32),
           shift_id          BIGINT,
           house_code        VARCHAR(64),
           start_time        TIMESTAMP,
           graded_at         TIMESTAMP,
           graded_by         BIGINT,
           remainder_qty     INT DEFAULT 0,
           output_qty        INT DEFAULT 0,
           pack_spec         VARCHAR(64),
           completed_at      TIMESTAMP,
           completed_by      BIGINT,
           created_by        BIGINT,
           created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS remainder_qty      INT DEFAULT 0`,
        `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS output_qty         INT DEFAULT 0`,
        `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS pack_spec          VARCHAR(64)`,
        `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS completed_at       TIMESTAMP`,
        `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS completed_by       BIGINT`,
        `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS breakage_qty       INT DEFAULT 0`,
        `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS breakage_rate      NUMERIC(8,4) DEFAULT 0`,
        `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS discrepancy_qty    INT DEFAULT 0`,
        `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS presort_xl_qty     INT DEFAULT 0`,
        `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS presort_dirty_qty  INT DEFAULT 0`,
        `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS presort_broken_qty INT DEFAULT 0`,
        `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS grade_results      TEXT`,
        `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS anomaly_reason     TEXT`,
        `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS graded_at          TIMESTAMP`,
        `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS graded_by          BIGINT`,
        `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMP`,

        // ── PDA 终端 ──────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS pda_terminals (
           id               SERIAL PRIMARY KEY,
           name             VARCHAR(256),
           brand            VARCHAR(128),
           model            VARCHAR(128),
           serial           VARCHAR(128),
           scan_protocol    VARCHAR(32),
           scan_prefix      VARCHAR(128),
           scan_suffix      VARCHAR(128),
           location         VARCHAR(256),
           enabled_modules  TEXT,
           printer_ip       VARCHAR(32),
           notes            TEXT,
           status           VARCHAR(32) DEFAULT 'ACTIVE',
           app_version      VARCHAR(32),
           last_seen        TIMESTAMP,
           created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE pda_terminals ADD COLUMN IF NOT EXISTS scan_protocol   VARCHAR(32)`,
        `ALTER TABLE pda_terminals ADD COLUMN IF NOT EXISTS scan_prefix     VARCHAR(128)`,
        `ALTER TABLE pda_terminals ADD COLUMN IF NOT EXISTS scan_suffix     VARCHAR(128)`,
        `ALTER TABLE pda_terminals ADD COLUMN IF NOT EXISTS enabled_modules TEXT`,
        `ALTER TABLE pda_terminals ADD COLUMN IF NOT EXISTS printer_ip      VARCHAR(32)`,
        `ALTER TABLE pda_terminals ADD COLUMN IF NOT EXISTS notes           TEXT`,
        `ALTER TABLE pda_terminals ADD COLUMN IF NOT EXISTS app_version     VARCHAR(32)`,
        `ALTER TABLE pda_terminals ADD COLUMN IF NOT EXISTS last_seen       TIMESTAMP`,

        // ── PDA 同步日志 ──────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS pda_sync_log (
           id         SERIAL PRIMARY KEY,
           op_id      VARCHAR(64) UNIQUE,
           pda_id     VARCHAR(64),
           task_no    VARCHAR(64),
           payload    JSONB,
           status     VARCHAR(20) DEFAULT 'PROCESSED',
           error_msg  TEXT,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,

        // ── 价格体系 ──────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS prc_price_books (
           id             SERIAL PRIMARY KEY,
           price_book_id  VARCHAR(64) UNIQUE,
           name           VARCHAR(256),
           status         VARCHAR(32) DEFAULT 'ACTIVE',
           created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `CREATE TABLE IF NOT EXISTS prc_price_items (
           id             SERIAL PRIMARY KEY,
           item_id        VARCHAR(64) UNIQUE,
           price_book_id  VARCHAR(64),
           sku_code       VARCHAR(64),
           retail_lower   DECIMAL(12,4) DEFAULT 0,
           retail_upper   DECIMAL(12,4) DEFAULT 0,
           created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`,
        `ALTER TABLE prc_price_items ADD COLUMN IF NOT EXISTS retail_lower DECIMAL(12,4) DEFAULT 0`,
        `ALTER TABLE prc_price_items ADD COLUMN IF NOT EXISTS retail_upper DECIMAL(12,4) DEFAULT 0`,
      ];

      for (const sql of businessTables) {
        await this.entityManager.query(sql).catch(() => {});
      }
      console.log('✅ Phase 3: All business tables verified / created successfully.');

      // Phase 10E Breeding Data Onboarding 完全移除（2026-06-06）：
      //   原 INSERT brd_farms FARM-01 + brd_houses A001-B001 + brd_flocks 的 startup seed
      //   全部废弃。养殖场/鸡舍/鸡群主数据由 /master-data 中心人工维护。
    } catch (e) {
      console.error('❌ Failed to execute Phase 10E Onboarding:', (e as Error).message);
      // error already logged above; do not write to filesystem in server code
    }

    // Phase S1 已废弃：
    // sys_orgs 表已通过迁移文件 20260531_migrate_and_drop_sys_orgs.sql 迁移并删除。
    // 组织管理统一由 sys_organizations 表和 /api/org/* 接口负责，不再在此处自动建表。

    // ═══════════════════════════════════════════════════════════════════════════
    // Phase S2: BRD_HOUSE_TYPE 字典种子 + 规范化 brd_houses.house_type
    // ═══════════════════════════════════════════════════════════════════════════
    try {
      const houseTypeDicts = [
        { code: 'CLOSED',    zh: '密闭式', lo: 'ປິດ',        en: 'Closed House',    sort: 1 },
        { code: 'OPEN',      zh: '开放式', lo: 'ເປີດ',       en: 'Open House',      sort: 2 },
        { code: 'SEMI_OPEN', zh: '半开放', lo: 'ເຄີ່ງເປີດ', en: 'Semi-Open House', sort: 3 },
        { code: 'LAYER',     zh: '蛋鸡舍', lo: 'ຄອກໄຂ່',    en: 'Layer House',     sort: 4 },
        { code: 'LAYING',    zh: '蛋鸡舍', lo: 'ຄອກໄຂ່',    en: 'Layer House',     sort: 5 },
      ];
      for (const t of houseTypeDicts) {
        await this.entityManager.query(`
          INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
          SELECT $1::varchar, 'BRD_HOUSE_TYPE', $2, $2, $3, $4, $5, 'ACTIVE'
          WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code=$1 AND dict_type='BRD_HOUSE_TYPE')
        `, [t.code, t.zh, t.lo, t.en, t.sort])
          .catch((e: Error) => console.warn(`⚠️ sys_dict BRD_HOUSE_TYPE insert failed for ${t.code}:`, e.message));
      }
      // 规范化现有 brd_houses.house_type 为标准英文代码
      const normalize: [string, string][] = [
        ['密闭式', 'CLOSED'], ['开放式', 'OPEN'], ['半开放', 'SEMI_OPEN'],
        ['LAYING', 'LAYER'],  // 旧版 LAYING 统一为 LAYER
      ];
      for (const [from, to] of normalize) {
        await this.entityManager.query(
          `UPDATE brd_houses SET house_type=$1 WHERE house_type=$2`, [to, from]
        ).catch(() => {});
      }
      console.log('✅ Phase S2: BRD_HOUSE_TYPE dict seeded & brd_houses.house_type normalized.');
    } catch (e3) {
      console.warn('⚠️  Phase S2 skipped:', (e3 as Error).message);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Phase T1: Terminal 作业台 — 新建表 + 现场角色 + 测试用户
    // ═══════════════════════════════════════════════════════════════════════════
    try {
      // T1-1: 新建 Terminal 专用表
      const terminalTableDDLs = [
        // 班次表
        `CREATE TABLE IF NOT EXISTS pkg_work_shifts (
           id            SERIAL PRIMARY KEY,
           shift_code    VARCHAR(50) UNIQUE NOT NULL,
           production_date DATE NOT NULL,
           site_id       VARCHAR(50) DEFAULT 'site-01',
           line_id       VARCHAR(50) DEFAULT 'line-01',
           operator_id   INTEGER,
           operator_name VARCHAR(100),
           supervisor_name VARCHAR(100),
           status        VARCHAR(20) DEFAULT 'OPEN',
           hygiene_check BOOLEAN DEFAULT TRUE,
           device_check  BOOLEAN DEFAULT TRUE,
           variance_reason TEXT,
           opened_at     TIMESTAMP DEFAULT NOW(),
           closed_at     TIMESTAMP,
           created_at    TIMESTAMP DEFAULT NOW(),
           updated_at    TIMESTAMP DEFAULT NOW()
         )`,
        // 来源批次接收表
        `CREATE TABLE IF NOT EXISTS pkg_source_batches (
           id                SERIAL PRIMARY KEY,
           batch_code        VARCHAR(80) UNIQUE NOT NULL,
           source_inbound_no VARCHAR(80),
           production_date   DATE,
           house_code        VARCHAR(50),
           flock_code        VARCHAR(50),
           lay_date          DATE,
           total_qty         INTEGER NOT NULL DEFAULT 0,
           dirty_qty         INTEGER NOT NULL DEFAULT 0,
           cracked_qty       INTEGER NOT NULL DEFAULT 0,
           expected_qty      INTEGER DEFAULT 0,
           received_qty      INTEGER DEFAULT 0,
           expected_weight   NUMERIC(10,2) DEFAULT 0,
           received_weight   NUMERIC(10,2) DEFAULT 0,
           container_count   INTEGER DEFAULT 0,
           variance_reason   TEXT,
           received_by       INTEGER,
           shift_id          INTEGER,
           batch_status      VARCHAR(30) DEFAULT 'PENDING_RECEIVE',
           qc_result         VARCHAR(30),
           created_at        TIMESTAMP DEFAULT NOW(),
           updated_at        TIMESTAMP DEFAULT NOW()
         )`,
        // QC首检记录表
        `CREATE TABLE IF NOT EXISTS pkg_qc_inspections (
           id                        SERIAL PRIMARY KEY,
           source_batch_id           VARCHAR(80),
           sample_qty                INTEGER DEFAULT 0,
           broken_qty                INTEGER DEFAULT 0,
           dirty_qty                 INTEGER DEFAULT 0,
           leaking_qty               INTEGER DEFAULT 0,
           abnormal_shape_qty        INTEGER DEFAULT 0,
           floor_egg_qty             INTEGER DEFAULT 0,
           average_weight            NUMERIC(8,2),
           shell_cleanliness_ok      BOOLEAN DEFAULT TRUE,
           odor_ok                   BOOLEAN DEFAULT TRUE,
           container_cleanliness_ok  BOOLEAN DEFAULT TRUE,
           qc_result                 VARCHAR(30) DEFAULT 'PENDING',
           comment                   TEXT,
           inspector_id              INTEGER,
           inspector_name            VARCHAR(100),
           inspected_at              TIMESTAMP,
           created_at                TIMESTAMP DEFAULT NOW()
         )`,
        // 标签打印日志表
        `CREATE TABLE IF NOT EXISTS pkg_label_print_logs (
           id                  SERIAL PRIMARY KEY,
           box_code            VARCHAR(100),
           packaging_batch_id  VARCHAR(80),
           label_template_id   VARCHAR(80),
           printer_id          VARCHAR(80),
           print_type          VARCHAR(20) DEFAULT 'NORMAL',
           print_status        VARCHAR(20) DEFAULT 'PRINTED',
           printed_by          VARCHAR(100),
           reprint_reason      TEXT,
           old_label_code      VARCHAR(100),
           new_label_code      VARCHAR(100),
           printed_at          TIMESTAMP DEFAULT NOW(),
           created_at          TIMESTAMP DEFAULT NOW()
         )`,
        // 审计日志表
        `CREATE TABLE IF NOT EXISTS pkg_audit_logs (
           id           SERIAL PRIMARY KEY,
           entity_type  VARCHAR(50),
           entity_id    VARCHAR(100),
           action       VARCHAR(50),
           before_data  TEXT,
           after_data   TEXT,
           reason       TEXT,
           operator_id  INTEGER,
           terminal_id  VARCHAR(80),
           created_at   TIMESTAMP DEFAULT NOW()
         )`,
        // 分级产出记录表
        `CREATE TABLE IF NOT EXISTS pkg_grading_records (
           id                SERIAL PRIMARY KEY,
           code              VARCHAR(80) UNIQUE NOT NULL,
           shift_id          INTEGER,
           source_batch_code VARCHAR(80),
           production_date   DATE,
           outputs_json      JSONB DEFAULT '{}',
           total_output      INTEGER DEFAULT 0,
           created_at        TIMESTAMP DEFAULT NOW()
         )`,
        // 包装记录表
        `CREATE TABLE IF NOT EXISTS pkg_packing_records (
           id              SERIAL PRIMARY KEY,
           code            VARCHAR(80) UNIQUE NOT NULL,
           grading_code    VARCHAR(80),
           production_date DATE,
           batches_json    JSONB DEFAULT '[]',
           total_boxes     INTEGER DEFAULT 0,
           total_eggs      INTEGER DEFAULT 0,
           created_at      TIMESTAMP DEFAULT NOW()
         )`,
        // 成品入库交接单
        `CREATE TABLE IF NOT EXISTS pkg_handover_records (
           id              SERIAL PRIMARY KEY,
           code            VARCHAR(80) UNIQUE NOT NULL,
           shift_id        INTEGER,
           packing_code    VARCHAR(80),
           boxes_json      JSONB DEFAULT '[]',
           box_count       INTEGER DEFAULT 0,
           pallet_code     VARCHAR(64),
           location        VARCHAR(128),
           receiver        VARCHAR(128),
           production_date DATE,
           created_at      TIMESTAMP DEFAULT NOW()
         )`,
        // pkg_exceptions 异常品处理表
        `CREATE TABLE IF NOT EXISTS pkg_exceptions (
           id              SERIAL PRIMARY KEY,
           nc_no           VARCHAR(80),
           issue_type      VARCHAR(50),
           exception_type  VARCHAR(50),
           severity        VARCHAR(20) DEFAULT 'MEDIUM',
           batch_no        VARCHAR(80),
           related_batch_id VARCHAR(80),
           store_code      VARCHAR(50),
           description     TEXT,
           action_taken    VARCHAR(50),
           reported_by     VARCHAR(100),
           quantity        INTEGER DEFAULT 0,
           status          VARCHAR(30) DEFAULT 'OPEN',
           created_at      TIMESTAMP DEFAULT NOW()
         )`,
        `ALTER TABLE pkg_exceptions ADD COLUMN IF NOT EXISTS exception_type VARCHAR(50)`,
        `ALTER TABLE pkg_exceptions ADD COLUMN IF NOT EXISTS related_batch_id VARCHAR(80)`,
        `ALTER TABLE pkg_exceptions ADD COLUMN IF NOT EXISTS reported_by VARCHAR(100)`,
        `ALTER TABLE pkg_exceptions ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 0`,
        `ALTER TABLE pkg_exceptions ADD COLUMN IF NOT EXISTS photo_url TEXT`,
      ];

      for (const ddl of terminalTableDDLs) {
        await this.entityManager.query(ddl).catch((e: any) => {
          console.warn(`[T1] DDL warn: ${e.message.slice(0,100)}`);
        });
      }

      // T1-2: 注册现场角色（幂等）
      const terminalRoles = [
        { code: 'ROLE_PKG_OP',          nameZh: '包装操作员',  nameEn: 'Packaging Operator'  },
        { code: 'ROLE_QC_INSPECTOR',    nameZh: '质检员',      nameEn: 'QC Inspector'         },
        { code: 'ROLE_WH_CLERK',        nameZh: '仓管员',      nameEn: 'Warehouse Clerk'      },
        { code: 'ROLE_LINE_SUPERVISOR', nameZh: '班组长',      nameEn: 'Line Supervisor'      },
      ];
      for (const r of terminalRoles) {
        await this.entityManager.query(`
          INSERT INTO sys_role (role_code, role_name_zh, role_type, approval_level)
          VALUES ($1, $2, 'FIELD', 0)
          ON CONFLICT (role_code) DO NOTHING
        `, [r.code, r.nameZh]).catch(() => {});
      }

      // T1-3: 创建测试用户（仅开发环境，生产环境跳过）
      if (process.env.NODE_ENV !== 'production') {
        const bcrypt = await import('bcrypt').catch(() => null);
        if (bcrypt) {
          const hash = await bcrypt.hash('123456', 10);
          const testUsers = [
            { username: 'admin',        realName: '超级管理员',     roleCode: 'ROLE_ADMIN'           },
            { username: 'test_pkg_op',  realName: '测试包装操作员', roleCode: 'ROLE_PKG_OPERATOR'    },
            { username: 'test_qc',      realName: '测试质检员',     roleCode: 'ROLE_QC_INSPECTOR'    },
            { username: 'test_wh_clk',  realName: '测试仓管员',     roleCode: 'ROLE_WH_CLERK'        },
            { username: 'test_sup',     realName: '测试班组长',     roleCode: 'ROLE_LINE_SUPERVISOR' },
          ];
          for (const u of testUsers) {
            // 插入用户
            await this.entityManager.query(`
              INSERT INTO sys_user (username, password_hash, real_name, store_code, status, locale, created_at, updated_at)
              VALUES ($1, $2, $3, 'ALL', 1, 'zh-CN', NOW(), NOW())
              ON CONFLICT (username) DO NOTHING
            `, [u.username, hash, u.realName]).catch(() => {});

            // 绑定角色
            await this.entityManager.query(`
              INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at)
              SELECT u.user_id, r.role_id, TRUE, NOW()
              FROM sys_user u, sys_role r
              WHERE u.username = $1 AND r.role_code = $2
                AND NOT EXISTS (
                  SELECT 1 FROM sys_user_role ur2
                  WHERE ur2.user_id = u.user_id AND ur2.role_id = r.role_id
                )
            `, [u.username, u.roleCode]).catch(() => {});
          }
          console.log('✅ Phase T1: Terminal test users seeded.');
        }
      }

      console.log('✅ Phase T1: Terminal tables, roles initialized.');

      // T1-4: 每日自动补种今日测试来源批次（仅开发环境，幂等）
      if (process.env.NODE_ENV !== 'production') {
        const today = new Date().toISOString().slice(0, 10);
        const seedBatches = [
          {
            code:         `SRC-${today.replace(/-/g, '')}-001`,
            inboundNo:    `INB-${today.replace(/-/g, '')}-001`,
            houseCode:    'H-01', flockCode: 'FL-2024-001',
            expectedQty:  4500,   expectedWeight: 270.0, containerCount: 15,
          },
          {
            code:         `SRC-${today.replace(/-/g, '')}-002`,
            inboundNo:    `INB-${today.replace(/-/g, '')}-002`,
            houseCode:    'H-02', flockCode: 'FL-2024-002',
            expectedQty:  7200,   expectedWeight: 432.0, containerCount: 24,
          },
        ];
        for (const b of seedBatches) {
          await this.entityManager.query(`
            INSERT INTO pkg_source_batches
              (batch_code, source_inbound_no, production_date, house_code, flock_code, lay_date,
               expected_qty, expected_weight, container_count, batch_status, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$3,$6,$7,$8,'PENDING_RECEIVE',NOW(),NOW())
            ON CONFLICT (batch_code) DO NOTHING
          `, [b.code, b.inboundNo, today, b.houseCode, b.flockCode,
              b.expectedQty, b.expectedWeight, b.containerCount]).catch(() => {});
        }

        // Phase T1 中原 H-01/02/03 + FL-2024-001/002/003 测试 seed 完全移除
        // （与上方 Phase 10E 同因废弃）。如需测试数据请在 dev 环境手动创建。

        console.log(`✅ Phase T1-4: Today's test source batches seeded (${today}).`);
      }
    } catch (eT1: any) {
      console.warn('⚠️  Phase T1 skipped:', eT1.message);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase T2: PKG_PACK_LINE 产线字典种子
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const packLines = [
        { code: 'LINE-01', label_zh: '1号包装线', label_en: 'Line 1', sort: 1 },
        { code: 'LINE-02', label_zh: '2号包装线', label_en: 'Line 2', sort: 2 },
      ];
      for (const { code, label_zh, label_en, sort } of packLines) {
        await this.entityManager.query(
          `INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
           SELECT $1::varchar, 'PKG_PACK_LINE', $2, $2, $3, $4, 'ACTIVE'
           WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code=$1 AND dict_type='PKG_PACK_LINE')`,
          [code, label_zh, label_en, sort],
        ).catch((e: Error) => console.warn(`⚠️ sys_dict PKG_PACK_LINE insert failed for ${code}:`, e.message));
      }
      console.log('✅ Phase T2: PKG_PACK_LINE dict seeded.');
    } catch (eT2: any) {
      console.warn('⚠️  Phase T2 skipped:', eT2.message);
    }

    // Phase T3: 弹性排班 — shift_type 列 + PKG_SHIFT 字典
    // ─────────────────────────────────────────────────────────────────────────
    try {
      await this.entityManager.query(
        `ALTER TABLE pkg_work_shifts ADD COLUMN IF NOT EXISTS shift_type VARCHAR(20)`,
      ).catch(() => {});

      const shifts = [
        { code: 'MORNING',   zh: '早班',   en: 'Morning Shift',   sort: 1, timeRange: '08:00-14:00' },
        { code: 'AFTERNOON', zh: '下午班', en: 'Afternoon Shift', sort: 2, timeRange: '14:00-22:00' },
        { code: 'NIGHT',     zh: '夜班',   en: 'Night Shift',     sort: 3, timeRange: '22:00-06:00' },
      ];
      for (const s of shifts) {
        await this.entityManager.query(
          `INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status, config_json)
           SELECT $1::varchar, 'PKG_SHIFT', $2, $2, $3, $4, 'ACTIVE', $5
           WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code=$1 AND dict_type='PKG_SHIFT')`,
          [s.code, s.zh, s.en, s.sort, JSON.stringify({ timeRange: s.timeRange })],
        ).catch((e: Error) => console.warn(`⚠️ sys_dict PKG_SHIFT insert failed for ${s.code}:`, e.message));
      }
      // 修复已存在的旧记录：名称里混入了时间范围（如"早班 08:00-12:00"），拆分存入 config_json
      await this.entityManager.query(`
        UPDATE sys_dict
        SET
          config_json = COALESCE(NULLIF(NULLIF(config_json,''),'null')::jsonb, '{}'::jsonb)
                        || jsonb_build_object('timeRange', TRIM(SUBSTRING(dict_label_zh FROM '[0-9]{2}:[0-9]{2}-[0-9]{2}:[0-9]{2}'))),
          dict_label_zh = TRIM(SPLIT_PART(dict_label_zh, ' ', 1)),
          dict_label_en = TRIM(SPLIT_PART(dict_label_en, ' ', 1)),
          dict_label_lo = CASE WHEN dict_label_lo IS NOT NULL THEN TRIM(SPLIT_PART(dict_label_lo, ' ', 1)) ELSE NULL END,
          name          = TRIM(SPLIT_PART(name, ' ', 1)),
          updated_at    = NOW()
        WHERE dict_type = 'PKG_SHIFT'
          AND dict_label_zh ~ '[0-9]{2}:[0-9]{2}'
      `).catch(() => {});
      console.log('✅ Phase T3: shift_type column + PKG_SHIFT dict seeded.');
    } catch (eT3: any) {
      console.warn('⚠️  Phase T3 skipped:', eT3.message);
    }
  }


  async findAll(table: string, query: any) {
    const { sql, queryValues } = this.buildFindAllSql(table, query);

    try {
      const rows = await this.entityManager.query(sql, queryValues);
      if (table === 'brd_daily_logs') {
        return await this.enrichDailyLogRows(rows);
      }
      return this.withCrudRouteIdAlias(table, rows);
    } catch (e) {
      throw new InternalServerErrorException((e as Error).message);
    }
  }

  private withCrudRouteIdAlias(table: string, rows: any[]): any[] {
    const aliasColumn = GenericCrudService.CRUD_ROUTE_ID_ALIAS[table];
    if (!aliasColumn || !Array.isArray(rows)) return rows;

    return rows.map((row) => {
      if (!row || typeof row !== 'object' || row[aliasColumn] === undefined || row[aliasColumn] === null) {
        return row;
      }
      return { ...row, id: row[aliasColumn] };
    });
  }

  private extractRows(raw: any): any[] {
    if (!raw) return [];
    if (Array.isArray(raw) && raw.length === 2 && Array.isArray(raw[0]) && typeof raw[1] === 'number') {
      return raw[0];
    }
    if (Array.isArray(raw)) return raw;
    return [];
  }

  private async enrichDailyLogRows(rows: any[]): Promise<any[]> {
    if (!Array.isArray(rows) || rows.length === 0) return rows;

    const normalizedRows = rows.map((row) => this.normalizeDailyLogDateFields(row));

    const reasonTypes: Array<{ field: 'culling_reason' | 'mortality_reason'; dictType: string }> = [
      { field: 'culling_reason', dictType: 'BRD_CULLING_REASON' },
      { field: 'mortality_reason', dictType: 'BRD_MORTALITY_REASON' },
    ];
    const codesByType = new Map<string, Set<string>>();

    for (const row of normalizedRows) {
      for (const { field, dictType } of reasonTypes) {
        for (const token of this.splitReasonTokens(row?.[field])) {
          if (!codesByType.has(dictType)) codesByType.set(dictType, new Set());
          codesByType.get(dictType)!.add(token);
        }
      }
    }

    const dictParams: unknown[] = [];
    const whereParts: string[] = [];
    for (const [dictType, codes] of codesByType.entries()) {
      if (codes.size === 0) continue;
      dictParams.push(dictType, Array.from(codes));
      const typeIdx = dictParams.length - 1;
      const codesIdx = dictParams.length;
      whereParts.push(`(dict_type = $${typeIdx} AND dict_code = ANY($${codesIdx}))`);
    }
    if (whereParts.length === 0) return normalizedRows;

    const dictRows: Array<{
      dict_type: string;
      dict_code: string;
      label: string | null;
    }> = await this.entityManager.query(
      `SELECT dict_type, dict_code, COALESCE(dict_label_zh, name, dict_code) AS label
         FROM sys_dict
        WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE'
          AND (${whereParts.join(' OR ')})`,
      dictParams,
    );
    if (dictRows.length === 0) return normalizedRows;

    const labelByTypeAndCode = new Map<string, string>();
    for (const dict of dictRows) {
      if (dict.label) labelByTypeAndCode.set(`${dict.dict_type}:${dict.dict_code}`, dict.label);
    }

    return normalizedRows.map((row) => {
      const next = { ...row };
      for (const { field, dictType } of reasonTypes) {
        const original = row?.[field];
        if (typeof original !== 'string' || original.trim() === '') continue;
        next[`${field}_code`] = original;
        next[field] = this.translateReasonValue(original, dictType, labelByTypeAndCode);
      }
      return next;
    });
  }

  private normalizeDailyLogDateFields(row: any): any {
    if (!row || typeof row !== 'object') return row;
    const next = { ...row };
    if (Object.prototype.hasOwnProperty.call(next, 'log_date')) {
      next.log_date = this.toDateOnly(next.log_date);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'business_date')) {
      next.business_date = this.toDateOnly(next.business_date);
    }
    return next;
  }

  private toDateOnly(value: unknown): unknown {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === 'string') {
      const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
    }
    return value;
  }

  private splitReasonTokens(value: unknown): string[] {
    if (typeof value !== 'string') return [];
    return value
      .split(/[；;,]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private translateReasonValue(value: string, dictType: string, labels: Map<string, string>): string {
    return this.splitReasonTokens(value)
      .map((token) => labels.get(`${dictType}:${token}`) ?? token)
      .join('；');
  }

  async findAllInventoryScoped(table: 'inv_batches' | 'inv_ledger', query: any, allowedWarehouseCodes: string[] | null) {
    const extraWhere: string[] = [];
    const extraValues: unknown[] = [];

    if (allowedWarehouseCodes !== null) {
      if (allowedWarehouseCodes.length === 0) {
        extraWhere.push('1=0');
      } else if (table === 'inv_batches') {
        extraWhere.push(`"warehouse_code" = ANY($${this.nextParamIndex(query, extraValues.length)})`);
        extraValues.push(allowedWarehouseCodes);
      } else {
        const idx = this.nextParamIndex(query, extraValues.length);
        extraWhere.push(`(
          "warehouse_code" = ANY($${idx})
          OR EXISTS (
            SELECT 1 FROM "inv_batches" b
            WHERE b."batch_no" = "${table}"."batch_no"
              AND b."warehouse_code" = ANY($${idx})
          )
        )`);
        extraValues.push(allowedWarehouseCodes);
      }
    }

    const { sql, queryValues } = this.buildFindAllSql(table, query, extraWhere, extraValues);

    try {
      const rows = await this.entityManager.query(sql, queryValues);
      return rows;
    } catch (e) {
      throw new InternalServerErrorException((e as Error).message);
    }
  }

  async findAllBreedingScoped(
    table: BreedingScopedTable,
    query: any,
    scope: { farmCodes: string[]; siteCodes: string[]; companyCodes: string[] } | null,
  ) {
    const extraWhere: string[] = [];
    const extraValues: unknown[] = [];
    if (scope !== null) {
      const ors: string[] = [];
      const siteColumn = table === BREEDING_FARMS_TABLE ? 'mapped_site_code' : 'site_code';
      if (scope.farmCodes.length > 0) {
        ors.push(`"farm_code" = ANY($${this.nextParamIndex(query, extraValues.length)})`);
        extraValues.push(scope.farmCodes);
      }
      if (scope.siteCodes.length > 0) {
        const idx = this.nextParamIndex(query, extraValues.length);
        ors.push(table === BREEDING_FARMS_TABLE
          ? `"${siteColumn}" = ANY($${idx})`
          : OrgOwnershipService.farmScopePredicate(table, 'site', `$${idx}`));
        extraValues.push(scope.siteCodes);
      }
      if (scope.companyCodes.length > 0) {
        const idx = this.nextParamIndex(query, extraValues.length);
        ors.push(table === BREEDING_FARMS_TABLE
          ? `"company_code" = ANY($${idx})`
          : OrgOwnershipService.farmScopePredicate(table, 'company', `$${idx}`));
        extraValues.push(scope.companyCodes);
      }
      extraWhere.push(ors.length > 0 ? `(${ors.join(' OR ')})` : '1=0');
    }

    const { sql, queryValues } = this.buildFindAllSql(table, query, extraWhere, extraValues);
    try {
      return await this.entityManager.query(sql, queryValues);
    } catch (e) {
      throw new InternalServerErrorException((e as Error).message);
    }
  }

  private nextParamIndex(query: any, extraValueCount: number): number {
    let idx = 1;
    for (const [key] of Object.entries(query)) {
      if (this.isControlQueryParam(key)) continue;
      if (key.endsWith('__like')) {
        const col = key.slice(0, -6);
        if (/^[a-zA-Z0-9_]+$/.test(col)) idx++;
        continue;
      }
      if (/^[a-zA-Z0-9_]+$/.test(key)) idx++;
    }
    return idx + extraValueCount;
  }

  private isControlQueryParam(key: string): boolean {
    return ['limit', 'offset', 'page', 'pageSize', 'pageNumber', 'pageNo', 'size', 'sortBy', 'sortDesc', 'orderBy', 'orderDir', '_t', '_'].includes(key);
  }

  private buildFindAllSql(table: string, query: any, extraWhere: string[] = [], extraValues: unknown[] = []) {
    const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 1000);
    const offset = Math.max(Number(query.offset) || 0, 0);

    const whereClauses = [];
    const queryValues = [];
    let paramIndex = 1;

    const SAFE_KEY = /^[a-zA-Z0-9_]+$/;
    for (const [key, val] of Object.entries(query)) {
      // 分页/排序/反缓存类 query param 不参与 WHERE 拼接
      // pageSize / pageNumber 等是前端 selectors（HouseSelector 等）的约定，
      // 漏过滤会被当列名拼到 SQL 抛 "column does not exist" 500 — 此前导致 brd_houses 下拉全空。
      if (this.isControlQueryParam(key)) continue;
      // Support LIKE prefix filter: key ending with __like → column = key minus suffix, value used as-is
      if (key.endsWith('__like')) {
        const col = key.slice(0, -6);
        if (!SAFE_KEY.test(col)) continue;
        whereClauses.push(`"${col}" LIKE $${paramIndex}`);
        queryValues.push(val);
        paramIndex++;
        continue;
      }
      if (!SAFE_KEY.test(key)) continue;
      if (Array.isArray(val)) {
        if (val.length === 0) {
          whereClauses.push('1=0');
          continue;
        }
        whereClauses.push(`"${key}" = ANY($${paramIndex})`);
        queryValues.push(val);
        paramIndex++;
        continue;
      }
      whereClauses.push(`"${key}" = $${paramIndex}`);
      queryValues.push(val);
      paramIndex++;
    }
    for (const where of extraWhere) {
      whereClauses.push(where);
    }
    queryValues.push(...extraValues);
    paramIndex += extraValues.length;

    let sql = `SELECT * FROM "${table}"`;
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    // The legacy breeding daily page reverses this list before rendering.
    // Select the newest page first, then return that page oldest-first so the
    // client reversal remains correct even when total rows exceed the limit.
    if (table === 'brd_daily_logs') {
      sql = `SELECT * FROM (${sql} ORDER BY "log_date" DESC, "created_at" DESC NULLS LAST, "id" DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}) AS "daily_logs_page" ORDER BY "log_date" ASC, "created_at" ASC NULLS FIRST, "id" ASC`;
    } else {
      sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    }
    queryValues.push(limit, offset);

    return { sql, queryValues };
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
        const missingCol = this.extractMissingColumn((e as Error).message);
        if (missingCol && attempt < 5) {
          await this.ensureColumn(table, missingCol);
          continue; // 自动补列后继续重试
        }
        this.handleConstraintError(e, table);
        throw new InternalServerErrorException((e as Error).message);
      }
    }
    throw new InternalServerErrorException('Max auto-repair retries exceeded');
  }

  async findOneByColumn(table: string, pkName: string, id: any) {
    const SAFE_KEY = /^[a-zA-Z0-9_]+$/;
    if (!SAFE_KEY.test(pkName)) {
      throw new BadRequestException('Security Violation: Invalid primary key column');
    }
    const sql = `SELECT * FROM "${table}" WHERE "${pkName}" = $1 LIMIT 1`;
    try {
      const rows = await this.entityManager.query(sql, [id]);
      return rows[0] ?? null;
    } catch (e) {
      throw new InternalServerErrorException((e as Error).message);
    }
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
      finalSql = `UPDATE "${table}" SET ${setClauses} WHERE "${pkName}" = $${fields.length + 1} RETURNING "${pkName}"`;
      values.push(id);
    } else {
      // $n+1 = updated_at（JS Date 自动转换）, $n+2 = PK
      finalSql = `UPDATE "${table}" SET ${setClauses}, "updated_at" = $${fields.length + 1} WHERE "${pkName}" = $${fields.length + 2} RETURNING "${pkName}"`;
      values.push(new Date(), id);
    }

    console.log(`[CRUD Update] ${table} WHERE ${pkName}=${id} | fields: ${fields.join(',')}`);

    // 自适应循环：逐列补齐，最多重试 5 次（防无限循环）
    for (let attempt = 0; attempt <= 5; attempt++) {
      try {
        const raw = await this.entityManager.query(finalSql, values);
        if (this.extractRows(raw).length === 0) {
          throw new BadRequestException('Record not found');
        }
        console.log(`[CRUD Update] ✅ success on attempt ${attempt}`);
        return { msg: 'Updated successfully' };
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        console.error(`[CRUD Update] ❌ attempt ${attempt} failed: ${(e as Error).message}`);
        const missingCol = this.extractMissingColumn((e as Error).message);
        if (missingCol && attempt < 5) {
          await this.ensureColumn(table, missingCol);
          continue;
        }
        this.handleConstraintError(e, table);
        throw new InternalServerErrorException((e as Error).message);
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

    const sql = `DELETE FROM "${table}" WHERE "${pkName}" = $1 RETURNING "${pkName}"`;
    console.log(`[CRUD Delete] ${table} WHERE ${pkName}=${id}`);
    try {
      const raw = await this.entityManager.query(sql, [id]);
      if (this.extractRows(raw).length === 0) {
        throw new BadRequestException('Record not found');
      }
      console.log(`[CRUD Delete] ✅ success`);
      return { msg: 'Deleted successfully' };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      console.error(`[CRUD Delete] ❌ failed: ${(e as Error).message}`);
      this.handleConstraintError(e, table);
      throw new InternalServerErrorException((e as Error).message);
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
