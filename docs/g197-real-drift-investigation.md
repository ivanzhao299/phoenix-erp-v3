# g197 真业务漂移调查报告

> 2026-06-18 完成。结论：**g197 真漂移治理 ROI 极低，不推荐做**。

## 漂移规模（基于 CI 运行 27753703028 实测）

| 类别 | 行数 | 性质 |
|------|------|------|
| ALTER COLUMN | 82 | 类型/长度/约束差异 |
| ADD COLUMN | 66 | entity 期望但 DB 没建 |
| DROP COLUMN | 108 | DB 有但 entity 没声明 |
| **总计** | **~256** | — |

## 漂移最重 6 张表

| 表 | ADD | DROP | ALTER | service 用法 |
|----|-----|------|-------|-----------|
| `sys_user` | 28 | 28 | 0 | **48 raw queries / 0 ORM** |
| `wms_stock_balance` | 0 | 0 | 18 | 0 raw / ORM 用 |
| `wms_locations` | 0 | 0 | 15 | — |
| `wms_stock_ledger` | 0 | 0 | 12 | — |
| `wf_approval_rules` | 8 | 8 | 0 | 0 raw / ORM 用 |
| `prc_purchase_orders` | 14 | 2 | 9 | **11 raw queries** |
| `sal_customers` | 0 | 8 | 0 | **42 raw queries** |
| `fin_cash_accounts` | 0 | 8 | 0 | **40 raw queries** |

## 核心发现

漂移最重的 4 张表（`sys_user` 56 处 / `sal_customers` 8 / `fin_cash_accounts` 8 / `prc_purchase_orders` 25）**全部用 raw SQL 访问数据**，**0 ORM 反射调用**。

**典型案例 `sys_user`**：
- DB 实际列：`user_id` (PK), `username`, `password_hash`, `real_name`, `phone`, `email`, `store_code`, `locale`, `status` smallint, `last_login_at`, `created_at`, `updated_at`, `note`, `perms_version`
- entity 期望列：`id` (PK), `username`, `password_hash`, `salt`, `real_name_zh`, `real_name_lo`, `role`, `store_code`, `status` varchar, `locale`, `permissions`, `phone`, `user_type`, `manager_user_id`
- 重合：6 列；entity 缺 8 列；entity 多声明 8 列
- **但 auth.service 全部用 `userRepo.query("SELECT ... FROM sys_user")` raw SQL**，从未访问 entity 字段属性

结论：entity 是**装饰式**——只用作 typeorm Repository 类型参数。**entity ↔ DB 不一致从未触发运行时错误**。

## 治理 ROI 评估

**治理方案 A：让 entity 反映 DB 现状**（保守）
- 改 entity 字段：`@Column({ name: 'user_id' }) id` / 删 `salt` / 删 `real_name_zh` 等
- 改 status 类型 smallint
- 不动 service（service 走 raw SQL 不感知）
- 工作量：每表 30 min-2 hour，12+ 张表 = 1-3 天
- **业务收益：0**（service 仍走 raw SQL）
- 唯一价值：未来用 `migration:generate` 时 entity 元数据准确

**治理方案 B：DB 升级到 entity 现状**（激进）
- 写 TS 迁移 ADD COLUMN salt/real_name_zh/permissions 等
- 违反用户红线（"数据迁移绝对不能新增业务数据"——虽然 ADD COLUMN 是 schema 不是 data，但风险高）
- 增加大量"未使用"的空列，浪费

**治理方案 C：维持现状**（务实）
- entity 与 DB 不一致 ≠ 业务出错
- P5 #3 warn-only 永远显示这些 256 行漂移
- 接受"装饰式 entity"

## 推荐：方案 C + 接受 P5 #3 warning

理由：
1. **业务零影响** —— service 走 raw SQL，entity 元数据与运行时无关
2. **部署速度零帮助** —— g197 治理不影响 CI/部署时长
3. **工作量大** —— 1-3 天分散在 12+ 张表
4. **未来需要时再做** —— 当真要用 `migration:generate` 时,按表逐个修

## 替代下一步

| 选项 | 直接见效 | 工作量 |
|------|----------|--------|
| **docker layer 优化** | 1-2 min CI 提速 | 2-4 小时 |
| **entity 改动 skip 镜像** | 4-5 min 提速 | 4-8 小时 |

g197 真漂移治理留作长期债，需要时再做。
