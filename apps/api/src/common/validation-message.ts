import { ValidationError } from 'class-validator';

/**
 * G140：把 class-validator 的英文校验错误统一译成中文友好提示。
 * 接进全局 ValidationPipe.exceptionFactory —— 一处生效、全 app 不再弹
 * "amountOriginal must be a positive number" 这类生硬英文。
 *
 * 策略：约束类型 → 中文模板；字段名 → 中文标签（常见业务字段维护小表，未命中回退原字段名）。
 */

const CONSTRAINT_ZH: Record<string, string> = {
  isNotEmpty: '不能为空',
  isDefined: '不能为空',
  isString: '必须是文本',
  isNumber: '必须是数字',
  isNumberString: '必须是数字',
  isPositive: '必须大于 0',
  isNegative: '必须小于 0',
  isInt: '必须是整数',
  min: '数值过小',
  max: '数值过大',
  isEmail: '邮箱格式不正确',
  isEnum: '取值不在允许范围内',
  isIn: '取值不在允许范围内',
  isDateString: '日期格式不正确',
  isDate: '日期格式不正确',
  isBoolean: '必须是 是/否',
  isArray: '必须是列表',
  arrayNotEmpty: '至少需要一项',
  arrayMinSize: '项数不足',
  isUrl: '链接格式不正确',
  maxLength: '长度超出限制',
  minLength: '长度不足',
  length: '长度不符合要求',
  matches: '格式不正确',
  isUUID: '编号格式不正确',
  isNotEmptyObject: '不能为空',
};

const FIELD_ZH: Record<string, string> = {
  // 通用金额/财务
  amountOriginal: '金额',
  amountBase: '本位币金额',
  allocatedAmountOriginal: '分摊金额',
  allocatedAmountBase: '分摊本位币金额',
  exchangeRate: '汇率',
  currencyCode: '币种',
  // 付款 / 采购
  paymentDate: '付款日期',
  payerName: '付款人',
  payerType: '付款方类型',
  payeeName: '收款人',
  paymentMethod: '付款方式',
  fundNature: '资金性质',
  shareholderId: '股东',
  poNo: '采购订单号',
  apNo: '应付单号',
  contractNo: '合同号',
  subject: '主题',
  purchaseType: '采购类型',
  supplierCode: '供应商',
  supplierName: '供应商名称',
  companyCode: '公司',
  companyName: '公司名称',
  projectCode: '项目',
  projectName: '项目名称',
  expectedDate: '期望到货日期',
  payDeadline: '付款截止日期',
  // 明细行
  itemName: '物料/项目名称',
  quantity: '数量',
  qty: '数量',
  unitPrice: '单价',
  unit: '单位',
  // 主数据
  customerName: '客户名称',
  warehouseCode: '仓库',
  dictType: '字典类型',
  dictCode: '字典编码',
};

/** 友好化字段标签（未命中回退原字段名） */
function fieldLabel(prop: string): string {
  return FIELD_ZH[prop] ?? prop;
}

/** 递归收集所有失败约束 → 中文短句，去重 */
export function friendlyValidationMessage(errors: ValidationError[]): string {
  const out: string[] = [];
  const walk = (errs: ValidationError[]) => {
    for (const e of errs) {
      if (e.constraints) {
        const zh = Object.keys(e.constraints)
          .map((k) => CONSTRAINT_ZH[k])
          .filter(Boolean);
        out.push(`「${fieldLabel(e.property)}」${zh.length ? zh.join('、') : '格式不正确'}`);
      }
      if (e.children?.length) walk(e.children);
    }
  };
  walk(errors);
  const uniq = [...new Set(out)];
  return uniq.length ? `提交的数据有误：${uniq.join('；')}` : '提交的数据格式不正确，请检查后重试';
}
