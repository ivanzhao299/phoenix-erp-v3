/**
 * 公开追溯页 — 消费者扫码后看到的页面（无需登录）
 *
 * URL: /trace/:batchNo  (例如 /trace/BAT-20260513-001)
 * 数据来源：/api/quality/trace/forward?batch_no=  + /api/crud/inv_batches (后备)
 * 设计：移动优先，浅色，最小化网络依赖
 */
import { Suspense } from 'react';

interface PageProps {
  params: Promise<{ batchNo: string }>;
}

interface ForwardTraceResp {
  code?: number;
  batch?: Record<string, unknown> | null;
  summary?: { total_distributed?: number; total_sold?: number; store_count?: number; sale_count?: number };
  ledger?: Record<string, unknown>[];
  sales?: Record<string, unknown>[];
  receiving?: Record<string, unknown>[];
}

const API = process.env.NEXT_PUBLIC_API_BASE || '';

async function fetchTrace(batchNo: string): Promise<ForwardTraceResp | null> {
  try {
    const r = await fetch(`${API}/api/quality/trace/forward?batch_no=${encodeURIComponent(batchNo)}`,
      { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as ForwardTraceResp;
  } catch {
    return null;
  }
}

async function fetchBatchOnly(batchNo: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${API}/api/crud/inv_batches?batch_no=${encodeURIComponent(batchNo)}&limit=1`,
      { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return ((j as { data?: unknown[] }).data?.[0] as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

export default async function TracePage({ params }: PageProps) {
  const { batchNo } = await params;
  return (
    <Suspense fallback={<TraceShell title="加载中…" />}>
      <TraceContent batchNo={batchNo} />
    </Suspense>
  );
}

async function TraceContent({ batchNo }: { batchNo: string }) {
  const raw = await fetchTrace(batchNo);
  const fallback = raw?.batch ? null : await fetchBatchOnly(batchNo);
  const batch = raw?.batch ?? fallback;

  if (!batch) {
    return (
      <TraceShell title="未找到该批次">
        <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--hex-666)' }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>🔎</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>未找到批次「{batchNo}」</div>
          <div style={{ fontSize: 13 }}>请确认二维码或检查批次号是否正确</div>
        </div>
      </TraceShell>
    );
  }

  const get = (k: string) => String(batch[k] ?? '—');
  const summary = raw?.summary;
  const sales = raw?.sales ?? [];

  return (
    <TraceShell title="🥚 凤凰鲜鸡蛋 · 追溯">
      <Card title="📦 批次信息">
        <Row label="批次号"     value={get('batch_no')} mono />
        <Row label="产品"       value={get('product_code')} />
        <Row label="规格 / 等级" value={get('sku_code')} />
        <Row label="生产日期"   value={get('produce_date')} />
        <Row label="保质期至"   value={get('expire_date')} />
        <Row label="状态"       value={statusZh(get('status'))} />
      </Card>

      {summary && (summary.total_distributed || summary.sale_count) ? (
        <Card title="📊 流向汇总">
          <Row label="已发货量" value={String(summary.total_distributed ?? 0)} />
          <Row label="已销售量" value={String(summary.total_sold ?? 0)} />
          <Row label="流向门店" value={String(summary.store_count ?? 0) + ' 家'} />
          <Row label="POS 销售" value={String(summary.sale_count ?? 0) + ' 笔'} />
        </Card>
      ) : null}

      {sales.length > 0 && (
        <Card title="🛒 销售记录">
          {sales.slice(0, 6).map((s, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: i < Math.min(5, sales.length - 1) ? '1px dashed var(--slate-200)' : 'none' }}>
              <div style={{ fontWeight: 600 }}>门店 {String(s.store_code ?? '—')}</div>
              <div style={{ fontSize: 12, color: 'var(--hex-666)', marginTop: 2 }}>
                {String(s.created_at ?? '').slice(0, 10)} · 数量 {String(s.qty ?? '—')}
              </div>
            </div>
          ))}
        </Card>
      )}

      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--hex-999)', margin: '28px 0 8px' }}>
        Phoenix ERP · 食品溯源系统
      </div>
    </TraceShell>
  );
}

function TraceShell({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, var(--status-warning-bg-faint) 0%, var(--bg-card) 60%)', fontFamily: 'system-ui,-apple-system,"Noto Sans SC",sans-serif' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 40px' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--status-warning-dark)', textAlign: 'center', marginBottom: 18 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '18px 18px 14px', marginBottom: 14, boxShadow: '0 4px 16px var(--overlay-black-04)', border: '1px solid var(--status-warning-bg-medium)' }}>
      <div style={{ fontWeight: 700, color: 'var(--status-warning)', marginBottom: 12, fontSize: 14 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', alignItems: 'baseline', borderBottom: '1px dashed var(--gray-100)' }}>
      <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--hex-111)', fontFamily: mono ? 'ui-monospace,monospace' : 'inherit', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

function statusZh(s: string): string {
  return ({
    AVAILABLE:  '✅ 在库',
    ON_SALE:    '🟢 在售',
    OUTBOUND:   '🚚 已出库',
    LOCKED:     '🔒 已锁定',
    SCRAPPED:   '⚠️ 已报废',
    RECALLED:   '🛑 已召回',
    EXPIRED:    '⏰ 已过期',
    QUARANTINE: '🔬 待检',
  })[s] || s;
}
