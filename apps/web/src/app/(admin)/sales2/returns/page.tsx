'use client';
import React, { useState, useEffect, useCallback } from 'react';
import s from "@/components/ui/admin-ui.module.css";
import { KpiCard } from "@/components/ui/KpiCard";
import { hexToAccent, KPI_GRID } from "@/lib/design-tokens";

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface ReturnOrder {
  id: string;
  return_no: string;
  sales_order_no: string | null;
  customer_code: string | null;
  customer_name: string | null;
  company_code: string;
  return_type: string;
  reason_code: string | null;
  currency_code: string;
  subtotal: number;
  status: string;
  need_approval: boolean;
  credit_note_id: string | null;
  requested_at: string | null;
  inspected_at: string | null;
  restocked_at: string | null;
  completed_at: string | null;
  remark: string | null;
  created_at: string;
  items: ReturnItem[];
}

interface ReturnItem {
  id: string;
  return_order_id: string;
  product_code: string;
  product_name: string | null;
  grade_code: string | null;
  returned_qty: number;
  accepted_qty: number;
  damaged_qty: number;
  unit_price: number;
  amount: number;
  inspection_result: string;
  restock_status: string;
  remark: string | null;
  sku_code?: string | null;  // Phase H5
}

interface DashboardStats {
  todayTotal: number;
  pendingInspection: number;
  pendingRestock: number;
  todayCreditNoteAmount: number;
  pendingApproval: number;
}

interface ReturnAnalysis {
  topCustomers: Array<{ customer_code: string; customer_name: string; return_count: number; total_amount: number }>;
  topProducts: Array<{ product_code: string; product_name: string; return_count: number; total_qty: number; damaged_qty: number }>;
  summary: { totalReturns: number; totalAmount: number; deliveryRejectCount: number; damageCount: number; damageRate: string };
}

// ── 常量配置 ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  DRAFT:            { label: '草稿',   color: '#9ca3af' },
  SUBMITTED:        { label: '已提交', color: '#3b82f6' },
  PENDING_APPROVAL: { label: '待审批', color: '#f59e0b' },
  INSPECTING:       { label: '质检中', color: '#8b5cf6' },
  RESTOCKING:       { label: '回库中', color: '#06b6d4' },
  COMPLETED:        { label: '已完成', color: '#10b981' },
  REJECTED:         { label: '已拒绝', color: '#ef4444' },
  CANCELLED:        { label: '已取消', color: '#6b7280' },
};

const RETURN_TYPE_CFG: Record<string, { label: string; color: string }> = {
  CUSTOMER_RETURN: { label: '客户退货', color: '#3b82f6' },
  DELIVERY_REJECT: { label: '配送拒收', color: '#f59e0b' },
  QUALITY_RETURN:  { label: '质量退货', color: '#8b5cf6' },
  DAMAGE_RETURN:   { label: '破损退货', color: '#ef4444' },
};

const INSPECTION_CFG: Record<string, { label: string; color: string }> = {
  PENDING:  { label: '待检', color: '#9ca3af' },
  ACCEPTED: { label: '合格', color: '#10b981' },
  PARTIAL:  { label: '部分', color: '#f59e0b' },
  REJECTED: { label: '不合格', color: '#ef4444' },
  DAMAGED:  { label: '破损', color: '#ef4444' },
};

// ── API 工具 ──────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  // 修复（401 踢登录）：补上 Authorization 头，API 鉴权才能通过。
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? res.statusText);
  }
  return res.json();
}

function fmt(n: number | string | null | undefined): string {
  return Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0 });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('zh-CN');
}

// ── 徽章组件 ──────────────────────────────────────────────────────────────────

function Badge({ cfg, code }: { cfg: Record<string, { label: string; color: string }>; code: string }) {
  const c = cfg[code] ?? { label: code, color: '#6b7280' };
  return (
    <span style={{
      background: c.color + '20', color: c.color,
      border: `1px solid ${c.color}40`,
      borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600,
    }}>{c.label}</span>
  );
}

// ── 创建退货抽屉 ──────────────────────────────────────────────────────────────

function CreateReturnDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    salesOrderNo: '', customerCode: '', customerName: '', companyCode: '',
    returnType: 'CUSTOMER_RETURN', reasonCode: '', remark: '',
  });
  const [items, setItems] = useState([{
    productCode: '', productName: '', gradeCode: '', returnedQty: 1, unitPrice: 0, remark: '',
  }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addItem = () => setItems(p => [...p, { productCode: '', productName: '', gradeCode: '', returnedQty: 1, unitPrice: 0, remark: '' }]);
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, val: string | number) =>
    setItems(p => p.map((it, idx) => idx === i ? { ...it, [field]: val } : it));

  const handleCreate = async () => {
    if (!form.companyCode) { setError('请填写公司代码'); return; }
    if (!items.some(it => it.productCode)) { setError('至少添加一条明细'); return; }
    setLoading(true); setError('');
    try {
      await api('POST', '/api/v2/sales/returns', {
        ...form,
        items: items.filter(it => it.productCode).map(it => ({
          productCode: it.productCode,
          productName: it.productName || undefined,
          gradeCode: it.gradeCode || undefined,
          returnedQty: Number(it.returnedQty),
          unitPrice: Number(it.unitPrice),
          remark: it.remark || undefined,
        })),
      });
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: 640, background: '#fff', height: '100%', overflowY: 'auto', padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>新建退货单</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        {error && <div style={{ background: '#fef2f2', color: '#ef4444', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {[
            { label: '公司代码 *', field: 'companyCode', ph: 'e.g. HQ' },
            { label: '销售订单号', field: 'salesOrderNo', ph: 'SO-...' },
            { label: '客户代码', field: 'customerCode', ph: '' },
            { label: '客户名称', field: 'customerName', ph: '' },
          ].map(({ label, field, ph }) => (
            <div key={field}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{label}</div>
              <input
                value={(form as Record<string, string>)[field]}
                placeholder={ph}
                onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
          ))}
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>退货类型 *</div>
            <select
              value={form.returnType}
              onChange={e => setForm(p => ({ ...p, returnType: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
            >
              {Object.entries(RETURN_TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>原因代码</div>
            <input
              value={form.reasonCode}
              onChange={e => setForm(p => ({ ...p, reasonCode: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 4, fontSize: 12, color: '#6b7280' }}>备注</div>
        <textarea
          value={form.remark}
          onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
          rows={2}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, marginBottom: 20, boxSizing: 'border-box' }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 600 }}>退货明细</span>
          <button onClick={addItem} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 13 }}>+ 添加</button>
        </div>
        {items.map((it, i) => (
          <div key={i} style={{ background: '#f9fafb', borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 100px', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>产品代码 *</div>
                <input value={it.productCode} onChange={e => updateItem(i, 'productCode', e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>产品名称</div>
                <input value={it.productName} onChange={e => updateItem(i, 'productName', e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>退货数量 *</div>
                <input type="number" min={1} value={it.returnedQty} onChange={e => updateItem(i, 'returnedQty', e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>单价</div>
                <input type="number" min={0} value={it.unitPrice} onChange={e => updateItem(i, 'unitPrice', e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>小计：{fmt(it.returnedQty * it.unitPrice)} {/* currency */}</span>
              {items.length > 1 && (
                <button onClick={() => removeItem(i)} style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }}>删除</button>
              )}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 0', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>取消</button>
          <button onClick={handleCreate} disabled={loading} style={{ flex: 2, padding: '10px 0', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            {loading ? '创建中...' : '创建退货单'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 质检抽屉 ──────────────────────────────────────────────────────────────────

function InspectionDrawer({ order, onClose, onDone }: { order: ReturnOrder; onClose: () => void; onDone: () => void }) {
  const [results, setResults] = useState<Array<{ itemId: string; acceptedQty: number; damagedQty: number; remark: string }>>(
    (order.items || []).map(it => ({ itemId: it.id, acceptedQty: Number(it.returned_qty), damagedQty: 0, remark: '' }))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const update = (i: number, field: string, val: string | number) =>
    setResults(p => p.map((r, idx) => idx === i ? { ...r, [field]: Number(val) } : r));

  const handleSubmit = async () => {
    setLoading(true); setError('');
    try {
      await api('POST', `/api/v2/sales/returns/${order.id}/complete-inspection`, { results });
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: 600, background: '#fff', height: '100%', overflowY: 'auto', padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>质检录入 — {order.return_no}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        {error && <div style={{ background: '#fef2f2', color: '#ef4444', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>{error}</div>}
        <div style={{ background: '#fef3c7', borderRadius: 8, padding: '8px 12px', marginBottom: 20, fontSize: 13 }}>
          ⚠ 安全约束：accepted_qty + damaged_qty ≤ returned_qty，且破损商品不回库存
        </div>
        {(order.items || []).map((item, i) => (
          <div key={item.id} style={{ background: '#f9fafb', borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {item.product_code} {item.product_name && `— ${item.product_name}`}
              {/* Phase H5: SKU 徽章 */}
              {item.sku_code && (
                <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, fontSize: 10, fontFamily: 'monospace', fontWeight: 700, background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.2)' }}>
                  {item.sku_code}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
              申请退货数量：{item.returned_qty} {item.grade_code && `| 等级：${item.grade_code}`}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>合格数量 (回库)</div>
                <input type="number" min={0} value={results[i]?.acceptedQty ?? 0}
                  onChange={e => update(i, 'acceptedQty', e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #10b981', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>破损数量 (损耗)</div>
                <input type="number" min={0} value={results[i]?.damagedQty ?? 0}
                  onChange={e => update(i, 'damagedQty', e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #ef4444', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>备注</div>
                <input value={results[i]?.remark ?? ''}
                  onChange={e => setResults(p => p.map((r, idx) => idx === i ? { ...r, remark: e.target.value } : r))}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>
            {results[i] && (
              <div style={{ marginTop: 8, fontSize: 12, color: (results[i].acceptedQty + results[i].damagedQty) > Number(item.returned_qty) ? '#ef4444' : '#10b981' }}>
                已录入：{results[i].acceptedQty} 合格 + {results[i].damagedQty} 破损 / {item.returned_qty} 申请
                {(results[i].acceptedQty + results[i].damagedQty) > Number(item.returned_qty) && ' ⚠ 超出申请数量！'}
              </div>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 0', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer' }}>取消</button>
          <button onClick={handleSubmit} disabled={loading} style={{ flex: 2, padding: '10px 0', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            {loading ? '提交中...' : '完成质检'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 退货单列表标签 ────────────────────────────────────────────────────────────

function ReturnOrdersTab() {
  const [orders, setOrders] = useState<ReturnOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<ReturnOrder | null>(null);
  const [inspectOrder, setInspectOrder] = useState<ReturnOrder | null>(null);
  const [actionLoading, setActionLoading] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('returnType', typeFilter);
      const res = await api<{ data: ReturnOrder[]; total: number }>('GET', `/api/v2/sales/returns?${params}`);
      setOrders(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally { setLoading(false); }
  }, [page, statusFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const doAction = async (id: string, action: string, body?: unknown) => {
    setActionLoading(id + action);
    try {
      await api('POST', `/api/v2/sales/returns/${id}/${action}`, body);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '操作失败');
    } finally { setActionLoading(''); }
  };

  const openDetail = async (id: string) => {
    try {
      const d = await api<ReturnOrder>('GET', `/api/v2/sales/returns/${id}`);
      setDetail(d);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : '加载失败'); }
  };

  return (
    <div>
      {/* 工具栏 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}>
          <option value="">全部类型</option>
          {Object.entries(RETURN_TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowCreate(true)}
          style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>
          + 新建退货单
        </button>
      </div>

      {error && <div style={{ background: '#fef2f2', color: '#ef4444', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>{error}</div>}

      {/* 列表表格 */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table className={s.table}>
          <thead>
            <tr>
              {['退货单号','类型','客户','金额','状态','创建时间','操作'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>加载中...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>暂无退货单</td></tr>
            ) : orders.map(o => (
              <tr key={o.id}>
                <td>
                  <button onClick={() => openDetail(o.id)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 600, padding: 0, fontSize: 14 }}>
                    {o.return_no}
                  </button>
                  {o.sales_order_no && <div style={{ fontSize: 11, color: '#9ca3af' }}>SO: {o.sales_order_no}</div>}
                </td>
                <td><Badge cfg={RETURN_TYPE_CFG} code={o.return_type} /></td>
                <td>
                  <div style={{ fontWeight: 500 }}>{o.customer_name ?? o.customer_code ?? '—'}</div>
                  {o.customer_code && o.customer_name && <div style={{ fontSize: 11, color: '#9ca3af' }}>{o.customer_code}</div>}
                </td>
                <td>{fmt(o.subtotal)} {o.currency_code}</td>
                <td><Badge cfg={STATUS_CFG} code={o.status} /></td>
                <td style={{ color: '#6b7280' }}>{fmtDate(o.created_at)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {o.status === 'DRAFT' && (
                      <button onClick={() => doAction(o.id, 'submit')} disabled={!!actionLoading}
                        style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
                        提交
                      </button>
                    )}
                    {o.status === 'PENDING_APPROVAL' && (
                      <>
                        <button onClick={() => doAction(o.id, 'approve')} disabled={!!actionLoading}
                          style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
                          批准
                        </button>
                        <button onClick={() => doAction(o.id, 'reject', { reason: '审批拒绝' })} disabled={!!actionLoading}
                          style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
                          拒绝
                        </button>
                      </>
                    )}
                    {o.status === 'INSPECTING' && (
                      <button onClick={() => setInspectOrder(o)} disabled={!!actionLoading}
                        style={{ background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
                        质检录入
                      </button>
                    )}
                    {o.status === 'RESTOCKING' && (
                      <button onClick={() => doAction(o.id, 'complete-restock')} disabled={!!actionLoading}
                        style={{ background: '#06b6d4', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
                        确认回库
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <span style={{ fontSize: 14, color: '#6b7280' }}>共 {total} 条记录</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, cursor: page <= 1 ? 'default' : 'pointer', background: '#fff' }}>上页</button>
          <span style={{ padding: '6px 14px', background: '#f3f4f6', borderRadius: 6, fontSize: 14 }}>第 {page} 页</span>
          <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}
            style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, cursor: page * 20 >= total ? 'default' : 'pointer', background: '#fff' }}>下页</button>
        </div>
      </div>

      {/* 详情抽屉 */}
      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: 640, background: '#fff', height: '100%', overflowY: 'auto', padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{detail.return_no}</h2>
              <button onClick={() => setDetail(null)} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <Badge cfg={STATUS_CFG} code={detail.status} />
              <Badge cfg={RETURN_TYPE_CFG} code={detail.return_type} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { label: '客户', value: `${detail.customer_name ?? ''} ${detail.customer_code ? `(${detail.customer_code})` : ''}` },
                { label: '销售订单号', value: detail.sales_order_no ?? '—' },
                { label: '公司', value: detail.company_code },
                { label: '金额', value: `${fmt(detail.subtotal)} ${detail.currency_code}` },
                { label: '申请时间', value: fmtDate(detail.requested_at) },
                { label: '质检完成', value: fmtDate(detail.inspected_at) },
                { label: '回库完成', value: fmtDate(detail.restocked_at) },
                { label: '完成时间', value: fmtDate(detail.completed_at) },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#f9fafb', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontWeight: 500 }}>{value}</div>
                </div>
              ))}
            </div>
            {detail.credit_note_id && (
              <div style={{ background: '#ecfdf5', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span>
                <span style={{ fontSize: 13 }}>AR Credit Note 已生成（ID: {detail.credit_note_id}）</span>
              </div>
            )}
            {detail.remark && (
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>备注</div>
                <div style={{ fontSize: 14 }}>{detail.remark}</div>
              </div>
            )}
            {/* 明细列表 */}
            <div style={{ fontWeight: 600, marginBottom: 10 }}>退货明细</div>
            {(detail.items || []).map(item => (
              <div key={item.id} style={{ background: '#f9fafb', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>
                    {item.product_code} {item.product_name && `— ${item.product_name}`}
                    {/* Phase H5: SKU 徽章 */}
                    {item.sku_code && (
                      <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, fontSize: 10, fontFamily: 'monospace', fontWeight: 700, background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.2)' }}>
                        {item.sku_code}
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Badge cfg={INSPECTION_CFG} code={item.inspection_result} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, fontSize: 13 }}>
                  <div><span style={{ color: '#9ca3af' }}>申请: </span>{item.returned_qty}</div>
                  <div><span style={{ color: '#10b981' }}>合格: </span>{item.accepted_qty}</div>
                  <div><span style={{ color: '#ef4444' }}>破损: </span>{item.damaged_qty}</div>
                  <div><span style={{ color: '#6b7280' }}>金额: </span>{fmt(item.amount)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCreate && (
        <CreateReturnDrawer
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}

      {inspectOrder && (
        <InspectionDrawer
          order={inspectOrder}
          onClose={() => setInspectOrder(null)}
          onDone={() => { setInspectOrder(null); load(); }}
        />
      )}
    </div>
  );
}

// ── 质检标签 ──────────────────────────────────────────────────────────────────

function InspectionTab() {
  const [orders, setOrders] = useState<ReturnOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspectOrder, setInspectOrder] = useState<ReturnOrder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ data: ReturnOrder[] }>('GET', '/api/v2/sales/returns?status=INSPECTING&limit=50');
      setOrders(res.data ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>待质检退货单</h3>
      {loading ? <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>加载中...</div> : (
        orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>暂无待质检退货单 ✓</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {orders.map(o => (
              <div key={o.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{o.return_no}</span>
                    {o.sales_order_no && <span style={{ color: '#9ca3af', fontSize: 13, marginLeft: 10 }}>SO: {o.sales_order_no}</span>}
                  </div>
                  <Badge cfg={RETURN_TYPE_CFG} code={o.return_type} />
                </div>
                <div style={{ display: 'flex', gap: 20, marginBottom: 12, fontSize: 14, color: '#6b7280' }}>
                  <span>客户：{o.customer_name ?? o.customer_code ?? '—'}</span>
                  <span>金额：{fmt(o.subtotal)} {o.currency_code}</span>
                  <span>明细：{(o.items || []).length} 项</span>
                </div>
                <div style={{ background: '#f9fafb', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                  {(o.items || []).map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                      <span>{item.product_code} {item.product_name && `— ${item.product_name}`}</span>
                      <span>申请退货：{item.returned_qty} 件</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setInspectOrder(o)}
                  style={{ background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>
                  开始质检录入
                </button>
              </div>
            ))}
          </div>
        )
      )}
      {inspectOrder && (
        <InspectionDrawer
          order={inspectOrder}
          onClose={() => setInspectOrder(null)}
          onDone={() => { setInspectOrder(null); load(); }}
        />
      )}
    </div>
  );
}

// ── 回库标签 ──────────────────────────────────────────────────────────────────

function RestockTab() {
  const [orders, setOrders] = useState<ReturnOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ data: ReturnOrder[] }>('GET', '/api/v2/sales/returns?status=RESTOCKING&limit=50');
      setOrders(res.data ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doRestock = async (id: string) => {
    setActionLoading(id);
    try {
      await api('POST', `/api/v2/sales/returns/${id}/complete-restock`);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '操作失败');
    } finally { setActionLoading(''); }
  };

  return (
    <div>
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>待回库退货单</h3>
      {loading ? <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>加载中...</div> : (
        orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>暂无待回库退货单 ✓</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {orders.map(o => (
              <div key={o.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{o.return_no}</span>
                  <Badge cfg={RETURN_TYPE_CFG} code={o.return_type} />
                </div>
                <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 12 }}>
                  客户：{o.customer_name ?? '—'} | 金额：{fmt(o.subtotal)} {o.currency_code}
                </div>
                {/* 明细：展示质检结果 */}
                <div style={{ background: '#f9fafb', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>质检结果：</div>
                  {(o.items || []).map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                      <span>{item.product_code}</span>
                      <span style={{ color: '#10b981' }}>合格回库：{item.accepted_qty}</span>
                      <span style={{ color: '#ef4444' }}>破损损耗：{item.damaged_qty}</span>
                      <Badge cfg={INSPECTION_CFG} code={item.inspection_result} />
                    </div>
                  ))}
                </div>
                <div style={{ background: '#eff6ff', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#3b82f6' }}>
                  📦 确认回库后将自动：回库合格品 + 记录损耗 + 生成 AR Credit Note
                </div>
                <button onClick={() => doRestock(o.id)} disabled={actionLoading === o.id}
                  style={{ background: '#06b6d4', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>
                  {actionLoading === o.id ? '处理中...' : '确认回库 & 生成 Credit Note'}
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ── 异常分析标签 ──────────────────────────────────────────────────────────────

function AnalysisTab() {
  const [data, setData] = useState<ReturnAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<ReturnAnalysis>('GET', '/api/v2/sales/returns/analysis')
      .then(setData)
      .catch(() => {/* ignore */})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>加载中...</div>;
  if (!data) return <div style={{ color: '#ef4444', textAlign: 'center', padding: 40 }}>加载失败</div>;

  const { summary, topCustomers, topProducts } = data;
  const maxCustomerCount = Math.max(1, ...topCustomers.map(c => Number(c.return_count)));
  const maxProductCount  = Math.max(1, ...topProducts.map(p => Number(p.return_count)));

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* 汇总卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
        {[
          { label: '退货总单数', value: summary.totalReturns, color: '#6b7280' },
          { label: '退货总金额', value: `${fmt(summary.totalAmount)}`, color: '#3b82f6' },
          { label: '配送拒收', value: summary.deliveryRejectCount, color: '#f59e0b' },
          { label: '破损退货', value: summary.damageCount, color: '#ef4444' },
          { label: '破损率(30天)', value: summary.damageRate, color: '#8b5cf6' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color, marginBottom: 4 }}>{value}</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* TOP 退货客户 */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>TOP 退货客户（近30天）</h3>
        {topCustomers.length === 0 ? (
          <div style={{ color: '#9ca3af', textAlign: 'center', padding: 20 }}>暂无数据</div>
        ) : topCustomers.map((c, i) => (
          <div key={c.customer_code} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: i < 3 ? '#ef4444' : '#9ca3af', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{c.customer_name ?? c.customer_code}</div>
              <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, marginTop: 4 }}>
                <div style={{ height: '100%', background: '#ef4444', borderRadius: 3, width: `${(Number(c.return_count) / maxCustomerCount) * 100}%`, minWidth: 4 }} />
              </div>
            </div>
            <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>{c.return_count} 单</span>
            <span style={{ fontSize: 13, color: '#ef4444', whiteSpace: 'nowrap' }}>{fmt(c.total_amount)}</span>
          </div>
        ))}
      </div>

      {/* TOP 退货产品 */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>TOP 退货产品（近30天）</h3>
        {topProducts.length === 0 ? (
          <div style={{ color: '#9ca3af', textAlign: 'center', padding: 20 }}>暂无数据</div>
        ) : topProducts.map((p, i) => (
          <div key={p.product_code} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: i < 3 ? '#f59e0b' : '#9ca3af', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{p.product_name ?? p.product_code}</div>
              <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                <span>退货 {p.total_qty} 件</span>
                <span style={{ color: '#ef4444' }}>破损 {p.damaged_qty} 件</span>
              </div>
              <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, marginTop: 4 }}>
                <div style={{ height: '100%', background: '#f59e0b', borderRadius: 3, width: `${(Number(p.return_count) / maxProductCount) * 100}%`, minWidth: 4 }} />
              </div>
            </div>
            <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>{p.return_count} 次</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function SalesReturnsPage() {
  const [activeTab, setActiveTab] = useState<'orders' | 'inspection' | 'restock' | 'analysis'>('orders');
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    api<DashboardStats>('GET', '/api/v2/sales/returns/stats')
      .then(setStats)
      .catch(() => {/* ignore */});
  }, []);

  const tabs: Array<{ key: typeof activeTab; label: string; badge?: number }> = [
    { key: 'orders',     label: '退货单',   badge: undefined },
    { key: 'inspection', label: '质检',     badge: stats?.pendingInspection },
    { key: 'restock',    label: '回库',     badge: stats?.pendingRestock },
    { key: 'analysis',   label: '异常分析', badge: undefined },
  ];

  return (
    <div style={{ padding: 32, background: '#f8fafc', minHeight: '100vh' }}>
      {/* 页头 */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#111827' }}>销售退货管理</h1>
        <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 14 }}>Sales Return Runtime — 退货 · 质检 · 回库 · AR Credit Note</p>
      </div>

      {/* Dashboard 统计 */}
      {stats && (
        <div style={{ ...KPI_GRID, marginBottom: 24 }}>
          {[
            { label: '今日退货单', value: stats.todayTotal, color: '#6b7280' },
            { label: '待审批', value: stats.pendingApproval, color: '#f59e0b' },
            { label: '待质检', value: stats.pendingInspection, color: '#8b5cf6' },
            { label: '待回库', value: stats.pendingRestock, color: '#06b6d4' },
            { label: '今日 Credit Note', value: `${fmt(stats.todayCreditNoteAmount)}`, color: '#ef4444' },
          ].map(({ label, value, color }) => (
            <KpiCard key={label} label={label} value={value} accentColor={hexToAccent(color)} />
          ))}
        </div>
      )}

      {/* 标签页 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '2px solid #e5e7eb', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              padding: '10px 20px', border: 'none', background: 'none',
              borderBottom: activeTab === t.key ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === t.key ? '#3b82f6' : '#6b7280',
              cursor: 'pointer', fontSize: 14, fontWeight: activeTab === t.key ? 700 : 400,
              marginBottom: -2, position: 'relative',
            }}>
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span style={{ marginLeft: 6, background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 11 }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      {activeTab === 'orders'     && <ReturnOrdersTab />}
      {activeTab === 'inspection' && <InspectionTab />}
      {activeTab === 'restock'    && <RestockTab />}
      {activeTab === 'analysis'   && <AnalysisTab />}
    </div>
  );
}
