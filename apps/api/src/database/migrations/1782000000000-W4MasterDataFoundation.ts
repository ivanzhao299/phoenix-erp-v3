import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 新建 sys_organization_type_rules 配置表 + 初始 9 条治理规则 seed
 *                  (没有 seed 则 service 接入时校验集为空,无法工作)。
 *                  全部走 ON CONFLICT (org_type) DO NOTHING 幂等;down() 一并 DROP TABLE。
 *
 * W4 — 主数据基础设施最小可放行集
 * ════════════════════════════════════════════════════════════════════════
 * 覆盖:
 *   - sys_organization_type_rules 配置表(每种 org_type 的命名前缀、必填列、上下级类型)
 *   - 9 条 seed(GROUP / BU / COMPANY / SITE / DEPARTMENT / PROJECT / WAREHOUSE / STORE / FACTORY)
 *   - biz_site_aliases 表存在性校验(不新增 seed 行,避免业务方未拍板时扩散)
 *
 * 不覆盖(W4 红线):
 *   - 不动 sys_user_scopes(user 拍板 #4)
 *   - 不动 shr_projects / inv_batches / mst_stores schema
 *   - 不动 master-data-runtime.service.ts 的 TYPES 字典(避免新建 CRUD 端点)
 *
 * 设计:
 *   docs/MASTER_DATA_W4_EXECUTION_PLAN.md §2(表设计、9 条 seed)
 *   docs/MASTER_DATA_PHASE2_DESIGN.md §5.2(母规划 W4 范围)
 *   docs/MASTER_DATA_PHASE2_REVIEW.md §4(Audit 评审"可入 W4"清单)
 *
 * 服务接入时机:
 *   W4: 仅建表 + seed,不动 org.service
 *   W5+: org.service create/update 软警告
 *   W6+: 升级硬校验
 */
export class W4MasterDataFoundation1782000000000 implements MigrationInterface {
  name = 'W4MasterDataFoundation1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. sys_organization_type_rules 配置表 ──────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sys_organization_type_rules (
        org_type              VARCHAR(32)  PRIMARY KEY,
        label_zh              VARCHAR(64)  NOT NULL,
        code_prefix_regex     VARCHAR(128) NOT NULL,
        required_fields       TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
        allowed_parent_types  TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
        allowed_child_types   TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
        notes                 TEXT,
        status                VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
        created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      COMMENT ON TABLE sys_organization_type_rules IS
        'W4 — sys_organizations.org_type 不变量配置表。每行声明一种 org_type 的命名前缀、必填列、上下级允许类型。service 校验在 W5+ 接入。'
    `);

    // ── 2. 9 条初始 seed ───────────────────────────────────────────────────
    const rules: Array<[string, string, string, string[], string[], string[], string]> = [
      ['GROUP',      '集团',
        '^GROUP-',
        ['org_name'],
        [],
        ['COMPANY', 'BU'],
        '集团顶层节点'],
      ['BU',         '业务单元',
        '^BU-',
        ['org_name', 'company_code'],
        ['GROUP'],
        [],
        '横切式;canonical 表 = biz_business_units(org 树占位)'],
      ['COMPANY',    '法人主体',
        '^COMP-',
        ['org_name', 'company_code', 'manager_user_id'],
        ['GROUP'],
        ['SITE', 'DEPARTMENT'],
        'canonical 行;org_code = company_code'],
      ['SITE',       '业务站点',
        '^SITE-',
        ['org_name', 'company_code', 'site_business_type'],
        ['COMPANY'],
        ['DEPARTMENT'],
        'site_business_type ∈ {FARM, BROILER, HATCHERY, FACTORY, WAREHOUSE, STORE, OFFICE}'],
      ['DEPARTMENT', '部门',
        '^DEPT-',
        ['org_name', 'company_code'],
        ['COMPANY', 'SITE'],
        [],
        '用于 HR / 流程发起人 / 审批节点'],
      ['PROJECT',    '项目(org 树占位)',
        '^PRJ_',
        ['org_name', 'company_code'],
        ['COMPANY'],
        [],
        'canonical 走 biz_projects;org 树仅作占位'],
      ['WAREHOUSE',  '仓库(树内占位)',
        '^(WH_|SITE-)',
        ['org_name', 'company_code'],
        ['COMPANY', 'SITE'],
        [],
        'canonical 走 wms_warehouses;树内占位(user 拍板 #1:仓库 ≠ site)'],
      ['STORE',      '门店(视为 SITE 子类)',
        '^SITE-',
        ['org_name', 'company_code'],
        ['COMPANY'],
        [],
        'user 拍板 #2:门店即 SITE-*-STORE,mst_stores 是兼容台账'],
      ['FACTORY',    '工厂(视为 SITE 子类)',
        '^SITE-',
        ['org_name', 'company_code'],
        ['COMPANY'],
        [],
        '与 STORE 同思路,SITE-*-FACTORY'],
    ];

    for (const [orgType, labelZh, prefixRegex, required, parents, children, notes] of rules) {
      await queryRunner.query(
        `INSERT INTO sys_organization_type_rules
           (org_type, label_zh, code_prefix_regex, required_fields, allowed_parent_types, allowed_child_types, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (org_type) DO NOTHING`,
        [orgType, labelZh, prefixRegex, required, parents, children, notes],
      );
    }

    // ── 3. biz_site_aliases 表存在性校验(不新增 seed) ──────────────────────
    const aliasTbl = await queryRunner.query(`
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'biz_site_aliases'
       LIMIT 1
    `);
    if (!aliasTbl || aliasTbl.length === 0) {
      // 新环境上 biz_site_aliases 缺失 → log warn,不 throw
      // (mdm1_02 顶级裸 SQL 需另外手工 apply;W4 不强行兜底,避免双源)
      // eslint-disable-next-line no-console
      console.warn(
        '[W4MasterDataFoundation] biz_site_aliases 表未在 DB 中找到。' +
        '若为新环境,请先手工执行 migrations/mdm1_02_biz_site_aliases.sql 后再起 API。',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sys_organization_type_rules`);
  }
}
