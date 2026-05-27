'use client';
import React, { useState, useEffect, useCallback } from 'react';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface InvBatch {
  batch_no: string;
  product_code: string;
  company_code: string;
  qty: number;
  qty_available: number;
  status: string;
  egg_date: string | null;
  expire_date: string | null;
  quality_grade: string | null;
  packaging_spec: string | null;
  source_type: string | null;
  source_no: string | null;
  created_at: string;
  days_remaining?: number;
}

interface DashboardStats {
  activeBatches: number;
  totalAvailable: number;
  expiringBatches: number;
  expiringQty: number;
  expiredBatches: number;
  returnedBatches: number;
  todayExpireLoss: number;
  todayDamageLoss: number;
}

interface LossAnalysis {
  byType: Array<{ change_type: string; total_loss: number; batch_count: number }>;
  byBatch: Array<{ batch_no: string; product_code: string; total_loss: number; last_event: string }>;
  summary: { total_expire_loss: number; total_damage_loss: number; total_loss: number };
}

// ── API helper ────────────────────────────────────────────────────────────────

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(`/api/v2/sales/inventory${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

function fmt(n: number | null | undefined, dec = 0): string {
  if (n == null) return '—';
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function gradeColor(grade: string | null): string {
  const map: Record<string, string> = {
    AA: '#2563eb', A: '#16a34a', B: '#d97706',
    DIRTY: '#9333ea', CRACKED: '#dc2626', DAMAGED: '#be123c',
  };
  return map[grade ?? ''] ?? '#6b7280';
}

function statusBadge(status: string): React.ReactNode {
  const cfg: Record<string, { label: string; color: string }> = {
    AVAILABLE:   { label: '可用', color: '#16a34a' },
    LOCKED:      { label: '锁定', color: '#d97706' },
    RETURNED:    { label: '退货待检', color: '#9333ea' },
    EXPIRED:     { label: '已过期', color: '#dc2626' },
    WRITTEN_OFF: { label: '已核销', color: '#6b7280' },
  };
  const c = cfg[status] ?? { label: status, color: '#6b7280' };
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 12,
      fontSize: 11, fontWeight: 600, background: c.color + '22', color: c.color, border: `1px solid ${c.color}55`,
    }}>{c.label}</span>
  );
}

// ── 仪表盘统计卡 ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
      padding: '16px 20px', minWidth: 140,
    }}>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? '#111827' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Tab: 批次库存 ─────────────────────────────────────────────────────────────

function BatchesTab() {
  const [batches, setBatches] = useState<InvBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [productCode, setProductCode] = useState('EGG');
  const [gradeCode, setGradeCode] = useState('');
  const [companyCode, setCompanyCode] = useState('');

  // 手动创建批次
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    companyCode: '', eggDate: '', qualityGrade: 'AA',
    packagingSpec: '', productCode: 'EGG', qty: '', shelfDays: '30', sourceNo: '',
  });
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ productCode });
      if (gradeCode) params.set('gradeCode', gradeCode);
      if (companyCode) params.set('companyCode', companyCode);
      const data = await api<InvBatch[]>('GET', `/batches?${params}`);
      setBatches(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [productCode, gradeCode, companyCode]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true); setCreateErr('');
    try {
      await api('POST', '/batches', {
        companyCode: form.companyCode,
        eggDate: form.eggDate,
        qualityGrade: form.qualityGrade || undefined,
        packagingSpec: form.packagingSpec || undefined,
        productCode: form.productCode,
        qty: Number(form.qty),
        shelfDays: form.shelfDays ? Number(form.shelfDays) : undefined,
        sourceNo: form.sourceNo || undefined,
      });
      setShowCreate(false);
      load();
    } catch (e: unknown) {
      setCreateErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      {/* 搜索栏 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={productCode} onChange={e => setProductCode(e.target.value)}
          placeholder="产品代码" style={inputStyle} />
        <select value={gradeCode} onChange={e => setGradeCode(e.target.value)} style={inputStyle}>
          <option value="">所有等级</option>
          {['AA','A','B','DIRTY','CRACKED','DAMAGED'].map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <input value={companyCode} onChange={e => setCompanyCode(e.target.value)}
          placeholder="公司/农场代码" style={inputStyle} />
        <button onClick={load} style={btnStyle('#2563eb')}>查询</button>
        <button onClick={() => setShowCreate(true)} style={btnStyle('#16a34a')}>+ 创建批次</button>
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}

      {/* 创建批次表单 */}
      {showCreate && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10,
          padding: 20, marginBottom: 16,
        }}>
          <h4 style={{ margin: '0 0 12px', color: '#15803d' }}>创建生产批次</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {([
              ['公司代码', 'companyCode', 'text'],
              ['产品代码', 'productCode', 'text'],
              ['生产日期', 'eggDate', 'date'],
              ['数量（枚）', 'qty', 'number'],
              ['保质天数', 'shelfDays', 'number'],
              ['来源单号', 'sourceNo', 'text'],
              ['包装规格', 'packagingSpec', 'text'],
            ] as const).map(([label, key, type]) => (
              <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 13 }}>
                {label}
                <input type={type} value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={inputStyle} />
              </label>
            ))}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 13 }}>
              质量等级
              <select value={form.qualityGrade} onChange={e => setForm(p => ({ ...p, qualityGrade: e.target.value }))}
                style={inputStyle}>
                {['AA','A','B','DIRTY','CRACKED','DAMAGED'].map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </label>
          </div>
          {createErr && <div style={{ color: '#dc2626', marginTop: 8 }}>{createErr}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={handleCreate} disabled={creating} style={btnStyle('#16a34a')}>
              {creating ? '创建中...' : '确认创建'}
            </button>
            <button onClick={() => setShowCreate(false)} style={btnStyle('#6b7280')}>取消</button>
          </div>
        </div>
      )}

      {/* 批次表格 */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>加载中...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['批次号','产品代码','等级','公司','可用量','总量','状态','生产日期','到期日','来源'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>暂无数据</td></tr>
              )}
              {batches.map(b => (
                <tr key={b.batch_no} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdStyle}><code style={{ fontSize: 11 }}>{b.batch_no}</code></td>
                  <td style={tdStyle}>{b.product_code}</td>
                  <td style={tdStyle}>
                    <span style={{ color: gradeColor(b.quality_grade), fontWeight: 600 }}>
                      {b.quality_grade ?? '—'}
                    </span>
                  </td>
                  <td style={tdStyle}>{b.company_code}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#2563eb' }}>{fmt(b.qty_available)}</td>
                  <td style={tdStyle}>{fmt(b.qty)}</td>
                  <td style={tdStyle}>{statusBadge(b.status)}</td>
                  <td style={tdStyle}>{b.egg_date ?? '—'}</td>
                  <td style={{
                    ...tdStyle,
                    color: b.expire_date && new Date(b.expire_date) < new Date() ? '#dc2626' : '#374151',
                    fontWeight: b.expire_date && new Date(b.expire_date) < new Date() ? 700 : 400,
                  }}>{b.expire_date ?? '—'}</td>
                  <td style={tdStyle}>{b.source_no ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab: 临期库存 ─────────────────────────────────────────────────────────────

function ExpiringTab() {
  const [batches, setBatches] = useState<InvBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState(7);
  const [companyCode, setCompanyCode] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (companyCode) params.set('companyCode', companyCode);
      const data = await api<InvBatch[]>('GET', `/expiring?${params}`);
      setBatches(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [days, companyCode]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <label style={{ fontSize: 13 }}>
          预警天数：
          <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ ...inputStyle, marginLeft: 6 }}>
            {[3, 5, 7, 10, 14].map(d => <option key={d} value={d}>{d} 天</option>)}
          </select>
        </label>
        <input value={companyCode} onChange={e => setCompanyCode(e.target.value)}
          placeholder="公司代码" style={inputStyle} />
        <button onClick={load} style={btnStyle('#d97706')}>查询</button>
      </div>
      {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>加载中...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#fffbeb' }}>
                {['批次号','产品','等级','公司','可用量','到期日','剩余天数','状态'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>无临期库存</td></tr>
              )}
              {batches.map(b => {
                const daysLeft = (b as any).days_remaining ?? 0;
                const urgent = daysLeft <= 3;
                return (
                  <tr key={b.batch_no} style={{
                    borderBottom: '1px solid #fef3c7',
                    background: urgent ? '#fff1f2' : '#fffbeb',
                  }}>
                    <td style={tdStyle}><code style={{ fontSize: 11 }}>{b.batch_no}</code></td>
                    <td style={tdStyle}>{b.product_code}</td>
                    <td style={tdStyle}>
                      <span style={{ color: gradeColor(b.quality_grade), fontWeight: 600 }}>
                        {b.quality_grade ?? '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>{b.company_code}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{fmt(b.qty_available)}</td>
                    <td style={tdStyle}>{b.expire_date ?? '—'}</td>
                    <td style={{ ...tdStyle, color: urgent ? '#dc2626' : '#d97706', fontWeight: 700 }}>
                      {daysLeft} 天 {urgent && '⚠ 紧急'}
                    </td>
                    <td style={tdStyle}>{statusBadge(b.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab: FIFO 出库 ────────────────────────────────────────────────────────────

function FifoTab() {
  const [form, setForm] = useState({
    productCode: 'EGG', gradeCode: '', companyCode: '', qty: '', refNo: '', note: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const handleAllocate = async () => {
    if (!form.productCode || !form.companyCode || !form.qty || !form.refNo) {
      setError('请填写产品代码、公司代码、数量和单号'); return;
    }
    setLoading(true); setError(''); setResult(null);
    try {
      const data = await api<Record<string, unknown>>('POST', '/allocate', {
        productCode: form.productCode,
        gradeCode: form.gradeCode || undefined,
        companyCode: form.companyCode,
        qty: Number(form.qty),
        refNo: form.refNo,
        note: form.note || '手动分配',
      });
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h4 style={{ marginTop: 0, color: '#374151' }}>手动 FIFO 分配（测试 / 调整用）</h4>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
        系统在销售订单审批通过时自动执行 FIFO 预留，此页面仅供管理员手动调整。
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {([
          ['产品代码', 'productCode', 'text'],
          ['公司代码', 'companyCode', 'text'],
          ['分配数量', 'qty', 'number'],
          ['参考单号', 'refNo', 'text'],
          ['备注', 'note', 'text'],
        ] as const).map(([label, key, type]) => (
          <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 13 }}>
            {label}
            <input type={type} value={(form as any)[key]}
              onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
              style={inputStyle} />
          </label>
        ))}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 13 }}>
          质量等级（可选）
          <select value={form.gradeCode} onChange={e => setForm(p => ({ ...p, gradeCode: e.target.value }))}
            style={inputStyle}>
            <option value="">不限等级</option>
            {['AA','A','B'].map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
      </div>
      {error && <div style={{ color: '#dc2626', marginTop: 10 }}>{error}</div>}
      <button onClick={handleAllocate} disabled={loading}
        style={{ ...btnStyle('#2563eb'), marginTop: 16 }}>
        {loading ? '分配中...' : '执行 FIFO 分配'}
      </button>
      {result && (
        <div style={{
          marginTop: 16, background: '#f0fdf4', border: '1px solid #86efac',
          borderRadius: 8, padding: 16, fontSize: 13,
        }}>
          <strong style={{ color: '#15803d' }}>分配成功</strong>
          <pre style={{ margin: '8px 0 0', fontSize: 12, overflow: 'auto' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Tab: 损耗分析 ─────────────────────────────────────────────────────────────

function LossTab() {
  const [data, setData] = useState<LossAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [companyCode, setCompanyCode] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = companyCode ? `?companyCode=${companyCode}` : '';
      const res = await api<LossAnalysis>('GET', `/loss-analysis${params}`);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [companyCode]);

  useEffect(() => { load(); }, [load]);

  const changeTypeLabel: Record<string, string> = {
    EXPIRE_WRITEOFF: '过期核销',
    DAMAGE_WRITEOFF: '破损核销',
    WRITE_OFF: '手动核销',
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <input value={companyCode} onChange={e => setCompanyCode(e.target.value)}
          placeholder="公司代码（可选）" style={inputStyle} />
        <button onClick={load} style={btnStyle('#7c3aed')}>刷新</button>
      </div>
      {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>加载中...</div>
      ) : data && (
        <div>
          {/* 汇总卡 */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <StatCard label="30日过期损耗（枚）" value={fmt(data.summary.total_expire_loss)} color="#dc2626" />
            <StatCard label="30日破损损耗（枚）" value={fmt(data.summary.total_damage_loss)} color="#d97706" />
            <StatCard label="30日合计损耗（枚）" value={fmt(data.summary.total_loss)} color="#7c3aed" />
          </div>

          {/* 按类型明细 */}
          <h4 style={{ color: '#374151', marginBottom: 8 }}>按损耗类型（近30天）</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 24 }}>
            <thead>
              <tr style={{ background: '#faf5ff' }}>
                {['损耗类型','批次数','合计损耗（枚）'].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {(data.byType ?? []).map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdStyle}>{changeTypeLabel[row.change_type] ?? row.change_type}</td>
                  <td style={tdStyle}>{fmt(row.batch_count)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#dc2626' }}>{fmt(row.total_loss)}</td>
                </tr>
              ))}
              {(data.byType ?? []).length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>近30天无损耗记录</td></tr>
              )}
            </tbody>
          </table>

          {/* 按批次明细 */}
          <h4 style={{ color: '#374151', marginBottom: 8 }}>按批次损耗排名（近30天）</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#faf5ff' }}>
                {['批次号','产品代码','合计损耗','最后事件时间'].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {(data.byBatch ?? []).slice(0, 20).map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdStyle}><code style={{ fontSize: 11 }}>{row.batch_no}</code></td>
                  <td style={tdStyle}>{row.product_code}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#dc2626' }}>{fmt(row.total_loss)}</td>
                  <td style={tdStyle}>{row.last_event ? new Date(row.last_event).toLocaleString('zh-CN') : '—'}</td>
                </tr>
              ))}
              {(data.byBatch ?? []).length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>暂无数据</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── 共用样式 ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13,
  outline: 'none', background: '#fff',
};
const thStyle: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12,
  color: '#374151', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '8px 12px', fontSize: 13, color: '#374151', verticalAlign: 'middle',
};
function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: '6px 14px', background: bg, color: '#fff', border: 'none',
    borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
  };
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'batches',  label: '批次库存' },
  { key: 'expiring', label: '临期库存' },
  { key: 'fifo',     label: 'FIFO 出库' },
  { key: 'loss',     label: '损耗分析' },
];

export default function InventoryPage() {
  const [tab, setTab] = useState<string>('batches');
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    api<DashboardStats>('GET', '/stats').then(setStats).catch(() => {});
  }, []);

  return (
    <div style={{ padding: 24, background: '#f9fafb', minHeight: '100vh' }}>
      {/* 页头 */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111827' }}>
          库存管理 — 鸡蛋库存 Runtime
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
          FIFO 先进先出 · 到期预警 · 损耗分析 · Phase 7
        </p>
      </div>

      {/* 仪表盘统计 */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <StatCard label="活跃批次" value={stats.activeBatches} />
          <StatCard label="总可用库存（枚）" value={fmt(stats.totalAvailable)} color="#2563eb" />
          <StatCard label="临期批次（≤7天）" value={stats.expiringBatches} color="#d97706" sub={`${fmt(stats.expiringQty)} 枚`} />
          <StatCard label="已过期批次" value={stats.expiredBatches} color="#dc2626" />
          <StatCard label="退货待检批次" value={stats.returnedBatches} color="#9333ea" />
          <StatCard label="今日过期损耗（枚）" value={fmt(stats.todayExpireLoss)} color="#be123c" />
          <StatCard label="今日破损损耗（枚）" value={fmt(stats.todayDamageLoss)} color="#b45309" />
        </div>
      )}

      {/* 标签页 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e5e7eb' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 18px', border: 'none', borderRadius: '6px 6px 0 0',
            cursor: 'pointer', fontSize: 14, fontWeight: 600,
            background: tab === t.key ? '#2563eb' : 'transparent',
            color: tab === t.key ? '#fff' : '#6b7280',
            borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent',
            marginBottom: -2,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 }}>
        {tab === 'batches'  && <BatchesTab />}
        {tab === 'expiring' && <ExpiringTab />}
        {tab === 'fifo'     && <FifoTab />}
        {tab === 'loss'     && <LossTab />}
      </div>
    </div>
  );
}
