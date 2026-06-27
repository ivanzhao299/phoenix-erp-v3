# 分步解冻 + 生产部署 · 安全切换运行手册 — 2026-06-27

> 目的：把冻结期堆积的 ~80 批未部署改动，按最安全方式分类、按优先级落地生产，每步跑绿再下一步。
> 本手册为 **docs-only**，不 push main、不触发部署。执行节点明确标注「需用户触发 / 需稳定运维通道」。

## 0. 必须先认清的结构现实（决定手册形态）

1. **没有 staging。** main 里无 `staging-deploy.yml`，staging 基础设施未搭建 → 没有"先在安全环境跑绿"的地方。
2. **代码已全在 main。** ~80 批改动早已合入；`deploy.yml` 只部署**当前 main**。所以"分波部署已合并的代码"**不被部署链原生支持**——一次部署 = 生产从落后态**一跳到最新 main**。
3. **生产落后且有漂移。** R1：`CODE_NOT_DEPLOYED` + schema/history 漂移未结；W1 DB 矩阵 Gate 未做。
4. **本会话环境摸不到生产**（无 prod SSH、SSH banner 不稳）→ 无法触发后观测/验证/回滚。
5. **push main = 红线**（GUARDRAILS `push_allowed=false`/`production_deploy_allowed=false`）。

> 结论：真正的"分步跑绿"只有两条合规路径——**(A) 先搭 staging 验证全量 → 一次受控生产切换**，或 **(B) 先做 W1 DB Gate 控制迁移风险 → 一次受控全量 image 切换**。「把已合并代码在生产上分波」需要**重建发布分支**（cherry-pick 分波），代价高且偏离现有链路，不推荐。

## 1. 风险分级（把堆积改动按"碰什么"分层）

| 层 | 内容 | 对应 deploy mode | 风险 | 可逆性 |
|---|---|---|---|---|
| **T0 docs/ops** | 报告、计划、runbook | 不触发部署 | 无 | — |
| **T1 前端可见性** | sidebar/menu gate、center cards、RBAC 前端原子化、移动端菜单矩阵、图标 | `web` | 低（只重启 web，跳迁移） | 重发旧 web 镜像 |
| **T2 后端运行时守卫（无迁移）** | DataScope fail-closed、lookup/org 守卫、controller 原子权限、Chanjet 密钥处理 | `api`（`run_mig=false` 时） | 中（重启 api） | 重发旧 api 镜像 |
| **T3 DB 迁移** | `1782047418112-SeedSettingsOperationalAtomicMenus`、`1782052418112-RepairRolePermissionMatrixAtomicity`（删 56 粗授予+433 原子 upsert）、其它待跑 TS 迁移 | `api`/`full`（`run_mig=true`） | **高**（改 schema/授权，叠加 R1 漂移） | 需备份恢复（非镜像回滚） |
| **T4 数据写** | file_metadata 回填、账户激活、初始导入 | 无（走运维脚本/独立 Gate） | **高** | 需备份恢复 |

> 优先级原则：**T3 迁移是不可逆的核心风险，必须先于 image 切换、单独受控完成（= W1 Gate）。** T1/T2 是 image 切换，可镜像回滚，风险次之。

## 2. 推荐安全序列（每步含绿灯判据 + 回滚）

> ⚠️ 每个"执行"步骤都需**用户在稳定运维通道上触发**；本会话不代为 push main / 触发部署。

### 步骤 S0 — 解冻前置（只读，可现在做）
- 跑 `node scripts/ci/check-freeze-boundaries.mjs` 列出本次要解冻的边界文件清单。
- 跑 `scripts/ops/audit-role-permission-matrix.mjs`（**生产只读**，SSH 并发 1）确认 live `sys_role_menu_permission` 实库残留 + 缺失原子 `sys_menu` 行。
- **绿灯判据**：拿到实库菜单/授权/迁移状态快照；无写操作。
- **阻塞**：需稳定生产只读 SSH 通道（当前不稳）。

### 步骤 S1 — W1 DB Gate（T3，最高优先、单独受控）
- 备份：`pg_dump sys_menu sys_role_menu_permission` + 全库快照（落 `/opt/phoenix-erp-backups/`）。
- 按 S0 快照：①回填缺失原子 `sys_menu` 行 → ②apply `1782047418112` → ③apply `1782052418112`（删 56 粗授予）→ ④确认 `migrations` 表记录。
- **绿灯判据**：迁移 run 成功；后检 `coarse_non_admin_grants=0`、原子菜单行齐；`bump perms_version` 生效；无 R1 漂移加重。
- **回滚**：从备份恢复 sys_menu/sys_role_menu_permission；或迁移 down()。
- **阻塞**：需用户批准生产 DB 写 + 稳定通道。

### 步骤 S2 — T1 前端可见性切换（`web` mode）
- 触发：push main（或 `workflow_dispatch mode=web`）。detect-changes 应判 `web`。
- **绿灯判据**：CI test job 全绿（API/Web tsc、menu-atomicity gate、freeze gate 带 `ALLOW_FREEZE_TOUCH=true`、W5 closeout）；部署后 `/api/health` 200、web 200/307；**5 主体重登冒烟**侧菜单正确。
- **回滚**：重发上一已知良好 web 镜像（image ID 见 P1-007 证据）。

### 步骤 S3 — T2 后端守卫切换（`api` mode，run_mig=false）
- 前提：S1 迁移已落且稳定（避免 api 启动撞缺列）。
- **绿灯判据**：CI 全绿；部署后 `/api/health` 200、关键接口 200、DataScope 越权返回 403、无 500 "column does not exist"（g197 铁律）。
- **回滚**：重发上一已知良好 api 镜像。

### 步骤 S4 — 验收矩阵（= RBAC 审计 task4）
- **王乐金 / 刘汉涛 / 财务 / 采购 / 管理员** 逐人核 左菜单·中心卡片·按钮·接口 四向一致（18 条实测清单见 `RBAC_PARENT_PERMISSION_CLEARANCE_AUDIT_20260627.md`）。
- **绿灯判据**：18 条全过；无"看得到点不动/看不到该看的"drift（D1/D2/D3）。
- 这同时关闭 NEXT_PLAN P0-1 试点用户矩阵取证。

### 步骤 S5 — 收尾批次（解冻后代码批）
- W3 master-data type-aware、W4 按钮/action-bit（含 D1/D2/我撤回的 Sidebar 清理）、W6 采购审批选人、W5 附件收敛 —— 各自 PR → CI 绿 → 随 `web`/`api` 波部署 → S4 复测。
- W7 Chanjet 签名回调 smoke、W8 生产服务器修复线（P0-001/003/004、P1-001/007）走各自独立 Gate。

## 3. 每步通用绿灯门（跑绿才进下一步）
1. `pnpm --filter ...tsc --noEmit`（API+Web）0 errors。
2. `node scripts/ci/check-menu-permission-atomicity.mjs` 绿。
3. `node scripts/ci/check-freeze-boundaries.mjs`（解冻波带 `ALLOW_FREEZE_TOUCH=true`，且**人工复核**该波边界文件确属预期）。
4. TS 迁移 `down()` gate + no-data-DML gate（含迁移波）。
5. `node scripts/check-nullable-in-unique.js` 绿。
6. W5 closeout **不得**滥用 `ALLOW_SECURITY_TOUCH` 旁路（发布前复核历史旁路记录，见计划 §5）。
7. 部署后：`/api/health` 200 + `ENV=production` + DB connected；关键域 smoke。

## 4. 解冻机制
- 冻结闸 `check-freeze-boundaries.mjs`：触碰 `apps/api|web`/迁移/entity/RBAC/财务/采购/部署链 → 需 `ALLOW_FREEZE_TOUCH=true`。
- **分波解冻 = 每波只放行该波边界**，并人工确认无越界文件；不一次性全局解冻。

## 5. 执行前置（不在本会话掌控，需用户/运维落实）
1. **稳定生产运维通道**（SSH banner 不稳是 S0/S1 硬阻塞；先修通道或批准替代证据通道）。
2. **生产环境 GitHub `environment=production` 审批** + 谁来 push main（红线，用户触发）。
3. **当前生产 DB 备份 + 回滚镜像 ID 就位**（P1-007 已部分取证）。
4. **是否补 staging**（若选最安全路径 A，需提供独立 DB/文件/env 输入）。

## 6. 诚实结论
- 本手册 docs-only，未 push main、未部署、未写库。
- 在**无 staging + 代码已全在 main + 生产漂移 + SSH 不稳**下，"分步跑绿再下一步"**无法由本会话盲目执行**；最安全可行 = 先 W1 DB Gate（S1）再一次受控 image 切换（S2/S3）+ 5 主体验收（S4），或先补 staging 走路径 A。
- 任一执行步骤需用户在稳定通道上触发并承担生产风险；我可在通道就位后按本手册逐步陪跑、每步卡绿灯。
