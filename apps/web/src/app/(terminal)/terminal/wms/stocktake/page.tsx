'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { T } from '@/styles/terminal-theme';
import TerminalNumPadPanel from '@/components/terminal/TerminalNumPadPanel';
import { ClipboardCheck, ScanLine, RefreshCw, X } from 'lucide-react';

const tok = () => {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem('phoenix_token')
      || localStorage.getItem('phoenix_token')
      || JSON.parse(localStorage.getItem('auth_user') || '{}').token
      || '';
  } catch { return ''; }
};
const api = async (path: string, init?: RequestInit) => {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}`, ...(init?.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
};

interface Batch {
  batch_no: string;
  product_code?: string | null;
  qty?: number | null;
  warehouse_code?: string | null;
  location_code?: string | null;
}
interface CountRow { batch_no: string; product_code: string; sys_qty: number; counted: string }

const POLL_MS = 0; // 盘点期间不轮询，避免 sys 基数跳动

export default function WmsStocktakeTerminalPage() {
  const router = useRouter();
  const { t } = useLanguage();

  const [batches, setBatches] = useState<Batch[]>([]);
  const [cart, setCart] = useState<CountRow[]>([]);
  const [activeBatch, setActiveBatch] = useState<string | null>(null);
  const [numKey, setNumKey] = useState(0);
  const [scan, setScan] = useState('');
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const { ok, json } = await api('/api/inventory/batches');
      if (ok && Array.isArray(json?.data)) setBatches(json.data as Batch[]);
    } catch { /* keep */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  const addToCart = useCallback((batchNo: string) => {
    const bn = batchNo.trim();
    if (!bn) return;
    const b = batches.find(x => x.batch_no === bn);
    setCart(prev => {
      if (prev.some(r => r.batch_no === bn)) return prev;  // 已在清单
      return [...prev, { batch_no: bn, product_code: b?.product_code || '', sys_qty: Math.trunc(Number(b?.qty) || 0), counted: '' }];
    });
    setActiveBatch(bn);
    setNumKey(k => k + 1);
  }, [batches]);

  const handleScan = () => {
    const v = scan.trim();
    if (!v) return;
    setScan('');
    addToCart(v);
  };

  const setCounted = (batchNo: string, val: string) => {
    setCart(prev => prev.map(r => r.batch_no === batchNo ? { ...r, counted: val } : r));
  };
  const removeRow = (batchNo: string) => {
    setCart(prev => prev.filter(r => r.batch_no !== batchNo));
    if (activeBatch === batchNo) setActiveBatch(null);
  };

  const submit = async () => {
    if (submitting) return;
    const lines = cart.filter(r => r.counted !== '').map(r => ({ batch_no: r.batch_no, counted_qty: parseInt(r.counted) || 0 }));
    if (lines.length === 0) { setError(t('terminal.wms_no_count', '请至少录入一项盘点数')); return; }
    setSubmitting(true);
    setError('');
    try {
      const { ok, json } = await api('/api/inventory/stocktake/pda-count', { method: 'POST', body: JSON.stringify({ lines }) });
      if (!ok || (json?.code && json.code >= 400)) { setError(json?.msg || t('terminal.wms_count_fail', '盘点提交失败')); return; }
      const applied = json?.applied ?? lines.length;
      setToast(`${t('terminal.wms_count_done', '盘点已入账')}：${applied} ${t('terminal.wms_lines', '项')}`);
      setCart([]);
      setActiveBatch(null);
      void fetchBatches();
      setTimeout(() => setToast(''), 3000);
    } catch { setError(t('terminal.wms_net_err', '网络错误，请重试')); }
    finally { setSubmitting(false); }
  };

  const shown = filter.trim()
    ? batches.filter(b => b.batch_no.toLowerCase().includes(filter.trim().toLowerCase()) || (b.product_code || '').toLowerCase().includes(filter.trim().toLowerCase()))
    : batches;
  const activeRow = cart.find(r => r.batch_no === activeBatch) || null;
  const numInitial = activeRow?.counted ?? '';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.BG, overflow: 'hidden' }}>
      <div style={{ background: T.CARD, borderBottom: `1px solid ${T.BOR}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <ClipboardCheck size={22} color={T.ACC} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.TXT }}>{t('terminal.wms_stocktake', '仓储盘点')}</div>
          <div style={{ fontSize: 12, color: T.MUT }}>{t('terminal.wms_stocktake_hint', '扫码或选择批次，录入实盘数，差额即时入账（写流水）')}</div>
        </div>
        {toast && <div style={{ fontSize: 14, fontWeight: 700, color: T.GRN }}>✓ {toast}</div>}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
        {/* ① 批次浏览/扫码 */}
        <div style={{ width: 320, flexShrink: 0, borderRight: `1px solid ${T.BOR}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.BOR}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.BG, border: `1px solid ${T.BOR}`, borderRadius: 10, padding: '8px 12px' }}>
              <ScanLine size={18} color={T.ACC} />
              <input
                value={scan}
                onChange={e => { setScan(e.target.value); setFilter(e.target.value); }}
                onKeyDown={e => { if (e.key === 'Enter') handleScan(); }}
                placeholder={t('terminal.wms_scan_batch_ph', '扫描/输入批次号')}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: T.TXT, fontSize: 15 }}
              />
            </div>
          </div>
          <div style={{ padding: '8px 14px 4px', fontSize: 11, color: T.MUT, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span>{t('terminal.wms_batches', '在库批次')} — {shown.length}</span>
            <button type="button" onClick={() => fetchBatches()} style={{ background: 'none', border: 'none', color: T.MUT, cursor: 'pointer', padding: 2 }}>
              <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {loading ? (
              <div style={{ color: T.MUT, fontSize: 13, padding: 16 }}>{t('common.loading', '加载中…')}</div>
            ) : shown.length === 0 ? (
              <div style={{ color: T.MUT, fontSize: 13, padding: 16, textAlign: 'center' }}>{t('terminal.wms_no_batches', '无在库批次')}</div>
            ) : shown.slice(0, 200).map(b => {
              const inCart = cart.some(r => r.batch_no === b.batch_no);
              return (
                <button key={b.batch_no} type="button" onClick={() => addToCart(b.batch_no)} style={{
                  display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px', borderRadius: 10,
                  border: `1px solid ${inCart ? T.GRN : T.BOR}`, background: inCart ? `${T.GRN}10` : T.CARD,
                  cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: inCart ? T.GRN : T.TXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.batch_no}</div>
                  <div style={{ fontSize: 11, color: T.MUT }}>{b.product_code || '—'} · {t('terminal.wms_sys', '账面')} {Math.trunc(Number(b.qty) || 0)}{inCart ? ` · ${t('terminal.wms_in_list', '已加入')}` : ''}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ② 盘点清单 */}
        <div style={{ flex: 1, overflow: 'hidden', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
          <div style={{ fontSize: 13, color: T.MUT, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0 }}>
            {t('terminal.wms_count_list', '盘点清单')}（{cart.length}）
          </div>
          {cart.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: T.MUT }}>
              <span style={{ fontSize: 36 }}>←</span>
              <span style={{ fontSize: 15 }}>{t('terminal.wms_scan_to_count', '扫码或点击左侧批次加入盘点')}</span>
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cart.map(r => {
                const counted = r.counted === '' ? null : (parseInt(r.counted) || 0);
                const diff = counted == null ? null : counted - r.sys_qty;
                const active = activeBatch === r.batch_no;
                const diffColor = diff == null ? T.MUT : diff === 0 ? T.MUT : diff > 0 ? T.GRN : T.RED;
                return (
                  <div key={r.batch_no} style={{ background: T.CARD, borderRadius: 12, border: `1px solid ${active ? T.ACC : T.BOR}`, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: T.TXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.batch_no}</div>
                      <div style={{ fontSize: 11, color: T.MUT }}>{r.product_code || '—'} · {t('terminal.wms_sys', '账面')} {r.sys_qty}
                        {diff != null && <span style={{ color: diffColor, marginLeft: 8, fontWeight: 700 }}>{t('terminal.wms_diff', '差')} {diff > 0 ? `+${diff}` : diff}</span>}
                      </div>
                    </div>
                    <button type="button" onClick={() => { setActiveBatch(r.batch_no); setNumKey(k => k + 1); }} style={{
                      width: 120, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, padding: '8px 12px',
                      borderRadius: 10, border: `1px solid ${active ? T.ACC : counted != null ? `${T.ACC}55` : T.BOR}`,
                      background: active ? `${T.ACC}14` : T.CARD, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                    }}>
                      <span style={{ fontSize: 10, color: T.MUT, alignSelf: 'flex-start' }}>{t('terminal.wms_counted', '实盘数')}</span>
                      <span style={{ fontSize: 24, fontWeight: 800, color: counted != null ? T.ACC : T.BOR, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{r.counted || (active ? '0' : '—')}</span>
                    </button>
                    <button type="button" onClick={() => removeRow(r.batch_no)} style={{ background: 'none', border: 'none', color: T.MUT, cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                      <X size={18} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {error && <div style={{ fontSize: 13, color: T.RED, fontWeight: 600, flexShrink: 0 }}>⚠️ {error}</div>}
        </div>

        {/* ③ 数字键盘 */}
        <TerminalNumPadPanel
          label={t('terminal.wms_input', '录入数量')}
          value={t('terminal.wms_counted', '实盘数')}
          accentColor={T.ACC}
          numpadKey={`${activeBatch ?? 'x'}-${numKey}`}
          numpadInitial={numInitial}
          onChange={val => { if (activeBatch) setCounted(activeBatch, val); }}
          disabled={!activeBatch}
          warning={cart.length === 0 ? `← ${t('terminal.wms_scan_to_count_short', '请先加入批次')}` : undefined}
        />
      </div>

      {/* Bottom bar */}
      <div style={{ background: T.CARD, borderTop: `1px solid ${T.BOR}`, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button type="button" onClick={() => router.push('/terminal/home')} style={{ padding: '9px 20px', borderRadius: 10, border: `1px solid ${T.BOR}`, background: 'transparent', color: T.MUT, fontSize: 15, cursor: 'pointer' }}>
          {t('common.back', '返回')}
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={submit} disabled={cart.length === 0 || submitting} style={{
          padding: '11px 48px', borderRadius: 10, border: 'none',
          background: cart.length > 0 ? T.ACC : T.BOR,
          color: cart.length > 0 ? 'var(--bg-page)' : T.MUT,
          fontSize: 16, fontWeight: 700, cursor: cart.length > 0 ? 'pointer' : 'not-allowed',
          opacity: submitting ? 0.7 : 1, minWidth: 200,
        }}>
          {submitting ? t('ui.提交中', '提交中...') : `✓ ${t('terminal.wms_confirm_count', '提交盘点')}`}
        </button>
      </div>
    </div>
  );
}
