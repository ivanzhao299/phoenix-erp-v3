# Packaging SKU Workflow Authority Audit — 2026-09-11（补证修订）

## 结论（证据边界）
本次只修订报告；未执行 workflow、生产 SQL/API、apply/rollback、库存/流水写入、提交/推送或部署。生产证据均为既有 run/artifact，须区分快照时间与当前状态。不能由批次前缀推导产品身份，也不能依赖此前 EGG 裁定。

**最强直接证据是 2026-09-10 只读快照（run 34463062878，SHA `63f68ff49f38b1b3cfd31957b453752f0cc59718`）：** `mst_products` 共10条、ACTIVE 10条，其中鸡蛋根产品是 `product_code=EGG`；`product_master` 0条；`PRD-EGG-5` 与 `PRD-EGG-GRADE_5` 精确匹配均为0。与此同时 `product_grades` 有 ACTIVE `GRADE_5`（5号蛋，可售/可存，30–40g），`product_skus` 有7条 ACTIVE、均为 `product_code=PRD-EGG-5, grade_code=GRADE_5`，规格为 LOOSE/TRAY30/TRAY36/BOX360/BOX720/GIFT12/GIFT24，`GIFT*` 数量为0。故当前可审计关系是：主产品表的已证实根为 EGG；GRADE5 SKU 的 `product_code=PRD-EGG-5` 是历史/运行时变体引用，且与 `mst_products` 不同源，不能擅自合并或创建。`PKG_PACK_SPEC_3` 在快照中 ACTIVE、30枚/盒；GRADE5 无该规格 SKU。

`EGG-YYYYMMDD-*` 只能作为 `batch_no`/批次标识，绝不是 `product_code` 或 `sku_code`。`product_code`、`grade_code`、`spec_code`、`sku_code` 必须分别按四表真实行及约束确认。

## GitHub、workflow 与运行证据
- [PR229](https://github.com/ivanzhao299/phoenix-erp-v3/pull/229)：OPEN，head SHA `3bea180b9c1e359c4bc6a04ec3dfe2c7499e9ded`；相关 CI runs：34547397621/598/604/595/666/843，均 success；未合并。
- [PR230](https://github.com/ivanzhao299/phoenix-erp-v3/pull/230)：MERGED，merge commit `d49383cdfdd112246559e08e7cde1bd6a42c28f3`，时间 2026-09-11 02:23:56Z；相关 deploy/build runs 34554900364、34554465555/562/567/592 success。
- `spec-sku-backfill-production-rollout.yml` 逐行核对：仅 dispatch；target 只有 `master-data|batches`，phase 只有 `preflight|apply|verify`（7–19）；preflight/verify 在 `PGOPTIONS=default_transaction_read_only=on` 下执行 checkout SHA 对应 SQL（37–59、101–123）；但 apply master-data 调 admin token 并 POST（61–76），batches 执行无 RO 的 psql（78–99），因此不是双层只读入口。
- `spec-sku-master-data-production-apply.mjs:29–35,36–55,57–78,80–93`：固定 `PKG_PACK_SPEC_3`；固定循环 GRADE_1/2，product_code 为 `PRD-EGG-${grade}`；POST 创建 spec/SKU、PUT 更新 sys_dict。它不能覆盖 GRADE5，且会写主数据。
- 既有 run [34556207470](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34556207470)：SHA `d49383c`，success，无 artifact；日志证明只读 preflight 输出固定两条 SKU `SKU-0001/0002` 与 GRADE1/2，不能证明当前 GRADE5。
- 既有 artifact [34463062878](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34463062878)：报告记录的“双层 RO”实际日志后段含应用 bootstrap 尝试 CREATE/INSERT/ALTER，均因 read-only 被拒绝；虽 `PRODUCTION_BUSINESS_WRITES=0`，仍不得宣称“无 bootstrap”。这是历史快照的安全事实，不等同当前生产。

## 真实注册关系与禁止猜测
静态模型/SQL显示 `mst_products`（正式产品）、`product_grades`、`packaging_specs`、`product_skus` 为不同维度；但历史交易及库存表可能仅保存字符串。待查而不能猜：`product_skus` 的实际 FK、唯一约束/NULL语义；`PRD-EGG-5` 是否在另一张 legacy 表注册；`inv_batches` 的四个目标行及其 `batch_no, product_code, sku_code, quality_grade/grade_code_std, packaging_spec/spec_code`；包装/销售/退货引用和当前部署 migration revision。必须用已审查两层入口只读查询：`
```sql
SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_name IN ('mst_products','product_master','product_grades','packaging_specs','product_skus','inv_batches','inv_ledger');
SELECT ... FROM information_schema.table_constraints/key_column_usage ...; -- FK/UNIQUE
SELECT ... FROM mst_products/product_grades/packaging_specs/product_skus WHERE ...; -- exact joins, no prefix inference
SELECT ... FROM inv_batches/inv_ledger and each documented sales/packing reference WHERE batch_no IN (...); -- before/after evidence only
```
缺生产结果时标记 UNKNOWN，不给数字置信度；本报告不再使用无依据概率。

## 三方案（均为设计，未执行）
|方案|真实范围|风险|幂等/回滚|GRADE1/2兼容|
|---|---|---|---|---|
|通用受限 manifest|仅 manifest 明列的 `(sku_code,product_code,grade_code,spec_code,batch_no)`，服务端签名白名单；不触碰未列库存/流水|误配、跨维度错配；需 FK/唯一/计数预检|source_no+tuple 幂等，保存 before/after，按审计主键回滚|作为显式 legacy alias，保留原值，禁止静默替换|不重跑旧四批|
|专用 GRADE5 workflow|只允许已核实 GRADE5 tuples；先解决 EGG 根与 `PRD-EGG-5` 是否合法注册，再列具体 spec/SKU；不得固定 GRADE1/2 四批|当前根表与变体 product_code 冲突，证据不足即阻断|RO preflight→人工批准 manifest hash→单事务 apply→RO verify；按 source_no 回滚|GRADE1/2 仅兼容读取/显式映射，独立白名单|不重跑旧四批|
|legacy alias|resolver 读取旧 `PRD-EGG-*`/GRADE 字符串到经批准 canonical tuple；新写入 canonical|双口径、别名泄漏、审计混淆|解析幂等；记录 resolved_from/to，不改历史原态；回滚配置版本|GRADE1/2 显示/可售性须业务确认|不重跑旧四批|

**不推荐重跑旧四批写入**：它固定 GRADE1/2，与需求 GRADE5 不符，并会 POST/PUT 主数据或无 RO 修改库存维度。库存、流水、包装、销售引用均超出本次授权，不能扩大范围。

## 后续门禁（仅供主 agent）
先用已审查双层 READ ONLY 入口取得四表、约束、精确 batch/reference 快照并固定部署 SHA；形成逐行 manifest 与 hash；业务确认 EGG vs PRD-EGG-5、GRADE5 可售与具体 spec/SKU 后，才可另行审批。任何未来 apply 必须单一受限入口、显式 RO 分层、无 bootstrap/DDL、expected counts、事务、审计 artifact、source_no 幂等和可逆回滚。本次不执行方案。

## 本轮补交付（2026-09-11）

阶段 A 已补齐仓库内可复用的双层只读快照入口：`scripts/ops/readonly-audits/egg-grade5-production-snapshot.sql` 覆盖五张主数据表、`product_skus` 约束与索引；HTTP manifest 明确为空请求集，仅用于通过 runner 的双层入口校验。当前没有可用的生产只读运行结果或凭据，因此没有伪造行数、FK、legacy 注册关系或引用闭包；这些状态保持 `UNKNOWN`，历史 run 34463062878 仍单独标为历史 artifact。不得把旧 artifact 后段被 RO 拒绝的 bootstrap 视作当前状态。

阶段 B 新增 `.github/workflows/egg-grade5-sku-manifest-production-rollout.yml` 与 `scripts/ops/egg-grade5-manifest.mjs`。manifest 只能来自仓库 `scripts/ops/manifests/`，固定 `EGG/GRADE_5/PKG_PACK_SPEC_3`、完整 revision、hash、确认串和单一 target；任意产品、GRADE_1/2、空 manifest 或非仓库路径都会拒绝。preflight/verify 只走 `PRODUCTION_BUSINESS_WRITES=0` 的双层 RO 验证；apply 独立 environment 且当前因 canonical tuple 尚未被生产注册而 fail-closed，未实现或调用任何业务写入。

阶段 C 测试位于 `tests/ops/egg-grade5-manifest.test.mjs`，覆盖 canonical tuple、GRADE_1/2 拒绝、任意 product 拒绝与 hash 稳定性。未重跑旧 GRADE_1/2 四批，未创建 SKU、更新 product_code、包装 33 入库或发送业务 POST；本轮没有生产 apply、workflow apply、部署或 push。
