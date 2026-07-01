import type { MdField } from "@/components/master-data/MasterDataRuntimePanel";

// g200p:字段按业务语义分 4 组，同 new/[code]/edit 路由共用。
export const CUSTOMER_FIELDS: MdField[] = [
  { key: "customer_name",   label: "客户名称", required: true, group: "基本信息" },
  { key: "customer_type",   label: "客户类型", dictType: "SAL_CUSTOMER_TYPE", group: "基本信息" },
  { key: "company_code",    label: "所属公司", type: "company", required: true, onPickKeys: { company_name: "org_name" }, group: "基本信息" },
  { key: "contact_name",    label: "联系人",   group: "联系方式" },
  { key: "contact_phone",   label: "联系电话", group: "联系方式" },
  { key: "delivery_address",label: "配送地址", group: "联系方式" },
  { key: "region_code",     label: "区域",     dictType: "SAL_REGION", group: "财务设置" },
  { key: "credit_limit",    label: "信用额度", type: "number", group: "财务设置" },
  { key: "payment_terms",   label: "账期天数", type: "number", group: "财务设置" },
  { key: "effective_date",  label: "生效日期", type: "date", group: "有效期与备注" },
  { key: "expire_date",     label: "失效日期", type: "date", group: "有效期与备注" },
  { key: "remark",          label: "备注",     group: "有效期与备注" },
];
