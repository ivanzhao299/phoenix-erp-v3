# Web 测试覆盖补齐 — 2026-08-22

## 结果

| 指标 | 改造前 | 改造后 | 增量 |
|---|---:|---:|---:|
| Vitest 文件 | 50 | 69 | +19 |
| Vitest 用例 | 242 | 397 | +155 |
| `src/lib` 原有模块具备运行时测试 | 31 / 49 | 47 / 49 | +16 |
| 业务逻辑模块维度覆盖 | 有 16 个缺口 | 100% | 清零 |

剩余两个原有 lib 文件不计入业务逻辑模块分母：`workflow-templates.ts` 是纯模板常量，`use-abortable-load.ts` 是通用 React 生命周期 hook；当前 Vitest 明确使用 Node 环境且仓库未配置 hook/DOM renderer，因此没有为了数字新增依赖或伪渲染测试。

## Lib 层新增覆盖

- API/缓存边界：`api-client`、`dict-cache`、`workflow-api`、`mobile-api`、`shareholder-api`。
- 浏览器状态边界：`auth-dispatch`、`mobile-auth-token`、`impersonate`、`haptic`、`bug-intake-telemetry`。
- 路由与算法：`notification-routing`、`qrcode`。
- 展示/目录 helper：`design-tokens`、`dict-type-labels`、`workflow-data-catalog`、`utils`。
- 覆盖正常、边界和错误分支，包括内部路径防外链、权限过期冷却、缓存命中与网络失败、HTTP 错误、二维码容量上限、SSR 安全降级。

## 关键页面流程

- finance2 报表：抽取来源/状态映射和对账状态优先级，覆盖 HOLD、MISMATCH、WARN、映射阻断、只读与权威态。
- finance2 应收总账：抽取查询参数构造和 OCR 待核数量。
- settings/users：抽取稳定角色签名，覆盖顺序无关、主角色与可见性变化。
- terminal/packaging：抽取本地包装扣减、余量下限、同等级同规格合并和提交条件。
- warehouse：沿用既有 `warehouse-query.test.ts`，覆盖响应归一化、数量优先级、单位聚合、筛选与日期显示。

所有抽取函数均由原页面实际调用，不是测试专用副本。

## 验证

- `cd apps/web && ./node_modules/.bin/vitest run`：69 files、397 tests 全绿。
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`：0 errors。
