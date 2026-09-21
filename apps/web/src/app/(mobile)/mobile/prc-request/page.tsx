'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useRouter } from 'next/navigation';
import { ChevronLeft, RefreshCw, ClipboardList, Save, Send, Plus, Trash2, Sun, Moon, Loader2 } from 'lucide-react';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import { getMobileToken, authHeader } from '@/lib/mobile-auth-token';
import { mobileApi } from '@/lib/mobile-api';
import { MobilePageSkeleton, SkeletonCard } from '@/components/mobile/MobileSkeleton';

// ── 工具 ──────────────────────────────────────────────────────────────────────

function todayPlusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function getUserInfo(): {
  companyCode: string;
  companyName: string;
} {
  if (typeof window === 'undefined') return {
    companyCode: '',
    companyName: ''
  };
  try {
    const u = JSON.parse(localStorage.getItem('auth_user') || '{}');
    return {
      companyCode: u.companyCode ?? u.company_code ?? '',
      companyName: u.companyName ?? u.company_name ?? ''
    };
  } catch {
    return {
      companyCode: '',
      companyName: ''
    };
  }
}

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface LineItem {
  key: string;
  itemName: string;
  spec: string;
  qty: string;
  unit: string;
  estimatedUnitPrice: string;
}
interface V2PrRecord {
  id: number;
  req_no?: string;
  prNo?: string;
  subject?: string;
  status: string;
  urgency?: string;
  currency_code?: string;
  currencyCode?: string;
  created_at?: string;
  createdAt?: string;
  total_amount?: number;
  totalAmount?: number;
}
interface ApprovalCandidate {
  userId: string;
  displayName: string;
  roleNameZh?: string | null;
}
type Tab = 'form' | 'records';
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'var(--gray-500)',
  SUBMITTED: 'var(--status-warning)',
  IN_REVIEW: 'var(--status-warning)',
  APPROVED: 'var(--status-info)',
  REJECTED: 'var(--status-danger)',
  PO_CREATED: 'var(--status-success)',
  CANCELLED: 'var(--slate-400)'
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '待审批',
  IN_REVIEW: '审批中',
  APPROVED: '已审批',
  REJECTED: '已拒绝',
  PO_CREATED: '已转采购单',
  CANCELLED: '已取消'
};
function newLine(): LineItem {
  return {
    key: Math.random().toString(36).slice(2),
    itemName: '',
    spec: '',
    qty: '',
    unit: '件',
    estimatedUnitPrice: ''
  };
}

// 物料类型枚举（PRC_MATERIAL_TYPE 字典 8 类）
const MATERIAL_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'FEED_RAW', label: '饲料原料' },
  { value: 'VET_DRUG', label: '兽药疫苗' },
  { value: 'PACKAGING', label: '包装材料' },
  { value: 'EQUIPMENT', label: '设备及配件' },
  { value: 'CONSTRUCTION', label: '建筑材料' },
  { value: 'OFFICE', label: '办公易耗' },
  { value: 'TOOL', label: '工具器具' },
  { value: 'OTHER', label: '其他' }
];

// ── 物料选择器（手机内联：搜索 + 候选过滤 + 找不到就地新建） ──────────────────
interface MaterialPickerProps {
  value: string;
  options: { code: string; name: string }[];
  readonly: boolean;
  inputSt: React.CSSProperties;
  labelSt: React.CSSProperties;
  isDark: boolean;
  textSub: string;
  text: string;
  cardBg: string;
  // 选中已有/新建后的物料名
  onPick: (name: string) => void;
  // 新建成功后把物料加入全局选项列表
  onCreated: (opt: { code: string; name: string }) => void;
}

function MaterialPicker(props: MaterialPickerProps) {
  const { value, options, readonly, inputSt, labelSt, isDark, textSub, text, cardBg, onPick, onCreated } = props;
  const { t } = useLanguage();
  // 物料类型兜底标签的 i18n（dict 未命中时使用）
  const materialTypeI18n: Record<string, string> = {
    FEED_RAW: t('mob.biz.mat_feed_raw', '饲料原料'),
    VET_DRUG: t('mob.biz.mat_vet_drug', '兽药疫苗'),
    PACKAGING: t('mob.biz.mat_packaging', '包装材料'),
    EQUIPMENT: t('mob.biz.mat_equipment', '设备及配件'),
    CONSTRUCTION: t('mob.biz.mat_construction', '建筑材料'),
    OFFICE: t('mob.biz.mat_office', '办公易耗'),
    TOOL: t('mob.biz.mat_tool', '工具器具'),
    OTHER: t('mob.biz.mat_other', '其他'),
  };
  // search = 输入框文本；初始同步 value
  const [search, setSearch] = useState(value);
  const [open, setOpen] = useState(false);
  // 新建表单状态
  const [creating, setCreating] = useState(false);
  const [newType, setNewType] = useState('OTHER');
  // G101：物料类型走字典 PRC_MATERIAL_TYPE（兜底 MATERIAL_TYPE_OPTIONS，缓存共享）
  const [matTypes, setMatTypes] = useState(MATERIAL_TYPE_OPTIONS);
  useEffect(() => { mobileApi.getDict('PRC_MATERIAL_TYPE').then(d => { if (d.length) setMatTypes(d); }); }, []);
  const [newSpec, setNewSpec] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  // value 外部变化时同步显示文本（如重置表单）
  useEffect(() => {
    setSearch(value);
  }, [value]);

  // 点击候选外区域收起
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const kw = search.trim();
  const filtered = kw
    ? options.filter(o => o.name.toLowerCase().includes(kw.toLowerCase()))
    : options;
  const exactMatch = kw ? options.some(o => o.name === kw) : false;
  const showCreate = kw.length > 0 && !exactMatch;

  const pick = (name: string) => {
    onPick(name);
    setSearch(name);
    setOpen(false);
    setCreating(false);
    setErr('');
  };

  const openCreate = () => {
    setCreating(true);
    setErr('');
    // 类型默认推断：保持 OTHER，让用户改
    setNewType('OTHER');
    setNewSpec('');
    setNewUnit('');
  };

  const submitCreate = async () => {
    const name = kw;
    if (!name) {
      setErr(t('mob.biz.enter_material_name', '请输入物料名称'));
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const res = await fetch('/api/master-data/runtime/material/quick', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({
          material_name: name,
          material_type: newType || undefined,
          spec: newSpec.trim() || undefined,
          unit: newUnit.trim() || undefined
        })
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && (json.code || json.name)) {
        const opt = { code: json.code ?? '', name: json.name ?? name };
        onCreated(opt);
        pick(opt.name);
      } else {
        setErr(json.message ?? json.msg ?? t('mob.biz.create_failed_retry', '新建失败，请重试'));
      }
    } catch {
      setErr(t('mob.biz.network_error_retry', '网络错误，请重试'));
    } finally {
      setSaving(false);
    }
  };

  // 候选项 / 新建表单容器风格
  const dropdownSt: React.CSSProperties = {
    position: 'relative',
    marginTop: 4,
    background: cardBg,
    border: `1px solid ${isDark ? 'var(--slate-700)' : 'var(--slate-200)'}`,
    borderRadius: 10,
    overflow: 'hidden',
    maxHeight: 260,
    overflowY: 'auto'
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        style={inputSt}
        value={search}
        onChange={e => {
          setSearch(e.target.value);
          setOpen(true);
          setCreating(false);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t('mob.biz.search_or_enter_material', '搜索或输入物料名称')}
        disabled={readonly}
      />

      {open && !readonly && (
        <div style={dropdownSt}>
          {filtered.length > 0 && filtered.map(o => (
            <div
              key={o.code || o.name}
              onMouseDown={e => { e.preventDefault(); pick(o.name); }}
              style={{
                padding: '12px 14px',
                fontSize: 15,
                color: text,
                cursor: 'pointer',
                borderBottom: `1px solid ${isDark ? 'var(--slate-800)' : 'var(--slate-100)'}`
              }}
            >
              {o.name}
            </div>
          ))}

          {filtered.length === 0 && !showCreate && (
            <div style={{ padding: '12px 14px', fontSize: 13, color: textSub }}>{t('mob.biz.no_material_create_hint', '暂无物料，输入名称可新建')}</div>
          )}

          {showCreate && !creating && (
            <div
              onMouseDown={e => { e.preventDefault(); openCreate(); }}
              style={{
                padding: '12px 14px',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--status-success)',
                cursor: 'pointer'
              }}
            >
              {t('mob.biz.create_material_prefix', '+ 新建物料「')}{kw}{t('mob.biz.create_material_suffix', '」')}
            </div>
          )}

          {showCreate && creating && (
            <div
              onMouseDown={e => e.stopPropagation()}
              style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{t('mob.biz.new_material_label', '新建物料：')}{kw}</div>
              <div>
                <span style={labelSt}>{t('mob.biz.material_type', '物料类型')}</span>
                <select
                  style={inputSt}
                  value={newType}
                  onChange={e => setNewType(e.target.value)}
                >
                  {matTypes.map(o => (
                    <option key={o.value} value={o.value}>{materialTypeI18n[o.value] ?? o.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <span style={labelSt}>{t('mob.biz.spec_model', '规格型号')}</span>
                  <input style={inputSt} value={newSpec} onChange={e => setNewSpec(e.target.value)} placeholder={t('mob.biz.optional2', '可选')} />
                </div>
                <div>
                  <span style={labelSt}>{t('mob.biz.unit', '单位')}</span>
                  <input style={inputSt} value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder={t('mob.biz.optional2', '可选')} />
                </div>
              </div>
              {err && (
                <div style={{ fontSize: 12, color: 'var(--status-danger)' }}>{err}</div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onMouseDown={e => { e.preventDefault(); submitCreate(); }}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '11px 0',
                    borderRadius: 10,
                    border: 'none',
                    background: 'var(--status-success)',
                    color: 'var(--bg-card)',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1
                  }}
                >
                  {saving ? t('mob.biz.saving', '保存中…') : t('mob.biz.save_and_use', '保存并选用')}
                </button>
                <button
                  onMouseDown={e => { e.preventDefault(); setCreating(false); }}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '11px 0',
                    borderRadius: 10,
                    border: `1.5px solid ${isDark ? 'var(--gray-700)' : 'var(--gray-300)'}`,
                    background: 'transparent',
                    color: text,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {t('mob.biz.cancel', '取消')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function PrcRequestPage() {
  const router = useRouter();
  const {
    isDark,
    toggle,
    t
  } = useMobileTheme();
  const { t: tt } = useLanguage();
  // 申请状态标签的 i18n 映射（键复用 mob.biz.*）
  const statusLabel = (k: string) => ({
    DRAFT: tt('mob.biz.status_draft', '草稿'),
    SUBMITTED: tt('mob.biz.status_submitted', '待审批'),
    IN_REVIEW: tt('mob.biz.status_in_review', '审批中'),
    APPROVED: tt('mob.biz.status_pr_approved', '已审批'),
    REJECTED: tt('mob.biz.status_rejected', '已拒绝'),
    PO_CREATED: tt('mob.biz.status_po_created', '已转采购单'),
    CANCELLED: tt('mob.biz.status_cancelled', '已取消'),
  } as Record<string, string>)[k] ?? STATUS_LABEL[k] ?? k;
  const {
    allowed,
    loading: permLoading,
    readonly
  } = useMobilePermission('prc_request');
  const [tab, setTab] = useState<Tab>('form');

  // 头表
  const [userInfo] = useState(getUserInfo);
  const [subject, setSubject] = useState('');
  const [companyCode, setCompanyCode] = useState(userInfo.companyCode);
  const [companyName, setCompanyName] = useState(userInfo.companyName);
  const [projectCode, setProjectCode] = useState('');
  const [projectName, setProjectName] = useState('');
  const [purchaseType, setPurchaseType] = useState('MATERIAL');
  const [urgency, setUrgency] = useState('NORMAL');
  const [currencyCode, setCurrencyCode] = useState('LAK');

  // G101 统一字典化：枚举改走 sys_dict（带硬编码兜底——dict 空/失败回退，零回归）
  const [typeOpts, setTypeOpts] = useState([
    { value: 'MATERIAL', label: tt('mob.biz.ptype_material', '物料') }, { value: 'EQUIPMENT', label: tt('mob.biz.ptype_equipment', '设备') },
    { value: 'SERVICE', label: tt('mob.biz.ptype_service', '服务') }, { value: 'FIXED_ASSET', label: tt('mob.biz.ptype_fixed_asset', '固定资产') }, { value: 'OTHER', label: tt('mob.biz.mat_other', '其他') }]);
  const [urgencyOpts, setUrgencyOpts] = useState([
    { value: 'NORMAL', label: tt('mob.biz.urgency_normal', '普通') }, { value: 'URGENT', label: tt('mob.biz.urgency_urgent', '紧急') }, { value: 'CRITICAL', label: tt('mob.biz.urgency_critical', '非常紧急') }]);
  const [currencyOpts, setCurrencyOpts] = useState([
    { value: 'LAK', label: 'LAK' }, { value: 'CNY', label: 'CNY' }, { value: 'THB', label: 'THB' }, { value: 'USD', label: 'USD' }]);
  useEffect(() => {
    mobileApi.getDict('PRC_PURCHASE_TYPE').then(d => { if (d.length) setTypeOpts(d); });
    mobileApi.getDict('PRC_URGENCY').then(d => { if (d.length) setUrgencyOpts(d); });
    mobileApi.getDict('SYS_CURRENCY').then(d => { if (d.length) setCurrencyOpts(d); });
  }, []);
  const [expectedDate, setExpectedDate] = useState(todayPlusDays(7));
  const [reason, setReason] = useState('常规采购补货');   // G95-E：默认原因，可直接编辑

  // 明细行
  const [items, setItems] = useState<LineItem[]>([newLine()]);

  // 主数据下拉选项
  const [companyOptions, setCompanyOptions] = useState<{ code: string; name: string }[]>([]);
  const [projectOptions, setProjectOptions] = useState<{ code: string; name: string }[]>([]);
  const [materialOptions, setMaterialOptions] = useState<{ code: string; name: string }[]>([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitPickerOpen, setSubmitPickerOpen] = useState(false);
  const [submitCandidates, setSubmitCandidates] = useState<ApprovalCandidate[]>([]);
  const [submitApproverId, setSubmitApproverId] = useState('');
  const [submitComment, setSubmitComment] = useState('');
  const [submitCandidateLoading, setSubmitCandidateLoading] = useState(false);

  // 申请记录
  const [records, setRecords] = useState<V2PrRecord[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState('');

  // ── 明细计算 ──────────────────────────────────────────────────────────────

  const totalEstimated = items.reduce((sum, row) => {
    const q = parseFloat(row.qty) || 0;
    const p = parseFloat(row.estimatedUnitPrice) || 0;
    return sum + q * p;
  }, 0);

  // ── 明细行操作 ────────────────────────────────────────────────────────────

  const updateItem = (key: string, field: keyof Omit<LineItem, 'key'>, value: string) => setItems(prev => prev.map(r => r.key === key ? {
    ...r,
    [field]: value
  } : r));
  const addItem = () => setItems(prev => [...prev, newLine()]);
  const removeItem = (key: string) => setItems(prev => prev.length > 1 ? prev.filter(r => r.key !== key) : prev);

  // ── 构建 DTO ──────────────────────────────────────────────────────────────

  function buildDto() {
    return {
      subject: subject.trim(),
      companyCode: companyCode.trim(),
      companyName: companyName.trim(),
      projectCode: projectCode.trim() || undefined,
      projectName: projectName.trim() || undefined,
      purchaseType: purchaseType || undefined,
      urgency,
      currencyCode,
      expectedDate: expectedDate || undefined,
      reason: reason.trim() || undefined,
      // G95-E：只取已填物品名的卡（误加的空卡自动忽略，不卡提交）
      items: items.filter(r => r.itemName.trim()).map(r => ({
        itemName: r.itemName.trim(),
        spec: r.spec.trim() || undefined,
        qty: parseFloat(r.qty) || 1,
        unit: r.unit.trim() || undefined,
        estimatedUnitPrice: r.estimatedUnitPrice ? parseFloat(r.estimatedUnitPrice) : undefined,
        estimatedAmount: (parseFloat(r.qty) || 0) * (parseFloat(r.estimatedUnitPrice) || 0) || undefined
      }))
    };
  }
  function validate(): string {
    if (!subject.trim()) return tt('mob.biz.fill_subject', '请填写申请主题');
    if (!companyCode.trim()) return tt('mob.biz.fill_company_code', '请填写公司代码');
    if (!companyName.trim()) return tt('mob.biz.fill_company_name', '请填写公司名称');
    // G95-E：只校验已填卡，空卡忽略
    const filled = items.filter(r => r.itemName.trim());
    if (filled.length === 0) return tt('mob.biz.fill_at_least_one_item', '请至少填写一条采购明细');
    const badQty = filled.find(r => !r.qty || parseFloat(r.qty) <= 0);
    if (badQty) return tt('mob.biz.qty_must_gt_zero', '已填明细的数量须大于 0');
    return '';
  }

  // ── 保存草稿 ──────────────────────────────────────────────────────────────

  function resetForm() {
    setSubject('');
    setProjectCode('');
    setProjectName('');
    setPurchaseType('MATERIAL');
    setUrgency('NORMAL');
    setCurrencyCode('LAK');
    setExpectedDate(todayPlusDays(7));
    setReason('常规采购补货');
    setItems([newLine()]);
  }

  const handleSaveDraft = useCallback(async () => {
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setSaving(true);
    setFormError('');
    setFormSuccess('');
    try {
      const res = await fetch('/api/v2/procurement/requests', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify(buildDto())
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setFormSuccess(`${tt('mob.biz.draft_saved_prefix', '草稿已保存！单号：')}${json.prNo ?? json.req_no ?? json.id ?? ''}`);
        resetForm();
      } else {
        setFormError(json.message ?? json.msg ?? tt('mob.biz.save_failed_retry', '保存失败，请重试'));
      }
    } catch {
      setFormError(tt('mob.biz.network_error_check', '网络错误，请检查连接后重试'));
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, companyCode, companyName, projectCode, projectName, purchaseType, urgency, currencyCode, expectedDate, reason, items]);

  // ── 提交审批 ──────────────────────────────────────────────────────────────

  const loadSubmitCandidates = useCallback(async () => {
    setSubmitCandidateLoading(true);
    setSubmitCandidates([]);
    setSubmitApproverId('');
    try {
      const qs = new URLSearchParams({
        menuCode: 'MENU_PRC2_REQUEST',
        requiredPerm: 'E'
      });
      if (companyCode.trim()) qs.set('companyCode', companyCode.trim());
      if (projectCode.trim()) qs.set('projectCode', projectCode.trim());
      const res = await fetch(`/api/approval/eligible-approvers?${qs}`, {
        headers: authHeader()
      });
      const json = res.ok ? await res.json().catch(() => []) : [];
      const list = Array.isArray(json) ? json : [];
      setSubmitCandidates(list);
      if (list[0]?.userId) setSubmitApproverId(list[0].userId);
    } catch {
      setSubmitCandidates([]);
    } finally {
      setSubmitCandidateLoading(false);
    }
  }, [companyCode, projectCode]);

  const openSubmitPicker = useCallback(async () => {
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError('');
    setFormSuccess('');
    setSubmitComment('');
    setSubmitPickerOpen(true);
    await loadSubmitCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, companyCode, companyName, projectCode, projectName, purchaseType, urgency, currencyCode, expectedDate, reason, items, loadSubmitCandidates]);

  const handleSubmit = useCallback(async (approverUserId?: string) => {
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setSubmitting(true);
    setFormError('');
    setFormSuccess('');
    try {
      // 1. 创建草稿
      const createRes = await fetch('/api/v2/procurement/requests', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify(buildDto())
      });
      const createJson = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        setFormError(createJson.message ?? createJson.msg ?? tt('mob.biz.create_request_failed', '创建申请失败'));
        return;
      }
      const prId = createJson.id;

      // 2. 提交审批
      const submitRes = await fetch(`/api/v2/procurement/requests/${prId}/submit`, {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({
          approverUserId: approverUserId || undefined,
          comment: submitComment.trim() || undefined
        })
      });
      const submitJson = await submitRes.json().catch(() => ({}));
      if (!submitRes.ok) {
        setFormError(submitJson.message ?? submitJson.msg ?? tt('mob.biz.submit_approval_failed', '提交审批失败'));
        return;
      }
      setFormSuccess(`${tt('mob.biz.request_submitted_prefix', '申请已提交审批！单号：')}${createJson.prNo ?? createJson.req_no ?? prId}`);
      setSubmitPickerOpen(false);
      resetForm();
      setTimeout(() => router.push('/mobile/workflow'), 1200);
    } catch {
      setFormError(tt('mob.biz.network_error_check', '网络错误，请检查连接后重试'));
    } finally {
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, companyCode, companyName, projectCode, projectName, purchaseType, urgency, currencyCode, expectedDate, reason, items, submitComment, router]);
  // ── 申请记录（V2） ────────────────────────────────────────────────────────

  const loadRecords = useCallback(async () => {
    setRecLoading(true);
    setRecError('');
    try {
      const res = await fetch('/api/v2/procurement/requests?pageSize=50', {
        headers: {
          Authorization: `Bearer ${getMobileToken()}`
        }
      });
      const json = await res.json().catch(() => ({}));
      setRecords(json.items ?? json.data ?? []);
    } catch {
      setRecError(tt('mob.biz.records_load_failed', '申请记录加载失败'));
    } finally {
      setRecLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!allowed || permLoading) return;
    if (tab === 'records') loadRecords();
  }, [tab, allowed, permLoading, loadRecords]);

  // ── 主数据加载 ────────────────────────────────────────────────────────────
  // 兼容解析：返回可能是 {code,data} / {data} / 裸数组
  function parseList(json: any): any[] {
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.data)) return json.data;
    if (Array.isArray(json?.items)) return json.items;
    return [];
  }

  // 进页加载公司 + 物料
  useEffect(() => {
    if (!allowed || permLoading) return;
    (async () => {
      try {
        const res = await fetch('/api/lookup/companies', { headers: authHeader() });
        const list = parseList(await res.json().catch(() => ({})));
        // G90 实测：/api/lookup/companies 返回 orgCode/orgName（非 company_code）
        setCompanyOptions(list.map((r: any) => ({
          code: r.orgCode ?? r.company_code ?? r.code ?? '',
          name: r.orgName ?? r.orgNameCn ?? r.company_name ?? r.name ?? ''
        })).filter((o: { code: string }) => o.code));
      } catch { /* 静默 */ }
    })();
    (async () => {
      try {
        const res = await fetch('/api/lookup/materials', { headers: authHeader() });  // G91：开放端点，避免 runtime/active 的 403
        const list = parseList(await res.json().catch(() => ({})));
        setMaterialOptions(list.map((r: any) => ({
          code: r.material_code ?? r.code ?? '',
          name: r.material_name ?? r.name ?? ''
        })).filter((o: { name: string }) => o.name));
      } catch { /* 静默 */ }
    })();
  }, [allowed, permLoading]);

  // 项目随公司变化重拉
  useEffect(() => {
    if (!allowed || permLoading) return;
    (async () => {
      try {
        const qs = companyCode ? `?company_code=${encodeURIComponent(companyCode)}` : '';
        const res = await fetch(`/api/biz/projects/active${qs}`, { headers: authHeader() });
        const list = parseList(await res.json().catch(() => ({})));
        setProjectOptions(list.map((r: any) => ({
          code: r.project_code ?? r.code ?? '',
          name: r.project_name ?? r.name ?? ''
        })).filter((o: { code: string }) => o.code));
      } catch { /* 静默 */ }
    })();
  }, [allowed, permLoading, companyCode]);
  if (permLoading) return <MobilePageSkeleton title={tt('mob.biz.create_purchase_request', '发起采购申请')} tabs={[tt('mob.biz.create_request_tab', '发起申请'), tt('mob.biz.request_records_tab', '申请记录')]} onBack={() => router.back()} />;
  if (!allowed) return null;

  // ── 样式 ──────────────────────────────────────────────────────────────────

  const inputSt: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    background: t.inputBg,
    border: `1px solid ${t.inputBorder}`,
    color: t.text,
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box'
  };
  const labelSt: React.CSSProperties = {
    fontSize: 13,
    color: t.textSub,
    marginBottom: 4,
    display: 'block'
  };
  const sectionSt: React.CSSProperties = {
    background: t.cardBg,
    borderRadius: 14,
    border: `1px solid ${t.cardBorder}`,
    padding: '14px 14px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  };
  return <div style={{
    minHeight: '100svh',
    background: t.pageBg,
    display: 'flex',
    flexDirection: 'column'
  }}>

      {/* AppBar */}
      <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      background: t.appBarBg,
      borderBottom: `1px solid ${t.barBorder}`,
      position: 'sticky',
      top: 0,
      zIndex: 10
    }}>
        <button onClick={() => router.push('/mobile/home')} style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: t.textSub,
        display: 'flex',
        alignItems: 'center',
        gap: 4
      }}>
          <ChevronLeft size={20} />
          <span className={u.fs14}>{tt('mob.biz.back', '返回')}</span>
        </button>
        <div className={u.flexRow8}>
          <ClipboardList size={18} color="var(--status-success)" />
          <span style={{
          fontWeight: 700,
          fontSize: 16,
          color: t.text
        }}>{tt('mob.biz.create_purchase_request', '发起采购申请')}</span>
        </div>
        <div style={{
        display: 'flex',
        gap: 8
      }}>
          {tab === 'records' && <button onClick={loadRecords} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: t.textSub
        }}>
              <RefreshCw size={18} />
            </button>}
          <button onClick={toggle} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: t.textSub
        }}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>

      {/* 只读提示 */}
      {readonly && <div style={{
      background: 'var(--status-warning-bg-faint)',
      color: 'var(--status-warning)',
      fontSize: 13,
      padding: '8px 16px',
      textAlign: 'center'
    }}>
          {tt('mob.biz.readonly_no_submit', '只读模式 — 您无权提交采购申请')}
        </div>}

      {/* Tab 切换 */}
      <div style={{
      display: 'flex',
      margin: '12px 16px 0',
      background: t.inputBg,
      borderRadius: 12,
      padding: 4
    }}>
        {([['form', tt('mob.biz.create_request_tab', '发起申请')], ['records', tt('mob.biz.request_records_tab', '申请记录')]] as const).map(([key, label]) => <button key={key} onClick={() => setTab(key)} style={{
        flex: 1,
        padding: '9px 0',
        borderRadius: 10,
        border: 'none',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 600,
        background: tab === key ? 'var(--status-success)' : 'transparent',
        color: tab === key ? 'var(--bg-card)' : t.textSub,
        transition: 'all 0.2s'
      }}>
            {label}
          </button>)}
      </div>

      {/* 内容区 */}
      <div style={{
      flex: 1,
      padding: '14px 16px 80px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }}>

        {/* ── 发起申请 Tab ── */}
        {tab === 'form' && <>
            {/* 基本信息 */}
            <div style={sectionSt}>
              <div style={{
            fontSize: 13,
            fontWeight: 700,
            color: t.textSub,
            marginBottom: 2
          }}>{tt('mob.biz.basic_info', '基本信息')}</div>

              <div>
                <span style={labelSt}>{tt('mob.biz.request_subject_required', '申请主题 *')}</span>
                <input style={inputSt} value={subject} onChange={e => setSubject(e.target.value)} placeholder={tt('mob.biz.subject_placeholder', '例：5月饲料补充采购')} disabled={readonly} />
              </div>

              <div>
                <span style={labelSt}>{tt('mob.biz.company_required', '公司 *')}</span>
                <select style={inputSt} value={companyCode} onChange={e => {
              const code = e.target.value;
              const opt = companyOptions.find(o => o.code === code);
              setCompanyCode(code);
              setCompanyName(opt?.name ?? '');
              // 切换公司清空已选项目
              setProjectCode('');
              setProjectName('');
            }} disabled={readonly}>
                  <option value="">{tt('mob.biz.select_company', '请选择公司')}</option>
                  {companyOptions.map(o => <option key={o.code} value={o.code}>{o.name || o.code}</option>)}
                </select>
              </div>

              <div>
                <span style={labelSt}>{tt('mob.biz.project', '项目')}</span>
                <select style={inputSt} value={projectCode} onChange={e => {
              const code = e.target.value;
              const opt = projectOptions.find(o => o.code === code);
              setProjectCode(code);
              setProjectName(opt?.name ?? '');
            }} disabled={readonly}>
                  <option value="">{tt('mob.biz.no_project', '（不指定项目）')}</option>
                  {projectOptions.map(o => <option key={o.code} value={o.code}>{o.name || o.code}</option>)}
                </select>
              </div>

              <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10
          }}>
                <div>
                  <span style={labelSt}>{tt('mob.biz.purchase_type', '采购类型')}</span>
                  <select style={inputSt} value={purchaseType} onChange={e => setPurchaseType(e.target.value)} disabled={readonly}>
                    {typeOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <span style={labelSt}>{tt('mob.biz.urgency_level', '紧急程度')}</span>
                  <select style={inputSt} value={urgency} onChange={e => setUrgency(e.target.value)} disabled={readonly}>
                    {urgencyOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10
          }}>
                <div>
                  <span style={labelSt}>{tt('mob.biz.currency_label', '货币')}</span>
                  <select style={inputSt} value={currencyCode} onChange={e => setCurrencyCode(e.target.value)} disabled={readonly}>
                    {currencyOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <span style={labelSt}>{tt('mob.biz.expected_arrival_date', '期望到货日期')}</span>
                  <input type="date" style={inputSt} value={expectedDate} onChange={e => setExpectedDate(e.target.value)} disabled={readonly} />
                </div>
              </div>

              <div>
                <span style={labelSt}>{tt('mob.biz.request_reason', '申请原因')}</span>
                <textarea style={{
              ...inputSt,
              height: 72,
              resize: 'none'
            } as React.CSSProperties} value={reason} onChange={e => setReason(e.target.value)} placeholder={tt('mob.biz.reason_placeholder', '请简述采购需求背景及用途')} disabled={readonly} />
              </div>
            </div>

            {/* 明细行 */}
            <div style={sectionSt}>
              <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 2
          }}>
                <span style={{
              fontSize: 13,
              fontWeight: 700,
              color: t.textSub
            }}>{tt('mob.biz.purchase_detail_required', '采购明细 *')}</span>
                {!readonly && <button onClick={addItem} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'var(--status-success)',
              color: 'var(--bg-card)',
              border: 'none',
              borderRadius: 8,
              padding: '5px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}>
                    <Plus size={13} />{tt('mob.biz.add_detail', '添加明细')}
                  </button>}
              </div>

              {items.map((row, idx) => <div key={row.key} style={{
            background: isDark ? 'var(--slate-800)' : 'var(--slate-50)',
            borderRadius: 10,
            padding: '10px 12px',
            border: `1px solid ${isDark ? 'var(--slate-700)' : 'var(--slate-200)'}`
          }}>
                  <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8
            }}>
                    <span style={{
                fontSize: 12,
                fontWeight: 700,
                color: t.textSub
              }}>{tt('mob.biz.detail_n', '明细')} {idx + 1}</span>
                    {!readonly && items.length > 1 && <button onClick={() => removeItem(row.key)} style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--status-danger)',
                padding: 2
              }}>
                        <Trash2 size={15} />
                      </button>}
                  </div>

                  <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
                    <div>
                      <span style={labelSt}>{tt('mob.biz.item_name_required', '物品名称 *')}</span>
                      {/* G91：手机端物料选择 = 搜索 + 候选过滤 + 找不到就地新建（直存物料库，立即可选）。 */}
                      <MaterialPicker
                        value={row.itemName}
                        options={materialOptions}
                        readonly={readonly}
                        inputSt={inputSt}
                        labelSt={labelSt}
                        isDark={isDark}
                        textSub={t.textSub}
                        text={t.text}
                        cardBg={t.cardBg}
                        onPick={name => updateItem(row.key, 'itemName', name)}
                        onCreated={opt => setMaterialOptions(prev => prev.some(o => o.name === opt.name) ? prev : [...prev, opt])}
                      />
                    </div>

                    <div>
                      <span style={labelSt}>{tt('mob.biz.spec_model', '规格型号')}</span>
                      <input style={inputSt} value={row.spec} onChange={e => updateItem(row.key, 'spec', e.target.value)} placeholder={tt('mob.biz.spec_placeholder', '例：43%蛋白，可选')} disabled={readonly} />
                    </div>

                    <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 2fr',
                gap: 8
              }}>
                      <div>
                        <span style={labelSt}>{tt('mob.biz.qty_required', '数量 *')}</span>
                        <input type="number" inputMode="decimal" style={inputSt} value={row.qty} onChange={e => updateItem(row.key, 'qty', e.target.value)} placeholder="0" disabled={readonly} />
                      </div>
                      <div>
                        <span style={labelSt}>{tt('mob.biz.unit', '单位')}</span>
                        <input style={inputSt} value={row.unit} onChange={e => updateItem(row.key, 'unit', e.target.value)} placeholder={tt('mob.biz.unit_piece', '件')} disabled={readonly} />
                      </div>
                      <div>
                        <span style={labelSt}>{tt('mob.biz.estimated_unit_price', '估算单价')}</span>
                        <input type="number" inputMode="decimal" style={inputSt} value={row.estimatedUnitPrice} onChange={e => updateItem(row.key, 'estimatedUnitPrice', e.target.value)} placeholder={tt('mob.biz.optional2', '可选')} disabled={readonly} />
                      </div>
                    </div>

                    {/* 行小计 */}
                    {row.qty && row.estimatedUnitPrice && <div style={{
                textAlign: 'right',
                fontSize: 12,
                color: 'var(--status-success)',
                fontWeight: 600
              }}>
                        {tt('mob.biz.subtotal_label', '小计：')}{((parseFloat(row.qty) || 0) * (parseFloat(row.estimatedUnitPrice) || 0)).toLocaleString()} {currencyCode}
                      </div>}
                  </div>
                </div>)}

              {/* 合计 */}
              {totalEstimated > 0 && <div style={{
            textAlign: 'right',
            padding: '6px 4px',
            fontSize: 14,
            fontWeight: 700,
            color: t.text
          }}>
                  {tt('mob.biz.estimated_total_label', '预估合计：')}{totalEstimated.toLocaleString()} {currencyCode}
                </div>}
            </div>

            {/* 错误 / 成功 */}
            {formError && <div style={{
          color: 'var(--status-danger)',
          background: 'var(--status-danger-bg-faint)',
          padding: '10px 14px',
          borderRadius: 10,
          fontSize: 13
        }}>
                {formError}
              </div>}
            {formSuccess && <div style={{
          color: 'var(--status-success-dark)',
          background: 'var(--status-success-bg-faint)',
          padding: '10px 14px',
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600
        }}>
                ✅ {formSuccess}
              </div>}
          </>}

        {/* ── 申请记录 Tab ── */}
        {tab === 'records' && <div>
            {recLoading && <div>{[1, 2, 3].map(i => <SkeletonCard key={i} lines={2} />)}</div>}
            {recError && <div style={{
          color: 'var(--status-danger)',
          background: 'var(--status-danger-bg-faint)',
          padding: '10px 14px',
          borderRadius: 10,
          fontSize: 13,
          marginBottom: 12
        }}>
                {recError}
              </div>}
            {!recLoading && records.length === 0 && <div style={{
          textAlign: 'center',
          padding: 60,
          color: t.textFaint,
          fontSize: 14
        }}>{tt('mob.biz.no_purchase_records', '暂无采购申请记录')}</div>}
            {!recLoading && records.map(row => {
          const st = (row.status || 'DRAFT').toUpperCase();
          const stColor = STATUS_COLOR[st] ?? 'var(--slate-400)';
          const stLabel = statusLabel(st);
          const createdAt = row.created_at ?? row.createdAt;
          const total = row.total_amount ?? row.totalAmount;
          return <div key={row.id} style={{
            background: t.cardBg,
            borderRadius: 14,
            padding: '14px 16px',
            border: `1px solid ${t.cardBorder}`,
            marginBottom: 10
          }}>
                  <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}>
                    <div style={{
                flex: 1,
                minWidth: 0
              }}>
                      <div style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  fontWeight: 700,
                  color: t.textSub
                }}>
                        {row.prNo ?? row.req_no ?? `#${row.id}`}
                      </div>
                      <div style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: t.text,
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                        {row.subject || '—'}
                      </div>
                      {total != null && total > 0 && <div style={{
                  fontSize: 13,
                  color: t.textSub,
                  marginTop: 2
                }}>
                          {tt('mob.biz.estimated_total_label', '预估合计：')}{total.toLocaleString()} {row.currency_code ?? row.currencyCode ?? ''}
                        </div>}
                      {createdAt && <div style={{
                  fontSize: 11,
                  color: t.textFaint,
                  marginTop: 4
                }}>
                          {tt('mob.biz.submit_time_label', '提交时间：')}{createdAt.slice(0, 16)}
                        </div>}
                    </div>
                    <span style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 20,
                background: `${stColor}22`,
                color: stColor,
                flexShrink: 0,
                marginLeft: 8
              }}>
                      {stLabel}
                    </span>
                  </div>
                </div>;
        })}
          </div>}
      </div>

      {/* ── 底部操作栏（发起申请 Tab） ── */}
      {tab === 'form' && !readonly && <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: t.appBarBg,
      borderTop: `1px solid ${t.barBorder}`,
      padding: '12px 16px',
      display: 'flex',
      gap: 10,
      paddingBottom: 'calc(12px + env(safe-area-inset-bottom))'
    }}>
          <button onClick={handleSaveDraft} disabled={saving || submitting} style={{
        flex: 1,
        padding: '13px 0',
        borderRadius: 12,
        border: `1.5px solid ${isDark ? 'var(--gray-700)' : 'var(--gray-300)'}`,
        background: 'transparent',
        color: t.text,
        fontSize: 15,
        fontWeight: 600,
        cursor: saving ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        opacity: saving ? 0.6 : 1
      }}>
            {saving ? <Loader2 size={16} style={{
          animation: 'spin 1s linear infinite'
        }} /> : <Save size={16} />}
            {saving ? tt('mob.biz.saving', '保存中…') : tt('mob.biz.save_draft', '保存草稿')}
          </button>
          <button onClick={() => { void openSubmitPicker(); }} disabled={saving || submitting} style={{
        flex: 2,
        padding: '13px 0',
        borderRadius: 12,
        border: 'none',
        background: submitting ? 'var(--slate-400)' : 'var(--status-success)',
        color: 'var(--bg-card)',
        fontSize: 15,
        fontWeight: 700,
        cursor: submitting ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6
      }}>
            {submitting ? <Loader2 size={16} style={{
          animation: 'spin 1s linear infinite'
        }} /> : <Send size={16} />}
            {submitting ? tt('mob.biz.submitting', '提交中…') : tt('mob.biz.submit_approval', '提交审批')}
          </button>
        </div>}

      {submitPickerOpen && !readonly && <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.48)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center'
      }}>
        <div style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '86svh',
          overflowY: 'auto',
          background: t.cardBg,
          color: t.text,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          border: `1px solid ${t.cardBorder}`,
          boxShadow: '0 -20px 60px rgba(0,0,0,0.35)',
          padding: '16px 16px calc(16px + env(safe-area-inset-bottom))'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{tt('mob.biz.submit_approval', '提交审批')}</div>
              <div style={{ fontSize: 12, color: t.textSub, marginTop: 4 }}>{tt('mob.biz.pick_approver_hint', '选择下一审批人，候选已按采购权限与数据域过滤')}</div>
            </div>
            <button onClick={() => setSubmitPickerOpen(false)} disabled={submitting} style={{
              border: 'none',
              background: 'transparent',
              color: t.textSub,
              fontSize: 24,
              lineHeight: 1,
              cursor: 'pointer'
            }}>×</button>
          </div>

          <div style={{ padding: 12, borderRadius: 12, background: t.inputBg, border: `1px solid ${t.inputBorder}`, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: t.textSub, marginBottom: 4 }}>{tt('mob.biz.request_subject', '申请主题')}</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{subject.trim() || tt('mob.biz.purchase_request', '采购申请')}</div>
            <div style={{ fontSize: 12, color: t.textSub, marginTop: 6 }}>{companyName || companyCode || tt('mob.biz.no_company_selected', '未选择公司')}{projectName ? ` · ${projectName}` : ''}</div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>{tt('mob.biz.next_approver', '下一审批人')}</label>
            {submitCandidateLoading ? <div style={{ padding: 18, textAlign: 'center', color: t.textSub, fontSize: 13 }}>{tt('mob.biz.loading_approvers', '正在加载可审批人员…')}</div>
              : submitCandidates.length === 0 ? <div style={{ padding: 14, borderRadius: 12, background: 'color-mix(in srgb, var(--status-warning) 10%, transparent)', color: 'var(--status-warning)', fontSize: 13, lineHeight: 1.6 }}>
                  {tt('mob.biz.no_approver_found', '暂未找到可指定审批人。可按审批规则提交；若流程规则未配置，后端会阻止提交并提示原因。')}
                </div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {submitCandidates.map(candidate => (
                    <button key={candidate.userId} type="button" onClick={() => setSubmitApproverId(candidate.userId)} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: `1px solid ${submitApproverId === candidate.userId ? 'var(--status-success)' : t.inputBorder}`,
                      background: submitApproverId === candidate.userId ? 'color-mix(in srgb, var(--status-success) 12%, transparent)' : t.inputBg,
                      color: t.text,
                      textAlign: 'left',
                      cursor: 'pointer'
                    }}>
                      <span style={{ width: 9, height: 9, borderRadius: 9, background: submitApproverId === candidate.userId ? 'var(--status-success)' : t.inputBorder, flexShrink: 0 }} />
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{candidate.displayName}</span>
                      {candidate.roleNameZh && <span style={{ marginLeft: 'auto', fontSize: 12, color: t.textSub }}>{candidate.roleNameZh}</span>}
                    </button>
                  ))}
                </div>}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>{tt('mob.biz.submit_comment', '提交说明')}</label>
            <textarea style={{ ...inputSt, minHeight: 78, resize: 'vertical' }} value={submitComment} onChange={e => setSubmitComment(e.target.value)} placeholder={tt('mob.biz.submit_comment_placeholder', '可填写采购背景、紧急原因或注意事项')} />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setSubmitPickerOpen(false)} disabled={submitting} style={{
              flex: 1,
              padding: '13px 0',
              borderRadius: 12,
              border: `1.5px solid ${isDark ? 'var(--gray-700)' : 'var(--gray-300)'}`,
              background: 'transparent',
              color: t.text,
              fontSize: 15,
              fontWeight: 600
            }}>{tt('mob.biz.cancel', '取消')}</button>
            <button onClick={() => { void handleSubmit(submitApproverId || undefined); }} disabled={submitting || (!submitApproverId && submitCandidates.length > 0)} style={{
              flex: 2,
              padding: '13px 0',
              borderRadius: 12,
              border: 'none',
              background: submitting ? 'var(--slate-400)' : 'var(--status-success)',
              color: 'var(--bg-card)',
              fontSize: 15,
              fontWeight: 800,
              opacity: (!submitApproverId && submitCandidates.length > 0) ? 0.55 : 1
            }}>
              {submitting ? tt('mob.biz.submitting', '提交中…') : submitApproverId ? tt('mob.biz.submit_to_approver', '提交给所选审批人') : tt('mob.biz.submit_by_rule', '按审批规则提交')}
            </button>
          </div>
        </div>
      </div>}
    </div>;
}
