# 蛋品等级三问题修复 — 生产执行 Runbook（2026-11-14）

> 对应分支:`codex/fix-egg-grade-defect-20261114`(基线 `2a55e3824`)
> 三个问题的根因分析与代码修复已合入该分支;本文档是**生产数据侧**的受控执行步骤。
> 所有 `--apply` 均为生产数据库写入,执行前需业务负责人确认;顺序不可调换。

## 背景(为什么需要这些步骤)

| 问题 | 根因 | 代码修复 | 数据侧动作 |
|---|---|---|---|
| ① 破损蛋不显示/入不了库 | #532 策略种子未落实(迁移只加列);缺陷档无 SKU,入库强制 SKU 解析必败 | 前端过滤对齐 `stock_managed`;新增缺陷 SKU 矩阵种子脚本 | 步骤 1 + 2 |
| ② "0号特大蛋"命名 | 种子链把 GRADE_0 命名为"0号特大蛋" | 仓库内种子/契约已同步改名 | 步骤 3 |
| ③ 等级不跟随鸡舍 | `md_egg_source_profiles` 无 HTTP 端点,前端全局等级表 | 新增 lookup 端点 + 两页联动 | 无(档案已激活) |

## 前置检查

```bash
# 在部署了本分支代码的环境执行;DATABASE_URL 显式传入,脚本无隐式凭据
export DATABASE_URL='postgresql://<user>:<pass>@<host>:5432/<db>'
node -e "console.log('node ok')" && git log --oneline -1   # 确认在修复分支
```

## 步骤 1 — 九档库存策略种子(#532 收尾)

```bash
node scripts/seed-grade-inventory-policy.mjs --audit     # 看 mismatches / missingGrades
node scripts/seed-grade-inventory-policy.mjs --dry-run   # 事务内验证后回滚
node scripts/seed-grade-inventory-policy.mjs --apply     # 提交:9 档 stock_managed/is_storable 全真
```

**验收**:audit 输出 `mismatches: []`、`missingGrades: []`。
此步是问题①的第一层:入库页表单从此显示脏/裂/破/损四档。

## 步骤 2 — 缺陷档 SKU 矩阵(问题①的第二层,依赖步骤 1)

```bash
node scripts/seed-defect-sku-matrix.mjs --audit     # 12 个 SKU 状态:MISSING/READY/CONFLICT
node scripts/seed-defect-sku-matrix.mjs --dry-run
node scripts/seed-defect-sku-matrix.mjs --apply
```

写入 12 个 SKU(全部 LOOSE 规格)及 COMPANY scope(stock_enabled=true, sale_enabled=false):

- 孟赛普通线 `PRD-EGG-0` → `SKU-0-{DIRTY|CRACKED|BROKEN|DAMAGED}-LOOSE`(COMP-LAO-AGRI)
- 东鹏红壳线 `PRD-EGG-RED` → `SKU-R-…-LOOSE`、粉壳线 `PRD-EGG-PINK` → `SKU-P-…-LOOSE`(COMP-LAO-XINGCHI)

**验收**:audit 显示 12 × READY;CONFLICT 非空时停止并人工评审(脚本绝不改写既有行)。
此步之后,日产蛋入库提交含 BROKEN 的数量才能通过服务端 SKU 解析。

## 步骤 3 — 显示名统一(0号特大蛋→0号蛋;破蛋→破损蛋)

```bash
node scripts/rename-grade0-broken.mjs --audit     # 各维度当前值/待更新行数/样例
node scripts/rename-grade0-broken.mjs --dry-run
node scripts/rename-grade0-broken.mjs --apply
```

改动范围:product_grades 2 行、mst_products 1 行(PRD-EGG-0)、product_skus 中含"0号特大蛋"的 sku_name(约 21 行)。**不改任何 code 列**,幂等(已是目标名的行不更新)。

**验收**:audit 中 `needsUpdate` 全 false、`skus.matchingLegacyName = 0`。

## 步骤 4 — 激活目录复验(防漂移)

```bash
node scripts/ops/sku-source-activation.mjs inspect
```

确认无 `SKU_ACTIVATION_HOLD`。若出现 `LEGACY_CATALOG_IDENTITY_MOVED` 之类 HOLD,停下评审,不得 force。

## 步骤 5 — 冒烟验证

1. **日产蛋入库页**:任选孟赛舍(如 HOUSE_MS_01)→ 表单应出现 8 档(0-5 号 + 脏蛋/破损蛋),提交含破损蛋的一笔;东鹏舍(HOUSE_DP_01)→ 横幅显示"来源档案:粉壳蛋(EGG_PINK)",等级行带"(粉壳)"后缀,同样提交含破损蛋一笔。
2. **库存核对**:`inv_batches` 新批次 BROKEN 行 `status='DAMAGED'`、`qty_available=0`(缺陷档不进可售池);台账 `inv_ledger` 有 TEMP_PRODUCTION_INBOUND 行。
3. **销售隔离抽测**:POS/销售可用库存查询不应出现缺陷批次。
4. **日生产日报页**:选东鹏舍看到品种横幅;录分级(含破损蛋)→ 从日报预填到入库页,破损蛋数量应带回。

## 附:8 档制终态裁定与执行记录(2026-11-14 第二轮)

**业务裁定**:现行等级体系为 **8 档 = GRADE_0..5 + DIRTY(脏蛋)+ BROKEN(破损蛋)**。
"9 档/九档/nine-grade"是 G67 时代(5 可售+4 缺陷)的历史计数,数量与成员均已失真。
CRACKED(裂缝蛋)/DAMAGED(损坏蛋)源自 Phase H2 基线的设计期枚举,从未被业务确认。

**执行偏差记录(第一轮)**:
- 第一轮 ops 曾按当时仓库策略(#532 九档)把生产中 status='FROZEN' 的
  CRACKED/DAMAGED 解除冻结并补建 6 个 CD SKU——该 FROZEN 状态实为业务此前的
  手工抑制,本次裁定将其推翻并永久退役;
- 另发现 GRD-001(旧编码"0号蛋")与 GRADE_0 并存(用户看到"0号蛋/0号特大蛋"
  两行的真正根源),已按 G67 模式连同 SKU-0003/0004 一并 DEPRECATED。

**终态防线(三道)**:
1. **DB 触发器**(迁移 `1794500000000-FreezeRetiredEggGrades`):冻结清单内等级码
  (CRACKED/DAMAGED/AA/A/B/C/XL/L/M/S/XS/GRD-001)任何 INSERT/UPDATE 回 ACTIVE 直接报错
  `GRADE_FROZEN`;
2. **应用层**:`product-master.service` create/updateGrade 增加 status 生命周期白名单
  (ACTIVE/DEPRECATED/DRAFT);
3. **CI 金丝雀**(`scripts/ci/check-retired-grade-codes.mjs`):四个权威等级枚举源
  必须恰为 8 档制;diff 新增行不得在白名单之外引入 'CRACKED'。

**生产验证清单**:product_grades 恰 8 行 ACTIVE;`UPDATE product_grades SET
status='ACTIVE' WHERE grade_code='CRACKED'` 应报 GRADE_FROZEN;CD 的 6 个 SKU
DEPRECATED;入库页/日报页/包装终端缺陷字典只见 脏蛋/破损蛋。

## 回滚

- 步骤 1/2/3 均为幂等 UPDATE/INSERT,无 schema 变更;如需回滚按 dry-run 报告的行数反向手工处理(缺陷 SKU 可 `UPDATE product_skus SET status='INACTIVE' WHERE sku_code LIKE 'SKU-_-___-__-LOOSE' AND grade_code IN ('DIRTY','CRACKED','BROKEN','DAMAGED')`,需 DBA 复核)。
- 代码回滚 = 分支不合并或 revert,生产部署链自动跟随 main。

## 明确不做

- 不新增 TypeORM 迁移(本次全部为主数据运维,遵循 g197-H:业务数据走 ops 脚本)。
- 不动 WMS 手工入库/缺陷处置(缺陷入口在生产链,WMS 负责处置)。
- 缺陷处置 Web UI 另行立项。
