# Issue #382 / PR #386 lint 兼容回填

日期：2026-10-17（Asia/Singapore）。原 HEAD：`42c9683b62a5f9d95a32899f1c2867d062ec3148`；协调 main：`226878864f184d26f41a890e666ebed52547db14`。

来源：隔离集成提交 `f3ed1fcb48c6f21f8dc63fb2e5829e55d08e6249`。仅将 outbound/page.tsx 两个既有 boolean 权限值显式传为 `Boolean(canCreateInout)` / `Boolean(canCreateIssue)`。权限来源、独立出库类型限制和 helper 不变，不修改 ESLint 规则、基线或 suppression。

本轮实际验证：Web TypeScript exit 0；warehouse-outbound Vitest 6/6 PASS；changed-file lint PASS（3项原有 no-explicit-any，0 warning，未增长）；diff whitespace PASS。独立只读核对未发现权限语义变化。API 与最新 main 上的 Batch1组合回归由协调分支另行记录，不能继承旧集成 PASS。

新 HEAD 的正式 Review 与冻结边界覆盖必须重确认。保留 Draft；不以旧 reviewed-frozen-boundary 标签视为新 HEAD 自动获批。不合并 main、不部署、不改生产floor。
