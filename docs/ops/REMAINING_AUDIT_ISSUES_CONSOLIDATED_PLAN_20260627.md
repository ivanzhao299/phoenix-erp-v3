# 审计遗留问题 · 统一收口计划 — 2026-06-27

> 综合来源：`docs/ops/*2026062{6,7}*.md`（~80 篇 remediation）+ `PHOENIX_ERP_PRODUCTION_READINESS_TASK_LIST.md`（P0–P3）+ `NEXT_PRODUCTION_READINESS_REMEDIATION_PLAN_20260626.md` + `runtime-memory/*` + `RBAC_PARENT_PERMISSION_CLEARANCE_AUDIT_20260627.md`（本会话）。
> 方法：3 个并行只读子代理分区抽取未结项 + 主代理合成。本计划为 docs-only，不写库/不部署。

## 0. 宏观判断（一句话）

**代码层基本做完，部署层几乎为零。** ~80 篇 06-26/27 remediation 无一篇真正闭环——全部卡在「冻结 + 待 W5 closeout + CI/CD + 生产 smoke + 用户重登」。所有 RBAC/DataScope 线索**收敛到同一个下游受控 Gate**（见 W1）。当前没有任何一项判 `GO`，全是 `GO_WITH_CONDITIONS`。

## 1. 单点收敛 Gate（最高优先 · 阻塞其余验证）

**W1 — DB 菜单/角色矩阵 Apply Gate**
- **现状**：已有正式迁移 `apps/api/src/database/migrations/1782052418112-RepairRolePermissionMatrixAtomicity.ts`（dry-run：原子授权 upsert=433，删非 admin 粗父授予=56）+ `1782047418112-SeedSettingsOperationalAtomicMenus.ts`（补 settings 原子菜单，含 down）。**均已写、未 apply**。
- **阻塞原因**：目标 DB 缺多条原子 `sys_menu` 行（`MENU_WORKFLOW_TODO/FIN2_DASHBOARD/PRC2_DASHBOARD` 等），且本地 TypeORM `migrations` 表为空 → 不能贸然删父授予。
- **执行序（六步）**：①确认目标 DB TypeORM 迁移状态 → ②确认 finance/procurement/workflow/master-data/settings/Store-Payment 原子菜单行齐 → ③回填缺失原子菜单 → ④回填角色→原子授权 → ⑤删 56 条非 admin 粗父授予 → ⑥**最小权限收紧**（role-owner pass，非兼容展开）。
- **需**：生产 DB 写 + 部署迁移 + 用户重登领新 JWT + 生产 smoke。**需 Gate + 备份 + 回滚。**
- **本会话冗余项**：我先前手写的 `docs/ops/runs/rbac-parent-clearance-20260627/01_coarse_menu_revoke_candidate.sql` 与上述迁移重复且更弱 → **作废，统一走 `1782052418112`**。`02_d3_cash_submenu_derive`（REVIEW_MANAGER/ANALYST 资金子菜单派生）若该迁移未覆盖，则并入第③步回填。

> 为什么是单点：06-26/27 几乎每篇 OPEN 文档都把"role matrix production reconciliation / business-owner 确认后删父授予 / 重登 smoke"列为后续——它们全指向 W1。**W1 不落地，下面 W2/W4 的验证都悬空。**

## 2. 剩余工作流（按依赖排序）

| 流 | 主题 | 关键未结项 | 依赖 | 类型 |
|---|---|---|---|---|
| **W1** | DB 角色矩阵 apply | 见上（56 粗授予 + 原子回填 + 最小权限收紧） | — | DB写+部署+Gate |
| **W2** | Org/legacy 别名清理 | 删 `MENU_SYS_ORG` 授予、清 `MENU_ORG_VIEW/MANAGE` 旧别名、确认生产角色经 `MENU_MD_ORG/COMPANY` 获权 | **W1 授予 parity 后** | DB写+业务确认 |
| **W3** | master-data 跨类型加固 | 跨类型端点 `/references/:type/:code`、`/code/next` 仍用 `MENU_MASTER_DATA` 超级码 → type-aware 原子化；center cards / approval registry 元数据父码残留 | 代码独立 | 改代码 |
| **W4** | 按钮/action-bit + 路由审计 | ①侧菜单"任意位显示 vs 后端精确位"补 `requiredPerm:'V'`（我审计 D1）②procurement 列表页按钮零 gating 引 `usePermission`（D2）③AuthGuard-only 端点路由审计 ④审批/采购/财务/设置 跨域入口+按钮级对齐 | 部分需 W1 后验证 | 改代码（冻结边界） |
| **W5** | 附件/上传收敛 | 业务表历史裸附件盘点→可证归属回填 `file_metadata`；裸 `/uploads`/原始 URL→AttachmentViewer/protected；多附件 uploader 复用（报销/股东资金/采购/门店付款）；证据齐后撤 `ENABLE_LEGACY_UPLOADS_STATIC` | 与生产 R2 线交叉 | 改代码+DB写+Gate |
| **W6** | 采购审批流 | "提交到下一审批人"选人+后端逐路由复核；legacy `/procurement/approvers`、`getApprovers()`→v2/approval-engine；`mst_materials` owner/company 模型审计；`prc2_projects`→`biz_projects` 统一主表 | 代码独立 | 改代码 |
| **W7** | 好业财外部接口 | 真实/沙箱**合法签名回调 smoke**（部署后）；新 Chanjet 路径保持 allowlist+审计 | 部署后 | 运行时 smoke |
| **W8** | 生产服务器修复线（Store Payment） | 见生产就绪清单 P0-001 初始数据导入修复、P0-003 deploy-chain 加固（SSH banner 不稳）、P0-004 legacy upload 写探针、P1-001 59 个未决上传 owner（fail-closed HOLD）、P1-007 回滚/恢复演练、manual-review 用户 296/299/1460 排除 | 独立 Gate 链 | DB写+部署+取证 |
| **W9** | 验证&部署主干（release train） | ~80 批代码改动**全未部署**：统一待 API/Web tsc + menu-atomicity gate + W5 closeout + migration down/no-data-DML gate + CI/CD + 生产 smoke + 用户重登 | 解冻策略 | 部署 |
| **W10** | 治理卫生 | Observer 35 findings 复核（含 7 个 agent worktree A1-A7 落后 main、orchestrator worktree dirty）；`runtime-memory/NEXT_ACTIONS.md` 仍停 06-24 需刷新；作废本会话冗余草案 SQL；我的 Sidebar/D1/D2 改动归入解冻批次 | — | docs/ops |

## 3. 关键路径（建议推进顺序）

1. **定解冻/发布策略**（W9 前置）：~80 批已积压，必须先定"怎么把冻结期的代码分批解冻部署 + 生产 smoke"，否则一切代码工作无法落地。建议分波：先 docs/纯前端可见性 → 再 DataScope/RBAC 运行时 → 最后 DB 迁移波。
2. **跑 W1 单点 Gate**（解 RBAC 总阻塞）：先只读确认目标 DB `sys_menu`/migration 状态（运维取证，不写库）→ 出"实库残留+缺失原子菜单"清单 → 备份 → apply `1782047418112`+`1782052418112` → 重登 → 生产 smoke。
3. **W1 落地后做验收矩阵**（= 我审计 task4 的 5 主体）：**王乐金/刘汉涛/财务/采购/管理员** 逐人核 左菜单·中心卡片·按钮·接口四向一致（18 条实测清单见 `RBAC_PARENT_PERMISSION_CLEARANCE_AUDIT_20260627.md`）。这同时关掉 NEXT_PLAN P0-1 的"试点用户矩阵取证"。
4. **并行推 W3/W6**（纯代码、不依赖 W1）：master-data type-aware、采购审批选人。解冻后随 W9 部署。
5. **W2 紧跟 W1**（授予 parity 后清 org 别名）。
6. **W5/W7/W8** 各自独立 Gate 链推进（附件收敛、Chanjet 签名 smoke、生产服务器修复）。
7. **W10 随手做**（治理卫生：刷新 NEXT_ACTIONS、复核 Observer、同步 agent worktree、作废冗余草案）。

## 4. 验收口径（DoD）

沿用生产就绪清单的 DoD：所有 P0 = GO 或显式接受 GO_WITH_CONDITIONS；无无主 P1；A1 不再 FAIL；A2 确认无裸 URL/越权/RBAC/DataScope 旁路/敏感日志泄漏；A5 确认主数据+Store Payment+初始导入就绪；A6 确认部署/回滚/备份/远端 checkout 卫生；A7 在 `PRODUCTION_GO_NO_GO.md` 记最终决策；任何生产写/部署/迁移须独立 Gate。

## 5. 诚实备注

- 本计划 docs-only，未写库/未部署/未 push main。
- **冻结是当前一切落地的前置硬约束**——`apps/api`/`apps/web`/迁移 在 `check-freeze-boundaries.mjs` 下被锁，需解冻策略或 `ALLOW_FREEZE_TOUCH` 逐批放行。
- 多篇 W5-closeout 实际用 `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true` 旁路通过（如 `WORKFLOW_APPROVAL_ACTION_UX`）——非干净绿灯，发布前需复核。
- `runtime-memory/NEXT_ACTIONS.md` 与 `CODEX_ORCHESTRATOR_MEMORY.md` 仍停 2026-06-24，落后于 06-26/27 这波 campaign，建议 W10 刷新以免后续 agent 读到陈旧状态。
