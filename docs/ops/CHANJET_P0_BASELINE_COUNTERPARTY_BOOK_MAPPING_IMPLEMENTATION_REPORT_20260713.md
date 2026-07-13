# 好业财 P0 基线、往来单位与账套映射 Gate 实施报告

## 结论

`GO_WITH_CONDITIONS`

本轮完成 P0-01 至 P0-03 的代码实施。好业财继续保持严格只读；新增写操作仅限管理员明确触发后，将高置信候选保存到 ERP 中间层 `chanjet_master_mapping`，状态固定为 `PENDING`，不会自动批准，也不会覆盖 ERP 客户、供应商或财务业务表。

## P0-01 镜像基线校准

新增 `GET /api/chanjet/integration/baseline-readiness`：

- 按 16 个默认只读 scope 和启用账套展开目标矩阵。
- 输出快照行数、实体行数、最近拉取时间、年龄、最近作业状态和错误。
- 默认 24 小时新鲜度阈值，可在 1 至 168 小时内调整。
- 缺少快照或账套 Gate HOLD 时整体 `HOLD`；过期或最近作业失败时 `GO_WITH_CONDITIONS`。
- 只读 ERP 中间层，不调用好业财写接口。

## P0-02 客户/供应商往来单位映射

新增：

- `GET /api/chanjet/integration/counterparty-mapping-candidates`
- `POST /api/chanjet/integration/counterparty-mapping-candidates/generate`

匹配真实源：

- 客户：`sal_customers.customer_no / customer_name`
- 供应商：`prc2_suppliers.supplier_code / supplier_name`

规则：

1. 编码精确匹配为 100 分。
2. 规范化名称精确匹配为 95 分。
3. 不做模糊自动匹配。
4. 多个同分候选标记 `CONFLICT`。
5. 无法判定客户/供应商属性标记 `HOLD` 证据，不猜测。
6. 生成动作只保存 `MATCHED` 高置信候选，且审核状态固定为 `PENDING`。
7. 已批准映射不会被候选生成器覆盖。
8. 批准时强制检查 ERP 编码、好业财 ID、MATCHED/MANUAL 状态、启用账套映射和一对一冲突。

同时停止 `CUSTOMER_SUPPLIER` scope 走旧的通用 `CUSTOMER` 候选逻辑，避免供应商被错误归为客户。

## P0-03 账套与公司唯一映射 Gate

新增 `GET /api/chanjet/integration/account-book-mapping-gate`：

- 校验 `chanjet_book_company_map` 中一账套一公司、一公司一账套。
- 校验映射账套存在于账套缓存且处于启用状态。
- 校验 ERP 公司存在于 ACTIVE `sys_organizations`。
- 启用账套缺映射、映射公司不存在或映射与缓存状态不一致时 `HOLD`。
- 好业财 book-scoped mirror sync 在调用外部只读 API 前强制执行该 Gate。

数据库已有 `bookid` 主键与 `company_code` 唯一约束，本轮未新增 migration。

## 管理员页面

`/finance2/chanjet-integration` 新增默认页签“治理 Gate”，展示：

- 镜像新鲜目标、过期/缺失、失败作业。
- 有效账套映射及阻断原因。
- 往来单位候选、冲突、未知角色和置信度。
- 16 scope 基线明细。
- “生成待审核候选”按钮，仅对 `MENU_SETTINGS_CHANJET:E` 开放。

中间层页面继续只对管理员可见，普通业务用户无感消费经 Gate 批准的只读口径。

## 验证

- API TypeScript：PASS。
- Web TypeScript：PASS。
- Chanjet service unit tests：8/8 PASS。
- `git diff --check`：PASS。
- W5 closeout：在 `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true` 的已授权好业财 API/Web 代码审查模式下 PASS；未授权原命令因当前长期分支相对 `main` 的既有大范围历史差异而触发冻结/安全提示，不是本轮新增 migration 或越权写入。
- 未执行好业财写入、删除、修改或凭证推送。
- 未执行 migration。
- 未覆盖 ERP 业务表。
- 当前本机未取得可用运行态数据库连接，因此不伪造真实快照新鲜度、账套映射或候选数量；生产只读证据保留为部署后 Gate。

## 条件项与下一步

1. 部署后执行三个新只读接口，记录真实生产基线新鲜度与账套 Gate 结果。
2. 先预览往来单位候选，再由管理员生成 `PENDING` 候选；不得批量自动批准。
3. 消除 `CONFLICT / UNKNOWN / PENDING` 后，重新运行财务 Read Model 权威口径 Gate。
4. 继续保持好业财写回和凭证推送 `HOLD`。
