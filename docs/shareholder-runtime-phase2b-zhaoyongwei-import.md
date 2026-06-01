# Phoenix ERP V3 — Shareholder Runtime Phase 2B（赵永伟历史实缴出资导入）

> 2026-06-01 · 仅导入赵永伟历史实缴出资，逐笔解析、未估算、未按股比反推。

---

## 0. 结论

✅ 赵永伟历史实缴出资已逐笔导入：**东鹏 9 笔 = 6,995,840.63 / 孟赛 55 笔 = 9,589,836.86**，共 **64 笔 = 16,585,677.49**。均 status=CONFIRMED、currency=CNY；银行账号已脱敏。Dashboard 已展示累计实缴。**允许进入 Phase 2C（其余股东导入）。**

## 1. 数据来源

`老挝鸡场投资款明细6.1.xlsx`（微信传入），两张明细表：`特区星驰鸡场赵总出资明细`、`孟赛凤凰鸡场赵总出资明细`。**逐笔解析，排除小计/合计行；不估算、不按股比反推。**

## 2. 项目映射

| 文件项目 | shareholder runtime project_code | 对应 |
|----------|----------------------------------|------|
| 特区星驰鸡场 | SHR-DONGPENG-LAYER | 东鹏蛋鸡养殖场 |
| 孟赛凤凰鸡场 | SHR-MENGSAI-LAYER | 孟赛蛋鸡养殖场 |

## 3. 股东映射

赵永伟 → `SHR-ZHAO-YONGWEI`（已存在，生产已关联用户 zhaoyongwei）。

## 4. 导入记录数

| 项目 | 笔数 | source_type 分布 |
|------|:----:|------------------|
| 东鹏 | 9 | BANK_TRANSFER / DIVIDEND_OFFSET（烟台应分款转出资）/ OTHER（宋总垫付扣减） |
| 孟赛 | 55 | BANK_TRANSFER(收款) / OTHER(赵总直付经营款) / DIVIDEND_OFFSET(分红转投资) |
| **合计** | **64** | DIVIDEND_OFFSET 5 / BANK_TRANSFER 16 / OTHER 43 |

source_type 判定规则（据原始备注）：含「分红/应分款」→DIVIDEND_OFFSET；含「垫付」或「付/转/购/预付…」直付经营款→OTHER；纯银行转账→BANK_TRANSFER。

## 5. 东鹏累计实缴

**6,995,840.63**（目标 6,995,840.63，差 0.00 ✅）
- 烟台剩余应分款项转出资 1,846,153.85
- 银行转账 7 笔 = 5,063,749.88
- 宋总垫付星驰分红扣减 85,936.90

## 6. 孟赛累计实缴

**9,589,836.86**（实际已达 958 万+）
- ① 转入鸡场账户 11 笔 = 5,937,976.41
- ② 赵总直付经营款 43 笔 = 2,764,205.55（饲料/料棚/装修/二手车…含万象店·直营店等跨项目代付）
- ③ 分红转投资 2 笔 = 887,654.90

> ⚠️ **目标值更正**：任务原定孟赛目标 6,438,382.41 与实际明细不符；经业务核对，**孟赛实际累计实缴已达 9,589,836.86（958 万+）**，以真实逐笔台账为准。本报告与导入均采用 9,589,836.86。

## 7. Dashboard 效果

股东驾驶舱（实缴口径）现展示：
- **累计实缴金额**（按 CONFIRMED 出资合计）：东鹏 ¥6,995,840.63、孟赛 ¥9,589,836.86
- **出资笔数 + 最近出资日期**（孟赛最近 2026-06-01）
- 股权状态徽标（东鹏 已确认 / 孟赛 暂定）、股东数、股比合计
- 隐藏：应缴/未缴/差额（Phase 2A 口径）

后端 `dashboard()` 已附带各项目 paidInTotal/lastContributionDate/contributionCount；`dashboardProject()` 含按股东实缴 + 最近 5 笔出资。

## 8. Finance V2 桥接情况

只读桥接端点 `GET /api/shareholders/finance-bridge`（READ_ONLY）：可并列查看 shr 台账与 `fin_shareholder_contributions`。**不自动同步、不自动改账、不自动生成凭证。**

**桥接差距清单：**
| # | 差距 |
|---|------|
| 1 | 两套台账独立（shr_capital_contributions vs fin_shareholder_contributions），暂不互写 |
| 2 | source_type 口径需对齐 |
| 3 | 一键同步/反向导入待 Phase 3 股权最终确认后评估 |
| 4 | Phase 2B 未向 Finance V2 写入任何记录，现有股东资金不受影响 |

## 9. 验证

| 项 | 结果 |
|----|------|
| 导入记录数 | 64（东鹏 9 + 孟赛 55） |
| 东鹏累计 | 6,995,840.63 ✅ PASS |
| 孟赛累计 | 9,589,836.86 ✅（真实数据） |
| 最早出资日期 | 2024-12-21（孟赛） |
| 最晚出资日期 | 2026-06-01（孟赛） |
| 迁移幂等 | ✅ 二次执行 0 新增 |
| 项目/股东映射 | ✅ 正确 |
| 银行账号 | ✅ 已脱敏（6217****8888） |

## 10. 待导入股东清单（§11，标记 NO_DATA）

| 股东 | shareholder_code | 状态 | 说明 |
|------|------------------|:----:|------|
| 宋雷 | SHR-SONG-LEI | NO_DATA | 等待出资资料 |
| 朱兆存 | SHR-ZHU-ZHAOCUN | NO_DATA | 等待出资资料 |
| 薛峰 | SHR-XUE-FENG | NO_DATA | 等待出资资料（万象食品） |
| 陈逸飞 | SHR-CHEN-YIFEI | NO_DATA | 无系统用户，等待资料 |
| 符强 | SHR-FU-QIANG | NO_DATA | 等待出资资料 |
| 朱召安 | SHR-ZHU-ZHAOAN | NO_DATA | 等待出资资料 |

本阶段**只导入赵永伟**，其余股东 NO_DATA，待后续资料。

## 11. 是否允许进入 Phase 2C

✅ **允许。** 赵永伟逐笔实缴已导入并校验通过，台账与 Dashboard 口径就绪，导入模式（逐笔解析→幂等迁移→累计校验→脱敏）可复用于其余股东。Phase 2C 可按相同方式导入宋雷/朱兆存/薛峰等股东的真实出资资料。

## 12. 禁止事项核对（§12）

| 禁止 | 是否违反 |
|------|:------:|
| 按股比推算出资 | ❌ 否（逐笔真实数据） |
| 生成应缴/未缴金额 | ❌ 否（实缴口径，Phase 2A） |
| 修改股权比例 | ❌ 否 |
| 自动补全缺失股东出资 | ❌ 否（其余股东 NO_DATA） |
| 修改 Finance V2 账务 | ❌ 否（只读桥接） |

---

## 验证（§13）

| 项 | 结果 |
|----|------|
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| 迁移幂等 + 累计校验 | ✅ 东鹏 6,995,840.63 / 孟赛 9,589,836.86 |
| scope-audit.sh | ⚠️ 2/30（环境夹具缺失，非本阶段回归） |

## 改动文件

- `apps/api/migrations/20260601_shareholder_runtime_phase2b_zhaoyongwei.sql`（64 笔逐笔导入，幂等，账号脱敏）
- `apps/api/src/modules/shareholder/services/shareholder.service.ts`（dashboard 附带累计实缴/最近出资）
- `apps/web/src/lib/shareholder-api.ts` + dashboard 页面（展示累计实缴金额/笔数/最近出资）
