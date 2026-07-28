# 好业财 WMS 全量只读基线实施报告

## 1. 结论

当前结论：**GO WITH CONDITIONS**

已将好业财库存读取范围从采购入库、销售出库 2 类扩展到 11 类官方库存接口。所有调用均为只读；同步仅写 Phoenix ERP 的好业财中间层镜像，不修改好业财，也不直接写 ERP 库存事实表。

## 2. 根因

历史生产同步只覆盖：

- `STOCK_IN`
- `SALES_STOCK_OUT`

其余库存余额、批次、产成品入库、材料出库、其他出入库、调拨、盘点和零售出库虽然有官方只读接口，但未进入 `PROBE_ENDPOINTS`，也未进入只读代理白名单。生产预检因此返回 `CHANJET_EXTERNAL_WRITE_DISABLED`。这不是好业财“没有数据”的证据，而是 ERP 从未被允许读取这些 scope。

## 3. 实施内容

1. 增加 9 个官方库存只读路径白名单。
2. 将 11 类库存接口全部注册为账套级、分页、默认镜像 scope。
3. 现存量按仓库和商品规格分组，批次现存量使用官方 100 行分页上限。
4. 同步 runner 默认改用最多三次重试的 `mirror/sync-resilient`。
5. WMS 对齐 API 按 11 类 × 启用账套计算 scope 新鲜度和镜像行数。
6. 保留采购入库、销售出库的详细 canonical document preview。
7. 增加反向同步 readiness，明确库存专用 Outbox、映射、合同、Gate 和 canary 前置条件。

## 4. 生产前证据

| 检查 | 结果 |
| --- | --- |
| 三个启用账套 | 已确认 |
| 采购入库 3 scope | API 成功，0 行 |
| 销售出库 3 scope | API 成功，0 行 |
| 其余 27 scope | 被旧版只读白名单阻断 |
| 好业财写入 | 否 |
| ERP 业务库存写入 | 否 |

生产部署后必须重新运行 33 个 scope。只有 API 成功和镜像新鲜，才能判断每类源数据是否真实为空。

## 5. ERP 业务逻辑

ERP 已具备采购、销售、生产、包装和通用 WMS 工作流。好业财镜像作为外部进销存证据，不替代 WMS 原子确认事务：

- ERP 入库/出库确认仍经 WMS service 更新 `inv_batches` 和 `inv_ledger`。
- 好业财现存量和单据用于映射、对账、差异解释和未来 promotion candidate。
- 未映射或不一致的数据 fail closed，不静默覆盖。

## 6. 反向同步就绪度

当前为 `PREPARED_DISABLED`：

- 业务方向和等效关系已定义。
- 好业财写入开关关闭。
- 库存专用 Outbox 尚未实现。
- 写入接口、红蓝单、撤销和回读合同尚未完成审查。
- 只有完成映射 100%、A2/A1/A7 Gate 和单笔 canary 后，才可申请一次明确写入。

## 7. 验证

- Chanjet focused Jest：98/98 PASS。
- API typecheck：执行中，最终结果随提交记录更新。
- 生产 33 scope：待部署后受控执行并更新运行产物。
- migration：未新增。
- 好业财写入：否。
- ERP 库存事实写入：否。

## 8. 下一步

按 `docs/ops/CHANJET_ERP_WMS_SYNC_BASELINE_AND_GAP_PLAN.md` 的 P0-P6 顺序推进。第一 Gate 是 33 scope 生产全量只读同步和源数据盘点；反向同步继续 HOLD。
