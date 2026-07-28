# 好业财 WMS 映射闭环与供应商权限 Gate 报告

日期：2026-07-29

当前结论：**DEPLOYED / GO WITH CONDITIONS（映射晋级保持 HOLD）**

## 1. 本轮目标

本轮把上一 Gate 的 173 条 `SOURCE_ONLY` 从一张不可操作的统计表，升级为可审计、
可逐项确认、可阻断错误晋级的 WMS 映射闭环。范围仅包含 ERP 中间层映射和只读
证据，不向好业财写入、修改或删除任何数据，也不把好业财单据自动写入 ERP 库存
事实表。部署后的生产只读刷新重新计算为 171 条待映射，以下以生产运行态为准。

## 2. 171 条生产缺口审计

| 类型 | 源身份 | 已映射 | 待映射 | 结论 |
| --- | ---: | ---: | ---: | --- |
| 商品 / SKU / 物料 | 134 | 10 | 124 | 必须在 `PRODUCT / SKU / MATERIAL` 候选池中显式确认；活禽等模型缺口保持 HOLD |
| 仓库身份 | 25 | 0 | 25 | 5 条可识别为鸡舍别名但不是仓库；20 条缺少同公司 ERP 仓库/组织主档 |
| 计量单位 | 28 | 6 | 22 | 只允许已审查的同维度安全别名；其余必须按 SKU 定义换算 |

### 2.1 商品身份

124 条源身份由以下业务对象混合组成：

- 兽药/疫苗 56 条；
- 鸡蛋产成品 45 条；
- 活禽 12 条；
- 饲料 6 条；
- 包材 4 条；
- 燃油 1 条。

根因不是简单“名称不同”，而是旧候选池只查询 `mst_products`，没有把
`product_skus` 和 `mst_materials` 纳入比对。本轮候选池已升级为带类型的
`PRODUCT / SKU / MATERIAL` 目录。系统仍禁止模糊名称自动批准，避免把药品、
包装规格或鸡蛋 SKU 错绑到通用产品。

活禽身份当前没有足够的 ERP 业务主档模型，保持 `HOLD`。鸡蛋颜色、加工形态、
质量等级和旧 SKU 父级缺口应在后续 ERP 主数据补齐 Gate 处理。

### 2.2 仓库身份

25 条好业财仓库身份没有一条可安全直接映射到当前 ERP `wms_warehouses`。
其中 5 条可识别为鸡舍/场区别名，但鸡舍不等同于仓库，必须通过位置桥接或建立
正式仓库主档；其余 20 条需要在对应公司下创建或激活 ERP 仓库。星驰、食品等
公司当前缺少 ERP 仓库主档，系统不得跨公司借用仓库。

### 2.3 计量单位

28 条单位中已有 6 条审查映射，其中 `kg` 可无损映射到 `公斤`。`吨 / 斤` 涉及换算，
`盘 / 袋 / 桶 / 瓶 / 提 / 包 / 件 / 只` 的换算依赖具体 SKU 和包装规格，
不得做全局固定换算。本轮同时把第二计量单位纳入晋级门禁，主单位或辅单位任一
未映射，单据均保持 `NEED_MAPPING`。

## 3. 实现能力

1. 新增 `GET /api/chanjet/integration/wms/mapping-gaps`，输出覆盖率、分类缺口、
   供应商权限阻断和共享 ERP 候选目录。
2. 新增 `POST /api/chanjet/integration/wms/master-mappings/:id/review`，只允许
   `MENU_SETTINGS_CHANJET:E` 管理员显式批准或拒绝。
3. 映射目标必须同时提交 `erpCode + erpEntityType`，避免同编码跨
   `PRODUCT / SKU / MATERIAL` 类型误映射。
4. 仓库映射强制校验账套公司边界。
5. ERP 候选必须为 ACTIVE 主档。
6. 映射证据记录操作者、时间、源身份、目标类型、目标编码和公司。
7. 候选目录按类型共享返回，避免为每条缺口重复返回整套主数据导致响应膨胀。
8. WMS 晋级批准新增全局只读基线门禁：33 个 Scope 未全部新鲜成功时拒绝批准。
9. `kg -> 公斤` 作为唯一已审查的同维度别名；其余单位全部 fail-closed。
10. 新增 `erp_entity_type` 迁移，保留既有审核映射并完成确定性回填。

## 4. 供应商权限

生产只读基线当前为 27/33：

- `OTHER_STOCK_IN`：三个账套均被好业财错误码 `50111` 阻断；
- `RETAIL_STOCK_OUT`：三个账套均被好业财错误码 `50111` 阻断。

这是供应商应用/账套接口授权缺失，不是 token 过期，也不能通过 ERP 重试修复。
本轮把六个阻断显式显示在管理员面板，并使库存晋级审批保持关闭。取得好业财侧
权限后，只重跑这六个只读 Scope，不需要重跑或覆盖现有成功快照。

## 5. 安全边界

- 好业财写入、修改、删除：**否**
- 好业财凭证或库存单推送：**否**
- ERP `inv_batches / inv_ledger` 写入：**否**
- ERP 财务交易表写入：**否**
- 自动模糊映射：**否**
- 自动库存晋级：**否**
- 跨公司仓库映射：**拒绝**
- 未映射辅单位晋级：**拒绝**
- 供应商 Scope 不完整时批准晋级：**拒绝**

## 6. 验证

- API TypeScript：PASS
- Web TypeScript：PASS
- Chanjet 测试：9 suites / 157 tests PASS
- WMS bridge 测试：15/15 PASS
- 三语 i18n：13,925 keys each，7,576 references PASS
- migration down()：55/55 PASS
- migration no-data-DML：PASS（确定性类型回填有显式治理豁免）
- nullable unique：PASS
- `git diff --check`：PASS
- 冻结边界与安全回归：本轮属于经批准的 Chanjet / migration / finance 边界改动，
  需带 `ALLOW_FREEZE_TOUCH=true`、`ALLOW_SECURITY_TOUCH=true` 执行完整 W5。

## 7. A2 / A1 / A7 决策

- A2：`PASS WITH CONDITIONS`。RBAC、公司边界、类型边界和 fail-closed 均已落实；
  好业财供应商权限仍是外部条件。
- A1：`PASS WITH CONDITIONS`。本地编译、测试、迁移门禁、CI/CD、生产迁移和
  页面/API smoke 均已通过；映射覆盖率和供应商只读权限仍未达到晋级条件。
- A7：`GO WITH CONDITIONS`。允许部署映射闭环工具，不允许库存事实晋级或任何
  好业财写入。

## 8. 生产运行验收

| 验收项 | 结果 |
| --- | --- |
| 生产版本 | `39e79ff3` |
| CI/CD | run `30377709519`，SUCCESS |
| AI Build | run `30377709429`，SUCCESS |
| TypeORM migration | `AddChanjetWmsMappingEntityType1785420000000` 已应用 |
| 页面入口 | `/finance2/chanjet-integration`，未登录返回 307 |
| 映射缺口 API | 未登录返回 401，鉴权边界正常 |
| API / Web / PostgreSQL | healthy |

生产鉴权只读刷新得到：

| 类型 | 源身份 | 已映射 | 待映射 | 覆盖率 |
| --- | ---: | ---: | ---: | ---: |
| 仓库 | 25 | 0 | 25 | 0% |
| 商品 / SKU / 物料 | 134 | 10 | 124 | 7.46% |
| 计量单位 | 28 | 6 | 22 | 21.43% |
| **合计** | **187** | **16** | **171** | **8.56%** |

六个供应商权限阻断仍为错误码 `50111`：

- 三个账套的 `OTHER_STOCK_IN`；
- 三个账套的 `RETAIL_STOCK_OUT`。

刷新前后业务事实指纹完全一致：

- `inv_batches`：257 行，总量及可用量均为 `806794.950`；
- `inv_ledger`：111 行，变动量合计 `2011.400`；
- `fin_cash_accounts`：62 行，余额合计 `2415170587.98`；
- promotion：2,625 条，`APPROVED=0`、`PROMOTED=0`；
- WMS writeback Outbox：0；
- 好业财外部写入：0。

运行证据：
`docs/ops/runs/chanjet-wms-mapping-closure-runtime-20260729.json`。

## 9. 下一 Gate

`CHANJET_WMS_ERP_MASTER_DATA_GAP_CLOSURE_AND_PROVIDER_AUTHORIZATION`

1. 在 ERP 补齐同公司仓库/鸡舍位置桥接；
2. 补齐商品、SKU、采购物料和活禽主数据模型；
3. 为包装单位建立 SKU 级换算，不做全局猜测；
4. 在好业财开放六个只读 Scope；
5. 重跑缺口报告和晋级候选；
6. 仅当映射覆盖率 100%、33/33 Scope 成功且 A2/A1/A7 通过后，另行审批一张
   好业财单据到 ERP 的单据级 canary。

本报告不批准好业财外部写入。
