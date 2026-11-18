/**
 * inv_ledger.change_type 权威枚举常量（INV-202）。
 *
 * 来源：2026-11-17 全库写入侧盘点（grep 所有 INSERT INTO inv_ledger 实参），
 * 与迁移 <ts>-InvLedgerChangeTypeDictSeed 的 sys_dict(INV_LEDGER_CHANGE_TYPE)
 * 字典项一一对应。写入侧引擎一律引用本常量，禁止再手写字符串字面量；
 * 仅替换字面量、不改行为。不加 DB CHECK（历史值兼容优先）。
 *
 * 只读兼容的历史值（无活跃写入方，读侧过滤仍在用，勿用于新写入）：
 * WRITE_OFF / QC_REJECT；另有 V2 遗留读侧值 SALES / PURCHASE_IN / STORE_IN /
 * RECV_IN / PACK_DONE / EGG_GRADED / FARM_OUT_MEDICATION（冻结 ETL 基线数据）。
 */
export const INV_LEDGER_CHANGE_TYPE = {
  /** 通用入库兜底（egg 生产入库默认 / wms resolveInboundLedgerType fallback） */
  INBOUND: 'INBOUND',
  /** 通用出库兜底（wms resolveOutboundLedgerType fallback） */
  OUTBOUND: 'OUTBOUND',

  // ── sales-v2 egg 引擎 ──────────────────────────────────────────────────────
  /** 订单审批库存预占 */
  RESERVED: 'RESERVED',
  /** 订单取消释放预占 */
  RELEASED: 'RELEASED',
  /** FIFO 出库扣减（egg 装车出库 / POS 收银） */
  FIFO_OUT: 'FIFO_OUT',
  /** 销售退货回库 */
  SALE_RETURN: 'SALE_RETURN',
  /** 退货破损核销 */
  DAMAGE_WRITEOFF: 'DAMAGE_WRITEOFF',
  /** 过期自动核销 */
  EXPIRE_WRITEOFF: 'EXPIRE_WRITEOFF',
  /** 临时生产入库（production-inbound） */
  TEMP_PRODUCTION_INBOUND: 'TEMP_PRODUCTION_INBOUND',
  /** 已审核的限定误入库更正；不计正常出库或盘亏 */
  TEMP_PRODUCTION_REVERSAL: 'TEMP_PRODUCTION_REVERSAL',
  /** Approved formal installment correction, always bound to original allocations. */
  PRODUCTION_INBOUND_REVERSAL: 'PRODUCTION_INBOUND_REVERSAL',
  /** 包装入库（packaging-inventory-integration） */
  PACKAGING_INBOUND: 'PACKAGING_INBOUND',

  // ── wms 引擎 ───────────────────────────────────────────────────────────────
  /** 采购收货入库 */
  PURCHASE_INBOUND: 'PURCHASE_INBOUND',
  /** 生产完工入库 */
  PRODUCTION_INBOUND: 'PRODUCTION_INBOUND',
  /** 调拨入库 */
  TRANSFER_IN: 'TRANSFER_IN',
  /** 销售退货入库（WMS 工作流） */
  SALES_RETURN_INBOUND: 'SALES_RETURN_INBOUND',
  /** 盘盈调整 */
  STOCKTAKE_UP: 'STOCKTAKE_UP',
  /** 期初导入 */
  OPENING_INBOUND: 'OPENING_INBOUND',
  /** 销售出库 */
  SALE_OUTBOUND: 'SALE_OUTBOUND',
  /** 调拨出库 */
  TRANSFER_OUT: 'TRANSFER_OUT',
  /** 生产领料 */
  PRODUCTION_ISSUE: 'PRODUCTION_ISSUE',
  /** 饲料发料 */
  FEED_ISSUE: 'FEED_ISSUE',
  /** 药品发料 */
  MEDICINE_ISSUE: 'MEDICINE_ISSUE',
  /** 物流领用 */
  LOGISTICS_ISSUE: 'LOGISTICS_ISSUE',
  /** 备件领用 */
  SPARE_PART_ISSUE: 'SPARE_PART_ISSUE',
  /** 办公用品领用 */
  OFFICE_ISSUE: 'OFFICE_ISSUE',
  /** 维修领用 */
  MAINTENANCE_ISSUE: 'MAINTENANCE_ISSUE',
  /** 报废出库 */
  SCRAP_OUTBOUND: 'SCRAP_OUTBOUND',
  /** 采购退货出库 */
  PURCHASE_RETURN_OUT: 'PURCHASE_RETURN_OUT',
  /** 盘亏调整 */
  STOCKTAKE_DOWN: 'STOCKTAKE_DOWN',
  /** 入库破损进隔离 */
  INBOUND_BROKEN: 'INBOUND_BROKEN',
  /** 调拨收货溢余 */
  RECEIVE_OVER: 'RECEIVE_OVER',
  /** 调拨收货短缺 */
  RECEIVE_SHORT: 'RECEIVE_SHORT',
  /** 调拨破损入库 */
  TRANSFER_DAMAGE_INBOUND: 'TRANSFER_DAMAGE_INBOUND',
  /** 缺陷处置调拨出 */
  DEFECT_TRANSFER_OUT: 'DEFECT_TRANSFER_OUT',
  /** 缺陷处置调拨入 */
  DEFECT_TRANSFER_IN: 'DEFECT_TRANSFER_IN',
  /** 损耗出库（wms 损耗单） */
  LOSS: 'LOSS',

  // ── farm 引擎 ──────────────────────────────────────────────────────────────
  /** 兽药入库 */
  MED_INBOUND: 'MED_INBOUND',
  /** 兽药出库 */
  MED_OUTBOUND: 'MED_OUTBOUND',
  /** 疫苗出库 */
  VACCINE_OUTBOUND: 'VACCINE_OUTBOUND',
  /** 农场日产入账（legacy PRD-EGG） */
  FARM_IN: 'FARM_IN',
  /** 农场入账冲销 */
  FARM_REVERSED: 'FARM_REVERSED',

  // ── 只读历史值（无活跃写入方，读侧过滤兼容） ──────────────────────────────
  /** 损耗核销（历史值） */
  WRITE_OFF: 'WRITE_OFF',
  /** 质检拒收（历史值） */
  QC_REJECT: 'QC_REJECT',
} as const;

export type InvLedgerChangeType =
  (typeof INV_LEDGER_CHANGE_TYPE)[keyof typeof INV_LEDGER_CHANGE_TYPE];
