# G36 · 顶级 migrations/ allowlist 锁定（F5-1 治理）

## 一句话
G34 暴露 F5：生产 Deploy 跑 `apps/api/migrations/2026*.sql`，不跑顶级 `/migrations/`。G34 4 个 mig 误放顶级 → 完全没跑（手动 SSH 补救）。G36 用 allowlist 锁顶级目录禁增删，强制新 SQL 走 `apps/api/migrations/`。

## 审计

### deploy.yml 跑 mig 的真实路径
```yaml
- name: Run DDL migrations (生产)
  for f in $(ls apps/api/migrations/2026*.sql | sort); do run_db_migration "$f"; done
```
顶级 `/migrations/` 完全不被 Deploy 覆盖。

### 历史现状
- 顶级 46 个 SQL 文件（5/25-6/4 baseline + 一次性 mig），可能从未在生产跑过 — 生产 schema 来自 `apps/api/migrations/v3_schema_complete.sql`
- 自 G34 起，本目录冻结 — 任何新 SQL 必须放 `apps/api/migrations/`

## 改造

### 1. allowlist 基线
`migrations/.allowlist`：46 个历史文件名（按字母序）

### 2. CI step（Type-check & Regression 任务开头）
```yaml
- name: Lock top-level migrations/ allowlist (F5-1)
  run: |
    actual=$(ls migrations/ 2>/dev/null | grep -v '^\.allowlist$' | sort)
    expected=$(sort migrations/.allowlist)
    if ! diff <(echo "$actual") <(echo "$expected") > /tmp/_diff.log; then
      echo "::error::❌ 顶级 migrations/ 与 allowlist 不符。新 SQL 必须 apps/api/migrations/"
      cat /tmp/_diff.log
      exit 1
    fi
    echo "✅ 顶级 migrations/ 已锁定（46 个历史 SQL）"
```

### 3. CLAUDE.md 写规则
```md
### 新 mig 必须放 apps/api/migrations/（G36 锁定）
- 生产 Deploy 跑 apps/api/migrations/2026*.sql，不跑顶级 /migrations/
- 顶级 /migrations/ 自 G34 起冻结（46 个历史 SQL，由 .allowlist 锁定）
- CI step 检测顶级目录任何变动 → 红灯
```

## 验证

### CI run 27130961251 — 全绿
- Type-check & Regression: success（含新 allowlist step）
- Build & Push Images: success
- Deploy to Production: success

### 本地违规测试
```bash
$ echo "-- dummy" > migrations/test_violation.sql
$ ls migrations/ | grep -v allowlist | sort > /tmp/actual
$ diff /tmp/actual migrations/.allowlist
47d46
< test_violation.sql
$ echo $?
1   # 非 0 → CI 红灯
```

放置违规文件 → diff 返 rc=1 → CI step `exit 1` → 整个 workflow 红灯。

## 改动清单

- `migrations/.allowlist`（新建，46 行）
- `.github/workflows/deploy.yml`（Type-check 任务开头加 step，+19 行）
- `CLAUDE.md`（"踩过的坑"段落补条目，+5 行）

## F5-2 留 G37

`sys_user_role.archived_at` 列 + 老 seed mig 加守卫：

需 schema 改动 + 改老 mig `WHERE NOT EXISTS (... archived_at IS NULL)`。
工程量较大（影响所有 user_role 操作），单独 G37 推。

当前王玮华场景靠"G34 时间戳 > 老 mig 序列"覆盖；如果未来其他用户有类似情形仍要复制 G34 模式。

## Tag
`v3-g36-migrations-allowlist-lock`
