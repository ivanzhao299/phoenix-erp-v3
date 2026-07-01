import type { MdField } from "@/components/master-data/MasterDataRuntimePanel";

// g200p-3:13 字段分 4 组。Page 文件不能导出非页面字段，避免 Next 构建失败。
export const BANK_ACCOUNT_FIELDS: MdField[] = [
  { key: "bank_name",      label: "开户行(中文)",    required: true, group: "基本信息" },
  { key: "bank_name_en",   label: "Bank Name (EN)",   group: "基本信息" },
  { key: "branch_name",    label: "支行",             group: "基本信息" },
  { key: "company_code",   label: "所属公司编码",     group: "基本信息" },
  { key: "account_no",     label: "账号",             required: true, group: "账户信息" },
  { key: "account_holder", label: "开户名",           required: true, group: "账户信息" },
  { key: "currency_code",  label: "币种",             required: true, type: "select", group: "账户信息",
    options: [
      { value: "CNY", label: "人民币 CNY" }, { value: "USD", label: "美元 USD" },
      { value: "EUR", label: "欧元 EUR" }, { value: "HKD", label: "港币 HKD" },
      { value: "JPY", label: "日元 JPY" }, { value: "LAK", label: "老挝基普 LAK" },
      { value: "THB", label: "泰铢 THB" }, { value: "VND", label: "越南盾 VND" },
    ] },
  { key: "country_code",   label: "国家",             type: "select", group: "国际结算",
    options: [
      { value: "CN", label: "中国" }, { value: "LA", label: "老挝" }, { value: "TH", label: "泰国" },
      { value: "VN", label: "越南" }, { value: "HK", label: "香港" }, { value: "US", label: "美国" }, { value: "OTHER", label: "其他" },
    ] },
  { key: "swift_code",     label: "SWIFT Code",       group: "国际结算" },
  { key: "iban",           label: "IBAN",             group: "国际结算" },
  { key: "effective_date", label: "生效日期",         type: "date", group: "有效期与备注" },
  { key: "expire_date",    label: "失效日期",         type: "date", group: "有效期与备注" },
  { key: "remark",         label: "备注",             group: "有效期与备注" },
];
