'use client';

/**
 * SupplierDetailDrawer — UIX-7 供应商中心产品化
 * 与 CustomerDetailDrawer 同款结构（KPI / 基础 / 最近采购 / 引用 / 审计）
 */

import { useEffect, useState } from 'react';
import {
  X, Building2, Phone, User, Calendar, ShoppingBag,
  CreditCard, Activity, AlertCircle, Link2,
} from 'lucide-react';
import request from '@/lib/api-client';

interface SupplierInfo {
  supplier_code: string;
  supplier_name: string;
  supplier_type?: string;
  country_code?: string;
  contact_name?: string;
  contact_phone?: string;
  default_currency?: string;
  payment_terms?: number;
  status: string;
  effective_date?: string;
  expire_date?: string;
}

interface PurchaseOrder {
  id: number;
  po_no: string;
  total_amount?: string;
  status: string;
  created_at: string;
}

interface APSummary {
  total_invoices?: number;
  balance_amount_original?: string;
  overdue_invoices?: number;
}

interface ReferenceItem { refTable: string; refDocType: string; refCount: number; }
interface AuditItem { action: string; operator?: string; reason?: string; created_at: string; }

interface Props {
  open: boolean;
  supplierCode: string | null;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  DRAFT:            { label: '草稿',   color: 'var(--text-secondary)' },
  PENDING_APPROVAL: { label: '待审批', color: 'var(--status-warning)' },
  ACTIVE:           { label: '已生效', color: 'var(--status-success)' },
  FROZEN:           { label: '已冻结', color: 'var(--status-info)' },
  ARCHIVED:         { label: '已归档', color: 'var(--text-disabled)' },
  REJECTED:         { label: '已驳回', color: 'var(--status-danger)' },
};

export function SupplierDetailDrawer({ open, supplierCode, onClose }: Props) {
  const [info, setInfo] = useState<SupplierInfo | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [apSummary, setApSummary] = useState<APSummary | null>(null);
  const [refs, setRefs] = useState<{ totalReferences: number; references: ReferenceItem[]; canArchive: boolean }>({ totalReferences: 0, references: [], canArchive: true });
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !supplierCode) return;
    setLoading(true); setErrors([]);
    const errs: string[] = [];
    const safe = async <T,>(p: string, label: string): Promise<T | null> => {
      try { return await request<T>(p); }
      catch (e) { errs.push(`${label}: ${e instanceof Error ? e.message : '失败'}`); return null; }
    };
    Promise.all([
      safe<SupplierInfo>(`/master-data/runtime/supplier/${supplierCode}`, '基础'),
      safe<{ items: PurchaseOrder[] } | PurchaseOrder[]>(`/v2/procurement/orders?supplier_code=${supplierCode}&limit=5`, '采购单'),
      safe<APSummary>(`/v2/finance/ap/summary?supplier_code=${supplierCode}`, 'AP'),
      safe<{ totalReferences: number; references: ReferenceItem[]; canArchive: boolean }>(`/master-data/references/SUPPLIER/${supplierCode}`, '引用'),
      safe<AuditItem[]>(`/master-data/audit?type=SUPPLIER&code=${supplierCode}`, '审计'),
    ]).then(([infoR, ordersR, apR, refsR, auditR]) => {
      setInfo(infoR);
      const list = Array.isArray(ordersR) ? ordersR : (ordersR?.items || []);
      setOrders(list.slice(0, 5));
      setApSummary(apR);
      setRefs(refsR || { totalReferences: 0, references: [], canArchive: true });
      setAudit(Array.isArray(auditR) ? auditR.slice(0, 8) : []);
      setErrors(errs);
    }).finally(() => setLoading(false));
  }, [open, supplierCode]);

  if (!open) return null;
  const status = info?.status ? (STATUS_LABEL[info.status] || { label: info.status, color: 'var(--text-secondary)' }) : null;
  const totalSpend = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'var(--overlay-black-45)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}
    >
      <div
        style={{ width: 640, maxWidth: '95vw', background: 'var(--bg-card)', height: '100%', overflowY: 'auto', boxShadow: '0 0 40px var(--overlay-black-25)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={{
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>供应商中心</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {info?.supplier_name || supplierCode || '—'}
            </h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>{supplierCode}</code>
              {status && (
                <span style={{ padding: '2px 8px', fontSize: 11, fontWeight: 600, background: 'var(--bg-muted)', color: status.color, borderRadius: 100 }}>{status.label}</span>
              )}
              {!refs.canArchive && (
                <span style={{ padding: '2px 8px', fontSize: 11, fontWeight: 600, background: 'var(--status-warning-bg-light)', color: 'var(--status-warning)', borderRadius: 100 }}>归档阻断</span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
            <X size={20} />
          </button>
        </header>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>加载中…</div>}
          {errors.length > 0 && (
            <section style={{ padding: 12, borderLeft: '3px solid var(--status-warning)', background: 'var(--status-warning-bg-faint)', fontSize: 12 }}>
              <strong>部分数据加载失败</strong>
              <ul style={{ margin: '4px 0 0 16px' }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </section>
          )}

          <section>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 10px', textTransform: 'uppercase' }}>业务统计</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <KpiTile icon={<ShoppingBag size={16} />} label="采购单数" value={orders.length} suffix="单 (近期)" />
              <KpiTile icon={<Activity size={16} />} label="近期采购额" value={totalSpend > 0 ? `¥${totalSpend.toLocaleString()}` : '—'} />
              <KpiTile icon={<CreditCard size={16} />} label="AP 余额" value={apSummary?.balance_amount_original ? `¥${Number(apSummary.balance_amount_original).toLocaleString()}` : '—'} tone={Number(apSummary?.balance_amount_original || 0) > 0 ? 'warning' : 'default'} />
              <KpiTile icon={<AlertCircle size={16} />} label="逾期单据" value={apSummary?.overdue_invoices ?? 0} tone={(apSummary?.overdue_invoices || 0) > 0 ? 'danger' : 'default'} />
            </div>
          </section>

          {info && (
            <section>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 10px', textTransform: 'uppercase' }}>基础信息</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', padding: 16, background: 'var(--bg-muted)', borderRadius: 'var(--radius-card)' }}>
                <InfoRow icon={<User size={14} />} label="联系人" value={info.contact_name || '—'} />
                <InfoRow icon={<Phone size={14} />} label="联系电话" value={info.contact_phone || '—'} />
                <InfoRow icon={<Building2 size={14} />} label="国家" value={info.country_code || '—'} />
                <InfoRow icon={<User size={14} />} label="类型" value={info.supplier_type || '—'} />
                <InfoRow icon={<CreditCard size={14} />} label="默认币种" value={info.default_currency || '—'} />
                <InfoRow icon={<Calendar size={14} />} label="账期天数" value={info.payment_terms ? `${info.payment_terms} 天` : '—'} />
              </div>
            </section>
          )}

          <section>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 10px', textTransform: 'uppercase' }}>
              最近采购 {orders.length > 0 ? `(${orders.length})` : ''}
            </h3>
            {orders.length === 0 ? <EmptyHint text="该供应商暂无采购单" /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {orders.map(o => (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>{o.po_no}</code>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(o.created_at).toLocaleString('zh-CN')}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>¥{Number(o.total_amount || 0).toLocaleString()}</strong>
                      <span style={{ padding: '1px 7px', fontSize: 11, fontWeight: 600, background: 'var(--bg-muted)', color: 'var(--text-secondary)', borderRadius: 100 }}>{o.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {refs.totalReferences > 0 && (
            <section>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 10px', textTransform: 'uppercase' }}>
                被引用 ({refs.totalReferences})
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                {refs.references.map(r => (
                  <div key={r.refTable} style={{ padding: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Link2 size={14} color="var(--color-primary)" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{r.refDocType}</div>
                      <code style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{r.refTable}</code>
                    </div>
                    <span style={{ padding: '1px 7px', fontSize: 11, fontWeight: 600, background: 'var(--status-warning)', color: 'var(--text-on-dark)', borderRadius: 100 }}>{r.refCount}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {audit.length > 0 && (
            <section>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 10px', textTransform: 'uppercase' }}>最近活动</h3>
              <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12, marginLeft: 4 }}>
                {audit.map((a, i) => (
                  <div key={i} style={{ position: 'relative', paddingBottom: 12 }}>
                    <span style={{ position: 'absolute', left: -18, top: 4, width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)' }} />
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <strong style={{ fontSize: 12, color: 'var(--text-primary)' }}>{a.action}</strong>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>by {a.operator || '—'} · {new Date(a.created_at).toLocaleString('zh-CN')}</span>
                    </div>
                    {a.reason && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>{a.reason}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiTile({ icon, label, value, suffix, tone = 'default' }: { icon: React.ReactNode; label: string; value: React.ReactNode; suffix?: string; tone?: 'default' | 'warning' | 'danger'; }) {
  const color = tone === 'danger' ? 'var(--status-danger)' : tone === 'warning' ? 'var(--status-warning)' : 'var(--text-primary)';
  return (
    <div style={{ padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
        {icon}<span style={{ fontSize: 11 }}>{label}</span>
      </div>
      <strong style={{ fontSize: 18, color, fontWeight: 700 }}>{value}</strong>
      {suffix && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{suffix}</span>}
    </div>
  );
}
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{icon}</span>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 64 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}
function EmptyHint({ text }: { text: string }) {
  return <div style={{ padding: '16px 12px', textAlign: 'center', background: 'var(--bg-muted)', borderRadius: 'var(--radius-card)', fontSize: 12, color: 'var(--text-secondary)' }}>{text}</div>;
}

export default SupplierDetailDrawer;
