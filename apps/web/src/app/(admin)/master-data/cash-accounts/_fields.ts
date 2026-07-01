import type { MdField } from "@/components/master-data/MasterDataRuntimePanel";

// g200p-2:12 字段分 3 组。Page 文件不能导出非页面字段，避免 Next 构建失败。
export const CASH_ACCOUNT_FIELDS: MdField[] = [
  { key: "account_name",   label: "账户名称", required: true, group: "基本信息" },
  { key: "company_code",   label: "所属公司", required: true, type: "company", onPickKeys: { company_name: "org_name" }, group: "基本信息" },
  { key: "company_name",   label: "所属公司名称(自动带出)", type: "readonly", group: "基本信息" },
  { key: "currency_code",  label: "币种", required: true, dictType: "SYS_CURRENCY", group: "基本信息" },
  { key: "account_type",   label: "账户类型", required: true, type: "select", group: "基本信息",
    options: [
      { value: "BANK", label: "银行账户" }, { value: "CASH", label: "现金账户" },
      { value: "VIRTUAL", label: "虚拟账户" }, { value: "SHAREHOLDER", label: "股东账户" },
      { value: "INTERNAL", label: "内部账户" },
    ] },
  { key: "bank_name",       label: "开户行",     group: "银行信息" },
  { key: "bank_account_no", label: "银行账号",   group: "银行信息" },
  { key: "bank_acc_code",   label: "绑定银行账户编码(BANK-XXXXX)", group: "银行信息" },
  { key: "holder_code",     label: "持有人编码", group: "银行信息" },
  { key: "effective_date",  label: "生效日期",   type: "date", group: "有效期与备注" },
  { key: "expire_date",     label: "失效日期",   type: "date", group: "有效期与备注" },
  { key: "remark",          label: "备注",       group: "有效期与备注" },
];
