'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, RefreshCw, ClipboardList, Send, Sun, Moon } from 'lucide-react';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { MobilePageSkeleton, SkeletonCard } from '@/components/mobile/MobileSkeleton';

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function todayPlusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}

// ── 状态颜色映射 ──────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  PENDING:    '#f59e0b',
  CONVERTED:  '#10b981',
  REJECTED:   '#ef4444',
  // 兼容 PC 端历史数据
  DRAFT:      '#6b7280',
  SUBMITTED:  '#f59e0b',
  APPROVED:   '#3b82f6',
  PO_CREATED: '#10b981',
};
const STATUS_LABEL: Record<string, string> = {
  PENDING:    '待处理',
  CONVERTED:  '已转采购单',
  REJECTED:   '已拒绝',
  // 兼容 PC 端历史数据
  DRAFT:      '草稿',
  SUBMITTED:  '待审批',
  APPROVED:   '已审批',
  PO_CREATED: '已转采购单',
};

// ── 申请记录类型 ──────────────────────────────────────────────────────────────

interface PrcRequest {
  id: number;
  req_no?: string;
  subject?: string;
  item?: string;
  qty?: string;
  urgency?: string;
  budget_amount?: number;
  currency_code?: string;
  expected_date?: string;
  status: string;
  applicant?: string;
  created_at?: string;
  po_no?: string;
}

// ── Tab 类型 ──────────────────────────────────────────────────────────────────

type Tab = 'form' | 'records';

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function PrcRequestPage() {
  const router = useRouter();
  const { isDark, toggle, t } = useMobileTheme();
  const { allowed, loading: permLoading, readonly } = useMobilePermission('prc_request');

  const [tab, setTab] = useState<Tab>('form');

  // 表单 state
  const [subject,       setSubject]       = useState('');
  const [item,          setItem]          = useState('');
  const [qty,           setQty]           = useState('');
  const [urgency,       setUrgency]       = useState('NORMAL');
  const [budgetAmount,  setBudgetAmount]  = useState('');
  const [currencyCode,  setCurrencyCode]  = useState('LAK');
  const [expectedDate,  setExpectedDate]  = useState(todayPlusDays(7));
  const [reason,        setReason]        = useState('');
  const [submitting,    setSubmitting]    = useState(false);
  const [submitError,   setSubmitError]   = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // 申请记录 state
  const [records,     setRecords]     = useState<PrcRequest[]>([]);
  const [recLoading,  setRecLoading]  = useState(false);
  const [recError,    setRecError]    = useState('');

  // 加载申请记录
  const loadRecords = useCallback(async () => {
    setRecLoading(true);
    setRecError('');
    try {
      const token = getToken();
      const res = await fetch('/api/procurement/purchase-requests', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      setRecords(json.data || []);
    } catch {
      setRecError('申请记录加载失败');
    } finally {
      setRecLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed || permLoading) return;
    if (tab === 'records') loadRecords();
  }, [tab, allowed, permLoading, loadRecords]);

  // 提交申请
  const handleSubmit = useCallback(async () => {
    if (!subject.trim()) { setSubmitError('请填写申请事项'); return; }
    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');
    try {
      const token = getToken();
      const res = await fetch('/api/procurement/purchase-requests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject:        subject.trim(),
          item:           item.trim() || undefined,
          qty:            qty.trim() || undefined,
          urgency,
          budget_amount:  budgetAmount ? Number(budgetAmount) : undefined,
          currency_code:  currencyCode,
          expected_date:  expectedDate || undefined,
          reason:         reason.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setSubmitSuccess(`申请已提交！单号：${json.reqNo || ''}`);
        // 重置表单
        setSubject(''); setItem(''); setQty(''); setUrgency('NORMAL');
        setBudgetAmount(''); setCurrencyCode('LAK');
        setExpectedDate(todayPlusDays(7)); setReason('');
      } else {
        setSubmitError(json.msg || json.message || '提交失败，请重试');
      }
    } catch {
      setSubmitError('网络错误，请检查连接后重试');
    } finally {
      setSubmitting(false);
    }
  }, [subject, item, qty, urgency, budgetAmount, currencyCode, expectedDate, reason]);

  if (permLoading) return <MobilePageSkeleton title="发起采购" tabs={['填写申请', '申请记录']} onBack={() => router.back()} />;
  if (!allowed) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    background: t.inputBg, border: `1px solid ${t.inputBorder}`,
    color: t.text, fontSize: 15, outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 13, color: t.textSub, marginBottom: 4, display: 'block',
  };

  return (
    <div style={{ minHeight: '100svh', background: t.pageBg, display: 'flex', flexDirection: 'column' }}>
      {/* AppBar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', background: t.appBarBg,
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
          <ClipboardList size={18} color="#059669" />
          <span style={{ fontWeight: 700, fontSize: 16, color: t.text }}>发起采购申请</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tab === 'records' && (
            <button onClick={loadRecords} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub }}>
              <RefreshCw size={18} />
            </button>
          )}
          <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub }}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>

      {/* 只读提示 */}
      {readonly && (
        <div style={{ background: '#fef3c7', color: '#92400e', fontSize: 13, padding: '8px 16px', textAlign: 'center' }}>
          只读模式 — 您无权提交采购申请
        </div>
      )}

      {/* Tab 切换 */}
      <div style={{ display: 'flex', margin: '12px 16px 0', background: t.inputBg, borderRadius: 12, padding: 4 }}>
        {([['form', '发起申请'], ['records', '申请记录']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
              background: tab === key ? '#059669' : 'transparent',
              color: tab === key ? '#fff' : t.textSub,
              transition: 'all 0.2s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, padding: '16px 16px 32px', overflowY: 'auto' }}>

        {/* ── 发起申请 Tab ── */}
        {tab === 'form' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* 申请事项 */}
            <div>
              <span style={labelStyle}>申请事项 *</span>
              <input
                style={inputStyle}
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="例：5月饲料补充采购"
                disabled={readonly}
              />
            </div>

            {/* 物品名称/规格 */}
            <div>
              <span style={labelStyle}>物品名称/规格</span>
              <input
                style={inputStyle}
                value={item}
                onChange={e => setItem(e.target.value)}
                placeholder="例：大豆粕 43% 蛋白"
                disabled={readonly}
              />
            </div>

            {/* 数量及单位 */}
            <div>
              <span style={labelStyle}>数量及单位</span>
              <input
                style={inputStyle}
                value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder="例：500kg"
                disabled={readonly}
              />
            </div>

            {/* 紧急程度 */}
            <div>
              <span style={labelStyle}>紧急程度</span>
              <select style={inputStyle} value={urgency} onChange={e => setUrgency(e.target.value)} disabled={readonly}>
                <option value="NORMAL">普通</option>
                <option value="URGENT">紧急</option>
                <option value="CRITICAL">非常紧急</option>
              </select>
            </div>

            {/* 预算金额 + 货币 */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
              <div>
                <span style={labelStyle}>预算金额</span>
                <input
                  type="number"
                  inputMode="numeric"
                  style={inputStyle}
                  value={budgetAmount}
                  onChange={e => setBudgetAmount(e.target.value)}
                  placeholder="0"
                  disabled={readonly}
                />
              </div>
              <div>
                <span style={labelStyle}>货币</span>
                <select style={inputStyle} value={currencyCode} onChange={e => setCurrencyCode(e.target.value)} disabled={readonly}>
                  <option value="LAK">LAK</option>
                  <option value="CNY">CNY</option>
                  <option value="THB">THB</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>

            {/* 期望到货日期 */}
            <div>
              <span style={labelStyle}>期望到货日期</span>
              <input
                type="date"
                style={inputStyle}
                value={expectedDate}
                onChange={e => setExpectedDate(e.target.value)}
                disabled={readonly}
              />
            </div>

            {/* 申请原因 */}
            <div>
              <span style={labelStyle}>申请原因</span>
              <textarea
                style={{ ...inputStyle, height: 80, resize: 'none' }}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="请简述采购需求背景及用途"
                disabled={readonly}
              />
            </div>

            {/* 错误 / 成功提示 */}
            {submitError && (
              <div style={{ color: '#ef4444', background: '#fef2f2', padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>
                {submitError}
              </div>
            )}
            {submitSuccess && (
              <div style={{ color: '#065f46', background: '#d1fae5', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
                ✅ {submitSuccess}
              </div>
            )}

            {/* 提交按钮 */}
            {!readonly && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
                  background: submitting ? '#94a3b8' : '#059669',
                  color: '#fff', fontSize: 16, fontWeight: 700,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Send size={18} />
                {submitting ? '提交中…' : '提交采购申请'}
              </button>
            )}
          </div>
        )}

        {/* ── 申请记录 Tab ── */}
        {tab === 'records' && (
          <div>
            {recLoading && (
              <div>{[1,2,3].map(i => <SkeletonCard key={i} lines={2} />)}</div>
            )}
            {recError && (
              <div style={{ color: '#ef4444', background: '#fef2f2', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12 }}>
                {recError}
              </div>
            )}
            {!recLoading && records.length === 0 && (
              <div style={{ textAlign: 'center', padding: 60, color: t.textFaint, fontSize: 14 }}>暂无采购申请记录</div>
            )}
            {!recLoading && records.map(row => {
              const st = (row.status || 'PENDING').toUpperCase();
              const stColor = STATUS_COLOR[st] ?? '#94a3b8';
              const stLabel = STATUS_LABEL[st] ?? st;
              return (
                <div key={row.id} style={{
                  background: t.cardBg, borderRadius: 14, padding: '14px 16px',
                  border: `1px solid ${t.cardBorder}`, marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: t.textSub }}>
                        {row.req_no || `#${row.id}`}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: t.text, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.subject || '—'}
                      </div>
                      {row.item && (
                        <div style={{ fontSize: 13, color: t.textSub, marginTop: 2 }}>
                          {row.item}{row.qty ? ` · ${row.qty}` : ''}
                        </div>
                      )}
                      {row.created_at && (
                        <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4 }}>
                          提交时间：{row.created_at.slice(0, 16)}
                        </div>
                      )}
                      {row.po_no && (
                        <div style={{ fontSize: 11, color: '#059669', marginTop: 2 }}>
                          → 采购单：{row.po_no}
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                      background: `${stColor}22`, color: stColor, flexShrink: 0, marginLeft: 8,
                    }}>
                      {stLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
