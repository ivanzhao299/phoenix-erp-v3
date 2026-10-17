# 生产 ledger 单次只读采集与离线双 inventory 评估包（执行前审阅 · v4）

> 状态：**准备完成，未执行**。生产侧任何动作均未发生。
> 基线：PR399 分支 `codex/r42-hard-admission-design`，本轮提交的 exact SHA
> 见交付报告；PR399 保持 draft、**无需提前合并**。

## 0. 基线核对（已执行）

worktree `/home/jinhuit/.codex/worktrees/3e7e/phoenix-erp-v3`、分支
`codex/r42-hard-admission-design`；远端 main `22b47aeb`（两 ref 迁移目录差异
恰为 admission 迁移一个文件）；前基线 `239a01c3` CI 10/10。

## 1. 编号→实际代码位置→反例→测试结果（本轮整合；#7 保留已通过实现）

| # | 要求 | 实际代码位置 | 对应反例（真实执行） | 测试结果 |
|---|---|---|---|---|
| 1 | 不以共享函数代替身份校验；破坏前证明同实例+本次所有权；拒绝时两侧零变化 | `scripts/ci/ledger-fixture-guard.mjs`（标记表 `ledger_fixture_owner.run_nonce` 经**容器 psql 与 URL 连接两侧**读取并等于本次 nonce）；两套件 before：供给仅走容器通道，守卫（带 nonce）先于任何 URL 侧操作 | 异 nonce 库 / 无标记库 → 守卫拒绝；**两侧行、schema 与 pg_database 列表前后快照逐一相等** | collection 7/7（含新零变化负例）；staging 5/5 |
| 2 | （历史：审计/完成门等，已闭合） | 见历轮矩阵 | — | 持续 CI 实跑 |
| 3 | 离线反例逐个成真 CLI 回归 | `scripts/ci/ledger-collection-staging.test.mjs`（`runAdapterCli` spawn 真实 CLI）+ `scripts/ops/ledger-offline-evaluate.mjs`（退出契约） | BLOCK=1（legacy_missing 真评估）；**14 个拒绝反例各 exit 2**（缺参×4、不可读、非 JSON、schema 错、行非数组、缺 snapshot 溯源、行畸形、inventory 条目畸形/空、legacy 目录空、未知参数） | staging 5/5 |
| 4 | 整数超时；客户端 kill 须证明作业已启动、超时实际发生、按准确 PID 收尾 | 采集器 `parseArgs`（非整数拒绝，绝不静默取整）；`ledger-collection-staging.test.mjs` 客户端 kill 测试（垫片 fd3 保 stdin、真实语句后台达服务端） | 挂起 transport 只能被 2s 客户端 kill 结束（退出≈2s + ETIMEDOUT）；等待锁的采集 backend **按捕获的确切 PID** 在服务端 bound 内消失；无遗留中止事务 | staging 5/5（含该测试） |
| 5 | （历史：CI 覆盖，已闭合并本轮扩展） | fixture job：paths 补 7 文件；chain(4)/classifier(20) 接线；各步 `# skipped 0`+精确通过数；干净 checkout step | — | CI 全绿（本轮提交后见报告） |
| 6 | SSH workflow 7 项 + 无生产网完整链契约测试 | 链体材料化：`scripts/ci/ledger-collection-chain.mjs`（runner）+ `scripts/ops/ledger-collection-host.sh`（主机）；workflow 薄包装（修复：依赖安装缺失、`$COLLECTOR_REF` 未定义、结果仅依赖不存在的 action output、摘要未在 runner 侧校验、失败无归档） | **完整链 4 类**：normal=0（证据：bind/collection+digest/双侧评估/SUMMARY/host 证据）；BLOCK=1（真裁决+证据保留+无 FAILURE 标记）；拒绝=2（FAILURE.txt stage=bind）；崩溃=3（FAILURE.txt+transport stdout/stderr 归档） | chain 契约 4/4 |
| 7 | 保留已通过实现 | 未改动（离线双评估语义：88/admission 独立/169/retired） | — | 本地复验 PASS |
| 8 | 四类步骤退出+证据保留；classifier 接入 CI | chain 契约测试即四类验证；classifier step 新接入 fixture job | 同 #6 四类 + classifier 20/20 | 全绿 |
| 9 | （历史：finalizer，已闭合） | 未改动 | — | first-sync 32/32 持续 |
| 10 | 文档矩阵/样本/摘要修正 | 本文件 v4 + `ledger-collection-prep-verify.json`（14 用例全部带实测表述与真实 sha256） | — | 哈希与提交字节一致 |
| 11 | 逐项编号交付、未闭合如实标注 | 本表 | — | 本轮全部闭合项如实列出；无未闭合项遗留 |

## 2. 链体七阶段（材料化并经契约测试）

干净依赖（deps：node --check ×3 + bash -n + typescript 可解析）→ 来源绑定
（HEAD===批准 ref 且 collector sha256===批准摘要，双钉）→ 暂存（主机：解码+
sha256+node --check 先于运行）→ stdout 回收（`COLLECTION_RESULT_B64=` 标记行
来自真实 transport stdout）→ 原始摘要校验（runner 侧重算 sha256===主机
RAW 摘要，字节级）→ 两侧评估（main + collection ref 双 inventory 同一快照）
→ 异常归档（`if: always()` artifact + 链内 FAILURE.txt/transport 输出）。

## 3. 未执行清单（红线）

生产 SSH/采集、生产 workflow dispatch、合并、部署、DDL、admission 登记、
provider 调用、同步、ACTIVE——**均未执行**；PR399 保持 draft；既有 main-only
workflow 零修改；bridge 诊断策略未改动。
