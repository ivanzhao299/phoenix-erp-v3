# 生产管理免疫疫苗修复计划

日期：2026-11-13

## 目标

修复免疫计划页面疫苗名称下拉为空的问题，保证疫苗查询只返回当前 DataScope 可见且 ACTIVE 的疫苗主数据。接种方式统一使用 `DictSelect` 的字典 code，展示跟随中文、英文和老挝语。库存选择使用 ERP `inv_batches.batch_no`，厂商批号继续保存在免疫记录中用于质量追溯。

## 数据与事务

- 免疫 API 提供专用疫苗查询和可用库存批次查询，禁止页面通过通用 CRUD 推断疫苗或手填库存批次。
- 免疫计划创建和执行校验公司、场站、农场、鸡群及仓库范围。执行按 FEFO 锁定可用库存，库存不足返回 409 并回滚。
- 一次免疫执行可分配多个 ERP 库存批次。每个分配写入免疫 issue line，并关联对应 `inv_ledger` 出库流水。
- `vaccine_batch_no` 表示厂商批号，`inventory_batch_no` 表示 ERP 库存批次，两者不互相替代。

## 前端

- 疫苗名称改用专用 ACTIVE 查询结果，保存稳定 `vaccine_code`。
- 接种方式改用 `DictSelect dictType="BRD_VACCINATE_METHOD"`，保存 code 并由字典本地化显示。
- 库存批次改为后端返回的可用批次选择，展示批号、有效期和可用量。
- 执行入口保持幂等，显示多批次扣减结果和后端错误。

## 验证与发布

完成 API/Web 类型检查、免疫服务和页面定向测试、PostgreSQL 迁移 up/down 与重复执行测试、nullable unique、constraint drift、entity drift 和迁移 down/data-DML 门禁。部署前只在受控发布流程运行生产迁移，随后核验 API readiness、免疫接口和 Web 根路径。

## 回滚

应用健康检查失败时回退上一镜像并保留迁移日志。数据语义异常时暂停免疫执行权限，依据备份和流水审计处理，不直接运行破坏性 `down()`。
