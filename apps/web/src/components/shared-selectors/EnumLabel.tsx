"use client";
/**
 * G21-2 · EnumLabel + EnumSelect — 全局枚举字典化收口（D1+D2 欠债治理）
 * ════════════════════════════════════════════════════════════════════════
 * 之前散布在各页的"if (code==='LAYER') return '蛋鸡舍'"硬编码 enum→zh map
 * （HouseSelector / TARGET_LABEL / STATUS_BADGE / GRADE_LABEL ...）
 * 统一收口到 sys_dict + 两个全局组件：
 *   · <EnumLabel type code />     — 给定 dict_type + code，渲染中文 label
 *   · <EnumSelect type value onChange /> — 给定 dict_type，渲染下拉
 *
 * 数据源：sys_dict (G17/G19 已 seed 60+ 字典)。本组件复用 useDictOptions hook。
 *
 * 用法：
 *   import { EnumLabel, EnumSelect } from '@/components/shared-selectors/EnumLabel';
 *   <EnumLabel type="BRD_HOUSE_TYPE" code="LAYER" fallback={code => code} />
 *   <EnumSelect type="BRD_MORTALITY_REASON" value={x} onChange={setX} />
 */
import { useDictOptions } from '@/hooks/useDictOptions';

export interface EnumLabelProps {
  type: string;                   // dict_type, e.g. 'BRD_HOUSE_TYPE'
  code: string | null | undefined;
  fallback?: (code: string) => string;
  className?: string;
  style?: React.CSSProperties;
}

export function EnumLabel({ type, code, fallback, className, style }: EnumLabelProps) {
  const { codeMap, loading } = useDictOptions(type);
  if (!code) return <span className={className} style={style}>—</span>;
  const safeCode = String(code);
  const zh = codeMap[safeCode];
  if (zh) return <span className={className} style={style}>{zh}</span>;
  if (loading) return <span className={className} style={{ ...style, opacity: 0.5 }}>{safeCode}</span>;
  return <span className={className} style={style}>{fallback ? fallback(safeCode) : safeCode}</span>;
}

export interface EnumSelectProps {
  type: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** EnumSelect — DictSelect 别名，未来可扩展为虚拟下拉/搜索框 */
export { DictSelect as EnumSelect } from './DictSelect';
