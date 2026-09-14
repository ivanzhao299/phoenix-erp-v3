# 包装33入库与交接执行报告

更新时间：2026-09-14T01:14:34.086082+00:00（UTC）。执行者：协调者启动的当前真实 Codex CLI，未创建其他代理。

## 当前结论

**BLOCKED_REQUIRED_PHYSICAL_FACTS：尚未完成入库/交接/接收。** 已真实执行两次生产双层只读 SQL 核验及一次官方密码登录后的业务 GET 核验。最新 API 时间为 **2026-09-14T01:11:22.578Z**：原单状态 `PENDING`、`committed=false`、`inventoryPosted=false`，批次/流水/交接均未形成。

唯一必要业务问题已提出：请提供包装单 `PKG-20260910-163616`（id33）这一盒的**实际箱码、实物数量、实际接收人、仓库/库位、是否已经交付并由该人接收**，或可核验的现场登记编号。生产登记没有提供这些实际交付事实；可选库位和操作员不能充当事实。本报告不把授权、原单数量或服务账号身份当成实物交接证明。

没有真实权限拒绝。现有生产服务账号通过官方密码登录、身份及业务 GET 均返回 HTTP200/code200；没有尝试业务 POST，不能将读权限验收写成写权限实测。未改 secret、未伪造 JWT、未旁路修改库存/流水/交接、未改其他 grade 或 legacy 归属。

## CLI 与 workspace/main/生产版本

旧报告的 PATH 首检失败是 2026-09-14T00:42:45Z 的历史事件，已不再是阻断。当前实际执行 `/home/jinhuit/.local/bin/codex --version` 返回 `codex-cli 0.154.0`，退出码0。没有安装包或改 CLI 配置。

| 对象 | 当前核实结果 |
|---|---|
| 初始 workspace HEAD/main/origin-main、GitHub main | `a53d91f33ff733bf28e19ca11d7491f1bfd46922` |
| 本轮审计工具 main（报告提交前） | `28dd7a8b1a97f8f8f79e3ec3713d2cb4be34b833` |
| 生产 checkout，两次现场核验 | `a53d91f33ff733bf28e19ca11d7491f1bfd46922` |
| API 镜像 revision，两次现场核验 | `d49383cdfdd112246559e08e7cde1bd6a42c28f3` |
| Web 镜像 revision，两次现场核验 | `d49383cdfdd112246559e08e7cde1bd6a42c28f3` |
| PR229 | OPEN，未合并，head `3bea180b9c1e359c4bc6a04ec3dfe2c7499e9ded` |

生产三端存在 revision 差异，不能称“三端一致”。但已实际运行 `git diff d49383c a53d91f3 -- apps/api apps/web`，输出0字节；生产镜像对应 revision 已含 readiness 修复。包装 controller blob 两端同为 `4541ffe1ff2014d16f81ea46668cd412e61276ab`，库存集成 service 同为 `4d1fa3ee1c2533361a7212c2d060801643738505`。因此 PR229 未合并并不等于修复未上线，本次没有需要部署的业务代码变更，未触发应用发布或迁移。

## 最新 before：精确关联键与原量

证据：SQL run [34794957461](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34794957461)，事务时间 `2026-09-14T01:09:48.015958Z`，查询结束 `01:09:48.043410Z`；session/transaction read_only 均 on，最终 ROLLBACK。

| 字段 | 实查值 |
|---|---|
| id / code | `33` / `PKG-20260910-163616` |
| status / is_test | `ACTIVE` / `false`（正式模式） |
| production_date / 原量 | `2026-09-10` / `total_eggs=30, total_boxes=1` |
| shift_id / code / status | `56` / `SH-20260910-1597` / `CLOSED` |
| 班次日期、模式、关闭时间 | `2026-09-10`、正式、`2026-09-10T09:10:21.608504`（DB原始时间，无时区后缀） |
| 场站 / 权威公司 | `LPH_MENGSAI` / `COMP-LAO-AGRI`，farm ACTIVE |
| 首分级 code | `GRD-20260910-0A3531C5` |
| 分级集合 | 上述 code、`GRD-20260910-159E8CAF`、`GRD-20260910-D1C991FA` |

原 `batches_json`（未改写）：

```json
[{"eggs":30,"spec":"精品礼盒(30枚/盒)","boxes":1,"grade":"GRADE_5","specId":"PKG_PACK_SPEC_3"}]
```

来源链接实查完整：分级 `159E8CAF` → source46 / `SRC-20260910-HOUSE_CS-HFC5` / `HOUSE_CS_MS`；分级 `0A3531C5` → source47 / `SRC-20260910-HOUSE_CS-JJT6` / `HOUSE_CS_02`；分级 `D1C991FA` → source49 / `SRC-20260910-HOUSE_MS-YQTV` / `HOUSE_MS_01`。三者均 shift56、正式、分级ACTIVE、来源RECEIVED、farm `LPH_MENGSAI`，各 received_qty100。未按名称中的字符串推断 test 模式。

防重复查询使用原单精确 code，匹配 `inv_batches.packaging_batch_ref OR source_no`，`inv_ledger.ref_no OR batch_no OR 已关联批次号`，`pkg_handover_records.packing_code`；结果分别 **0/0/0**。相关 WMS 入库单按 `source_order_no/inbound_no/task_no` 精确 code 查询0。打印日志按真实关联列 `packaging_batch_id` 查询0。首次 run34794786112 的打印查询误用了不存在的 JSON key `packing_code`，该项结果已明确作废；补查已更正，未把初次空结果当证据。

`before-keys.json` 保存上述关联键、完整原包装 JSON、来源、模式、零结果及日志 SHA256；没有用 qty_available 替代原量。

## SKU readiness 与解析兼容

- 正式 SKU：id **7670**，`EGG-GRADE_5-PKG_PACK_SPEC_3`，ACTIVE；精确 grade/spec 查询仅返回这一条。
- 父产品：`mst_products.id=10, product_code=EGG`，ACTIVE。
- 等级：`GRADE_5` ACTIVE、is_saleable=true、is_storable=true。
- 规格：`PKG_PACK_SPEC_3` ACTIVE、qty_per_unit=30，名称与原 JSON 一致。
- SITE/LPH_MENGSAI 为 `PACKAGING_INBOUND`，优先于 GROUP/ALL 的 TEMP 模式。官方状态 GET 也实际返回 PACKAGING_INBOUND。
- 生产 revision 中 `resolvePackagingIdentity` 支持旧 JSON 无 productCode/skuCode：按 grade/spec 唯一 ACTIVE SKU 解析，再验证已注册 ACTIVE 产品，禁止拼接产品码。当前四表值满足该解析条件；这属于源码与现场主数据核对，未将其写成已成功执行 confirm。
- 历史 apply34684385156 仅保留为 SKU 插入历史背景，本次 SKU 现态由新的 SQL 查询证实。

## 官方 API、鉴权、状态机和幂等

已阅读当前 controller/service、readiness/protection、库存在统一服务中的创建入口以及 Web 请求代码，并核对部署 revision 对应源码相同。

| 入口 | 要求与本次用途 |
|---|---|
| `POST /api/auth/login` | 官方密码登录，令牌只留脚本内存；本次已成功 |
| `GET /api/auth/me` | 返回既有服务账号 userId16037 / svc_bug_intake_runner / ROLE_ADMIN；本次成功 |
| `GET /api/packaging/terminal/warehouse/status?packingCode=...` | Jwt + MENU_PKG_OP:V；本次成功，PENDING |
| `GET /api/packaging/terminal/reports/shift-summary?date=2026-09-10&shiftId=56` | 精确班次/正式模式/DataScope；本次成功 |
| `POST /api/packaging/terminal/warehouse/confirm` | Jwt + MENU_PKG_OP:E；唯一拟使用的入库交接业务写入口，**尚未调用** |

源码位置：`apps/api/src/modules/bff/bff.controller.ts:2583`、`packaging-readiness.ts:21`、`packaging-protection.ts:27`、`apps/api/src/modules/sales-v2/services/packaging-inventory-integration.service.ts:262`。

confirm 必须有 packingCode、真实非空唯一 boxes、location、receiver；箱数必须等于原单1盒；日期/班次匹配原单，不能用今天覆盖 `2026-09-10`。库位状态 NORMAL/EMPTY/OCCUPIED、仓库ACTIVE，权威场公司必须匹配，并按身份范围校验公司/场/仓及来源鸡舍。CLOSED 原班次允许原单交接，不需要重开班次。

事务先锁包装链和原单，验证原单ACTIVE/real及来源，逐产出解析SKU；同 manager 创建库存和PACKAGING_INBOUND流水，再创建交接。使用已有统一 EggInventoryService 创建批次，不走SQL旁路。

既有证据按逐SKU原量/日期/产品/等级/规格/公司/仓/位及唯一流水比对，交接按箱码/接收人/日期/班次/托盘精确核对。部分执行证据会拒绝补余；本轮未重放任何确认。未来 POST 若超时/commit未知，先重新执行只读关联查询，不盲重试。

现场 schema 的 `pkg_handover_records` 只有 receiver/location/boxes及created_at，**没有独立 status、received_by、received_at 或签名字段**。当前包装入口以一次 confirm 登记交接和接收人，不存在本链路独立接收签字 API；其他 WMS 调拨接收、出库收货签字不适用于本单，不能人为创建第二条业务链冒充接收。`/api/inbound/confirm` 需要既有 WMS task_no，本单未查到关联任务，因此不调用。

## 现场事实与阻断

查到14个同公司ACTIVE仓库及多个候选库位，其中 NORMAL 库位主要属于 `LPH_MS_EGG_FARM`；候选列表存于只读日志。**没有默认选用任何一个**，也没有因为库位名含“测试”而推断原单是test。

原单、班次、来源及主数据只证明系统记录；没有箱码打印/交接/接收登记，不能确定实际箱码、放货位置及接收人。班次操作员 songlei、主管薛峰不是接收人证据；自动化执行账号也不是实物接收人。没有伪造实物交付、签名或打印行为。

浏览器调试通道 `127.0.0.1:9222` 连接失败是已记录的工具事实，但已通过既有服务账号官方登录完成API读取，**它不是当前阻断**。未请求或保存密码/token；GitHub secret仅在受控workflow内部提供给官方登录，未修改其值。

## 最新只读结果与验收定义

run [34795090705](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34795090705) 在 `01:11:21–01:11:22Z` 官方登录及3个GET均HTTP200/code200。`warehouse/status` 实际返回：PENDING、committed=false、handoverCode=null、inventoryBatchCount=0、totalInbound=0、ledgerInbound=0、handoverQuantity=30、inventoryPosted=false。

班次56 API汇总：receivedQty300、gradedQty490（原有汇总值，未尝试修复）、packed120枚/4盒、labelCount0、warehoused0盒/0托盘、OPEN/CLOSED异常数均0。不可将该班次全量包装120枚作为本单应入库数量。

待事实齐全后的完成条件：

1. 原单id/code/status/real/shift/日期及batches_json保持原始身份；业务原量30枚/1盒。
2. 精确关联原单的一条目标SKU批次，qty=30；product EGG、grade GRADE_5、spec PKG_PACK_SPEC_3、sku EGG-GRADE_5-PKG_PACK_SPEC_3；公司COMP-LAO-AGRI，仓/位必须等于实际已确认值，egg_date/inbound_date=2026-09-10。
3. 该批次仅一条PACKAGING_INBOUND流水，ref_no精确原code、qty_change30、SKU/公司/仓/位一致；不得用available推导原量或仅按总和忽略重复。
4. 仅一条关联交接，真实箱码1个、box_count1、真实receiver/location、shift56及原日期一致；真实交付/接收由现场事实支撑，不能只凭API200称实物成功。
5. 官方状态COMMITTED/committed=true/inventoryPosted=true；班次汇总原包装120枚4盒不变，在没有其他并发业务时本次交接增加1盒；托盘只有真实填写时才计数，不推算或虚构。
6. 保存业务请求的非secret字段、响应/时间/run、最终只读原单/批次/ledger/交接/班次证据。如并发改变，逐原单核验，不能盲按班次差量判定。

以上是验收定义，**不是已通过的验收结果**。当前业务写操作为0；仅有一次官方认证POST（可能产生正常登录审计/session写入），不得称整个生产数据库完全零写入。

## 本轮改动、验证与证据

main仅新增本单审计SQL、两个workflow、官方认证只读脚本及报告；没有业务源码/schema改动。工具提交：b3e7f818、22c8ea9e、a6f07d32、28dd7a8b；使用正常fast-forward push，无force/reset/amend/历史清理。未部署应用。

实际验证：只读SQL DDL/DML门禁通过；双层只读生产执行2次成功；Node语法检查通过；本地mock核验只有登录POST及3个GET且输出不含密码/token sentinel；生产官方认证+GET核验成功。没有运行API/Web tsc或全仓scope-audit，本次没有API/Web源码变更，不能声称这些检查PASS。

- 初次SQL：[run34794786112](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34794786112)，artifact `artifacts/packaging33-before-34794786112/`。
- 补充SQL：[run34794957461](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34794957461)，artifact `artifacts/packaging33-before-34794957461/`；日志SHA256 `05f5b3b04cc5dd196a16ab2b0952d31cac9cfc286ec4f0d0378c0c797b322c83`。
- 官方认证只读：[run34795090705](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34795090705)，artifact `artifacts/packaging33-auth-34795090705/`；JSON SHA256 `e9ce5b85006b3461ab77c7d49e5c993299761858a7481a9c54836dbb1c7add21`。
- before关联键：`artifacts/packaging33-before-34794957461/before-keys.json`。
- 协调者进度：`artifacts/packaging33-cli-progress.md`。
- 本地mock artifact带 `runId=local-sanitization-test`，不是生产证据。

不将旧apply、历史快照、脚本验证或读API成功表述为包装33已入库。收到必要现场事实后须先重新只读核查是否有并发执行，再通过官方业务API继续。
