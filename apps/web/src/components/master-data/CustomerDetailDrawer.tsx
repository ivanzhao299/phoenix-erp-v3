'use client';

/**
 * CustomerDetailDrawer — UIX-7 客户中心产品化
 *
 * 不再只展示"基本字段"，而是聚合呈现：
 *   · 基础信息（编码 / 名称 / 联系人 / 公司）
 *   · 业务统计：订单数 / 销售额 / AR 余额 / 信用额度
 *   · 最近订单（取 sal_sales_orders top 5）
 *   · 审批记录（mst_audit_trail）
 *   · 引用关系（master-data/references API）
 *
 * 数据源：
 *   GET /api/master-data/runtime/customer/:code
 *   GET /api/master-data/references/CUSTOMER/:code
 *   GET /api/v2/sales/orders?customer_code=:code&limit=5
 *   GET /api/v2/finance/ar/summary?customer_code=:code
 *   GET /api/master-data/audit?type=CUSTOMER&code=:code
 */

import { useEffect, useState } from 'react';
import {
  X, Building2, Phone, User, Calendar, ShoppingCart,
  Receipt, Activity, AlertCircle, Link2, Clock,
} from 'lucide-react';
import request from '@/lib/api-client';

interface CustomerInfo {
  customer_no: string;
  customer_name: string;
  customer_type?: string;
  contact_name?: string;
  contact_phone?: string;
  company_code?: string;
  status: string;
  credit_limit?: number;
  effective_date?: string;
  expire_date?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

interface SalesOrder {
  id: number;
  order_no: string;
  total_amount?: string;
  status: string;
  created_at: string;
}

interface ReferenceItem {
  refTable: string;
  refDocType: string;
  refCount: number;
}

interface AuditItem {
  action: string;
  operator?: string;
  reason?: string;
  created_at: string;
}

interface ARSummary {
  total_invoices?: number;
  balance_amount_original?: string;
  overdue_invoices?: number;
}

interface Props {
  open: boolean;
  customerCode: string | null;
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

export function CustomerDetailDrawer({ open, customerCode, onClose }: Props) {
  const [info, setInfo] = useState<CustomerInfo | null>(null);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [arSummary, setArSummary] = useState<ARSummary | null>(null);
  const [refs, setRefs] = useState<{ totalReferences: number; references: ReferenceItem[]; canArchive: boolean }>({ totalReferences: 0, references: [], canArchive: true });
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !customerCode) return;
    setLoading(true);
    setErrors([]);

    const errs: string[] = [];
    const safeFetch = async <T,>(path: string, label: string): Promise<T | null> => {
      try {
        return await request<T>(path);
      } catch (e) {
        errs.push(`${label}: ${e instanceof Error ? e.message : '加载失败'}`);
        return null;
      }
    };

    Promise.all([
      safeFetch<CustomerInfo>(`/master-data/runtime/customer/${customerCode}`, '基础信息'),
      safeFetch<{ items: SalesOrder[] } | SalesOrder[]>(`/v2/sales/orders?customer_code=${customerCode}&limit=5`, '订单'),
      safeFetch<ARSummary>(`/v2/finance/ar/summary?customer_code=${customerCode}`, 'AR 摘要'),
      safeFetch<{ totalReferences: number; references: ReferenceItem[]; canArchive: boolean }>(`/master-data/references/CUSTOMER/${customerCode}`, '引用关系'),
      safeFetch<AuditItem[]>(`/master-data/audit?type=CUSTOMER&code=${customerCode}`, '审计'),
    ]).then(([infoR, ordersR, arR, refsR, auditR]) => {
      setInfo(infoR);
      const list = Array.isArray(ordersR) ? ordersR : (ordersR?.items || []);
      setOrders(list.slice(0, 5));
      setArSummary(arR);
      setRefs(refsR || { totalReferences: 0, references: [], canArchive: true });
      setAudit(audit => Array.isArray(auditR) ? auditR.slice(0, 8) : audit);
      setErrors(errs);
    }).finally(() => setLoading(false));
  }, [open, customerCode]);

  if (!open) return null;

  const status = info?.status ? (STATUS_LABEL[info.status] || { label: info.status, color: 'var(--text-secondary)' }) : null;
  const totalSales = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'var(--overlay-black-45)', zIndex: 200,
        display: 'flex', justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 640, maxWidth: '95vw',
          background: 'var(--bg-card)', height: '100%',
          overflowY: 'auto',
          boxShadow: '0 0 40px var(--overlay-black-25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>客户中心</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {info?.customer_name || customerCode || '—'}
            </h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>{customerCode}</code>
              {status && (
                <span style={{
                  padding: '2px 8px', fontSize: 11, fontWeight: 600,
                  background: 'var(--bg-muted)', color: status.color,
                  borderRadius: 100,
                }}>{status.label}</span>
              )}
              {!refs.canArchive && (
                <span style={{
                  padding: '2px 8px', fontSize: 11, fontWeight: 600,
                  background: 'var(--status-warning-bg-light)',
                  color: 'var(--status-warning)', borderRadius: 100,
                }}>归档阻断</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}
          >
            <X size={20} />
          </button>
        </header>

        {/* Body */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {loading && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>加载中…</div>
          )}

          {errors.length > 0 && (
            <section style={{
              padding: 12, borderLeft: '3px solid var(--status-warning)',
              background: 'var(--status-warning-bg-faint)', fontSize: 12,
              color: 'var(--text-primary)',
            }}>
              <strong>部分数据加载失败</strong>
              <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </section>
          )}

          {/* 业务 KPI */}
          <section>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>业务统计</h3>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
            }}>
              <KpiTile icon={<ShoppingCart size={16} />} label="订单数" value={orders.length} suffix="单 (近期)" />
              <KpiTile
                icon={<Activity size={16} />} label="近期销售额"
                value={totalSales > 0 ? `¥${totalSales.toLocaleString()}` : '—'}
              />
              <KpiTile
                icon={<Receipt size={16} />} label="AR 余额"
                value={arSummary?.balance_amount_original ? `¥${Number(arSummary.balance_amount_original).toLocaleString()}` : '—'}
                tone={Number(arSummary?.balance_amount_original || 0) > 0 ? 'warning' : 'default'}
              />
              <KpiTile
                icon={<AlertCircle size={16} />} label="逾期单据"
                value={arSummary?.overdue_invoices ?? 0}
                tone={(arSummary?.overdue_invoices || 0) > 0 ? 'danger' : 'default'}
              />
            </div>
          </section>

          {/* 基础信息 */}
          {info && (
            <section>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>基础信息</h3>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px',
                padding: 16, background: 'var(--bg-muted)', borderRadius: 'var(--radius-card)',
              }}>
                <InfoRow icon={<User size={14} />} label="联系人" value={info.contact_name || '—'} />
                <InfoRow icon={<Phone size={14} />} label="联系电话" value={info.contact_phone || '—'} />
                <InfoRow icon={<Building2 size={14} />} label="所属公司" value={info.company_code || '—'} />
                <InfoRow icon={<User size={14} />} label="客户类型" value={info.customer_type || '—'} />
                <InfoRow
                  icon={<Calendar size={14} />} label="生效日期"
                  value={info.effective_date ? new Date(info.effective_date).toLocaleDateString('zh-CN') : '—'}
                />
                <InfoRow
                  icon={<Calendar size={14} />} label="失效日期"
                  value={info.expire_date ? new Date(info.expire_date).toLocaleDateString('zh-CN') : '永久'}
                />
              </div>
            </section>
          )}

          {/* 最近订单 */}
          <section>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              最近订单 {orders.length > 0 ? `(${orders.length})` : ''}
            </h3>
            {orders.length === 0 ? (
              <EmptyHint text="该客户暂无销售订单" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {orders.map(o => (
                  <div key={o.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', background: 'var(--bg-card)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-card)',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>{o.order_no}</code>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(o.created_at).toLocaleString('zh-CN')}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                        ¥{Number(o.total_amount || 0).toLocaleString()}
                      </strong>
                      <span style={{
                        padding: '1px 7px', fontSize: 11, fontWeight: 600,
                        background: 'var(--bg-muted)', color: 'var(--text-secondary)',
                        borderRadius: 100,
                      }}>{o.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 引用关系（关系图）*/}
          {refs.totalReferences > 0 && (
            <section>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                被引用 ({refs.totalReferences})
              </h3>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8,
              }}>
                {refs.references.map(r => (
                  <div key={r.refTable} style={{
                    padding: 10,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-card)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <Link2 size={14} color="var(--color-primary)" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{r.refDocType}</div>
                      <code style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{r.refTable}</code>
                    </div>
                    <span style={{
                      padding: '1px 7px', fontSize: 11, fontWeight: 600,
                      background: 'var(--status-warning)', color: 'var(--text-on-dark)',
                      borderRadius: 100,
                    }}>{r.refCount}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 审计记录 */}
          {audit.length > 0 && (
            <section>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                最近活动
              </h3>
              <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12, marginLeft: 4 }}>
                {audit.map((a, i) => (
                  <div key={i} style={{ position: 'relative', paddingBottom: 12 }}>
                    <span style={{
                      position: 'absolute', left: -18, top: 4, width: 8, height: 8,
                      borderRadius: '50%', background: 'var(--color-primary)',
                    }} />
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <strong style={{ fontSize: 12, color: 'var(--text-primary)' }}>{a.action}</strong>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        by {a.operator || '—'} · {new Date(a.created_at).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    {a.reason && (
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>{a.reason}</p>
                    )}
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

// ── 内部组件 ───────────────────────────────────────────────

function KpiTile({ icon, label, value, suffix, tone = 'default' }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; suffix?: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const color = tone === 'danger' ? 'var(--status-danger)' :
                tone === 'warning' ? 'var(--status-warning)' :
                'var(--text-primary)';
  return (
    <div style={{
      padding: 12, background: 'var(--bg-card)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-card)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
        {icon}
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
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
  return (
    <div style={{
      padding: '16px 12px', textAlign: 'center',
      background: 'var(--bg-muted)', borderRadius: 'var(--radius-card)',
      fontSize: 12, color: 'var(--text-secondary)',
    }}>{text}</div>
  );
}

export default CustomerDetailDrawer;
