# 生产管理改造交付与验收记录

基线为 2026 年 11 月 23 日生产 API 和主分支共同使用的 `6bb88544275d`。候选合并在 [PR #609](https://github.com/ivanzhao299/phoenix-erp-v3/pull/609)。本记录给出隔离环境中可以复查的业务证据。生产实际执行的版本、镜像、迁移回执及开放时点以受控发布运行记录为准。

## 关键业务结果

| 验收项 | 已核验的业务事实 | 可复查入口 |
|---|---|---|
| T01、T02 | 清洗、验收和新入栏按业务日核对。100 羽死亡 10 羽、转出 90 羽后，影响已签转舍的冲销被拒绝，已结束占栏和目标占栏的数量各自可重算。 | `flock-ledger.pg.spec.ts`、`flock-lifecycle-http.pg.spec.ts` |
| T03、T04 | 同一占栏早班 100、晚班 200，死亡 1 羽，舍日汇总、趋势与分析可对回 300 枚和 1 羽。两条交接路径均用真实 PG / HTTP 核验了过账前待办与过账后关群。 | `official-production-report-grain.pg.spec.ts`、`production-inbound-http.pg.spec.ts` |
| T05、T06 | 交接用原日报分段，销售不会释放日报额度。重复请求、末笔额度竞争、第二行失败回滚和提交后找回有数据库用例。原始收蛋记录来源分段，库存实物由后续实际转换产生。 | `production-inbound-documents.pg.spec.ts`、`official-raw-collection.pg.spec.ts` |
| T07、T08、T09 | 旧 API 配新结构时，质检 JSON 引用也能阻止冲销。并发质检与冲销、跨日记账、独立审批、续制回滚和已过账回执重放均有回归。月末反例结合模拟的应用日期、数据库真实墙钟和两个连接的锁等待。 | `production-inbound-documents.pg.spec.ts`、`production-inbound-migrations.pg.spec.ts` |
| T10 | 30 与 70 枚来自两日，混产 100 时整仓计 100，实产 95 且损耗 5 时计 95。两个舍日都能反查该批，无法证明的数量份额保留为空。 | `official-inventory-conversions.pg.spec.ts`、`production-stock-trace.ts` |
| T11 | 窄权限财务账号可读本公司、本仓的待签事项，核验精确金额和账期版本，上传并预览本人证据。越权仓、关账后重开、重复签认及同人兼任均有反例。生产、仓储和财务按各自实名权限操作。 | `production-inbound-http.pg.spec.ts`、`production-cutover-browser.cjs` |
| T12 | Chromium 检查 PC 与 390px 手机的登记、签收、过账、刷新、跨设备找回和只读查单。T12 的慢响应、切舍失败用浏览器响应控制重现。 | `production-workbench-range-browser.cjs`、`production-installments-browser.cjs` |
| T13、T14 | 旧 20 项回执可复核，隔离库两档各 30 枚历史库存保持原状。实际 PG 角色演练覆盖期初事务中断、原准入查回、ATTACH 复用唯一期初、范围暂停与恢复。 | [独立验收记录](production-remediation-release-assurance-20261123.md) · [试点操作说明](production-pilot-control-operations.md) |

## 整合检查

在 `bcdff32d0` 的同一 PR 验收运行中，11 套 PG18 领域测试共 288 项通过，另一个独立数据库上的 HTTP 验收 56 项通过。桌面和手机浏览器分别覆盖范围切换、两次交库、正式分级日报和盘点准备。[运行记录](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/45119816720)

集成工作树另跑 API、Web 类型检查及构建。默认 API 单测为 2,088 项通过、838 项跳过。Web 单测在日报夹具补齐范围响应后为 849 项通过、4 项跳过。专用 PG 验收单列，默认跳过的测试不计入通过数。Web 修改文件 lint 与全仓 ratchet 通过，既有 lint 债务仍在。API lint 无错误，既有警告仍在。

在同一份已发版隔离基线上，三个 TypeORM 扩展从 294 行账本升级到 297 行，第二次运行新增 0 行。旧版读取、冷装比较、权限和镜像的具体执行版本在独立验收记录中分别列明。只读仓库查询的小样本用于核对归属语义、调用次数和索引路径。生产规模延迟和现场班组操作耗时须用试点实测。

## 软件放行与实账启用

发布人使用本次受托权限，通过已认证的维护流程绑定最终 SHA、镜像、生产前置账本、演练和窗口。生产原始审计在改造前显示 HOLD 及两组超额，保留固定历史测试记录是此次已批准范围。[生产只读检查](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/45116698259)

首舍实账启用仍需场长、仓管与财务签认现场实物、在途、预占、期初、来源和首个正式日。试点控制角色、专用数据库身份和现场范围须逐项核对。完成首个完整业务日的两次真实交库、日结和包装反查后方可评估扩围。
## 2026 年 11 月 25 日上线后独立复核

以生产前后端共同运行的 `b366e18d3` 为起点，独立复核操作体验、API 与数据语义、验收与发布证据。修复见 [PR #634](https://github.com/ivanzhao299/phoenix-erp-v3/pull/634)。

| 场景 | 本轮修复 | 验收依据 |
|---|---|---|
| 日报录入与查询 | 同舍同一天只能采用整天或分班口径。手机待核重试按原值快照校验。历史列表按标准班次和旧值一并查询。 | `daily-log-visibility.pg.spec.ts`、日报 DOM 验收 |
| 入库与原回执 | 仅含脏破蛋的旧汇总也明确标记缺少分档。收蛋编辑和药品入库在结果待核期间保留草稿，并提供原回执恢复入口。 | 真 PostgreSQL / HTTP、药品 DOM、电脑和手机 Chromium |
| 权限与导航 | 手机饲料和药品执行只读权限。饲料出库入口按仓储权限展示。预览、正式账及失败状态有可触达的返回入口。相关表单按新加坡业务日预填。 | 操作反馈 Chromium、差异 lint |
| 档案与告警 | 鸡舍档案加载失败显示可重试状态，数量和归属未核实时明确留空。旧鸡群由全局角色追查，场域角色仍按范围查询。来源无告警严重级别时呈现未分级。 | 档案角色 fixture、前端类型和 UI 验收 |
| 验收证据 | 日报 HTTP 运行完整套件。浏览器签收、正式日报、切换场景须各自提交完整回执。 | Production management candidate acceptance |

本次发布范围为业务修复及其验证，沿用已部署的数据库结构。发布配置中命令跟踪可能将临时凭据带入主机日志，已独立登记，按本轮范围留待单独处理。
