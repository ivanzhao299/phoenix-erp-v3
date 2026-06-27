# 部署分层(2026-06-19 起)

> 一句话:**改 CSS 跑 fast-css(秒级),改前端跑 web(分钟),改后端/DB 跑 api,改基础设施跑 full**。
> Workflow 默认按 changed files 自动判定,手动可在 GitHub Actions UI 选 mode 强制覆盖。

---

## 一、四种模式速查

| 模式 | 触发场景 | 改什么 | 不改什么 | 目标耗时 | 重启容器 | 跑测试 | 跑迁移 | 推镜像 |
|------|----------|--------|----------|----------|----------|--------|--------|--------|
| `fast-css` | UI 微调 / 颜色字号 / 紧急样式覆盖 | `apps/web/public/runtime-design-system.css` | 镜像 / 容器 / DB | **3-10 s** | ❌ | ❌ | ❌ | ❌ |
| `web` | 改前端代码(无 dep / 无 schema) | `apps/web/**` 源码 | API / DB / Dockerfile | 2-5 min | ✅ 只重启 web | ✅ | ❌ | ✅ web |
| `api` | 改后端 / 加迁移 / 改 service | `apps/api/**` + 迁移 + db-migrate.sh | 前端 / Dockerfile | 5-12 min | ✅ api + web | ✅ | ✅ | ✅ api |
| `full` | deps / Dockerfile / docker-compose / nginx / workflow / api+web 同改 | 全部 | — | 5-12 min | ✅ 全部 | ✅ | ✅ | ✅ api+web |

---

## 二、fast-css 模式 — UI 样式热更新通道

### 工作原理

```
   编辑                          push                       ~3-10s
┌──────────────────────────────┐   ┌──────────────────┐   ┌────────────────────────────────────────┐
│ 改 apps/web/public/          │ → │ git commit/push  │ → │ Actions detect-changes 判定 fast-css   │
│   runtime-design-system.css  │   │ origin/main      │   │ → scp 单文件到生产                     │
└──────────────────────────────┘   └──────────────────┘   │   /opt/phoenix/static-overrides/       │
                                                          │ → nginx alias 立即生效(无 reload)      │
                                                          └────────────────────────────────────────┘

浏览器侧:no-cache + ETag 重验证 → mtime 一变就 200 + 新 CSS,F5 即可看新效果
```

### nginx 链路

```
GET /runtime-design-system.css
    ↓
location = /runtime-design-system.css
  ├ 优先:/opt/phoenix/static-overrides/runtime-design-system.css(host 文件,fast-css scp 落点)
  └ 兜底:proxy → web 容器 public/(镜像内 build-time 版本)
    ↓
返回头:Cache-Control: no-cache, must-revalidate, max-age=0
       X-RDS-Source: host-override | web-fallback
```

### 用法示例

**改紧急配色:**

```css
/* apps/web/public/runtime-design-system.css */
:root {
  --status-warning: #ea580c;          /* 橙色更醒目 */
  --status-warning-bg: #fff7ed;
}
```

**临时隐藏某 banner:**

```css
.marketing-banner { display: none !important; }
```

**调单页字号:**

```css
[data-page="dashboard"] .cockpit-kpi-value { font-size: 22px; }
```

**部署:**

```bash
git add apps/web/public/runtime-design-system.css
git commit -m "fast-css: 调整 warning 配色"
# post-commit hook 自动推 main → workflow 自动判定 fast-css → 3-10s 上线
```

**验证:**

```bash
# 看 nginx 头确认 host-override 生效
curl -sI https://erp.eggslao.com/runtime-design-system.css | grep -i x-rds-source
# X-RDS-Source: host-override  ← 用 host 覆盖文件
# X-RDS-Source: web-fallback   ← 退回镜像版(host 文件不存在)
```

### 红线 / 不适合 fast-css 的场景

- ❌ 改组件结构(JSX / TSX) → 走 web
- ❌ 加新 dict / 主数据 → 走 api(含迁移)
- ❌ 改 design-system tokens 默认值(变 globals.css) → 走 web

---

## 三、web 模式 — 只构建 / 重启 web

### 触发

`apps/web/**` 改动(组件 / 页面 / hooks)但 `apps/web/package.json`、`pnpm-lock.yaml` 未变,且 `apps/api/**` 未动。

### 流程

```
test job (type-check api+web, regression all)   ~3-5 min
        ↓
build-push (matrix 跳过 api, 只构 web 镜像)      ~2-3 min  (gha cache 命中后)
        ↓
deploy job:
  pull web 镜像
  up -d --no-deps --wait web                     (api 不动 → chanjet appTicket 等内存状态保留)
  smoke test
```

### 关键
- API 容器**完全不动**:解决 `feedback_frequent_deploys_break_stateful_services` —— chanjet `appTicket` / token cache 内存状态保留。
- 不跑 db migration、不更新 .env。

---

## 四、api 模式 — 后端 + 数据库

### 触发

`apps/api/**` 改动 / `apps/api/src/database/migrations/**` 新迁移 / `scripts/db-migrate.sh` 改。

### 流程

包含 web 模式所有步骤 **+** 跑 DDL 迁移、TS 迁移、Phase C 验证,重启 api。Web 镜像不构(若未改),但 web 容器仍会重启吗?

> 当前实现:web 容器**只有**改了 web 才会 `up -d --wait web`。api 模式下若 web 没改 → web 容器不动。

---

## 五、full 模式 — 全栈

### 触发(自动)

- `apps/web/package.json` / `pnpm-lock.yaml` 改(deps 变)
- `Dockerfile`、`docker-compose.yml` 改
- `nginx/erp.eggslao.com.conf` 改
- `.github/workflows/**` 改
- `apps/api/**` + `apps/web/**` 同时改

### 流程

完整流程,等同 2026-06-19 改造前的旧 deploy.yml,**唯一区别是 docker 缓存策略调整**(见 §七)。

---

## 六、手动选择 mode

GitHub UI → Actions → CI/CD — Build & Deploy → "Run workflow":

```
mode: [auto | fast-css | web | api | full]
skip_deploy: false
```

`auto` 与 push 触发自动判定一致。

`auto` 之外强制覆盖适合:
- 自动判定失误 / 文档边界改了但实际需要构镜像 → 选 `full`
- 紧急想跳测试只发样式 → 选 `fast-css`(只在已知 CSS 已本地 review 时用)

---

## 七、Docker 缓存策略(2026-06-19 调整)

| 命令 | 行为 | 旧策略 | 新策略 |
|------|------|--------|--------|
| `docker image prune -a -f` | 删未被容器引用的镜像 | ✅ 保留 | ✅ 保留 |
| `docker builder prune -af` | **删全部** builder cache | ❌ 每次冷构建 | ❌ 不再用 |
| `docker buildx prune --filter "until=24h" --keep-storage=5GB` | 只清 24h 前 + 保留至少 5GB | — | ✅ 新策略 |

**原理**:Buildx GHA cache 在 GitHub Actions 端,docker layer cache 在生产服务器端。
之前每次部署 `docker builder prune -af` 把本地 layer cache 也全清了 → 即使 GHA cache 命中,生产 docker pull 后仍要重组层 → 慢。
保留 24h / 5GB 后,频繁部署的层(node:20-alpine 基础 / node_modules)**留存**,真正旧的(7 天前的废弃层)按时间窗自动淘汰,磁盘不会无限涨。

---

## 八、首次部署初始化清单

新机器 / 第一次部署 fast-css 通道之前,要在生产服务器一次性操作:

```bash
ssh erp
mkdir -p /opt/phoenix/static-overrides
chmod 755 /opt/phoenix/static-overrides
# nginx.conf 已含 alias 配置,full deploy 自动会落
# runtime-design-system.css 占位会在 full / api / web deploy 时由脚本自动创建
```

第一次 full deploy 跑过 nginx 也会自动 reload 拿到新 location 配置。

---

## 九、故障回滚

### fast-css 回滚
```bash
ssh erp
# 方案 A:把 host 覆盖文件清空 → 回退到镜像版
> /opt/phoenix/static-overrides/runtime-design-system.css
# 方案 B:rm 文件 → nginx try_files 走 web-fallback
rm /opt/phoenix/static-overrides/runtime-design-system.css
```

### web/api/full 回滚

镜像 tag 当前固定 `latest`,无版本化。回滚方式:
- 短期:`git revert` 触发新部署
- 中期:加 `type=sha,prefix=,suffix=,format=short` 给镜像打 sha tag,生产可手动 `docker tag` 拉旧 sha 回退(待 g200+ 治理)

---

## 十、SLA 期望对比

| 场景 | 旧 deploy | 新分层 deploy |
|------|-----------|---------------|
| 改个颜色 | ~8 min(整 web 重构) | **~3-10 s**(fast-css) |
| 改前端组件 | ~8 min(api+web 都构) | **~3-5 min**(只 web) |
| 改 service | ~8 min | **~5-8 min**(api 重建+迁移) |
| 改 deps / Dockerfile | ~8 min | ~8 min(full,不变) |

---

## 十一、附:与现有规则的关系

- `feedback_review_before_push`:**fast-css 模式仍然属于视觉改动**,push 前必须本地浏览器看一眼或截图给用户(skill 加 hook 提醒后续补)
- `feedback_local_batch_then_push`:fast-css 是例外 — 它就是给"想边看边调"用的快通道,可逐次小推
- `feedback_frequent_deploys_break_stateful_services`:web 模式专治此痛点(api 容器不再被无意义重启)
