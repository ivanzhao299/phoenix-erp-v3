# 好业财 WMS 业务策略与只读韧性实施报告

## 结论

`GO_WITH_CONDITIONS`

本批已完成好业财 P0-P5 代码侧关键缺口：有效 Token 响应识别、供应商权限错误分类、无效重试停止、ERP 单向镜像显式开关、财务页面原子权限请求、管理员面板独立降级、鸡舍仓位策略、商品专属单位换算策略及可操作审核界面。

运行态仍保持条件：

1. 新增 TypeORM 迁移尚未执行。
2. `OTHER_STOCK_IN`、`RETAIL_STOCK_OUT` 三账套共六个 Scope 仍为供应商 `50111`。
3. 171 个历史 WMS 映射缺口需按真实主档和本批业务策略逐项关闭。
4. 所有好业财外部写入继续关闭。

## 修改内容

### 后端

- 新增 `chanjet_wms_house_location_policies`。
- 新增 `chanjet_wms_uom_conversion_policies`。
- 新增业务策略总览和审核 API。
- 鸡舍来源必须绑定 ERP 鸡舍、真实仓库和库位。
- 包装/场景单位按 `账套 + 商品 + 单位` 建立专属换算。
- 候选晋级可消费已批准策略，但不会把策略伪装成主数据映射。
- `50111` 和不支持接口不再重复重试。
- Token 健康检查支持实际返回的多种容器形态。
- ERP 单向会计镜像默认关闭，必须由环境变量显式开启。

### 前端

- 管理员可在“库存单据对齐”中审核两类策略。
- 映射和策略始终显示完成率与 HOLD。
- 单个治理接口失败时其余面板仍可使用。
- 财务首页只请求当前用户具备原子权限的数据。

## 当前真实基线

- WMS Scope：33。
- 新鲜成功：27。
- 供应商权限 HOLD：6。
- WMS 来源身份：187。
- 已闭环映射：16。
- 待处理：171。
- 冲突：0。
- 当前映射覆盖率：8.56%。
- 晋级到 ERP 库存事实：0。
- WMS 写回 Outbox：0。
- 好业财外部写入：0。

历史 `56/56` 仅代表当时约定的财务只读范围，不能继续作为当前 29 类接口和三账套的完整基线。当前理论目标按接口目录动态计算为 85。

## 验证

- API TypeScript：PASS。
- Web TypeScript：PASS。
- Chanjet 关键单测：109/109 PASS。
- 迁移 down 门禁：PASS。
- 迁移 no-data-DML 门禁：PASS。
- nullable unique 门禁：PASS。

## 安全边界

- 未执行 migration。
- 未写生产 DB。
- 未修改 ERP 库存事实。
- 未写、删、改好业财。
- 未 push。
- 未部署。

## 下一 Gate

`CHANJET_WMS_DOMAIN_POLICY_MIGRATION_AND_RUNTIME_REVIEW`

该 Gate 必须先获准执行迁移，再由管理员基于真实 ERP 主档审核策略。供应商六个只读 Scope 未开放前，WMS 单据晋级仍为 HOLD。
