'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { T } from '@/styles/terminal-theme';
import TerminalNumPadPanel from '@/components/terminal/TerminalNumPadPanel';
import styles from '../workstation.module.css';
import { PackagePlus, ScanLine, RefreshCw } from 'lucide-react';
import { formatBusinessEnum, formatMasterData } from '@/lib/business-display';
import { invalidateBatchLookups } from '@/lib/request-cache';

// ── token（与 mobile-api 一致的取值链）────────────────────────────────────────
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

interface InboundTask {
  task_no: string;
  source_po_no?: string | null;
  source_type?: string | null;
  warehouse_code?: string | null;
  supplier_code?: string | null;
  status?: string;
  store_code?: string | null;
  warehouse_name?: string | null;
  warehouse_name_zh?: string | null;
  warehouse_name_en?: string | null;
  warehouse_name_lo?: string | null;
}
interface InboundItem {
  line_no: number;
  product_code: string;
  spec_code?: string | null;
  batch_no?: string | null;
  planned_qty?: number | null;
  unit?: string | null;
  location_code?: string | null;
  product_name?: string | null;
  product_name_zh?: string | null;
  product_name_en?: string | null;
  product_name_lo?: string | null;
}
interface ItemEdit { actual: string; broken: string }
type Field = 'actual' | 'broken';

const POLL_MS = 8000;

export default function WmsInboundTerminalPage() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const { hasPermission } = useAuth();
  const canConfirm = hasPermission('MENU_WMS_INOUT', 'E');
  const taskInFlight = useRef(false);
  const sending = useRef(false);

  const [tasks, setTasks] = useState<InboundTask[]>([]);
  const [selected, setSelected] = useState<(InboundTask & { items: InboundItem[] }) | null>(null);
  const [edits, setEdits] = useState<Record<number, ItemEdit>>({});
  const [numTarget, setNumTarget] = useState<{ lineNo: number; field: Field } | null>(null);
  const [numKey, setNumKey] = useState(0);
  const [scan, setScan] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingTask, setLoadingTask] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchList = useCallback(async () => {
    try {
      const { ok, json } = await api('/api/inbound/pending');
      if (ok && Array.isArray(json?.data)) setTasks(json.data as InboundTask[]);
    } catch { /* 断网保留上次 */ }
    finally { setLoadingList(false); }
  }, []);

  useEffect(() => {
    fetchList();
    pollRef.current = setInterval(fetchList, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchList]);

  const openTask = useCallback(async (taskNo: string) => {
    if (sending.current || taskInFlight.current) return;
    taskInFlight.current = true;
    setLoadingTask(true);
    setError('');
    try {
      const { ok, json } = await api(`/api/inbound/task/${encodeURIComponent(taskNo)}`);
      if (!ok || json?.code === 404 || !json?.data) { setError(t('terminal.wms_task_not_found', '入库单不存在或无权访问')); return; }
      const data = json.data as InboundTask & { items: InboundItem[] };
      const items = Array.isArray(data.items) ? data.items : [];
      setSelected({ ...data, items });
      const init: Record<number, ItemEdit> = {};
      for (const it of items) init[it.line_no] = { actual: it.planned_qty != null ? String(it.planned_qty) : '', broken: '' };
      setEdits(init);
      setNumTarget(items.length ? { lineNo: items[0].line_no, field: 'actual' } : null);
      setNumKey(k => k + 1);
    } catch { setError(t('terminal.wms_load_fail', '加载失败，请重试')); }
    finally { taskInFlight.current = false; setLoadingTask(false); }
  }, [t]);

  const handleScan = () => {
    const v = scan.trim();
    if (!v) return;
    setScan('');
    void openTask(v);
  };

  const setField = (lineNo: number, field: Field, val: string) => {
    setEdits(prev => ({ ...prev, [lineNo]: { ...(prev[lineNo] ?? { actual: '', broken: '' }), [field]: val } }));
  };

  const confirm = async () => {
    if (!canConfirm || !selected || sending.current || taskInFlight.current) return;
    sending.current = true;
    setSubmitting(true);
    setError('');
    try {
      const items = selected.items.map(it => {
        const e = edits[it.line_no] ?? { actual: '', broken: '' };
        return {
          id: it.line_no,
          actual_qty: e.actual === '' ? undefined : e.actual,
          broken_qty: e.broken === '' ? 0 : e.broken,
        };
      });
      const { ok, json } = await api('/api/inbound/confirm', { method: 'POST', body: JSON.stringify({ task_no: selected.task_no, items }) });
      if (!ok || json?.code !== 200 || json.data?.task_no !== selected.task_no
        || json.data.status !== 'COMPLETED' || !Array.isArray(json.data.items) || json.data.items.length !== items.length) {
        const msg = json?.message || json?.msg || (Array.isArray(json?.errors) ? json.errors.join('；') : '') || t('terminal.wms_confirm_fail', '入库确认失败');
        setError(msg);
        return;
      }
      setToast(`${t('terminal.wms_inbound_done', '入库完成')}：${selected.task_no}`);
      invalidateBatchLookups();
      setSelected(null);
      setEdits({});
      setNumTarget(null);
      void fetchList();
      setTimeout(() => setToast(''), 3000);
    } catch { setError(t('terminal.wms_net_err', '网络错误，请重试')); }
    finally { sending.current = false; setSubmitting(false); }
  };

  const numInitial = numTarget ? (edits[numTarget.lineNo]?.[numTarget.field] ?? '') : '';
  const numAccent = numTarget?.field === 'broken' ? 'var(--status-warning)' : T.GRN;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.BG, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: T.CARD, borderBottom: `1px solid ${T.BOR}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <PackagePlus size={22} color={T.ACC} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.TXT }}>{t('terminal.wms_inbound', '仓储入库')}</div>
          <div style={{ fontSize: 12, color: T.MUT }}>{t('terminal.wms_inbound_hint', '扫码或选择待入库单，逐项核对实收数量')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: T.MUT }}>
            {t('terminal.wms_business_source', '业务来源')}：
            {selected?.source_po_no
              ? `${t('terminal.wms_purchase_order', '采购订单')} ${selected.source_po_no}`
              : t('terminal.wms_erp_inbound_task', 'ERP 入库任务')}
          </span>
          <span style={{ borderRadius: 999, padding: '3px 8px', background: 'color-mix(in srgb,var(--status-warning) 16%,transparent)', color: 'var(--status-warning)', fontSize: 10.5, fontWeight: 700 }}>
            {t('terminal.wms_reconciliation_pending', '外部对账待核验')}
          </span>
        </div>
        {toast && <div role="status" style={{ fontSize: 14, fontWeight: 700, color: T.GRN }}>✓ {toast}</div>}
      </div>

      <div className={styles.workspace}>
        {/* ① 待入库单列表 */}
        <div className={styles.picker} style={{ borderRight: `1px solid ${T.BOR}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* 扫码输入 */}
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.BOR}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.BG, border: `1px solid ${T.BOR}`, borderRadius: 10, padding: '8px 12px' }}>
              <ScanLine size={18} color={T.ACC} />
              <input
                value={scan} disabled={submitting || loadingTask}
                onChange={e => setScan(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScan(); }}
                className={styles.scanInput}
                aria-label={t('terminal.wms_scan_ph', '扫描/输入入库单号')}
                placeholder={t('terminal.wms_scan_ph', '扫描/输入入库单号')}
                style={{ flex: 1, background: 'transparent', border: 'none', color: T.TXT, fontSize: 15 }}
              />
            </div>
          </div>
          <div style={{ padding: '8px 14px 4px', fontSize: 11, color: T.MUT, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span>{t('terminal.wms_pending', '待入库')} — {tasks.length}</span>
            <button type="button" onClick={() => fetchList()} style={{ background: 'none', border: 'none', color: T.MUT, cursor: 'pointer', padding: 2 }}>
              <RefreshCw size={14} style={{ animation: loadingList ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loadingList ? (
              <div style={{ color: T.MUT, fontSize: 13, padding: 16 }}>{t('common.loading', '加载中…')}</div>
            ) : tasks.length === 0 ? (
              <div style={{ color: T.MUT, fontSize: 13, padding: 16, textAlign: 'center' }}>{t('terminal.wms_no_pending', '暂无待入库单')}</div>
            ) : tasks.map(task => {
              const active = selected?.task_no === task.task_no;
              return (
                <button key={task.task_no} type="button" disabled={submitting || loadingTask} onClick={() => openTask(task.task_no)} style={{
                  display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 14px', borderRadius: 12,
                  border: `1.5px solid ${active ? T.ACC : T.BOR}`, background: active ? `${T.ACC}14` : T.CARD,
                  cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent',
                }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: active ? T.ACC : T.TXT }}>{task.task_no}</div>
                  <div style={{ fontSize: 11, color: T.MUT }}>
                    {task.source_po_no ? `PO ${task.source_po_no} · ` : ''}{formatMasterData(task as unknown as Record<string, unknown>, 'warehouse_name', task.warehouse_code, lang)}
                    {task.status === 'PROCESSING' && <span style={{ color: 'var(--status-warning)', marginLeft: 6 }}>● {formatBusinessEnum('wmsWorkflow', task.status, lang)}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ② 明细录入 */}
        <div className={styles.work} style={{ overflow: 'hidden', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {error && <div role="alert" style={{ fontSize: 13, color: T.RED, fontWeight: 600, flexShrink: 0 }}>⚠️ {error}</div>}
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: T.MUT }}>
              <span style={{ fontSize: 36 }}>←</span>
              <span style={{ fontSize: 15 }}>{loadingTask ? t('common.loading', '加载中…') : t('terminal.wms_pick_task', '扫码或点击左侧入库单开始核收')}</span>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: T.MUT, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0 }}>
                {t('terminal.wms_receiving', '核收')} — {selected.task_no} · {formatMasterData(selected as unknown as Record<string, unknown>, 'warehouse_name', selected.warehouse_code, lang)}（{selected.items.length} {t('terminal.wms_lines', '项')}）
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selected.items.length === 0 ? (
                  <div style={{ color: T.MUT, fontSize: 13, padding: 16 }}>{t('terminal.wms_no_items', '此单无明细')}</div>
                ) : selected.items.map(it => {
                  const e = edits[it.line_no] ?? { actual: '', broken: '' };
                  const cell = (field: Field, label: string, accent: string) => {
                    const isActive = numTarget?.lineNo === it.line_no && numTarget?.field === field;
                    const val = e[field];
                    return (
                      <label className={styles.quantityField}>
                        <span style={{ fontSize: 12, color: T.MUT }}>{label}</span>
                        <input aria-label={label + ' ' + (it.batch_no || it.product_code)} inputMode="decimal" value={val}
                          disabled={!canConfirm || submitting}
                          onFocus={() => { setNumTarget({ lineNo: it.line_no, field }); setNumKey(k => k + 1); }}
                          onChange={event => setField(it.line_no, field, event.target.value)}
                          style={{ color: accent, background: T.BG, borderRadius: 8, padding: '6px 8px',
                            border: `1px solid ${isActive ? accent : T.BOR}` }} />
                      </label>
                    );
                  };
                  return (
                    <div key={it.line_no} className={styles.line} style={{ background: T.CARD, borderRadius: 12, border: `1px solid ${T.BOR}`, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.TXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatMasterData(it as unknown as Record<string, unknown>, 'product_name', it.product_code, lang)}{it.spec_code ? ` · ${it.spec_code}` : ''}</div>
                        <div style={{ fontSize: 11, color: T.MUT }}>
                          {t('terminal.wms_planned', '计划')} {it.planned_qty ?? 0} {it.unit || ''}{it.batch_no ? ` · ${t('terminal.wms_batch', '批')} ${it.batch_no}` : ''}
                        </div>
                      </div>
                      <div className={styles.quantityGroup}>
                        {cell('actual', t('terminal.wms_actual', '实收'), T.GRN)}
                        {cell('broken', t('terminal.wms_broken', '破损'), 'var(--status-warning)')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ③ 数字键盘 */}
        <div className={styles.keypad}><TerminalNumPadPanel
          allowDecimal
          label={t('terminal.wms_input', '录入数量')}
          value={numTarget ? (numTarget.field === 'broken' ? t('terminal.wms_broken', '破损') : t('terminal.wms_actual', '实收')) : '—'}
          accentColor={numAccent}
          numpadKey={`${numTarget?.lineNo ?? 'x'}-${numTarget?.field ?? 'x'}-${numKey}`}
          numpadInitial={numInitial}
          onChange={val => { if (numTarget) setField(numTarget.lineNo, numTarget.field, val); }}
          disabled={!numTarget || !canConfirm || submitting}
          warning={!selected ? `← ${t('terminal.wms_pick_task_short', '请先选择入库单')}` : undefined}
        /></div>
      </div>

      {/* Bottom bar */}
      <div className={styles.actions} style={{ background: T.CARD, borderTop: `1px solid ${T.BOR}`, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button type="button" onClick={() => router.push('/terminal/home')} style={{ padding: '9px 20px', borderRadius: 10, border: `1px solid ${T.BOR}`, background: 'transparent', color: T.MUT, fontSize: 15, cursor: 'pointer' }}>
          {t('common.back', '返回')}
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={confirm} disabled={!canConfirm || !selected || selected.items.length === 0 || submitting || loadingTask} style={{
          padding: '11px 48px', borderRadius: 10, border: 'none',
          background: selected && selected.items.length > 0 ? T.ACC : T.BOR,
          color: selected && selected.items.length > 0 ? 'var(--bg-page)' : T.MUT,
          fontSize: 16, fontWeight: 700, cursor: selected && selected.items.length > 0 ? 'pointer' : 'not-allowed',
          opacity: submitting ? 0.7 : 1, minWidth: 200,
        }}>
          {submitting ? t('ui.提交中', '提交中...') : `✓ ${t('terminal.wms_confirm_inbound', '确认入库')}`}
        </button>
      </div>
    </div>
  );
}
