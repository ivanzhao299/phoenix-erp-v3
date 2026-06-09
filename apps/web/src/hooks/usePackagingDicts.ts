/**
 * usePackagingDicts — 批量拉取包装终端所需系统字典
 * 从 /api/packaging/terminal/dicts 读取，带降级兜底
 */
import { useState, useEffect } from 'react';
import { packagingApi, DictItem } from '@/lib/packaging-api';

export type DictMap = Record<string, DictItem[]>;

// ── 硬编码兜底（API 失败时使用）────────────────────────────────────────────────
export const FALLBACK_DICTS: DictMap = {
  // G67：码对齐 product_grades（grade_code=GRADE_1..5，即 BFF terminalCode）。仅 API 失败兜底用。
  PKG_EGG_GRADE: [
    { code:'GRADE_1', label:'1号蛋', labelEn:'Grade 1', labelLo:'ໄຂ່ຊັ້ນ 1', terminalCode:'GRADE_1', color:'#7c3aed', icon:'🥚', isTerminalGrade:true, saleable:true, weightRange:'59-66g' },
    { code:'GRADE_2', label:'2号蛋', labelEn:'Grade 2', labelLo:'ໄຂ່ຊັ້ນ 2', terminalCode:'GRADE_2', color:'#2563eb', icon:'🥚', isTerminalGrade:true, saleable:true, weightRange:'53-59g' },
    { code:'GRADE_3', label:'3号蛋', labelEn:'Grade 3', labelLo:'ໄຂ່ຊັ້ນ 3', terminalCode:'GRADE_3', color:'#059669', icon:'🥚', isTerminalGrade:true, saleable:true, weightRange:'46-53g' },
    { code:'GRADE_4', label:'4号蛋', labelEn:'Grade 4', labelLo:'ໄຂ່ຊັ້ນ 4', terminalCode:'GRADE_4', color:'#d97706', icon:'🥚', isTerminalGrade:true, saleable:true, weightRange:'40-46g' },
    { code:'GRADE_5', label:'5号蛋', labelEn:'Grade 5', labelLo:'ໄຂ່ຊັ້ນ 5', terminalCode:'GRADE_5', color:'#f97316', icon:'🥚', isTerminalGrade:true, saleable:true, weightRange:'30-40g' },
  ],
  // G69：码对齐 product_grades 缺陷等级（DIRTY/CRACKED/BROKEN/DAMAGED）。仅 API 失败兜底用。
  PKG_EGG_DEFECT: [
    { code:'DIRTY',   label:'脏蛋',   labelEn:'Dirty',   labelLo:'ໄຂ່ສົກ',  terminalCode:'DIRTY',   color:'#f97316', icon:'💧', isTerminalGrade:true, isDefect:true },
    { code:'CRACKED', label:'裂缝蛋', labelEn:'Cracked', labelLo:'ໄຂ່ຮ້າວ', terminalCode:'CRACKED', color:'#eab308', icon:'🥚', isTerminalGrade:true, isDefect:true },
    { code:'BROKEN',  label:'破蛋',   labelEn:'Broken',  labelLo:'ໄຂ່ແຕກ',  terminalCode:'BROKEN',  color:'#ef4444', icon:'💔', isTerminalGrade:true, isDefect:true },
    { code:'DAMAGED', label:'损坏蛋', labelEn:'Damaged', labelLo:'ໄຂ່ເສຍ',  terminalCode:'DAMAGED', color:'#6b7280', icon:'🚫', isTerminalGrade:true, isDefect:true },
  ],
  PKG_PACK_SPEC: [
    { code:'PKG_PACK_SPEC_1', label:'散装整提(纸托180枚/提)', qty:180, unit:'枚', icon:'📦', color:'#7c3aed', perBox:180 },
    { code:'PKG_PACK_SPEC_2', label:'纸箱/周转箱(360枚/箱)',  qty:360, unit:'枚', icon:'🏭', color:'#2563eb', perBox:360 },
    { code:'PKG_PACK_SPEC_3', label:'精品礼盒(30枚/盒)',      qty:30,  unit:'枚', icon:'🎁', color:'#059669', perBox:30  },
    { code:'PKG_PACK_SPEC_4', label:'客户定制规格',           qty:0,   unit:'枚', icon:'⭐', color:'#d97706', isCustom:true },
  ],
  PKG_ANOMALY_REASON: [
    { code:'PKG_ANOM_BROKEN_RATE',   label:'破损率偏高',   terminalCode:'BROKEN_RATE_HIGH',  icon:'🥚' },
    { code:'PKG_ANOM_DIRTY_RATE',    label:'脏污率偏高',   terminalCode:'DIRTY_RATE_HIGH',   icon:'💧' },
    { code:'PKG_ANOM_QTY_VARIANCE',  label:'数量差异',     terminalCode:'QUANTITY_VARIANCE', icon:'📊' },
    { code:'PKG_ANOM_PRINT_FAIL',    label:'打印失败',     terminalCode:'PRINT_FAILURE',     icon:'🖨️' },
    { code:'PKG_ANOM_SCANNER_FAIL',  label:'扫码枪故障',   terminalCode:'SCANNER_FAILURE',   icon:'📷' },
    { code:'PKG_ANOM_SCALE_FAIL',    label:'电子秤故障',   terminalCode:'SCALE_FAILURE',     icon:'⚖️' },
    { code:'PKG_ANOM_LABEL_MISMATCH', label:'标签信息不符', terminalCode:'LABEL_MISMATCH',   icon:'🏷️' },
    { code:'PKG_ANOM_OTHER',         label:'其他异常',     terminalCode:'OTHER',             icon:'❓' },
  ] as DictItem[],
  PKG_QC_RESULT: [
    { code:'PKG_QC_PASSED',              label:'✅ 合格放行',  terminalCode:'PASSED',              desc:'允许分级包装',           color:'#22c55e', icon:'✅', routeTo:'grading'    },
    { code:'PKG_QC_CONDITIONAL_RELEASE', label:'⚡ 让步放行',  terminalCode:'CONDITIONAL_RELEASE', desc:'授权后允许，需记录原因',  color:'#f59e0b', icon:'⚡', routeTo:'grading'    },
    { code:'PKG_QC_RECHECK_REQUIRED',    label:'🔄 需要复检',  terminalCode:'RECHECK_REQUIRED',    desc:'暂不允许包装入库',        color:'#3b82f6', icon:'🔄', routeTo:'exceptions' },
    { code:'PKG_QC_ON_HOLD',             label:'🔒 扣留',      terminalCode:'ON_HOLD',             desc:'进入隔离，禁止包装',      color:'#f97316', icon:'🔒', routeTo:'exceptions' },
    { code:'PKG_QC_REJECTED',            label:'❌ 拒绝/报废', terminalCode:'REJECTED',            desc:'禁止进入正常生产',        color:'#ef4444', icon:'❌', routeTo:'exceptions' },
  ] as DictItem[],
};

/**
 * 将 PKG_EGG_GRADE 条目（含 terminalCode）转为 Record<terminalCode, DictItem>
 * e.g. { A_LARGE: { label:'A级大码', color:'#7c3aed', ... }, ... }
 */
export function buildGradeMap(items: DictItem[]): Record<string, DictItem> {
  const map: Record<string, DictItem> = {};
  for (const it of items) {
    map[it.code] = it;
  }
  return map;
}

/**
 * 将 PKG_ANOMALY_REASON 条目转为 QuickType 格式数组
 */
export function buildQuickTypes(items: DictItem[]): Array<{ type: string; label: string; icon: string }> {
  return items.map(it => ({
    type:  it.code,
    label: it.label,
    icon:  (it.icon as string) || '❓',
  }));
}

/**
 * Returns the language-appropriate label for a dict item.
 * Falls back to Chinese label if no translation is available.
 */
export function getDictLabel(item: DictItem | undefined | null, lang: string): string {
  if (!item) return '';
  if (lang === 'en' && item.labelEn) return item.labelEn;
  if (lang === 'lo' && item.labelLo) return item.labelLo;
  return item.label;
}

// ── Hook ────────────────────────────────────────────────────────────────────────
export function usePackagingDicts(types: string[]): { dicts: DictMap; loading: boolean } {
  const [dicts, setDicts] = useState<DictMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    packagingApi.getDicts(types)
      .then(data => {
        // 用 API 结果覆盖兜底，未返回的类型保留兜底
        const merged: DictMap = { ...FALLBACK_DICTS };
        for (const [k, v] of Object.entries(data)) {
          if (Array.isArray(v) && v.length > 0) merged[k] = v;
        }
        setDicts(merged);
      })
      .catch(() => setDicts({ ...FALLBACK_DICTS }))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types.slice().sort().join(',')]);

  return { dicts, loading };
}
