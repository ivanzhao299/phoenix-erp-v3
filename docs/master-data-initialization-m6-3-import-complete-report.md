# Phoenix ERP V3 — Master Data Initialization M6-3 Import Complete Report

> 2026-06-01 · 生产正式导入**已完成**（真 COMMIT 落库）
> 结果：✅ **IMPORT COMPLETE — 增量全部一致、数据订正生效、90-check 16/16 PASS**

---

## 0. 结论

# ✅ M6-2 PRODUCTION IMPORT COMPLETE

金凤凰控股集团 Pilot Run 主数据已**真实导入生产库**：组织/用户(已存在)、ROLE_CASH、角色绑定×11、组织绑定×11、司机×5、门店×8、客户×35、供应商×25 全部落库；3 处既有数据订正生效；导入后 90-check 16/16 全 PASS。**实际增量与 M6-1 Dry Run 预估逐表完全一致。**

## 1. 执行环境

| 项 | 值 |
|----|----|
| 生产主机 | `iZt4nj11ry11ofv03yi35vZ`（47.236.122.224） |
| 目标库 | `phoenix_erp`（docker compose db / phoenix-v3-db） |
| 执行者 | `root`（用户在服务器手工执行，agent 无生产 SSH） |
| 执行命令 | `bash scripts/m6-import-on-server.sh --yes-commit-to-production` |
| 生产 HEAD | `516515e` |
| 执行时间 | 2026-06-01 17:13:07 → 17:13:10 CST（约 3 秒） |
| 日志 | `logs/m6-import-20260601-171307.log` |

## 2. 导入增量对照（实际 vs M6-1 预估）— 全部一致 ✅

| 对象 | 导入前 | 导入后 | 实际新增 | M6-1 预估 | 一致 |
|------|:-----:|:-----:|:-------:|:--------:|:----:|
| sys_role（ROLE_CASH） | 36 | 37 | **+1** | +1 | ✅ |
| sys_organizations | 73 | 73 | +0 | +0 | ✅ |
| sys_user | 39 | 39 | +0 | +0 | ✅ |
| sys_user_role | 46 | 57 | **+11** | +11 | ✅ |
| sys_user_orgs | 14 | 25 | **+11** | +11 | ✅ |
| sal_drivers | 1 | 6 | **+5** | +5 | ✅ |
| mst_stores | 0 | 8 | **+8** | +8 | ✅ |
| sal_customers | 30 | 65 | **+35** | +35 | ✅ |
| prc2_suppliers | 0 | 25 | **+25** | +25 | ✅ |
| sal_vehicles | 1 | 1 | +0 | +0 | ✅ |

> 客户由 30(demo) → 65（+35 真实客户，编码 CUS-* 与 demo 无冲突）。供应商 0 → 25（prc2_suppliers，未碰旧 prc_suppliers）。

## 3. 数据订正确认（99-reconcile）

| 订正 | 结果 |
|------|:----:|
| 朱召安 `zhuzhaoan` 已存在 | ✅ true |
| 旧名 `zhuzhao_an` 残留 | ✅ false（无残留） |
| `fuqiang` 已为「符强」 | ✅ true |
| `BU-TRADING` 已为「凤凰商贸事业群」 | ✅ true |

> 改名保留 user_id 与全部绑定（zhuzhao_an→zhuzhaoan），零数据丢失。

## 4. 逐脚本执行结果（真 COMMIT，0 报错）

| 脚本 | 结果 |
|------|------|
| 99-reconcile | UPDATE 3 + COMMIT（改名/商贸/符强） |
| 01-organizations | INSERT 0×5 + COMMIT（已存在） |
| 02-users | INSERT 0 + COMMIT（已存在） |
| 03-user-roles | INSERT 1(ROLE_CASH)+11 + UPDATE 24 + COMMIT |
| 04-user-orgs | INSERT 11 + UPDATE 18 + COMMIT；违规授权 0 行 |
| 05-drivers | INSERT 5 + COMMIT |
| 06-stores | INSERT 8 + COMMIT |
| 07-customers | INSERT 35 + COMMIT；重名 0 |
| 08-suppliers | INSERT 25 + COMMIT；重名 0 |
| 09-vehicles | COMMIT（无数据） |
| 缺失角色 | 仅 ROLE_GROUP_FINANCE（故意映射 HQ_FINANCE，正常） |

## 5. 导入后 90-check：16 / 16 全 PASS ✅

组织73 / 公司3 / 场区7 / 矩阵用户10 / 角色绑定24 / 组织绑定18 / 无角色用户0 / 无组织用户0 / GROUP误授权0 / 司机5 / 门店8 / 客户65 / 供应商25 / 重复客户名0 / 重复供应商名0 / 主组织唯一0违规 —— **全 PASS**。不写旧表（prc_suppliers/ord_customers/b2b_customers/fin_transactions/log_dispatch）。

## 6. 导入后待补充项（非阻断，承接 M6-1 §11-B）

主数据已落库可用，以下为**导入后业务跟进**事项（不影响系统运行）：

| 类别 | 待补充 |
|------|--------|
| 客户 | 联系人/电话（多数 DATA_INCOMPLETE）、老挝文名中文译名/区域、疑似重复去重（猛昏小青/猛昏客户小青等）、散户·物流公司·中铁路·东鹏是否建为正式客户 |
| 供应商 | 25 家联系人/电话、个人简称(高远/海总等)补全称、老挝东鹏县星驰农业是否关联方 |
| 门店 | 8 店店长姓名、是否开店长账号 |
| 司机 | 阿坚名单未列待核、阿通/阿给电话 |
| 车辆 | 全部待现场补录 |
| demo 客户 | 既有 30 条 demo 客户是否清理（与真实 35 无编码冲突） |

## 7. Pilot Run 就绪状态

- ✅ **组织 / 用户 / 角色 / 数据范围 / 司机 / 门店 / 供应商** 已就绪，可支撑「组织+人员+采购+门店」闭环。
- ⚠️ **费用报销链路**另需 P2 角色矩阵补齐（ROLE_FIN_ACCT/ROLE_CASH 进费用报销菜单，见《费用报销审计报告》），方可让王玮华/朱召安操作；当前刘杰可先跑通验证。
- ⚠️ **销售闭环**：客户已导入，但联系人/区域待补；可逐步启用。

---

## 验收对照

| 验收标准 | 达成 |
|----------|:----:|
| 真 COMMIT 导入成功 | ✅ |
| 增量与 M6-1 预估一致 | ✅ 逐表全一致 |
| 数据订正生效 | ✅ 4/4 |
| 导入后 90-check 全 PASS | ✅ 16/16 |
| 未写旧表 | ✅ |
| 日志留痕 | ✅ logs/m6-import-20260601-171307.log |

**M6 Master Data Initialization 全阶段完成（M1 梳理 → M2 矩阵 → M3 Dry Run → M4 数据包 → M5 复核 → M6-0/1 生产 Dry Run → M6-2 正式导入）。**
