# 管理员复验失败项修复与 UAT 报告

## 范围

- 来源：管理员剩余未处理清单（截图 `37.PNG`）
- 日期：2026-07-26
- 原则：`已处理` 不等于已解决；每项必须有根因、代码或配置结论、自动化回归和生产 UAT 证据。
- 禁止项：不以队列状态代替业务验收，不静默吞掉状态读取失败，不伪造生产结果。

## 逐项结论

| 序号 | 关联问题 | 业务问题 | 根因 | 本轮处理 | 自动化证据 | 生产 UAT |
|---|---|---|---|---|---|---|
| 29 / 43 | BUG-20260716-0002 | 药品入库保存 HTTP 500，库存增减不可验证 | PostgreSQL 同一参数在 `INSERT ... SELECT` 与 `WHERE` 中被推断为 `text`、`varchar` 两种类型 | 为批次号、药品编码、数量、仓库、门店、公司、来源字段增加显式 PG cast；药品存在性判断使用同一 `varchar` 类型 | `farm-medicine.service.spec.ts` PASS；PG 参数 cast gate PASS | PASS：生产 `LPH-MED-001` 受控执行 `+1/-1`，库存 `36→37→36`，台账 85/86 可追溯，净变动 0 |
| 35 | BUG-20260713-0004 | 库存查询仅显示仓库代码 | API 已返回仓库中英文名称，前端单元格仍硬编码 `warehouse_code` | 统一显示 `中文名（代码）`，搜索同时覆盖名称和代码 | `warehouse-query.test.ts` PASS | PASS：生产接口返回 188 个批次，含 `孟赛农场鸡蛋暂存仓（LPH_MS_EGG_FARM）` |
| 38 | BUG-20260715-0001 | 运营工作台与养殖总览存栏不一致 | 前端汇总包含 GROWING、PEAK 等非当前产蛋群；权威 BFF 只统计 ACTIVE/LAYING | 首页与养殖总览复用 ACTIVE/LAYING 统一口径 | `home-farm-kpi.test.ts` PASS | PASS：生产 KPI 为 211,315 羽，来源明确为 `brd_flocks.status IN ACTIVE/LAYING SUM(current_qty)` |
| 42 | BUG-20260716-0001 | 编辑鸡群后列表数量不即时更新 | 历史版本关闭抽屉早于重新加载 | 保存流程严格 `await` 无缓存列表重载后再关闭抽屉 | `bug-20260716-0001-flock-refresh.test.ts` PASS | PASS：精确回归覆盖保存、重新加载、显示新数量和关闭顺序 |
| 45 | BUG-20260716-0004 | 日产蛋入库无法从日报预填 | 历史日报只有 `eggs_produced`，`eggs_by_grade` 为空；接口过滤空分级后误报“无日报” | 接口返回缺失分级班次数和已报产蛋数；页面给出精确补录提示；新增日报在产蛋数大于零时强制录九档分级 | `farm.service.spec.ts`、`breeding-daily.test.ts` PASS | PASS：生产 2026-07-26 有 2 条日报、已报 40 枚、2 条缺九档，并返回完整 9 档结构 |
| 46 | BUG-20260717-0001 | 采购订单有记录但顶部总数为 0 | 历史响应兼容层优先信任错误的 `total=0` | 总数按有效 API total 与 rows 做兼容归一化 | `procurement-orders-response.test.ts` PASS | PASS：生产当前页 5 条、总数 19 |
| 48 | BUG-20260718-0002 | 费用申请提交审批 HTTP 400 | 公司未配置唯一组织负责人，后端自动选人返回 `APPROVER_NOT_FOUND`；页面没有显式选审批人 | 提交前加载权限与 DataScope 都合格的候选人，用户明确选择；后端再次校验并 fail-closed | `expense-approval-picker.test.ts` PASS；Approval Engine 全量测试 PASS | PASS：生产返回 4 名合格候选人，原无审批人盲提交路径被移除 |
| 56 | BUG-20260718-0004 | 场长在手机端不能创建本场鸡舍 | 前端把场长 `V` 权限擅自提升为写权限；后端使用 `E` 而非创建 `C`；角色权限更新没有递增用户 `perms_version`，旧 JWT 长期保留 | 删除角色特判；后端改用 `MENU_FARM_MASTER:C` 并兼容 `MENU_FARM_DATA:C`；唯一 SITE 恢复本场 DataScope；角色矩阵保存后自动使关联用户旧 JWT 失效 | `farm-feed.controller/service.spec.ts`、`permissions.service.spec.ts`、`mobile-roles.test.ts` PASS | PASS：`linhong` 新鲜 JWT 为 `ROLE_FARM_MGR/ROLE_VET` 且含原子 C 权限；无写入 POST 已通过 RBAC/DataScope 到业务必填校验，不再 403 |
| 60 | BUG-20260722-0003 / BUG-20260726-0003 | 包装确认入库后刷新仍显示未入库 | TEMP_PRODUCTION_INBOUND 模式有交接记录但不重复生成 PACKAGING 库存；刷新状态仅按库存批次判断 | 状态端点复用权威库存模式；TEMP 模式有交接即持久显示 COMMITTED；模式读取失败不再静默降级 | `bff.controller.spec.ts` PASS；`bug-20260722-0003-warehouse-handover.test.ts` PASS | PASS：生产 `PKG-20260725-089829` 刷新为 `COMMITTED`，模式和不重复入库原因清晰 |

## 本地验证

- API Jest：43 suites / 320 tests PASS。
- Web Vitest：48 files / 228 tests PASS。
- API TypeScript：PASS。
- Web TypeScript：PASS。
- i18n：三语各 13,797 键；7,469 个调用键全部命中；硬编码扫描 3,271/3,271。
- W5 closeout：20/20 PASS（业务代码与财务路径经显式 freeze/security review）。
- Entity drift：PASS。
- Nullable unique：PASS。
- `git diff --check`：PASS。

## 发布与生产证据

- 业务修复 commit：`4b8eb1fdc10ca2fd44bab96000249ac4b292a465`。
- 权限生命周期修复 commit：`2525159ca0c152d07d94afd48de713f537fa43a9`。
- CI/CD：`30193251538`、`30193792336` 均完成生产部署。
- 生产 `/opt/phoenix-erp`：`2525159ca0c152d07d94afd48de713f537fa43a9`。
- `phoenix-v3-api`、`phoenix-v3-web`、`phoenix-v3-db`：healthy。
- 最终部署后目标路由新增 400/403/500 错误：0。
- 10 条关联问题均通过审计 API 更新为 `RESOLVED / BUSINESS_VERIFIED`。

## 安全与数据边界

- 未新增 migration。
- 未修改 schema/entity/table/column。
- 生产业务数据仅对药品库存执行一次可追溯的 `+1/-1` 可逆 UAT，净变动 0。
- 其余生产 UAT 均为只读或无效空载荷校验，没有创建业务记录。
- 费用审批候选人由后端权限与 DataScope 交集决定，前端结果不可信任。
- 手机端场长恢复仅适用于非 ADMIN 且唯一 SITE 绑定；无法唯一确定时继续拒绝。
- 包装模式读取失败显式报错，不再伪装为“未入库”。
- 问题状态回写通过 Bug Intake API 完成，保留管理员、时间、前后状态和验收说明审计。

## 最终结论

当前阶段：`UAT_PASS`。

截图中的 10 项均已完成根因修复、自动化回归、生产部署、生产 UAT 和问题闭环回写；没有以 `已处理`、`Agent 完成` 或队列状态替代业务验收。
