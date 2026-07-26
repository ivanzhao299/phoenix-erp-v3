# 管理员复验失败项修复与 UAT 报告

## 范围

- 来源：管理员剩余未处理清单（截图 `37.PNG`）
- 日期：2026-07-26
- 原则：`已处理` 不等于已解决；每项必须有根因、代码或配置结论、自动化回归和生产 UAT 证据。
- 禁止项：不以队列状态代替业务验收，不静默吞掉状态读取失败，不伪造生产结果。

## 逐项结论

| 序号 | 关联问题 | 业务问题 | 根因 | 本轮处理 | 自动化证据 | 生产 UAT |
|---|---|---|---|---|---|---|
| 29 / 43 | BUG-20260716-0002 | 药品入库保存 HTTP 500，库存增减不可验证 | PostgreSQL 同一参数在 `INSERT ... SELECT` 与 `WHERE` 中被推断为 `text`、`varchar` 两种类型 | 为批次号、药品编码、数量、仓库、门店、公司、来源字段增加显式 PG cast；药品存在性判断使用同一 `varchar` 类型 | `farm-medicine.service.spec.ts` PASS；PG 参数 cast gate PASS | 待部署后执行可逆入库/出库与净库存核验 |
| 35 | BUG-20260713-0004 | 库存查询仅显示仓库代码 | API 已返回仓库中英文名称，前端单元格仍硬编码 `warehouse_code` | 统一显示 `中文名（代码）`，搜索同时覆盖名称和代码 | `warehouse-query.test.ts` PASS | 待部署后核验 `孟赛农场鸡蛋暂存仓（LPH_MS_EGG_FARM）` |
| 38 | BUG-20260715-0001 | 运营工作台与养殖总览存栏不一致 | 前端汇总包含 GROWING、PEAK 等非当前产蛋群；权威 BFF 只统计 ACTIVE/LAYING | 首页与养殖总览复用 ACTIVE/LAYING 统一口径 | `home-farm-kpi.test.ts` PASS；生产只读基线显示旧口径确有差异 | 待部署后对比两个页面与 BFF 权威值 |
| 42 | BUG-20260716-0001 | 编辑鸡群后列表数量不即时更新 | 历史版本关闭抽屉早于重新加载；当前实现已改为 await reload 后关闭并禁用缓存 | 保留现有正确实现，增加回归验证，不重复改写 | `bug-20260716-0001-flock-refresh.test.ts` PASS | 待部署后编辑并观察列表即时更新 |
| 45 | BUG-20260716-0004 | 日产蛋入库无法从日报预填 | 历史日报只有 `eggs_produced`，`eggs_by_grade` 为空；接口过滤空分级后误报“无日报” | 接口返回缺失分级班次数和已报产蛋数；页面给出精确补录提示；新增日报在产蛋数大于零时强制录九档分级 | `farm.service.spec.ts`、`breeding-daily.test.ts` PASS | 待部署后验证历史缺失提示和完整日报预填 |
| 46 | BUG-20260717-0001 | 采购订单有记录但顶部总数为 0 | 历史响应兼容层优先信任错误的 `total=0`；当前实现已按 rows 回退 | 保留已有归一化实现并执行回归 | `procurement-orders-response.test.ts` PASS | 待部署后核验列表条数与顶部总数一致 |
| 48 | BUG-20260718-0002 | 费用申请提交审批 HTTP 400 | 公司未配置唯一组织负责人，后端自动选人返回 `APPROVER_NOT_FOUND`；页面没有显式选审批人 | 提交前加载权限与 DataScope 都合格的候选人，用户明确选择；后端再次校验选择结果并 fail-closed | `expense-approval-picker.test.ts` PASS；Approval Engine 全量测试 PASS | 待部署后核验候选人及提交成功 |
| 56 | BUG-20260718-0004 | 场长在手机端不能创建本场鸡舍 | 用户同时具备场长角色和错误的 GROUP 数据域，旧逻辑仅看到 global scope 就按管理员拒绝 | 非管理员的 `ROLE_FARM_MGR` 可从唯一 primary/manager SITE 绑定恢复本场范围；多站点或无绑定仍拒绝 | `farm-feed.service.spec.ts`、`mobile-roles.test.ts` PASS | 待部署后以场长账号验证本场可建、越域不可建 |
| 60 | BUG-20260722-0003 / BUG-20260726-0003 | 包装确认入库后刷新仍显示未入库 | TEMP_PRODUCTION_INBOUND 模式有交接记录但不重复生成 PACKAGING 库存；刷新状态仅按库存批次判断 | 状态端点复用权威库存模式；TEMP 模式有交接即持久显示 COMMITTED；模式读取失败不再静默降级 | `bff.controller.spec.ts` PASS；`bug-20260722-0003-warehouse-handover.test.ts` PASS | 待部署后刷新作业台并核验 COMMITTED 与库存来源 |

## 本地验证

- API Jest：42 suites / 318 tests PASS。
- Web Vitest：48 files / 228 tests PASS。
- API TypeScript：PASS。
- Web TypeScript：PASS。
- W5 closeout：20/20 PASS（业务代码与财务路径经显式 freeze/security review）。
- Entity drift：PASS。
- Nullable unique：PASS。
- `git diff --check`：PASS。

## 安全与数据边界

- 未新增 migration。
- 未修改 schema/entity/table/column。
- 本地验证未写生产数据库。
- 费用审批候选人由后端权限与 DataScope 交集决定，前端结果不可信任。
- 手机端场长恢复仅适用于非 ADMIN 且唯一 SITE 绑定；无法唯一确定时继续拒绝。
- 包装模式读取失败显式报错，不再伪装为“未入库”。

## 最终门槛

只有完成以下步骤后，清单状态才可由 `REPAIRED_PENDING_UAT` 更新为 `UAT_PASS`：

1. 提交并快进推送到 `origin/main`。
2. CI/CD 部署成功并确认生产版本 commit。
3. 对 10 项执行生产 UAT；涉及写操作时使用可追溯、可回退的小样本。
4. 查询生产错误日志，确认相关 400/500 不再复现。
5. 回写问题反馈记录，附 commit、测试命令和 UAT 结果。

当前阶段：`REPAIRED_PENDING_PRODUCTION_UAT`。
