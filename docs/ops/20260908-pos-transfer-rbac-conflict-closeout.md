# POS 转账结账与 RBAC 岗位冲突缺陷闭环

日期：2026-09-08

## 结论

- POS `TRANSFER` 400 是支付链断层：后端把外部参考号设为硬必填，管理端没有采集字段。按线下收款语义裁决为可选；有值继续保存并优先用于勾稽，无值回落 `sale_no`，不阻断成交。
- MIXED 的实收腿此前无视 `paymentMethod`，固定落 `CASH`。现已与全额收款共用 `CASH/QR/TRANSFER` 映射，并保留可选参考号。
- wangweihua 的“岗位冲突”不是脏绑定：生产只有 ACTIVE 出纳主角色与 ACTIVE 财务会计副角色，无用户直绑权限集。`ROLE_FIN_ACCT` 自身已有 3 条 BLOCK，导致任何无关权限编辑都被前端冻结。
- RBAC 修复采用“新增冲突禁止、既存冲突只减不增”：后端在落库前比较当前与拟议权限，只拒绝新引入的 BLOCK；管理端允许保存不扩大既存冲突的修改，并提示逐步整改。保存后仍递增所有有效持有人的 `perms_version`，权限即时失效刷新。

## 根因证据

### 缺陷 1

- `StorePosService.writeTender` 原先对 `QR/TRANSFER` 的空 `externalReference` 抛 400。
- 管理端 `/store-pos` 的 `pay-cash` 请求只发送账户、金额、支付方式和幂等键，不发送参考号。
- 校验由 commit `9a98aec3`（`feat: v1-4 tender settlement governance`）引入；同期 DTO 开放了可选字段，但 UI 未接入。
- 结算匹配服务对非 CASH/CREDIT tender 使用 `external_reference` 或 `sale_no`，说明无参考号已有明确回落键。

### 缺陷 2

生产只读 workflow run `34174106155`，审计 revision 三方一致：
`a6feab894921a568e6ae6e16e52d87cc90b0517c`。

- wangweihua：`user_id=3`，ACTIVE，`perms_version=144`。
- 角色：`ROLE_MENGSAI_DONGPENG_TREASURER`（主）与 `ROLE_FIN_ACCT`（副），均 ACTIVE、visible。
- 无 role permission-set / user permission-set 绑定。
- `MENU_STORE_PAYMENT` 仅来自 `ROLE_FIN_ACCT:V`，缺少 `E`。
- 既存 BLOCK 命中均来自 `ROLE_FIN_ACCT`：
  - `MENU_APPROVAL ↔ MENU_FIN_AUDIT`
  - `MENU_FIN_CLOSE ↔ MENU_FIN_AUDIT`
  - `MENU_ORDER_MGR ↔ MENU_FIN_AUDIT`
- 该次审计以只读事务运行并 ROLLBACK，`PRODUCTION_BUSINESS_WRITES=0`。

## 修复

- POS：TRANSFER/QR 外部参考号改为可选；仍 trim 后持久化；MIXED 实收腿尊重支付方式。
- RBAC API：角色权限覆盖前比较当前/拟议写菜单，仅阻断新出现的 BLOCK。
- RBAC UI：只禁用新增 BLOCK；既存 BLOCK 显示整改提示但不冻结无关或收敛性修改。

## 回归与门禁

- 定向 API：Store POS + Permissions 共 22 tests PASS。
- Web 相关：15 tests PASS。
- API tsc：PASS。
- Web tsc：PASS。
- nullable unique、constraint drift、entity drift、采购/WMS DataScope 门禁：PASS。
- API 全量：95 suites / 790 tests PASS；2 个既存 Chanjet 定时收敛用例连续超时，非本次改动范围，未记为全绿。
- Web 全量：102 files / 540 tests PASS；28 个 React DOM 用例因环境中 `act is not a function` 失败，非本次改动范围，未记为全绿。

## 待批准的生产数据调整

代码部署本身不修改 wangweihua 或任何角色权限。建议把门店收款编辑权放在出纳角色，而不是同时持有财务审计能力的会计角色。最终 SQL 必须在补充只读预检确认出纳角色现有权限与影响人数后冻结；批准前不执行 DML。

预期变更目标：

补充只读 workflow run `34174664676` 已确认：出纳角色当前没有该菜单权限且仅 1 个有效绑定；会计角色有 6 个有效绑定且只有 `V`。因此 blast radius 最小且职责正确的目标是出纳角色。

1. 为 `ROLE_MENGSAI_DONGPENG_TREASURER` 新增 `MENU_STORE_PAYMENT:V,E`（当前为 `<none>`，影响 1 个有效绑定，即 wangweihua）。
2. 依赖现有权限变更触发器或服务路径递增所有受影响用户 `perms_version`。
3. 不修改 `ROLE_FIN_ACCT`，不解除任何 SoD 规则，不触碰库存或资金业务数据。

## 部署后验证计划

- revision：checkout/API/Web 必须等于部署 SHA。
- POS：生产只读确认接口与错误窗口；真实成交会写库存和资金台账，不在只读审计中伪造 PASS，需使用业务批准的 amei 实单或专用 UAT 数据执行一次 TRANSFER，再核对 tender/现金交易/销售单。
- RBAC：先验证无关权限编辑不再被既存 BLOCK 冻结、新增 BLOCK 仍返回 400；获批补权后验证 wangweihua 旧 token 收到 `PERMS_CHANGED`，重新登录后具备 `MENU_STORE_PAYMENT:E`。
- 错误窗口：检查部署后 API 日志中的 `TRANSFER tender`、角色权限保存 400/500 和 `PERMS_CHANGED` 是否符合预期。
