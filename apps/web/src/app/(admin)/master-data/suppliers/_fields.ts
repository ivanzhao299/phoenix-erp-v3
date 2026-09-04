import type { MdField } from "@/components/master-data/MasterDataRuntimePanel";

// g200p-2:14 字段分 4 组，同 new/[code]/edit 路由共用。
export const SUPPLIER_FIELDS: MdField[] = [
  { key: "supplier_name",    label: "供应商名称", required: true, group: "基本信息" },
  { key: "supplier_name_en", label: "英文名称",   group: "基本信息" },
  { key: "supply_category", label: "供应品类", dictType: "SUPPLIER_SUPPLY_CATEGORY", required: true, group: "基本信息" },
  { key: "sourcing_type", label: "采购地域", dictType: "SUPPLIER_SOURCING_TYPE", required: true, group: "基本信息" },
  { key: "country_code",     label: "国家",       dictType: "SYS_COUNTRY", group: "基本信息" },
  { key: "contact_name",     label: "联系人",     group: "联系方式" },
  { key: "contact_phone",    label: "联系电话",   group: "联系方式" },
  { key: "contact_email",    label: "邮箱",       group: "联系方式" },
  { key: "address",          label: "地址",       group: "联系方式" },
  { key: "tax_no",           label: "税号",       group: "财务设置" },
  { key: "default_currency", label: "默认币种",   dictType: "SYS_CURRENCY", group: "财务设置" },
  { key: "payment_terms",    label: "结算账期(天)", type: "number", group: "财务设置" },
  { key: "effective_date",   label: "生效日期",   type: "date", group: "有效期与备注" },
  { key: "expire_date",      label: "失效日期",   type: "date", group: "有效期与备注" },
  { key: "remark",           label: "备注",       group: "有效期与备注" },
];
