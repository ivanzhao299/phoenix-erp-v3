'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { T } from '@/styles/terminal-theme';
import TerminalNumPadPanel from '@/components/terminal/TerminalNumPadPanel';
import { PackageMinus, ScanLine, RefreshCw } from 'lucide-react';
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

interface OutOrder {
  order_no: string;
  status?: string;
  store_code?: string | null;
  customer_name?: string | null;
  customer_code?: string | null;
  warehouse_code?: string | null;
  customer_name_en?: string | null;
  customer_name_lo?: string | null;
}
interface OutItem {
  line_no: number;
  product_code: string;
  product_name?: string | null;
  spec_code?: string | null;
  qty?: number | null;
  unit?: string | null;
  batch_no?: string | null;
  product_name_zh?: string | null;
  product_name_en?: string | null;
  product_name_lo?: string | null;
}
interface LineEdit { batch: string; qty: string }

const POLL_MS = 8000;

export default function WmsOutboundTerminalPage() {
  const router = useRouter();
  const { t, lang } = useLanguage();

  const [orders, setOrders] = useState<OutOrder[]>([]);
  const [selected, setSelected] = useState<(OutOrder & { items: OutItem[] }) | null>(null);
  const [edits, setEdits] = useState<Record<number, LineEdit>>({});
  const [numLine, setNumLine] = useState<number | null>(null);
  const [numKey, setNumKey] = useState(0);
  const [scan, setScan] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchList = useCallback(async () => {
    try {
      const { ok, json } = await api('/api/outbound/orders');
      if (ok && Array.isArray(json?.data)) setOrders(json.data as OutOrder[]);
    } catch { /* keep last */ }
    finally { setLoadingList(false); }
  }, []);

  useEffect(() => {
    fetchList();
    pollRef.current = setInterval(fetchList, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchList]);

  const openOrder = useCallback(async (orderNo: string) => {
    setLoadingOrder(true);
    setError('');
    try {
      const { ok, json } = await api(`/api/outbound/orders/${encodeURIComponent(orderNo)}`);
      if (!ok || json?.code === 404 || !json?.data) { setError(t('terminal.wms_order_not_found', '订单不存在或无权访问')); return; }
      const data = json.data as OutOrder & { items: OutItem[] };
      const items = Array.isArray(data.items) ? data.items : [];
      setSelected({ ...data, items });
      const init: Record<number, LineEdit> = {};
      for (const it of items) init[it.line_no] = { batch: it.batch_no || '', qty: it.qty != null ? String(it.qty) : '' };
      setEdits(init);
      setNumLine(items.length ? items[0].line_no : null);
      setNumKey(k => k + 1);
    } catch { setError(t('terminal.wms_load_fail', '加载失败，请重试')); }
    finally { setLoadingOrder(false); }
  }, [t]);

  const handleScan = () => {
    const v = scan.trim();
    if (!v) return;
    setScan('');
    void openOrder(v);
  };

  const setLine = (lineNo: number, patch: Partial<LineEdit>) => {
    setEdits(prev => ({ ...prev, [lineNo]: { ...(prev[lineNo] ?? { batch: '', qty: '' }), ...patch } }));
  };

  const missingBatch = selected?.items.some(it => {
    const e = edits[it.line_no];
    return (parseInt(e?.qty || '') || 0) > 0 && !(e?.batch || '').trim();
  }) ?? false;

  const ship = async () => {
    if (!selected || submitting) return;
    if (missingBatch) { setError(t('terminal.wms_need_batch', '有行未填批次号，请扫码补全')); return; }
    setSubmitting(true);
    setError('');
    try {
      const items = selected.items
        .map(it => {
          const e = edits[it.line_no] ?? { batch: '', qty: '' };
          return { batch_no: (e.batch || '').trim(), qty: parseInt(e.qty) || 0 };
        })
        .filter(x => x.qty > 0 && x.batch_no);
      if (items.length === 0) { setError(t('terminal.wms_no_ship_lines', '无可出库明细')); setSubmitting(false); return; }
      const { ok, json } = await api(`/api/outbound/orders/${encodeURIComponent(selected.order_no)}/advance`, {
        method: 'POST', body: JSON.stringify({ next_status: 'SHIPPED', items }),
      });
      if (!ok || (json?.code && json.code >= 400)) { setError(json?.msg || t('terminal.wms_ship_fail', '出库失败')); return; }
      setToast(`${t('terminal.wms_shipped', '已出库装车')}：${selected.order_no}`);
      invalidateBatchLookups();
      setSelected(null);
      setEdits({});
      setNumLine(null);
      void fetchList();
      setTimeout(() => setToast(''), 3000);
    } catch { setError(t('terminal.wms_net_err', '网络错误，请重试')); }
    finally { setSubmitting(false); }
  };

  const numInitial = numLine != null ? (edits[numLine]?.qty ?? '') : '';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.BG, overflow: 'hidden' }}>
      <div style={{ background: T.CARD, borderBottom: `1px solid ${T.BOR}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <PackageMinus size={22} color={T.ACC} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.TXT }}>{t('terminal.wms_outbound', '仓储出库')}</div>
          <div style={{ fontSize: 12, color: T.MUT }}>{t('terminal.wms_outbound_hint', '扫码或选择订单，逐项核对批次与出库数量后装车')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: T.MUT }}>
            {t('terminal.wms_business_source', '业务来源')}：
            {selected
              ? `${t('terminal.wms_sales_order', '销售订单')} ${selected.order_no}`
              : t('terminal.wms_erp_outbound_task', 'ERP 出库任务')}
          </span>
          <span style={{ borderRadius: 999, padding: '3px 8px', background: 'color-mix(in srgb,var(--status-warning) 16%,transparent)', color: 'var(--status-warning)', fontSize: 10.5, fontWeight: 700 }}>
            {t('terminal.wms_reconciliation_pending', '外部对账待核验')}
          </span>
        </div>
        {toast && <div style={{ fontSize: 14, fontWeight: 700, color: T.GRN }}>✓ {toast}</div>}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
        {/* ① 订单列表 */}
        <div style={{ width: 320, flexShrink: 0, borderRight: `1px solid ${T.BOR}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.BOR}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.BG, border: `1px solid ${T.BOR}`, borderRadius: 10, padding: '8px 12px' }}>
              <ScanLine size={18} color={T.ACC} />
              <input
                value={scan}
                onChange={e => setScan(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScan(); }}
                placeholder={t('terminal.wms_scan_order_ph', '扫描/输入订单号')}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: T.TXT, fontSize: 15 }}
              />
            </div>
          </div>
          <div style={{ padding: '8px 14px 4px', fontSize: 11, color: T.MUT, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span>{t('terminal.wms_to_ship', '待出库')} — {orders.length}</span>
            <button type="button" onClick={() => fetchList()} style={{ background: 'none', border: 'none', color: T.MUT, cursor: 'pointer', padding: 2 }}>
              <RefreshCw size={14} style={{ animation: loadingList ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loadingList ? (
              <div style={{ color: T.MUT, fontSize: 13, padding: 16 }}>{t('common.loading', '加载中…')}</div>
            ) : orders.length === 0 ? (
              <div style={{ color: T.MUT, fontSize: 13, padding: 16, textAlign: 'center' }}>{t('terminal.wms_no_orders', '暂无待出库订单')}</div>
            ) : orders.map(o => {
              const active = selected?.order_no === o.order_no;
              return (
                <button key={o.order_no} type="button" onClick={() => openOrder(o.order_no)} style={{
                  display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 14px', borderRadius: 12,
                  border: `1.5px solid ${active ? T.ACC : T.BOR}`, background: active ? `${T.ACC}14` : T.CARD,
                  cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent',
                }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: active ? T.ACC : T.TXT }}>{o.order_no}</div>
                  <div style={{ fontSize: 11, color: T.MUT }}>{formatMasterData(o as unknown as Record<string, unknown>, 'customer_name', o.customer_code, lang)}{o.status ? ` · ${formatBusinessEnum('salesOrder', o.status, lang)}` : ''}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ② 明细：批次 + 出库数量 */}
        <div style={{ flex: 1, overflow: 'hidden', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: T.MUT }}>
              <span style={{ fontSize: 36 }}>←</span>
              <span style={{ fontSize: 15 }}>{loadingOrder ? t('common.loading', '加载中…') : t('terminal.wms_pick_order', '扫码或点击左侧订单开始拣货')}</span>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: T.MUT, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0 }}>
                {t('terminal.wms_picking', '拣货装车')} — {selected.order_no}（{selected.items.length} {t('terminal.wms_lines', '项')}）
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selected.items.length === 0 ? (
                  <div style={{ color: T.MUT, fontSize: 13, padding: 16 }}>{t('terminal.wms_no_items', '此单无明细')}</div>
                ) : selected.items.map(it => {
                  const e = edits[it.line_no] ?? { batch: '', qty: '' };
                  const qtyActive = numLine === it.line_no;
                  const qtyNum = parseInt(e.qty) || 0;
                  const needBatch = qtyNum > 0 && !e.batch.trim();
                  return (
                    <div key={it.line_no} style={{ background: T.CARD, borderRadius: 12, border: `1px solid ${needBatch ? T.RED : T.BOR}`, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.TXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatMasterData(it as unknown as Record<string, unknown>, 'product_name', it.product_code, lang)}{it.spec_code ? ` · ${it.spec_code}` : ''}</div>
                        <div style={{ fontSize: 11, color: T.MUT }}>{t('terminal.wms_ordered', '订单')} {it.qty ?? 0} {it.unit || ''}</div>
                        {/* 批次扫码输入 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, background: T.BG, border: `1px solid ${needBatch ? T.RED : T.BOR}`, borderRadius: 8, padding: '5px 9px', maxWidth: 260 }}>
                          <ScanLine size={14} color={needBatch ? T.RED : T.MUT} />
                          <input
                            value={e.batch}
                            onChange={ev => setLine(it.line_no, { batch: ev.target.value })}
                            placeholder={t('terminal.wms_scan_batch', '扫码/输入批次号')}
                            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: T.TXT, fontSize: 13 }}
                          />
                        </div>
                      </div>
                      <button type="button" onClick={() => { setNumLine(it.line_no); setNumKey(k => k + 1); }} style={{
                        width: 130, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, padding: '8px 12px',
                        borderRadius: 10, border: `1px solid ${qtyActive ? T.GRN : qtyNum ? `${T.GRN}55` : T.BOR}`,
                        background: qtyActive ? `${T.GRN}14` : T.CARD, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                      }}>
                        <span style={{ fontSize: 10, color: T.MUT, alignSelf: 'flex-start' }}>{t('terminal.wms_ship_qty', '出库数')}</span>
                        <span style={{ fontSize: 24, fontWeight: 800, color: qtyNum ? T.GRN : T.BOR, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{e.qty || (qtyActive ? '0' : '—')}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
              {error && <div style={{ fontSize: 13, color: T.RED, fontWeight: 600, flexShrink: 0 }}>⚠️ {error}</div>}
            </>
          )}
        </div>

        {/* ③ 数字键盘 */}
        <TerminalNumPadPanel
          label={t('terminal.wms_input', '录入数量')}
          value={t('terminal.wms_ship_qty', '出库数')}
          accentColor={T.GRN}
          numpadKey={`${numLine ?? 'x'}-${numKey}`}
          numpadInitial={numInitial}
          onChange={val => { if (numLine != null) setLine(numLine, { qty: val }); }}
          disabled={numLine == null}
          warning={!selected ? `← ${t('terminal.wms_pick_order_short', '请先选择订单')}` : undefined}
        />
      </div>

      {/* Bottom bar */}
      <div style={{ background: T.CARD, borderTop: `1px solid ${T.BOR}`, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button type="button" onClick={() => router.push('/terminal/home')} style={{ padding: '9px 20px', borderRadius: 10, border: `1px solid ${T.BOR}`, background: 'transparent', color: T.MUT, fontSize: 15, cursor: 'pointer' }}>
          {t('common.back', '返回')}
        </button>
        {missingBatch && <div style={{ fontSize: 12, color: 'var(--status-warning)', fontWeight: 600 }}>⚠ {t('terminal.wms_need_batch', '有行未填批次号，请扫码补全')}</div>}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={ship} disabled={!selected || selected.items.length === 0 || submitting} style={{
          padding: '11px 48px', borderRadius: 10, border: 'none',
          background: selected && selected.items.length > 0 ? T.ACC : T.BOR,
          color: selected && selected.items.length > 0 ? 'var(--bg-page)' : T.MUT,
          fontSize: 16, fontWeight: 700, cursor: selected && selected.items.length > 0 ? 'pointer' : 'not-allowed',
          opacity: submitting ? 0.7 : 1, minWidth: 200,
        }}>
          {submitting ? t('ui.提交中', '提交中...') : `✓ ${t('terminal.wms_confirm_ship', '确认出库装车')}`}
        </button>
      </div>
    </div>
  );
}
