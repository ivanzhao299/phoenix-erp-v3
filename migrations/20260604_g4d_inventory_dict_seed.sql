-- ════════════════════════════════════════════════════════════════════════════
-- G4-D · Inventory Governance — sys_dict 种子
-- ════════════════════════════════════════════════════════════════════════════
-- 库存治理统一字典：
--   INV_INBOUND_TYPE      入库类型（PO/PRODUCTION/TRANSFER/RETURN/OPENING）
--   INV_OUTBOUND_TYPE     出库类型（SALES/TRANSFER/SAMPLE/LOSS/RETURN/PRODUCTION）
--   INV_TRANSFER_REASON   调拨原因
--   INV_LOSS_REASON       报损原因
--   INV_COUNT_TYPE        盘点类型（CYCLE/FULL/SPOT/DISCREPANCY）
--   INV_STOCK_STATUS      批次库存状态（AVAILABLE/RESERVED/QUARANTINE/DAMAGED/FROZEN）
--                         · 替代旧的 AVAILABLE/QUARANTINE/EXPIRED/LOCKED 四态枚举
--                         · EXPIRED 归入 QUARANTINE；LOCKED 拆分为 RESERVED（业务占用）+ FROZEN（管理冻结）
--
-- 幂等：所有 INSERT 均带 NOT EXISTS 保护，可重复执行。
-- ════════════════════════════════════════════════════════════════════════════

-- ── INV_INBOUND_TYPE ────────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'PURCHASE','INV_INBOUND_TYPE','采购入库','采购入库','PO Inbound',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='PURCHASE' AND dict_type='INV_INBOUND_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'PRODUCTION','INV_INBOUND_TYPE','生产入库','生产入库','Production',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='PRODUCTION' AND dict_type='INV_INBOUND_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'TRANSFER','INV_INBOUND_TYPE','调拨入库','调拨入库','Transfer In',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='TRANSFER' AND dict_type='INV_INBOUND_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'RETURN','INV_INBOUND_TYPE','退货入库','退货入库','Return Inbound',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='RETURN' AND dict_type='INV_INBOUND_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OPENING','INV_INBOUND_TYPE','期初入库','期初入库','Opening Balance',50,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OPENING' AND dict_type='INV_INBOUND_TYPE');

-- ── INV_OUTBOUND_TYPE ───────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'SALE','INV_OUTBOUND_TYPE','销售出库','销售出库','Sales',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SALE' AND dict_type='INV_OUTBOUND_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'TRANSFER','INV_OUTBOUND_TYPE','调拨出库','调拨出库','Transfer Out',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='TRANSFER' AND dict_type='INV_OUTBOUND_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'SAMPLE','INV_OUTBOUND_TYPE','样品出库','样品出库','Sample',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SAMPLE' AND dict_type='INV_OUTBOUND_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'SCRAP','INV_OUTBOUND_TYPE','报废出库','报废出库','Scrap',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SCRAP' AND dict_type='INV_OUTBOUND_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'RETURN','INV_OUTBOUND_TYPE','退货出库','退货出库','Return Outbound',50,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='RETURN' AND dict_type='INV_OUTBOUND_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'PRODUCTION','INV_OUTBOUND_TYPE','生产领料','生产领料','Production Issue',60,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='PRODUCTION' AND dict_type='INV_OUTBOUND_TYPE');

-- ── INV_TRANSFER_REASON ─────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'REPLENISH','INV_TRANSFER_REASON','补货','补货','Replenishment',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='REPLENISH' AND dict_type='INV_TRANSFER_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'REBALANCE','INV_TRANSFER_REASON','库存调配','库存调配','Rebalance',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='REBALANCE' AND dict_type='INV_TRANSFER_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'RECALL','INV_TRANSFER_REASON','召回','召回','Recall',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='RECALL' AND dict_type='INV_TRANSFER_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'QUALITY','INV_TRANSFER_REASON','质量隔离','质量隔离','Quality Hold',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='QUALITY' AND dict_type='INV_TRANSFER_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'PROJECT','INV_TRANSFER_REASON','项目调拨','项目调拨','Project Allocation',50,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='PROJECT' AND dict_type='INV_TRANSFER_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OTHER','INV_TRANSFER_REASON','其他','其他','Other',99,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OTHER' AND dict_type='INV_TRANSFER_REASON');

-- ── INV_LOSS_REASON ─────────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'DAMAGE','INV_LOSS_REASON','破损','破损','Damage',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='DAMAGE' AND dict_type='INV_LOSS_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'EXPIRE','INV_LOSS_REASON','过期','过期','Expiration',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='EXPIRE' AND dict_type='INV_LOSS_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'THEFT','INV_LOSS_REASON','盗损','盗损','Theft',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='THEFT' AND dict_type='INV_LOSS_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'PROCESS_LOSS','INV_LOSS_REASON','工艺损耗','工艺损耗','Process Loss',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='PROCESS_LOSS' AND dict_type='INV_LOSS_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'NATURAL_LOSS','INV_LOSS_REASON','自然损耗','自然损耗','Natural Loss',50,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='NATURAL_LOSS' AND dict_type='INV_LOSS_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'INVENTORY_DIFF','INV_LOSS_REASON','盘亏','盘亏','Inventory Diff',60,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='INVENTORY_DIFF' AND dict_type='INV_LOSS_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OTHER','INV_LOSS_REASON','其他','其他','Other',99,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OTHER' AND dict_type='INV_LOSS_REASON');

-- ── INV_COUNT_TYPE ──────────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'CYCLE','INV_COUNT_TYPE','循环盘','循环盘','Cycle Count',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='CYCLE' AND dict_type='INV_COUNT_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'FULL','INV_COUNT_TYPE','全盘','全盘','Full Count',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='FULL' AND dict_type='INV_COUNT_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'SPOT','INV_COUNT_TYPE','抽盘','抽盘','Spot Count',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SPOT' AND dict_type='INV_COUNT_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'DISCREPANCY','INV_COUNT_TYPE','差异盘','差异盘','Discrepancy Recount',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='DISCREPANCY' AND dict_type='INV_COUNT_TYPE');

-- ── INV_STOCK_STATUS（批次库存状态，统一 5 态）─────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'AVAILABLE','INV_STOCK_STATUS','可用','可用','Available',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='AVAILABLE' AND dict_type='INV_STOCK_STATUS');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'RESERVED','INV_STOCK_STATUS','已预留','已预留','Reserved',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='RESERVED' AND dict_type='INV_STOCK_STATUS');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'QUARANTINE','INV_STOCK_STATUS','隔离','隔离','Quarantine',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='QUARANTINE' AND dict_type='INV_STOCK_STATUS');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'DAMAGED','INV_STOCK_STATUS','破损','破损','Damaged',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='DAMAGED' AND dict_type='INV_STOCK_STATUS');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'FROZEN','INV_STOCK_STATUS','冻结','冻结','Frozen',50,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='FROZEN' AND dict_type='INV_STOCK_STATUS');
