'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { T } from '@/styles/terminal-theme';
import TerminalNumPadPanel from '@/components/terminal/TerminalNumPadPanel';
import styles from '../workstation.module.css';
import { ClipboardCheck, ScanLine, RefreshCw, X } from 'lucide-react';
import { formatBusinessEnum, formatMasterData } from '@/lib/business-display';
import { invalidateBatchLookups } from '@/lib/request-cache';

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
  batch_version: string;
  unit?: string | null;
  product_code?: string | null;
  qty?: number | null;
  warehouse_code?: string | null;
  location_code?: string | null;
  status?: string | null;
  sku_code?: string | null;
  sku_name?: string | null;
  sku_name_en?: string | null;
  sku_name_lo?: string | null;
  warehouse_name?: string | null;
  warehouse_name_zh?: string | null;
  warehouse_name_en?: string | null;
  warehouse_name_lo?: string | null;
  location_name?: string | null;
}
interface CountRow extends Batch { product_code: string; sys_qty: number; counted: string; needsReview?: boolean }



export default function WmsStocktakeTerminalPage() {
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const canCount = hasPermission('MENU_WMS_INOUT', 'E');
  const pendingStocktakeKey = user?.username ? 'warehouse-stocktake-pending:' + user.username : '';
  const { t, lang } = useLanguage();

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
  const [pendingRequest, setPendingRequest] = useState<string | null>(null);
  const [draftOwner, setDraftOwner] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const lookup = useRef(false);
  const sending = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const pending = pendingStocktakeKey ? sessionStorage.getItem(pendingStocktakeKey) : null;
      let restored: CountRow[] = [];
      try {
        const saved = pendingStocktakeKey && sessionStorage.getItem(pendingStocktakeKey + ':draft');
        if (saved) {
          const rows: unknown = JSON.parse(saved);
          if (Array.isArray(rows)) restored = rows;
        } else if (pending) {
          const { lines } = JSON.parse(pending);
          if (Array.isArray(lines)) restored = lines.map(line => ({
            batch_no: line.batch_no, batch_version: line.batch_version, counted: String(line.counted_qty),
            product_code: '', sys_qty: Number.NaN, needsReview: true,
          }));
        }
      } catch { /* a damaged local draft can be recreated by scanning a batch */ }
      setPendingRequest(pending);
      setCart(restored);
      setDraftOwner(pendingStocktakeKey);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pendingStocktakeKey]);

  useEffect(() => {
    if (!draftOwner || draftOwner !== pendingStocktakeKey) return;
    if (cart.length) sessionStorage.setItem(draftOwner + ':draft', JSON.stringify(cart));
    else sessionStorage.removeItem(draftOwner + ':draft');
  }, [cart, draftOwner, pendingStocktakeKey]);

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const { ok, json } = await api('/api/inventory/stocktake/batches');
      if (ok && Array.isArray(json?.data)) setBatches(json.data as Batch[]);
    } catch { /* keep */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  const addToCart = useCallback(async (batchNo: string) => {
    const bn = batchNo.trim();
    if (!bn || !canCount || sending.current || lookup.current || pendingRequest || draftOwner !== pendingStocktakeKey) return;
    lookup.current = true;
    setLookingUp(true);
    setError('');
    try {
      const { ok, json } = await api('/api/inventory/stocktake/batches?' + new URLSearchParams({ batch_no: bn }));
      const batch = ok && Array.isArray(json?.data) ? (json.data as Batch[]).find(row => row.batch_no === bn) : undefined;
      if (!batch?.batch_version || batch.qty == null) {
        setError(t('terminal.wms_batch_missing', '该批次不存在或无盘点权限'));
        return;
      }
      setCart(previous => {
        const current = previous.find(row => row.batch_no === bn);
        const row = { ...batch, product_code: batch.product_code || '', sys_qty: Number(batch.qty),
          counted: current?.counted ?? '', needsReview: false };
        return current ? previous.map(item => item.batch_no === bn ? row : item) : [...previous, row];
      });
      setScan(value => value.trim() === bn ? '' : value);
      setActiveBatch(bn);
      setNumKey(k => k + 1);
    } catch { setError(t('terminal.wms_net_err', '网络错误，请重试')); }
    finally { lookup.current = false; setLookingUp(false); }
  }, [canCount, draftOwner, pendingRequest, pendingStocktakeKey, t]);

  const handleScan = () => {
    const v = scan.trim();
    if (!v) return;
    void addToCart(v);
  };

  const setCounted = (batchNo: string, val: string) => {
    setCart(prev => prev.map(r => r.batch_no === batchNo ? { ...r, counted: val } : r));
  };
  const removeRow = (batchNo: string) => {
    setCart(prev => prev.filter(r => r.batch_no !== batchNo));
    if (activeBatch === batchNo) setActiveBatch(null);
  };

  const submit = async () => {
    if (!canCount || sending.current || lookup.current || !pendingStocktakeKey || draftOwner !== pendingStocktakeKey) return;
    let requestBody = pendingRequest;
    if (!requestBody) {
      if (cart.some(row => row.needsReview)) {
        setError(t('terminal.wms_recheck_count', '库存已变化，请重新扫码核对账面数量，再提交保留的实盘数'));
        return;
      }
      if (!cart.length || cart.some(row => !/^\d{1,11}(?:\.\d{1,3})?$/.test(row.counted))) {
        setError(t('terminal.wms_count_invalid', '请为每个批次录入有效实盘数量'));
        return;
      }
      const lines = cart.map(r => ({ batch_no: r.batch_no, batch_version: r.batch_version, counted_qty: r.counted }));
      requestBody = JSON.stringify({ lines, request_key: crypto.randomUUID() });
      sessionStorage.setItem(pendingStocktakeKey + ':draft', JSON.stringify(cart));
      sessionStorage.setItem(pendingStocktakeKey, requestBody);
      setPendingRequest(requestBody);
    }
    sending.current = true;
    setSubmitting(true);
    setError('');
    try {
      const { ok, status, json } = await api('/api/inventory/stocktake/pda-count', {
        method: 'POST', body: requestBody,
      });
      if (!ok && [400,404,409,422].includes(status)) {
        sessionStorage.removeItem(pendingStocktakeKey);
        setPendingRequest(null);
        if (status === 409) setCart(rows => rows.map(row => ({ ...row, needsReview: true })));
      }
      if (!ok || (json?.code && json.code >= 400)) { setError(json?.message || json?.msg || t('terminal.wms_count_fail', '盘点提交失败')); return; }
      const submitted = JSON.parse(requestBody).lines as { batch_no: string; counted_qty: string }[];
      const details: Array<{ batch_no?: string; stocktake_no?: string; act_qty?: number }> = Array.isArray(json?.results) ? json.results : [];
      if (json?.code !== 200 || json.applied !== submitted.length || details.length !== submitted.length
        || !submitted.every(line => details.some(result => result.batch_no === line.batch_no
          && result.stocktake_no && Number(result.act_qty) === Number(line.counted_qty)))) {
        setError(t('terminal.wms_count_verify', '未收到完整盘点回执，请核对上次提交'));
        return;
      }
      const applied = details.length;
      invalidateBatchLookups();
      setToast(`${t('terminal.wms_count_done', '盘点已入账')}：${applied} ${t('terminal.wms_lines', '项')}`);
      sessionStorage.removeItem(pendingStocktakeKey);
      setPendingRequest(null);
      setCart([]);
      setActiveBatch(null);
      void fetchBatches();
      setTimeout(() => setToast(''), 3000);
    } catch { setError(t('terminal.wms_net_err', '网络错误，请重试')); }
    finally { sending.current = false; setSubmitting(false); }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: T.MUT }}>
            {t('terminal.wms_business_source', '业务来源')}：{t('terminal.wms_erp_batch_ledger', 'ERP 在库批次')}
          </span>
          <span style={{ borderRadius: 999, padding: '3px 8px', background: 'color-mix(in srgb,var(--status-warning) 16%,transparent)', color: 'var(--status-warning)', fontSize: 10.5, fontWeight: 700 }}>
            {t('terminal.wms_reconciliation_pending', '外部对账待核验')}
          </span>
        </div>
        {toast && <div role="status" style={{ fontSize: 14, fontWeight: 700, color: T.GRN }}>✓ {toast}</div>}
      </div>

      <div className={styles.workspace}>
        {/* ① 批次浏览/扫码 */}
        <div className={styles.picker} style={{ borderRight: `1px solid ${T.BOR}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.BOR}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.BG, border: `1px solid ${T.BOR}`, borderRadius: 10, padding: '8px 12px' }}>
              <ScanLine size={18} color={T.ACC} />
              <input
                value={scan}
                onChange={e => { setScan(e.target.value); setFilter(e.target.value); }}
                onKeyDown={e => { if (e.key === 'Enter') handleScan(); }}
                className={styles.scanInput}
                aria-label={t('terminal.wms_scan_batch_ph', '扫描/输入批次号')}
                placeholder={t('terminal.wms_scan_batch_ph', '扫描/输入批次号')}
                style={{ flex: 1, background: 'transparent', border: 'none', color: T.TXT, fontSize: 15 }}
              />
            </div>
          </div>
          <div style={{ padding: '8px 14px 4px', fontSize: 11, color: T.MUT, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span>{t('terminal.wms_batches', '在库批次')} — {shown.length}</span>
            <button type="button" aria-label={t('common.refresh', '刷新')} onClick={() => fetchBatches()} style={{ background: 'none', border: 'none', color: T.MUT, cursor: 'pointer', padding: 2 }}>
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
                <button key={b.batch_no} type="button" disabled={!canCount || lookingUp || submitting || Boolean(pendingRequest)} onClick={() => addToCart(b.batch_no)} style={{
                  display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px', borderRadius: 10,
                  border: `1px solid ${inCart ? T.GRN : T.BOR}`, background: inCart ? `${T.GRN}10` : T.CARD,
                  cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: inCart ? T.GRN : T.TXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.batch_no}</div>
                  <div style={{ fontSize: 11, color: T.MUT }}>{formatMasterData(b as unknown as Record<string, unknown>, b.sku_code ? 'sku_name' : 'product_name', b.sku_code || b.product_code, lang)} · {t('terminal.wms_sys', '账面')} {Number(b.qty) || 0}{inCart ? ` · ${t('terminal.wms_in_list', '已加入')}` : ''}</div>
                  <div style={{ fontSize: 11, color: b.status === 'QUARANTINE' ? T.RED : T.MUT }}>{formatBusinessEnum('inventory', b.status, lang)} · {formatMasterData(b as unknown as Record<string, unknown>, 'warehouse_name', b.warehouse_code, lang)} / {formatMasterData(b as unknown as Record<string, unknown>, 'location_name', b.location_code, lang)}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ② 盘点清单 */}
        <div className={styles.work} style={{ overflow: 'hidden', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                const counted = r.counted === '' ? null : Number(r.counted);
                const diff = counted == null || r.needsReview || !Number.isFinite(r.sys_qty) ? null : Math.round((counted - r.sys_qty) * 1000) / 1000;
                const active = activeBatch === r.batch_no;
                const diffColor = diff == null ? T.MUT : diff === 0 ? T.MUT : diff > 0 ? T.GRN : T.RED;
                return (
                  <div key={r.batch_no} className={styles.line} style={{ background: T.CARD, borderRadius: 12, border: `1px solid ${active ? T.ACC : T.BOR}`, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: T.TXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.batch_no}</div>
                      <div style={{ fontSize: 11, color: T.MUT }}>{formatMasterData(r as unknown as Record<string, unknown>, r.sku_code ? 'sku_name' : 'product_name', r.sku_code || r.product_code, lang)} · {t('terminal.wms_sys', '账面')} {Number.isFinite(r.sys_qty) && r.sys_qty !== null ? r.sys_qty : '—'} {r.unit}
                        {r.needsReview && <span style={{ color: T.ACC, marginLeft: 8 }}>{t('ui.待核', '待核')}</span>}
                        {diff != null && <span style={{ color: diffColor, marginLeft: 8, fontWeight: 700 }}>{t('terminal.wms_diff', '差')} {diff > 0 ? `+${diff}` : diff}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: r.status === 'QUARANTINE' ? T.RED : T.MUT }}>{formatBusinessEnum('inventory', r.status, lang)} · {formatMasterData(r as unknown as Record<string, unknown>, 'warehouse_name', r.warehouse_code, lang)} / {formatMasterData(r as unknown as Record<string, unknown>, 'location_name', r.location_code, lang)}</div>
                    </div>
                    <input aria-label={t('terminal.wms_counted', '实盘数') + ' ' + r.batch_no}
                      className={styles.countInput} inputMode="decimal" value={r.counted} disabled={!canCount || submitting || Boolean(pendingRequest)}
                      onFocus={() => { setActiveBatch(r.batch_no); setNumKey(k => k + 1); }}
                      onChange={event => setCounted(r.batch_no, event.target.value)}
                      style={{ width: 120, padding: 8, border: `1px solid ${active ? T.ACC : T.BOR}`,
                        background: T.CARD, color: T.TXT, borderRadius: 10 }} />
                    <button type="button" disabled={!canCount || submitting || Boolean(pendingRequest)} aria-label={t('common.delete', '删除') + ' ' + r.batch_no} onClick={() => removeRow(r.batch_no)} style={{ background: 'none', border: 'none', color: T.MUT, cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                      <X size={18} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {error && <div role="alert" style={{ fontSize: 13, color: T.RED, fontWeight: 600, flexShrink: 0 }}>⚠️ {error}</div>}
        </div>

        {/* ③ 数字键盘 */}
        <div className={styles.keypad}><TerminalNumPadPanel
          allowDecimal
          label={t('terminal.wms_input', '录入数量')}
          value={t('terminal.wms_counted', '实盘数')}
          accentColor={T.ACC}
          numpadKey={`${activeBatch ?? 'x'}-${numKey}`}
          numpadInitial={numInitial}
          onChange={val => { if (activeBatch) setCounted(activeBatch, val); }}
          disabled={!canCount || !activeBatch || submitting || Boolean(pendingRequest)}
          warning={cart.length === 0 ? `← ${t('terminal.wms_scan_to_count_short', '请先加入批次')}` : undefined}
        /></div>
      </div>

      {/* Bottom bar */}
      <div className={styles.actions} style={{ background: T.CARD, borderTop: `1px solid ${T.BOR}`, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button type="button" onClick={() => router.push('/terminal/home')} style={{ padding: '9px 20px', borderRadius: 10, border: `1px solid ${T.BOR}`, background: 'transparent', color: T.MUT, fontSize: 15, cursor: 'pointer' }}>
          {t('common.back', '返回')}
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={submit} disabled={!canCount || (!pendingRequest && cart.length === 0) || submitting || lookingUp || !pendingStocktakeKey || draftOwner !== pendingStocktakeKey} style={{
          padding: '11px 48px', borderRadius: 10, border: 'none',
          background: (cart.length > 0 || pendingRequest) ? T.ACC : T.BOR,
          color: (cart.length > 0 || pendingRequest) ? 'var(--bg-page)' : T.MUT,
          fontSize: 16, fontWeight: 700, cursor: (cart.length > 0 || pendingRequest) ? 'pointer' : 'not-allowed',
          opacity: submitting ? 0.7 : 1, minWidth: 200,
        }}>
          {pendingRequest && !submitting ? t('terminal.wms_count_retry', '核对上次提交') : submitting ? t('ui.提交中', '提交中...') : `✓ ${t('terminal.wms_confirm_count', '提交盘点')}`}
        </button>
      </div>
    </div>
  );
}
