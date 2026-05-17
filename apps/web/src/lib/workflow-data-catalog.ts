"use client";

export type WorkflowDataCatalogItem = {
  code: string;
  name: string;
  objectName: string;
  source_type: "TABLE" | "DICT" | "STATIC";
  description: string;
  valueField: string;
  labelField: string;
  table?: string;
  dict_type?: string;
  fields: Array<{ key: string; label: string; usage: string }>;
};

export const WORKFLOW_DATA_CATALOG: WorkflowDataCatalogItem[] = [
  {
    code: "MST_STORES",
    name: "门店列表",
    objectName: "门店",
    source_type: "TABLE",
    table: "mst_stores",
    valueField: "store_code",
    labelField: "store_name",
    description: "用于门店选择、门店折扣、费用归属等场景。",
    fields: [
      { key: "store_code", label: "门店编码", usage: "作为提交值" },
      { key: "store_name", label: "门店名称", usage: "作为页面显示" },
    ],
  },
  {
    code: "MST_PRODUCTS",
    name: "产品列表",
    objectName: "产品/物料",
    source_type: "TABLE",
    table: "mst_products",
    valueField: "product_code",
    labelField: "product_name",
    description: "用于采购申请、库存调整、质量异常等物料选择。",
    fields: [
      { key: "product_code", label: "产品编码", usage: "作为提交值" },
      { key: "product_name", label: "产品名称", usage: "作为页面显示" },
    ],
  },
  {
    code: "SYS_DICT_APPROVAL",
    name: "审批字典",
    objectName: "审批状态/类型",
    source_type: "DICT",
    dict_type: "APPROVAL",
    valueField: "dict_code",
    labelField: "dict_label_zh",
    description: "用于审批相关状态、类型和通用枚举。",
    fields: [
      { key: "dict_code", label: "字典编码", usage: "作为提交值" },
      { key: "dict_label_zh", label: "中文名称", usage: "作为页面显示" },
    ],
  },
  {
    code: "WMS_WAREHOUSES",
    name: "仓库列表",
    objectName: "仓库",
    source_type: "TABLE",
    table: "wms_warehouses",
    valueField: "warehouse_code",
    labelField: "warehouse_name_zh",
    description: "用于库存调整、调拨、入库、出库和盘点审批。",
    fields: [
      { key: "warehouse_code", label: "仓库编码", usage: "作为提交值" },
      { key: "warehouse_name_zh", label: "仓库名称", usage: "作为页面显示" },
    ],
  },
  {
    code: "PRC_SUPPLIERS",
    name: "供应商列表",
    objectName: "供应商",
    source_type: "TABLE",
    table: "prc_suppliers",
    valueField: "supplier_code",
    labelField: "supplier_name",
    description: "用于采购申请、付款申请、合同审批等供应商选择。",
    fields: [
      { key: "supplier_code", label: "供应商编码", usage: "作为提交值" },
      { key: "supplier_name", label: "供应商名称", usage: "作为页面显示" },
    ],
  },
  {
    code: "ORD_CUSTOMERS",
    name: "客户列表",
    objectName: "客户",
    source_type: "TABLE",
    table: "ord_customers",
    valueField: "customer_code",
    labelField: "customer_name",
    description: "用于销售订单、客户授信、特殊价格等审批场景。",
    fields: [
      { key: "customer_code", label: "客户编码", usage: "作为提交值" },
      { key: "customer_name", label: "客户名称", usage: "作为页面显示" },
    ],
  },
  {
    code: "B2B_CUSTOMERS",
    name: "B2B客户列表",
    objectName: "B2B客户",
    source_type: "TABLE",
    table: "b2b_customers",
    valueField: "customer_code",
    labelField: "customer_name",
    description: "用于批发客户、合同客户、账期调整等审批场景。",
    fields: [
      { key: "customer_code", label: "客户编码", usage: "作为提交值" },
      { key: "customer_name", label: "客户名称", usage: "作为页面显示" },
    ],
  },
];

export function dataSourceConfig(item: WorkflowDataCatalogItem) {
  if (item.source_type === "DICT") return { dict_type: item.dict_type };
  if (item.source_type === "TABLE") {
    return { table: item.table, valueField: item.valueField, labelField: item.labelField };
  }
  return { options: [] };
}

export function dataSourceLabel(code?: string) {
  return WORKFLOW_DATA_CATALOG.find(item => item.code === code)?.name || code || "";
}
