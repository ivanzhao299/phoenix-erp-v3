# 孟赛测试误入库：本地实现与验证记录

日期：2026-11-18（Asia/Singapore）。本记录补充批次生命周期实施报告及 `flock-test-inbound-reversal-review-20261117.md` 供审方案，不替代业务批准、财务签核、生产备份或受控发布回执。

## 1. 当前交付边界

本批只实现可审查的只读预检、指定事件的原子冲销能力、后续引用保护、日报展示与本地验证。**未在生产执行冲销、迁移、部署、合并或打发布标签**。用户已确认两条 30 枚额外入库属于测试/误录，并要求方案供审；这不是执行批准。当前 schema-first 发布路线仍待决定，未增加迁移准入例外。

生产没有注册 `TEMP_REVERSAL_APPROVAL_VERIFIER`。CLI `apply` 在创建数据库连接前停止，原因 `SEALED_APPROVAL_ADAPTER_NOT_INTEGRATED`，缺少业务批准、财务权威证据和新鲜备份回执。PG 测试中的 verifier 明确是 fixture 专用，不随 API 生产编译打包。对象形状、哈希、操作人字符串或请求布尔值都不构成真实签核。

## 2. 指定事件与不确定性

事件 `MENGSAI-TEST-INBOUND-20261117` 只针对 COMP-LAO-AGRI / LPH_MENGSAI / HOUSE_MS_01 的两条库存批次：

| inv_batches.id | batch_no | 原 inv_ledger.id | 等级 | 原数量 |
|---|---|---|---|---|
| 413 | EGG-20261117-00005 | 649 | GRADE_4 | +30 枚 |
| 415 | EGG-20261117-00007 | 651 | GRADE_5 | +30 枚 |

原来源 `DAILY-2026-11-17-HOUSE_MS_01-4c5f2ca`，原日报 106，原业务日期 2026-11-17。旧只读观察显示该日报 47,930 枚、六类等级合计一致且没有 GRADE_4/5；同源其他等级是独立正常记录，不能据此判定整份日报所有库存已入齐或均需冲销。

已获准的旧生产只读回执显示批次 store_code 为 NULL，而原正流水 store_code 污染为公司编码；原流水 unit 为 NULL。观察时成本列尚不存在，因此成本是未知，不是实测零。预检保留原维度和差异证据，未回写正流水。成本迁移后的默认 0 仅按占位校验，负流水 cost_change 保持 NULL，并记录 `UNKNOWN_PRE_SCHEMA`。本地测试不能替代执行前的新鲜生产核验；当前未假定业务已暂停、数量未变化或外部财务无引用。

## 3. 预检、写入与幂等

`temp-production-reversal-case.ts` 通过系统目录核对真实表/列/关系类型，逐项检查固定批次、原正流水、原日报、字典、迁移账本及下游关系。真实缺失的活跃写入口结构标为 UNKNOWN 并 HOLD；仅已证明不适用的历史候选列为 N/A。QA JSON 使用 PostgreSQL 有效性检查，损坏 JSON 不被猜成无引用。包装数字 ID 不与库存 ID 混同；本地财务裸数字关联与确切业务来源区分，外部凭证与库存期间权威状态仍待签核。

计划摘要绑定完整白名单快照、调用方声明的目标 release、迁移账本摘要和新加坡执行日期。CLI 的 release 参数本身不能证明实际 runtime；真正运行版本须由尚未接入的可信 adapter 独立核对。迁移账本与现有运维工具使用同样的 JSON 规范字节，真实 PG 覆盖空账本、微秒时间戳和排序向量，不把待迁移总数硬编码为 8。

`WmsService.reverseReviewedTempProductionInbound()` 只有服务接口，没有新增 HTTP 执行入口。事务按家舍、日报范围、全部实际物理数量池、两批次、原流水排序加锁，再读新鲜预检及批准绑定。精确 CAS 把两行 qty/qty_available 各减 30，并经统一 writer 写两条专用 `TEMP_PRODUCTION_REVERSAL` 流水。新流水日期为执行日，原日报与正流水日期保持 2026-11-17；原正流水不修改。第二条流水失败会回滚两行数量和第一条负流水。

统一 writer 只接受由内部事务 WeakMap 授予的一次性、精确两条参数能力，不能凭一个字符串或布尔值开放负流水旁路。完整重试不再扣减；同一计划且上下文干净返回 ALREADY_COMPLETED。已有完成记录但后来引用污染或版本/迁移账本漂移时，返回 HOLD 并保留此前完成事实。

严格“已冲销”证明要求两批次及四条正负流水、数量/可用量、来源、维度、执行日期、计划摘要、两份批准/财务/备份追溯一致。部分、损坏或额外流水 HOLD；普通售罄零库存仍为 OPEN，不能被当作冲销。业务签名真实性仍由尚未接入的可信批准 adapter 负责。

## 4. 新引用与回放保护

WMS 入库草稿/确认、出库草稿/确认/签收、调拨、盘点、损失、缺陷路径；Generic CRUD 的实际库存引用表；标签、重打、包装接收/分级/装箱/打印/交接；药品库存及领用撤销；质检 OPEN 不合格新增路径均加入指定事件保护。历史读取与审计保留。库存路径沿用既有物理池→批次顺序，在事务中校验；纯引用路径锁定两条事件行。不能声称所有明细都在整笔事务第一条 DML 前检完，后续行被拒绝时由事务整体回滚。

生产入库回放仅在严格完整冲销证明后排除这两条误入库；普通零数量、BROKEN 或破损证据仍参与差异判断，不能自动补齐新库存。

包装保护按真实已完成 WMS header→detail 查询批次成员，明细 batch_no 使用 BTRIM，与 WMS 现有解析一致。具体误入库批次在完整冲销后禁止新增引用。**整份 DAILY 在 OPEN 时保留原流程**；存在部分/损坏 marker 时 HOLD；完整冲销后，整份 DAILY 或同时含正常与误入库批次的 header 因缺少逐输入权威数量关系而暂停整次操作，不能把其余正常等级称为“已冲销”。明确关联正常等级实际库存明细的 header 不受本事件保护误伤。

包装 API 仍缺少逐输入库存批次数量与完整库存授权模型；上述关联核验不等于补齐该授权，也不允许通过客户端标志选择 mixed header 的正常子集。涉及输出生成时，先取全部来源家舍锁，再取事件行；纯 PRINT 只取事件行，不增加家舍或物理池锁。

## 5. 字典、显示与审计

新增 TS 迁移 `1794904000000-TempProductionReversalDictSeed.ts`，仅写 sys_dict/typeorm_metadata 工具表，幂等且含 down。down 只移除本迁移拥有且未被不可变冲销流水使用的字典；已使用时拒绝撤销。冻结的两套裸 SQL 基线未修改。

日结将专用冲销展示为独立有符号净更正；常规入库/出库排除该类型，结存只加一次 correction_net_qty。新类型按业务 log_date 归日，旧类型保留原日期规则。Web zh/en/lo 增加对应名称，旧 API 无更正字段时按零显示兼容。主数据字段未新增手填。

库存台账仅对专用类型把结构化追溯备注展示为“误入库冲销 · 原入库流水 #649”等三语业务摘要。原 JSON 仍保存在数据库，不把计划哈希或执行字段当作普通用户备注；解析失败或缺少必要版本/原流水信息时明确显示“备注待核验”。其他类型的普通备注显示规则不变，此摘要不替代后端冲销证明或签核。

日蛋审计补充完整 date/house/shift 重复、未知/空白班次和 DAILY/ALL 与其他班次混用诊断。合法 AM/PM、早/晚分班保留，不自行归并未知值；这些诊断参与 HOLD，不构成迁移准入放宽。

## 6. 真实本地 schema 与测试限制

自有 PG18 容器仅绑定 127.0.0.1:44889。baseline_v2 为实际 195 条冻结 SQL、169 条历史桥接记录及 114 条真实 TS migration 安装结果，共 283 行 migration 账本。每个事件用例从该只读基线克隆独立数据库，用后仅删除本用例创建的数据库；未连接生产。

冷装确实缺少 wms_inbound_items、qa_inspections、qa_non_conformance、qa_product_inspections。冷装预检测试明确为 UNKNOWN/HOLD。正向事件用例只补 `docs/schema-snapshot.sql` 原文中的四张历史兼容表及 inbound sequence，不伪造候选 batch_no 列。QA 快照表也不代表所有现代质检端点已具备完整 schema。

旧 LabelsService 与真实冷装不齐：lbl_records.label_no 为 NOT NULL 且无默认值，code 列也不存在，还有现代写字段兼容待核验。因此不能报告“只补 label_no 就可正向通过”。旧标签普通零库存正向用例使用显式 lean legacy 模型；真实冷装事件用例证明实际 LabelsService 在保护检查处拒绝已冲销输入，未证明其普通打印能冷装成功。现代 BFF/包装 PRINT 另有真实关联与锁测试。此次不扩展修复旧标签 DDL。

## 7. 验证回执

API 候选冻结清单：`artifacts/flock-lifecycle-20261117/reversal-core-packaging-v4-frozen-snapshot.json`，1204 个文件；按每行 `path + NUL + sha256 + LF` 计算源码摘要 `1d49833a51ee91d08fe0d76bc7de0a08aa316ead326bc957a86b68f93536f615`。清单自身 SHA-256 `001e7583bee20d50bb987c4b050e3085d9f4bd91fc55c99f0c578f829f8f5921`。在该清单及 v5 验证回执的 asOf 时点，候选尚为未提交工作树；这些 JSON 中的历史状态保留原样。

当前源码已本地提交为 `S=e27ebf651caa1e6b51eb506a5210d6f9c92205c9`，父提交为 A6。协调方已逐一确认 S 的 1204 个 API committed blob 与冻结清单匹配、7 个 Web 文件与 v5 匹配。尚未推送、合并或部署；之后仅补充文档/证据的提交不改变本段 S 指代的实现源码。

| 检查 | 实际结果 | 说明 |
|---|---|---|
| 核心四套 Jest / 真实 PG | 70/70、0 skip、exit 0、12.376 秒 | reversal-core-packaging-v4.log；摘要 c9f9a590be80ea5d346d22515350915be34ea493ce193f38c504a6a6d4f6649e；破损 marker 明确断言 ConflictException 且后续 INSERT 未执行 |
| 全 API Jest | 166 suites / 2108 tests 通过；27 suites / 517 tests 跳过 | exit 0、39.857 秒；v3 与最终生产源码相同，仅 v4 对一个测试补强异常类型及无写入断言；其他历史 opt-in PG 未重跑 |
| API / Web TypeScript | 均 exit 0 | API 最终候选已验证；Web 摘要改动后重新检查 |
| API lint | 0 errors / 3190 warnings | exit 0；未降级规则或压制警告 |
| Web Jest | 较早全仓 140 files / 840 tests 通过；1 file / 4 tests 跳过 | 备注摘要改动后定向 DOM 8/8：真实台账三语摘要、坏 JSON 待核验、普通备注不变；未无谓重跑全仓 |
| Web changed / ratchet | 均 PASS，无债务增长 | 全仓仍 815 errors / 467 warnings；并非 zero-error |
| constraint / nullable unique / migration down / DML | 均 PASS | constraint 静态解析仍跳过 15 个动态 migration，未声称覆盖动态 SQL |
| scope-audit | 5 文件、28 native inputs、10 runtime dropdowns、15 shared components、0 手填主数据文本框 | 包含实际复用 FlockLifecycle.tsx；早期仅查 wrapper 的错误审计已撤回 |
| git diff --check | exit 0 | 未整体暂存不相关文件 |

旧 68 例冻结快照与独立回执保留，仅适用于旧源码。协调方已独立运行 v4：4 suites / 70 tests / 0 skip / actual exit 0，15.123 秒，1204 文件前后摘要全匹配。独立日志摘要 `5b3d89fc03cb6547d3c014b03f79e3e7353bff3a73292998fc12b8a82106ef77`，回执在 `artifacts/flock-lifecycle-supervision-20261117/reversal-packaging-v4-independent-0tama0m1/receipt.json`。另有独立 API 类型检查 exit 0；包装新逻辑的只读子代理核验没有发现实质阻塞，该源码审查不冒充独立运行。

S 的最终 Web 也已完成协调方独立运行：真实 LedgerPage/DataTable 三语 DOM 8/8、0 skip、exit 0；Web `tsc --noEmit --incremental false` exit 0；7 个文件前后摘要全匹配。原样回执副本保存为 `reversal-independent-web-v5-receipt.json`，摘要 `7bfd31b1cd1143cdb4fc06bbaed7b85f20e9d727a8ddba1428a5f3f97dd0f3cc`。这证明已列出的本地展示与类型边界，不代表全部控制器、生产业务或财务验收。

最终生产源码使用实际 `apps/api/Dockerfile` 从白名单源码构建本地镜像 `phoenix-temp-reversal-cli:owned-v3-20261118`，revision 为 `owned-uncommitted-reversal-v3-review`，不是已部署 SHA。v4 相对镜像上下文只改变一个被生产编译排除的测试文件，生产源码与最终候选一致。镜像在只读文件系统、无网络、无附加权限、phoenix 用户下运行，self-check 退出 0，未加载 AppModule，也未包含 fixture verifier/spec；apply 退出 2，明确 databaseInitialized=false；真实 Node20 Alpine 验证新加坡午夜边界通过。完整日志与摘要见独立 validation receipt。该镜像未上传，不等于完成生产发布、生产预检或生产冲销。

镜像 ID `sha256:8435950b52ad33826ddc55258b2117237eae6adff744078806c84b2863b7780e` 绑定 702 个 API 非测试源文件指纹 `7936bb1650acb19ef1204557f0f1a8b05a37d319c4ed2de2137775d082238cb7`、实际 Dockerfile 摘要及完整构建输入清单。协调方也独立以该 ID 运行 self-check/apply，通过 hook 确认两者均未初始化 DataSource、未加载 AppModule；回执位于 `reversal-image-independent-9eulbnnh/receipt.json`。这些均为 owned/local candidate 证据，最终 Git SHA 镜像仍待提交后的正式链。

最终 Web 摘要及独立复核回执汇总在 `artifacts/flock-lifecycle-20261117/reversal-implementation-validation-v5.json`。四份工具原日志含行尾空白或末尾多余空行，提交的 `.review.log` 只去掉这些空白；清单同时保留原日志路径与原 SHA-256，原始日志未改写。四份 raw log 未入 Git，仅凭提交树只能复核规范化副本；raw hash 是工作区保留原件的外部摘要，须独立持有 raw 原件才能重验，不能从提交树单独还原 raw。协调方已持工作区原件逐一确认 raw SHA 与去行尾空白/末尾多余空行后等于 review 副本。未修改 whitespace 规则；源码和 staged diff 检查均为 exit 0。

## 8. 尚未完成与执行前提

本次没有逐一真实调用所有控制器、药品撤销与全部库存变体；其余入口只完成源码核验/类型检查及现有回归覆盖，仍须按风险补充独立核验。没有生产冲销后的实际业务、打印、财务或日报验收；没有真实生产灾备恢复演练。

既有日结日期仍有后续待办：前端默认客户端本地日，服务默认查询与 POST 确认使用 UTC 日；此次新增更正按明确 log_date 分类已测，不等于旧日结确认流程全已统一为新加坡日期。同一控制器兼容 `/api/inventory/daily-close` 与 `/api/stocktake/daily-close`，不存在因旧注释所述前缀而直接推定的 404。默认/确认日期一致性及新加坡午夜的完整业务验收另行处理，此次元数据补充不修改既有源码。

实际执行仍需：用户批准具体方案及迁移路线；可信批准/财务权威 adapter 与执行契约；执行当日新鲜只读范围预检、版本和完整迁移账本绑定；受控备份与校验回执；必要业务写入围栏及正式受控迁移/发布；随后仅对两条指定批次执行并核对四条正负流水、净更正、正常等级不变及重试回执。任何 UNKNOWN、差异、缺签核或身份不符继续 HOLD，不能靠本地 fixture 权限绕过。
