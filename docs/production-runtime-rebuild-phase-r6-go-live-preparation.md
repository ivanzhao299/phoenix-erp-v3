# 生产运行体系重构 R6 — 正式上线准备

> **任务**：Go-Live Preparation Phase R6
> **日期**：2026-06-03
> **诚实声明**：本阶段为上线准备——代码/迁移/数据层已就绪；HTTP 全链冒烟、孟赛灰度、东鹏评估属
> **运营动作**，需在已部署环境由责任人执行（本地无运行 HTTP 服务）。本报告交付：部署验证 + 测试数据重置脚本 +
> 主数据确认 + HTTP 冒烟 runbook + Go-Live Checklist + 风险/回滚。

---

## 0. 结论速览

| 维度 | 状态 |
|------|------|
| ca07ab3 部署 | ✅ 全绿（success 8m2s，TraceabilityModule 已上线） |
| 测试数据清理 | ✅ 脚本就绪 + 本地预演通过（一次性手动，非 CI）；⏳ 生产待执行 |
| 主数据 | ✅ 本地齐备；⏳ 生产核对供应商/门店/司机 |
| 库存来源模式 | ✅ 孟赛=PACKAGING_INBOUND / 东鹏=TEMP / GROUP=TEMP |
| HTTP 全链冒烟 | ⏳ runbook 就绪，待部署环境执行 |
| 孟赛灰度 | ⏳ 配置就绪，待真实业务 + 3–7 天观察 |
| 东鹏切换 | 🔒 BLOCKED（待孟赛灰度结果） |
| **Go-Live** | 🟢 **Code/架构/数据层 Go-Live Ready**；运营验证（HTTP+灰度）待完成 |

---

## 1. 部署验证

- **ca07ab3**（feat: r41 cleanup and r5 traceability）：CI run `26862769735` = **success（8m2s）** → Build + Migration + Deploy 全绿。
- 此次成功**覆盖**了此前 R4 文档提交（b2c0064）那次因 Docker Hub 拉取 buildx 超时的失败 run（瞬时网络，与代码无关）。
- TraceabilityModule 已随 ca07ab3 上线；`/api/traceability/*` 已注册；`/traceability` 菜单已 seed（R5 迁移）。
- 生产侧确认（部署后跑）：`curl -H "Authorization: Bearer <token>" https://erp.eggslao.com/api/traceability/batch/__none__` 应返回 `{found:false}`（端点可达）。

## 2. 测试数据清理

- 脚本：`scripts/go-live-data-reset.sql`（**一次性手动，严禁放 CI migrations**——否则每次部署清空真实数据）。
- **保留（主数据）**：sys_*（用户/角色/菜单/权限/字典）、组织、brd_farms/houses/flocks、product_grades/specs/skus、sal_customers/channels/价格本、prc2_suppliers、门店/司机、inv_source_mode（配置）、fin_cash_accounts（账户，余额归零）。
- **删除（测试交易）**：inv_batches/ledger、包装全链(pkg_*)、brd_daily_logs、销售/配送/退货/POS、AR/收款/现金流水、标签、WMS 入库、inv_source_mode_audit。
- **本地预演**（BEGIN…ROLLBACK）：删 12 销售单 + 8 集蛋批次等；主数据保持（farms=3/skus=28/customers=30/menu=103/模式=3）；inv_batches 归 0；无 FK 错误。

## 3. 主数据最终确认（本地基线）

| 主数据 | 本地数量 | 备注 |
|--------|---------|------|
| 场站 brd_farms | 3 | FARM-01 / FARM-MS（孟赛）/ FARM-DP（东鹏） |
| 鸡舍 brd_houses | 10 | |
| 鸡群 brd_flocks | 10 | |
| 等级 product_grades | 8 | AA/A/B/C 可售 + DIRTY/CRACKED/BROKEN/DAMAGED |
| 规格 packaging_specs | 7 | LOOSE/TRAY30/36/BOX360/720/GIFT12/24 |
| SKU product_skus | 28 | 可售等级 × 规格（R3 seed） |
| 客户 sal_customers | 30 | 公司 MENGSE |
| 角色 sys_role | 41 | |
| 菜单 sys_menu | 103 | 含追溯/库存模式/包装入库等新权限 |
| 用户 sys_user | 35 | |
| 供应商 prc2_suppliers | 0（本地） | ⏳ 生产由 golden-phoenix 包导入，需核对 |
| 门店/司机/DataScope/Shareholder Scope | — | ⏳ 生产核对 |

## 4. 库存来源模式最终确认

```
GROUP / ALL      = TEMP_PRODUCTION_INBOUND   （全局过渡）
SITE  / FARM-MS  = PACKAGING_INBOUND         （孟赛灰度：包装完成入库）
SITE  / FARM-DP  = TEMP_PRODUCTION_INBOUND   （东鹏：临时生产入库）
```

## 5. HTTP 全链冒烟 — Runbook（部署环境执行）

> 在已部署环境（生产/灰度）用真实接口验证。需先登录取 JWT：`TOKEN=<bearer>`。

```bash
B=https://erp.eggslao.com; H="Authorization: Bearer $TOKEN"; J="Content-Type: application/json"
# 场景1 集蛋→分级→包装→交接→库存生成（孟赛 FARM-MS）
SID=$(curl -s -X POST $B/api/packaging/terminal/shifts/open -H "$H" -H "$J" -d '{"siteId":"FARM-MS","lineId":"line-01","shiftType":"MORNING","supervisorName":"测试"}' | jq -r '.data.id')
curl -s -X POST $B/api/packaging/terminal/source-batches/receive -H "$H" -H "$J" -d "{\"houseCode\":\"H-MS01\",\"layDate\":\"2026-06-03\",\"totalQty\":9000,\"receivedQty\":9000,\"shiftId\":$SID}"
GR=$(curl -s -X POST $B/api/packaging/terminal/grading/submit -H "$H" -H "$J" -d "{\"productionDate\":\"2026-06-03\",\"outputs\":{\"AA\":360},\"totalInput\":9000,\"shiftId\":$SID}" | jq -r '.data.code')
PK=$(curl -s -X POST $B/api/packaging/terminal/packing/submit -H "$H" -H "$J" -d "{\"gradingCodes\":[\"$GR\"],\"productionDate\":\"2026-06-03\",\"batches\":[{\"grade\":\"AA\",\"spec\":\"360枚/箱\",\"specId\":\"BOX360\",\"boxes\":1,\"eggs\":360}],\"shiftId\":$SID}" | jq -r '.data.code')
curl -s -X POST $B/api/packaging/terminal/warehouse/confirm -H "$H" -H "$J" -d "{\"shiftId\":$SID,\"packingCode\":\"$PK\",\"boxes\":[\"PH-001\"],\"productionDate\":\"2026-06-03\"}" | jq '.data.inventory'
# 期望：inventory.batches[].batchNo=EGG-* , sku_code=SKU-AA-360 , inventoryOk=true

# 场景2 销售订单→预留→出库→库存减少（Sales V2）
# POST /api/v2/sales/orders → submit → delivery finish-loading（按 sales2 实际 DTO）

# 场景3 POS→销售→库存扣减
# POST /api/v2/store-sales → complete-cash

# 场景4 退货→回库
# POST /api/v2/sales/returns → complete-inspection

# 场景5 追溯
curl -s -H "$H" $B/api/traceability/packaging/$PK | jq '.traces[0].production'   # → 场站/鸡舍/集蛋
```

> 验收：① 包装交接生成 `EGG-*`(sku_code 非空)；② 销售/POS 扣减成功；③ 退货回库；④ 追溯返回鸡舍/鸡群/客户。
> ⏳ **本报告未执行 HTTP（本地无服务器）**，runbook 留待部署环境跑通后回填结果。

## 6. 孟赛灰度上线

- 配置就绪：`SITE/FARM-MS=PACKAGING_INBOUND`。开班选 FARM-MS → 包装交接自动生成可售库存。
- 记录：库存生成、销售扣减、退货回库、追溯、异常。观察 **3–7 天**。
- ⏳ 待真实业务执行。

## 7. 东鹏上线评估

- 🔒 **BLOCKED**：依赖孟赛灰度 3–7 天结果。孟赛无库存失真/无双计数/追溯完整 → 再将 `SITE/FARM-DP` 切 `PACKAGING_INBOUND`。

## 8. Go-Live Checklist

见 `docs/go-live-checklist-r6.md`（15 项 + 回滚方案 + 上线日操作顺序）。

## 9. 风险清单

| 风险 | 等级 | 缓解 |
|------|------|------|
| HTTP 冒烟未在生产实跑 | 🟠 | runbook 就绪；上线前必须跑通五场景 |
| 供应商/门店/司机主数据生产未核对 | 🟠 | 上线前生产核对（golden-phoenix 包） |
| 财务无总账/凭证 GL | 🟡 | 运营财务边界（R4），如需会计另建 GL |
| 退货负 AR 无自动冲销 | 🟡 | 手动核销（R4） |
| reset 脚本误用为 CI 迁移 | 🔴→已规避 | 明确置于 scripts/，文件头强警告 |
| 孟赛灰度库存失真 | 🟠 | 模式切回 TEMP 即停（回滚方案①） |

## 10. 正式上线建议

🟢 **Phoenix ERP V3 已达「Code / 架构 / 数据层 Go-Live Ready」**：
- 唯一生产链 / 唯一库存链（EGG-YYYYMMDD-*+SKU/spec）/ 唯一销售链（Sales V2+POS FIFO）/ 唯一追溯链 全部建立；
- 旧旁路（farm-egg / farm-sales / EGG-STOCK / 旧 POS）全部清理；
- 部署绿灯、迁移幂等、追溯/库存/销售 DB 冒烟通过、测试数据重置脚本就绪。

**上线前剩余运营动作（必须完成）**：
1. 备份 + 执行 `go-live-data-reset.sql`；2. 生产核对主数据；3. 跑通 HTTP 五场景冒烟；
4. 孟赛灰度 3–7 天；5. 评估东鹏切换。

→ 完成上述 1–3 即可**孟赛正式灰度上线**；4–5 后**全量 Go-Live**。

---

## 明确回答

1. **ca07ab3 是否全部绿灯？** ✅ 是（success 8m2s，Build/Migration/Deploy 全绿，TraceabilityModule 上线）。
2. **测试数据是否已清理？** 🟢 脚本就绪 + 本地预演通过（保留主数据）；⏳ 生产清理待上线前手动执行（一次性，非 CI）。
3. **主数据是否完整？** 🟢 本地齐备（场站/鸡舍/鸡群/等级/规格/SKU/客户/角色/菜单）；⏳ 生产需核对供应商/门店/司机。
4. **HTTP 全链是否通过？** ⏳ **未执行**（本地无服务器）；runbook 就绪，待部署环境跑通五场景。
5. **孟赛是否成功灰度？** ⏳ 配置就绪；实际灰度 + 观察待运营执行。
6. **东鹏是否允许切换？** 🔒 BLOCKED（待孟赛灰度结果）。
7. **是否达到 Phoenix ERP V3 Go-Live 条件？** 🟢 **Code/架构/数据层 Go-Live Ready**；运营验证（HTTP 冒烟 + 孟赛灰度 + 观察）完成后即正式 Go-Live。诚实结论：**「代码就绪，运营待跑」**。

---

## 附录 · 变更文件

- `scripts/go-live-data-reset.sql`（一次性测试数据重置，非 CI）
- `docs/go-live-checklist-r6.md`（上线清单）
- `docs/production-runtime-rebuild-phase-r6-go-live-preparation.md`（本报告）
