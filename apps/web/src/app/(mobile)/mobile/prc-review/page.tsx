'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, RefreshCw, ClipboardCheck, X, Sun, Moon, CheckCircle, XCircle } from 'lucide-react';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { MobilePageSkeleton, SkeletonCard, MobileEmptyState } from '@/components/mobile/MobileSkeleton';
import { useToast } from '@/contexts/ToastContext';
import { haptic } from '@/lib/haptic';

// ── helpers ──────────────────────────────────────────────────────────────────

function getToken() {
  try { return JSON.parse(localStorage.getItem('auth_user') || '{}').token || ''; }
  catch { return ''; }
}

function todayPlusDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

type Tab = 'pending' | 'history';

interface PrcRequest {
  id: number;
  req_no?: string;
  subject?: string;
  item?: string;
  qty?: string;
  urgency?: string;
  budget_amount?: number | string;
  currency_code?: string;
  applicant?: string;
  store_code?: string;
  expected_date?: string;
  reason?: string;
  status: string;
  po_no?: string;
  reject_note?: string;
  reviewer_name?: string;
  created_at?: string;
}

const URGENCY_COLOR: Record<string, string> = {
  URGENT:   '#ef4444',
  CRITICAL: '#7c3aed',
  NORMAL:   '#6b7280',
};
const URGENCY_LABEL: Record<string, string> = {
  URGENT:   '紧急',
  CRITICAL: '极紧',
  NORMAL:   '普通',
};
const STATUS_COLOR: Record<string, string> = {
  PENDING:   '#f59e0b',
  CONVERTED: '#10b981',
  REJECTED:  '#ef4444',
};
const STATUS_LABEL: Record<string, string> = {
  PENDING:   '待处理',
  CONVERTED: '已转单',
  REJECTED:  '已拒绝',
};

// ── ConvertDrawer ─────────────────────────────────────────────────────────────

function ConvertDrawer({
  req, onClose, onDone,
}: {
  req: PrcRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, isDark } = useMobileTheme();
  const toast = useToast();

  const [supplierCode, setSupplierCode] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [totalAmount,  setTotalAmount]  = useState(
    req.budget_amount ? String(req.budget_amount) : '',
  );
  const [currency,     setCurrency]     = useState(req.currency_code || 'LAK');
  const [expectedDate, setExpectedDate] = useState(req.expected_date || todayPlusDays(14));
  const [payDeadline,  setPayDeadline]  = useState(todayPlusDays(30));
  const [note,         setNote]         = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState('');

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '10px 12px', borderRadius: 8,
    border: `1px solid ${isDark ? '#374151' : '#d1d5db'}`,
    background: isDark ? '#1f2937' : '#f9fafb',
    color: t.text, fontSize: 14, outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12, color: t.textSub, marginBottom: 4, display: 'block',
  };

  async function submit() {
    if (!supplierCode.trim()) { setError('请填写供应商代码'); return; }
    if (!totalAmount || isNaN(Number(totalAmount))) { setError('请填写合理的合同金额'); return; }
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`/api/procurement/purchase-requests/${req.id}/convert`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_code:  supplierCode.trim(),
          supplier_name:  supplierName.trim(),
          total_amount:   Number(totalAmount),
          currency_code:  currency,
          expected_date:  expectedDate,
          pay_deadline:   payDeadline,
          contract_note:  note.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.code === 200) { haptic('success'); toast.success('已转采购单'); onDone(); }
      else { setError(json.msg || '转换失败，请重试'); }
    } catch (e: unknown) {
      haptic('error');
      const msg = e instanceof Error ? e.message : '网络错误，请重试';
      toast.error(msg || '转单失败');
      setError(msg || '网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end',
    }}>
      <div style={{
        width: '100%', maxHeight: '90vh', overflowY: 'auto',
        background: isDark ? '#111827' : '#fff',
        borderRadius: '20px 20px 0 0', padding: '24px 16px 40px',
      }}>
        {/* 头部 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: t.text }}>转为采购单</div>
            <div style={{ fontSize: 12, color: '#10b981', marginTop: 2 }}>{req.req_no} · {req.subject}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.textSub, cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* 申请摘要 */}
        <div style={{
          background: isDark ? '#1f2937' : '#f0fdf4',
          borderRadius: 10, padding: '10px 14px', marginBottom: 20,
          border: `1px solid ${isDark ? '#374151' : '#bbf7d0'}`,
          fontSize: 13, color: t.textSub, lineHeight: 1.7,
        }}>
          <span>物品：{req.item || '—'}</span>
          {req.qty && <span style={{ marginLeft: 12 }}>数量：{req.qty}</span>}
          {req.budget_amount && (
            <span style={{ marginLeft: 12 }}>
              预算：{Number(req.budget_amount).toLocaleString()} {req.currency_code || ''}
            </span>
          )}
        </div>

        {/* 表单 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>供应商代码 *</label>
            <input style={inputStyle} value={supplierCode}
              onChange={e => setSupplierCode(e.target.value)}
              placeholder="如：SUP-001" />
          </div>
          <div>
            <label style={labelStyle}>供应商名称</label>
            <input style={inputStyle} value={supplierName}
              onChange={e => setSupplierName(e.target.value)}
              placeholder="公司全称（可选）" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 2 }}>
              <label style={labelStyle}>合同金额 *</label>
              <input type="number" inputMode="decimal" style={inputStyle}
                value={totalAmount} onChange={e => setTotalAmount(e.target.value)}
                placeholder="0.00" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>货币</label>
              <select style={inputStyle} value={currency} onChange={e => setCurrency(e.target.value)}>
                <option value="LAK">LAK</option>
                <option value="CNY">CNY</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>期望到货</label>
              <input type="date" style={inputStyle} value={expectedDate}
                onChange={e => setExpectedDate(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>付款截止</label>
              <input type="date" style={inputStyle} value={payDeadline}
                onChange={e => setPayDeadline(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>合同备注</label>
            <textarea style={{ ...inputStyle, height: 72, resize: 'none' }}
              value={note} onChange={e => setNote(e.target.value)}
              placeholder="质量要求、特殊条款等（可选）" />
          </div>
        </div>

        {error && (
          <div style={{ color: '#ef4444', fontSize: 13, marginTop: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 8 }}>
            {error}
          </div>
        )}

        <button
          onClick={submit} disabled={submitting}
          style={{
            marginTop: 20, width: '100%', padding: '14px 0',
            background: submitting ? '#9ca3af' : '#10b981',
            border: 'none', borderRadius: 12, color: '#fff',
            fontWeight: 700, fontSize: 15, cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? '提交中…' : '确认转为采购单'}
        </button>
      </div>
    </div>
  );
}

// ── RejectDrawer ──────────────────────────────────────────────────────────────

function RejectDrawer({
  req, onClose, onDone,
}: {
  req: PrcRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, isDark } = useMobileTheme();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '10px 12px', borderRadius: 8,
    border: `1px solid ${isDark ? '#374151' : '#d1d5db'}`,
    background: isDark ? '#1f2937' : '#f9fafb',
    color: t.text, fontSize: 14, outline: 'none',
  };

  async function submit() {
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`/api/procurement/purchase-requests/${req.id}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() || '不符合采购条件' }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.code === 200) { haptic('success'); toast.success('已拒绝申请'); onDone(); }
      else { setError(json.msg || '操作失败'); }
    } catch (e: unknown) {
      haptic('error');
      const msg = e instanceof Error ? e.message : '网络错误，请重试';
      toast.error(msg || '操作失败');
      setError(msg || '网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end',
    }}>
      <div style={{
        width: '100%',
        background: isDark ? '#111827' : '#fff',
        borderRadius: '20px 20px 0 0', padding: '24px 16px 40px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#ef4444' }}>拒绝申请</div>
            <div style={{ fontSize: 12, color: t.textSub, marginTop: 2 }}>{req.req_no} · {req.subject}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.textSub, cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div>
          <label style={{ fontSize: 12, color: t.textSub, marginBottom: 6, display: 'block' }}>
            拒绝原因（不填则默认"不符合采购条件"）
          </label>
          <textarea style={{ ...inputStyle, height: 100, resize: 'none' }}
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="如：超出年度预算 / 已有库存 / 需重新评估价格…" />
        </div>

        {error && (
          <div style={{ color: '#ef4444', fontSize: 13, marginTop: 10 }}>{error}</div>
        )}

        <button
          onClick={submit} disabled={submitting}
          style={{
            marginTop: 16, width: '100%', padding: '14px 0',
            background: submitting ? '#9ca3af' : '#ef4444',
            border: 'none', borderRadius: 12, color: '#fff',
            fontWeight: 700, fontSize: 15, cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? '提交中…' : '确认拒绝'}
        </button>
      </div>
    </div>
  );
}

// ── RequestCard ───────────────────────────────────────────────────────────────

function RequestCard({
  req, readonly, onConvert, onReject,
}: {
  req: PrcRequest;
  readonly: boolean;
  onConvert: (r: PrcRequest) => void;
  onReject:  (r: PrcRequest) => void;
}) {
  const { t, isDark } = useMobileTheme();
  const urgColor  = URGENCY_COLOR[req.urgency || 'NORMAL'] || '#6b7280';
  const statColor = STATUS_COLOR[req.status]  || '#6b7280';

  return (
    <div style={{
      background: isDark ? '#1f2937' : '#fff',
      borderRadius: 14, padding: '14px 14px 12px',
      border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
      marginBottom: 10,
    }}>
      {/* 顶行：单号 + 状态 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: t.textSub, fontFamily: 'monospace' }}>
          {req.req_no || `#${req.id}`}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {req.urgency && req.urgency !== 'NORMAL' && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: urgColor,
              background: `${urgColor}18`, padding: '2px 7px', borderRadius: 20,
            }}>
              {URGENCY_LABEL[req.urgency] || req.urgency}
            </span>
          )}
          <span style={{
            fontSize: 11, fontWeight: 600, color: statColor,
            background: `${statColor}18`, padding: '2px 8px', borderRadius: 20,
          }}>
            {STATUS_LABEL[req.status] || req.status}
          </span>
        </div>
      </div>

      {/* 主题 */}
      <div style={{ fontWeight: 600, fontSize: 15, color: t.text, marginBottom: 6, lineHeight: 1.4 }}>
        {req.subject || '（无标题）'}
      </div>

      {/* 物品/数量/预算 */}
      {(req.item || req.qty || req.budget_amount) && (
        <div style={{ fontSize: 13, color: t.textSub, marginBottom: 6, lineHeight: 1.6 }}>
          {req.item && <span>📦 {req.item}</span>}
          {req.qty && <span style={{ marginLeft: 10 }}>× {req.qty}</span>}
          {req.budget_amount && (
            <span style={{ marginLeft: 10, color: '#f59e0b', fontWeight: 600 }}>
              预算 {Number(req.budget_amount).toLocaleString()} {req.currency_code || ''}
            </span>
          )}
        </div>
      )}

      {/* 申请人/门店/时间 */}
      <div style={{ fontSize: 12, color: t.textSub, marginBottom: req.status === 'PENDING' ? 12 : 0 }}>
        {req.applicant && <span>👤 {req.applicant}</span>}
        {req.store_code && req.store_code !== 'ALL' && (
          <span style={{ marginLeft: 10 }}>🏪 {req.store_code}</span>
        )}
        {req.created_at && (
          <span style={{ marginLeft: 10 }}>
            {new Date(req.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* 转单后：显示 PO 号 */}
      {req.status === 'CONVERTED' && req.po_no && (
        <div style={{ fontSize: 12, color: '#10b981', marginTop: 6 }}>
          ✅ 已转采购单：{req.po_no}
        </div>
      )}

      {/* 拒绝后：显示原因 */}
      {req.status === 'REJECTED' && req.reject_note && (
        <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>
          ✗ 拒绝原因：{req.reject_note}
        </div>
      )}

      {/* 操作按钮（仅 PENDING + 非只读） */}
      {req.status === 'PENDING' && !readonly && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onConvert(req)}
            style={{
              flex: 1, padding: '10px 0',
              background: '#10b981', border: 'none', borderRadius: 10,
              color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            <CheckCircle size={14} /> 转为采购单
          </button>
          <button
            onClick={() => onReject(req)}
            style={{
              flex: 1, padding: '10px 0',
              background: 'none', border: '1.5px solid #ef4444', borderRadius: 10,
              color: '#ef4444', fontWeight: 600, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            <XCircle size={14} /> 拒绝
          </button>
        </div>
      )}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function PrcReviewPage() {
  const router = useRouter();
  const { isDark, toggle, t } = useMobileTheme();
  const { allowed, loading: permLoading, readonly } = useMobilePermission('prc_review');

  const [tab,       setTab]       = useState<Tab>('pending');
  const [requests,  setRequests]  = useState<PrcRequest[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Drawer state
  const [convertReq, setConvertReq] = useState<PrcRequest | null>(null);
  const [rejectReq,  setRejectReq]  = useState<PrcRequest | null>(null);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/procurement/purchase-requests', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json().catch(() => ({}));
      setRequests(json.data || []);
    } catch {
      setError('加载失败，请下拉刷新');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [allowed]);

  useEffect(() => {
    if (!allowed || permLoading) return;
    load();
  }, [allowed, permLoading, load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
  }

  function handleActionDone() {
    setConvertReq(null);
    setRejectReq(null);
    load();
  }

  const pending = requests.filter(r => r.status === 'PENDING');
  const history = requests.filter(r => r.status !== 'PENDING');

  // ── 权限加载中 / 无权限 ──
  if (permLoading) {
    return <MobilePageSkeleton title="采购审核" tabs={['待处理', '已处理']} onBack={() => router.back()} />;
  }
  if (!allowed) {
    return (
      <div style={{ minHeight: '100vh', background: isDark ? '#0f172a' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 16 }}>无访问权限</div>
        <button onClick={() => router.push('/mobile/home')}
          style={{ padding: '10px 24px', background: '#3b82f6', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer' }}>
          返回首页
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: isDark ? '#0f172a' : '#f1f5f9' }}>
      {/* 顶栏 */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: isDark ? '#1e293b' : '#fff',
        borderBottom: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
        padding: 'calc(env(safe-area-inset-top) + 12px) 16px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.push('/mobile/home')}
            style={{ background: 'none', border: 'none', color: t.text, cursor: 'pointer', padding: 4 }}>
            <ChevronLeft size={22} />
          </button>
          <ClipboardCheck size={18} color="#b45309" />
          <span style={{ fontWeight: 700, fontSize: 16, color: t.text }}>采购审核</span>
          {pending.length > 0 && (
            <span style={{
              background: '#ef4444', color: '#fff',
              borderRadius: 12, padding: '1px 7px', fontSize: 11, fontWeight: 700,
            }}>
              {pending.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={handleRefresh} disabled={refreshing}
            style={{ background: 'none', border: 'none', color: t.textSub, cursor: 'pointer', padding: 4 }}>
            <RefreshCw size={18} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <button onClick={toggle}
            style={{ background: 'none', border: 'none', color: t.textSub, cursor: 'pointer', padding: 4 }}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>

      {/* Tab 切换 */}
      <div style={{
        display: 'flex', margin: '12px 16px 0',
        background: isDark ? '#1e293b' : '#e2e8f0',
        borderRadius: 12, padding: 4,
      }}>
        {([
          { key: 'pending', label: `待处理${pending.length ? ` (${pending.length})` : ''}` },
          { key: 'history', label: `已处理${history.length ? ` (${history.length})` : ''}` },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1, padding: '9px 0',
              background: tab === key ? '#b45309' : 'transparent',
              border: 'none', borderRadius: 9,
              color: tab === key ? '#fff' : t.textSub,
              fontWeight: tab === key ? 700 : 400,
              fontSize: 14, cursor: 'pointer', transition: 'all 0.18s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div style={{ padding: '12px 16px calc(80px + env(safe-area-inset-bottom))' }}>
        {loading ? (
          <div>{[1,2,3,4].map(i => <SkeletonCard key={i} lines={3} />)}</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#ef4444', fontSize: 14 }}>
            {error}
          </div>
        ) : (
          <>
            {tab === 'pending' && (
              pending.length === 0 ? (
                <MobileEmptyState icon="✅" title="暂无待处理申请" desc="所有采购申请均已处理完毕" />
              ) : (
                pending.map(r => (
                  <RequestCard key={r.id} req={r} readonly={readonly}
                    onConvert={setConvertReq} onReject={setRejectReq} />
                ))
              )
            )}

            {tab === 'history' && (
              history.length === 0 ? (
                <MobileEmptyState icon="📋" title="暂无历史记录" desc="还没有已处理的申请" />
              ) : (
                history.map(r => (
                  <RequestCard key={r.id} req={r} readonly={readonly}
                    onConvert={setConvertReq} onReject={setRejectReq} />
                ))
              )
            )}
          </>
        )}
      </div>

      {/* Drawers */}
      {convertReq && (
        <ConvertDrawer req={convertReq} onClose={() => setConvertReq(null)} onDone={handleActionDone} />
      )}
      {rejectReq && (
        <RejectDrawer req={rejectReq} onClose={() => setRejectReq(null)} onDone={handleActionDone} />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
