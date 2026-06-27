"use client";

export type WorkflowTemplateField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  dataSource?: string;
  span?: 1 | 2;
  options?: Array<{ label: string; value: string }>;
};

export type WorkflowTemplateApproval = {
  id: string;
  name: string;
  role: string;
};

export type WorkflowTemplate = {
  key: string;
  name: string;
  category: string;
  code: string;
  description: string;
  formCode: string;
  formName: string;
  formDescription: string;
  fields: WorkflowTemplateField[];
  approvals: WorkflowTemplateApproval[];
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    key: "expense",
    name: "费用报销审批",
    category: "财务",
    code: "EXPENSE_APPROVAL",
    description: "员工提交费用报销，部门负责人和财务复核后归档。",
    formCode: "EXPENSE_FORM",
    formName: "费用报销单",
    formDescription: "包含报销金额、费用类型、事由、门店等常用字段。",
    fields: [
      { key: "amount", label: "申请金额", type: "amount", required: true },
      { key: "expense_type", label: "费用类型", type: "select", required: true, options: [{ label: "差旅费", value: "travel" }, { label: "招待费", value: "entertainment" }, { label: "办公费", value: "office" }, { label: "其它", value: "other" }] },
      { key: "store_code", label: "所属门店", type: "reference", dataSource: "MST_STORES" },
      { key: "reason", label: "报销事由", type: "textarea", required: true, span: 2 },
    ],
    approvals: [{ id: "dept_approval", name: "部门负责人审批", role: "ROLE_FIN_CFO" }, { id: "finance_approval", name: "财务复核", role: "ROLE_FIN_ACCT" }],
  },
  {
    key: "purchase",
    name: "采购申请审批",
    category: "采购",
    code: "PURCHASE_APPROVAL",
    description: "采购需求提交后，由部门、采购、财务逐级审批。",
    formCode: "PURCHASE_REQUEST_FORM",
    formName: "采购申请单",
    formDescription: "包含采购物料、数量、预算、供应商建议和到货时间。",
    fields: [
      { key: "product_code", label: "采购物料", type: "reference", dataSource: "MST_PRODUCTS", required: true },
      { key: "quantity", label: "采购数量", type: "number", required: true },
      { key: "budget_amount", label: "预算金额", type: "amount", required: true },
      { key: "need_date", label: "期望到货日期", type: "date" },
      { key: "reason", label: "采购原因", type: "textarea", required: true, span: 2 },
    ],
    approvals: [{ id: "dept_approval", name: "部门负责人审批", role: "ROLE_PRC_BUYER" }, { id: "buyer_review", name: "采购复核", role: "ROLE_PRC_BUYER" }, { id: "finance_review", name: "财务审批", role: "ROLE_FIN_CFO" }],
  },
  {
    key: "payment",
    name: "付款申请审批",
    category: "财务",
    code: "PAYMENT_APPROVAL",
    description: "供应商付款、预付款、尾款支付的审批流程。",
    formCode: "PAYMENT_REQUEST_FORM",
    formName: "付款申请单",
    formDescription: "包含收款方、付款金额、合同/发票、付款原因。",
    fields: [
      { key: "payee", label: "收款方", type: "text", required: true },
      { key: "amount", label: "付款金额", type: "amount", required: true },
      { key: "payment_type", label: "付款类型", type: "select", required: true, options: [{ label: "预付款", value: "advance" }, { label: "到货款", value: "arrival" }, { label: "尾款", value: "final" }] },
      { key: "invoice_no", label: "发票/合同编号", type: "text" },
      { key: "reason", label: "付款说明", type: "textarea", required: true, span: 2 },
    ],
    approvals: [{ id: "dept_approval", name: "部门负责人审批", role: "ROLE_FIN_CFO" }, { id: "finance_approval", name: "财务总监审批", role: "ROLE_FIN_CFO" }],
  },
  {
    key: "contract",
    name: "合同审批流程",
    category: "合同",
    code: "CONTRACT_APPROVAL",
    description: "合同起草、法务/财务复核、负责人审批后生效。",
    formCode: "CONTRACT_REVIEW_FORM",
    formName: "合同审批单",
    formDescription: "包含合同主体、金额、期限、风险说明和附件。",
    fields: [
      { key: "counterparty", label: "合同相对方", type: "text", required: true },
      { key: "contract_amount", label: "合同金额", type: "amount", required: true },
      { key: "contract_type", label: "合同类型", type: "select", options: [{ label: "采购合同", value: "purchase" }, { label: "销售合同", value: "sales" }, { label: "服务合同", value: "service" }] },
      { key: "effective_date", label: "生效日期", type: "date" },
      { key: "risk_note", label: "风险说明", type: "textarea", span: 2 },
    ],
    approvals: [{ id: "biz_review", name: "业务负责人审批", role: "ROLE_FIN_CFO" }, { id: "finance_review", name: "财务复核", role: "ROLE_FIN_CFO" }, { id: "final_review", name: "最终确认", role: "ROLE_FIN_CFO" }],
  },
  {
    key: "leave",
    name: "请假申请审批",
    category: "人事",
    code: "LEAVE_APPROVAL",
    description: "员工请假提交，直属主管审批，人事备案。",
    formCode: "LEAVE_REQUEST_FORM",
    formName: "请假申请单",
    formDescription: "包含假期类型、开始时间、结束时间、请假原因。",
    fields: [
      { key: "leave_type", label: "假期类型", type: "select", required: true, options: [{ label: "事假", value: "personal" }, { label: "病假", value: "sick" }, { label: "年假", value: "annual" }, { label: "调休", value: "comp" }] },
      { key: "start_time", label: "开始时间", type: "datetime", required: true },
      { key: "end_time", label: "结束时间", type: "datetime", required: true },
      { key: "reason", label: "请假原因", type: "textarea", required: true, span: 2 },
    ],
    approvals: [{ id: "manager_approval", name: "负责人审批", role: "ROLE_HR_ADMIN" }],
  },
  {
    key: "stock_adjust",
    name: "库存调整审批",
    category: "仓储",
    code: "STOCK_ADJUST_APPROVAL",
    description: "库存盘盈盘亏、调账、报损等调整事项审批。",
    formCode: "STOCK_ADJUST_FORM",
    formName: "库存调整单",
    formDescription: "包含仓库、物料、批次、调整数量、调整原因。",
    fields: [
      { key: "warehouse", label: "仓库/门店", type: "text", required: true },
      { key: "product_code", label: "商品/物料", type: "reference", dataSource: "MST_PRODUCTS", required: true },
      { key: "adjust_qty", label: "调整数量", type: "number", required: true },
      { key: "adjust_type", label: "调整类型", type: "select", required: true, options: [{ label: "盘盈", value: "gain" }, { label: "盘亏", value: "loss" }, { label: "报损", value: "scrap" }] },
      { key: "reason", label: "调整原因", type: "textarea", required: true, span: 2 },
    ],
    approvals: [{ id: "warehouse_review", name: "仓储负责人审批", role: "ROLE_WMS_MGR" }, { id: "finance_record", name: "财务备案", role: "ROLE_FIN_ACCT" }],
  },
  {
    key: "quality_exception",
    name: "质量异常处理",
    category: "品控",
    code: "QUALITY_EXCEPTION_APPROVAL",
    description: "质量异常上报、责任确认、处理方案审批和关闭。",
    formCode: "QUALITY_EXCEPTION_FORM",
    formName: "质量异常单",
    formDescription: "包含异常类型、批次、问题描述、处理建议和责任部门。",
    fields: [
      { key: "batch_no", label: "批次号", type: "text", required: true },
      { key: "exception_type", label: "异常类型", type: "select", required: true, options: [{ label: "破损", value: "broken" }, { label: "重量异常", value: "weight" }, { label: "污染", value: "pollution" }, { label: "其它", value: "other" }] },
      { key: "severity", label: "严重程度", type: "radio", required: true, options: [{ label: "一般", value: "normal" }, { label: "严重", value: "major" }] },
      { key: "description", label: "异常描述", type: "textarea", required: true, span: 2 },
      { key: "proposal", label: "处理建议", type: "textarea", span: 2 },
    ],
    approvals: [{ id: "qa_review", name: "品控负责人审批", role: "ROLE_QA_MGR" }, { id: "biz_confirm", name: "业务确认", role: "ROLE_QA_MGR" }],
  },
  {
    key: "store_discount",
    name: "门店折扣审批",
    category: "门店",
    code: "STORE_DISCOUNT_APPROVAL",
    description: "门店临时折扣、促销让利、特殊价格审批。",
    formCode: "STORE_DISCOUNT_FORM",
    formName: "门店折扣申请单",
    formDescription: "包含门店、折扣类型、让利金额、活动周期和原因。",
    fields: [
      { key: "store_code", label: "门店", type: "reference", dataSource: "MST_STORES", required: true },
      { key: "discount_rate", label: "折扣比例", type: "number", required: true },
      { key: "amount_impact", label: "预计影响金额", type: "amount" },
      { key: "reason", label: "申请原因", type: "textarea", required: true, span: 2 },
    ],
    approvals: [{ id: "store_review", name: "门店经理审批", role: "ROLE_STORE_MGR" }, { id: "sales_review", name: "销售负责人审批", role: "ROLE_SALES_MGR" }],
  },
  {
    key: "farm_medicine",
    name: "养殖用药审批",
    category: "养殖",
    code: "FARM_MEDICINE_APPROVAL",
    description: "养殖场用药、疫苗、防疫处理等关键事项审批。",
    formCode: "FARM_MEDICINE_FORM",
    formName: "养殖用药申请单",
    formDescription: "包含养殖场、药品、批次、用药对象、剂量和兽医意见。",
    fields: [
      { key: "house_no", label: "鸡舍/栏舍", type: "text", required: true },
      { key: "medicine_name", label: "药品/疫苗名称", type: "text", required: true },
      { key: "dosage", label: "用量", type: "text", required: true },
      { key: "use_date", label: "计划使用日期", type: "date" },
      { key: "reason", label: "用药原因", type: "textarea", required: true, span: 2 },
    ],
    approvals: [{ id: "vet_review", name: "驻场兽医审批", role: "ROLE_VET" }, { id: "farm_review", name: "养殖场长确认", role: "ROLE_FARM_MGR" }],
  },
  {
    key: "logistics_exception",
    name: "运输异常处理",
    category: "物流",
    code: "LOGISTICS_EXCEPTION_APPROVAL",
    description: "运输延误、破损、温控异常、补偿方案等处理审批。",
    formCode: "LOGISTICS_EXCEPTION_FORM",
    formName: "运输异常单",
    formDescription: "包含运单、异常类型、损失金额、责任方和处理方案。",
    fields: [
      { key: "shipment_no", label: "运输单号", type: "text", required: true },
      { key: "exception_type", label: "异常类型", type: "select", required: true, options: [{ label: "延误", value: "delay" }, { label: "破损", value: "damage" }, { label: "拒收", value: "reject" }, { label: "温控异常", value: "temperature" }] },
      { key: "loss_amount", label: "预估损失", type: "amount" },
      { key: "description", label: "异常说明", type: "textarea", required: true, span: 2 },
    ],
    approvals: [{ id: "log_review", name: "物流负责人审批", role: "ROLE_LOG_MGR" }, { id: "finance_record", name: "财务备案", role: "ROLE_FIN_ACCT" }],
  },
];
