# R3.a — v3→v3' floor 重锚定设计与执行参数（2026-10-12）

## 门禁审查结论

`assertFloor(root, floor, target)`（`scripts/ops/production-config-guard.mjs`）逐字节比较
`floor.floorSha` 树与本部署 target 树的 `CONTRACT.criticalFiles`。PR #376 合并后
main=`4e536f6d` ≠ floor=`84ebfbcf`，且差异包含 criticalFiles（deploy.yml、
chanjet-readonly-restoration.yml、production-deployment-evidence.mjs）→ 对该 main 的任何
部署触发 `CONFIG_HOLD=FLOOR_CONTRACT_CHANGED`。floor 只能前进：`assertFloorMonotonic`
以 `git merge-base --is-ancestor` 阻止回退；非祖先 target 直接 `CONFIG_HOLD=BELOW_FLOOR`/
`FLOOR_REGRESSION`。

既有 `promotionPlan` 仅支持 v2→v3（`previousFloor.version !== 2` 即拒绝），本 PR 扩展为
v3→v3' 重锚定，复用同一部署轨道（deploy.yml 的 `APPROVED_CONFIG_FLOOR_SHA` 分支：
PRE snapshot → promotion（先 marker 后 floor/active）→ FF checkout → begin → candidate →
switch → 新分类器证据链 → complete）。

## 执行顺序约束（重要，偏离阶段 3→4 的字面顺序）

重锚定部署**必须在 recovery 之后**执行，二者不可倒置：

1. promotion 拒绝在存在 `transaction.json`/`policy-transition.json` 时运行
   （`CONFIG_HOLD=UNFINISHED_PROMOTION`），且要求 `active.outcome === 'SUCCESS'`
   ——当前生产为 `CONFIG_READY_HOLD` + 未完成事务；
2. recovery 工具要求 `floor.floorSha === 84ebfbcf`（`FLOOR_SHAPE`）——若先重锚定，
   recovery 将被永久阻断（archive/plan 也绑定 84ebfbcf）。

因此正确顺序：**R3.b recovery（关闭 38031441639-1）→ R3.c 重锚定发布**。
本 PR 不改变该约束，只让重锚定在 recovery 后成为合法操作。

## v3→v3' 重锚定的全部拒绝路径（promotionPlan + promoteFloor）

| 守卫 | HOLD 码 |
|---|---|
| 共享前置：floor/active 版本一致且 ∈ {2,3}、phase=READY、floorSha=activeSha、outcome=SUCCESS、runtime == active pins、scope（以运行 API revision 为基线、changed=∅）、tuple HOLD/false/false、exact SHA/runId | `FLOOR_PROMOTION_APPROVAL` |
| v3 重锚定时 policy 非 HOLD 或存在审批 | `FLOOR_REANCHOR_POLICY_ACTIVE` |
| target == 旧 floorSha | `FLOOR_REANCHOR_SAME_SHA` |
| criticalFiles 差异为空（无需重锚定，普通部署即可） | `FLOOR_REANCHOR_WITHOUT_CONTRACT_CHANGE` |
| 未提供旧 floor 精确 SHA 绑定 | `FLOOR_REANCHOR_PREVIOUS_FLOOR_REQUIRED` |
| 旧 floor 绑定不匹配 | `FLOOR_REANCHOR_PREVIOUS_FLOOR_MISMATCH` |
| floor 回退/非祖先（promoteFloor，含共享前置之外） | `FLOOR_REGRESSION` / `BELOW_FLOOR` |
| dirty checkout / 非 main | `WORKTREE_NOT_CLEAN_MAIN`（installed guard） |
| 运行实例漂移 | `ACTIVE_RUNTIME_DRIFT`（installed guard） |
| migration 路径变更 | `MIGRATION_SCOPE=HOLD`（promotion 与 begin 双重） |
| 未完成事务 marker 存在 | `UNFINISHED_PROMOTION` |
| main 在审批后移动 | `LATEST_MAIN_CHANGED` |
| staged helper 与 target 树不一致 | `STAGED_HELPER_MISMATCH` |
| bootstrap schema 缺项 | `BOOTSTRAP_SCHEMA_GAP`（先于任何状态写入） |

promotion 本身只写状态文件（marker→floor→active），不触碰容器/数据库/.env；
compose 切换只发生在其后的部署阶段（api-only、RUN_MIG=false、无 DB 重建）。

## 绑定

- 旧 floor：`84ebfbcf76318148dfaa0caf9fd824d2b25a827f`（执行时经
  `approved_previous_floor_sha` 显式传入并强制校验）
- 新 main：执行时点的 merged main（必须包含本 PR——staged promotion helper 取自
  target 树；PR 合并后的 main SHA 在执行前固定并写入审批）
- criticalFiles 差异：84ebfbcf→含本 PR 的 main，实证非空（当前分支为 3 个文件）

## 生产执行参数（等待单独批准，本 PR 不执行）

前置：R3.b recovery 已 COMPLETE；origin/main = M（含本 PR）。

```text
workflow:  CI/CD — Build & Deploy (workflow_dispatch)
inputs:
  mode=api
  approve_production=true
  approved_config_floor_sha=<M>            # 执行时点的 merged main 全 SHA
  approved_previous_floor_sha=84ebfbcf76318148dfaa0caf9fd824d2b25a827f
  skip_deploy=false
预期链:    PRE → schema preflight → v3→v3' 重锚定(PREPARED_HOLD) → FF → begin
           → candidate(84ebfbcf API→M API) → switch → 修复后分类器 startup
           PASS_REDACTED_SUMMARY → complete → floor=M/active=SUCCESS
不变量:    Chanjet HOLD/false/false；无 migration、无 Web/DB 容器变更
```
