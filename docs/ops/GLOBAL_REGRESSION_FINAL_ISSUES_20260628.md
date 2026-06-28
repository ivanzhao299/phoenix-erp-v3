# 全局回测 · 最终问题清单（多 agent 并行）— 2026-06-28

> 4 个并行审计 agent（RBAC 漂移 / entity↔DB 漂移 / 路由一致性 / POS+新模块深审）+ 本地端到端回测（POS 全链路、财务、库存、新三模块、RBAC 矩阵）。
> Agent 结论经人工逐项核验（剔除误报）。

## 回测结论：核心链路全绿
- POS：币种 4/4 · 价带拦截/放行 · 退货 7/7（含并发/多行）· 现金/AR/库存反向一致
- 新三模块：反馈窗口 / error-logs / backup 端点全 200
- entity↔DB 漂移：本轮新代码**零 ORM 漂移**（全 raw SQL）
- tsc：API + Web 全 0 error

## ✅ 已即时修复并部署（本轮）
| 级别 | 问题 | 位置 | 修法 | commit |
|---|---|---|---|---|
| **P0 安全** | SQL 注入：FIFO 扣减 `quality_grade='${item.grade_code}'`（销售明细客户端可控） | store-pos.service fifoDeductItems | 改绑定参数 $3 | 575a734 |
| **P0 安全** | SQL 注入：`company_code='${companyCode}'`（查询参数可控） | uat-feedback.service getSummary | 改绑定参数 $1 | 575a734 |

回测验证：注入串 `X' OR '1'='1` 现按字面量匹配→0 行（原会返回全部），已中和；正常流不受影响。

## 📋 待处理最终清单（按优先级）

### HIGH — 功能性 RBAC 缺口（看得见按钮却 403）
| # | 问题 | 位置 | 方案 |
|---|---|---|---|
| H1 | **销售退货页整页无权限门控**：提交/审批/驳回/质检/入库/完成按钮仅按 status 显隐，未按 perm；后端 MENU_SALES2_RETURN 分 :C/:E/:A → :V 用户看得到全部按钮点了 403 | `apps/web/src/app/(admin)/sales2/returns/page.tsx`（多处，~874/886/897/922）；后端 `sales-returns.controller.ts:76/106/114/122/133/141/157/165` | 加 usePermission('MENU_SALES2_RETURN') 的 canCreate/canEdit/canApprove 分别门控对应按钮 |

### MEDIUM — 功能性缺口
| # | 问题 | 位置 | 方案 |
|---|---|---|---|
| M1 | 质检 NCR「新增」按钮无 perm 门控（后端 MENU_QA_MGR:C） | `quality/nonconformance/page.tsx:159` | 加 canCreate 门控 |
| M2 | 质检 farm/product 的 DataTable 编辑/删除按钮无门控（后端 MENU_QA_OP:E） | `quality/farm/page.tsx`、`quality/product/page.tsx` | DataTable 传 canEdit/canDelete 或按 perm 隐藏 |
| M3 | **前端调不存在端点** `/api/daily-work/today-stats`（无后端，try-catch 吞 404 → 每日工作台统计静默空白） | `daily-work/page.tsx:100` | 建后端 today-stats 端点 或 移除死调用 |
| M4 | 死重复 controller：`permissions/permission-sets.controller.ts` 未注册（4 条死路由），实际注册的是 `permission-sets/` 模块那个 | `apps/api/src/modules/permissions/permission-sets.controller.ts` | 删死文件（cleanup） |

### P2 / 低 — 健壮性（非阻断）
| # | 问题 | 位置 | 备注 |
|---|---|---|---|
| L1 | **资金账户余额 RMW 竞态**（既有，跨所有现金写）：SELECT current_balance→UPDATE 无行锁，并发不同操作打同一账户会丢更新 | store-pos writeCashTransaction/writeCashRefund + 其它财务现金写 | 需 SELECT ... FOR UPDATE 锁账户行；范围较广，建议专批 |
| L2 | AR 红字 due_date=当日（非 +30d） | store-pos writeArCreditNote | 红字非应收无账龄意义，基本无害；可对齐 |
| L3 | feedback update 未校验 agent_status 枚举 | uat-feedback.service update | 前端兜底 NONE 标签；可加白名单 |
| L4 | backup cron_expr 未校验格式 | sys-backup.service putConfig | 当前无调度器消费该字段（仅展示）；可加校验 |
| L5 | backup-runner pg_dump 后才 chmod 600 的窗口 | scripts/ops/backup-runner.sh | BACKUP_DIR 已 700 缓解；可加 umask 077 |

### ❌ Agent 误报（已核验剔除）
- 「MIXED 单超付→负应收」：实际有 `if (paid >= total) throw` 守卫，超付被拒，receivable 恒 >0。
- 「作废-退货 TOCTOU」：voidSale 仅对 OPEN 生效、returnSale 仅对 COMPLETED 生效，状态不相交，无法竞态。

## 建议下一步
H1（销售退货页门控）是唯一 HIGH，与本会话已修的 menu_code/AP-AR 同类（前端 gate 对齐后端守卫），建议优先。M1-M4 紧随。L 类健壮性建议合并为一专批（L1 余额锁需谨慎、范围广）。
