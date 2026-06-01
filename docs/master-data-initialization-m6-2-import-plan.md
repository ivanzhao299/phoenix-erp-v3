# Phoenix ERP V3 — Master Data Initialization M6-2 Import Plan

> 2026-06-01 · 生产正式导入计划 · **本阶段只生成脚本与计划，不执行导入**
> 正式导入须等用户明确确认「执行 M6-2 正式导入」后，由用户在服务器运行导入脚本。

---

## 1. M6-1 通过结论

| 项 | 值 |
|----|----|
| M6-1 Readiness Gate | ✅ **APPROVED_WITH_WARNINGS** |
| 提交 | `8e3238e` |
| 第二轮生产 Dry Run | 0 报错、90-check 16/16 PASS、ROLLBACK 后基线完全恢复 |
| schema drift | 已闭环（ROLE_CASH 补种子、mst_stores 改 address），幂等在包内 |

## 2. 正式导入脚本路径

`scripts/m6-import-on-server.sh` — **真 COMMIT 版**

与 `m6-dryrun-on-server.sh` 的区别：

| | Dry Run 脚本 | 正式导入脚本 |
|--|--------------|--------------|
| 事务 | 外层 BEGIN…**ROLLBACK** | 各脚本自带 **BEGIN/COMMIT**，真实落库 |
| 是否写库 | 否（零写入） | **是（COMMIT）** |
| 剥内层 COMMIT | 是 | **否**（按原样执行） |
| 确认门 | 无 | 必须 `--yes-commit-to-production` |
| 调用 dry-run | — | **绝不调用** |

**执行命令（服务器，/opt/phoenix-erp）：**
```bash
git pull --ff-only origin main
bash scripts/m6-import-on-server.sh --yes-commit-to-production
```

## 3. 执行顺序

按 README 推荐顺序（99 先行）：
```
99-reconcile-zhuzhaoan.sql   # 数据订正（zhuzhao_an→zhuzhaoan、BU-TRADING商贸、伏强→符强）
01-organizations.sql
02-users.sql
03-user-roles.sql            # 含 ROLE_CASH 补种子
04-user-orgs.sql
05-drivers.sql
06-stores.sql                # 用 address 列（生产无 region）
07-customers.sql
08-suppliers.sql             # → prc2_suppliers
09-vehicles.sql
90-check-init-data.sql       # 自动执行，FAIL 即告警退出
```
> 说明：任务列出的 `99-reconcile.sql` 实际文件名为 `99-reconcile-zhuzhaoan.sql`；脚本已按实际文件名调用。

## 4. 预估增量（M6-1 生产 Dry Run 确认）

| 对象 | 预估新增 |
|------|:--------:|
| ROLE_CASH（sys_role） | +1 |
| 组织 | +0（生产已有全树） |
| 用户 | +0（10 名矩阵用户已存在） |
| 用户角色绑定 | +11 |
| 用户组织绑定 | +11 |
| 司机 | +5 |
| 门店 | +8 |
| 客户 | +35 |
| 供应商 | +25 |
| 车辆 | +0 |

脚本会在导入后自动打印「实际 vs 预估」对照表，不一致项标 ⚠。
> 注：预估基于 M6-1 基线（orgs73/user39/role46/orgs14/drivers1/stores0/cust30/sup0）。脚本全程幂等（ON CONFLICT DO NOTHING），若基线已变化，实际新增可能不同但不会重复/覆盖。

## 5. 风险提示（承接 M6-1 §11）

- 🟢 **A 可直接导入**：组织/用户（已存在跳过）、ROLE_CASH、角色/组织绑定、司机5、门店8、供应商25。
- 🟡 **B 非阻断（导入后补）**：客户缺联系人/电话、老挝文名、疑似重复、散户/物流/中铁路是否建客户、供应商缺联系人、店长/车辆待补、司机阿坚待核。
- 🔴 **C 必须修复**：无。⛔ **D 禁止导入**：无。

## 6. 导入后校验方式

1. 脚本**自动执行** `90-check-init-data.sql`，16 项须全 PASS；出现 `FAIL` 即 `::ABORT::` 退出并提示人工排查。
2. 增量对照表：实际新增须与 §4 预估一致（角色+1/绑定+11+11/司机+5/门店+8/客户+35/供应商+25）。
3. 数据订正确认：zhuzhaoan 存在、zhuzhao_an 无残留、fuqiang=符强、BU-TRADING=商贸。
4. 日志留痕：`logs/m6-import-YYYYMMDD-HHMMSS.log`。

## 7. 回滚原则

- 各脚本**幂等且仅新增**（ON CONFLICT DO NOTHING / WHERE NOT EXISTS），不覆盖人工维护数据。
- 若中途某脚本失败：`ON_ERROR_STOP=1 + set -e` 立即停止，**已 COMMIT 的前序脚本保留**（均幂等，修复后可从失败处重跑整脚本，前序自动跳过）。
- 如需撤销本批次：按 `customer_no(CUS-*)/supplier_code(SUP-*)/driver_code(DRV-VTE-*)/store_code(STORE-*)` + 本批角色/组织绑定**精确删除**；**禁止整表 TRUNCATE/DELETE**。
- 99-reconcile 的改名（zhuzhao_an→zhuzhaoan）为 UPDATE，回滚需谨慎（保留 user_id），一般无需回滚。
- 重大异常优先**联系负责人**，不要在生产盲目 DELETE。

## 8. 是否需要人工确认后执行

**是。** 本阶段仅交付脚本与计划，**不执行任何生产 COMMIT**。正式导入须满足：
1. 用户明确指令「执行 M6-2 正式导入」；
2. 由用户在服务器运行 `bash scripts/m6-import-on-server.sh --yes-commit-to-production`（脚本内置确认参数 + 6 道安全门）；
3. 导入后核对 90-check 全 PASS + 增量对照一致。

> 建议导入前最好先在低峰期、并对生产库做一次快照/备份（DBA 视情况）。

---

## 安全门（脚本内置，任一不过即中止，未写库）

1. 必须显式参数 `--yes-commit-to-production`；
2. golden-phoenix 目录存在；
3. 90-check 脚本存在（禁止跳过校验）；
4. 当前 HEAD ⊇ M6-1 通过提交 `8e3238e`；
5. db 服务在运行（生产环境标记）；
6. `POSTGRES_DB` 非空（禁止空 DB 连接）+ `SELECT 1` 连通；
否则 `::ABORT::` 退出。

## 验证（本阶段，未写生产库）

| 项 | 结果 |
|----|------|
| `bash -n scripts/m6-import-on-server.sh` | ✅ 语法通过 |
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| scope-audit.sh | ⚠️ 环境夹具缺失（非本阶段回归，纯脚本/文档新增） |
