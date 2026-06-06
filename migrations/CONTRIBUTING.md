# Migrations 贡献规约

本文档记录写 Phoenix ERP V3 数据库 migration 时**必须遵守的硬性约定**，避免历史重复踩过的坑。

## 0. 项目有 2 个 migrations 目录

| 目录 | 何时跑 | 谁建 | 用途 |
|---|---|---|---|
| **`apps/api/migrations/2026*.sql`** | **每次 CI 都跑**（test 阶段 + deploy 阶段）| 主要由 dev 写 | 自动化部署 — 改 schema / 加业务字段 / 改 RBAC |
| **`migrations/`**（仓库根）| 不跑 — **手动用 `psql -f` 才生效** | 历史 / 业务方一次性数据修复 | 不入自动化的临时 SQL（GLP-1A-2 主数据初始化等）|

**判断写哪个**：
- 改 schema、API 依赖、希望 CI 测试库也建好 → **`apps/api/migrations/`**
- 一次性数据修复、占位脚本、业务方提供清单后人工跑 → **`migrations/`**（根）

如果两个目录都放，**两份必须完全相同**（之前 GLP-1A-2 有不一致导致 CI 失败）。

---

## 1. CI 测试库 schema 限制（最重要）

CI 测试库的 schema **只包含**：
- `apps/api/ddl/*.sql`（基础 RBAC + 系统表）
- `apps/api/migrations/v3_schema_complete.sql`（34 核心表）
- `apps/api/migrations/2026*.sql`（按文件名字典序跑）

**CI 测试库不含**的常见业务表：
- `brd_farms` / `brd_houses` / `brd_flocks` / `brd_daily_logs` — 养殖业务
- `mst_stores` / `mst_products`（部分字段） — 主数据老表
- `sys_store`（V2 老组织表）
- `inv_batches` / `wms_inbound_items` 等老 WMS 表
- 任何**没在** `v3_schema_complete.sql` 中声明的表

针对上述表写 `ALTER TABLE` / `DELETE FROM` / `UPDATE` **必须用表存在性兜底**，否则 CI 红灯。

---

## 2. 强制模板：表存在性兜底

### 2.1 改 schema（ADD COLUMN / INDEX）

```sql
BEGIN;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='brd_farms') THEN
    RAISE NOTICE '[migration_name] brd_farms 不存在（CI 测试环境），跳过';
    RETURN;
  END IF;

  -- 所有 SQL 必须用 EXECUTE 字符串，避免 PL/pgSQL 静态语法依赖列存在性
  EXECUTE 'ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS mapped_site_code VARCHAR(64)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brd_farms_mapped_site ON brd_farms (mapped_site_code)';
END $body$;

COMMIT;
```

### 2.2 删数据 / 改数据

```sql
BEGIN;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='brd_farms') THEN
    RAISE NOTICE '[cleanup_xxx] brd_farms 不存在（CI），跳过';
    RETURN;
  END IF;

  EXECUTE $$DELETE FROM brd_flocks WHERE farm_code = 'FARM-01'$$;
  EXECUTE $$DELETE FROM brd_farms  WHERE farm_code = 'FARM-01'$$;
END $body$;

COMMIT;
```

### 2.3 引用其它表（JOIN / 子查询）

如果你的 UPDATE 引用了另一张可能不存在的表（如通过 `biz_site_aliases` 反查 `site_code`），用嵌套 IF EXISTS：

```sql
DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_name='brd_daily_logs') THEN RETURN; END IF;

  -- 主表存在；再判断引用的辅助表
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_name='biz_site_aliases') THEN
    EXECUTE $$UPDATE brd_daily_logs d
                 SET site_code = a.site_code
                FROM biz_site_aliases a
               WHERE a.alias_type='FARM_CODE' AND a.alias_code = d.farm_code$$;
  END IF;
END $body$;
```

---

## 3. 幂等性硬要求

**所有 migration 必须能重复执行**（CI 多次跑、运维多次重启都不能出错）：

| 操作 | 幂等写法 |
|---|---|
| 建表 | `CREATE TABLE IF NOT EXISTS` |
| 加列 | `ALTER TABLE x ADD COLUMN IF NOT EXISTS y type` |
| 加索引 | `CREATE INDEX IF NOT EXISTS idx_x ON x (y)` |
| 加约束（无 IF NOT EXISTS）| `DO $$ BEGIN IF NOT EXISTS (SELECT FROM ...) THEN ALTER TABLE ... END IF; END $$;` |
| INSERT seed | `INSERT ... SELECT ... WHERE NOT EXISTS (SELECT FROM x WHERE pk=...)` 或 `ON CONFLICT DO NOTHING` |
| UPDATE | 加 `WHERE 当前值 != 目标值` 避免幻读 |
| DELETE | 用 `WHERE` 精确指定，跑空表不报错 |
| 触发器 | `DROP TRIGGER IF EXISTS x ON y; CREATE TRIGGER x ...` |

**特别警告 `ON CONFLICT DO UPDATE`**：
- 会覆盖业务方在 /master-data 中心人工编辑的字段（参考 Phase 10E onboarding 灾难）
- **不要**在 `onModuleInit()` 或 startup seed 里用
- 真要用，必须在子句里限定 `WHERE x.updated_at IS NULL`（仅初次写入）

---

## 4. 命名规范

文件名 `apps/api/migrations/YYYYMMDD_<phase>_<topic>.sql`：

| 前缀 | 含义 |
|---|---|
| `20260601_g4e_*` | G 阶段（核心治理）|
| `20260605_mdm1_*` | MDM-1（统一主数据）|
| `20260605_glp1a2_*` | GLP-1A-2（孟赛初始化）|
| `20260606_rbac_*` | RBAC 修复 |
| `20260606_cleanup_*` | 历史数据清理 |
| `20260606_notify_*` | 通知中心 |

**禁止**：`fix_xxx.sql` / `temp.sql` / `1.sql` / 中文文件名。

---

## 5. 历史踩坑记录（不要再犯）

| 日期 | 错误 | 根因 | 修法 |
|---|---|---|---|
| 2026-06-05 | mdm1_03 raise format() 占位符 `%` | PL/pgSQL `format()` 在 `PERFORM` 上下文不支持 `%` 简写 | 用 `RAISE NOTICE '...%...', var` 直接传变量 |
| 2026-06-05 | mdm1_05 / songmingguang_realign 用 farm_name | 本地与生产 schema 不一致：本地 brd_flocks 无 farm_name 列 | 删除该列引用，按最小列写入 |
| 2026-06-05 | user.sql `INSERT 0 0` 跳过密码 | NOT EXISTS 守卫只查 username，老 user 留旧 hash | 用 UPDATE 显式重置 password_hash + perms_version+1 |
| 2026-06-05 | CI 跑 mdm1_03/04/05 缺 brd_farms | CI 测试库 schema 不含养殖业务表 | DO `$body$` IF EXISTS 包装 |
| 2026-06-05 | 用 ROLE_FARM_MGR 误绑成宋明光主角色 | 角色复用错配 | 立专属角色 `ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR` |
| 2026-06-05 | sys_user_farm_scopes 表不存在但 entity 有 | G4-E entity 建了但 DDL 没建表 | 单独建 `20260605_g4e_user_farm_scopes_table.sql` 补 |
| 2026-06-05 | api/web Sidebar 显示菜单但点击 403 | inventory.controller / inbound.controller / outbound.controller 用了未注册 menu_code (`MENU_INVENTORY` / `MENU_WMS_INBOUND` / `MENU_WMS_OUTBOUND`) | 改 controller 对齐 sidebar，统一用真实存在的 `MENU_WMS_VIEW` / `MENU_WMS_INOUT` |
| 2026-06-05 | 全栈 audit 发现 13 个孤儿 menu_code | 28 个 controller 引用未在 sys_menu 表的 code | 一次性 `INSERT INTO sys_menu` 13 行 + 按业务角色派权 |
| 2026-06-06 | brd_farms/houses 删后又自动出现 | `generic-crud.service.ts onModuleInit()` 有 Phase 10E startup seed 用 `ON CONFLICT DO UPDATE` 强制覆盖 | 删除 startup seed 代码段，主数据由 /master-data 中心维护 |
| 2026-06-06 | cleanup_phase10e / cleanup_redundant_farms CI 红 | 直接 DELETE FROM brd_*，CI 测试库无此表 | 同上 DO $body$ IF EXISTS 兜底 |

---

## 6. PR Checklist（提交前自查）

- [ ] 文件名遵守 `YYYYMMDD_<phase>_<topic>.sql` 命名
- [ ] 放对目录（自动化 → `apps/api/migrations/`；一次性 → 根 `migrations/`）
- [ ] 所有 DDL 加 `IF NOT EXISTS` / `IF EXISTS`
- [ ] 引用历史业务表（brd_*/mst_stores 等）有 `DO $body$` 兜底
- [ ] INSERT seed 有 `ON CONFLICT DO NOTHING` 或 `WHERE NOT EXISTS`
- [ ] **没有** `ON CONFLICT DO UPDATE`（除非确认是受控字段更新）
- [ ] 测试：本地跑一遍 + 测试库二次跑无副作用
- [ ] commit message 在 `feat/fix/db/data/ci` 命名规范内

---

## 7. 紧急回滚

每个 migration 应在文件末尾**注释里**写回滚 SQL：

```sql
-- ─── 回滚 ───────────────────────────────────────────
--   ALTER TABLE brd_farms DROP COLUMN IF EXISTS mapped_site_code;
--   UPDATE sys_user SET perms_version = perms_version - 1 WHERE username='xxx';
```

生产 incident 时直接 `ssh erp + psql` 跑。

---

## 8. 谁来 review

- **schema 改动**：API tech lead
- **业务数据修复**：模块 owner（finance/wms/farm/...）
- **RBAC 改动**：必须 review 现有 sys_role / sys_menu / role_menu_permission 三表交叉影响
- **`migrations/`（根目录）一次性脚本**：作者自己负责，但 commit 时附简短说明

---

**有问题？** 看 `docs/mdm-1-implementation-report.md` + `docs/glp1a2-production-extension.md` 找类似先例。
