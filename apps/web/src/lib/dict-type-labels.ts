/**
 * 字典类型(dict_type) → 中文显示名 · 单一来源
 * 2026-06-10：原先字典中心 / 字典编辑器各维护一份（既缺又不一致），抽到此处共用。
 * 前台禁露英文裸码；漏网类型走 dictTypeLabel() 的前缀域兜底。
 * （与生产 sys_dict 全量 67 个 dict_type 对齐）
 */

export const DICT_TYPE_LABEL: Record<string, string> = {
  APR_MODULE_TYPE: "审批模块类型",
  BRD_BREED: "品种", BRD_BREED_TYPE: "品种类型", BRD_CULLING_REASON: "淘汰原因",
  BRD_FLOCK_STATUS: "鸡群状态", BRD_HOUSE_TYPE: "鸡舍类型", BRD_MORTALITY_REASON: "死亡原因",
  BRD_SHIFT: "养殖班次", BRD_VACCINATE_METHOD: "免疫接种方式", BRD_VACCINE_TYPE: "疫苗类型",
  BS_CUSTOMER_LEVEL: "客户等级", BS_PAYMENT_TERM: "付款条件",
  CRM_ACTIVITY_TYPE: "营销活动类型", CRM_COUPON_LEVEL: "优惠券层级", CRM_COUPON_TYPE: "优惠券类型",
  CRM_MEMBER_LEVEL: "会员等级", CRM_TARGET_GROUP: "目标客群",
  FIN_CONTRIBUTION_TYPE: "出资类型", FIN_EXPENSE_TYPE: "费用类型", FIN_FUND_NATURE: "资金性质",
  FIN_PAYER_TYPE: "付款方类型", FIN_RECEIPT_METHOD: "收款方式",
  INV_COUNT_TYPE: "盘点类型", INV_INBOUND_TYPE: "入库类型", INV_LOSS_REASON: "库存损耗原因",
  INV_OUTBOUND_DEST_TYPE: "出库目的地类型", INV_OUTBOUND_TYPE: "出库类型",
  INV_STOCK_STATUS: "库存状态", INV_TRANSFER_REASON: "调拨原因",
  PKG_ANOMALY_REASON: "包装异常原因", PKG_CUSTOM_LABEL: "自定义标签", PKG_DEFECT: "包装缺陷",
  PKG_EGG_DEFECT: "蛋品缺陷类型", PKG_EXCEPTION_TYPE: "包装异常类型", PKG_PACK_LINE: "包装线",
  PKG_PACK_SPEC: "包装规格", PKG_PRESORT_STANDARD: "预分级标准", PKG_QC_RESULT: "包装质检结果",
  PKG_SHIFT: "包装班次",
  PRC_PAYMENT_METHOD: "采购付款方式", PRC_PURCHASE_TYPE: "采购类型",
  PRC_QUALITY_STATUS: "采购质量状态", PRC_URGENCY: "采购紧急度",
  PRD_PRODUCT_GRADE: "产品等级（旧）", PRD_PRODUCT_TYPE: "产品类型",
  QC_INSPECT_CATEGORY: "质检类别", QC_INSPECT_TYPE: "质检类型", QC_NC_SOURCE: "不合格来源",
  QC_PRODUCT_CATEGORY: "质检产品类别", QC_TRACE_TYPE: "追溯类型",
  SAL_CHANNEL: "销售渠道", SAL_CUSTOMER_TYPE: "客户类型", SAL_DELIVERY_EXCEPTION: "配送异常",
  SAL_FULFILLMENT_TYPE: "履约方式", SAL_ORDER_TYPE: "订单类型", SAL_PAY_METHOD: "销售收款方式",
  SAL_PRICE_TYPE: "价格类型", SAL_RETURN_REASON: "退货原因", SAL_SETTLEMENT_METHOD: "结算方式",
  SYS_COUNTRY: "国家/地区", SYS_CURRENCY: "币种", SYS_ORG_LEVEL: "组织层级",
  TRP_EXCEPTION_TYPE: "运输异常类型", TRP_RECEIPT_STATUS: "签收状态",
  VET_USAGE: "用药方式",
  WMS_INBOUND_TYPE: "入库类型（仓储）", WMS_OUTBOUND_TYPE: "出库类型（仓储）",
};

// 前缀业务域兜底：未登记类型也按业务域显示中文，绝不露英文裸码
const PREFIX_DOMAIN: Record<string, string> = {
  APR: "审批", APPROVAL: "审批", BRD: "养殖", BS: "商务", CRM: "会员营销", FIN: "财务",
  INV: "库存", PKG: "包装", PRC: "采购", PRD: "产品", QC: "质检", QA: "质检", SAL: "销售",
  SYS: "系统", TRP: "运输", VET: "兽医", WMS: "仓储", FARM: "养殖", STORE: "门店", FEED: "饲料",
};

export function dictTypeLabel(t: string): string {
  if (!t) return "未分类";
  if (DICT_TYPE_LABEL[t]) return DICT_TYPE_LABEL[t];
  const domain = PREFIX_DOMAIN[t.split("_")[0] || ""];
  return domain ? `${domain}·${t.split("_").slice(1).join("")}` : t;
}
