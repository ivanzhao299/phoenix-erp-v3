# Phoenix ERP V3 — AGENTS.md

> 本文件在每次进入此项目时由 Codex 自动加载。
> 内容只放"不读源码就不知道"的事——架构约定、SOP、命名规则、踩坑总结。
> 实现细节让代码自己说话。

---

## 项目一句话

蛋鸡养殖全链路 ERP：养殖 / 包装 / 仓储 / 订单 / POS / 财务 / 质检 / BI，跨境多公司多仓库。

## 技术栈速查

| 层 | 技术 |
|---|------|
| 前端 | Next.js 16 + React 19 + Vanilla CSS + TypeScript |
| 后端 | NestJS 10 + TypeORM + PostgreSQL 18 |
| 包管理 | pnpm workspaces（monorepo） |
| 端口 | Web 3000 / API 3100 |
| 部署 | Docker Compose；post-commit 钩子自动推 origin/main 触发 CI/CD |

## 工程结构

```
phoenix-erp/
├── apps/api/        # NestJS 后端（modules/{finance-v2, procurement-v2, sales-v2, wms, ...}）
├── apps/web/        # Next.js 前端（app/(admin)/, app/(mobile)/, app/(terminal)/）
├── migrations/      # 顶级旧裸 SQL（46 条，G34 冻结，.allowlist 锁定）
│                    # ⚠️ 新需求别加这里，也别加 apps/api/migrations/
├── apps/api/migrations/                  # 169 条 baseline 裸 SQL，g195-P5 冻结
├── apps/api/src/database/migrations/     # ✅ 新 schema/数据迁移落脚点（TypeORM TS）
├── docs/            # 各阶段治理报告（gN-x-...md），每个阶段一份
├── scripts/         # 运维 / UAT / dict 检查
└── pnpm-workspace.yaml
```

---

## 常用命令

```bash
# 类型检查（最常用的"验证")
cd apps/web && ./node_modules/.bin/tsc --noEmit
cd apps/api && ./node_modules/.bin/tsc --noEmit

# 开发
pnpm dev               # 同时起 API + Web
pnpm dev:api           # 只起 API（3100）
pnpm dev:web           # 只起 Web（3000）

# 构建
pnpm build

# Lint
pnpm lint
```

---

## 治理阶段约定（G 系列）

项目正处于"主数据驱动治理"的阶段化推进期。每个阶段：

| 阶段 | 主题 | 状态 |
|------|------|------|
| G2 | 数据字典治理（sys_dict） | ✅ |
| G3-A | 主数据运行时（`/api/master-data/runtime/:type/active`） | ✅ |
| G3-B | 主数据工作流 | ✅ |
| G4-A | 财务单据主数据化 | ✅ `v3-g4a-finance-runtime` |
| G4-B | 采购单据主数据化 + 物料 SKU 化 | ✅ `v3-g4b-procurement-runtime` |
| G4-C | 销售单据主数据化 | ✅ `v3-g4c-sales-runtime` |
| G4-D | 库存治理（仓库/库区/货位/状态/WarehouseScope/inv_batches 唯一台账） | ✅ `v3-g4d-inventory-governance` |
| G4-E | 生产 & 包装治理 | 待启动 |

每阶段产出物固定为：**一份 docs/g4x-*.md 报告 + 一份 TS 迁移 `apps/api/src/database/migrations/<ts>-G4x*Seed.ts`（若引入新 dict，含 down()，g195 起）+ 一次 commit + 一个 tag**。

### G4-x 阶段标准 SOP（用户每次会复用这套流程）

1. **审计**：列出 8 类单据裸字段，按 A 主数据 / B 字典 / C 自动带出 / D 附件 / E 备注 分类
2. **改造**：P0 字段替换为 Selector / DictSelect / AttachmentUploader
3. **新增字典**：若引入新 dict_type，跑 `cd apps/api && pnpm migration:create src/database/migrations/G4xDictSeed` 写 TS 迁移（含 `up()/down()`，幂等 ON CONFLICT/NOT EXISTS）
4. **输出报告**：`docs/g4x-*.md`，固定章节：审计 → 主数据映射 → 字典映射 → DataScope 覆盖率 → 字段统计 → 8 题答 → 改动清单
5. **验证**：API tsc 0 errors + Web tsc 0 errors + 真 scope-audit（见下文"踩坑")
6. **提交 + 打 tag**：commit message 用 `feat: g4x <主题>`；tag 用 `v3-g4x-<主题>`

---

## 核心组件（请优先复用）

### 主数据选择器：`apps/web/src/components/shared-selectors/MasterDataSelectors.tsx`

| Selector | 数据源 | 备注 |
|----------|--------|------|
| `CompanySelector` | `/api/org/organizations?type=COMPANY` | DataScope 自动过滤 |
| `CustomerSelector` | `/api/master-data/runtime/customer/active` | 仅 ACTIVE |
| `SupplierSelector` | `/api/master-data/runtime/supplier/active` | 仅 ACTIVE |
| `ProjectSelector` | `/api/master-data/runtime/project/active` | 仅 ACTIVE |
| `ShareholderSelector` | `/api/shareholders` | — |
| `CashAccountSelector` | `/api/v2/finance/cash/accounts` | 支持 `valueField: 'code' \| 'id'` + `currencyCode` 过滤 |
| `UserSelector` | `/api/users` | 仅 ACTIVE，valueField='username' 默认 |
| `WarehouseSelector` | `/api/crud/wms_warehouses` | 支持 `companyCode` 过滤 |
| `ZoneSelector` | `/api/crud/wms_zones` | 支持 `warehouseCode` 过滤 |
| `LocationSelector` | `/api/crud/wms_locations` | 支持 `warehouseCode` + `zoneCode` 过滤 |
| `SkuSelector` | `/api/product-master/skus?status=ACTIVE` | `onPick` raw 含 sku_code/product_code/grade_code/spec_code/sku_name |
| `ChannelSelector` | `/api/v2/sales/channels` | — |
| `StoreSelector` | `/api/crud/mst_stores` | 支持 `companyCode` 过滤 |
| `DriverSelector` | `/api/v2/sales/delivery/drivers` | 支持 `companyCode` 过滤 |
| `VehicleSelector` | `/api/v2/sales/delivery/vehicles` | 支持 `companyCode` 过滤 |

### 字典：`DictSelect` (`shared-selectors/DictSelect.tsx`)

从 sys_dict 按 dict_type 加载，仅 ACTIVE：
```tsx
<DictSelect dictType="SYS_CURRENCY" value={x} onChange={setX} allowEmpty={false} />
```

### 附件：`AttachmentUploader` (`design-system/forms/`)

凭证 / 合同 / 资质 / 照片字段**禁用 URL 文本框**，统一上传到 `/api/upload/contract`。

### CrudForm（库存类单据复用）：`components/ui/CrudForm.tsx`

G4-D 后支持 11 种 FieldType：text / number / select / date / datetime / textarea / readonly / upload / **company / customer / supplier / project / warehouse / zone / location / sku / user / dict / attachment**。

新页面如果是 wms_* 这类标准 CRUD，直接配 FIELDS 数组即可：
```ts
{ key: "warehouse_code", label: "仓库", type: "warehouse", required: true }
{ key: "zone_code", label: "库区", type: "zone",
  filterBy: { warehouseField: "warehouse_code" } }
{ key: "item", label: "品目", type: "sku",
  onPickKeys: { item_name: "sku_name", spec_code: "spec_code", grade_code: "grade_code" } }
{ key: "reason", label: "原因", type: "dict", dictType: "INV_LOSS_REASON" }
{ key: "attachment_url", label: "附件", type: "attachment" }
```

---

## 已就位的核心约定（必须遵守）

### 0. entity 字段必须与 DB 列对齐（g197 铁律,2026-06-18 起）

**项目混合模式现状**：service 有 1385 raw SQL 调用 + 424 ORM API 调用,**两种模式共存**。

**Why**：entity ↔ DB 漂移是隐形地雷:
- service 里任何 ORM API(`repo.find` / `repo.save` / `repo.findOne` / `createQueryBuilder` 等)命中 entity 声明但 DB 没建的字段 → **生产 500 报错 "column does not exist"**
- 漂移最重 4 张表(sys_user/sal_customers/fin_cash_accounts/prc_purchase_orders)现状是 entity 装饰式(走 raw SQL),但其它表(shareholder/org/notification 等)真用 ORM API
- 详见 [docs/g197-real-drift-investigation.md](docs/g197-real-drift-investigation.md)

**How**：
1. **新增 entity 字段前**:`\d <table>` 验证 DB 实存列(`/Applications/Postgres.app/Contents/Versions/latest/bin/psql -U mac -d phoenix_erp -c "\d <table>"`)
2. **新增 ORM API 调用前**:确认目标 entity 字段在 DB 实存(否则用 raw query)
3. **不允许写"装饰式 entity"**(entity 声明但 DB 没建的字段)
4. **不允许新增"未来字段"**(等真要加再写迁移)

**CI 门禁**(g197-I):`scripts/check-entity-drift-baseline.sh` 检查 entity↔DB 漂移总行数不超过 baseline,新 PR 让漂移增长 → 红灯。当前 baseline 见 `.github/entity-drift-baseline.txt`。

**g197 装饰器对账战果**:DROP INDEX 192→18(-90%) / @Unique 命中 11/11 / @Check 命中 7/8 / FK 装饰器命中 4/14(typeorm 0.3 refresh bug)。

### 0.5 唯一约束含 nullable 列必填占位(g198 铁律,2026-06-19 起)

**Why**:PG `NULL ≠ NULL` 规则让 `@Unique([..., nullableCol, ...])` 对 NULL 行完全失效,
ON CONFLICT 永不匹配,每次 upsert 都插入新副本。2026-06-19 chanjet_ar_snapshot
就因 `dept_code/assistant_customer_code/subject_id` 三列 nullable,生产残留 32 行 × 2 副本
(用户截图 64 行)。详见 [docs/g198-null-unique-residue-audit.md](docs/g198-null-unique-residue-audit.md)。

**How**:
- 多列 `@Unique([...])` 的所有约束列**必须 NOT NULL**(配 `default: ''` 占位)
- 单列 `@Column({ unique: true })` 同理,除非业务真允许多 NULL(如手工 AP 无 PO 的 `po_id`),
  这种例外必须在 entity 注释里写明理由,并加进 `.github/null-in-unique-allowlist.txt` 白名单
- 写入路径(service)**禁向唯一约束列写 NULL**,用 `''` 或业务占位值
- 替代方案:用 partial unique index `WHERE col IS NOT NULL`(允许"该列为 NULL 时不参与去重")

**CI 门禁**(g198-P1):`scripts/check-nullable-in-unique.js` 扫所有 *.entity.ts,
唯一约束含 nullable 列且不在白名单 → 红灯。本地跑 `node scripts/check-nullable-in-unique.js`。

### 0.6 好业财对接铁律(g199 铁律,2026-06-19 起)

**好业财只读单向 + `fin_ar_invoices` 永禁接好业财数据**。

**Why**:
- 好业财应收接口(`/accounting/gl/statistics/receive`)只到客户级汇总(同客户 SUM 各科目期末),没有发票号/到期日/账龄等单据级字段
- 若把好业财数据塞进 `fin_ar_invoices`(发票级表)→ 信息全丢,催收/账龄/状态机全废
- 关键发现:好业财字段 `subjectName` 实为客户名(非科目名),`subjectId` 是行 ID — UI 列名"结算往来单位"印证

**How**:
- 好业财 → ERP 单向只读:`chanjet_ar_snapshot`(只读快照)→ 财务总监审核 → `fin_ar_ledger`(总账)
- **`fin_ar_invoices` 与 `chanjet_ar_snapshot` 永不连接**;`fin_ar_invoices` 以 ERP 自有业务流(销售开单)为权威源
- 审核入账走 `chanjet-ar-sync.service.ts:importToArLedger`,upsert `(farm_code=companyCode, counterparty_name, period_date)`,`source='CHANJET_VERIFIED_<YYYYMMDD>'` 追溯
- 三方对账走 `/finance2/ar-reconciliation`,业务发票 ↔ ERP 总账 ↔ 好业财并排,差异飘红
- 月末关账走 SOP:[docs/g199-month-end-close-sop.md](docs/g199-month-end-close-sop.md)
- 定时勾稽:`ar-reconciliation.service.ts:cronMonthlyReconciliation` 每月 1 号 03:00 跑上月对账,差异 → 站内通知所有 `MENU_FIN2_AR_LEDGER:V` 用户

**操作权限**:
- 同步好业财(`POST /api/chanjet/sync-ar`):`MENU_FIN2_AR:E`
- 审核入账(`POST /api/chanjet/ar-ledger-import`):`MENU_FIN2_AR_LEDGER:E`(财务总监独占)
- 三方对账(`GET /api/v2/finance/ar-reconciliation`):`MENU_FIN2_AR_LEDGER:V`

### 1. 主数据只用 ACTIVE
**Why**：业务方禁用旧主数据后，相关单据不能再选到它。
**How**：所有 Selector 都已经在 loader 里加了 `status='ACTIVE'` 过滤；不要绕过去直接调 `/crud/*` 拿全量。

### 2. 编码禁手填，名称自动带出
**Why**：手填导致数据漂移、对账失败。
**How**：选了 code 后，对应的 name 字段设为 `readOnly` + `background: var(--bg-muted)` + `cursor: not-allowed`。

### 3. 字典禁硬编码 `<select>`
**Why**：枚举增加/翻译/排序变化时要满库改 select。
**How**：枚举走 sys_dict + DictSelect。新增 dict_type 必须配 TS 迁移 `apps/api/src/database/migrations/<ts>-*DictSeed.ts`（含 `up()/down()`，幂等 ON CONFLICT/NOT EXISTS）。

### 4. 凭证 / 合同 / 资质 / 照片禁 URL 文本框
**Why**：用户复制 URL 不靠谱、不可控权限、易过期。
**How**：用 AttachmentUploader（API 端是 `/api/upload/contract`）。如果数据库字段是单 string，存 `urls[urls.length-1]`；如果是 string[]，存原数组。

### 5. 主数据下沉至主数据中心
**Why**：业务单据页（销售/采购）不应直接建主数据。
**How**：禁建 = "新建 XXX" 按钮替换为指向 `/master-data/<type>` 的 `<a>` 链接 + 横幅说明"销售/采购视图（只读）"。保留浏览、状态切换、扩展信息编辑。

### 6. 库存台账唯一性
**Why**：旁路写 inv_batches/inv_ledger 会导致账实分离。
**How**：所有库存动作必须经 `apps/api/src/modules/wms/wms.service.ts` 或 `terminal/packaging.service.ts` 的统一接口。健康端点 `phoenix_inv_batches_total{status}` 监控状态分布。

### 7. 库存状态唯一来源
**Why**：每个模块自定义状态字段会导致定义漂移。
**How**：`inv_batches.status` 必须来自 `INV_STOCK_STATUS` 字典（5 态：AVAILABLE/RESERVED/QUARANTINE/DAMAGED/FROZEN）。

### 8. DataScope 三层
- `allowedCompanyCodes` ← sys_user_orgs 展开
- `allowedProjectCodes` ← sys_user_projects 追加
- `allowedWarehouseCodes` ← sys_user_orgs.warehouse_code ∪ sys_user_warehouse_scopes 额外授权
- ROLE_ADMIN / GROUP → isGlobal=true

实现在 `apps/api/src/modules/org/services/data-scope.service.ts`，写入 CLS `dataScope`，业务 service 读 CLS 做 `WHERE x IN (...)`。

---

## 踩过的坑（必须记得）

### 系统 `grep` 是 ugrep（macOS）
- 拒绝 `\s`、拒绝 `.{0,60}` 跨段复杂正则
- 静默返回 stderr 错误但 exit code 0 → **空 stdout 会被误判为"PASS"**
- 真 scope-audit 写法：用 `<input[^>]*field` 单字段窄正则 + 计数；或用 `onChange.*e\.target\.value` 抓"裸 input 写主数据字段"特征

### post-commit hook 已停自动推（2026-06-10 起）
- `git commit` 完只本地落，hook 提示 `📝 [post-commit] 已本地提交（自动推送已关闭）`
- 推 main = 大节点，需用户拍板才 `git push origin main`
- 若要恢复自动推：取消 `.git/hooks/post-commit` 里"原自动推送逻辑"段的注释

### 新迁移走 TypeORM TS（g195 起）—— 裸 SQL 双目录都已冻结
- ✅ **新 schema/数据迁移**：`apps/api/src/database/migrations/<ts>-PascalCase.ts`
  - 创建：`cd apps/api && pnpm migration:create src/database/migrations/AddXxx`
  - schema 变更：`pnpm migration:generate src/database/migrations/AddXxx`（entity diff 自动生成）
  - 必须实现 `down()`（CI 门禁 #2 启发判定：含 await/queryRunner/.query/dropX/addX 等业务关键词）
  - 部署链自动跑（g195-P3 / P3+）：
    - CI：`scripts/db-migrate.sh` 末尾 → `./node_modules/.bin/typeorm migration:run`
    - 生产：`deploy.yml` 在 `docker compose up -d --wait api` 后 `docker compose exec -T api ...`
- ❌ **顶级 `migrations/`**：46 条历史，G34 冻结，`.allowlist` 锁定
- ❌ **`apps/api/migrations/`**：169 条 baseline，g195-P5 冻结，`.allowlist` 锁定；已被 P2 桥接进 TypeORM `migrations` 表（视为"全已执行"）
- CI 门禁：违反 allowlist / 缺 down() / **up() 含业务数据 DML** → 红灯
  - g197-H 铁律:TS 迁移 up() **禁含 INSERT/UPDATE/DELETE/TRUNCATE/MERGE**(白名单:sys_dict / typeorm_metadata 等工具表)
  - **数据修复迁移豁免**(g198,2026-06-19):若是 NOT NULL 改造前置的"清 NULL + 去重"等合法治理 DML,在文件头 30 行内加 `@allow-data-dml: <reason>` 标记整文件豁免。例:
    ```ts
    /**
     * @allow-data-dml: 清 dept_code NULL→'' 占位 + 去重(NOT NULL 前置必需)
     */
    ```
  - 业务数据 seed 仍走 `scripts/` 运维脚本,不走迁移链
- 蓝图：`docs/migration-tooling-roadmap.md`；规范：`apps/api/src/database/migrations/README.md`

### 中文 docx 文件经常无关变动
- `docs/金凤凰ERP-生产初始化导入确认表-M5.docx` 会显示 modified 但不应入 commit
- staging 时只 `git add` 当阶段相关文件，**不要** `git add -A`

### 主数据 vs 工作流状态别混
- 任务要求"统一 5 态"是 **inv_batches.status**（批次库存状态）
- 不是 wms_inbound/outbound 等的 **workflow status**（PENDING/COMPLETED/CANCELLED）
- 两者**独立**

---

## Commit / Tag 命名规范

```
# Commit
feat: g4x <主题>
fix: <短句>
docs: <短句>
perf: <短句>

# Tag（阶段性产出物固定打 tag）
v3-<phase>-<topic>           # 如 v3-g4d-inventory-governance
v3-<feature>-YYYYMMDD        # 如 v3-ui-ux-phase1-design-system-20260530
```

Commit message 末尾自动加：
```
Co-Authored-By: Codex Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## 用户偏好（少打扰、直奔结果）

- 不要过度分析、不要复述任务、不要写"接下来我将..."的开场
- 验证必须真做（API tsc + Web tsc + scope-audit），不可空答 PASS
- 遇到 ugrep 之类的工具限制要明说，不要装作没事
- 一次推完一个 G 阶段：审计 → 改造 → 字典 → 报告 → 验证 → commit + tag
- 报告必须**回答用户列出的所有问题**（每个 G 阶段都有 7~8 题）

# 完全授权（2026-06-04 起 · /Users/mac/phoenix-erp/** 内）

用户已授权在本项目目录内**拥有全部常规开发操作权限**，不再征求同意：
- 自由读 / 写 / 编辑文件
- 自由 git add / commit / tag（post-commit 已自动推 main）
- 自由跑 pnpm / tsc / lint / curl localhost / docker compose
- 自由建迁移文件 / 改 service / 改前端
- 自由跑 G 阶段全闭环（审计→改造→字典→报告→验证→commit→tag）

**仍需先确认才能做的红线**：
1. **不可逆破坏性操作**：`rm -rf` / `git reset --hard` / `git push --force` /
   `git checkout --` / `git branch -D` / `git tag -d` / `git rebase -i` /
   `git commit --amend` 等
2. **操作项目外**：`/Users/mac/phoenix-erp/` 外的任何文件
3. **生产数据库写入**：实际在生产 DB 跑 DDL（创建迁移文件 OK，运行迁移需确认）
4. **改写已发布历史**：删除已 push 的 tag / amend 已推送的 commit
5. **外发**：ssh / scp / 调用第三方写 API / 上传非临时文件

权限源：`.Codex/settings.local.json`（已含 allow / deny 列表）
