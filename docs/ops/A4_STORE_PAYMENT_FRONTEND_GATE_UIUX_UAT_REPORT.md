# A4 Store Payment Frontend Gate UIUX UAT Report

## 1. 修改文件清单

- `apps/web/src/app/(admin)/store-payment/page.tsx`
- `apps/web/src/app/(admin)/store-payment/store-payment.module.css`
- `apps/web/src/components/layout/Sidebar.tsx`

## 2. 页面入口

- 入口路径：`/store-payment`
- 菜单位置：销售管理 / 统一收款
- 菜单权限：`MENU_STORE_PAYMENT`

## 3. UI 功能清单

- 收款账户列表：展示 account code、account name、store、currency、payment method、QR controlled state、status、remark。
- 收款记录列表：展示 payment no、store、account、amount、paid time、submitted by、proof controlled state、status、actions。
- 新增收款记录表单：
  - 固定试点门店：`STORE-VTE-001 / 万象直营店`
  - 固定公司：`COMP-LAO-AGRI`
  - 只允许选择启用状态的公司收款账户。
  - `proof_attachment_id` 只允许受控附件 ID，拒绝 `http://`、`https://`、`/uploads/`、`uploads/`。
- 收款记录详情抽屉：展示状态、金额、门店、支付方式、订单/小票、付款时间、原因、备注、附件受控状态。
- 状态标签：`PENDING`、`CONFIRMED`、`REJECTED`、`VOIDED`、`DISABLED`、`PENDING_CONFIG`、`ACCESS_PENDING`。
- 筛选条件：状态、日期、收款人、账户、支付方式。
- 空状态、错误提示、loading/disabled 状态已覆盖。
- 导出仅预留，不实现真实导出。

## 4. 权限按钮控制结果

| Menu Code | Action Bit | Frontend behavior |
| --- | --- | --- |
| `MENU_STORE_PAYMENT_ACCOUNT` | `V` | 可查看收款账户列表 |
| `MENU_STORE_PAYMENT_ACCOUNT` | `E` | 显示账户维护预留入口；当前不伪造真实账户信息 |
| `MENU_STORE_PAYMENT` | `V` | 可查看收款记录列表和详情 |
| `MENU_STORE_PAYMENT` | `E` | 可新增待确认收款记录 |
| `MENU_STORE_PAYMENT_CONFIRM` | `V` | 可看到确认状态 |
| `MENU_STORE_PAYMENT_CONFIRM` | `E` | 可确认 / 驳回待确认记录 |
| `MENU_STORE_PAYMENT_VOID` | `V` | 可看到作废状态 |
| `MENU_STORE_PAYMENT_VOID` | `E` | 可作废记录 |
| `MENU_STORE_PAYMENT_EXPORT` | `X` | 导出预留；当前禁用，不实现真实导出 |

## 5. 附件 Preview / Download 禁用结果

- proof preview：disabled。
- proof download：disabled。
- QR preview：disabled。
- QR download：disabled。
- 页面只展示 controlled state。
- 页面不拼接 `/uploads` 路径。
- 页面不打开 `http(s)` 附件链接。
- 后端返回 `rawUrl: null` 时，详情抽屉显示 `rawUrl: null`。
- 如果异常拿到非空 `rawUrl`，页面只显示 `BLOCKED`，不渲染链接。

## 6. 是否展示裸 URL

否。

扫描结果：

- `rawUrl` 仅作为类型字段和安全状态显示。
- `/uploads` / `http(s)` 仅用于输入校验和安全提示。
- 未实现任何裸 URL 链接、预览 iframe、图片预览、下载按钮或跳转。

## 7. DataScope / Store Code 显示处理

- 主显示：`STORE-VTE-001 / 万象直营店`。
- `ST-VTE-001` 仅显示为 `legacy alias`。
- 新增收款记录固定提交 `STORE-VTE-001`。
- 前端不把 `ST-VTE-001` 写回 Store Payment 新记录。
- `companyCode` 固定为 `COMP-LAO-AGRI`。
- 不做前端破坏性数据修正。

## 8. UAT Smoke 路径

1. 用持有 `MENU_STORE_PAYMENT_ACCOUNT:V` 的账号进入 `/store-payment`，确认账户列表可见。
2. 用缺少 `MENU_STORE_PAYMENT_ACCOUNT:V` 的账号进入页面，确认账户列表显示权限不足。
3. 用持有 `MENU_STORE_PAYMENT:E` 且存在 active account 的账号新增一条待确认记录。
4. 输入 `http://`、`https://`、`/uploads/` 或 `uploads/` 类型的 proof reference，确认前端阻止提交。
5. 用持有 `MENU_STORE_PAYMENT_CONFIRM:E` 的账号确认 / 驳回 `PENDING` 记录。
6. 用持有 `MENU_STORE_PAYMENT_VOID:E` 的账号作废记录。
7. 验证详情抽屉中 proof preview/download 均显示 disabled。
8. 验证导出按钮未开放。
9. 验证移动窄屏下筛选区、表单和详情抽屉可用。

## 9. A2 复核结果

结论：PASS WITH CONDITIONS。

- 权限按钮已按 `MENU_STORE_PAYMENT*` 与 V/E/X 控制。
- proof / QR preview/download 均保持 disabled。
- 未暴露裸 URL。
- `STORE-VTE-001` canonical 与 `ST-VTE-001` legacy alias 显示边界清楚。
- 条件项：后续启用 protected streaming 前，仍需 A2 对后端 ACL、前端预览组件和 denied audit 再复核。

## 10. A1 验证结果

结论：PASS WITH CONDITIONS。

执行结果：

- `apps/web/node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`：PASS。
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`：PASS。
- changed file boundary：仅触碰 A4 批准范围内的 `apps/web/**` 和 `docs/ops/**`。

条件项：

- 本次前端 typecheck 使用主仓库 `apps/web/node_modules` 作为本 worktree 的本地验证依赖来源。
- 未执行 browser runtime smoke，需 UAT 环境或本地 dev server 后补。

## 11. 是否执行 Migration

否。

## 12. 是否写 DB

否。Codex-Orchestrator 本轮未写数据库；页面代码具备业务操作能力，但本轮未触发任何实际 API 写入。

## 13. 是否部署

否。

## 14. 是否 Push

否。

## 15. 是否允许进入下一轮 A3 Protected Streaming Gate

GO WITH CONDITIONS。

条件：

- A2 需批准 protected streaming ACL 设计。
- A3 需实现受控 preview/download streaming，不返回裸 URL。
- A1 需执行 API / Web typecheck 与 W5 gate。

## 16. 是否允许进入 UAT 试点

GO WITH CONDITIONS。

条件：

- 当前 UAT 只验证页面、权限可见性、状态流转、附件禁用态。
- 不验证真实附件预览 / 下载。
- 不验证生产部署。

## 17. 当前结论

GO WITH CONDITIONS。
