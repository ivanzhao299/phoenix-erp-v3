# 生产 ledger 单次只读采集与离线双 inventory 评估包（执行前审阅）

> 状态：**准备完成，未执行**。本文档是执行前审阅包；生产侧任何动作（SSH、
> dispatch、采集）均未发生，等待独立 review 批准后才可执行。
> 基线：PR399 exact head `0e6b1ee2702a39d815391744ee95855294480969`（draft、未合并）。

## 0. 基线核对（已执行）

| 项 | 结果 |
|---|---|
| worktree / 分支 | `/home/jinhuit/.codex/worktrees/3e7e/phoenix-erp-v3` / `codex/r42-hard-admission-design` |
| head | `0e6b1ee2702a39d815391744ee95855294480969`，无未提交改动 |
| 远端 main | `22b47aebb50d2253afb465a25abc66ded26e873f`（PR399 未合并；两 ref 迁移目录差异恰为 admission 迁移一个文件） |
| 已派发 run | 该 head 10/10 workflows success，无进行中 run |

## 1. 既有生产 SSH 通道复核（只读复核，未修改）

复核对象：`.github/workflows/production-ledger-preflight.yml`（生产 ledger
preflight 的既有只读通道）。采集执行计划**完全复用**该通道的既有护栏，
不新增、不放宽：

- 触发：`workflow_dispatch` + `github.ref == 'refs/heads/main'` + 手工确认串
  `RUN_PRODUCTION_LEDGER_PREFLIGHT` + `environment: production-readonly`。
  **main-only 护栏原样保留**；不为运行检查提前合并 PR399——采集脚本由
  main checkout 交付（见第 3 节的合并前置条件）。
- SSH：`appleboy/ssh-action@v1`，secrets 引用不变
  （`DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_SSH_KEY`/`DEPLOY_PORT` +
  `DEPLOY_PROXY_*`），`command_timeout` 内执行；主机/账号/凭据全部由既有
  secrets 提供，**本文档不含也不猜测任何主机、账号或凭据**。
- 主机侧模式（既有）：`cd $DEPLOY_PATH` → 工作树清洁检查 → `mktemp -d
  /tmp/...` 一次性目录 → base64 解码受审文件 → `node --check` → 执行 →
  `trap rm -rf` 清理。

## 2. 数据库只读范围（硬边界）

只读取两张 ledger 表与连接元数据：

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
SELECT … FROM schema_migrations;   -- filename, applied_at
SELECT … FROM migrations;          -- name, timestamp
SELECT json_build_object('server_version', …, 'snapshot', txid_current_snapshot()::text, 'transaction_timestamp', …);
COMMIT;
```

- 单会话单事务：两表来自**同一只读一致性快照**（Repeatable Read；
  `snapshot` 身份写入采集文档佐证）。
- **禁止**：业务表、环境变量、凭据——采集器代码不读取、输出不含（隔离
  验证含输出内容的凭据/env 断言）。
- READ ONLY 事务内不可能写入；REPEATABLE READ 下两条 SELECT 共享同一快照。

## 3. 采集执行计划（精确调用清单——待批准，未执行）

前置条件：PR399 合并进 main（采集脚本与评估器按第 6 节 SHA 从 main
checkout 交付；**若 PR399 未合并则本轮采集不得执行**——不提前合并）。

主机侧调用序列（在既有 production-ledger-preflight workflow 的 SSH step
模式内，`DEPLOY_PATH` 下）：

```bash
TMP_DIR="$(mktemp -d /tmp/phoenix-ledger-collect.XXXXXX)"   # 临时文件范围
trap 'rm -rf "$TMP_DIR"' EXIT
# base64 交付受审采集脚本（main checkout 内容）并校验 sha256 后：
node --check "$TMP_DIR/ledger-readonly-collect.mjs"
MIG_MODE=prod node "$TMP_DIR/ledger-readonly-collect.mjs" --db-mode prod \
  > "$TMP_DIR/collection.json"
sha256sum "$TMP_DIR/collection.json"
cat "$TMP_DIR/collection.json"        # 回传 runner 归档为证据
```

- 容器调用（采集器 prod 通道，与既有 preflight 逐字节一致）：
  `docker compose exec -T db sh -c 'psql -X -At -v ON_ERROR_STOP=1 -U
  "$POSTGRES_USER" -d "$POSTGRES_DB"'`（凭据只在 DB 容器内解析）。
- 临时文件范围：仅 `$TMP_DIR`（脚本副本 + collection.json），`trap` 清理；
  runner 侧证据落 `docs/ops/evidence/` 新文件。
- **离线评估在任何 runner/本地执行，不触生产**：采集文档回传后，与
  main/PR399 双 inventory 的评估完全离线（第 5 节已本地验证同一流程）。

## 4. 采集脚本与 inventory 的 exact SHA / sha256

| 工件 | SHA / sha256 |
|---|---|
| 采集脚本 `scripts/ops/ledger-readonly-collect.mjs` | commit `0e6b1ee2702a39d815391744ee95855294480969`（PR399 head）；sha256 见 `docs/ops/evidence/ledger-collection-prep-verify.json` |
| 离线评估器 `scripts/ledger-preflight.mjs` | commit `0e6b1ee2`（本 PR 多轮已审） |
| 双 inventory 生成器 `scripts/ci/ledger-source-inventory.mjs` | commit `0e6b1ee2`；sha256 见 dual-eval 证据 |
| main inventory | `docs/ops/evidence/inv-main.json`（88 entries；sha256 见证据） |
| PR399 inventory | `docs/ops/evidence/inv-pr399.json`（89 entries；sha256 见证据） |

（PR399 合并后 main 与 PR399 的脚本内容一致；合并前采集不得执行，故
不存在"脚本双版本"窗口。）

## 5. 隔离验证与双评估结果（已执行，全部本地）

- **采集器隔离验证（PG18，6/6 PASS）**：正常采集（单 JSON/双表/单快照/
  无凭据无 env 无业务表断言）、锁冲突（lock_timeout 有界拒绝、blocker
  锁保留、采集连接/事务/查询零残留、释放后成功）、连接失败（有界）、
  异常输出（LEDGER_COLLECT_ERROR，绝不输出貌似合法的文档）、客户端 bound
  （挂起 psql 在 client timeout 被 SIGKILL）、**服务端真终止证明**
  （statement_timeout/lock_timeout 各自真实取消查询 57014 并中止事务，
  pg_stat_activity 无残留）。详见
  `docs/ops/evidence/ledger-collection-prep-verify.json`。
- **同一样本双评估**：采集样本（169 legacy + 85 migrations 行，单快照）
  分别对 main(88) 与 PR399(89) inventory 评估：
  - main：`pass=true`，applied=84，pending=4（恰为 Phase1 四条）
  - PR399：`pass=true`，applied=84，pending=5（Phase1 四条 +
    `CreateChanjetExecutionAdmissions1791878400000` 独立迁移）
  - 异常清单：两份评估 `failures=[]`；唯一跨 inventory 差异 = PR399
    pending 中的单条 admission 迁移（独立迁移语义的预期体现）。
  - 语义保持：历史 88 / admission 独立（从不标记 applied）/ 169 legacy /
    retired registry 原样。
  - 详见 `docs/ops/evidence/ledger-collection-prep-dual-eval.json`。

## 6. 证据索引（全部为新文件；历史 evidence 未改写）

- `docs/ops/evidence/ledger-collection-sample.json`（采集样本原文）
- `docs/ops/evidence/ledger-collection-prep-verify.json`（隔离验证 + 边界）
- `docs/ops/evidence/ledger-collection-prep-dual-eval.json`（双 inventory +
  双评估 + pending/异常清单）
- `docs/ops/evidence/inv-main.json` / `inv-pr399.json` /
  `eval-main.json` / `eval-pr399.json`（原文）

## 7. 未执行清单（本轮红线）

生产 SSH/采集、生产 workflow dispatch、合并、部署、DDL、admission 登记、
provider 调用、同步、ACTIVE——**均未执行**；PR399 保持 draft；main-only
护栏与既有 workflow 未修改。
