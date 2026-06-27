# g199-E 月末关账 SOP — 财务总监操作手册

> 适用:**集团财务总监** + **公司财务**(MENU_FIN2_AR_LEDGER 权限)
> 适用范围:好业财对接的 3 家公司(凤凰农业 / 星驰农业 / 凤凰食品)
> 关账节奏:每月 1-5 日完成上月关账(避免业务连续性)

---

## 一、关账总流程图

```
T+0(月末业务停笔)
    ↓
T+1(每月 1 号 03:00 自动定时)
    ├─ g199-D Cron 自动跑三方对账,有差异 → 站内通知所有 AR_LEDGER:V 用户
    │
T+1 到 T+5(财务总监操作窗口)
    ├─ 步骤 1: 同步好业财(/finance2/chanjet-sync,3 家公司各拉一次上月数据)
    ├─ 步骤 2: 部门对账(同页"部门对账"按钮,排查差异部门)
    ├─ 步骤 3: 审核入账(同页"预览入账总账" → 试运行 → 正式入账)
    ├─ 步骤 4: 三方对账查差异(/finance2/ar-reconciliation,差异飘红行处理)
    ├─ 步骤 5: 处理差异(回退到业务侧补单 / 让好业财补账 / 在 ERP 调整)
    └─ 步骤 6: 关账归档(打 tag/标记完成)
```

---

## 二、详细步骤

### 步骤 1 — 同步好业财应收(上月)

**入口**: 财务管理 → 好业财同步(`/finance2/chanjet-sync`)
**权限**: MENU_FIN2_AR:E
**对象**: 凤凰农业 / 星驰农业 / 凤凰食品 各一次

**操作**:
1. "公司"下拉选第一家(如"凤凰农业")
2. "起始日"选上月 1 号(如 `2026-05-01`),"截止日"选上月最后一天
3. 点 **"同步好业财 → PG"** 按钮(绿色 Cloud 图标)
4. 等"同步完成"提示,记下 `fetched / saved / totalEndbalance` 数字
5. 重复 步骤 1-4,把另外 2 家公司各跑一次

**铁律**:
- 只读好业财,写本地 PG 快照(`chanjet_ar_snapshot`),**不会**修改好业财数据
- 幂等"全删全插"——同 (bookid, period) 的旧快照会被覆盖

**异常排查**:
- `好业财返回空或错误` → 检查 `/api/chanjet/diagnostics`,看 appTicket/token 是否丢失;若 `hasAppTicket=false`,点 `/api/chanjet/set-ticket` 手动注入或重启 API 容器
- 期末余额合计与好业财后台对不上 → 检查"合计"行是否被过滤(`chanjet-ar-sync.service.ts:185` 过滤逻辑)

---

### 步骤 2 — 部门对账(选做,排查部门维度)

**入口**: 同页"部门对账"按钮
**操作**:
1. 选公司 → 点 **"部门对账"**
2. 三栏对照:✓ 两边都有 / ⚠ 只在好业财 / ⚠ 只在 ERP
3. 若"只在好业财"行非空 → 通知该公司财务在 ERP 补建部门
4. 若"只在 ERP"行非空 → 检查好业财是否漏建,或为 ERP 历史死部门可忽略

**说明**: 部门对账目前只匹配名称,不影响关账主流程(关账走客户维度)

---

### 步骤 3 — 审核入账(chanjet_ar_snapshot → fin_ar_ledger)

**入口**: `/finance2/chanjet-sync` 同页底部"审核入账总账"折叠面板
**权限**: MENU_FIN2_AR_LEDGER:E(**财务总监独占**)

**操作**:
1. 选公司 + 期间(YYYYMM,如 `202605`)
2. 点 **"预览入账总账"**(蓝色 BookOpen 图标)
3. 卡片展开 → 看四块 KPI:
   - **新增 N**: ERP 总账中尚无,会新建
   - **金额变动 M**: 已存在但金额变了,会覆盖
   - **无差异 K**: 不会写库
   - **farm_code**: 本次落表用的 farm_code(= companyCode)
4. 展开"新增 N 行明细" / "金额变动 M 行(原期末 → 新期末)" 复核
5. **先点"试运行"** → 弹窗确认 → 跑一次不写库的预算
6. 确认 OK 后 **再点"正式入账 fin_ar_ledger"** → 写 fin_ar_ledger
7. 入账成功提示 `upserted=X source=CHANJET_VERIFIED_YYYYMMDD`

**铁律**:
- `source` 字段记录入账时间戳(`CHANJET_VERIFIED_20260603` 类),可追溯
- upsert 键 `(farm_code, counterparty_name, period_date)`,同期间重跑会覆盖
- 同客户多科目(应收/预收/坏账)自动按客户 SUM 聚合

**回滚**: 仅 DBA 在 psql 手动 `DELETE FROM fin_ar_ledger WHERE source='CHANJET_VERIFIED_<date>'`

---

### 步骤 4 — 三方对账查差异

**入口**: 财务管理 → 应收三方对账(`/finance2/ar-reconciliation`)
**权限**: MENU_FIN2_AR_LEDGER:V

**操作**:
1. 公司选具体公司(或"集团/全部允许公司"看汇总)
2. 期间(月初)选 `2026-05-01`
3. 点 **"对账"** 按钮
4. 看四块 KPI 一目了然:
   - 业务发票合计 / ERP 总账合计 / 好业财合计 / 总账-好业财差额
5. 上方 chips 过滤:**全部 / 预警(WARN) / 差异(MISMATCH)**
6. **重点看 MISMATCH 行**(红底,② - ③ 差额栏 > 100):
   - "差异原因猜测"chip 给方向(未入账 / 串账 / 漏发票等)
   - 与公司财务核实根因 → 走步骤 5

**对账口径(写死)**:
| 列 | 数据源 | 说明 |
|----|--------|------|
| ① 业务发票 | `fin_ar_invoices.SUM(balance_amount_base)` | 截至期末未取消/未冲销的发票余额(本币累加,客户级) |
| ② ERP 总账 | `fin_ar_ledger.closing_amount_base ?? closing_amount` | 同公司同客户同期间 |
| ③ 好业财 | `chanjet_ar_snapshot.SUM(endbalance)` | 同客户多科目 SUM,本币 RMB |

---

### 步骤 5 — 处理差异

**差异 → 原因 → 处理方式**:

| 差异 | 可能原因 | 处理 |
|------|----------|------|
| ① ≠ ② (业务发票 vs ERP 总账) | 业务侧漏开发票 / 总账未结转 | 补开发票 → 重跑步骤 4 |
| ② ≠ ③ (ERP 总账 vs 好业财) | 好业财已挂账但 ERP 没入账 / 入账后好业财又改了 | 重跑步骤 1(同步) + 步骤 3(入账) |
| ① ≠ ③ (业务 vs 好业财) | 业务系统未挂账到好业财 | 让公司财务在好业财补账 + 重跑步骤 1 |
| **仅好业财有** | ERP / 业务都未挂账(漏录) | 在 ERP 业务侧补单(销售开单或手工补发票) |
| **仅业务发票有** | ERP 总账未结转,好业财也漏录 | 同时走步骤 3 入账 + 让公司财务在好业财补 |
| **仅 ERP 总账有** | 业务侧已核销但总账未冲减,好业财未同步 | DBA 帮删 `fin_ar_ledger` 异常行 + 重跑步骤 3 |

**处理后**: 必须重新走步骤 4 确认 MISMATCH 清零(或留有据可查的合理差异)

---

### 步骤 6 — 关账归档

**确认所有 MISMATCH = 0** 或 **所有遗留差异已备注合理性** 后:
1. 在 `docs/g199-monthly-close-log.md`(管理记录,自建)追加一行:
   ```
   2026-05 | 凤凰农业 | 关账日期 2026-06-03 | 操作人 刘杰 | 差异 0/0/0(✓) | 备注 —
   2026-05 | 星驰农业 | 关账日期 2026-06-03 | 操作人 刘杰 | 差异 1/0/3(预警) | 备注 客户 X 待核实
   2026-05 | 凤凰食品 | 关账日期 2026-06-03 | 操作人 刘杰 | 差异 0/0/0(✓) | 备注 —
   ```
2. (可选)git tag 生产数据快照:`v3-close-202605`

---

## 三、g199-D 自动定时勾稽(每月 1 号 03:00)

**Cron 名称**: `g199-d-monthly-ar-reconciliation`
**位置**: `apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts`
**触发**: NestJS `@Cron('0 0 3 1 * *')` 每月 1 号 UTC 03:00 (北京时间 11:00)
**逻辑**:
1. 取上月月初作 periodDate
2. 对所有 `chanjet_book_company_map.sync_enabled=true` 公司各跑一次 `reconcile()`
3. 累计 `totalMismatch + totalWarn` > 0 时发通知
4. 接收者:所有有 `MENU_FIN2_AR_LEDGER:V` 权限的活跃用户
5. 站内通知含:每家公司差异数 + top 5 差异客户 + 链接 `/finance2/ar-reconciliation?periodDate=...`

**不通知场景**: 全公司全 OK(避免无意义打扰)

**手动触发(补跑)**:
```typescript
// 在 API 容器内 ts-node 或 service 内调用
await arReconciliationService.runMonthlyReconciliationNow();
```
(目前无 HTTP 端点,需手动 SSH;后续若常用可加 `POST /api/chanjet/reconciliation/run-now`)

---

## 四、铁律(永不违反)

1. **好业财数据只读单向**(g198+ 起):ERP → 好业财不写任何东西,即使数据明显错也只在好业财后台改
2. **`fin_ar_invoices` 永禁接好业财数据**(g199 总纲):
   - 好业财只到客户级汇总,塞进发票级会丢失发票号/到期日/账龄等关键信息
   - `fin_ar_invoices` 以 ERP 自有业务流(销售开单)为权威
   - 好业财数据只通过 `chanjet_ar_snapshot` + `fin_ar_ledger` 路径进 ERP,与 `fin_ar_invoices` **永不连接**
3. **`chanjet_ar_snapshot` → `fin_ar_ledger` 必经财务总监审核**:
   - 财务总监独占 `MENU_FIN2_AR_LEDGER:E` 权限
   - 不允许自动入账(避免好业财端错误自动污染 ERP 总账)
4. **关账后禁改本期 fin_ar_ledger**:
   - 关账后如发现差异,在下月 fin_ar_ledger 调整科目处理,不改历史期数据
   - 例外:DBA 紧急修复需备注 + 通知集团财务

---

## 五、常见问题(FAQ)

**Q1**: 月初定时通知没收到?
A: 检查 `/api/notifications/stream` SSE 连接是否活,或重新登录刷 JWT。也确认本人有 `MENU_FIN2_AR_LEDGER:V` 权限。

**Q2**: 步骤 3 入账时报"chanjet_ar_snapshot 无数据"?
A: 先回步骤 1 同步好业财。`chanjet_ar_snapshot` 表为空时入账无来源。

**Q3**: 三方对账页 "好业财" 列全 0 但同步页有数据?
A: 检查 period 格式 — 对账页是 `YYYY-MM-01`,同步页是 `YYYYMM`。两端 period 必须对得上。

**Q4**: 同客户多科目(应收 + 预收)汇总后是不是丢了科目维度?
A: 是。当前 g199-B 设计就是按客户聚合(净应收)。若财务总监需要拆科目对账,等 g200+ 扩 `fin_ar_ledger.subject_code` 维度。

**Q5**: 好业财后台改了上月数据,ERP 怎么办?
A: 回步骤 1 重新同步该期间(覆盖 `chanjet_ar_snapshot`) → 步骤 3 重入账(覆盖 `fin_ar_ledger`,source 时间戳更新)。

---

## 六、相关文档

- [g199-ar-dual-ledger-reconciliation.md](g199-ar-dual-ledger-reconciliation.md) — g199 总纲
- [g199-chanjet-api-field-mapping.md](g199-chanjet-api-field-mapping.md) — 字段对照表
- [chanjet-yonyou-integration-report.md](chanjet-yonyou-integration-report.md) — 鉴权链(本地留存,未入 git)
- [deployment-tiers.md](deployment-tiers.md) — 部署分层(fast-css / web / api / full)
