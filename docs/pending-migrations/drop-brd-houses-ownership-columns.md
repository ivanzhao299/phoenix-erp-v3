# `brd_houses` ownership 冗余列待重落地草案

状态：**冻结，不可执行**。原 `1787647200000-DropHouseOwnershipRedundantColumns.ts` 已在生产部署前从迁移链移除（`a162cda6`）。本文件只保留重落地前置条件，不是迁移文件，不会被 TypeORM 加载。

## 数据安全前置条件

1. 在目标环境以只读 SQL 核对三列定义、依赖、NULL/默认值与引用方；P0 读取、generic CRUD 及 CI 门禁必须保持全绿。
2. 执行 DROP 前先在同一变更窗口创建带时间戳的列快照备份表，至少保存 `house_code/company_code/site_code/store_code`，核对备份行数与源表一致，并记录恢复 SQL。
3. 迁移文件头必须包含：`down() 为结构回滚，只重建列定义，不保证恢复被 DROP 的历史列值；数据等价恢复依赖前置快照备份表。`
4. `up()` 不使用 `CASCADE`；发现未知依赖应失败并停止。生产 DDL 仍须单独人工授权。

## 唯一性约束评估（本轮不实施）

目标模型是 ACTIVE farm 的非空 `mapped_site_code` 一对一，但当前必须先审计并治理：重复 SITE、一个 SITE 多个 ACTIVE farm、无/停用 SITE、farm 与 SITE 公司不一致、未映射 farm。治理完成后才能评估部分唯一索引：

```sql
CREATE UNIQUE INDEX ... ON brd_farms (mapped_site_code)
WHERE mapped_site_code IS NOT NULL AND mapped_site_code <> '';
```

不对 nullable 列直接添加普通 UNIQUE 后宣称 NULL 已去重；不增加到 SITE 的级联删除 FK。任何约束迁移须同时核对冻结基线、TS 迁移末态和写入校验，并提供完整 `down()`。
