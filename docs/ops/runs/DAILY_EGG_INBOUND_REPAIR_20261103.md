# 日产蛋日报重复入库 —— 生产修复执行记录（2026-11-03）

执行人通道：GitHub Actions 受控工作流（全部 run 可审计）。

## 执行链

| 步骤 | Workflow / Run | 结果 |
|---|---|---|
| 背景对账 inspect | `production-background-reconciliation` #41577318846 | `INSPECTED`：滞留 `FENCED`，owner=`41554413680-1`，gen=10，target=`85ab429a1`，holdReason=`DEPLOY_SESSION_FAILED`，floor=`13e3858b7` == 运行 API revision，无在途 transaction |
| 背景对账 reconcile | 同上 #41577458614 | `CLEARED`（先落盘完整 record+manifest 证据再删除） |
| 修复 preflight | `daily-egg-inbound-repair` #41577633316 | `REPAIR_ELIGIBLE`，9 组候选（CSJS-001 ×3、HOUSE_MS_01 ×6，全部 COMP-LAO-AGRI，2026-10-08） |
| 修复 apply（第一次） | #41577750467 | `varchar(32)` 溢出 → 事务回滚，**零写入**（fail-stop 生效） |
| 修复 apply（修正后） | #41578117767 | `UPDATE 10 / INSERT 0 10 / COMMIT` |
| 修复 verify | #41578231972 | `VERIFY=GO` |

## 修复前后统计（生产 phoenix_erp）

| 指标 | 修复前 | 修复后 |
|---|---|---|
| TEMP_PRODUCTION 重复来源组 | 9（19 批） | **0** |
| 超日报分级入库组 | 9 | **0** |
| 退役批次（保留行，qty=0 + 标记） | 0 | 10（10× `TEMP_PRODUCTION_REVERSAL` 冲销流水，ref_no 保留原 source_no） |
| 未触及批次 ledger↔batch 平衡差异 | 0 | 0 |
| 历史 `FARM_IN` 日报流水行 | 54（1,650,405 枚） | 54（与 TEMP_PRODUCTION 同舍同日重叠 = 0，仅追溯保留） |
| TEMP_PRODUCTION 批次总数 | 349 | 349（行保留，其中 10 行 qty 归零） |

## 保留 / 归零规则

- 每组保留 `created_at` 最新行；实测保留行数量与当日日报分级完全一致（两舍 9 档逐一吻合）。
- 旧行 `qty=qty_available=0`、`source_no=NULL`、`legacy_source='DAILY_EGG_DUPLICATE_RETIRED'`（27 字符，适配 varchar(32)），不删除任何行。
- 冲销流水 `TEMP_PRODUCTION_REVERSAL` 以 `(batch_no, change_type)` 幂等去重；原始 `TEMP_PRODUCTION_INBOUND` 流水保留。
- 前置断言：被退役行必须 unconsumed（`qty_available=qty`）、`AVAILABLE`、`HOUSE-%` 引用、legacy_source 为空（或已是本标记）；保留行不得超日报；否则整事务中止。
- 重跑语义：无重复且已有退役标记 → 显式 no-op；无重复且无标记 → `DAILY_EGG_REPAIR_NO_DUPLICATES` 拒绝。

## 部署与迁移

- 迁移 `1792000000000-EnforceTempProductionSourceIdentity` 随 full 部署执行，建出
  `uq_inv_batches_temp_production_source_identity` 部分唯一索引（重复存在时迁移主动停止，已由修复解除）。
- 部署记录见下节（部署 run 与部署后核验数字）。

## 部署闭环实录（同日 04:13–09:26 UTC）

按序执行，每步失败都定位到具体根因后修复再前进，未盲目重跑：

1. **背景对账 inspect/reconcile**（#41577318846 / #41577458614）：清除滞留 FENCED（owner=41554413680-1）。
2. **修复 preflight/apply/verify**（#41577633316 / #41578117767 / #41578231972）：apply 首次被 varchar(32) 溢出回滚（零写入），修正标记后 UPDATE 10 / INSERT 0 10 / COMMIT，verify=GO。
3. **full 部署尝试**（#41578346166）：死于 FLOOR_CONTRACT_CHANGED —— floor(13e3858b7)→target 有 7 个 criticalFiles 差异，必须走 api-only floor 重锚定协议。
4. **重锚定 #1**（#41579888764）：死于 PARTICIPANT_FENCE_NOT_OBSERVED —— 清除记录使 fence 代数归 1，容器内存水位=10 拒绝 REPLAY。→ 实现 revive-participant（受控重启 API，水位归零）+ 高水位持久化。
5. **重锚定 #2**（#41582834413）：fence 通过，死于 `guardProduction is not defined`（promote 漏 import，10/31 以来所有重锚定的真凶）。→ 修复 + contract test。
6. **重锚定 #3**（#41593610259）：promotion PREPARED_HOLD 后 body 死于 ADMISSION_SCHEMA_RECEIPT_REQUIRED（deployment-state 仍用 admission-only 回执规则）。→ 回执泛化 + 受控迁移应用工作流；用 abort-prepared-promotion 还原 floor。
7. **受控迁移应用**（#41590377899 inspect / #41590587941 apply / #41593253786 回执）：**#41590587941 的 job 结论是 failure** —— 它成功执行了 `deploy-schema-first.sh`（迁移已应用、索引已建、migrations 已记录），但随后的回执登记步骤因 TypeORM 类名匹配 bug 退出码 1。即"迁移已应用"与"run 整体成功"必须分开陈述。完整成功链：#41590587941（DDL 应用，部分成功）→ #41593253786（回执登记 `MIGRATION_RECEIPT=COMPLETE`）→ #41578231972 / #41610989848（审计 `VERIFY=GO`，重复 0、超额 0、平衡 0）。
8. **重锚定 #4**（#41595462900）：body 全部成功（API 已切 ac9481e88），仅 OPEN 死于 DEPLOY_SUCCESS_BINDING（verifier 仍要求空 migrationPaths）。→ verifier 接受带回执迁移；complete-background-open 补发 OPEN。
9. **重锚定 #5**（#41601516361）：**全程自走 BACKGROUND_DEPLOYMENT=SUCCESS**（floor→ae2523d2c）。
10. **full 部署**（#41603777102）：死于 compose 包装对 up api 的 fence 证明要求（full 模式从不 fence —— 背景控制上线后的设计断层），回滚同因失败，遗留死事务。→ rollback-dead-transaction 显式闭账（证明 runtime 未动）。
11. **web 部署**（#41608876230）：**SUCCESS**（web→b861c9d14）。
12. **终验**：API=ae2523d2c(floor) healthy、Web=b861c9d14 healthy、readiness OK、审计 VERIFY=GO。

### 审查整改（2026-11-04）

按审查意见修复并全部本地验证（jest 39/39、farm+inbound 全域 60 passed、ops node:test 73/73、API/Web tsc 0 错、迁移门禁过）：

1. **P1 并发超额**：`production-inbound` 事务锁改为日报维度（`companyCode|TEMP_PRODUCTION_DAILY|<eggDate>|<house/site>`），不同幂等键不再能并发读同一剩余额度；既有批次查询改为按日报维度（company+date+collection_ref）而非 source_no，跨键重放幂等、跨键数量不一致拒绝；客户端幂等键必须绑定本次蛋日期（`DAILY-<date>-` 前缀），缺省由服务端按日报维度派生。
2. **P1 分级转换**：无分级→有分级（submit 与 update 两条路径）按原始数量写 `FARM_REVERSED` 精确冲销旧 `FARM_IN`（note 含日志标识，可追溯）；有分级→无分级且该日报已有 TEMP_PRODUCTION 批次时，在写入前拒绝。
3. **P2 批次定位**：`findLegacyEggBatch` 按 company+蛋日≤log_date 精确定位 PRD-EGG 批次；找不到批次时**事务失败**（移除两处 console.warn 吞错）。
4. **P2 修复 SQL**：kept 与日报改为**严格等值**（`k.qty <> r.qty` 双向拒绝）；already-applied no-op 判定改为范围绑定（存在合规退役行 且 全库 overpost=0，即审计 GO 摘要），不再被任意标记误触发；新增静态测试 4 项。

### 证据更正与补充

- **迁移 run 结论更正**：见上文第 7 条（#41590587941 = failure/部分成功；成功证据链为 #41593253786 + 双次审计 VERIFY=GO）。
- **API↔checkout 差异证据**：`git diff --stat ae2523d2c..5328b9915 -- apps/api/src apps/web/src` 输出为**空**（零差异）；全量差异仅 `.github/workflows/production-background-reconciliation.yml`、`scripts/ops/reconcile-background-control.mjs`、`docs/ops/runs/DAILY_EGG_INBOUND_REPAIR_20261103.md` 三个非运行时文件。即审查基准时点 API 运行时与 main 的应用代码完全一致。本次审查整改提交后，`apps/api/src` 将携带待发布修复（见下）。
- **full 发布链 P1 风险（独立立项）**：背景控制上线后，deploy body 的 `docker()` 包装使 `up api` 一律要求"本 run 的 fence+drain 证明"，而 full/web 模式从不 fence —— **常规 full 发布自 10/26 起结构性不可用**（#41603777102 与其回滚双双 HOLD 即为实证）。本次以 api-only 重锚定 + web-only 部署达成等效结果，不等于 full 链修复。设计提案：二选一 —— (a) full 模式复用背景会话（fence→双服务切换→verify→open，需扩展 verifyCompletedDeployment 的 switched.web 语义与 drain 参与者清单）；(b) 为"floor 不变的普通代码发布"定义受控通道（exactReanchorBinding 目前显式拒绝 `prev==cfg` 的同 floor 发布）。在落地前，**任何 full 部署都会失败**，须走 api-only 重锚定（仅当 criticalFiles 变化）或 web-only。
- **待发布**：本次审查整改的业务代码（P1×2 + P2×1）已合入 main 但**尚未部署** —— 因 full 链阻断 + 本批无 criticalFiles 变更（重锚定协议拒绝无契约变化的 floor 移动）。发布路径：待 full 链修复落地，或下一次 criticalFiles 变更的重锚定窗口随车发布。

## 二轮审查整改与上线（2026-11-04）

按第二轮审查意见修复（main `e51b0dea4…9f13513d8`）：

1. **冲销三重校验**：补录分级的 `FARM_REVERSED` 写入前锁定现实 —— 幂等键 `(log_date, ref_no, 补录冲销 note)` 拦截重复转换；flock 净额（原始 FARM_IN + 差额调整 − 历史冲销）必须覆盖待冲销量；不足即整事务失败。新增 3 个场景测试（缺失拒绝/净额不足拒绝/重复幂等）。
2. **批次收窄**：`status='AVAILABLE' AND qty_available>0`；PRD-EGG 无鸡舍维度，公司+蛋日上限即数据模型可表达的最细粒度（已注释说明）。
3. **no-op 范围绑定**：already-applied 判定绑定退役行自身的 (log_date, house) 集合，范围内要求 overpost=0 **且** kept==report 双向严格等值；其他日期/鸡舍的退役标记无法让当前范围静默。
4. **契约调和（产品冲突呈报）**：审查要求"找不到批次即失败"与 breeding-regression A4 既有产品契约"无 PRD-EGG 批次时日报不阻塞"直接冲突。取舍：legacy FARM_IN 保持不阻塞但**显式警告**（返回体 `ledgerSkipped: true` + 警告 msg）；分级入库与冲销路径保持 fail-closed。
5. **真实 PG 并发证明**：issue381 fixture 接入 deploy CI（postgres:18 service），每次 push 必跑。含新增用例：两不同幂等键 `Promise.all` 争抢同一额度 → 恰一成功、败者零写入；5 键并发同 payload → 收敛为单文档单批次。陈旧用例（per-key 文档、合并语义前断言）已对齐，fixture 补建生产同款唯一索引。

### 上线证据（main = 9f13513d8）

- CI：#41760018694 push 全绿（Type-check & Regression 5m17s 含 PG 并发证明与 breeding 回归）
- 重锚定：#41761197062 `BACKGROUND_DEPLOYMENT=SUCCESS`（一次通过，无人工对账）→ floor=9f13513d8
- web 部署：#41762327357 `✅ Deploy (web) complete`
- 运行时：api=9f13513d8 healthy、web=9f13513d8 healthy、`/api/readiness` OK —— **API/Web/checkout/main 四点一致**
- 审计：#41763488241 `VERIFY=GO`（重复 0 / 超额 0 / 平衡 0 / 退役 10）
- no-op 实证：#41763710673 生产真实演练 `DAILY_EGG_REPAIR_ALREADY_APPLIED; scope_days=2; overpost=0; mismatch=0`（空事务提交，零写入）

full 发布链设计缺口仍独立立项（见上文 P1 风险）；本次发布经 api-only 重锚定（合法 criticalFiles 窗口=issue381 CI 接线）+ web-only 完成。

## 三轮审查整改（2026-11-04；代码合入 `bbbb42e23`，随文档提交后 main = `95391c269`）

1. **no-op 双向等值（Fix1）**：`scope_mismatch` 改用与 overpost 相同的 `report_grade FULL JOIN inbound_grade` + `COALESCE(r.qty,0) <> COALESCE(i.qty,0)` —— "日报有分级、入库为 0"的退役范围不再可能静默通过。生产实证（#41772004192）：新 SQL 空事务演练 `ALREADY_APPLIED; scope_days=2; overpost=0; mismatch=0`（双向口径下仍 0 差异）。
2. **冲销身份与净额范围（Fix2）**：
   - 幂等键 = 日期 + ref_no + **班次**（note 尾缀 `（date house shift）` 精确匹配）—— 同日同 flock 早/晚班各自精确冲销一次（新增测试：双班各自 300/500 互不吞没）；
   - 净额范围 = `(log_date = 报告日 OR log_date IS NULL)` × `(company_code = 公司 OR IS NULL)` —— 带范围的新行不再跨日/跨公司串账（新增测试：他日 500 不入本日净额，冲 600 被拒）；历史 NULL 行是唯一无范围来源；
   - 所有新写的 legacy 台账行（FARM_IN / 差额 / 冲销）持久化 `log_date` + `company_code`。
3. **产品裁决：A（保留"日报不阻塞"）+ 持久化待补账**：跳过时写入 `sys_notifications`（biz_type=`FARM_LEDGER_PENDING`，biz_no=`date:house` 去重，收件人=同公司 MENU_INV_BATCH 持有者 + admin），不再只依赖 HTTP 返回体；msg 同步更新。裁决理由：breeding-regression A4 是业务方钉死的一线契约（每日生产录入不可因库存记账失败而停摆），分级链路才是权威记账路径；B 方案会在批次维护缺位时阻断全部日报录入，风险不对称。
4. CI（#41770956033）全绿：jest 66 passed（新增双班/跨日/通知持久化 3 例）、issue381 真实 PG 18/18、breeding 回归恢复、lint 0 errors。

**发布状态**：本批改动不含 criticalFiles（`git diff 9f13513d8..HEAD ∩ criticalFiles = ∅`，已核），无重锚定窗口，**已合入 main 待下个发布窗口上线**（下次任何 criticalFiles 变更的重锚定随车发布；或 full 链修复落地后常规发布）。生产运行时保持 9f13513d8（两轮已上线修复）+ 审计 VERIFY=GO 不受影响。

## 四轮审查整改（2026-11-04，本节合入提交见 git log）

1. **update 路径补待补账通知**：修改日报缺批次分支与 submit 对称 —— 同事务写 `FARM_LEDGER_PENDING` 通知（差额数量入文案），新增 update 场景测试（断言通知落库 + `200 枚` 差额文案）。
2. **数据库级去重**：新迁移 `1793000000000-FarmLedgerPendingNotificationDedup` 建**部分唯一索引** `(user_id, biz_type, biz_no) WHERE biz_type='FARM_LEDGER_PENDING' AND biz_no IS NOT NULL`（DDL-only、含 down()、不动历史数据）；服务改为 `ON CONFLICT … DO NOTHING`（删除 SELECT 预检查竞态）。`biz_no` 升级为 `FARM_LEDGER_PENDING:<company>:<date>:<house>` —— 不同公司同鸡舍编码不再互吞通知（测试断言新格式）。
3. **收件人真正限定同公司**：FarmModule 导入 NotificationModule，`FarmService` 注入 `ScopedNotificationRecipientService`（可选注入，独立构造降级为 admin），收件人 = `resolve(company, ['MENU_INV_BATCH'])` —— 复用既有 DataScope 解析（含 perm/deny/用户级权限集），新增注入场景测试断言 resolve 参数与收件人集合。
4. **文档 SHA 更正**：三轮段落的主标识改为"代码合入 bbbb42e23、随文档提交 main=95391c269"，避免审计误引用。
5. 门禁：91 条 TS 迁移 DML/down() 全过、constraint-drift 0 新增、lint 0 errors、jest 68 passed（新增 3 例）。

历史 NULL 流水无范围仍是**已知限制**（数据中不存在范围信息，报告前文已披露）；严格隔离需回填或人工清单，不在本轮范围。
