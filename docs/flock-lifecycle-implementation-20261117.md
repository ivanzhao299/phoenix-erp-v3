# 鸡群生命周期方案一实施台账

批准来源：父协调会话 `01a1e72a-aa96-7ce0-8632-7b8c10abdd01` 用户已审查通过《flock-lifecycle-optimization-review-20261117.md》14节，并授权开发、验证、正常集成与现有受控部署。批准方案不再重新选型。

## 基线与工作隔离

- 日期：2026-11-17（Asia/Singapore）。独立目录 `.worktrees/flock-lifecycle-review-20261117`，分支 `codex/flock-lifecycle-review-20261117`。
- 启动时 `git fetch origin` 后 `origin/main=a7c0045b9f6d1a475b5a10710184e66d9c494aa0`，本分支P0提交 `4cf46971cc1a1a2dba5be30838eaf75369cabf9c`。
- 主目录存在其他任务修改和未合并文件；本任务不在那里切分支、暂存或恢复文件。不提交依赖链接。
- 生产库不直连，不手工执行生产DDL/DML；只使用受控CI/CD。没有运行SHA、迁移、健康和业务冒烟证据不宣称部署完成。

## 交付与当前状态

| 阶段 | 实施结果 | 当前验收状态 |
|---|---|---|
| P0 | 既有数量保护、档案不可手改余额/身份、移动死淘入口 | 已纳入候选；已纳入全API最终验证，历史实际清单待材料 |
| P1 | 不可变单据/事件/审计、有效占栏、余额投影、实际盘点接续、计划/实际日期分离 | ledger当前33项纳入全API通过（独立直接32项通过）；日期UTC/新加坡HTTP独立核验通过 |
| P2 | 正式入栏、死亡、待售及客户交付、整群转舍、盘点、冲销、关闭清舍、PC/移动与角色动作 | 浏览器最终7项、明暗PC/移动4组通过，含批准补录与计划日期重载 |
| P3 | 稳定日报/占栏来源、两路入库互斥、WMS子批/退货继承、授权追溯、照管承接、实际料水与IoT业务日、BI分母 | 生产入库25项纳入最终全API；实际WMS/授权追溯/健康转舍4项通过且独立复核 |
| P4 工程发布 | 新装基础四表补齐、迁移保护、隔离验证、普通JWT/真实角色/范围/附件、发布准备 | 完整195 SQL+113 TS、新装实际写入与批准更正、幂等升级及安全down通过；待候选提交与受控发布 |
| P4 实际试点 | 两家公司真实盘点、差异、人员签认与现场操作 | 未收到真实材料，保持未激活；不将合成测试称为实际试点 |

## 详细设计决定

1. 复用`brd_flocks`及`brd_houses`、产品/SKU、`md_egg_source_profiles`、`inv_batches`和统一库存写入器。遗传品种不决定商业分类，STANDARD不臆造壳色。
2. 新增专用生命周期单据、不可更新删除事件、占栏有效区间和余额投影。默认历史群未激活；仅经实际盘点/责任人/附件/差异回执审核的BASELINE单接续。空舍新群通过入栏单建立，不能从旧初始数反推死亡。
3. 单据状态与生长状态分开，单据内容创建后保持固定；更正取消未过账单并新建，已过账经反向事件。来源幂等键唯一，同内容返回原单，不同内容冲突。单据版本和余额版本分别校验。
4. 同事务先按排序鸡舍共享advisory锁，再锁单据/群余额及事件/占栏/投影；与日报使用相同鸡舍锁，防止日记和生命周期互扣。未来日期不能过账。
5. 一舍一有效群，只支持同公司整群转入空舍。容量、负余额、未清舍、同舍同日换群、未知历史全部显式拒绝。淘汰转待售位置单独计数，销售核销不扣原群。
6. `elimination_date`历史值保留待核实；新计划写`planned_elimination_date`，实际结束以事件与占栏为准。不把未知旧日期批量当事实。
7. 代码发布与业务激活分开验收。没有真实两公司盘点及签认时只能保持受控未激活，不伪造试点、来源映射或数据签字。

## 最终本地验证证据（候选发布前快照）

证据目录 `artifacts/flock-lifecycle-20261117/`。PG仅自行创建的本机PostgreSQL18容器 `phoenix-flock-ledger-20261117`，127.0.0.1:44833；独立父协调使用另一容器及端口。生产未直连。测试固定业务时钟，所有业务SQL/事务仍在真实PG执行；没有生产时间开关。held浏览器fixture仅冻结生命周期SQL业务时钟，保持认证墙钟一致，不承载普通日报API。

| 检查 | 最终真实结果 | 证据/边界 |
|---|---|---|
| API/Web类型检查及构建 | 全部退出0 | typecheck.log、api-typecheck-final.log、api-build.log、web-build.log；父协调另做无缓存API/Web类型检查 |
| API完整测试 | 168套、2129通过；22套433跳过 | ci-fix-api-tests.log，apps/api目录运行；跳过不计通过 |
| Web完整测试 | 139套、835通过；1套4跳过 | ci-fix-web-tests.log |
| API lint | 0错误；警告见日志 | api-lint.log，未降低规则 |
| Web changed/全仓ratchet | 均退出0、无债务增长 | web-lint-changed.log：62历史错误/28警告；web-lint-ratchet.log：815历史错误/467警告。新增文件零错误，未修改baseline |
| 事件账、期间、并发、幂等、回滚、关闭、批准更正/补录、未知值 | 当前33项纳入最终全API通过 | 直接ledger-pg.log为前一轮32项；父协调32项独立通过。最后新增旧余额NULL保护用例纳入全API |
| 实际WMS正常+破损签收、来源继承、失败整体回滚、来源授权与真实健康转舍 | 4项通过并独立复跑 | downstream-pg.log；真实服务发运/签收/免疫/用药/转舍/休药阻断。未把fixture缺失的标签/销售财务表称为端到端通过 |
| 实际生产入库与包装批次写入并发 | 25项纳入最终全API通过 | production-chain-pg.log及api-full-test.log；一条路径获胜、另一条原子拒绝，无双写死锁 |
| 真实JWT/DB角色/DataScope/上传PDF/独立审核/过账/预览 | UTC及Asia/Singapore各5项通过 | lifecycle-http-utc.log、lifecycle-http-sg.log；跨公司、同公司他场、空授权、伪造/失效/其他上传人附件拒绝 |
| 真实scope-audit | 通过 | scope-audit.json：原始input逐一检查、动作守卫及实际HTTP/PG越权证据 |
| PC/移动真实流程 | 9项通过 | browser/receipt.json，含批准补录、NULL料水、计划日期保存重载；browser/appearance.json：明暗PC/移动4组，文字对比度>=4.5、无横向溢出 |
| 约束/nullable unique/迁移DML/down门禁 | 退出0 | constraint-drift.log、nullable-in-unique.log、migration-dml.log、migration-down.log；DDL触发器静态误报豁免有明确说明，无新增业务数据DML |
| 旧库升级 | 独立清洁非空/重复HOLD/索引冲突HOLD通过 | 父协调supervision证据；不自动清业务数据 |
| 完整新装/实际写入/幂等升级/安全回退 | 195冻结SQL+113 TS通过 | migration-compatibility.log；真实clean/admit/重复DAILY/mortality=97及批准更正，不只验证链可运行 |

当前候选PR #574已创建；尚未完成：最终CI/正常合并/受控部署与真实运行SHA、迁移/健康/业务冒烟取证；真实两公司业务激活。未连接生产或获得真实盘点签认，不宣称实际试点完成。通用标签/销售开单端到端未在新增PG fixture内运行；原销售/FIFO单元回归纳入完整API测试。

## 历史差异与业务激活门槛

当前没有收到生产脱敏副本或实际盘点签认；禁止猜测历史数量和品种。需只读诊断回执：多在栏、归属冲突、非零退役、未知日期/状态/品种、非整数余额、班次歧义、来源档案重叠/缺失、已入库/包装/销售/旧FARM_IN及待补账差异。每个试点保存基线日、实盘、责任人、证据、差异单、复核人和激活结果。

## 发布门槛与回退

- 发布前重新fetch核对main，核对并发发布任务和CI；不得强推或绕过平台审批。
- 既有deploy.yml限定main/production环境门禁；手动触发需approve_production。本次按正式inspect审计GO、新鲜备份、受控8迁移回执、API-only重锚定F/R/T、同T Web-only顺序执行；不能称一次full。独立migration apply的evidence目录不代表数据库备份，执行前须实际备份及恢复性验证。
- 发布后收集真实运行SHA、migration状态、健康、关键冒烟及受控未激活状态。平台实际审批/凭据缺失如实阻塞。
- 已生成新事件后不得回旧代码继续手改数量；停写后按受控回退方案处理，优先兼容前进修复。结构down仅在确认无新事实或经备份治理后执行。

## 日报确认、更正与关闭的最终规则

1. 已接续群首次DAILY提交即确认实际日报。普通POST upsert及PUT只接受同值幂等重试，不能改分级、料水、备注、原因、操作人、项目或其他持久化业务列；占栏由服务器唯一解析，客户端时间戳丢弃。
2. 普通跨月首次补录拒绝。REPORT_CORRECTION保存稳定原日报/原占栏及原值哈希；缺日报用ABSENT快照，要求该群舍日占栏可证明。独立审核、余额版本/原值双复核；跨月需已过账HISTORY_AUTH绑定该单来源、群舍及原日期。
3. 更正只改实际分级、料水及备注，不改死亡、淘汰、身份和存栏。NULL实际料水保持未知，明确输入0才记录真实零。已有EXACT来源按历史累计原始投入/等级检查；RELATED_INPUT或INHERITED有下游关系时禁止猜测分级更正，安全备注/料水更正保留。
4. CLOSE方式必填：真实同群/舍/DAILY/占栏的关闭日报，或真实零产蛋签认及证据。关闭日任何旧班次、重复/身份不符日报须先核对；零签认不能与分级或原汇总非零冲突。
5. 关闭后普通新增/修改保持只读，同值重试不写；通过批准的更正/补录可修正历史，不重开群或恢复在栏。若更正原零产蛋声明，单据自动保存原CLOSE ID/哈希/声明快照及差异回执，原CLOSE详情反向列出已批准更正，避免两份声明无关联并存。

## 新装与兼容性结论

旧195冻结SQL+111 TS日志仅证明迁移链能执行，历史基础养殖四表并未由链完整创建，不能称功能新装通过。新增1794899000000-FlockBaseSchema依据稳定身份/唯一意图和真实运行字段补齐结构，既有列/约束不覆盖、缺值仍NULL。工具元数据记录确实新增对象，脏身份/重复/同名索引冲突HOLD。原112 TS已完成新装实际服务冒烟及安全down；新增1794903000000后已完成113 TS重跑与批准更正实际写入。

## 对批准报告14节的逐项落实

| 批准章节 | 落实/边界 |
|---|---|
| 1 结论建议 | 固定方案一，一舍一有效在栏群 |
| 2 审查基线 | 隔离分支、真实本地PG，不连接生产 |
| 3 分析纠正 | 商业STANDARD/VARIANT与遗传品种分离，不造普通壳色 |
| 4 P0问题 | 既有余额增量保护及移动入口纳入发布，补事件账统一权威 |
| 5 遗留问题 | 计划日期拆分、旧群不猜历史、退役更正通过批准单、旧未分级库存HOLD核对 |
| 6 方案排序 | 不重新选型；不做混群、拆并群、跨公司调鸡 |
| 7 目标模型 | 不可变单据/事件/占栏/余额/待售位置、锁与版本、清舍/换群 |
| 8 下游改造 | 日报→两路入库互斥→WMS/FIFO/追溯；健康承接、实际耗用、IoT日期、真实羽日BI |
| 9 页面权限 | 共用PC/移动操作页、独立角色动作、真实DataScope及受控附件 |
| 10 历史接续 | 只读诊断+实际盘点签认；目前缺业务材料，保持未激活 |
| 11 验收清单 | 对应真实PG/HTTP/浏览器/迁移/回滚与发布证据逐项完成；不把跳过称通过 |
| 12 验证边界 | 见最终本地证据表；受控发布验证待补 |
| 13 代码证据 | 新迁移、farm生命周期/来源/日报、库存/追溯/健康/BI及PC移动页面为最终修改清单 |
| 14 行业与审定 | 已批准一舍一群/整群调动等边界；实际两公司现场签认须真实业务回执 |

此表为候选提交前快照，发布记录待受控工作流完成后补充。最终发布状态以受控工作流及真实运行SHA/迁移/健康/业务冒烟证据更新，不引用旧main成功发布替代本功能发布。


## PR #574 CI收口（远端复验中）

- 三语各补146项，保持现有运行时翻译方式；14823键平齐，7814引用命中，3915条硬编码可见文案覆盖，未覆盖/翻译质量错误均0。
- 附件仅接受PDF/JPEG/PNG/WebP，禁止HTML及脚本。PDF由授权Blob安全下载（严格MIME/文件名），有效PDF精确字节与安全文件名实测通过，pypdf strict解析1页及证据文字通过；图片页面内预览，真实480×180图片已解码显示，关闭后blob不可再读。9项PC/移动流程及4主题/视口外观实测通过。
- 上传归属复用OrgOwnershipService.resolveHouseIdentity持久归属入口（允许停用设施的受控历史证据，业务过账eligibility另判）；无稳定来源的旧追溯不再将今日农场归属当历史事实。旧主表跨模块引用回到7（24处，基线33/7），没有提高baseline。
- 新装补现有农场表单实际使用的location/manager/houses/capacity nullable列；既有列不覆盖、不填历史业务值。195冻结SQL+113 TS完整新装/真实服务/幂等/安全down重跑通过。
- 历史迁移演练显式登记9条已审功能迁移（4库存+5本方案），保留96历史类逐项deepEqual及唯一校验。真实PG18演练通过。
- Chanjet生产代码不变：以可控时钟证明取消中间排队者不能缩短间隔，真实HTTP/PG仍验证发送顺序、超时无发送及receipt；41项通过。
- 旧养殖回归只在CI=true、loopback API/数据库及精确数据库fixture归属标记下创建合成未接续历史群。禁止重新开放业务CRUD入栏；A4按真实第二群核对流水，数量临时隐藏通过EXIT恢复且保留FK身份。8项离线setup测试及真实FarmController/PG18全部24项回归通过。该轻量回归未覆盖认证，真实JWT/角色/DataScope由独立HTTP专项验证（当前5项，含停用主数据历史证据及跨范围拒绝）。
- W5通过；冻结与安全路径需独立审查后按现有PR标签协议复验，未改变门禁规则。scheduler预检只增加来源/原因固定枚举诊断，原HOLD/判定/稳定读取/符号链接及容量保护保留；诊断不是修复或放行，需新CI事实定位。
- 远端旧head曾在Next Google Inter字体加载以及维护scheduler预检失败。字体本地完整构建复验成功；两者仍须最终head远端通过，不能以“既有问题”当作PASS。未合并、未部署、未打发布tag。

最终CI修复源码：`b27b6563914a6573725434ddc4b8c2b060008a2e`；apps/scripts/.github共104个改动路径源指纹 `c55d59bf9a9309684471d9988af8537bb38f6f6cad94f00ad58fddae95fd2c91`。最终日志哈希与可复现算法见validation-receipt.json；远端CI、合并和实际部署仍待完成。

更正取证：a383的Web类型通过表述撤回，新增下载测试的this缺显式类型（TS2683）已在`96bc792069461ecf5c351aa416af2c871f5e5b8a`修复。本地先前读取的是未完成输出；本轮已等待实际exit 0，Web无缓存类型检查及835项Web测试通过。该修复不改运行时行为，需按新head重新绑定独立边界审查。


## 第二轮远端阻塞收口（待新head远端确认）

- 新装兼容补齐仍被真实fixture/旧通用回执使用的farm.store_code、flock.store_code，均nullable、不填历史值；不复活house退休的company/site/store列。195冻结SQL+113 TS及实际服务/correction/down重跑通过，真实E2E seed通过。
- 包装回归沿用服务器生成HSE编码。GenericCrudController原回执丢弃服务返回的houseCode，现仅成功brd_houses响应增加该字符串字段，既有guard/scope/写策略及其他表响应保留。24项controller契约及实际45项包装回归通过；认证另由HTTP专项验证。回归脚本限定已标记隔离CI DB及loopback API，失败前置检查/生成码校验共6项离线测试通过；历史养殖setup8项继续通过。
- Google Inter loader:122在远端再次失败。现从本地成功build保存相同7个WOFF2字节、全部42条原font-face/Unicode范围/6档权重，保留既有globals字体栈与Latin preload，附官方OFL与来源/hash；移除构建期Google fetch，不升级依赖。禁用代理可用性的完整build exit0，PC/移动明暗4组证实Inter实际loaded、只用本地资源、无字体404，浏览器9项通过。
- 真实CI诊断已确证PG16/18均为SYSTEMD_FRAGMENT/SYMLINK，不能据此认定合法alias。第二层只补loadState/直接target类别/type/单跳及稳定性固定枚举，白名单复制，异常不覆盖原HOLD。没有放宽任何symlink接受条件；路径类别并不证明祖先目录可信或安全读取。15项诊断测试通过，等待新远端事实再审兼容方案。
- 维护business recorder的CI启动docker run超5秒；仅该测试启动调用改30秒，其余原5秒/SQL及安全判断不变。真实独立PG16/18 recorder 13项通过，生产代码不变。

本轮源码`fbc7c52fb730caa2b8205bfdf5e7f5868605760a`及100路径指纹`6490390418031aaf114a4edc0245c927b8767cf8d17bae560795c458506f3697`已绑定36份日志哈希；所列验证命令实际完成后确认exit0；browser待命host按SIGUSR2停止（exit140），不计为验证通过。原OFL许可逐字保留，含上游既有一处行末空格。当前仍待独立新head审查及新远端CI/第二层诊断结果，未合并、未部署、未打tag。


## 最后两类远端阻塞与本批边界

1fcc远端正式CI/CD、AI Build、迁移/实体门禁、system/breeding/packaging/wms/finance、Web/Admission与长Legacy实ERP均通过。Playwright真实运行77项，唯一失败是旧测试要求档案页直接改存栏。已仅更新测试：当前150保持readonly，PUT不含current_qty/initial_qty，真实可编辑计划周数80→90并跨Lao/中文保留最新显示；整份hydrator文件18项及无缓存Web types实际exit0，生产页未改。

PG16/18第一切换预检第二层事实一致：SYSTEMD_FRAGMENT/SYMLINK、LOADED、OTHER、REGULAR、SINGLE、STABLE，仍HOLD且owned未创建。未将OTHER视为合法或放宽reader。为定位真实宿主公开配置链接，本批增加仅失败后运行的CI locator：固定systemctl只取Id/LoadState/FragmentPath，限定真实hosted full-first-switch及原root600 host-intent/SHA；32条/32KiB、严格unit/普通绝对路径、包名筛选、无内容/命令/环境/原stderr。stdout仅CI诊断，不进入生产receipt/pin，无法据多个观察候选认定原失败对象；原native_result始终保留。模板与实例混合、越界/不安全元数据、scope/intent/本地调用拒绝、变更/读取失败等9项本地测试通过，并接入现有pure契约CI。

本批源码`b27b6563914a6573725434ddc4b8c2b060008a2e`，104路径指纹`c55d59bf9a9309684471d9988af8537bb38f6f6cad94f00ad58fddae95fd2c91`、40份日志绑定；独立hydrator Chromium18/18和CI-only locator9/9通过，host停止140单独披露不计验证通过。仍未合并/部署/tag。

## 实际发布前置核查与精确vendor候选（尚未发布）

上文“不连接生产”描述的是早期本地验证阶段。本轮仅通过既有production工作流执行正式只读诊断，没有直接连接生产数据库或执行apply。

- identity run `44099756016` / job `134096289689`：工作区main/clean，实际checkout/API/Web均`cb42966edfa717b0984936951143d84973c1a263`，配置floor为`101916efbcd60956c9f8321d4859931049f966c3`。预期main为`a7c0045b9f6d1a475b5a10710184e66d9c494aa0`，因此以`HEAD_MISMATCH`退出34；该failure不表示当前功能已发布。
- controlled migration inspect run `44099755930` / job `134096289055`成功，只读ledger hash `d29182e52966beed98d4f38f85c2e4e9add4edf9b732e64ce8dbefac0e1a2397`。当前main已有3条待迁移：InvBatchesIntegrityConstraints、InvLedgerChangeTypeDictSeed、InvEggCostingColumns；本方案另5条待合并后核对。首条NOT VALID约束不扫描旧行，dict为工具表，cost_change历史仍NULL；本方案不修写历史日报/库存数据。正式apply仍要求既有audit GO，不能因为DDL不涉及差异就跳过。
- 只读egg preflight run `44100859989` / job `134100177993`成功，结果仍HOLD：重复日报/重复来源/不平衡生产批次均0，超额分级组2。均为2026-11-17、HOUSE_MS_01、COMP-LAO-AGRI；GRADE_4的batch413/EGG-20261117-00005与ledger649、GRADE_5的batch415/EGG-20261117-00007与ledger651均30枚、可用30，日报按当前JSON聚合额度0。共同source/ref为`DAILY-2026-11-17-HOUSE_MS_01-4c5f2ca`。这只证明审计不一致，不能据总蛋数、物料或库存倒推应补GRADE_4/5各30。`PREFLIGHT=REPAIR_ELIGIBLE`是脚本分类，不是修数审批。
- 原始日报JSON及历史变更尚未核实。当前`updated_at`只表示当前最后更新时间；OperationLogInterceptor规则不覆盖farm/generic daily，旧AuditLogInterceptor数据库保存被注释，不能宣称已有完整日报before-history。

远端`6393cf1ff`的Playwright77项和其余工作流均已通过，仅两项PG16/18 first-switch仍因原scheduler HOLD失败。CI-only locator在两个真实hosted runner独立观察到9个dracut-core单跳regular稳定目标；initqueue明确属于77initqueue，其余8项属于77dracut-systemd。这是已核对的九精确映射，不代表任意OTHER或symlink合法。

候选提交`0b391a6956ad3323e7da85ef94630a3d47fde458`仅调整root reader、可信ACL读取上限及新增vendor测试：

- 九个精确fragment路径必须具有准确Id、loaded状态和SYSTEMD_FRAGMENT来源；缺失、普通文件替换、错误Id/来源/状态或mask均HOLD。其它cron/drop-in/链接仍沿原拒绝规则。
- 链接原文可为绝对或相对，解析后必须精确匹配该项唯一目标；保留原文与源link身份。原文途经的目录（含`..`前目录）、规范目标所有祖先均必须为root所有实际目录，无symlink、特殊位、组/其他写位及扩展ACL；regular目标也须满足同样所有权/模式/ACL要求。Linux symlink自身不支持POSIX ACL，实际本机读取返回ENOTSUP，因此不把它当regular目标检查，也不将目标ACL不可读当无ACL。
- 目标必须单跳regular、nlink1、最多1MiB；O_NOFOLLOW/O_NONBLOCK打开，fstat必须与lstat同一身份，只读取已知长度加1字节哨兵。读取前后复核fd/路径/源link原文与身份/目录及ACL，所有路径关闭fd。身份pin包括精确映射、原文、link/target/祖先身份和内容hash，不能仅相同字节就替代对象。
- 独立只读reviewer指出并复核关闭了regular、ENOENT及mask降级；Node20针对性73项全部通过。新增20项包含九映射、相对路径、恶意路径/ACL/ownership/FIFO/链/超限/替换/关闭，以及使用原capture函数体隔离IO的真实接线回归。该隔离接线测试不能替代真实root/systemd PG16/18远端first-switch，仍待新head实际复验。

正式发布仍受未通过的实际CI、F/R配置与运行时分离前置、audit HOLD、正常合并及真实部署证据约束；本轮没有执行迁移apply、生产修数、业务激活或发布tag。

本批已提交源`9d1a5186d1069ed01dd869841aaa3893a8aa7348`（dracut + 有界只读SQL），107个apps/scripts/.github路径指纹`67c70c7e4c4fd03ca5333b73f9ef739540f6e6b402292a17e5e7dbb85e089ae2`，44份日志哈希。指纹只取该提交Git blobs，协调者仍在工作树内开发的F/R协议和测试完全排除，不能据本回执宣称全工作树clean或该协议已通过验证。只读SQL在owned PG18验证语法/当前JSON保真/异舍排除通过，生产原JSON取证仍待既有正式readonly workflow实际执行。

正式readonly run `44104170804` / audit job `134112002841`已在精确候选head `e23809a5b96260a673499b7f16a1f56bcfd931b0`执行成功。SQL明确回显session+transaction均READ ONLY：唯一日报id106、DAILY、FK-MUXSEJUAGOI、LPH_MENGSAI、COMP-LAO-AGRI，created_at=2026-11-17T01:02:51.503976、updated_at=NULL。原eggs_by_grade为DIRTY540、BROKEN230、GRADE_0 540、GRADE_1 11880、GRADE_2 32760、GRADE_3 1980，总和47930与eggs_produced47930一致，没有GRADE_4/5；两批各30可用仍在。缺少历史before-image，不能据入库倒填分级或自动批准冲销。

本次执行范围有一项已披露偏差：虽然dispatch显式传HTTP空值，GitHub将其回填为默认sales-order-lifecycle.http.json。实际运行了默认HTTP准备（PGOPTIONS只读的Nest context、查询登录信息并在内存生成短期token），两项process-log检查均NO_SAMPLE/no-data-sample，未发送实际HTTP请求。实际cb源码login方法没有DML/保存/last_login写入；helper最后的PRODUCTION_BUSINESS_WRITES=0是其marker，不是独立完整DB写追踪。该run不能表述为“仅SQL”；不再为此重复调生产查询。下一必要候选批次增加精确NONE哨兵，经校验归一为空，避免空字段默认回填；既有默认和其它路径校验不变。

候选e238远端21项checks为SUCCESS，另3项构建/部署按PR事件条件SKIPPED，零pending/failed；跳过不计为通过，也不表示已发布。真实host PG16 job134111476455、PG18 job134111476133（run44104051532）均FULL_FACTORY_COMPLETED/PASS，lease释放及原participants关闭已验证；实际226旧应用依旧EXPECTED_HOLD且protectedStateUnchanged=true，不把合成aligned旧应用成功称为exactLegacySuccess。CI实际checkout为PR merge6d328cde6d207db8e47354fd46f5c8fbdce5c1f8，已通过GitHub Git对象独立核验其tree与e238同为11c850e0e0ab59aeca5ba9b2aed98522d8f3264f。fixture内target为合成SHA，Web为owned HTTP health peer；productionAuthority/Receipt均false，不能当作生产发布回执。精确证据及固定receipt摘要见e238-ci-observation.json。此轮dracut真实接受链已闭合；后续F/R协议代码若形成新source仍须相应验证与新head审查，生产audit HOLD未消失。

## 后续发布安全增量与业务审查边界

用户已确认两批额外60枚为测试或误录，并要求准备冲销方案供审查；该事实不是实际冲销授权。原日报47930及原分级不变，不执行apply/repair或库存写入，也不扩大到其它等级、整组source或未知差异。

独立复核发现旧audit的`legacy_source NOT LIKE retired`会排除NULL来源，旧unbalanced=0只是该旧谓词的计数，不是所有现代生产批次平衡证明。两目标批次各qty30/唯一入库流水+30已单独取证。最小COALESCE修复仅扩大正确只读检查分母，不修数据、不解除overpost HOLD；真实PG18以原SQL全文验证了平衡/不平衡NULL、retired排除和已消耗批次口径。

controlled-pending-migration-apply在实际DDL前补入固定run-attempt命名备份：保留既有ledger CAS与audit GO、至少2GiB空间、私有700目录/600文件、custom dump非空、TOC、无`-d`的`pg_restore --file=/dev/null`全归档解析及SHA复核。目录已存在即拒绝覆盖，所有旧备份保留。全归档可解析不等于在生产还原数据库，也没有执行实际生产备份或DDL。

该增量实际自有PG16/18验证有效dump、权限、TOC、全parse及SHA，并验证空dump、TOC可读但数据截断、低空间、重复run与旧备份保留；与实际PG18 NULL审计合并7项、无跳过、exit0。原workflow YAML经已有js-yaml解析、真实SSH正文bash-n通过。首次fixture缺POSTGRES_USER/DB造成role root错误未计通过，随后补齐明确自有环境并实际重跑；没有安装或升级依赖。新增源码及其最终远端CI仍待独立审查后绑定新提交。

独立审查随后拒绝仅靠700子目录的备份实现：不可信的上级目录仍可替换路径。最终增量复用CONTRACT及inspectTrustedDirectory，默认真实verifyContext验证维护锁/可信上下文，先验证已有私有STAGE，再检查/opt；仅缺失的parent由exclusive mkdir0700创建，已有symlink/非root/可写/ACL未知/额外挂载均HOLD，不自动chmod修复。新run目录独占创建，wx600记录原祖先/run/STAGE pins；dump前、dump后及实际DDL紧前均须与原pins一致。独立挂载若不在既有CONTRACT允许集合内，必须另行审查，不能跳过。

修订后的路径/备份/NULL检查本地13/13、无跳过、exit0，独立复跑亦13/13、exit0；另独立NULL审计4/4。路径检查用实际trusted utility与明确的owned元数据模型，并实测非root CLI拒绝；真实PG16/18负责归档读写和完整parse，未将其path adapter冒充生产root/ext4全流程。独立复跑曾出现PG16容器初始化临时Unix server就绪竞态，实际FAIL已保留；ready探针改为容器内TCP 127.0.0.1，只有最终server开放TCP后才通过，未添加盲sleep或重试业务SQL。2GiB只是最小空间下限，不是归档容量保证；全parse不是实际数据库恢复。

源码060的HEAD绑定扩展检查已实际246项中237通过、9 opt-in跳过、0失败，真实隔离PG16/18为9/9通过；本执行会话在该提交上合并scheduler/只读输入等76/76通过。扩充的精确只读SQL仅准备字典、两批维度/成本存在性、原流水白名单、同来源grade汇总及change_type列/CHECK元数据，已在owned PG18 READ ONLY验证，尚未把本地结果当真实生产枚举。新候选必须独立绑定后，才使用明确NONE做正式只读取证，再确定受控WMS冲销合同；实际冲销、迁移apply和生产部署均未执行。

本批源码`d947bf0b4591e830dd46c021a9a9800ad5c4b11f`，129个apps/scripts/.github路径指纹`56040bba700f44ba13361554624ece580243c58b3ee9999608d9c345c5851dae`，57份日志hash；仅已提交Git blobs，冲销执行包尚未实现，实际类型/维度仍待新候选正式只读证据。协议060的13组件字节与本候选相同，新backup/NULL实际13/13及独立13/13、候选scheduler/readonly76/76已核验；新head远端CI仍待执行，不能引用e238结果代替。
