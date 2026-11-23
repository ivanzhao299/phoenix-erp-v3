# Phoenix ERP 蛋鸡生产管理 MVP 评审稿

评审日期为 2026 年 11 月 23 日（新加坡时间）。评审对象是 `origin/main@6bb885442` 上的鸡群、日报、分次交库、冲销与下游追溯。建议批准定向修复，保留现有单据和库存账模型。首舍实账启用应等到关键缺口验收及现场签认完成。免疫、财务总账、POS 和销售全模块不在本次验收范围。

## 发布和启用的证据

- 11 月 22 日更新日志中的 `eaeec067bbc5f` 对应一次真实发布。原部署作业的公开回执为 `HOLD`，续发作业回执为 `TARGET_OPEN`，目标仍是同一个 SHA，且 `defaultOff: true`。续发程序把迁移授权固定为 false，并校验先前回执。20 项迁移逐项核验、维护超出 180 分钟以及当时两个 HTTP 200 是该次发布记录的口径，本次没有连接生产库逐项重数或重新计时。[原部署](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/44917766283) · [续发](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/44974413964) · [续发修复](https://github.com/ivanzhao299/phoenix-erp-v3/pull/607)
- 11 月 23 日主线已合入 #608，兼容只有旧容量字段的鸡舍，并对两个有效上限取较小值。当天 API 单独发布尝试失败，随后同一 SHA 的 `Deploy · full` 于新加坡时间 11:58 成功，包含 API 和 Web。它是本次查到的最新成功部署记录。当前逐舍业务开关、现场盘点和库内现物需看各舍业务回执。[容量变更](https://github.com/ivanzhao299/phoenix-erp-v3/pull/608) · [API 发布尝试](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/45106677732) · [全量发布](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/45108424146)
- 孟赛四、五级蛋各 30 枚的处置口径明确为历史留查。登记为测试资料，不补差，不用这 60 枚验证正式额度、期初库存或试点吞吐。[历史数据处置范围](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/docs/production-inbound-installments-implementation-plan-20261118.md#L11)

## 设计与行业对照

| 评审面 | 现状与判断 |
|---|---|
| 鸡群和鸡舍 | 设施、鸡群、有效占栏、存栏事件分别建模，能解释某日由哪个群占舍。遗传品种、商业蛋品类别和分级可独立变化。保留容量快照、实盘基线和独立审批合理。清舍业务日和跨舍更正仍需补强。 |
| 生产日报 | 按舍、群、业务日记录，可选择整日或早晚班。库存分级和明确零值支持各档交库。应继续明确记录与未记录、当日死淘与班次产蛋的口径。 |
| 交库和库存 | 已确认日报提供按档额度，接收人确认实物，整单过账、分段冲销和不可变回执保留审计链。销售减少实存，冲销才返还相应额度。这项区分应保留在前后台。 |
| 批次追溯 | 鸡舍、群、日报、入库批和派生批可建立关联。首期需要同时回答“涉及哪些批次”和“本次能证明属于该来源多少枚”。混批时两者有不同答案。 |
| 发布运维 | 保留默认关闭、数据库迁移回执、续发与业务启用分开，以及独立业务签认。维护超窗表明发布包本身也要演练。 |
| MVP 范围 | 舍群日录、实物交接、批次流转、纠错与离线后找回覆盖蛋鸡生产 MVP 的核心。财务核签、期间控制、共享仓域与跨公司转换可以后台保留，首舍操作员只需看到当天适用任务。 |

海兰的蛋鸡指南把日死淘、收蛋类别、料水与环境列作现场管理记录。GS1 GTS 2.0 将收发、转换投入产出及包装关联用于追溯。由此选取“日录清楚、账物可对、批次可双向查”作为试点评审基准。具体层级、页面数、审批人数及录入时长应按本场分工确定。这些依据不足以作跨境法规合规认证。[海兰蛋鸡饲养指南](https://www.hyline.com/varieties/guide?languageid=3e6be941-6e5a-42f7-9809-09da73b29164&productid=d3b7c322-48b3-4cdf-9b4d-14f50d5987b3&typeid=3b213ee1-e07a-4485-a539-b8bef7de5694) · [GS1 GTS 2.0 第 5.4 节](https://ref.gs1.org/standards/global-traceability/2.0.0/)

## 试点前的修复清单

下面的优先级按业务动作决定。阻断项应在试点岗位可能执行该动作前修复并验收。“隔离库复现”指本轮新增临时断言验证了现有异常行为。“源码核对”指核对了实际调用路径，尚未对该异常独立执行端到端试验。

| 优先级与证据 | 场景与影响 | 修改方案及验收 |
|---|---|---|
| 阻断 · 隔离库复现 | 11 月 11 日关群、13 日清洗、14 日验收后，可提交生效日为 12 日的新群入栏，台账显示先入栏后清舍。[鸡舍状态与入栏校验](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/api/src/modules/farm/flock-lifecycle.service.ts#L407) | 从已过账单据取得清舍业务日，在同一鸡舍锁内校验关群、清洗、验收、入栏或转入的日期顺序。测试倒填拒绝，并保留当天验收后入栏的现行规则。 |
| 阻断 · 隔离库复现 | A 舍 100 羽，死 10 后实际转 B 舍 90 羽，再从 A 舍冲销原死亡。系统显示 B 舍当前 100，按占栏流水汇总却是 A 舍余 10、B 舍 90。[转舍](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/api/src/modules/farm/flock-lifecycle.service.ts#L497) · [历史冲销](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/api/src/modules/farm/flock-lifecycle.service.ts#L597) | 首期拦截会改变后续已交接数量的旧事件更正，提示涉及的转舍单。需要办理更正时，用独立审批和双方实盘建立关联补偿。验收时逐占栏、逐舍和全群都要守恒。 |
| 阻断 · 源码核对 | 正式原始收蛋与普通分次成品入库互斥。关群却只认普通 INBOUND 为交接办结，已过账的原始收蛋仍可能阻止清群，查询还包含该舍过往占栏。[关群判定](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/api/src/modules/farm/flock-lifecycle.service.ts#L536) · [原始收蛋过账](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/api/src/modules/sales-v2/services/official-raw-collection.service.ts#L194) | 复用按交接号和实际来源路径判定完成状态的查询，限定本次占栏。测试普通交库、原始收蛋、真实未结、上批已结四种关群。 |
| 阻断 · 源码核对 | 正式冲销会阻断已知质检引用，但清单漏了质检实际写入的 `qa_inspections.items_json/fail_items_json`。库存仍充足、有有效质检引用时，冲销可能放行。[冲销引用清单](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/api/src/modules/sales-v2/services/production-inbound-documents.service.ts#L670) · [质检实际写入](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/api/src/modules/quality/quality.service.ts#L215) | 共用批号引用识别与批次锁，明确什么质检状态仍阻断。验收包含先有正常/失败质检、已作废、质检登记与冲销并发。 |
| 阻断 · 源码核对 | 只授独立财务 `MENU_FIN2_AR_LEDGER:E` 能签认，但入口与读取原单要求生产查看权。冻结单跨新加坡午夜时提示重新编辑，READY 单却不能编辑。现有记账日检查也早于后续账期和库存锁等待。[财务写入口](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/api/src/modules/sales-v2/controllers/production-inbound-documents.controller.ts#L92) · [页面门控](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/web/src/components/breeding/ProductionInboundWorkbench.tsx#L131) · [锁和记账日](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/api/src/modules/sales-v2/services/production-inbound-documents.service.ts#L528) | 给财务任务提供限定范围的单据摘要、证据和签认入口。等待锁后按新加坡时间终验日期和期间。跨日提供关联原意图的续制/重新冻结流程。测试纯财务账号、跨月锁等待及旧回执重放。 |
| 高 · 源码核对 | A 日 30 枚、B 日 70 枚混作一批 100 枚。当前舍日库存按“有任一来源”累加整批，两个舍日都可能显示 100。纯原始收蛋经转换则可能漏计。[余额查询](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/api/src/modules/sales-v2/services/production-inbound-documents.service.ts#L834) · [转换来源](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/api/src/modules/sales-v2/services/official-inventory-conversion.service.ts#L128) · [批次来源继承](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/api/src/modules/wms/wms.service.ts#L160) | 先拆开“该仓该批实存”和“来源关联”，混批无法证明归属数量时明确标注。需要精确归属再采集投入产出分配及损耗，对扣减确定分摊规则。按批、仓、舍日三种视图核对同一个 100，仅按可加口径汇总。 |
| 高 · 隔离库复现 | 同舍日早晚班共 300 枚、死亡 1 羽。养殖日报显示死亡 1，生产分析显示 0。另一个实测中完整分级日报接受字符串数量，已确认后正式来源读取又拒绝。[生产分析汇总](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/api/src/modules/analytics/services/production-analytics.service.ts#L14) · [日报写入](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/api/src/modules/farm/farm.service.ts#L428) · [来源读取](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/api/src/modules/sales-v2/services/production-source-facts.ts#L60) | 死淘从事件账按占栏和日取一次，产蛋按班次求和，再供各报表复用。写入前统一分级数量类型与完整性，同值重试保留显式零档和来源摘要。加日报、BI、来源读取同一夹具的对账断言。 |
| 高 · 源码核对 | 切换鸡舍或日期，工作台未立即清空旧余额、交接和历史。新请求失败时可继续显示上个鸡舍数据。临时入库模式查询失败也可能展示绿色临时模式。[范围刷新](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/web/src/components/breeding/ProductionInboundWorkbench.tsx#L81) · [旧入库模式处理](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/web/src/app/%28admin%29/breeding/daily-inbound/page.tsx#L121) | 用公司、舍、日、仓标识每次结果。切换时清空并显示加载状态，失败显示“状态未核实”并关闭写入口。切换日前显示归档。额度冲突保留后端返回的档位、分段和剩余枚数。测试 A 成功、切 B 失败、A 慢响应最后返回。 |

## 页面分配和交互方案

现有 PC 侧栏和手机入口可以沿用。PC 和手机复用同一个正式入库工作台，有跨设备找回和原回执入口。390px 浏览器回执截图中，单号与“查看原单”逐字换行，长表下方还有多项对只读用户禁用的操作。按职责缩短页面比重写整个前端收益更高。[菜单及角色](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/web/src/components/layout/Sidebar.tsx#L87) · [正式入库工作台](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/web/src/components/breeding/ProductionInboundWorkbench.tsx#L149) · [浏览器场景](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/scripts/test/production-installments-browser.cjs#L9)

| 岗位与默认入口 | 页面上优先展示 | 异常与跳转 |
|---|---|---|
| 饲养员 · 手机今日鸡舍 | 当前鸡群、存栏、业务日和班次，分档录入，已报/待报。把日报和死淘登记放在同一舍的任务列表 | 保存后给出日报号。从原日报带上下文发起更正。明确区分零枚与漏填 |
| 交库人、收货人 · 手机待交接/待签收 | 默认本人的待办，点一笔核对来源与数量。显示接收人、办理结果和可找回的交接号 | 双人独立签收，断网显示“待确认”，重连按原交接号找回。移动端历史用摘要卡，明细按需展开 |
| 仓管、包装 · PC 或现有作业终端 | 查来源、批次、仓位与实存。从回执正向查产出，从产出反查日报 | 对混批和原始收蛋说明数量归属。将异常批与可正常作业的库存区分显示 |
| 生产主管、财务 · PC 审核待办 | 主管处理关群、差异与冲销。财务只看到授权范围内的待签原单、期间、原据与成本 | 显示阻断原因和下一步，可退回补证。冲销成功后原单和额度同步可查 |
| 场长 · PC 试点与日结 | 单舍首日、盘点、在途、预占、来源、待签人、启用状态。日结显示总产、已交、未交及差异 | 从差异直接打开原单。OFF、暂停、切换日前历史与网络错误分别显示。沿用已有盘点工作台。[盘点入口](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/web/src/components/breeding/ProductionCutoverWorkbench.tsx#L95) |

## 已执行验证

- 在独立的主线检出、Node 20.20.2 和新建本地 PostgreSQL 18 夹具运行 API/Web TypeScript 检查，两项通过。四个核心表单的源码窄查覆盖生命周期、正式入库、手机正式日报、PC 日报，查到共享选择器和只读公司字段。此次字段扫描不等同于全站权限审计。
- 重跑存栏、生命周期 HTTP、下游、正式日报、单据、迁移、库存资格等 8 套 PostgreSQL 测试，153 项通过。正式入库 HTTP/JWT/权限/上传套件单独跑 50 项通过。首次让套件共用同一库并行时触发业务互斥锁，HTTP 为 5 过、45 失败，改为独立数据库后 50/50 通过。最终 9 套、203 项，均实际执行。已有断言包含并发抢额度、第二行失败整单回滚、部分冲销、期间变化与原回执重放。[并发及原回执断言](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/api/src/modules/sales-v2/services/production-inbound-documents.pg.spec.ts#L314) · [分段冲销断言](https://github.com/ivanzhao299/phoenix-erp-v3/blob/6bb88544275dfef591cb96c0078f73e88496433b/apps/api/src/modules/sales-v2/services/production-inbound-documents.pg.spec.ts#L385)
- Web 定向 6 个文件、46 项通过。本轮 Chromium 跑通 6 个交互检查，包括 PC 草稿刷新、390px 实名接收、两次交库 100 和 900、过账成功后响应丢失仍恢复同一回执、新设备只读账号按交接号找回。使用真实本地 HTTP 与 PG，账号和实物均为合成夹具。
- 另加 4 个隔离库反例并观察到上表所述异常：清舍倒填、跨舍冲销余额失配、多班次死淘 BI 漏计、字符串分级导致已确认来源不可用。未执行全仓 `pnpm verify`、生产查询、逐项迁移台账重审、全角色现场操作或真实鸡舍盘点。

## 评审决议与验收顺序

1. **第一批合并账务与存栏修复。** 维持已有回执和事件不可变。为关群、转舍、清舍、冲销、舍日汇总加上述反例。跨舍历史更正和混批数量分配由生产及仓储负责人确认口径后实施。涉及 schema 的改动走可审查的 TypeORM TS 迁移，不改已有发布回执。
2. **第二批合并页面调整。** 保留原路由及兼容读入口，按角色拆分待办和明细。用试点实际授权矩阵验收饲养员、交库人、接收人、主管、财务与只读员。对照现场纸单或 Excel，记录首次独立完成率、耗时、需他人协助次数和失败后的恢复结果。
3. **演练发布及恢复。** 发布前校验运行镜像中的权限清单，回放真实格式的历史迁移回执，演练 API 先发、Web 续发与超时恢复。把 180 分钟拆出可测的发布工序和恢复预留。超出剩余预算时交由发布负责人决定是否进入下一步。
4. **单舍试点后再扩围。** 审核鸡群与实物盘点、在途和预占、来源及首个正式生产日，指定人签认。在同一舍日完成真实的两次交接，核对各档累计、原回执、库存流水和包装反查。冲销、跨月、网络中断等异常先在与试点配置一致的隔离环境走完。预期为零重复过账、零无依据额度释放、每笔来源和差异可解释。达到业务与技术签认条件后再扩大范围。
