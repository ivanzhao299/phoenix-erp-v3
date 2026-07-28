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
- 部署后需要执行一次 `STOCK_IN` / `SALES_STOCK_OUT` 只读刷新。
- 若好业财仍返回 0 行，接口和分页可判 PASS，但真实字段值类型保持 `GO WITH CONDITIONS`。
- ERP 迁移完成后业务字段覆盖率应为 100%，否则对齐端点返回 HOLD。

## 当前结论

**GO WITH CONDITIONS**

代码、测试和静态门禁已通过；等待推送部署、ERP 迁移应用、六 scope 刷新和生产只读复核。好业财写入继续禁止。
