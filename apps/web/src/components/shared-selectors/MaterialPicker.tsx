'use client';
/**
 * MaterialPicker —— 可搜索 + 找不到就地新建的物料组合框（PC 采购明细专用）
 * ════════════════════════════════════════════════════════════════════════
 * 与普通下拉 <MaterialSelector> 的差异：
 *   ① 输入框可直接打字，实时本地过滤已加载的物料列表（按 material_name 包含、忽略大小写）
 *   ② 候选里没有完全匹配项时，下拉底部出现「+ 新建物料「<词>」」入口
 *   ③ 内联表单：物料名称(预填) + 物料类型(DictSelect PRC_MATERIAL_TYPE) + 规格 + 单位
 *      → POST /lookup/materials/quick 直接建 ACTIVE 物料
 *      → 新物料并入本地列表 + 自动选中 + invalidateCache + toast
 *
 * value/onChange 走 material_name（采购明细 itemName 存名称）；
 * onPickRaw 回传选中/新建物料的原始行（material_code/material_name/material_type/spec/unit），
 * 供调用方自动带出 itemCode/spec/unit。
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import request from '@/lib/api-client';
import { cachedGet, invalidateCache, TTL } from '@/lib/request-cache';
import { DictSelect } from './DictSelect';
import { Search } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { useLanguage } from '@/contexts/LanguageContext';

export interface MaterialRow {
  material_code: string;
  material_name: string;
  material_type?: string;
  spec?: string;
  unit?: string;
  existing?: boolean;
}

interface MaterialPickerProps {
  value: string;                       // material_name
  onChange: (name: string) => void;
  onPickRaw?: (m: MaterialRow | null) => void;
  disabled?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}

// G91：读走开放 lookup 端点（仅 JWT，采购录入用户可拉）；runtime/active 受主数据权限门控会 403
const MATERIAL_LOOKUP = '/lookup/materials';
const MATERIAL_QUICK_CREATE = '/lookup/materials/quick';

// 归一化 runtime 返回（兼容 {code,name} 简化形与全行形）
function normalize(r: any): MaterialRow {
  const code = r.material_code ?? r.code ?? '';
  return {
    material_code: code,
    material_name: r.material_name ?? r.name ?? code,
    material_type: r.material_type ?? r.materialType ?? undefined,
    spec: r.spec ?? undefined,
    unit: r.unit ?? undefined,
  };
}

async function loadMaterials(): Promise<MaterialRow[]> {
  return cachedGet<MaterialRow[]>(`lookup:${MATERIAL_LOOKUP}`, TTL.lookup, async () => {
    const j: any = await request<any>(MATERIAL_LOOKUP);
    const arr = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
    return arr.map(normalize);
  });
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 7,
  border: '1px solid var(--border)', background: 'var(--bg-card)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
};

// G166：下拉改 createPortal 到 body + position:fixed —— 原 absolute 下拉被明细表容器
//   overflowX:auto(会令 overflow-y 也成 auto)裁切。portal 到顶层按输入框 rect 定位即不被裁。
const panelStyle: React.CSSProperties = {
  position: 'fixed', zIndex: 10300,
  maxHeight: 280, overflowY: 'auto', background: 'var(--bg-card)',
  border: '1px solid var(--border)', borderRadius: 8,
  boxShadow: '0 8px 28px rgba(0,0,0,0.18)', padding: 4,
};

const formFieldStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--bg-card)',
  color: 'var(--text-primary)', fontSize: 12.5, outline: 'none',
};

export function MaterialPicker({
  value, onChange, onPickRaw, disabled, placeholder, style,
}: MaterialPickerProps) {
  const { t } = useLanguage();
  const toast = useToast();
  const resolvedPlaceholder = placeholder ?? t('ui.搜索或新建物料', '搜索或新建物料');
  const [list, setList] = useState<MaterialRow[]>([]);
  const [query, setQuery] = useState('');          // 当前输入框文字
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [creating, setCreating] = useState(false); // 是否展开内联新建表单
  const [saving, setSaving] = useState(false);

  // 新建表单字段
  const [nName, setNName] = useState('');
  const [nType, setNType] = useState('');
  const [nSpec, setNSpec] = useState('');
  const [nUnit, setNUnit] = useState('');

  const boxRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  useEffect(() => { setMounted(true); }, []);

  // G166：按输入框 rect 定位 portal 下拉；open 时计算 + 滚动/缩放时跟随
  const updateRect = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);
  useEffect(() => {
    if (!open) return;
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [open, updateRect]);

  // 受控 value（外部 itemName）同步进输入框
  useEffect(() => { setQuery(value ?? ''); }, [value]);

  // mount 拉物料列表
  useEffect(() => {
    let alive = true;
    loadMaterials().then(l => { if (alive) setList(l); }).catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, []);

  // 点外部关闭
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      // G166：panel 已 portal 到 body（不在 boxRef 内），需同时放行 panelRef，否则点下拉/内联新建即关闭
      if (boxRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false); setCreating(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return list;
    return list.filter(m => (m.material_name ?? '').toLowerCase().includes(q));
  }, [list, q]);

  const hasExact = useMemo(
    () => list.some(m => (m.material_name ?? '').trim().toLowerCase() === q),
    [list, q],
  );
  const showCreate = q.length > 0 && !hasExact;

  const pick = useCallback((m: MaterialRow) => {
    onChange(m.material_name);
    onPickRaw?.(m);
    setQuery(m.material_name);
    setOpen(false);
    setCreating(false);
  }, [onChange, onPickRaw]);

  const openCreate = useCallback(() => {
    setNName(query.trim());
    setNType('');
    setNSpec('');
    setNUnit('');
    setCreating(true);
  }, [query]);

  async function submitCreate() {
    const name = nName.trim();
    if (!name) { toast.error(t('ui.物料名称不能为空','物料名称不能为空')); return; }
    setSaving(true);
    try {
      const res = await request<{ code?: string; name?: string; data?: any }>(
        MATERIAL_QUICK_CREATE,
        {
          method: 'POST',
          body: JSON.stringify({
            material_name: name,
            material_type: nType || undefined,
            spec: nSpec.trim() || undefined,
            unit: nUnit.trim() || undefined,
          }),
        },
      );
      const data = res?.data ?? res;
      const row: MaterialRow = {
        material_code: data.material_code ?? data.code,
        material_name: data.material_name ?? data.name ?? name,
        material_type: (data.material_type ?? data.materialType ?? nType) || undefined,
        spec: (data.spec ?? nSpec.trim()) || undefined,
        unit: (data.unit ?? nUnit.trim()) || undefined,
        existing: data.existing === true,
      };
      // 失效缓存并并入本地列表（避免等 5min TTL）
      invalidateCache(`lookup:${MATERIAL_LOOKUP}`);
      setList(prev => [row, ...prev.filter(m => m.material_code !== row.material_code)]);
      pick(row);
      toast.success(row.existing ? `${t('ui.物料','物料')}「${row.material_name}」${t('ui.已存在，已为你选中','已存在，已为你选中')}` : `${t('ui.物料','物料')}「${row.material_name}」${t('ui.已新建','已新建')}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('ui.新建物料失败','新建物料失败'));
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === 'Escape') { setOpen(false); setCreating(false); return; }
    if (!open) { if (e.key === 'ArrowDown') { setOpen(true); } return; }
    if (creating) return; // 新建表单内不抢键
    const total = filtered.length + (showCreate ? 1 : 0);
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setHighlight(h => Math.min(h + 1, total - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight < filtered.length) pick(filtered[highlight]);
      else if (showCreate) openCreate();
    }
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', width: '100%' }}>
      <Search
        size={13}
        aria-hidden
        style={{
          position: 'absolute',
          left: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-tertiary)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />
      <input
        style={{ ...inputStyle, ...style, paddingLeft: 26 }}
        value={query}
        disabled={disabled}
        placeholder={resolvedPlaceholder}
        onChange={e => {
          setQuery(e.target.value);
          onChange(e.target.value);  // 允许临时填写名称（无 code 的临时料）
          setOpen(true); setCreating(false); setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && !disabled && mounted && rect && createPortal(
        <div ref={panelRef} style={{ ...panelStyle, top: rect.top, left: rect.left, width: rect.width }}>
          {filtered.length === 0 && !showCreate && (
            <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
              {t('ui.暂无可选物料，请输入物料名称后新建','暂无可选物料，请输入物料名称后新建')}
            </div>
          )}
          {filtered.map((m, i) => (
            <div
              key={m.material_code || m.material_name}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={e => { e.preventDefault(); pick(m); }}
              style={{
                padding: '7px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5,
                color: 'var(--text-primary)',
                background: highlight === i ? 'var(--bg-muted)' : 'transparent',
              }}
            >
              <span style={{ fontWeight: 500 }}>{m.material_name}</span>
              <span style={{ color: 'var(--text-secondary)', marginLeft: 6, fontSize: 11.5 }}>
                {m.material_code}{m.spec ? ` · ${m.spec}` : ''}{m.unit ? ` · ${m.unit}` : ''}
              </span>
            </div>
          ))}

          {showCreate && !creating && (
            <div
              onMouseEnter={() => setHighlight(filtered.length)}
              onMouseDown={e => { e.preventDefault(); openCreate(); }}
              style={{
                padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5,
                color: 'var(--status-info, #3b82f6)', fontWeight: 600,
                borderTop: filtered.length ? '1px solid var(--border)' : undefined,
                marginTop: filtered.length ? 4 : 0,
                background: highlight === filtered.length ? 'var(--bg-muted)' : 'transparent',
              }}
            >
              + {t('ui.未找到匹配项，直接新建物料','未找到匹配项，直接新建物料')}「{query.trim()}」
            </div>
          )}

          {creating && (
            <div
              onMouseDown={e => e.stopPropagation()}
              style={{
                padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
                borderTop: '1px solid var(--border)', marginTop: 4,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{t('ui.新建物料','新建物料')}</div>
              <div>
                <label style={lbl}>{t('ui.物料名称','物料名称')}</label>
                <input style={formFieldStyle} value={nName} onChange={e => setNName(e.target.value)} placeholder={t('ui.物料名称','物料名称')} />
              </div>
              <div>
                <label style={lbl}>{t('ui.物料类型','物料类型')}</label>
                <DictSelect dictType="PRC_MATERIAL_TYPE" value={nType} onChange={setNType}
                  placeholder={t('ui.请选择物料类型','请选择物料类型')} style={{ fontSize: 12.5, padding: '6px 10px' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>{t('ui.规格','规格')}</label>
                  <input style={formFieldStyle} value={nSpec} onChange={e => setNSpec(e.target.value)} placeholder={t('ui.如 50kg/包','如 50kg/包')} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>{t('ui.单位','单位')}</label>
                  <input style={formFieldStyle} value={nUnit} onChange={e => setNUnit(e.target.value)} placeholder={t('ui.如 kg / 件','如 kg / 件')} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 2 }}>
                <button type="button" disabled={saving}
                  onClick={() => setCreating(false)}
                  style={{ ...btn, background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
                  {t('ui.取消','取消')}
                </button>
                <button type="button" disabled={saving}
                  onClick={submitCreate}
                  style={{ ...btn, background: 'var(--brand-primary, #2563eb)', color: '#fff', opacity: saving ? 0.6 : 1 }}>
                  {saving ? t('ui.保存中…','保存中…') : t('ui.保存','保存')}
                </button>
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3,
};
const btn: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)',
  fontSize: 12.5, cursor: 'pointer', fontWeight: 500,
};

export default MaterialPicker;
