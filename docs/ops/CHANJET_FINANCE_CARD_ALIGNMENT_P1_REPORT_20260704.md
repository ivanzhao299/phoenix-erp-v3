# Chanjet Finance Card Alignment P1 Report

## Scope

本轮继续执行好业财只读同步后的 P1：ERP 财务首页核心卡片以好业财可用数据为权威口径，并显式展示 ERP 辅助值、好业财值、差异状态和待同步项。

## Changes

- 后端 `FinancialReportsService` 为每个财务指标补充：
  - `status`: `OK` / `WARN` / `MISMATCH` / `ERP_FALLBACK`
  - `diffAbs`
  - `diffRate`
  - `statusCounts`
  - `mismatchCount`
  - `fallbackCount`
- 前端 `/finance2` 财务首页新增“好业财财务口径对齐”区域。
- KPI 卡片副标题补充来源和差异状态，避免财务数字看起来像本地 ERP 随意聚合。

## Covered Cards

- 应收待收款：好业财应收汇总优先，ERP 应收发票/总账作为辅助明细。
- 应付待付款：好业财应付汇总优先，ERP 应付发票作为辅助明细。
- 现金账户余额：好业财资金账户镜像优先，ERP 现金账户余额作为辅助差异。
- 今日收款：好业财收款镜像可用时展示为条件口径。
- 今日付款：好业财付款镜像可用时展示为条件口径。
- 科目余额：好业财科目余额表镜像。
- 资产负债表关键项：好业财资产负债表镜像。
- 利润表关键项：好业财利润表镜像。

## Guardrails

- 不写好业财。
- 不修改好业财数据。
- 不删除好业财数据。
- ERP 明细不被静默覆盖；如与好业财不一致，必须展示差异。
- `ERP_FALLBACK` 表示该卡片仍需继续补齐映射或同步范围。

## Result

当前阶段结论：GO WITH CONDITIONS。

条件项：

- 今日收款 / 今日付款仍需继续确认好业财单据日期字段和业务日口径。
- 资产负债表 / 利润表 / 科目余额已经进入镜像对齐展示，但还需下一轮做字段级覆盖率和科目编码映射补齐。
- 仍禁止 ERP 向好业财写入，写入链路留到 P4。
