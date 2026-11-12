# G202 迁移回执与包装来源接线修复（2026-11-12）

## 业务边界

用户已明确实际销售尚未开始，报价允许留空，先切换生产/库存治理。新 managed SKU 先库存授权、销售关闭，不填零价、不推测单位，不因本修复提前启用销售。孟赛普通蛋保持原目录和 NULL 品种，东鹏红/粉按已批准来源配置；0号重量继续待核实。

## 实际发现与修复

1. 受控 schema apply 已应用 `AddProductionManagementMvpSchema` 和 `EggSourceProfiles`。随后记录 receipts 时遇到先前 `SkuVarietyOrgScope` 成功回执而停止；原生产回执未被覆盖。只读复核 pending 为空、审计 GO，不代表 runtime 已切换。
2. 旧 receipt 的 sourceSha 和 ledger 前后摘要天然不同于后续发布，不能仅要求整条 JSON 或 sourceSha 相等。现在复用必须同时通过原 registry validator、不可变迁移身份/sourceBlob 比对、真实 Git commit/blob 校验、旧源码到已审目标的祖先证明，以及当前已应用 ledger 的名称/时间戳证明。兼容则原文件不动；畸形 JSON、权限/路径错误、符号链接及不可验证证据均 HOLD，只有真正 ENOENT 才视为缺失。
3. 包装提交漏传来源上下文是实际业务缺陷，不是把正向测试放宽即可解决的问题。提交在同一事务解析持久 shift/grading/source links、source profile 并锁定后，才解析 SKU，保存验证过的 varietyCode（包括 NULL）。
4. ready-combinations 对齐实际前端 `gradingCodes` 逗号列表，并兼容原单数查询；缺上下文返回空，不返回全集团目录。重复/冲突/数组/非法ID拒绝；请求身份/公司/场站/班次模式与选中来源验证在候选查询前完成。
5. 本地 protection 必须运行在完整 schema 的专属 `packaging_history_test`，不能往不完整的 `packaging_test.public` 逐个补表。保护测试仍严格 `LIKE public` 克隆，未增加任意 fallback DDL。
6. main 免疫用药 MVP 合并同时丢失了药物 cron 背景入场 gate、日报 breeding 专属 scope 路由和无身份 fail-closed 分支。已恢复原安全边界：保留新 medication-records 状态转换，但 cron 仍经 `BackgroundTaskService.runScheduled`；日报不能用一般 company 投影扩大 SITE 权限。
7. 药品入库日期契约测试改为允许 SQL 参数数组的换行，并额外确认归一化日期及 `$9::date`；没有改库存日期语义。
8. 浏览器停药预警测试改为使用新权威 `/api/farm/medication-records/withdrawals` 与其 joined house_name/withdraw_until/medication_code 字段，保留鸡舍编码/历史名称、不重复显示的原断言，不恢复退役 CRUD 来源。

## 验证

- Node20.20.2，显式 NODE_ENV=test。
- 真实临时 Git 证明、registry/schema receipt：15/15；含不可变旧文件、损坏证据、缺 ledger、错误 ancestry/source/path 的拒绝。
- readiness 真 PG18：88/88（原74保持，新增14）。
- 完整 schema protection 真 PG18：13/13。
- 完整 schema history 真 PG18：51/51。
- 完整 API 类型检查无错误；149 suites/1961 tests 通过，23 suites/452 tests 按原环境 gate 跳过，不把跳过当 PG 通过。
- 约束漂移0新增、WMS DataScope、主数据 legacy-growth、i18n 14654三语keys/7820引用通过。
- 本机 Chromium 缺 libnspr4，尚不能作为本地浏览器通过证据；真实浏览器结果必须收集本提交的 CI Playwright 后再判定。没有安装宿主机系统包或用静态源码断言冒充浏览器结果。
- Web 类型检查无错误，137 files/826 tests 通过，1 file/4 tests 按原 gate 跳过；不包含尚待 CI 的浏览器结果。
- 全部CI结果以本提交后的实际日志为准，pending不能算通过。

## 发布顺序与禁止项

PR533所有实际门禁通过后合并；按精确新main重新只读检查/记录迁移回执。仅有旧成功receipt且源码可验证相同才复用，不删除/覆盖历史证据。再取新目标的来源启用只读计划，检查 `stock=true / sale=false`、日期/组织绑定及CAS；在受控后台fence内切API、应用来源/库存主数据并核验，最后部署同revision Web并核验。不得再次在回执未完成前启动floor重锚，不以健康HTTP200替代真实OCI版本和业务授权后置证据。
