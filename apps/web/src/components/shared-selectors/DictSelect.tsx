'use client';
import { useDictOptions } from '@/hooks/useDictOptions';

/**
 * DictSelect — 统一数据字典下拉组件（G2 数据字典治理）
 * ════════════════════════════════════════════════════════════════════════
 * 从 sys_dict 按 dict_type 动态加载选项（仅 ACTIVE 状态），替代前端硬编码枚举。
 *
 * 用法：
 *   <DictSelect dictType="SYS_CURRENCY" value={currency} onChange={setCurrency} />
 *   <DictSelect dictType="PRC_PAYMENT_METHOD" value={method} onChange={setMethod} placeholder="请选择付款方式" />
 *
 * 返回 value = dict_code（如 CNY / BANK），label 显示 dict_label_zh（如 人民币 / 银行转账）。
 */
export interface DictSelectProps {
  dictType: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean;           // 是否显示"请选择"空选项
  className?: string;
  style?: React.CSSProperties;
}

export function DictSelect({
  dictType, value, onChange,
  placeholder = '请选择', disabled = false, allowEmpty = true,
  className, style,
}: DictSelectProps) {
  const { optionPairs, loading } = useDictOptions(dictType);
  const mergedClassName = ['phx-select', className].filter(Boolean).join(' ');

  return (
    <select
      className={mergedClassName}
      style={style}
      value={value}
      disabled={disabled || loading}
      onChange={(e) => onChange(e.target.value)}
    >
      {allowEmpty && <option value="">{loading ? '加载中…' : placeholder}</option>}
      {optionPairs.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

export default DictSelect;
