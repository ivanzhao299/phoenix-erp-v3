# 好业财 WMS 只读等效实施报告

## 实施范围

本轮同时交付 Phoenix ERP WMS 出入库治理和好业财采购入库/销售出库只读等效层。好业财外部写入保持关闭。

## 核心改动

1. 采购入库改为官方账套级路径，删除运行时对旧全局路径的依赖。
2. 采购入库和销售出库执行完整分页；达到 200 页上限会失败并 HOLD。
3. 取消实体快照 5,000 行静默截断。
4. 建立 120 项官方字段契约，覆盖单据头、明细、状态、往来、仓库、双计量、金额税额、成本、物流、批号、序列号和附件元数据。
5. 新增 ERP 等效列和外部单据幂等索引，原始响应继续无损保存在中间层 JSON。
6. 新增管理员只读对齐页面和审计脚本。
7. 对齐视图只统计启用账套，排除旧版无账套快照造成的虚假计数。
8. 镜像同步不写 `wms_inbound`、`wms_outbound`、`inv_batches` 或 `inv_ledger` 业务事实。

## 验证

| 检查 | 结果 |
| --- | --- |
| API 定向测试 | PASS，6 suites / 106 tests |
| Web 定向测试 | PASS，5 files / 24 tests |
| API TypeScript | PASS |
| Web TypeScript | PASS |
| API production build | PASS |
| Web production build | PASS，230 routes |
| TypeORM down() gate | PASS，52 migrations |
| migration no-DML gate | PASS |
| nullable unique gate | PASS |
| entity drift gate | PASS，0 drift |
| W5 closeout gate | PASS，含显式 freeze/security 授权 |
| 好业财外部写入 | 未执行 |

## 生产运行态条件

- 三个启用账套应形成 `3 × 2 = 6` 个库存单据只读 scope。
- 若好业财仍返回 0 行，接口和分页可判 PASS，但真实字段值类型保持 `GO WITH CONDITIONS`。
- ERP 迁移完成后业务字段覆盖率应为 100%，否则对齐端点返回 HOLD。

## 生产交付证据（2026-07-28）

| 项目 | 结果 |
| --- | --- |
| 生产版本 | `7606c623053705b6b9ae8b0f12a85840fdec59a9` |
| CI/CD | `30321257352` 全链路 PASS |
| API / Web / PostgreSQL | healthy |
| `AddWmsIssueOutboundGovernance1785200000000` | 已应用 |
| `AddWmsChanjetEquivalentFields1785300000000` | 已应用 |
| `STOCK_IN` | 3/3 启用账套 SUCCESS |
| `SALES_STOCK_OUT` | 3/3 启用账套 SUCCESS |
| 好业财返回单据 | 两类均为 0 行；未伪造业务数据 |
| 真实响应字段探测 | 每个 scope 17 个顶层字段 |
| 字段映射扫描 | 4,116 |
| 字段映射 upsert | 3,404 |
| 字段状态 | MATCHED 219 / PENDING 3,185 |
| 好业财写入 | 0 |

运行证据：

- `docs/ops/runs/chanjet-wms-readonly-sync-latest.json`
- `docs/ops/runs/chanjet-wms-readonly-sync-latest.md`

本轮 `PENDING` 包含其他好业财业务域的全局字段目录，不等于 WMS 120 项合同缺失。WMS 等效端点按启用账套、官方路径和固定字段合同独立计算；但由于生产账套当前没有采购入库单或销售出库单，值级类型、金额、税额、批号和序列号只能保持条件通过，不能宣称真实单据值已对账。

## 下一 Gate

1. 在好业财出现真实采购入库或销售出库单后，重跑六 scope 只读镜像。
2. 对真实单据执行头/行、数量/双计量、含税/未税、成本、仓库、批号、序列号逐项值级核验。
3. 生成 ERP 业务单据与好业财单据的差异记录，不静默覆盖 `inv_batches` / `inv_ledger`。
4. 只有在映射唯一且校验通过后，才允许另行申请 ERP 侧导入 Gate；好业财写入继续禁止。

## 当前结论

**GO WITH CONDITIONS**

代码、测试、静态门禁、推送部署、ERP 迁移和六 scope 生产只读刷新均已完成。当前唯一 WMS 数据条件是三个账套都没有返回采购入库/销售出库单，因此真实值级对账仍待有单据后完成。好业财写入继续禁止。
