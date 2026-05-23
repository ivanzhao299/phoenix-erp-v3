'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, RefreshCw, ShoppingCart, CreditCard, Sun, Moon } from 'lucide-react';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { MobilePageSkeleton, SkeletonCard, MobileEmptyState } from '@/components/mobile/MobileSkeleton';
import { useToast } from '@/contexts/ToastContext';
import { haptic } from '@/lib/haptic';

// ── helpers ──────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}

function getUserRoles(): string[] {
  const token = getToken();
  if (!token) return [];
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const r = payload.role || payload.roles;
    if (Array.isArray(r)) return r;
    if (typeof r === 'string') return [r];
  } catch { /**/ }
  return [];
}

const CAN_APPROVE_ROLES  = ['ROLE_ADMIN', 'ROLE_REGION_MGR', 'ROLE_CEO'];
const CAN_PAY_ROLES      = ['ROLE_ADMIN', 'ROLE_FIN_ACCT', 'ROLE_FIN_CFO'];
const PAYMENT_METHODS    = ['银行转账', '现金', '移动支付', '支票'];

const PO_STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿', CONFIRMED: '待批准', PENDING: '待批准', PENDING_APPROVAL: '待批准',
  APPROVED: '已批准', PAID: '已付款', ARRIVING: '在途', RECEIVED: '已收货', CANCELLED: '已取消',
};
const PO_STATUS_COLOR: Record<string, string> = {
  DRAFT: '#94a3b8', CONFIRMED: '#f59e0b', PENDING: '#f59e0b', PENDING_APPROVAL: '#f59e0b',
  APPROVED: '#3b82f6', PAID: '#10b981', ARRIVING: '#0891b2', RECEIVED: '#10b981', CANCELLED: '#ef4444',
};

type Tab = 'approve' | 'pay';

interface PO {
  id: number; po_no: string; supplier_code?: string; supplier_name?: string;
  subject?: string; total_amount?: number; currency_code?: string; status: string;
  expected_date?: string; pay_deadline?: string; contract_no?: string; remark?: string;
  created_at?: string;
}

interface PendingPayment {
  id: number; txn_no?: string; amount?: number; currency_code?: string;
  description?: string; po_no?: string; subject?: string;
  supplier_name?: string; supplier_code?: string;
  contract_no?: string; pay_deadline?: string; created_at?: string;
}

// ── ApproveCard ───────────────────────────────────────────────────────────────

function ApproveCard({
  po, canApprove, onApproved,
}: { po: PO; canApprove: boolean; onApproved: () => void }) {
  const { t, isDark } = useMobileTheme();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');

  const statusColor = PO_STATUS_COLOR[po.status?.toUpperCase() || ''] ?? '#94a3b8';

  const handleApprove = async () => {
    setApproving(true); setError('');
    try {
      const res = await fetch(`/api/procurement/${po.po_no}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) { haptic('success'); toast.success('操作成功'); setExpanded(false); onApproved(); }
      else { setError(json.msg || '批准失败'); }
    } catch (e: any) { haptic('error'); toast.error(e.message || '操作失败'); setError('网络错误，请重试'); }
    finally { setApproving(false); }
  };

  return (
    <div style={{
      background: t.cardBg, borderRadius: 14, padding: '14px 16px',
      border: `1px solid ${t.cardBorder}`, marginBottom: 10,
    }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: t.textSub }}>{po.po_no}</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: t.text, marginTop: 2, marginRight: 8 }}>
            {po.subject || '—'}
          </div>
          <div style={{ fontSize: 13, color: t.textSub, marginTop: 2 }}>
            {po.supplier_name || po.supplier_code || '—'}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#7c3aed' }}>
            {po.currency_code || 'LAK'} {Number(po.total_amount || 0).toLocaleString()}
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            background: `${statusColor}20`, color: statusColor, display: 'inline-block', marginTop: 4,
          }}>
            {PO_STATUS_LABEL[po.status?.toUpperCase() || ''] || po.status}
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${t.cardBorder}`, paddingTop: 12 }}>
          {[
            { label: '供应商', value: po.supplier_name || po.supplier_code },
            { label: '合同编号', value: po.contract_no },
            { label: '期望到货', value: po.expected_date?.slice(0, 10) },
            { label: '付款截止', value: po.pay_deadline?.slice(0, 10) },
            { label: '备注', value: po.remark },
          ].filter(r => r.value).map(r => (
            <div key={r.label} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: t.textSub, width: 64, flexShrink: 0 }}>{r.label}</span>
              <span style={{ fontSize: 13, color: t.text, fontWeight: 500 }}>{r.value}</span>
            </div>
          ))}

          {error && (
            <div style={{ color: '#ef4444', fontSize: 13, background: '#fef2f2', padding: '6px 10px', borderRadius: 8, marginTop: 8 }}>
              {error}
            </div>
          )}

          {canApprove && (
            <button
              onClick={handleApprove}
              disabled={approving}
              style={{
                width: '100%', marginTop: 12, padding: '12px 0', borderRadius: 12, border: 'none',
                background: approving ? '#94a3b8' : '#7c3aed', color: '#fff',
                fontSize: 15, fontWeight: 700, cursor: approving ? 'not-allowed' : 'pointer',
              }}
            >
              {approving ? '批准中…' : '✓ 批准采购单 · 生成待付款'}
            </button>
          )}
          {!canApprove && (
            <div style={{ fontSize: 12, color: t.textSub, textAlign: 'center', marginTop: 8 }}>
              您无批准权限（只读）
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── PayCard ───────────────────────────────────────────────────────────────────

function PayCard({
  item, canPay, onPaid,
}: { item: PendingPayment; canPay: boolean; onPaid: () => void }) {
  const { t } = useMobileTheme();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [method, setMethod]     = useState(PAYMENT_METHODS[0]);
  const [ref, setRef]           = useState('');
  const [proof, setProof]       = useState('');
  const [paying, setPaying]     = useState(false);
  const [error, setError]       = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = item.pay_deadline && item.pay_deadline.slice(0, 10) < today;

  const handlePay = async () => {
    if (!ref.trim()) { setError('请填写付款流水号'); return; }
    setPaying(true); setError('');
    try {
      const res = await fetch(`/api/procurement/payments/${item.id}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_ref: ref.trim(), payment_proof: proof.trim() || undefined, method }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) { haptic('success'); toast.success('操作成功'); setExpanded(false); onPaid(); }
      else { setError(json.msg || '确认失败'); }
    } catch (e: any) { haptic('error'); toast.error(e.message || '操作失败'); setError('网络错误，请重试'); }
    finally { setPaying(false); }
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.1)',
    color: t.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const,
  };

  return (
    <div style={{
      background: t.cardBg, borderRadius: 14, padding: '14px 16px',
      border: `1px solid ${isOverdue ? '#ef4444' : t.cardBorder}`, marginBottom: 10,
    }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: t.textSub }}>
            {item.po_no}
            {item.contract_no && <span style={{ marginLeft: 8 }}>合同：{item.contract_no}</span>}
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, color: t.text, marginTop: 2, marginRight: 8 }}>
            {item.subject || '—'}
          </div>
          <div style={{ fontSize: 13, color: t.textSub, marginTop: 2 }}>
            {item.supplier_name || item.supplier_code || '—'}
            {isOverdue && <span style={{ marginLeft: 8, color: '#ef4444', fontWeight: 700 }}>⚠ 逾期</span>}
          </div>
          {item.pay_deadline && (
            <div style={{ fontSize: 11, color: isOverdue ? '#ef4444' : t.textFaint, marginTop: 2 }}>
              截止：{item.pay_deadline.slice(0, 10)}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#7c3aed' }}>
            {item.currency_code || 'LAK'} {Number(item.amount || 0).toLocaleString()}
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            background: '#fef3c720', color: '#f59e0b', display: 'inline-block', marginTop: 4,
          }}>
            待付款
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${t.cardBorder}`, paddingTop: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <span style={{ fontSize: 13, color: t.textSub, display: 'block', marginBottom: 6 }}>付款方式</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    style={{
                      padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                      fontSize: 13, fontWeight: 600,
                      background: method === m ? '#7c3aed' : 'rgba(0,0,0,0.06)',
                      color: method === m ? '#fff' : t.textSub,
                    }}
                  >{m}</button>
                ))}
              </div>
            </div>
            <div>
              <span style={{ fontSize: 13, color: t.textSub, display: 'block', marginBottom: 4 }}>
                银行流水号 / 凭证号 <span style={{ color: '#ef4444' }}>*</span>
              </span>
              <input
                style={inputStyle}
                value={ref}
                onChange={e => setRef(e.target.value)}
                placeholder="填写转账流水号或支付凭证号"
              />
            </div>
            <div>
              <span style={{ fontSize: 13, color: t.textSub, display: 'block', marginBottom: 4 }}>备注（可选）</span>
              <textarea
                style={{ ...inputStyle, height: 60, resize: 'none' }}
                value={proof}
                onChange={e => setProof(e.target.value)}
                placeholder="如分批付款说明"
              />
            </div>
          </div>

          {error && (
            <div style={{ color: '#ef4444', fontSize: 13, background: '#fef2f2', padding: '6px 10px', borderRadius: 8, marginTop: 8 }}>
              {error}
            </div>
          )}

          {canPay && (
            <button
              onClick={handlePay}
              disabled={paying}
              style={{
                width: '100%', marginTop: 12, padding: '13px 0', borderRadius: 12, border: 'none',
                background: paying ? '#94a3b8' : '#10b981', color: '#fff',
                fontSize: 15, fontWeight: 700, cursor: paying ? 'not-allowed' : 'pointer',
              }}
            >
              {paying ? '提交中…' : '✓ 确认已付款'}
            </button>
          )}
          {!canPay && (
            <div style={{ fontSize: 12, color: t.textSub, textAlign: 'center', marginTop: 8 }}>
              您无付款操作权限（只读）
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ProcurementPage ───────────────────────────────────────────────────────────

export default function ProcurementPage() {
  const router  = useRouter();
  const { isDark, toggle, t } = useMobileTheme();
  const { allowed, loading: permLoading } = useMobilePermission('procurement');
  const toast = useToast();

  const roles      = getUserRoles();
  const canApprove = roles.some(r => CAN_APPROVE_ROLES.includes(r));
  const canPay     = roles.some(r => CAN_PAY_ROLES.includes(r));

  const [tab,      setTab]      = useState<Tab>('approve');
  const [pos,      setPOs]      = useState<PO[]>([]);
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const loadPOs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/procurement/orders', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json().catch(() => ({}));
      const all: PO[] = json.data || [];
      // 仅显示待批准的（CONFIRMED / PENDING_APPROVAL）
      setPOs(all.filter(p => ['CONFIRMED', 'PENDING', 'PENDING_APPROVAL'].includes((p.status || '').toUpperCase())));
    } catch { setError('加载采购单失败'); }
    finally { setLoading(false); }
  }, []);

  const loadPayments = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/procurement/pending-payments', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json().catch(() => ({}));
      setPayments(json.data || []);
    } catch { setError('加载待付款记录失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!allowed || permLoading) return;
    if (tab === 'approve') loadPOs();
    else loadPayments();
  }, [tab, allowed, permLoading, loadPOs, loadPayments]);

  if (permLoading) return <MobilePageSkeleton title="采购审批" tabs={['待审批', '待付款']} onBack={() => router.back()} />;
  if (!allowed) return null;

  const refresh = () => tab === 'approve' ? loadPOs() : loadPayments();

  return (
    <div style={{ minHeight: '100svh', background: t.pageBg, display: 'flex', flexDirection: 'column' }}>
      {/* AppBar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'calc(env(safe-area-inset-top) + 12px) 16px 12px', background: t.appBarBg,
        borderBottom: `1px solid ${t.barBorder}`, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => router.push('/mobile/home')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <ChevronLeft size={20} />
          <span style={{ fontSize: 14 }}>返回</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShoppingCart size={18} color="#7c3aed" />
          <span style={{ fontWeight: 700, fontSize: 16, color: t.text }}>采购审批</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { haptic('light'); refresh(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub }}>
            <RefreshCw size={18} />
          </button>
          <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub }}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>

      {/* 角色说明条 */}
      {!canApprove && !canPay && (
        <div style={{ background: '#fef3c7', color: '#92400e', fontSize: 13, padding: '8px 16px', textAlign: 'center' }}>
          只读模式 — 您无审批或付款操作权限
        </div>
      )}

      {/* Tab */}
      <div style={{ display: 'flex', margin: '12px 16px 0', background: t.inputBg, borderRadius: 12, padding: 4 }}>
        {([
          ['approve', '待审批', ShoppingCart, pos.length],
          ['pay',     '待付款', CreditCard,   payments.length],
        ] as const).map(([key, label, Icon, cnt]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
              background: tab === key ? '#7c3aed' : 'transparent',
              color: tab === key ? '#fff' : t.textSub,
              transition: 'all 0.2s',
            }}
          >
            <Icon size={15} />
            {label}
            {cnt > 0 && (
              <span style={{
                background: tab === key ? 'rgba(255,255,255,0.3)' : '#ef4444',
                color: '#fff', fontSize: 10, fontWeight: 800,
                padding: '1px 5px', borderRadius: 10, lineHeight: 1.4,
              }}>{cnt}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '12px 16px calc(24px + env(safe-area-inset-bottom))', overflowY: 'auto' }}>
        {loading && (
          <div>{[1,2,3].map(i => <SkeletonCard key={i} lines={3} />)}</div>
        )}
        {error && (
          <div style={{ color: '#ef4444', background: '#fef2f2', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* 待审批 */}
        {!loading && tab === 'approve' && (
          pos.length === 0
            ? (
              <MobileEmptyState icon="✅" title="暂无待审批采购单" desc="所有采购单均已审批完毕" />
            )
            : pos.map(po => (
              <ApproveCard key={po.id} po={po} canApprove={canApprove} onApproved={loadPOs} />
            ))
        )}

        {/* 待付款 */}
        {!loading && tab === 'pay' && (
          payments.length === 0
            ? (
              <MobileEmptyState icon="💰" title="暂无待付款记录" desc="所有采购单均已付款或无待付款项" />
            )
            : payments.map(item => (
              <PayCard key={item.id} item={item} canPay={canPay} onPaid={loadPayments} />
            ))
        )}
      </div>
    </div>
  );
}
