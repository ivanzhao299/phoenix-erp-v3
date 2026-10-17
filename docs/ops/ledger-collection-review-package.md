# 生产 ledger 单次只读采集与离线双 inventory 评估包（执行前审阅 · v3）

> 状态：**准备完成，未执行**。生产侧任何动作均未发生。
> 基线：PR399 分支 `codex/r42-hard-admission-design`，本轮提交的 exact SHA
> 见交付报告；PR399 保持 draft、**无需提前合并**（b64 交付，见第 3 节）。

## 0. 基线核对（已执行）

worktree `/home/jinhuit/.codex/worktrees/3e7e/phoenix-erp-v3`、分支
`codex/r42-hard-admission-design`、无未提交改动；远端 main
`22b47aebb50d2253afb465a25abc66ded26e873f`（两 ref 迁移目录差异恰为
admission 迁移一个文件）；前基线 `978652cf` CI 10/10。

## 1. 完整审核清单整合状态（#1–#11，历史轮 + 本轮）

| # | 症状（历轮审核） | 根因 | 修复 | 验证 |
|---|---|---|---|---|
| 1 | 健康失败仍放行（收集不拒绝） | audit 只收集不裁决 | `productionAudit` fail-closed（元组/健康/部署证据）+ 链体 JSON 复核 | 动态（readiness 500 拒绝，CI） |
| 2 | 部署完成未绑定 run/attempt | 门只查文件存在 | workflow 按 run id/attempt 直查 + 链解析 SUCCESS 状态 | 动态（absent/wrong-run 拒绝，CI） |
| 3 | bootstrap 交付不完整 | 漏 contract/helper | 三件套完整交付进 envs | 静态+执行（workflow 步骤） |
| 4 | 预算适配器未生效 | dep 键不匹配 | `readDatabaseEvidence` 键 + 工厂导出 | 动态（预算传播单测） |
| 5 | 宿主来源/停止依赖缺失 | 检查滞后/未交付 | checkout SHA 前置 + 镜像交付溯源 + 可加载性 | 动态（错 SHA/交付失败零登记） |
| 6 | 完成门拒真 dispatch | 事件过滤错 | `verify-deploy-run-complete.mjs`（dispatch+Deploy job） | 动态（4 门例，CI） |
| 7 | 交付失败在登记后且无收尾 | 交付顺序+无 trap | 交付前移 + EXIT trap 有界 HOLD（幂等+身份门） | 动态（交付失败零登记；崩溃→HOLD；REGISTERED 收尾；身份冲突零修改） |
| 8 | finalizer 相位覆盖缺 | 仅 SYNCING | 四非终态全覆盖 | 动态（REGISTERED 收尾，CI） |
| 9 | finalizer 停别人执行 | 借用行内 manifest | 完整绑定身份门（零修改） | 动态（异 owner/canonical 拒绝，CI） |
| 10 | 输出契约（误 PASS/拼接/崩溃称分歧/结构） | 分类器缺陷 | 交叉核验+分离流+三态语义行+结构校验 | 动态 20/20（CI） |
| 11 | 采集准备包（fixture 保护/离线适配器/staging/来源闭合） | 本轮整合 | 见第 2–5 节 | 本轮动态 9+2 项 |

## 2. 统一 fixture 守卫（单源）

`scripts/ci/ledger-fixture-guard.mjs`：identity（loopback）→ 专用命名空间
（`^ledger_collect_`）→ 所有权（库存在于指定容器 + 两侧 server identity 一
致）。**两个 fixture 套件在任何破坏操作之前执行同一守卫**；容器内自举专用
库后由守卫复核所有权。探针：`phoenix_erp` 库名在连接前拒绝（实测）。

## 3. 单源校验契约与离线 CLI 退出契约

`scripts/ops/ledger-offline-evaluate.mjs`：校验器单源导出
（`validateCollectionDocument`/`validateInventory`/`validateLegacyDir`，
retired registry 深校验仍单源自受审 preflight 的 `validateRetiredRegistry`
并 re-export）。CLI 退出契约：**PASS→0；BLOCK→1（真实评估结论+failures）；
输入拒绝→2（MISSING_INPUT/INVALID_INPUT，绝不形成评估）**。

## 4. 超时交叉校验与 prod 通道作业收尾

- 采集器拒绝对话：`client < statement + lock` 即拒绝（服务端取消必须先于
  客户端 kill）。
- **prod 通道收尾实测**：客户端 SIGKILL 不必然终止容器内 exec 进程——由
  服务端 bound 收尾。新测试经真实 prod 通道（`docker compose exec -T db`）
  客户端 kill 后对 `pg_stat_activity` 轮询断言：容器内查询在
  statement+lock bound 内消失、无遗留中止事务——不是子进程返回值断言。

## 5. rehearsal 门禁与故障注入

- runner **断言预期 preflight 结论**：fixture 构造下真实评估必须 PASS，
  否则 rehearsal 失败（`EXPECTED_PREFLIGHT_VERDICT_UNMET`）。
- 故障注入旋钮 `LEDGER_REHEARSAL_FAULT=drop-legacy-row`：preflight 前删一
  行 → BLOCK(`legacy_missing`) → **rehearsal 非零退出**。动态回归实测：
  clean exit 0/PASS/AGREE；fault exit 1/BLOCK/UNMET。

## 6. 交付路径（材料化 workflow，无需提前合并 PR399）

新 workflow `.github/workflows/production-ledger-collection.yml`（**随本 PR
交付审阅，未 dispatch**）：`workflow_dispatch` + 确认串
`RUN_PRODUCTION_LEDGER_COLLECT` + main-only + `production-readonly`
environment + `collection_ref`（批准的 exact SHA）+ `expected_collector_sha256`
（双重钉死）→ 严格失败（`set -Eeuo pipefail`、每步 hash/check）→ 正确目录
（`$DEPLOY_PATH`）+ 一次性 tmp + trap → 采集（默认边界 2s/10s/30s）→
host 侧 JSON 校验 + `COLLECTION_RESULT_B64` 标记行回传 → runner 解码校验
（schema/snapshot）→ **离线双评估**（main + collection ref）→ artifact 上
传。既有 main-only workflow 零修改。

## 7. CI 覆盖（禁 skip 兜底）

- paths 触发补齐全部新文件；
- collection(6)/staging(4)/rehearsal-gate(2) 三套动态全部接线 CI，各自
  断言 `# skipped 0` 与预期通过数（REQUIRED 缺失即 throw，无 skip 兜底）；
- 新增干净 checkout 验证 step（`git archive HEAD` 提取 → `node --check`
  三脚本 → 采集器 `--help` 零仓库上下文运行）。

## 8. 工件 sha256（本轮提交字节；证据 JSON 同步）

采集器 `37a01903…`→本轮更新后以 evidence JSON 为准；适配器/生成器/共享守
卫/测试文件的 sha256 全部记录于
`docs/ops/evidence/ledger-collection-prep-{verify,dual-eval}.json`。

## 9. 表述精度修正

"零残留/保护已生效"类表述已删除或限定：residue 断言标注**测量范围**
（ci 通道、排除 blocker/fixture 后端）；prod 通道客户端 kill 后由服务端
bound 收尾（本轮 teardown 实测）；静态钉死与动态证明分开标注
（`docs/ops/evidence/ledger-collection-prep-verify.json` 的
`claim_accuracy`）。

## 10. 未执行清单（红线）

生产 SSH/采集、生产 workflow dispatch、合并、部署、DDL、admission 登记、
provider 调用、同步、ACTIVE——**均未执行**；PR399 保持 draft；既有
main-only workflow 零修改；bridge 诊断策略未改动（`bridge_missing` 等仍为
信息性诊断，未升格为业务阻塞）。
