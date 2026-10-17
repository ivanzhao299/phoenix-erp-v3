# 生产 ledger 单次只读采集与离线双 inventory 评估包（执行前审阅 · v2）

> 状态：**准备完成，未执行**。本文档是执行前审阅包；生产侧任何动作（SSH、
> dispatch、采集）均未发生，等待独立 review 批准后才可执行。
> 基线：PR399 分支 `codex/r42-hard-admission-design`，本轮提交的 exact SHA
> 见交付报告；PR399 保持 draft、**无需提前合并**（见第 3 节交付路径）。

## 0. 基线核对（已执行）

| 项 | 结果 |
|---|---|
| worktree / 分支 | `/home/jinhuit/.codex/worktrees/3e7e/phoenix-erp-v3` / `codex/r42-hard-admission-design` |
| 远端 main | `22b47aebb50d2253afb465a25abc66ded26e873f`（PR399 未合并；两 ref 迁移目录差异恰为 admission 迁移一个文件） |
| 已派发 run | 前基线 `0e6b1ee2702a39d815391744ee95855294480969` CI 10/10；本轮提交后 CI 结果见交付报告 |

## 1. 既有生产 SSH 通道复核（只读复核，未修改）

复核对象：`.github/workflows/production-ledger-preflight.yml`（生产 ledger
preflight 的既有只读通道）。采集执行的**交付机制**复用该通道已验证的模式：
runner checkout 受审 ref → `base64 -w0` 受审单文件 → ssh-action `envs` 交付
→ 主机侧 `base64 -d` 落盘 + `sha256sum` 比对 + `node --check` → 执行；
`mktemp -d /tmp/...` 一次性目录 + `trap rm -rf` 清理。**不猜主机、账号或
凭据**（全部由既有 secrets 提供）；**不修改该 workflow 的 main-only 护栏或
任何既有 main workflow**。

## 2. 数据库只读范围（硬边界）

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
SELECT … FROM schema_migrations;   -- filename, applied_at
SELECT … FROM migrations;          -- name, timestamp
SELECT json_build_object('server_version', …, 'snapshot', txid_current_snapshot()::text, 'transaction_timestamp', …);
COMMIT;
```

- 单会话单事务：两表来自**同一只读一致性快照**（Repeatable Read；snapshot
  身份写入采集文档佐证）。
- **禁止**：业务表、环境变量、凭据——采集器自包含、不读取、输出不含
  （隔离验证含输出内容的凭据/env 断言）。
- READ ONLY 事务内不可能写入；两表同快照由事务隔离保证。

## 3. 交付路径（无需提前合并 PR399，可审计）

采集器是**自包含单文件**（`scripts/ops/ledger-readonly-collect.mjs`，无任何
仓库内 import——staging 实测单文件 `node --check` 后直接运行，见第 5 节）。
交付走既有模式的 b64-over-SSH：

```text
runner（checkout 批准的 PR399 exact ref，fetch-depth 1）：
  test "$(git rev-parse HEAD)" = "<批准的 exact SHA>"
  node --check scripts/ops/ledger-readonly-collect.mjs
  COLLECTOR_B64="$(base64 -w0 scripts/ops/ledger-readonly-collect.mjs)"
  COLLECTOR_SHA256="$(sha256sum scripts/ops/ledger-readonly-collect.mjs | cut -d' ' -f1)"
SSH（appleboy/ssh-action@v1，既有 secrets；envs 交付两个值）：
  TMP_DIR="$(mktemp -d /tmp/phoenix-ledger-collect.XXXXXX)"; trap 'rm -rf "$TMP_DIR"' EXIT
  printf '%s' "$COLLECTOR_B64" | base64 -d > "$TMP_DIR/ledger-readonly-collect.mjs"
  test "$(sha256sum "$TMP_DIR/ledger-readonly-collect.mjs" | cut -d' ' -f1)" = "$COLLECTOR_SHA256"
  node --check "$TMP_DIR/ledger-readonly-collect.mjs"
  MIG_MODE=prod node "$TMP_DIR/ledger-readonly-collect.mjs" --db-mode prod \
    > "$TMP_DIR/collection.json"
  sha256sum "$TMP_DIR/collection.json"; cat "$TMP_DIR/collection.json"   # 回传归档
```

- 该交付以**批准的 exact SHA** 为源（runner checkout 该 ref），主机侧哈希
  比对防交付损坏；无合并动作，PR399 保持 draft。
- 材料化（将来把它落成一个 workflow 文件）是独立、可审阅的一步，须经
  批准后另行提交；本轮不 dispatch 任何 workflow。
- 临时文件范围：仅 `$TMP_DIR`（脚本副本 + collection.json），trap 清理。

## 4. 工件 exact sha256（本轮提交字节）

| 工件 | sha256 |
|---|---|
| `scripts/ops/ledger-readonly-collect.mjs`（采集器，自包含单文件） | `37a01903b2422796a7809d4d91852bddf6a554ba04055a0838fb6c86acffecc8` |
| `scripts/ops/ledger-offline-evaluate.mjs`（离线评估适配器） | `6dacb2f362a2ba9fdc000c8478977f4c7f8b369323c9ce46bdb7c8fd3c388b4e` |
| `scripts/ci/ledger-source-inventory.mjs`（双 inventory 生成器） | `fb70156dce0a57c094b1622101de4dad0ad7053c9cf6d0524038330e230feb17` |
| `docs/ops/evidence/inv-main.json` / `inv-pr399.json` | 见 `ledger-collection-prep-dual-eval.json` |
| 采集样本 `docs/ops/evidence/ledger-collection-sample.json` | 见 dual-eval `sample.sha256` |

（提交 exact SHA 以交付报告为准；上表为文件内容哈希，与提交后字节一致。）

## 5. 隔离验证与双评估结果（已执行，全部本地）

- **采集器隔离验证（PG18，6/6 PASS，CI 实跑同绿）**：正常、锁冲突（有界
  拒绝 + blocker 锁保留 + 采集连接/事务/查询零残留）、连接失败、异常输出、
  客户端 bound（SIGKILL）、**服务端真终止**（statement_timeout 与
  lock_timeout 各自真实 57014 取消并中止事务）。
- **fixture 破坏性防护（本轮新增）**：测试在**任何连接之前**校验专用库名
  （`^ledger_collect_`，`phoenix_erp` 探针实测拒绝）+ **同实例校验**（URL
  的库必须存在于指定容器、且两侧 server identity 一致），之后才允许
  DROP SCHEMA。
- **暂存交付实测（本轮新增）**：文档化暂存（临时目录单文件 → `node
  --check` → 运行）经 **prod 通道夹具**（`docker compose exec -T db …` 垫
  片转发到真实 PG）实际运行成功——单文件自包含，无仓库依赖（既有 6 项
  主验证 CI 通道，此项补齐 prod 通道）。
- **离线评估适配器（本轮新增，正式路径）**：`ledger-offline-evaluate.mjs`
  显式映射采集文档双表、加载完整 inventory/legacy 目录/retired registry，
  **缺失或畸形输入在评估前拒绝**；空账本 PASS 陷阱（直接 `--fixture 采集
  文档` 会忽略 inventory 且字段错配，实测全零 PASS）不复现。样本身份：
  PR399 inventory → PASS、applied=84、pending=5（Phase1 四条 + admission）。
- **双评估**：同一样本分别对 main(88)/PR399(89) inventory：main PASS
  pending=4（恰 Phase1）、PR399 PASS pending=5；`failures=[]`；唯一差异 =
  PR399 pending 单条 admission。语义保持：历史 88 / admission 独立（从不
  标记 applied）/ 169 legacy / retired registry 原样。

## 6. 证据索引（全部为新文件；历史 evidence 未改写）

- `docs/ops/evidence/ledger-collection-sample.json`
- `docs/ops/evidence/ledger-collection-prep-verify.json`（含新增防护与
  staging 实测记录）
- `docs/ops/evidence/ledger-collection-prep-dual-eval.json`（含离线适配器
  记录）
- `docs/ops/evidence/inv-main.json` / `inv-pr399.json` /
  `eval-main.json` / `eval-pr399.json`

## 7. 未执行清单（本轮红线）

生产 SSH/采集、生产 workflow dispatch、合并、部署、DDL、admission 登记、
provider 调用、同步、ACTIVE——**均未执行**；PR399 保持 draft；既有
main-only 护栏与 workflow 未修改。
