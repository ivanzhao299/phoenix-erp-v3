'use client';

/**
 * 手机采购员「转订单」工作台（G96）
 * ────────────────────────────────────────────────────────────────────────
 * 业务缺口：采购员基本不用电脑，但「已批申请→转采购订单」此前只在 PC。
 * 本页让采购员在手机完成核心动作：看待转的已批申请 → 选供应商 + 逐项议价 → 一键转订单。
 *   · 列表：GET /api/v2/procurement/requests?status=APPROVED（过滤未转单 convertedPoId 空）
 *   · 详情：GET /api/v2/procurement/requests/:id（含明细，单价预填估算价、可改）
 *   · 转单：POST /api/v2/procurement/requests/:id/convert-to-order
 *           { supplierCode/Name, expectedDate?, payDeadline?, remark?, items:[{id,unitPrice}] }
 * 不做「从零空白建单」——实际几乎都来自已批申请，且空白建单字段重、不适合手机。
 */

import { useState, useEffect, useCallback } from 'react';
import u from '@/styles/uix-utils.module.css';
import { useRouter } from 'next/navigation';
import { ChevronLeft, RefreshCw, ShoppingCart, Send, Sun, Moon, Loader2, ArrowRight, Inbox } from 'lucide-react';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { authHeader } from '@/lib/mobile-auth-token';
import { MobilePageSkeleton, SkeletonCard } from '@/components/mobile/MobileSkeleton';

interface ReqRow {
  id: string; reqNo: string; subject?: string;
  companyName?: string; projectName?: string; requesterName?: string;
  currencyCode?: string; urgency?: string; itemCount?: number; convertedPoId?: string | null;
}
interface ReqItem {
  id: string; itemName: string; spec?: string; qty: number | string;
  unit?: string; estimatedUnitPrice?: number | string;
}
interface ReqDetail extends ReqRow { items: ReqItem[]; }
interface Supplier { code: string; name: string; }

const URGENCY_LABEL: Record<string, string> = { NORMAL: '普通', URGENT: '紧急', CRITICAL: '非常紧急' };
const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? 0 : n; };

export default function PrcOrderPage() {
  const router = useRouter();
  const { isDark, toggle, t } = useMobileTheme();
  const { allowed, loading: permLoading } = useMobilePermission('prc_order');

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [rows, setRows] = useState<ReqRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  // 转单详情态
  const [detail, setDetail] = useState<ReqDetail | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [supplierCode, setSupplierCode] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierOptions, setSupplierOptions] = useState<Supplier[]>([]);
  const [expDate, setExpDate] = useState('');
  const [payDeadline, setPayDeadline] = useState('');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ── 列表加载 ──────────────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    setListLoading(true); setListError('');
    try {
      const res = await fetch('/api/v2/procurement/requests?status=APPROVED&pageSize=50', { headers: authHeader() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || '加载失败');
      const list: ReqRow[] = (json.items ?? json.data ?? json ?? []) as ReqRow[];
      // 仅保留未转单的（已转的不再出现）
      setRows(list.filter(r => !r.convertedPoId));
    } catch (e) { setListError(e instanceof Error ? e.message : '加载失败'); }
    finally { setListLoading(false); }
  }, []);

  useEffect(() => { if (allowed) loadList(); }, [allowed, loadList]);

  // 供应商下拉（首次进详情时拉一次）
  const loadSuppliers = useCallback(async () => {
    if (supplierOptions.length) return;
    try {
      const res = await fetch('/api/lookup/suppliers', { headers: authHeader() });
      const json = await res.json().catch(() => ({}));
      const list = (json.data ?? json ?? []) as any[];
      setSupplierOptions(list.map(s => ({ code: s.code ?? s.supplier_code, name: s.name ?? s.supplier_name ?? s.code })));
    } catch { /* 静默：供应商拉取失败不阻断 */ }
  }, [supplierOptions.length]);

  // ── 打开某申请的转单详情 ────────────────────────────────────────────────────
  const openConvert = useCallback(async (row: ReqRow) => {
    setError(''); setSuccess('');
    setSupplierCode(''); setSupplierName(''); setExpDate(''); setPayDeadline(''); setRemark('');
    loadSuppliers();
    try {
      const res = await fetch(`/api/v2/procurement/requests/${row.id}`, { headers: authHeader() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || '详情加载失败');
      const d: ReqDetail = json as ReqDetail;
      setDetail(d);
      // 单价预填估算价（可改）
      const p: Record<string, string> = {};
      (d.items ?? []).forEach(it => { p[it.id] = String(num(it.estimatedUnitPrice) || ''); });
      setPrices(p);
      setView('detail');
    } catch (e) { setListError(e instanceof Error ? e.message : '详情加载失败'); }
  }, [loadSuppliers]);

  const total = detail ? (detail.items ?? []).reduce((s, it) => s + num(it.qty) * num(prices[it.id]), 0) : 0;

  // ── 提交转单 ──────────────────────────────────────────────────────────────
  const submitConvert = useCallback(async () => {
    if (!detail) return;
    if (!supplierCode.trim()) { setError('请选择供应商'); return; }
    setSubmitting(true); setError(''); setSuccess('');
    try {
      const body = {
        supplierCode: supplierCode.trim(),
        supplierName: supplierName.trim() || supplierCode.trim(),
        expectedDate: expDate || undefined,
        payDeadline: payDeadline || undefined,
        remark: remark.trim() || undefined,
        items: (detail.items ?? []).map(it => ({ id: String(it.id), unitPrice: num(prices[it.id]) })),
      };
      const res = await fetch(`/api/v2/procurement/requests/${detail.id}/convert-to-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader() }, body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || '转订单失败');
      setSuccess(`已转为采购订单：${json.poNo ?? json.po_no ?? ''}（草稿，待提交审批）`);
      setTimeout(() => { setView('list'); setDetail(null); loadList(); }, 1200);
    } catch (e) { setError(e instanceof Error ? e.message : '转订单失败'); }
    finally { setSubmitting(false); }
  }, [detail, supplierCode, supplierName, expDate, payDeadline, remark, prices, loadList]);

  // ── 样式 ──────────────────────────────────────────────────────────────────
  const inputSt: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: 15, outline: 'none', boxSizing: 'border-box' };
  const labelSt: React.CSSProperties = { fontSize: 13, color: t.textSub, marginBottom: 4, display: 'block' };
  const sectionSt: React.CSSProperties = { background: t.cardBg, borderRadius: 14, border: `1px solid ${t.cardBorder}`, padding: '14px 14px 10px', display: 'flex', flexDirection: 'column', gap: 12 };

  if (permLoading) return <MobilePageSkeleton title="待转订单" />;
  if (!allowed) return (
    <div style={{ minHeight: '100svh', background: t.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', color: t.textSub }}>
        <ShoppingCart size={40} style={{ opacity: 0.4, marginBottom: 12 }} />
        <div style={{ fontSize: 15 }}>无权限——本页仅采购员/管理层可用</div>
        <button onClick={() => router.push('/mobile/home')} style={{ marginTop: 16, padding: '8px 18px', borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.cardBg, color: t.text }}>返回首页</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100svh', background: t.pageBg, display: 'flex', flexDirection: 'column' }}>
      {/* AppBar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: t.appBarBg, borderBottom: `1px solid ${t.barBorder}`, position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => view === 'detail' ? (setView('list'), setDetail(null)) : router.push('/mobile/home')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub, display: 'flex', alignItems: 'center', gap: 4 }}>
          <ChevronLeft size={20} /><span className={u.fs14}>{view === 'detail' ? '返回列表' : '返回'}</span>
        </button>
        <div className={u.flexRow8}>
          <ShoppingCart size={18} color="var(--status-success)" />
          <span style={{ fontWeight: 700, fontSize: 16, color: t.text }}>{view === 'detail' ? '转采购订单' : '待转订单'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {view === 'list' && <button onClick={loadList} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub }}><RefreshCw size={18} /></button>}
          <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub }}>{isDark ? <Sun size={18} /> : <Moon size={18} />}</button>
        </div>
      </div>

      <div style={{ flex: 1, padding: '14px 16px 90px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* ── 列表视图 ── */}
        {view === 'list' && <>
          {listLoading ? <><SkeletonCard /><SkeletonCard /></> :
            listError ? <div style={{ color: 'var(--status-danger)', fontSize: 14, padding: 12 }}>{listError}</div> :
              rows.length === 0 ? (
                <div style={{ textAlign: 'center', color: t.textSub, padding: '48px 16px' }}>
                  <Inbox size={40} style={{ opacity: 0.4, marginBottom: 12 }} />
                  <div style={{ fontSize: 15 }}>暂无待转订单的已批申请</div>
                </div>
              ) : rows.map(r => (
                <button key={r.id} onClick={() => openConvert(r)} style={{ ...sectionSt, textAlign: 'left', cursor: 'pointer', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--status-success)', fontWeight: 700 }}>{r.reqNo}</span>
                    {r.urgency && r.urgency !== 'NORMAL' && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-danger)', background: 'var(--status-danger-bg-faint)', padding: '2px 8px', borderRadius: 8 }}>{URGENCY_LABEL[r.urgency] ?? r.urgency}</span>}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: t.text }}>{r.subject || '（无主题）'}</div>
                  <div style={{ fontSize: 13, color: t.textSub }}>{r.companyName || '—'}{r.projectName ? ` · ${r.projectName}` : ''}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                    <span style={{ fontSize: 12, color: t.textSub }}>申请人 {r.requesterName || '—'} · {r.itemCount ?? 0} 项</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--status-success)' }}>转订单 <ArrowRight size={14} /></span>
                  </div>
                </button>
              ))}
        </>}

        {/* ── 转单详情视图 ── */}
        {view === 'detail' && detail && <>
          <div style={sectionSt}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.textSub }}>申请信息</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: t.text }}>{detail.subject || '（无主题）'}</div>
            <div style={{ fontSize: 13, color: t.textSub }}>
              <span style={{ fontFamily: 'monospace', color: 'var(--status-success)' }}>{detail.reqNo}</span> · {detail.companyName || '—'}{detail.projectName ? ` · ${detail.projectName}` : ''}
            </div>
          </div>

          <div style={sectionSt}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.textSub }}>供应商 & 交付</div>
            <div>
              <span style={labelSt}>供应商 *</span>
              <select style={inputSt} value={supplierCode} onChange={e => { const c = e.target.value; setSupplierCode(c); setSupplierName(supplierOptions.find(s => s.code === c)?.name ?? ''); }}>
                <option value="">请选择供应商</option>
                {supplierOptions.map(s => <option key={s.code} value={s.code}>{s.name || s.code}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><span style={labelSt}>期望到货日</span><input type="date" style={inputSt} value={expDate} onChange={e => setExpDate(e.target.value)} /></div>
              <div><span style={labelSt}>付款截止日</span><input type="date" style={inputSt} value={payDeadline} onChange={e => setPayDeadline(e.target.value)} /></div>
            </div>
            <div><span style={labelSt}>备注</span><input style={inputSt} value={remark} onChange={e => setRemark(e.target.value)} placeholder="选填" /></div>
          </div>

          {/* 明细：逐项议价 */}
          <div style={sectionSt}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.textSub }}>采购明细 · 议价（单价可改）</div>
            {(detail.items ?? []).map((it, idx) => (
              <div key={it.id} style={{ background: isDark ? 'var(--slate-800)' : 'var(--slate-50)', borderRadius: 10, padding: '10px 12px', border: `1px solid ${isDark ? 'var(--slate-700)' : 'var(--slate-200)'}` }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 2 }}>{idx + 1}. {it.itemName}</div>
                {it.spec && <div style={{ fontSize: 12, color: t.textSub, marginBottom: 6 }}>{it.spec}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 1.4fr', gap: 8, alignItems: 'end' }}>
                  <div><span style={labelSt}>数量</span><div style={{ ...inputSt, background: 'transparent', border: 'none', padding: '6px 0', fontWeight: 600 }}>{num(it.qty).toLocaleString()} {it.unit || ''}</div></div>
                  <div><span style={labelSt}>单价 *</span><input type="number" inputMode="decimal" style={inputSt} value={prices[it.id] ?? ''} onChange={e => setPrices(p => ({ ...p, [it.id]: e.target.value }))} placeholder="议价单价" /></div>
                  <div style={{ textAlign: 'right' }}><span style={labelSt}>小计</span><div style={{ padding: '10px 0', fontSize: 14, fontWeight: 700, color: 'var(--status-success)' }}>{(num(it.qty) * num(prices[it.id])).toLocaleString()}</div></div>
                </div>
              </div>
            ))}
            <div style={{ textAlign: 'right', padding: '4px 2px', fontSize: 15, fontWeight: 700, color: t.text }}>合计：{total.toLocaleString()} {detail.currencyCode || ''}</div>
          </div>

          {error && <div style={{ color: 'var(--status-danger)', fontSize: 14, textAlign: 'center', padding: 8 }}>{error}</div>}
          {success && <div style={{ color: 'var(--status-success)', fontSize: 14, textAlign: 'center', padding: 8 }}>{success}</div>}
        </>}
      </div>

      {/* 吸底操作条（仅详情） */}
      {view === 'detail' && detail && (
        <div style={{ position: 'sticky', bottom: 0, display: 'flex', gap: 10, padding: '12px 16px', background: t.appBarBg, borderTop: `1px solid ${t.barBorder}` }}>
          <button onClick={() => { setView('list'); setDetail(null); }} style={{ flex: 1, padding: '13px 0', borderRadius: 12, border: `1px solid ${t.cardBorder}`, background: t.cardBg, color: t.text, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>取消</button>
          <button onClick={submitConvert} disabled={submitting} style={{ flex: 2, padding: '13px 0', borderRadius: 12, border: 'none', background: 'var(--status-success)', color: 'var(--bg-card)', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {submitting ? <Loader2 size={16} className={u.spin} /> : <Send size={16} />}{submitting ? '转单中…' : '确认转订单'}
          </button>
        </div>
      )}
    </div>
  );
}
