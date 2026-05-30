"use client";

export type WorkflowDataCatalogItem = {
  code: string;
  name: string;
  objectName: string;
  source_type: "TABLE" | "DICT" | "STATIC";
  description: string;
  valueField: string;
  labelField: string;
  valueFields?: string[];
  labelFields?: string[];
  statusFields?: string[];
  activeValues?: string[];
  table?: string;
  dict_type?: string;
  fields: Array<{ key: string; label: string; usage: string }>;
};

export const WORKFLOW_DATA_CATALOG: WorkflowDataCatalogItem[] = [
  {
    code: "SYS_USERS",
    name: "系统用户",
    objectName: "用户",
    source_type: "TABLE",
    table: "sys_user",
    valueField: "user_id",
    labelField: "real_name",
    valueFields: ["user_id", "id"],
    labelFields: ["real_name", "real_name_zh", "username"],
    statusFields: ["status"],
    activeValues: ["1", "ACTIVE", "ENABLED", "true"],
    description: "用于指定审批人、转交处理人、抄送人等用户选择；后台新增用户后自动可选。",
    fields: [
      { key: "user_id", label: "用户ID", usage: "作为提交值" },
      { key: "real_name", label: "用户姓名", usage: "作为页面显示" },
    ],
  },
  {
    code: "SYS_ROLES",
    name: "系统角色",
    objectName: "角色",
    source_type: "TABLE",
    table: "sys_role",
    valueField: "role_code",
    labelField: "role_name_zh",
    statusFields: ["status"],
    activeValues: ["1", "ACTIVE", "ENABLED", "true"],
    description: "用于审批节点、转交和权限相关选择；后台新增角色后自动可选。",
    fields: [
      { key: "role_code", label: "角色编码", usage: "作为提交值" },
      { key: "role_name_zh", label: "角色名称", usage: "作为页面显示" },
    ],
  },
  {
    code: "SYS_ORGS",
    name: "组织部门",
    objectName: "组织/部门",
    source_type: "TABLE",
    table: "sys_orgs",
    valueField: "org_code",
    labelField: "org_name",
    valueFields: ["org_code", "id"],
    labelFields: ["org_name"],
    statusFields: ["status"],
    activeValues: ["1", "ACTIVE", "ENABLED", "true"],
    description: "用于部门负责人、发起人所属部门、组织范围等动态审批规则。",
    fields: [
      { key: "org_code", label: "组织编码", usage: "作为提交值" },
      { key: "org_name", label: "组织名称", usage: "作为页面显示" },
    ],
  },
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
  // [Phase G2] ORD_CUSTOMERS / B2B_CUSTOMERS 已迁入 sal_customers，统一读取正式主档
  {
    code: "SAL_CUSTOMERS",
    name: "客户档案",
    objectName: "客户",
    source_type: "TABLE",
    table: "sal_customers",
    valueField: "customer_no",
    labelField: "customer_name",
    description: "统一客户主档（Sales V2），含直营店/经销商/大客户/散客零售。历史 ord_customers 与 b2b_customers 已迁入此表。",
    fields: [
      { key: "customer_no",   label: "客户编号", usage: "作为提交值" },
      { key: "customer_name", label: "客户名称", usage: "作为页面显示" },
      { key: "customer_type", label: "渠道类型", usage: "可选筛选条件" },
    ],
  },
];

export function dataSourceConfig(item: WorkflowDataCatalogItem) {
  if (item.source_type === "DICT") return { dict_type: item.dict_type };
  if (item.source_type === "TABLE") {
    return {
      table: item.table,
      valueField: item.valueField,
      labelField: item.labelField,
      valueFields: item.valueFields,
      labelFields: item.labelFields,
      statusFields: item.statusFields,
      activeValues: item.activeValues,
    };
  }
  return { options: [] };
}

export function dataSourceLabel(code?: string) {
  return WORKFLOW_DATA_CATALOG.find(item => item.code === code)?.name || code || "";
}
