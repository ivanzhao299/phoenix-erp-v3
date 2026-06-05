'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, RefreshCw, ClipboardList, Save, Send,
  Plus, Trash2, Sun, Moon, Loader2,
} from 'lucide-react';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { getMobileToken, authHeader } from '@/lib/mobile-auth-token';
import { MobilePageSkeleton, SkeletonCard } from '@/components/mobile/MobileSkeleton';

// ── 工具 ──────────────────────────────────────────────────────────────────────

function todayPlusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getUserInfo(): { companyCode: string; companyName: string } {
  if (typeof window === 'undefined') return { companyCode: '', companyName: '' };
  try {
    const u = JSON.parse(localStorage.getItem('auth_user') || '{}');
    return {
      companyCode: u.companyCode ?? u.company_code ?? '',
      companyName: u.companyName ?? u.company_name ?? '',
    };
  } catch {
    return { companyCode: '', companyName: '' };
  }
}

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface LineItem {
  key:                string;
  itemName:           string;
  spec:               string;
  qty:                string;
  unit:               string;
  estimatedUnitPrice: string;
}

interface V2PrRecord {
  id:           number;
  req_no?:      string;
  prNo?:        string;
  subject?:     string;
  status:       string;
  urgency?:     string;
  currency_code?: string;
  currencyCode?:  string;
  created_at?:  string;
  createdAt?:   string;
  total_amount?: number;
  totalAmount?:  number;
}

type Tab = 'form' | 'records';

const STATUS_COLOR: Record<string, string> = {
  DRAFT:       'var(--gray-500)',
  SUBMITTED:   'var(--status-warning)',
  IN_REVIEW:   'var(--status-warning)',
  APPROVED:    'var(--status-info)',
  REJECTED:    'var(--status-danger)',
  PO_CREATED:  'var(--status-success)',
  CANCELLED:   'var(--slate-400)',
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT:       '草稿',
  SUBMITTED:   '待审批',
  IN_REVIEW:   '审批中',
  APPROVED:    '已审批',
  REJECTED:    '已拒绝',
  PO_CREATED:  '已转采购单',
  CANCELLED:   '已取消',
};

function newLine(): LineItem {
  return { key: Math.random().toString(36).slice(2), itemName: '', spec: '', qty: '', unit: '件', estimatedUnitPrice: '' };
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function PrcRequestPage() {
  const router = useRouter();
  const { isDark, toggle, t } = useMobileTheme();
  const { allowed, loading: permLoading, readonly } = useMobilePermission('prc_request');

  const [tab, setTab] = useState<Tab>('form');

  // 头表
  const userInfo = useRef(getUserInfo());
  const [subject,      setSubject]      = useState('');
  const [companyCode,  setCompanyCode]  = useState(userInfo.current.companyCode);
  const [companyName,  setCompanyName]  = useState(userInfo.current.companyName);
  const [projectCode,  setProjectCode]  = useState('');
  const [projectName,  setProjectName]  = useState('');
  const [purchaseType, setPurchaseType] = useState('MATERIAL');
  const [urgency,      setUrgency]      = useState('NORMAL');
  const [currencyCode, setCurrencyCode] = useState('LAK');
  const [expectedDate, setExpectedDate] = useState(todayPlusDays(7));
  const [reason,       setReason]       = useState('');

  // 明细行
  const [items, setItems] = useState<LineItem[]>([newLine()]);

  // UI state
  const [saving,       setSaving]       = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [formError,    setFormError]    = useState('');
  const [formSuccess,  setFormSuccess]  = useState('');

  // 申请记录
  const [records,    setRecords]    = useState<V2PrRecord[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recError,   setRecError]   = useState('');

  // ── 明细计算 ──────────────────────────────────────────────────────────────

  const totalEstimated = items.reduce((sum, row) => {
    const q = parseFloat(row.qty) || 0;
    const p = parseFloat(row.estimatedUnitPrice) || 0;
    return sum + q * p;
  }, 0);

  // ── 明细行操作 ────────────────────────────────────────────────────────────

  const updateItem = (key: string, field: keyof Omit<LineItem, 'key'>, value: string) =>
    setItems(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));

  const addItem = () => setItems(prev => [...prev, newLine()]);

  const removeItem = (key: string) =>
    setItems(prev => prev.length > 1 ? prev.filter(r => r.key !== key) : prev);

  // ── 构建 DTO ──────────────────────────────────────────────────────────────

  function buildDto() {
    return {
      subject:      subject.trim(),
      companyCode:  companyCode.trim(),
      companyName:  companyName.trim(),
      projectCode:  projectCode.trim() || undefined,
      projectName:  projectName.trim() || undefined,
      purchaseType: purchaseType || undefined,
      urgency,
      currencyCode,
      expectedDate: expectedDate || undefined,
      reason:       reason.trim() || undefined,
      items: items.map(r => ({
        itemName:           r.itemName.trim(),
        spec:               r.spec.trim() || undefined,
        qty:                parseFloat(r.qty) || 1,
        unit:               r.unit.trim() || undefined,
        estimatedUnitPrice: r.estimatedUnitPrice ? parseFloat(r.estimatedUnitPrice) : undefined,
        estimatedAmount:    (parseFloat(r.qty) || 0) * (parseFloat(r.estimatedUnitPrice) || 0) || undefined,
      })),
    };
  }

  function validate(): string {
    if (!subject.trim())           return '请填写申请主题';
    if (!companyCode.trim())       return '请填写公司代码';
    if (!companyName.trim())       return '请填写公司名称';
    const emptyItem = items.find(r => !r.itemName.trim());
    if (emptyItem)                 return '请填写所有明细行的物品名称';
    const badQty = items.find(r => !r.qty || parseFloat(r.qty) <= 0);
    if (badQty)                    return '请填写所有明细行的数量（须大于0）';
    return '';
  }

  // ── 保存草稿 ──────────────────────────────────────────────────────────────

  const handleSaveDraft = useCallback(async () => {
    const err = validate();
    if (err) { setFormError(err); return; }
    setSaving(true);
    setFormError('');
    setFormSuccess('');
    try {
      const res  = await fetch('/api/v2/procurement/requests', {
        method:  'POST',
        headers: authHeader(),
        body:    JSON.stringify(buildDto()),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setFormSuccess(`草稿已保存！单号：${json.prNo ?? json.req_no ?? json.id ?? ''}`);
        resetForm();
      } else {
        setFormError(json.message ?? json.msg ?? '保存失败，请重试');
      }
    } catch {
      setFormError('网络错误，请检查连接后重试');
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, companyCode, companyName, projectCode, projectName, purchaseType, urgency, currencyCode, expectedDate, reason, items]);

  // ── 提交审批 ──────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    const err = validate();
    if (err) { setFormError(err); return; }
    setSubmitting(true);
    setFormError('');
    setFormSuccess('');
    try {
      // 1. 创建草稿
      const createRes  = await fetch('/api/v2/procurement/requests', {
        method:  'POST',
        headers: authHeader(),
        body:    JSON.stringify(buildDto()),
      });
      const createJson = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        setFormError(createJson.message ?? createJson.msg ?? '创建申请失败');
        return;
      }
      const prId = createJson.id;

      // 2. 提交审批
      const submitRes  = await fetch(`/api/v2/procurement/requests/${prId}/submit`, {
        method:  'POST',
        headers: authHeader(),
        body:    JSON.stringify({}),
      });
      const submitJson = await submitRes.json().catch(() => ({}));
      if (!submitRes.ok) {
        setFormError(submitJson.message ?? submitJson.msg ?? '提交审批失败');
        return;
      }

      setFormSuccess(`申请已提交审批！单号：${createJson.prNo ?? createJson.req_no ?? prId}`);
      resetForm();
      setTimeout(() => router.push('/mobile/workflow'), 1200);
    } catch {
      setFormError('网络错误，请检查连接后重试');
    } finally {
      setSubmitting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, companyCode, companyName, projectCode, projectName, purchaseType, urgency, currencyCode, expectedDate, reason, items]);

  function resetForm() {
    setSubject(''); setProjectCode(''); setProjectName('');
    setPurchaseType('MATERIAL'); setUrgency('NORMAL'); setCurrencyCode('LAK');
    setExpectedDate(todayPlusDays(7)); setReason('');
    setItems([newLine()]);
  }

  // ── 申请记录（V2） ────────────────────────────────────────────────────────

  const loadRecords = useCallback(async () => {
    setRecLoading(true);
    setRecError('');
    try {
      const res  = await fetch('/api/v2/procurement/requests?pageSize=50', {
        headers: { Authorization: `Bearer ${getMobileToken()}` },
      });
      const json = await res.json().catch(() => ({}));
      setRecords(json.items ?? json.data ?? []);
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

  if (permLoading) return <MobilePageSkeleton title="发起采购申请" tabs={['发起申请', '申请记录']} onBack={() => router.back()} />;
  if (!allowed) return null;

  // ── 样式 ──────────────────────────────────────────────────────────────────

  const inputSt: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    background: t.inputBg, border: `1px solid ${t.inputBorder}`,
    color: t.text, fontSize: 15, outline: 'none', boxSizing: 'border-box',
  };
  const labelSt: React.CSSProperties = {
    fontSize: 13, color: t.textSub, marginBottom: 4, display: 'block',
  };
  const sectionSt: React.CSSProperties = {
    background: t.cardBg, borderRadius: 14,
    border: `1px solid ${t.cardBorder}`, padding: '14px 14px 10px',
    display: 'flex', flexDirection: 'column', gap: 12,
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
          <ClipboardList size={18} color="var(--status-success)" />
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
        <div style={{ background: 'var(--status-warning-bg-faint)', color: 'var(--status-warning)', fontSize: 13, padding: '8px 16px', textAlign: 'center' }}>
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
              background: tab === key ? 'var(--status-success)' : 'transparent',
              color: tab === key ? 'var(--bg-card)' : t.textSub,
              transition: 'all 0.2s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, padding: '14px 16px 80px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── 发起申请 Tab ── */}
        {tab === 'form' && (
          <>
            {/* 基本信息 */}
            <div style={sectionSt}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.textSub, marginBottom: 2 }}>基本信息</div>

              <div>
                <span style={labelSt}>申请主题 *</span>
                <input style={inputSt} value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder="例：5月饲料补充采购" disabled={readonly} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <span style={labelSt}>公司代码 *</span>
                  <input style={inputSt} value={companyCode} onChange={e => setCompanyCode(e.target.value)}
                    placeholder="PHX_AGRI" disabled={readonly} />
                </div>
                <div>
                  <span style={labelSt}>公司名称 *</span>
                  <input style={inputSt} value={companyName} onChange={e => setCompanyName(e.target.value)}
                    placeholder="金凤凰农业" disabled={readonly} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <span style={labelSt}>项目代码</span>
                  <input style={inputSt} value={projectCode} onChange={e => setProjectCode(e.target.value)}
                    placeholder="可选" disabled={readonly} />
                </div>
                <div>
                  <span style={labelSt}>项目名称</span>
                  <input style={inputSt} value={projectName} onChange={e => setProjectName(e.target.value)}
                    placeholder="可选" disabled={readonly} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <span style={labelSt}>采购类型</span>
                  <select style={inputSt} value={purchaseType} onChange={e => setPurchaseType(e.target.value)} disabled={readonly}>
                    <option value="MATERIAL">物料</option>
                    <option value="EQUIPMENT">设备</option>
                    <option value="SERVICE">服务</option>
                    <option value="FIXED_ASSET">固定资产</option>
                    <option value="OTHER">其他</option>
                  </select>
                </div>
                <div>
                  <span style={labelSt}>紧急程度</span>
                  <select style={inputSt} value={urgency} onChange={e => setUrgency(e.target.value)} disabled={readonly}>
                    <option value="NORMAL">普通</option>
                    <option value="URGENT">紧急</option>
                    <option value="CRITICAL">非常紧急</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <span style={labelSt}>货币</span>
                  <select style={inputSt} value={currencyCode} onChange={e => setCurrencyCode(e.target.value)} disabled={readonly}>
                    <option value="LAK">LAK</option>
                    <option value="CNY">CNY</option>
                    <option value="THB">THB</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div>
                  <span style={labelSt}>期望到货日期</span>
                  <input type="date" style={inputSt} value={expectedDate}
                    onChange={e => setExpectedDate(e.target.value)} disabled={readonly} />
                </div>
              </div>

              <div>
                <span style={labelSt}>申请原因</span>
                <textarea
                  style={{ ...inputSt, height: 72, resize: 'none' } as React.CSSProperties}
                  value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="请简述采购需求背景及用途" disabled={readonly}
                />
              </div>
            </div>

            {/* 明细行 */}
            <div style={sectionSt}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: t.textSub }}>采购明细 *</span>
                {!readonly && (
                  <button
                    onClick={addItem}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: 'var(--status-success)', color: 'var(--bg-card)', border: 'none', borderRadius: 8,
                      padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    <Plus size={13} />添加明细
                  </button>
                )}
              </div>

              {items.map((row, idx) => (
                <div key={row.key} style={{
                  background: isDark ? 'var(--slate-800)' : 'var(--slate-50)',
                  borderRadius: 10, padding: '10px 12px',
                  border: `1px solid ${isDark ? 'var(--slate-700)' : 'var(--slate-200)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: t.textSub }}>明细 {idx + 1}</span>
                    {!readonly && items.length > 1 && (
                      <button
                        onClick={() => removeItem(row.key)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-danger)', padding: 2 }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <span style={labelSt}>物品名称 *</span>
                      <input style={inputSt} value={row.itemName}
                        onChange={e => updateItem(row.key, 'itemName', e.target.value)}
                        placeholder="例：大豆粕" disabled={readonly} />
                    </div>

                    <div>
                      <span style={labelSt}>规格型号</span>
                      <input style={inputSt} value={row.spec}
                        onChange={e => updateItem(row.key, 'spec', e.target.value)}
                        placeholder="例：43%蛋白，可选" disabled={readonly} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 8 }}>
                      <div>
                        <span style={labelSt}>数量 *</span>
                        <input type="number" inputMode="decimal" style={inputSt} value={row.qty}
                          onChange={e => updateItem(row.key, 'qty', e.target.value)}
                          placeholder="0" disabled={readonly} />
                      </div>
                      <div>
                        <span style={labelSt}>单位</span>
                        <input style={inputSt} value={row.unit}
                          onChange={e => updateItem(row.key, 'unit', e.target.value)}
                          placeholder="件" disabled={readonly} />
                      </div>
                      <div>
                        <span style={labelSt}>估算单价</span>
                        <input type="number" inputMode="decimal" style={inputSt} value={row.estimatedUnitPrice}
                          onChange={e => updateItem(row.key, 'estimatedUnitPrice', e.target.value)}
                          placeholder="可选" disabled={readonly} />
                      </div>
                    </div>

                    {/* 行小计 */}
                    {row.qty && row.estimatedUnitPrice && (
                      <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--status-success)', fontWeight: 600 }}>
                        小计：{((parseFloat(row.qty) || 0) * (parseFloat(row.estimatedUnitPrice) || 0)).toLocaleString()} {currencyCode}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* 合计 */}
              {totalEstimated > 0 && (
                <div style={{
                  textAlign: 'right', padding: '6px 4px',
                  fontSize: 14, fontWeight: 700, color: t.text,
                }}>
                  预估合计：{totalEstimated.toLocaleString()} {currencyCode}
                </div>
              )}
            </div>

            {/* 错误 / 成功 */}
            {formError && (
              <div style={{ color: 'var(--status-danger)', background: 'var(--status-danger-bg-faint)', padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>
                {formError}
              </div>
            )}
            {formSuccess && (
              <div style={{ color: '#065f46', background: '#d1fae5', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
                ✅ {formSuccess}
              </div>
            )}
          </>
        )}

        {/* ── 申请记录 Tab ── */}
        {tab === 'records' && (
          <div>
            {recLoading && <div>{[1,2,3].map(i => <SkeletonCard key={i} lines={2} />)}</div>}
            {recError && (
              <div style={{ color: 'var(--status-danger)', background: 'var(--status-danger-bg-faint)', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12 }}>
                {recError}
              </div>
            )}
            {!recLoading && records.length === 0 && (
              <div style={{ textAlign: 'center', padding: 60, color: t.textFaint, fontSize: 14 }}>暂无采购申请记录</div>
            )}
            {!recLoading && records.map(row => {
              const st      = (row.status || 'DRAFT').toUpperCase();
              const stColor = STATUS_COLOR[st] ?? 'var(--slate-400)';
              const stLabel = STATUS_LABEL[st] ?? st;
              const createdAt = row.created_at ?? row.createdAt;
              const total     = row.total_amount ?? row.totalAmount;
              return (
                <div key={row.id} style={{
                  background: t.cardBg, borderRadius: 14, padding: '14px 16px',
                  border: `1px solid ${t.cardBorder}`, marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: t.textSub }}>
                        {row.prNo ?? row.req_no ?? `#${row.id}`}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: t.text, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.subject || '—'}
                      </div>
                      {total != null && total > 0 && (
                        <div style={{ fontSize: 13, color: t.textSub, marginTop: 2 }}>
                          预估合计：{total.toLocaleString()} {row.currency_code ?? row.currencyCode ?? ''}
                        </div>
                      )}
                      {createdAt && (
                        <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4 }}>
                          提交时间：{createdAt.slice(0, 16)}
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

      {/* ── 底部操作栏（发起申请 Tab） ── */}
      {tab === 'form' && !readonly && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: t.appBarBg, borderTop: `1px solid ${t.barBorder}`,
          padding: '12px 16px', display: 'flex', gap: 10,
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
        }}>
          <button
            onClick={handleSaveDraft}
            disabled={saving || submitting}
            style={{
              flex: 1, padding: '13px 0', borderRadius: 12, border: `1.5px solid ${isDark ? 'var(--gray-700)' : 'var(--gray-300)'}`,
              background: 'transparent', color: t.text,
              fontSize: 15, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
            {saving ? '保存中…' : '保存草稿'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || submitting}
            style={{
              flex: 2, padding: '13px 0', borderRadius: 12, border: 'none',
              background: submitting ? 'var(--slate-400)' : 'var(--status-success)',
              color: 'var(--bg-card)', fontSize: 15, fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {submitting ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
            {submitting ? '提交中…' : '提交审批'}
          </button>
        </div>
      )}
    </div>
  );
}
