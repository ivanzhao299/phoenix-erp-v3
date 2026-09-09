# 库存与主要业务列表稳定排序闭环（2026-09-08）

## 目标与边界

- 鸡蛋库存批次默认按生产日期降序展示；同生产日期必须稳定。
- 临期库存保持“越早到期越靠前”的业务语义并稳定同日顺序。
- 排查库存/WMS 与主要业务单据列表的无序、非唯一排序和分页漂移。
- 仅调整默认排序，不修改筛选、DataScope、数据或写入路径；现有接口没有服务端手动排序参数，前端本地排序能力不受影响。

## 根因

销售鸡蛋批次接口原排序位于 `apps/api/src/modules/sales-v2/services/egg-inventory.service.ts` 的 `getAvailableBatches`：

```sql
ORDER BY b.expire_date ASC NULLS LAST, b.created_at ASC
```

它是 FEFO 顺序，不是页面要求的生产日期顺序。临期接口原先只有 `expire_date ASC`，同到期日无稳定键。WMS 通用 CRUD 除养殖日报特例外，在 `LIMIT/OFFSET` 前没有 `ORDER BY`，会产生 PostgreSQL 任意序和分页漂移。

## 统一排序契约

| 列表类型 | 默认业务顺序 | 稳定键 |
|---|---|---|
| 鸡蛋/库存批次 | `egg_date DESC NULLS LAST` | `batch_no DESC, id DESC` |
| 临期库存 | `expire_date ASC` | `batch_no ASC, id ASC` |
| 单据/台账历史 | `created_at DESC`（已有专门单据日期时保留该日期） | `id DESC` |
| 待处理队列 | 保留既有时间方向 | 同方向 `id` |
| 明细行 | 业务行号或 `id ASC` | 唯一 `id` |

`batch_no` 只作为同生产日的可读次级键，不再被当作时间主键；最终 `id` 保证全序和分页稳定。

## 全站排查与处置清单

### 库存 / WMS

| 列表 | 排查时现状 | 处置 |
|---|---|---|
| Sales2 鸡蛋批次 | 到期日升序 + 创建时间升序，业务语义不符 | 改为生产日期降序 + batch/id 稳定键 |
| Sales2 临期 Tab | 到期日升序，无 tie-breaker | 保持到期日升序，追加 batch/id |
| WMS 库存查询 `/inventory/batches` | 创建时间降序，固定 200，无 tie-breaker | 改生产日期降序 + batch/id；保留 200 上限 |
| WMS 库存汇总 recent | 内存比较器相等时仍返回 `-1` | 改为生产/分级日期、批次号、id 三段稳定比较 |
| 门店库存 | 状态优先 + 创建时间 + 批次号 | 保留状态优先，改生产日期 + batch/id |
| 通用 `inv_batches` | 分页无 ORDER BY | 生产日期降序 + batch/id |
| 通用 `inv_ledger` | 分页无 ORDER BY | 创建时间降序 + id |
| 通用入库/出库/调拨/盘点/报损 | 分页无 ORDER BY | 创建时间降序 + id |
| 专用待入库/待收货/待出库 | 创建时间降序，无 tie-breaker | 追加 id 降序 |
| 收货明细 | 无 ORDER BY | `id ASC` |
| PDA 库存 | 创建时间降序，无 tie-breaker | 生产日期降序 + batch/id |
| PDA 盘点任务 | 创建时间降序，无 tie-breaker | 追加 id 降序 |
| 药品/鸡蛋 ledger | 创建时间降序，无 tie-breaker | 追加 id 降序 |

说明：独立仓库临期页仍在客户端按 `daysLeft ASC` 展示，未改变其语义；其候选集沿用 `/inventory/batches` 的 200 条上限，这是既有容量约束，不在本次“只改排序”边界内。

### 主要业务单据

| 域 | 列表 | 排查时现状 | 处置 |
|---|---|---|---|
| 采购 | 订单、申请、供应商、项目 | `createdAt DESC`，分页缺唯一键 | TypeORM `addOrderBy(id, DESC)` |
| 采购 | 收货、运单、付款、初始化批次 | 已按唯一 `id DESC` | 保持 |
| 销售 | 订单、配送、退货 | `created_at DESC`，分页缺唯一键 | 追加 `id DESC` |
| 销售 | 客户、渠道、价格册 | 非唯一默认排序 | 追加 `id DESC` |
| 销售 | 价格明细 | 产品/等级/规格可能重复 | 追加 `pi.id DESC` |
| 财务 | 费用申请、报销、现金账户、现金流水、资金划拨 | `created_at DESC`，分页缺唯一键 | 追加 `id DESC` |
| 财务 | AR/AP 发票、AR 收款、股东出资/结算 | 已有 id 稳定键 | 保持 |
| POS | 销售、班次 | 时间降序，分页缺唯一键 | 追加 `id DESC` |
| 门店 | 补货 | 创建时间降序，无 tie-breaker | 追加 `r.id DESC` |
| 包装 | 班次、包装任务、尾数任务 | 时间排序无唯一键 | 按原方向追加 id |
| 质检 | 检验、不合格项 | 时间降序，固定 100，无唯一键 | 追加 id 降序 |
| 标签 | 批次打印记录 | 创建时间降序，固定 200，无唯一键 | 追加 id 降序 |

生产日报、趋势等聚合型查询按日期/维度聚合，或已使用唯一 id，未改。审计同时发现的筛选、DataScope、分页上限和“最近 100/200 条”容量问题均未混入本次提交，以遵守“只改排序不改口径”红线。

## 防回潮测试

- `egg-inventory.service.spec.ts` 断言批次主排序、临期排序，并用同生产日期/同批次号 fixture 验证最终 id 全序及两页合并不重不漏。
- `egg-inventory-localized-names.contract.spec.ts` 同时锁定展示列表、临期列表与 FIFO 分配三套不同排序语义，避免把展示排序误改回出库分配语义。
- `generic-crud.service.spec.ts` 表驱动断言七张库存/WMS 表均在 `LIMIT/OFFSET` 前生成稳定 ORDER BY。

## 验证与交付证据

本节只记录实际执行结果；CI、PR、部署及生产复验在完成后追加 run/PR/revision。

| 检查 | 结果 |
|---|---|
| 定向 Jest（3 suites） | PASS，55 tests |
| API `tsc --noEmit` | PASS |
| Web `tsc --noEmit` | PASS |
| `git diff --check` | PASS |
| W5 static closeout（显式复核冻结/安全触碰） | PASS，20/20；本次 security 命中来自扫描器读取 `generic-crud.service.ts` / `wms.service.ts` 全文件既有 DDL、时间戳与 callback 文本，实际 diff 仅 ORDER BY |
| API `pnpm test:regr` | BLOCKED：本地 API 未启动，system regression 登录返回空 token，exit 99；不记 PASS |

PR 已登记 `reviewed-frozen-boundary` 与 `reviewed-security-touch`，用于让 CI 在显式人工复核语义下重跑静态门禁。

生产只读复验标准：revision 必须满足 checkout/API/Web OCI 三方一致；GET `/api/v2/sales/inventory/batches?productCode=EGG` 后逐行验证 `egg_date` 非递增，同日验证 `(batch_no,id)` 非递增；GET 临期接口验证 `(expire_date,batch_no,id)` 非递减；同时检查部署后错误窗口。

## 2026-09-09 后继改判

本报告中的 WMS 库存查询 `/api/inventory/batches` 与通用 CRUD `inv_batches` 默认排序，已由
`docs/ops/wms-inventory-inbound-date-sort-investigation-20260909.md` 的复核与实施覆盖为
`inbound_date DESC NULLS LAST, batch_no DESC, id DESC`。Sales V2 库存、临期 FEFO、门店库存及其他列表
仍保持本报告各自原有契约；本次改判只作用于 WMS 库存查询及其 404 fallback。
