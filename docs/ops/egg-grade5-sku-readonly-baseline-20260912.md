# EGG Grade 5 SKU 只读基线核查（2026-09-12）

## 范围与安全边界
本报告定义并记录 SQL-only production readonly audit。SQL 文件全程 `BEGIN TRANSACTION READ ONLY`、statement/lock timeout，并以 `ROLLBACK` 收尾；无 DDL/DML/apply/重试，不读取或输出生产凭证。执行通道复用 `scripts/ops/run-production-readonly-audit.sh` 与既有 SSH transport。

## 核查 SQL 与可复现信息
- SQL：`scripts/ops/readonly-audits/egg-grade5-sku-readonly-baseline-20260912.sql`
- SQL SHA-256：`64dff85aa36c70556bab07f041381ecc69ea136716f02cc24eb88a879a2a0f76`
- checkout revision：`cc36445e50c0839f0205906b275ff6b6bc2549d2`
- 运行结果：本工作区现有 transport 记录 `transport_rc=1 ssh_rc=255`，因此本轮没有可宣称的生产结果；不可将 84/26 差异当作已验证事实。

## 必须采集的证据（SQL 输出章节）
1. 总数及 `product_code/grade_code/spec_code/status` 分布；总数应由分布求和核对。
2. canonical `(EGG,GRADE_5,PKG_PACK_SPEC_3)` 计数。
3. `PRD-EGG-5 + GRADE_5` 逐行（预期核对 7 条，但需生产输出证明）。
4. canonical 之外 SKU 的完整分组及 `sku_code` 列表。
5. product_skus information_schema 约束、pg_indexes 索引、pg_stat_user_tables 统计。
6. database/user/server/search_path 与 transaction timestamp；pg_stat_activity 只读并发窗口。

## 身份、部署与历史对照
生产执行时应在受控 runner 记录数据库/容器 identity、API/Web image git revision，并与 checkout revision 对账；同时将 SQL 输出与本地/历史 preflight artifact 做对象集合及计数基线 diff。当前历史 transport 失败，故 identity、并发、84 构成、canonical 数、7 行和对象差异均为 **未证实**。

## 结论
在 SSH 失败得到修复并产生带 SHA 的只读快照前，不能解释生产 84 与设计 26 的差异，也不能创建/合并受控 PR。任何 apply 或写操作均明确禁止。
