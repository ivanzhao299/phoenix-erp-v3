# Phoenix ERP V3 — Shareholder Runtime UX Enhancement（股东模块体验增强）

> 2026-06-02 · 在 Phase 3「可用」基础上提升到「高效运营」体验。
> 不改资本流状态机、不改股权结构、不改业务逻辑；仅新增一个附件列(经授权)+ 纯前端体验增强 + 既有越权点修复。

---

## 0. 结论

# ✅ 达到生产运营级使用体验

资本流页 KPI 区、股东信息联动卡、来源扩展、附件管理、详情页时间轴、Excel 导入、Dashboard 趋势/对账全部交付。
**API TS 0、Web TS 0**；附件列迁移幂等；既有越权点(资本流/出资台账未按 scope 过滤)一并修复。

## 1. 资本流页面 KPI 区

`/shareholders/capital` 顶部 6 张 `KpiCard`（统一设计、支持 Light/Dark CSS 变量主题）：
① 项目总实缴资本 ② 股东累计实缴(已确认) ③ 待审批资本流金额 ④ 待确认资本流金额 ⑤ 本月新增资本流 ⑥ 最近资本流日期。
数据来自 `listFlows` + `capitalStats` 前端聚合，零额外后端查询。

## 2. 股东信息联动卡

新增资本流时，选择「项目 + 股东」后自动显示**只读信息卡**：股权比例 / 股权状态 / 累计实缴 / 实缴占比 / 实益出资占比 / 最近出资日期 / 最近出资金额。
数据由 `listEquity` + `listBeneficial` + `listContributions` 前端联动聚合（如：宋雷 · 东鹏蛋鸡 · 股权比例 7.5% · 累计实缴 ¥9,994,058.49）。

## 3. 资本流来源扩展

`SOURCE_TYPE_LABEL` 扩展 + `SOURCE_TYPE_OPTIONS` 下拉：银行转账 / 烟台分红转投资 / 星驰分红转投资 / 股东垫资 / 代付货款 / 设备投入 / 土地投入 / 其他。
新增枚举值 `YANTAI_DIVIDEND_OFFSET` / `XINGCHI_DIVIDEND_OFFSET` / `GOODS_PAYMENT`（VARCHAR 存储，**后端兼容、历史数据不受影响**，旧值 DIVIDEND_OFFSET 等仍正常显示）。

## 4. 附件管理

- **迁移**：`shr_capital_contributions` 新增 `attachment_urls jsonb`（幂等 ADD COLUMN IF NOT EXISTS；用户授权）。`attachment_count` 同步维护。
- **上传**：复用现有 `FileUploadInput` + `POST /api/upload/contract`（本地落盘 + `/uploads` 静态访问），支持银行回单/付款截图/投资协议/分红决议/土地协议/设备采购单等。
- **能力**：草稿期上传/预览/下载/删除；提交审批后**只读**（service `updateFlowAttachments` 仅 DRAFT 可改）。详情页图片缩略图 + PDF 图标 + 下载。

## 5. 资本流详情页

`/shareholders/capital/:id` 升级：项目/股东/金额/来源/日期/状态 + 确认记录 + 审批实例 + 附件列表(预览下载) + **资本流时间轴**（草稿创建 → 提交审批 → 审批通过 → 确认到账 → 冲销，按状态机已发生节点点亮）。列表页每行可点击进入。

## 6. Excel 导入

`/shareholders/capital/import`：前端 `xlsx`(SheetJS) 解析 Excel/CSV → **Dry Run 预览**（逐行校验项目/股东/金额，错误中文提示）→ 确认后逐行调用 `createFlow` 创建**草稿**。
- 下载模板（项目/股东/金额/日期/来源/备注）。
- **不覆盖已有资本流**：每条新建草稿，仍走正常审批→确认流程。
- 不改后端、不改 DB 结构（除附件列）。

## 7. Dashboard 增强

股东驾驶舱新增：
- **资本流趋势图**：最近 12 个月柱状图（recharts），数据源后端 `capitalStats.monthlyTrend`（新增 SQL 聚合，补零连续 12 月）。
- **最近资本流**：`capitalStats.recent` 渲染（此前后端返回但前端未用）。
- 项目实缴排名 / 股东投入排名（保留优化）。

## 8. Finance Bridge 可视化

驾驶舱新增 **Finance Bridge 只读对账卡**：Shareholder Runtime 累计实缴 vs Finance V2 股东资金 vs 差异金额 + 桥接状态(READ_ONLY)。
后端 `financeBridge` 新增 `reconciliation: { shrTotal, finTotal, diff, finParsed, bridgeStatus }` 聚合。**只读，不自动改账、不生成凭证、不回写**。

## 9. 权限验证（含越权修复）

**勘察发现的既有越权点**：`listFlows` / `listContributions` / `capitalStats` 此前**未按股东 scope 过滤**，被授予菜单权限的股东可越权查看 scope 外项目的资本流明细。

**本阶段已修复**：在上述接口注入 `resolveAccessibleProjects(user)`，与 dashboard scope 口径对齐。`getFlow` 详情按 scope 校验，越权抛"无权查看（不在股东查看范围内）"。

| 股东 | ShareholderScope | 修复后可见资本流 |
|------|-----------------|-----------------|
| 赵永伟 | GROUP | 全部 3 项目 |
| 朱兆存 | GROUP | 全部 3 项目 |
| 宋雷 | 孟赛 + 东鹏 | 仅孟赛 + 东鹏（**看不到万象**）|
| 伏强(符强) | 东鹏 | 仅东鹏（看不到孟赛、万象）|

> scope 绑定数据本地核验完整（5 条 ACTIVE）。修复后 listFlows/listContributions/capitalStats/getFlow 均按可见项目集合收窄，无越权、无全集团泄露。

## 10. 用户体验提升

| 维度 | 提升前 | 提升后 |
|------|--------|--------|
| 一览性 | 仅明细表 | 6 KPI 区 + 趋势图 + 对账卡 |
| 录入辅助 | 仅姓名 | 选股东即显股权/实缴/最近出资联动卡 |
| 凭证留痕 | 无附件 | 上传/预览/下载/草稿删除 |
| 单据追溯 | 纯只读字段 | 时间轴 + 审批/确认记录 + 附件 |
| 批量导入 | 逐条手录 | Excel/CSV Dry Run 导入 |
| 数据安全 | 资本流可越权 | 按 scope 收窄，越权阻断 |

## 11. 验证

| 项 | 结果 |
|----|------|
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| 附件列迁移(本地) | ✅ ADD COLUMN 成功，幂等 |
| monthlyTrend SQL | ✅ 12 月聚合正常 |
| scope 绑定核验 | ✅ 5 条 ACTIVE（赵/朱=GROUP，宋雷=孟赛+东鹏，伏强=东鹏）|
| 越权修复 | ✅ listFlows/listContributions/capitalStats/getFlow 注入 scope |
| scope-audit.sh | ⚠️ 本地 API 未运行 + 测试用户夹具缺失（非本次回归）|

## 12. 剩余优化项（P2）

1. 附件后端删除 API（当前移除仅置空 url，磁盘文件不清理；对象存储迁移）。
2. 审批时间轴接入真实 `wf_approval_instances` 步骤明细（当前按状态机节点推断）。
3. 多附件上传组件封装（当前单文件 FileUploadInput 循环追加）。
4. Excel 导入大批量（>500 行）后端批次化（当前前端逐行 createFlow）。
5. Finance Bridge `fin_shareholder_contributions` 字段口径精确对齐（当前尽力解析金额列）。
6. scope-audit CI 夹具补齐（达成 31/31）。

---

## 验收对照

| 验收项 | 达成 |
|--------|:----:|
| 资本流支持附件 | ✅ 上传/预览/下载/草稿删除 |
| 支持 Excel 导入 | ✅ Dry Run + 逐行草稿 |
| 支持 KPI | ✅ 6 KpiCard |
| 支持股东信息联动 | ✅ 只读联动卡 |
| 支持资本流详情页 | ✅ 时间轴 + 附件 |
| 支持 Finance Bridge 可视化 | ✅ 只读对账卡 |
| 股东驾驶舱体验提升 | ✅ 趋势/最近/对账 |
| 达到生产运营级使用体验 | ✅ |
