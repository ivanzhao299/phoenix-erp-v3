# G22-1 · Schema 治理 SOP（防 G15/G20 类 mig 翻车）

> **立账日**：2026-06-08
> **欠债 ID**：F3（prod schema 与 mig 一致性无自动审计）

## 痛点

历史 mig 翻车清单：

| 阶段 | 事故 | 根因 |
|---|---|---|
| G15 | mig fail：`UPDATE inv_ledger SET warehouse_code=...` 列不存在 | 凭印象写列名，CI 测试库与生产 schema 不一致 |
| G20-2 | mig fail：`INSERT INTO sys_menu (...menu_name_en, status...)` 列不存在 | 假设 sys_menu 有 status / menu_name_en，实际只有 menu_name_zh/lo + domain |
| G21-4 | 本地 mig fail：`CREATE INDEX brd_medication_records(site_code)` 列不存在 | 本地有旧版表（缺 site_code），mig 写法不够幂等 |

共性：**未先看真 schema 就写 mig**。

## 治理工具

### 1. `scripts/dump-schema.sh` — Schema 快照

```bash
./scripts/dump-schema.sh           # dump 本地 phoenix_erp
./scripts/dump-schema.sh prod      # SSH 远端 prod DB
```

输出 → `docs/schema-snapshot.sql`（17K+ 行，含 228 表 + 332 索引）

### 2. SOP — 写 mig 前必做

```bash
# Step 1: 刷 schema snapshot
./scripts/dump-schema.sh

# Step 2: grep 目标表列
grep -A5 "CREATE TABLE.*${TABLE}" docs/schema-snapshot.sql

# Step 3: 写 mig 时只引用 snapshot 中存在的列
```

### 3. mig 防御性写法

- 每个新列都 `ALTER TABLE foo ADD COLUMN IF NOT EXISTS bar`
- UPDATE/DELETE 前用 `information_schema.columns` 守卫
- 禁止：直接 `INSERT INTO X (col_that_may_not_exist) VALUES (...)`

### 4. CI 集成（pending）

将来在 `deploy.yml` 加 step：mig 跑完后 dump new-schema diff baseline。

## 已知 schema 摘要

228 张表，关键：brd_* 7 / wms_* 13 / inv_* 5 / sys_* 15+ / fin_* 12

详见 `docs/schema-snapshot.sql`（17023 行）。

## 更新策略

- 每次 mig 推送绿灯后：本地跑 `./scripts/dump-schema.sh prod` 更新 snapshot 并 commit
- G23+ 计划：CI 自动每周 dump + diff 提 PR
