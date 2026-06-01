# Phoenix ERP V3 — Master Data Initialization M6-1 Readiness Gate

> 2026-06-01 · 正式导入前最终确认门 · **第二轮生产库 Dry Run（事务内 BEGIN…ROLLBACK，零写入）**
> 通过本门后方可进入 **M6-2 Production COMMIT Import**。

---

## 最终结论

# ✅ APPROVED_WITH_WARNINGS

**可以进入 M6-2 正式 COMMIT 导入。** 第二轮生产 Dry Run 全流程 0 报错、90-check 16/16 全 PASS、ROLLBACK 后生产库完全复原、两处 schema drift 已纳入可重复执行的初始化包。存在若干**非阻断**的数据完整性 warning（客户数据不全/疑似重复、供应商缺联系人、店长/车辆待补），可在导入后补充，不阻断导入。

---

## 1. 执行环境

| 项 | 值 |
|----|----|
| 生产主机 | `iZt4nj11ry11ofv03yi35vZ`（47.236.122.224，阿里云新加坡） |
| 仓库路径 | `/opt/phoenix-erp` |
| DB 容器 | `phoenix-v3-db`（postgres:16-alpine，127.0.0.1:5432） |
| 连接方式 | `docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'` |
| 执行者 | **用户在服务器手工执行**（agent 无生产 SSH，按协作约定） |
| Dry Run 脚本 | `scripts/m6-dryrun-on-server.sh`（外层 BEGIN…ROLLBACK，剥各脚本内层 BEGIN/COMMIT，ON_ERROR_STOP=1，无 `\|\| true`） |

## 2. 生产 HEAD

`f85b2eb` — `fix(golden-phoenix): align package with production schema (M6-0 dry-run findings)`

## 3. 初始化包路径

`apps/api/scripts/init-data/golden-phoenix/`（**不在部署迁移 glob**，需人工受控执行）

## 4. Schema Drift 修复确认（§2 闭环）

两轮 Dry Run 之间发现并修复 2 处生产 schema drift，均已纳入版本库、幂等、随初始化包执行：

| Drift | 现象（M6-0 首轮） | 修复 | 位置 | 幂等 | 随包执行 | 生产实测（M6-1 次轮） |
|-------|------------------|------|------|:----:|:--------:|----------------------|
| 缺 ROLE_CASH | 角色绑定时静默跳过出纳 | `INSERT…ON CONFLICT DO NOTHING` 补种子 | `03-user-roles.sql` L20 | ✅ | ✅ | `INSERT 0 1`（补建成功） |
| mst_stores 无 region 列 | `06-stores` 报错中止 | 改用 `address` 列（生产/本地共有） | `06-stores.sql` L16 | ✅ | ✅ | `INSERT 0 8`（无报错） |

> 均在 `apps/api/scripts/init-data/golden-phoenix/`（commit `f85b2eb`），**不需单独 migration**：初始化包本身即可重复执行的载体，已提交版本库，后续重复部署不会丢失。不改生产 schema（mst_stores 用 address 绕过，不强加列）。

## 5. Dry Run 执行顺序

`99-reconcile → 01-organizations → 02-users → 03-user-roles → 04-user-orgs → 05-drivers → 06-stores → 07-customers → 08-suppliers → 09-vehicles → 90-check`，全部包在单个 `BEGIN … ROLLBACK` 内。

## 6. 每个 SQL 执行结果（次轮，0 报错）

| 脚本 | 结果 | 说明 |
|------|------|------|
| 99-reconcile | UPDATE 3 | zhuzhao_an→zhuzhaoan 改名、BU-TRADING→凤凰商贸事业群、伏强→符强 |
| 01-organizations | INSERT 0 0 ×5 | 组织全树生产已存在（73 节点含本包 64） |
| 02-users | INSERT 0 0 | 10 名矩阵用户生产已存在 |
| 03-user-roles | INSERT 0 1（ROLE_CASH）+ INSERT 0 11 + UPDATE 24 | 补出纳角色 + 11 绑定 + 主角色归一 |
| 04-user-orgs | INSERT 0 11 + UPDATE 18 | 组织绑定 + 主组织归一；违规授权 **0 行** |
| 05-drivers | INSERT 0 5 | 阿坚等 5 司机 |
| 06-stores | INSERT 0 8 | 8 直营店（address 列） |
| 07-customers | INSERT 0 35 | 35 客户；重名 **0 行** |
| 08-suppliers | INSERT 0 25 | 25 供应商；重名 **0 行** |
| 09-vehicles | — | 无数据 |
| 缺失角色清单 | 仅 `ROLE_GROUP_FINANCE` | 故意映射 ROLE_HQ_FINANCE，正常 |

## 7. 90-check 结果：16 / 16 全 PASS ✅

| # | 检查 | 实际 | # | 检查 | 实际 |
|---|------|:----:|---|------|:----:|
| 1 | 组织总数 | 73 PASS | 9 | GROUP误授权司机/收银员 | 0 PASS |
| 2 | 公司数 | 3 PASS | 10 | 司机 DRV-VTE | 5 PASS |
| 3 | 场区数 | 7 PASS | 11 | 门店 STORE | 8 PASS |
| 4 | 矩阵用户 | 10 PASS | 12 | 客户总数(事务内) | 65 PASS |
| 5 | 角色绑定 | 24 PASS | 13 | 供应商 SUP | 25 PASS |
| 6 | 组织绑定 | 18 PASS | 14 | 重复客户名 | 0 PASS |
| 7 | 无角色用户 | 0 PASS | 15 | 重复供应商名 | 0 PASS |
| 8 | 无组织用户 | 0 PASS | 16 | 主组织唯一 | 0违规 PASS |

> 16 项对应任务要求的：组织完整✅、用户可插入✅、角色可绑定✅、组织可绑定✅、司机无 ALL✅、门店编码唯一✅、客户编码唯一✅、供应商编码唯一✅、不写旧表✅、无无角色用户✅、无无组织用户✅、无 GROUP 误授权✅、无 CHECK 违规✅、无 schema drift✅、无重复 key 报错✅、ROLLBACK 恢复✅。

## 8. ROLLBACK 验证

末尾打印 `ROLLBACK` + `✅ Dry Run 执行完毕（事务已 ROLLBACK）`。第 2 步（导入前）与第 5 步（导入后）行数**逐表完全一致**，证明生产库**零写入**。

## 9. 基线数量对照（Dry Run 前 / 事务内 / ROLLBACK 后）

| 表 | Dry Run 前 | 事务内（预计） | ROLLBACK 后 | 恢复 |
|----|:---------:|:-------------:|:----------:|:----:|
| sys_organizations | 73 | 73 (+0) | 73 | ✅ |
| sys_user | 39 | 39 (+0) | 39 | ✅ |
| sys_user_role | 46 | 57 (+11) | 46 | ✅ |
| sys_user_orgs | 14 | 25 (+11) | 14 | ✅ |
| sal_drivers | 1 | 6 (+5) | 1 | ✅ |
| mst_stores | 0 | 8 (+8) | 0 | ✅ |
| sal_customers | 30 | 65 (+35) | 30 | ✅ |
| prc2_suppliers | 0 | 25 (+25) | 0 | ✅ |
| sal_vehicles | 0 | 0 (+0) | 0 | ✅ |
| sys_role(ROLE_CASH) | 缺 | +1 | 缺(已回滚) | ✅ |

## 10. M6-2 正式导入增量预估

| 对象 | 已存在跳过 | **将新增** | 待确认 | DATA_INCOMPLETE |
|------|:--------:|:--------:|:------:|:---------------:|
| 角色(ROLE_CASH) | 0 | **+1** | 0 | 0 |
| 组织 | 64 | **+0** | 0 | 0 |
| 用户 | 10 | **+0** | 0 | 0 |
| 用户角色绑定 | — | **+11** | 0 | 0 |
| 用户组织绑定 | — | **+11** | 0 | 0 |
| 司机 | 0 | **+5** | 1(阿坚) | 2(阿通/阿给无电话) |
| 门店 | 0 | **+8** | 8(店长未定) | 0 |
| 客户 | 0 | **+35** | ~8(老挝文/疑重复/散户/物流/中铁路) | 多数(缺联系人电话) |
| 供应商 | 0 | **+25** | ~3(疑同一主体/关联方) | 25(全缺联系人) |
| 车辆 | 0 | **+0** | — | 全部(待补录) |

> 另有 3 处既有数据订正（99-reconcile）：zhuzhao_an→zhuzhaoan、BU-TRADING 商贸、伏强→符强。

## 11. 正式导入风险清单

### 🟢 A — 可直接导入
组织/用户（已存在，幂等跳过）、ROLE_CASH、角色绑定×11、组织绑定×11、司机×5、门店×8、供应商×25、99-reconcile 订正。编码全唯一、无重名、无越权、不写旧表。

### 🟡 B — 可导入但需后续补充（非阻断）
| 项 | 说明 |
|----|------|
| 客户联系人/电话 | 多数缺失（remark=DATA_INCOMPLETE） |
| 客户老挝文名/区域 | 多条待补中文译名与区域 |
| 客户疑似重复 | 猛昏小青/猛昏客户小青、那摩福丽/副丽那摩等（90-check 重名=0，字符串不同；remark 已标，后续人工去重） |
| 客户特殊项 | 散户(汇总)、物流公司(疑承运方)、中铁路(企业)、东鹏(同名)——是否建为正式客户待确认 |
| 供应商联系人 | 25 家全缺联系人/电话；个人简称(高远/海总等)待补全称 |
| 供应商关联方 | 老挝东鹏县星驰农业(疑内部主体)待确认是否外部供应商 |
| 门店店长 | 8 店店长未定，暂不开店长账号 |
| 司机阿坚 | 名单未列，保留待核 |
| 车辆 | 全部待现场补录 |

### 🔴 C — 导入前必须修复
**无。** 两处 schema drift 已修复并经生产 Dry Run 验证。

### ⛔ D — 禁止导入
**无。**

## 12. 待人工确认项

| # | 事项 | 现状/建议 |
|---|------|----------|
| 1 | 客户 demo 30 vs 正式 35 | 编码前缀不同（demo 非 CUS-*），`customer_no` 唯一约束 + ON CONFLICT 兜底，**无冲突**；请确认 demo 30 是否保留或后续清理 |
| 2 | 客户疑似重复 | 可接受（90-check 重名=0），导入后人工去重 |
| 3 | 供应商疑似同一主体 | 勐泰察姜海/老挝勐泰寮(姜海)、刘涛/刘总——导入后人工合并 |
| 4 | 刘善军组织 | ✅ 已定 SITE-DONGPENG-LAYER（东鹏仓储） |
| 5 | 朱召安组织 | ✅ 已定 ORG-GROUP（集团出纳，合理） |
| 6 | 王玮华组织 | ✅ 已定 GROUP（集团财务中心）；如需绑三公司账务，后续追加 |
| 7 | 店长/收银员账号 | ✅ 暂不开（包内仅 10 系统用户） |

## 13. 是否允许进入 M6-2 正式 COMMIT 导入

# ✅ **APPROVED_WITH_WARNINGS**

- ✅ 第二轮 Dry Run **0 报错**
- ✅ 90-check **16/16 全 PASS**
- ✅ ROLLBACK 后基线**完全恢复**（生产零写入）
- ✅ schema drift 已纳入**可重复执行**的初始化包（幂等、已提交 f85b2eb）
- ⚠️ Warnings 均为**非阻断**数据完整性项（§11-B），导入后补充即可

**允许进入 M6-2 Production COMMIT Import。** 建议 M6-2 执行方式：与 Dry Run 同序、同样 `psql -v ON_ERROR_STOP=1` 逐脚本执行（各脚本自带 BEGIN/COMMIT，正式导入时**不剥 COMMIT**、不加外层 ROLLBACK），导入后立即跑 `90-check-init-data.sql` 复核，并比对增量是否与本预估一致（角色+1/绑定+11+11/司机+5/门店+8/客户+35/供应商+25）。

---

## 验收对照

| 验收标准 | 达成 |
|----------|:----:|
| 第二轮 Dry Run 0 报错 | ✅ |
| 90-check 全部 PASS | ✅ 16/16 |
| ROLLBACK 后基线完全恢复 | ✅ 第2步=第5步 |
| schema drift 已纳入可重复执行方案 | ✅ 包内幂等，已提交 |
| 明确给出是否允许 M6-2 的结论 | ✅ APPROVED_WITH_WARNINGS |
