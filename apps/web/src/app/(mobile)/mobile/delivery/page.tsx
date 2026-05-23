'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, RefreshCw, Truck, ClipboardList, X, Sun, Moon } from 'lucide-react';
import { crudApi } from '@/lib/api-client';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { MobilePageSkeleton, SkeletonCard, MobileEmptyState } from '@/components/mobile/MobileSkeleton';
import { useToast } from '@/contexts/ToastContext';
import { haptic } from '@/lib/haptic';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

// ── helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Tab = 'waves' | 'receipts';

interface Dispatch {
  id: number | string;
  dispatch_no?: string;
  plate_no?: string;
  driver?: string;
  driver_id?: string;
  date?: string;
  route?: string;
  stores?: string;
  status: string;
}

interface Receipt {
  id: number | string;
  receipt_no?: string;
  dispatch_no?: string;
  store_code?: string;
  receive_date?: string;
  qty?: number;
  status: string;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING:    '#f59e0b',
  IN_TRANSIT: '#3b82f6',
  SIGNED:     '#10b981',
  EXCEPTION:  '#ef4444',
  COMPLETED:  '#10b981',
};

// ── ReceiptForm ───────────────────────────────────────────────────────────────

function ReceiptForm({
  waveNo, onClose, onSaved, readonly,
}: {
  waveNo: string;
  onClose: () => void;
  onSaved: () => void;
  readonly: boolean;
}) {
  const { t, isDark } = useMobileTheme();
  const toast = useToast();
  const today = todayStr();

  const [storeCode,   setStoreCode]   = useState('');
  const [receiveDate, setReceiveDate] = useState(today);
  const [qty,         setQty]         = useState('');
  const [status,      setStatus]      = useState('SIGNED');
  const [remark,      setRemark]      = useState('');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');

  const handleSave = useCallback(async () => {
    if (!storeCode.trim()) { setError('请填写门店编码'); return; }
    if (!qty || Number(qty) <= 0) { setError('请填写有效的签收数量'); return; }
    setSaving(true);
    setError('');
    try {
      await crudApi.create('log_receipts', {
        dispatch_no:  waveNo,
        store_code:   storeCode.trim(),
        receive_date: receiveDate,
        qty:          Number(qty),
        status,
        remark:       remark.trim() || undefined,
      });
      haptic('success');
      toast.success('签收记录已提交');
      onSaved();
    } catch (e: unknown) {
      haptic('error');
      const msg = e instanceof Error ? e.message : '提交失败';
      toast.error(msg || '提交失败');
      setError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }, [waveNo, storeCode, receiveDate, qty, status, remark, onSaved]);

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    background: t.inputBg, border: `1px solid ${t.inputBorder}`,
    color: t.text, fontSize: 15, outline: 'none', boxSizing: 'border-box' as const,
  };
  const labelStyle = { fontSize: 13, color: t.textSub, marginBottom: 4, display: 'block' as const };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-end', zIndex: 100,
    }}>
      <div style={{
        width: '100%', background: isDark ? '#1e293b' : '#ffffff',
        borderRadius: '20px 20px 0 0', padding: '20px 20px 32px',
        maxHeight: '85svh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: t.text }}>
            录入签收 — {waveNo}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.textSub, cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <span style={labelStyle}>门店编码 *</span>
            <input style={inputStyle} value={storeCode} onChange={e => setStoreCode(e.target.value)} placeholder="如：S001" disabled={readonly} />
          </div>
          <div>
            <span style={labelStyle}>签收日期</span>
            <input type="date" style={inputStyle} value={receiveDate} onChange={e => setReceiveDate(e.target.value)} disabled={readonly} />
          </div>
          <div>
            <span style={labelStyle}>签收数量 *</span>
            <input type="number" inputMode="numeric" min="0" style={inputStyle} value={qty} onChange={e => setQty(e.target.value)} placeholder="0" disabled={readonly} />
          </div>
          <div>
            <span style={labelStyle}>状态</span>
            <select style={inputStyle} value={status} onChange={e => setStatus(e.target.value)} disabled={readonly}>
              <option value="SIGNED">已签收</option>
              <option value="EXCEPTION">签收异常</option>
              <option value="PENDING">待签收</option>
            </select>
          </div>
          <div>
            <span style={labelStyle}>备注</span>
            <textarea style={{ ...inputStyle, height: 72, resize: 'none' }} value={remark} onChange={e => setRemark(e.target.value)} placeholder="可填写异常情况" disabled={readonly} />
          </div>

          {error && (
            <div style={{ color: '#ef4444', fontSize: 13, background: '#fef2f2', padding: '8px 12px', borderRadius: 8 }}>
              {error}
            </div>
          )}

          {!readonly && (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                background: saving ? '#94a3b8' : '#0891b2',
                color: '#fff', fontSize: 16, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? '保存中…' : '提交签收'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── WaveCard ──────────────────────────────────────────────────────────────────

function WaveCard({ wave, onSign, readonly }: {
  wave: Dispatch;
  onSign: (wave_no: string) => void;
  readonly: boolean;
}) {
  const { t } = useMobileTheme();
  const statusColor = STATUS_COLOR[wave.status] ?? '#94a3b8';

  const dispatchNo = wave.dispatch_no ?? String(wave.id);

  return (
    <div style={{
      background: t.cardBg, borderRadius: 14, padding: '14px 16px',
      border: `1px solid ${t.cardBorder}`, marginBottom: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: t.text }}>{dispatchNo}</div>
          {wave.plate_no && (
            <div style={{ fontSize: 13, color: t.textSub, marginTop: 2 }}>
              车牌：{wave.plate_no}
              {wave.driver && <span>　司机：{wave.driver}</span>}
            </div>
          )}
          {wave.date && (
            <div style={{ fontSize: 12, color: t.textFaint, marginTop: 2 }}>日期：{wave.date}</div>
          )}
          {wave.route && (
            <div style={{ fontSize: 12, color: t.textFaint }}>线路：{wave.route}</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: `${statusColor}20`, color: statusColor,
          }}>
            {wave.status}
          </span>
          {!readonly && (
            <button
              onClick={() => onSign(dispatchNo)}
              style={{
                fontSize: 13, fontWeight: 600, padding: '5px 12px', borderRadius: 20,
                background: '#0891b2', color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >
              录入签收
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ReceiptCard ───────────────────────────────────────────────────────────────

function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const { t } = useMobileTheme();
  const statusColor = STATUS_COLOR[receipt.status] ?? '#94a3b8';

  return (
    <div style={{
      background: t.cardBg, borderRadius: 14, padding: '14px 16px',
      border: `1px solid ${t.cardBorder}`, marginBottom: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: t.text }}>
            {receipt.receipt_no ?? `#${receipt.id}`}
          </div>
          {receipt.dispatch_no && (
            <div style={{ fontSize: 13, color: t.textSub, marginTop: 2 }}>配送单：{receipt.dispatch_no}</div>
          )}
          {receipt.store_code && (
            <div style={{ fontSize: 13, color: t.textSub }}>门店：{receipt.store_code}</div>
          )}
          {receipt.receive_date && (
            <div style={{ fontSize: 12, color: t.textFaint, marginTop: 2 }}>{receipt.receive_date}</div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0891b2' }}>
            {receipt.qty ?? 0}
          </div>
          <div style={{ fontSize: 11, color: t.textFaint }}>件</div>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            background: `${statusColor}20`, color: statusColor, marginTop: 4, display: 'inline-block',
          }}>
            {receipt.status}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── DeliveryPage ──────────────────────────────────────────────────────────────

export default function DeliveryPage() {
  const router = useRouter();
  const today  = todayStr();
  const { isDark, toggle, t } = useMobileTheme();
  const { allowed, loading: permLoading, readonly } = useMobilePermission('delivery');
  const toast = useToast();

  const [tab,      setTab]      = useState<Tab>('waves');
  const [waves,    setWaves]    = useState<Dispatch[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [formWave, setFormWave] = useState<string | null>(null);

  const loadWaves = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await crudApi.list<Dispatch>('log_dispatch', { limit: 50 });
      setWaves((res.data ?? []) as Dispatch[]);
    } catch {
      setError('波次数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReceipts = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await crudApi.list<Receipt>('log_receipts', { limit: 50 });
      setReceipts((res.data ?? []) as Receipt[]);
    } catch {
      setError('签收数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed || permLoading) return;
    if (tab === 'waves') loadWaves();
    else loadReceipts();
  }, [tab, allowed, permLoading, loadWaves, loadReceipts]);

  const { pullHandlers } = usePullToRefresh(() => {
    if (tab === 'waves') loadWaves();
    else loadReceipts();
  });

  const handleSaved = useCallback(() => {
    setFormWave(null);
    loadReceipts();
    setTab('receipts');
  }, [loadReceipts]);

  if (permLoading) return <MobilePageSkeleton title="配送签收" tabs={['配送波次', '签收记录']} onBack={() => router.back()} />;
  if (!allowed) return null;

  return (
    <div style={{ minHeight: '100svh', background: t.pageBg, display: 'flex', flexDirection: 'column' }}>
      {/* AppBar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'calc(env(safe-area-inset-top) + 12px) 16px 12px', background: t.appBarBg,
        borderBottom: `1px solid ${t.barBorder}`, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => router.push('/mobile/home')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub, display: 'flex', alignItems: 'center', gap: 4 }}>
          <ChevronLeft size={20} />
          <span style={{ fontSize: 14 }}>返回</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Truck size={18} color="#0891b2" />
          <span style={{ fontWeight: 700, fontSize: 16, color: t.text }}>配送签收</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => tab === 'waves' ? loadWaves() : loadReceipts()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub }}>
            <RefreshCw size={18} />
          </button>
          <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub }}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>

      {/* 只读提示 */}
      {readonly && (
        <div style={{ background: '#fef3c7', color: '#92400e', fontSize: 13, padding: '8px 16px', textAlign: 'center' }}>
          只读模式 — 您无权录入签收数据
        </div>
      )}

      {/* 日期标题 */}
      <div style={{ padding: '12px 16px 4px', color: t.textSub, fontSize: 13 }}>
        今日：{today}
      </div>

      {/* Tab */}
      <div style={{ display: 'flex', margin: '0 16px 12px', background: t.inputBg, borderRadius: 12, padding: 4 }}>
        {([['waves', '配送波次', Truck], ['receipts', '签收记录', ClipboardList]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              background: tab === key ? '#0891b2' : 'transparent',
              color: tab === key ? '#fff' : t.textSub,
              transition: 'all 0.2s',
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div {...pullHandlers} style={{ flex: 1, padding: '0 16px calc(24px + env(safe-area-inset-bottom))', overflowY: 'auto' }}>
        {loading && (
          <div style={{ paddingTop: 8 }}>{[1,2,3].map(i => <SkeletonCard key={i} lines={3} />)}</div>
        )}
        {error && (
          <div style={{ color: '#ef4444', background: '#fef2f2', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {!loading && tab === 'waves' && (
          waves.length === 0
            ? <MobileEmptyState icon="🚚" title="暂无配送波次" desc="今日还没有安排配送" />
            : waves.map(w => (
              <WaveCard key={w.id} wave={w} onSign={setFormWave} readonly={readonly} />
            ))
        )}

        {!loading && tab === 'receipts' && (
          receipts.length === 0
            ? <MobileEmptyState icon="📋" title="暂无签收记录" desc="还没有录入签收数据" />
            : receipts.map(r => (
              <ReceiptCard key={r.id} receipt={r} />
            ))
        )}
      </div>

      {/* 签收录入 Sheet */}
      {formWave && (
        <ReceiptForm
          waveNo={formWave}
          onClose={() => setFormWave(null)}
          onSaved={handleSaved}
          readonly={readonly}
        />
      )}
    </div>
  );
}
