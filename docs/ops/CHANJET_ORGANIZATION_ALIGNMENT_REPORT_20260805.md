# 好业财组织架构与 ERP 对齐报告（2026-08-05）

## 结论

`GO WITH CONDITIONS`。

生产环境已完成 3 条确定性组织别名映射，组织维度已批准映射由 15 条提升为 18 条。写后重新计算结果为 `actionable = 0`，且 ERP 组织、门店、鸡舍主数据数量保持 `50 / 10 / 11`，本次没有伪造或新增主数据。

## 远程同步与部署

- 开始基线：远程 `main` 合并提交 `4fcdda9f`。
- 组织别名能力提交：`3763e033`，PR #21 合并。
- 执行校验修复提交：`a9e6fece`，PR #22 合并为 `41a5e995`。
- 生产 API 部署：GitHub Actions `30991367785`，结果 `success`。
- 生产回读：`/opt/phoenix-erp` 为 `41a5e9954fc47998d8b6da2f3cb016aa0189fe4f`，API healthy，数据库 connected。

## 根因与修复

规划阶段会沿 `sys_organizations.parent_code` 解析部门所属公司；原执行前目标断言却只读取部门自身的 `company_code`。当部门通过父组织继承公司归属时，会出现“规划可映射、执行断言失败”的假冲突。

修复后，规划与执行统一使用以下公司归属顺序：

1. 组织自身 `company_code`；
2. 父组织 `company_code`；
3. 父组织本身为公司时使用其 `org_code`；
4. 父组织的上级公司 `org_code`。

对应回归测试覆盖“部门自身无公司编码、通过父链归属公司”的生产形态。

## 已执行映射

| 好业财账套 | 好业财组织名称 | ERP 类型 | ERP 编码 | ERP 名称 | 结果 |
|---|---|---|---|---|---|
| 凤凰农业 | 万象仓库直营店 | 门店 | `STORE-VTE-WH-001` | 万象仓储中心店 | MAPPED_EXISTING |
| 凤凰农业 | 波利坎赛合作店 | 门店 | `STORE-BKX-001` | 波利坎赛省直营店 | MAPPED_EXISTING |
| 凤凰农业 | 生成部 | 部门 | `DEPT-SITE-MENGSAI-LAYER-PROD` | 孟赛蛋鸡养殖场-生产部 | MAPPED_EXISTING |

以上映射均满足同公司边界、唯一候选和业务语义确定性。`生成部` 被识别为 `生产部` 的来源错字别名，但未修改好业财源数据。

## 写后核验

| 指标 | 写前 | 写后 |
|---|---:|---:|
| 部门维度 `MANUAL / APPROVED` | 15 | 18 |
| 部门维度 `SOURCE_ONLY / APPROVED` | 17 | 14 |
| 部门维度 `PENDING / PENDING` | 2 | 2 |
| ERP `sys_organizations` | 50 | 50 |
| ERP `mst_stores` | 10 | 10 |
| ERP `brd_houses` | 11 | 11 |
| 当前可执行候选 | 3 | 0 |

## 仍保持 HOLD 的 14 条有效来源

| 公司 | 来源名称 | HOLD 原因 | 下一步 |
|---|---|---|---|
| 凤凰农业 | 1号鸡舍 | ERP 无同公司同身份鸡舍主档 | 先核准场区和真实鸡舍编码，再建主档 |
| 凤凰农业 | 直营店 | 仅为会计分组，缺唯一具体门店身份 | 明确具体门店或定义有界别名策略 |
| 凤凰农业 | 借款 | 会计核算维度，不是 ERP 交易主档 | 保持 intentional non-mapping |
| 星驰农业 | 鸡舍 | 会计分组节点，不得映射到交易主档 | 保持 intentional non-mapping |
| 星驰农业 | 1号鸡舍 | ERP 缺真实鸡舍主档和场区归属 | 补主档前 HOLD |
| 星驰农业 | 2号鸡舍 | ERP 缺真实鸡舍主档和场区归属 | 补主档前 HOLD |
| 星驰农业 | 3号鸡舍 | ERP 缺真实鸡舍主档和场区归属 | 补主档前 HOLD |
| 星驰农业 | 4号鸡舍 | ERP 缺真实鸡舍主档和场区归属 | 补主档前 HOLD |
| 星驰农业 | 5号鸡舍 | ERP 缺真实鸡舍主档和场区归属 | 补主档前 HOLD |
| 星驰农业 | 公鸡舍 | ERP 缺真实鸡舍主档和场区归属 | 补主档前 HOLD |
| 星驰农业 | 育雏 | ERP 缺真实鸡舍/育雏单元主档 | 明确实体类型和场区归属 |
| 星驰农业 | 变蛋车间 | 缺场区和工艺归属 | 先定义生产车间主档策略 |
| 星驰农业 | 烧鸡车间 | 缺场区和工艺归属 | 先定义生产车间主档策略 |
| 星驰农业 | 蛋托车间 | 缺场区和工艺归属 | 先定义生产车间主档策略 |

生产镜像共有 36 条部门快照，其中 32 条为有效业务身份（18 条已映射、14 条 HOLD）。另有 4 条来源质量异常：凤凰农业“拉邦酒店”、食品账套合成 `50000` 行已进入 `PENDING / PENDING`；凤凰农业和星驰农业各一条合成 `50000` 行未进入映射表。四者均不进入自动映射。

## 验证

- 定向 Jest：`11 / 11 PASS`。
- API TypeScript：`PASS`。
- W5 closeout（显式 freeze/security 授权）：`20 / 20 PASS`。
- PR 构建、API/Web typecheck、API build、Web build、单测、回归、Runtime Smoke：除预期要求显式授权的静态 freeze/security Gate 外全部通过；该 Gate 已在本地授权模式通过。
- 生产部署与健康检查：`PASS`。
- 生产写后业务复核：`PASS`。
- 生产镜像/映射对账：`36` 条快照 = `32` 条有效业务身份 + `4` 条来源质量异常；无静默丢失。

## 安全边界

- 好业财写入：否。
- ERP 组织/门店/鸡舍新建：否。
- ERP 业务事实写入：否。
- 财务余额导入：否。
- 库存事实导入：否。
- migration：否。
- 模糊匹配：否。

## 下一 Gate

`CHANJET_ORGANIZATION_REMAINING_MASTER_CREATION_REVIEW`：只处理有真实业务实体证据的星驰鸡舍和车间主档；会计分组继续不映射，来源质量异常继续 HOLD。

运行证据：

- `docs/ops/runs/chanjet-organization-alignment-apply-latest.json`
- `docs/ops/runs/chanjet-organization-alignment-post-review-latest.json`
