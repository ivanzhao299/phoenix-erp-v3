/**
 * ⛔ TOMBSTONE — V2 旧实体，已废弃
 *
 * 此文件原为 biz_purchase_order 表的 TypeORM Entity。
 * V3 迁移后，采购单统一使用：
 *   → src/modules/procurement/entities/purchase-order.entity.ts
 *   → 数据库表: prc_purchase_orders
 *
 * 历史数据已通过 migrations/run_migration.js 迁移至 prc_purchase_orders。
 * 旧表 biz_purchase_order 保留为只读归档（仅 ROLE_ADMIN 可查询）。
 *
 * 废弃时间: 2026-05-09
 */

// 此文件不导出任何内容，防止误引用
export {};
