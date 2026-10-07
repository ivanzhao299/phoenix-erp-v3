'use client';

import React, { useState, useEffect, useCallback } from 'react';
import u from "@/styles/uix-utils.module.css";
import s from "@/components/ui/admin-ui.module.css";
import PageHeader from '@/components/PageHeader';
import { useProductGrades } from "@/hooks/useProductGrades"; // G20-1 等级走 product_grades
import { useMasterNames } from '@/hooks/useMasterNames';
import { useLanguage } from "@/contexts/LanguageContext";
import { LoadingSkeleton } from "@/components/design-system";
import { formatBusinessEnum, formatMasterData } from '@/lib/business-display';
import type { AppLanguage } from '@/lib/localized-master-data';
import styles from './inventory.module.css';

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
  /** Phase H4 */
  sku_code?: string | null;
  grade_code_std?: string | null;
  spec_code?: string | null;
  sku_name?: string | null;
  sku_name_en?: string | null;
  sku_name_lo?: string | null;
  product_name?: string | null;
  product_name_zh?: string | null;
  product_name_en?: string | null;
  product_name_lo?: string | null;
  company_name?: string | null;
  company_name_zh?: string | null;
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
  expiringWarnDays?: number;
  /** Phase H4 */
  skuLinkedBatches?: number;
}
interface LossAnalysis {
  byType: Array<{
    change_type: string;
    total_loss: number;
    batch_count: number;
  }>;
  byBatch: Array<{
    batch_no: string;
    product_code: string;
    total_loss: number;
    last_event: string;
    sku_code?: string | null;
  }>;
  summary: {
    total_expire_loss: number;
    total_damage_loss: number;
    total_loss: number;
  };
}

/** Phase H4: SKU 主数据 */
interface SkuItem {
  sku_code: string;
  product_code: string;
  grade_code: string;
  spec_code: string;
  sku_name?: string;
  status: string;
}

// ── API helper ────────────────────────────────────────────────────────────────

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('phoenix_token') || sessionStorage.getItem('phoenix_token') || null : null;
  const res = await fetch(`/api/v2/sales/inventory${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? {
        Authorization: `Bearer ${token}`
      } : {})
    },
    ...(body !== undefined ? {
      body: JSON.stringify(body)
    } : {})
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({
      message: res.statusText
    }));
    throw new Error(err.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

/** Phase H4: 加载 SKU 主数据 */
async function loadSkus(): Promise<SkuItem[]> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('phoenix_token') || sessionStorage.getItem('phoenix_token') || '' : '';
    const res = await fetch('/api/product-master/skus', {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? {
          Authorization: `Bearer ${token}`
        } : {})
      }
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data ?? []) as SkuItem[];
  } catch {
    return [];
  }
}
function fmt(n: number | null | undefined, dec = 0): string {
  if (n == null) return '—';
  return Number(n).toLocaleString('zh-CN', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec
  });
}
function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
function gradeColor(grade: string | null): string {
  const map: Record<string, string> = {
    AA: 'var(--color-accent)',
    A: 'var(--status-success)',
    B: 'var(--status-warning)',
    DIRTY: 'var(--color-purple-600)',
    CRACKED: 'var(--status-danger)',
    DAMAGED: 'var(--status-danger)'
  };
  return map[grade ?? ''] ?? 'var(--gray-500)';
}
function statusBadge(status: string, lang: AppLanguage): React.ReactNode {
  const cfg: Record<string, {
    color: string;
  }> = {
    AVAILABLE: {
      color: 'var(--status-success)'
    },
    LOCKED: {
      color: 'var(--status-warning)'
    },
    RETURNED: {
      color: 'var(--color-purple-600)'
    },
    EXPIRED: {
      color: 'var(--status-danger)'
    },
    WRITTEN_OFF: {
      color: 'var(--gray-500)'
    }
  };
  const c = cfg[status] ?? {
    color: 'var(--gray-500)'
  };
  return <span style={{
    display: 'inline-block',
    padding: '1px 8px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    background: c.color + '22',
    color: c.color,
    border: `1px solid ${c.color}55`
  }}>{formatBusinessEnum('inventory', status, lang)}</span>;
}

/** Phase H4: SKU 徽章 */
function SkuBadge({
  skuCode,
  row,
  lang,
}: {
  skuCode?: string | null;
  row?: Record<string, unknown>;
  lang?: AppLanguage;
}) {
  const { t } = useLanguage();
  if (!skuCode) return <span style={{
    color: 'var(--gray-400)',
    fontSize: 11
  }}>{t('ui.旧批次','旧批次')}</span>;
  return <span style={{
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: 600,
    background: 'var(--status-special-bg-medium)',
    color: 'var(--color-purple-400)',
    borderRadius: 4,
    padding: '2px 6px',
    border: '1px solid var(--status-special-border)'
  }} data-i18n-skip="true">{row ? formatMasterData(row, 'sku_name', skuCode, lang) : skuCode}</span>;
}

function InventorySourceTrace({ batch }: { batch: InvBatch }) {
  const { t } = useLanguage();
  const sourceType = String(batch.source_type || '').toUpperCase();
  const sourceLabel = sourceType.includes('PACK')
    ? t('ui.包装完工', '包装完工')
    : sourceType.includes('PRODUCTION')
      ? t('ui.生产入库', '生产入库')
      : sourceType.includes('PURCHASE')
        ? t('ui.采购入库', '采购入库')
        : sourceType.includes('RETURN')
          ? t('ui.退货入库', '退货入库')
          : sourceType.includes('CHANJET')
            ? t('ui.外部库存参考', '外部库存参考')
            : batch.source_type || t('ui.ERP库存台账', 'ERP 库存台账');
  const hasSourceEvidence = Boolean(batch.source_type || batch.source_no);

  return (
    <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: hasSourceEvidence ? 'var(--text-primary)' : 'var(--status-warning)' }}>
        {hasSourceEvidence ? sourceLabel : t('ui.来源未关联', '来源未关联')}
      </div>
      {batch.source_no && (
        <div title={batch.source_no} style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {batch.source_no}
        </div>
      )}
      <span style={{ width: 'fit-content', borderRadius: 999, padding: '2px 7px', fontSize: 10.5, fontWeight: 700, color: '#92400e', background: '#fef3c7' }}>
        {t('ui.外部对账待核验', '外部对账待核验')}
      </span>
    </div>
  );
}

// ── 仪表盘统计卡 ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  tone = 'neutral'
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'neutral';
}) {
  const toneMap: Record<string, { border: string; bg: string; fg: string; icon: string }> = {
    blue: { border: '#2563eb', bg: '#eff6ff', fg: '#1d4ed8', icon: '批次' },
    green: { border: '#16a34a', bg: '#f0fdf4', fg: '#15803d', icon: '可用' },
    amber: { border: '#f59e0b', bg: '#fffbeb', fg: '#b45309', icon: '临期' },
    red: { border: '#dc2626', bg: '#fef2f2', fg: '#b91c1c', icon: '风险' },
    purple: { border: '#7c3aed', bg: '#f5f3ff', fg: '#6d28d9', icon: 'SKU' },
    neutral: { border: '#64748b', bg: '#f8fafc', fg: '#334155', icon: '统计' },
  };
  const cfg = toneMap[tone] ?? toneMap.neutral;
  return (
    <div style={{
      minHeight: 116,
      padding: '16px 18px 15px',
      borderRadius: 10,
      background: 'linear-gradient(180deg, #fff 0%, #fbfdff 100%)',
      border: '1px solid var(--gray-200)',
      borderTop: `3px solid ${cfg.border}`,
      boxShadow: '0 10px 24px rgba(15, 23, 42, 0.055)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{
          color: 'var(--gray-600)',
          fontSize: 12.5,
          fontWeight: 700,
          lineHeight: 1.35,
        }}>{label}</div>
        <span style={{
          flex: '0 0 auto',
          padding: '3px 7px',
          borderRadius: 999,
          background: cfg.bg,
          color: cfg.fg,
          fontSize: 11,
          fontWeight: 700,
        }}>{cfg.icon}</span>
      </div>
      <div>
        <div style={{
          color: 'var(--gray-900)',
          fontSize: 24,
          fontWeight: 800,
          lineHeight: 1.08,
          letterSpacing: 0,
        }}>{value}</div>
        {sub && <div style={{
          marginTop: 6,
          color: 'var(--gray-500)',
          fontSize: 12,
          fontWeight: 600,
        }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Tab: 批次库存 ─────────────────────────────────────────────────────────────

function BatchesTab() {
  const { t, lang } = useLanguage();
  const [batches, setBatches] = useState<InvBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [productCode, setProductCode] = useState('EGG');
  const [gradeCode, setGradeCode] = useState('');
  const { grades: productGrades } = useProductGrades(); // G20-1 9 档权威源
  const [companyCode, setCompanyCode] = useState('');
  const [skuCodeFilter, setSkuCodeFilter] = useState('');

  // 手动创建批次
  const [showCreate, setShowCreate] = useState(false);
  const [skus, setSkus] = useState<SkuItem[]>([]);
  const [form, setForm] = useState({
    companyCode: '',
    eggDate: '',
    qualityGrade: 'AA',
    packagingSpec: '',
    productCode: 'EGG',
    qty: '',
    shelfDays: '30',
    sourceNo: '',
    // Phase H4
    skuCode: ''
  });
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');

  // Phase H4: 加载 SKU 主数据
  useEffect(() => {
    loadSkus().then(setSkus);
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (skuCodeFilter) {
        params.set('skuCode', skuCodeFilter);
      } else {
        params.set('productCode', productCode);
        if (gradeCode) params.set('gradeCode', gradeCode);
      }
      if (companyCode) params.set('companyCode', companyCode);
      const data = await api<InvBatch[]>('GET', `/batches?${params}`);
      setBatches(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [productCode, gradeCode, companyCode, skuCodeFilter]);
  useEffect(() => {
    load();
  }, [load]);

  /** Phase H4: 选择 SKU → 自动填充 productCode/qualityGrade/packagingSpec */
  const handleSkuSelect = (skuCode: string) => {
    const sku = skus.find(x => x.sku_code === skuCode);
    if (sku) {
      setForm(f => ({
        ...f,
        skuCode,
        productCode: sku.product_code,
        qualityGrade: sku.grade_code,
        packagingSpec: sku.spec_code
      }));
    } else {
      setForm(f => ({
        ...f,
        skuCode
      }));
    }
  };
  const handleCreate = async () => {
    // 数量必须为正整数（防止 -2 等负数/0 提交；后端亦校验，前端先拦更友好）
    const qtyNum = Number(form.qty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0 || !Number.isInteger(qtyNum)) {
      setCreateErr(t('ui.数量（枚）必须为大于 0 的整数','数量（枚）必须为大于 0 的整数'));
      return;
    }
    setCreating(true);
    setCreateErr('');
    try {
      await api('POST', '/batches', {
        companyCode: form.companyCode,
        eggDate: form.eggDate,
        qualityGrade: form.skuCode ? undefined : form.qualityGrade || undefined,
        packagingSpec: form.skuCode ? undefined : form.packagingSpec || undefined,
        productCode: form.productCode,
        qty: Number(form.qty),
        shelfDays: form.shelfDays ? Number(form.shelfDays) : undefined,
        sourceNo: form.sourceNo || undefined,
        // Phase H4: 传入 skuCode（可选）
        skuCode: form.skuCode || undefined
      });
      setShowCreate(false);
      setForm(f => ({
        ...f,
        skuCode: ''
      }));
      load();
    } catch (e: unknown) {
      setCreateErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };
  return <div>
      {/* 搜索栏 */}
      <div className={styles.filters}>
        {/* G20-1：SKU 过滤器加 sku_name 显示；等级走 product_grades 9 档而非硬编码枚举 */}
        <select value={skuCodeFilter} onChange={e => {
        setSkuCodeFilter(e.target.value);
      }} style={{
        ...inputStyle,
        minWidth: 240
      }}>
          <option value="">{t('ui.按商品组合(SKU)过滤...','按商品组合(SKU)过滤...')}</option>
          {skus.filter(x => x.status === 'ACTIVE').map(x => (
            <option key={x.sku_code} value={x.sku_code}>
              {x.sku_name ? `${x.sku_name}${t('ui.（','（')}${x.sku_code}${t('ui.）','）')}` : x.sku_code}
            </option>
          ))}
        </select>
        {!skuCodeFilter && <>
            <input value={productCode} onChange={e => setProductCode(e.target.value)} placeholder={t('ui.产品代码','产品代码')} style={inputStyle} />
            <select value={gradeCode} onChange={e => setGradeCode(e.target.value)} style={inputStyle}>
              <option value="">{t('ui.所有等级','所有等级')}</option>
              {productGrades.map(g => <option key={g.grade_code} value={g.grade_code}>{g.grade_name}</option>)}
            </select>
          </>}
        <input value={companyCode} onChange={e => setCompanyCode(e.target.value)} placeholder={t('ui.公司/农场代码','公司/农场代码')} style={inputStyle} />
        <button onClick={load} style={btnStyle('var(--color-accent)')}>{t('ui.查询','查询')}</button>
        <button onClick={() => setShowCreate(true)} style={btnStyle('var(--status-success)')}>+ {t('ui.创建批次','创建批次')}</button>
      </div>

      {error && <div style={{
      color: 'var(--status-danger)',
      marginBottom: 8
    }}>{error}</div>}

      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 12,
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid #bfdbfe',
        background: '#eff6ff',
        color: '#1e3a8a',
        fontSize: 12,
        lineHeight: 1.6,
      }}>
        <span aria-hidden="true">ⓘ</span>
        <span>
          {t('ui.库存来源融合说明', '当前数量来自 ERP 业务库存台账；来源单据随批次展示。外部财务库存仅用于对账，未取得差异证据时统一显示“待核验”，不会自动判定一致。')}
        </span>
      </div>

      {/* 创建批次表单 */}
      {showCreate && <div style={{
      background: 'var(--status-success-bg-page)',
      border: '1px solid var(--status-success)',
      borderRadius: 10,
      padding: 20,
      marginBottom: 16
    }}>
          <h4 style={{
        margin: '0 0 12px',
        color: 'var(--status-success-dark)'
      }}>{t('ui.创建生产批次','创建生产批次')}</h4>

          {/* Phase H4: SKU 快捷选择 */}
          <div className={u.mb14}>
            <label style={{
          fontSize: 13,
          display: 'block',
          marginBottom: 4
        }}>
              {t('ui.商品组合（SKU）','商品组合（SKU）')}<span style={{
            fontSize: 11,
            color: 'var(--gray-500)',
            marginLeft: 6
          }}>{t('ui.选择后自动填充产品/等级/规格','选择后自动填充产品/等级/规格')}</span>
            </label>
            {skus.length === 0 ? <div style={{
          fontSize: 12,
          color: 'var(--status-warning)',
          padding: '6px 10px',
          background: 'var(--status-warning-bg-page)',
          borderRadius: 6,
          border: '1px solid var(--status-warning-bg-medium)'
        }}>
                {t('ui.暂无 SKU 主数据，请先在主数据中心维护商品组合','暂无 SKU 主数据，请先在主数据中心维护商品组合')}
              </div> : <select value={form.skuCode} onChange={e => handleSkuSelect(e.target.value)} style={{
          ...inputStyle,
          width: 280
        }}>
                <option value="">{t('ui.— 不使用 SKU 选择器，手动填写 —','— 不使用 SKU 选择器，手动填写 —')}</option>
                {skus.filter(x => x.status === 'ACTIVE').map(x => <option key={x.sku_code} value={x.sku_code}>
                    {x.sku_code}{x.sku_name ? ` · ${x.sku_name}` : ''}
                  </option>)}
              </select>}
          </div>

          <div className={styles.createGrid}>
            {([[t('ui.公司代码','公司代码'), 'companyCode', 'text'], [t('ui.产品代码','产品代码'), 'productCode', 'text'], [t('ui.生产日期','生产日期'), 'eggDate', 'date'], [t('ui.数量（枚）','数量（枚）'), 'qty', 'number'], [t('ui.保质天数','保质天数'), 'shelfDays', 'number'], [t('ui.来源单号','来源单号'), 'sourceNo', 'text'], [t('ui.包装规格','包装规格'), 'packagingSpec', 'text']] as const).map(([label, key, type]) => <label key={key} style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          fontSize: 13
        }}>
                {label}
                <input type={type} min={type === 'number' ? 1 : undefined} value={(form as any)[key]} disabled={!!form.skuCode && ['productCode', 'packagingSpec'].includes(key)} onChange={e => setForm(p => ({
            ...p,
            [key]: e.target.value
          }))} style={{
            ...inputStyle,
            ...(!!form.skuCode && ['productCode', 'packagingSpec'].includes(key) ? {
              background: 'var(--gray-100)',
              color: 'var(--gray-400)'
            } : {})
          }} />
              </label>)}
            <label style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          fontSize: 13
        }}>
              {t('ui.质量等级','质量等级')}
              <select value={form.qualityGrade} disabled={!!form.skuCode} onChange={e => setForm(p => ({
            ...p,
            qualityGrade: e.target.value
          }))} style={{
            ...inputStyle,
            ...(form.skuCode ? {
              background: 'var(--gray-100)',
              color: 'var(--gray-400)'
            } : {})
          }}>
                {['AA', 'A', 'B', 'DIRTY', 'CRACKED', 'DAMAGED'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
          </div>
          {createErr && <div style={{
        color: 'var(--status-danger)',
        marginTop: 8
      }}>{createErr}</div>}
          <div style={{
        display: 'flex',
        gap: 8,
        marginTop: 12
      }}>
            <button onClick={handleCreate} disabled={creating} style={btnStyle('var(--status-success)')}>
              {creating ? t('ui.创建中...','创建中...') : t('ui.确认创建','确认创建')}
            </button>
            <button onClick={() => {
          setShowCreate(false);
          setForm(f => ({
            ...f,
            skuCode: ''
          }));
        }} style={btnStyle('var(--gray-500)')}>{t('ui.取消','取消')}</button>
          </div>
        </div>}

      {/* 批次表格 */}
      {loading ? <LoadingSkeleton variant="table" rows={10} cols={11} /> : <><div className={`${styles.tableScroll} ${styles.desktopTable}`}>
          <table className={`${s.table} ${styles.batchTable}`}>
            <colgroup>
              <col className={styles.batchNoCol} />
              <col className={styles.skuCol} />
              <col className={styles.productCol} />
              <col className={styles.gradeCol} />
              <col className={styles.companyCol} />
              <col className={styles.availableQtyCol} />
              <col className={styles.totalQtyCol} />
              <col className={styles.statusCol} />
              <col className={styles.productionDateCol} />
              <col className={styles.expiryDateCol} />
              <col className={styles.sourceCol} />
            </colgroup>
            <thead>
              <tr>
                {[t('ui.批次号','批次号'), t('ui.商品组合','商品组合'), t('ui.产品代码','产品代码'), t('ui.等级','等级'), t('ui.公司','公司'), t('ui.可用量','可用量'), t('ui.总量','总量'), t('ui.状态','状态'), t('ui.生产日期','生产日期'), t('ui.到期日','到期日'), t('ui.来源','来源')].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && <tr><td colSpan={11} style={{
              textAlign: 'center',
              color: 'var(--gray-400)',
              padding: 40
            }}>{t('ui.暂无数据','暂无数据')}</td></tr>}
              {batches.map(b => <tr key={b.batch_no}>
                  <td><code style={batchCodeCellStyle}>{b.batch_no}</code></td>
                  <td><SkuBadge skuCode={b.sku_code} row={b as unknown as Record<string, unknown>} lang={lang} /></td>
                  <td style={compactCellStyle}>{formatMasterData(b as unknown as Record<string, unknown>, 'product_name', b.product_code, lang)}</td>
                  <td style={compactCellStyle}>
                    <span style={{
                color: gradeColor(b.quality_grade),
                fontWeight: 600
              }}>
                      {b.quality_grade ?? '—'}
                    </span>
                  </td>
                  <td style={compactCellStyle}><span className={styles.companyCell} title={formatMasterData(b as unknown as Record<string, unknown>, 'company_name', b.company_code, lang)}>{formatMasterData(b as unknown as Record<string, unknown>, 'company_name', b.company_code, lang)}</span></td>
                  <td className={`${styles.numericCell} ${styles.numericAccent}`}>{fmt(b.qty_available)}</td>
                  <td className={styles.numericCell}>{fmt(b.qty)}</td>
                  <td style={compactCellStyle}>{statusBadge(b.status, lang)}</td>
                  <td style={compactCellStyle}>{fmtDate(b.egg_date)}</td>
                  <td style={{
              color: b.expire_date && new Date(b.expire_date) < new Date() ? 'var(--status-danger)' : undefined,
              fontWeight: b.expire_date && new Date(b.expire_date) < new Date() ? 700 : undefined,
              whiteSpace: 'nowrap'
            }}>{fmtDate(b.expire_date)}</td>
                  <td><InventorySourceTrace batch={b} /></td>
                </tr>)}
            </tbody>
          </table>
        </div><div className={styles.mobileCards}>{batches.length === 0 ? <div className={styles.emptyCard}>{t('ui.暂无数据','暂无数据')}</div> : batches.map(b => <article key={b.batch_no} className={styles.mobileCard}><header><SkuBadge skuCode={b.sku_code} row={b as unknown as Record<string, unknown>} lang={lang}/>{statusBadge(b.status,lang)}</header><code>{b.batch_no}</code><strong>{fmt(b.qty_available)} / {fmt(b.qty)}</strong><p>{formatMasterData(b as unknown as Record<string, unknown>,'product_name',b.product_code,lang)} · {b.quality_grade ?? '—'}</p><p>{formatMasterData(b as unknown as Record<string, unknown>,'company_name',b.company_code,lang)}</p><small>{fmtDate(b.egg_date)} → {fmtDate(b.expire_date)}</small><InventorySourceTrace batch={b}/></article>)}</div></>}
    </div>;
}

// ── Tab: 临期库存 ─────────────────────────────────────────────────────────────

function ExpiringTab() {
  const { t, lang } = useLanguage();
  const [batches, setBatches] = useState<InvBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState(7);
  const [companyCode, setCompanyCode] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        days: String(days)
      });
      if (companyCode) params.set('companyCode', companyCode);
      const data = await api<InvBatch[]>('GET', `/expiring?${params}`);
      setBatches(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [days, companyCode]);
  useEffect(() => {
    load();
  }, [load]);
  return <div>
      <div className={styles.filters}>
        <label className={u.fs13}>
          {t('ui.预警天数：','预警天数：')}
          <select value={days} onChange={e => setDays(Number(e.target.value))} style={{
          ...inputStyle,
          marginLeft: 6
        }}>
            {[3, 5, 7, 10, 14].map(d => <option key={d} value={d}>{d} {t('ui.天','天')}</option>)}
          </select>
        </label>
        <input value={companyCode} onChange={e => setCompanyCode(e.target.value)} placeholder={t('ui.公司代码','公司代码')} style={inputStyle} />
        <button onClick={load} style={btnStyle('var(--status-warning)')}>{t('ui.查询','查询')}</button>
      </div>
      {error && <div style={{
      color: 'var(--status-danger)',
      marginBottom: 8
    }}>{error}</div>}

      {loading ? <LoadingSkeleton variant="table" rows={10} cols={9} /> : <><div className={`${styles.tableScroll} ${styles.desktopTable}`}>
          <table className={`${s.table} ${styles.expiringTable}`}>
            <colgroup>
              <col className={styles.expiringBatchNoCol} />
              <col className={styles.expiringSkuCol} />
              <col className={styles.expiringProductCol} />
              <col className={styles.expiringGradeCol} />
              <col className={styles.expiringCompanyCol} />
              <col className={styles.expiringQtyCol} />
              <col className={styles.expiringDateCol} />
              <col className={styles.expiringDaysCol} />
              <col className={styles.expiringStatusCol} />
            </colgroup>
            <thead>
              <tr>
                {[t('ui.批次号','批次号'), t('ui.商品组合','商品组合'), t('ui.产品','产品'), t('ui.等级','等级'), t('ui.公司','公司'), t('ui.可用量','可用量'), t('ui.到期日','到期日'), t('ui.剩余天数','剩余天数'), t('ui.状态','状态')].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && <tr><td colSpan={9} style={{
              textAlign: 'center',
              color: 'var(--gray-400)',
              padding: 40
            }}>{t('ui.无临期库存','无临期库存')}</td></tr>}
              {batches.map(b => {
            const daysLeft = (b as any).days_remaining ?? 0;
            const urgent = daysLeft <= 3;
            return <tr key={b.batch_no} style={{
              background: urgent ? 'var(--status-danger-bg-page)' : 'var(--status-warning-bg-page)'
            }}>
                    <td><code className={u.fs11}>{b.batch_no}</code></td>
                    <td><SkuBadge skuCode={b.sku_code} row={b as unknown as Record<string, unknown>} lang={lang} /></td>
                    <td>{formatMasterData(b as unknown as Record<string, unknown>, 'product_name', b.product_code, lang)}</td>
                    <td>
                      <span style={{
                  color: gradeColor(b.quality_grade),
                  fontWeight: 600
                }}>
                        {b.quality_grade ?? '—'}
                      </span>
                    </td>
                    <td><span className={styles.companyCell} title={formatMasterData(b as unknown as Record<string, unknown>, 'company_name', b.company_code, lang)}>{formatMasterData(b as unknown as Record<string, unknown>, 'company_name', b.company_code, lang)}</span></td>
                    <td className={`${styles.numericCell} ${styles.numericAccent}`}>{fmt(b.qty_available)}</td>
                    <td>{b.expire_date ?? '—'}</td>
                    <td style={{
                color: urgent ? 'var(--status-danger)' : 'var(--status-warning)',
                fontWeight: 700
              }}>
                      {daysLeft} {t('ui.天','天')} {urgent && t('ui.⚠ 紧急','⚠ 紧急')}
                    </td>
                    <td>{statusBadge(b.status, lang)}</td>
                  </tr>;
          })}
            </tbody>
          </table>
        </div><div className={styles.mobileCards}>{batches.length === 0 ? <div className={styles.emptyCard}>{t('ui.无临期库存','无临期库存')}</div> : batches.map(b => <article key={b.batch_no} className={styles.mobileCard}><header><SkuBadge skuCode={b.sku_code} row={b as unknown as Record<string,unknown>} lang={lang}/>{statusBadge(b.status,lang)}</header><code>{b.batch_no}</code><strong>{fmt(b.qty_available)}</strong><p>{formatMasterData(b as unknown as Record<string,unknown>,'product_name',b.product_code,lang)} · {b.quality_grade ?? '—'}</p><p>{formatMasterData(b as unknown as Record<string,unknown>,'company_name',b.company_code,lang)}</p><small>{b.expire_date ?? '—'} · {(b.days_remaining ?? 0)} {t('ui.天','天')}</small></article>)}</div></>}
    </div>;
}

// ── Tab: FIFO 出库 ────────────────────────────────────────────────────────────

function FifoTab() {
  const { t } = useLanguage();
  const [skus, setSkus] = useState<SkuItem[]>([]);
  const [form, setForm] = useState({
    productCode: 'EGG',
    gradeCode: '',
    companyCode: '',
    qty: '',
    refNo: '',
    note: '',
    // Phase H4
    skuCode: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    loadSkus().then(setSkus);
  }, []);

  /** Phase H4: 选择 SKU → 自动填充 productCode */
  const handleSkuSelect = (skuCode: string) => {
    const sku = skus.find(x => x.sku_code === skuCode);
    if (sku) {
      setForm(f => ({
        ...f,
        skuCode,
        productCode: sku.product_code,
        gradeCode: sku.grade_code
      }));
    } else {
      setForm(f => ({
        ...f,
        skuCode
      }));
    }
  };
  const handleAllocate = async () => {
    if (!form.companyCode || !form.qty || !form.refNo) {
      setError(t('ui.请填写公司代码、数量和单号','请填写公司代码、数量和单号'));
      return;
    }
    if (!form.skuCode && !form.productCode) {
      setError(t('ui.请选择商品组合或填写产品代码','请选择商品组合或填写产品代码'));
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await api<Record<string, unknown>>('POST', '/allocate', {
        productCode: form.productCode,
        gradeCode: form.gradeCode || undefined,
        companyCode: form.companyCode,
        qty: Number(form.qty),
        refNo: form.refNo,
        note: form.note || '手动分配',
        // Phase H4
        skuCode: form.skuCode || undefined
      });
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  return <div style={{
    maxWidth: 560
  }}>
      <h4 style={{
      marginTop: 0,
      color: 'var(--gray-700)'
    }}>{t('ui.手动 FIFO 分配（测试 / 调整用）','手动 FIFO 分配（测试 / 调整用）')}</h4>
      <p style={{
      fontSize: 13,
      color: 'var(--gray-500)',
      marginBottom: 16
    }}>
        {t('ui.系统在销售订单审批通过时自动执行 FIFO 预留，此页面仅供管理员手动调整。','系统在销售订单审批通过时自动执行 FIFO 预留，此页面仅供管理员手动调整。')}
        {t('ui.支持按商品组合（SKU）精确分配。','支持按商品组合（SKU）精确分配。')}
      </p>

      {/* Phase H4: SKU 快捷选择 */}
      {skus.length > 0 && <div className={u.mb16}>
          <label style={{
        fontSize: 13,
        display: 'block',
        marginBottom: 4
      }}>
            {t('ui.商品组合（SKU）优先分配','商品组合（SKU）优先分配')}
          </label>
          <select value={form.skuCode} onChange={e => handleSkuSelect(e.target.value)} style={{
        ...inputStyle,
        width: '100%'
      }}>
            <option value="">{t('ui.— 不使用 SKU 路径，手动填写产品代码 —','— 不使用 SKU 路径，手动填写产品代码 —')}</option>
            {skus.filter(x => x.status === 'ACTIVE').map(x => <option key={x.sku_code} value={x.sku_code}>{x.sku_code}</option>)}
          </select>
        </div>}

      <div className={styles.fifoGrid}>
        {([[t('ui.产品代码','产品代码'), 'productCode', 'text'], [t('ui.公司代码','公司代码'), 'companyCode', 'text'], [t('ui.分配数量','分配数量'), 'qty', 'number'], [t('ui.参考单号','参考单号'), 'refNo', 'text'], [t('ui.备注','备注'), 'note', 'text']] as const).map(([label, key, type]) => <label key={key} style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        fontSize: 13
      }}>
            {label}
            <input type={type} value={(form as any)[key]} disabled={!!form.skuCode && key === 'productCode'} onChange={e => setForm(p => ({
          ...p,
          [key]: e.target.value
        }))} style={{
          ...inputStyle,
          ...(form.skuCode && key === 'productCode' ? {
            background: 'var(--gray-100)',
            color: 'var(--gray-400)'
          } : {})
        }} />
          </label>)}
        {!form.skuCode && <label style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        fontSize: 13
      }}>
            {t('ui.质量等级（可选）','质量等级（可选）')}
            <select value={form.gradeCode} onChange={e => setForm(p => ({
          ...p,
          gradeCode: e.target.value
        }))} style={inputStyle}>
              <option value="">{t('ui.不限等级','不限等级')}</option>
              {['AA', 'A', 'B'].map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>}
      </div>
      {error && <div style={{
      color: 'var(--status-danger)',
      marginTop: 10
    }}>{error}</div>}
      <button onClick={handleAllocate} disabled={loading} style={{
      ...btnStyle('var(--color-accent)'),
      marginTop: 16
    }}>
        {loading ? t('ui.分配中...','分配中...') : t('ui.执行 FIFO 分配','执行 FIFO 分配')}
      </button>
      {result && <div style={{
      marginTop: 16,
      background: 'var(--status-success-bg-page)',
      border: '1px solid var(--status-success)',
      borderRadius: 8,
      padding: 16,
      fontSize: 13
    }}>
          <strong style={{
        color: 'var(--status-success-dark)'
      }}>{t('ui.分配成功','分配成功')}</strong>
          <pre style={{
        margin: '8px 0 0',
        fontSize: 12,
        overflow: 'auto'
      }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>}
    </div>;
}

// ── Tab: 损耗分析 ─────────────────────────────────────────────────────────────

function LossTab() {
  const { t, lang } = useLanguage();
  const skuNames = useMasterNames('sku');
  const [data, setData] = useState<LossAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
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
  useEffect(() => {
    load();
  }, [load]);
  const changeTypeLabel: Record<string, string> = {
    EXPIRE_WRITEOFF: t('ui.过期核销','过期核销'),
    DAMAGE_WRITEOFF: t('ui.破损核销','破损核销'),
    WRITE_OFF: t('ui.手动核销','手动核销')
  };
  return <div>
      <div className={styles.filters}>
        <input value={companyCode} onChange={e => setCompanyCode(e.target.value)} placeholder={t('ui.公司代码（可选）','公司代码（可选）')} style={inputStyle} />
        <button onClick={load} style={btnStyle('var(--color-purple-600)')}>{t('ui.刷新','刷新')}</button>
      </div>
      {error && <div style={{
      color: 'var(--status-danger)',
      marginBottom: 8
    }}>{error}</div>}

      {loading ? <LoadingSkeleton variant="table" rows={10} cols={5} /> : data && <div>
          <div className={styles.lossKpis}>
            <StatCard label={t('ui.30日过期损耗（枚）','30日过期损耗（枚）')} value={fmt(data.summary.total_expire_loss)} tone="red" />
            <StatCard label={t('ui.30日破损损耗（枚）','30日破损损耗（枚）')} value={fmt(data.summary.total_damage_loss)} tone="amber" />
            <StatCard label={t('ui.30日合计损耗（枚）','30日合计损耗（枚）')} value={fmt(data.summary.total_loss)} tone="purple" />
          </div>

          <h4 style={{
        color: 'var(--gray-700)',
        marginBottom: 8
      }}>{t('ui.按损耗类型（近30天）','按损耗类型（近30天）')}</h4>
          <div className={`${styles.tableScroll} ${u.mb24}`}><table className={`${s.table} ${styles.lossTypeTable}`}>
            <thead>
              <tr>
                {[t('ui.损耗类型','损耗类型'), t('ui.批次数','批次数'), t('ui.合计损耗（枚）','合计损耗（枚）')].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {(data.byType ?? []).map((row, i) => <tr key={i}>
                  <td>{changeTypeLabel[row.change_type] ?? row.change_type}</td>
                  <td>{fmt(row.batch_count)}</td>
                  <td style={{
              fontWeight: 700,
              color: 'var(--status-danger)'
            }}>{fmt(row.total_loss)}</td>
                </tr>)}
              {(data.byType ?? []).length === 0 && <tr><td colSpan={3} style={{
              textAlign: 'center',
              color: 'var(--gray-400)',
              padding: 24
            }}>{t('ui.近30天无损耗记录','近30天无损耗记录')}</td></tr>}
            </tbody>
          </table></div>

          <h4 style={{
        color: 'var(--gray-700)',
        marginBottom: 8
      }}>{t('ui.按批次损耗排名（近30天）','按批次损耗排名（近30天）')}</h4>
          <div className={styles.tableScroll}><table className={`${s.table} ${styles.lossBatchTable}`}>
            <thead>
              <tr>
                {[t('ui.批次号','批次号'), t('ui.商品组合','商品组合'), t('ui.产品代码','产品代码'), t('ui.合计损耗','合计损耗'), t('ui.最后事件时间','最后事件时间')].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {(data.byBatch ?? []).slice(0, 20).map((row, i) => <tr key={i}>
                  <td><code className={u.fs11}>{row.batch_no}</code></td>
                  <td><SkuBadge skuCode={row.sku_code} row={skuNames.get(String(row.sku_code))} lang={lang} /></td>
                  <td>{row.product_code}</td>
                  <td style={{
              fontWeight: 700,
              color: 'var(--status-danger)'
            }}>{fmt(row.total_loss)}</td>
                  <td>{row.last_event ? new Date(row.last_event).toLocaleString('zh-CN') : '—'}</td>
                </tr>)}
              {(data.byBatch ?? []).length === 0 && <tr><td colSpan={5} style={{
              textAlign: 'center',
              color: 'var(--gray-400)',
              padding: 24
            }}>{t('ui.暂无数据','暂无数据')}</td></tr>}
            </tbody>
          </table></div>
        </div>}
    </div>;
}

// ── 共用样式 ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid var(--gray-300)',
  borderRadius: 6,
  fontSize: 13,
  outline: 'none',
  background: 'var(--bg-card)'
};
const batchCodeCellStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--gray-700)',
  lineHeight: 1.45,
  wordBreak: 'normal',
  overflowWrap: 'anywhere',
};
const compactCellStyle: React.CSSProperties = {
  whiteSpace: 'nowrap',
};
function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: '6px 14px',
    background: bg,
    color: 'var(--bg-card)',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600
  };
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

const TABS = [{
  key: 'batches',
  label: '批次库存'
}, {
  key: 'expiring',
  label: '临期库存'
}, {
  key: 'fifo',
  label: 'FIFO 出库'
}, {
  key: 'loss',
  label: '损耗分析'
}];
export default function InventoryPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<string>('batches');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  useEffect(() => {
    api<DashboardStats>('GET', '/stats').then(setStats).catch(() => {});
  }, []);
  return <div className={styles.page}>
      <PageHeader title={t('ui.库存管理','库存管理')} subtitle={t('ui.先进先出 · SKU 精确分配 · 到期预警 · 损耗分析','先进先出 · SKU 精确分配 · 到期预警 · 损耗分析')} breadcrumb={[t('ui.销售系统','销售系统'), t('ui.库存管理','库存管理')]} />

      {/* 仪表盘统计 */}
      {stats && <div className={styles.kpis}>
          <StatCard label={t('ui.活跃批次','活跃批次')} value={stats.activeBatches} tone="blue" />
          <StatCard label={t('ui.总可用库存（枚）','总可用库存（枚）')} value={fmt(stats.totalAvailable)} tone="green" />
          <StatCard label={`${t('ui.临期批次','临期批次')}（≤${stats.expiringWarnDays ?? 7}${t('ui.天','天')}）`} value={stats.expiringBatches} tone="amber" sub={`${fmt(stats.expiringQty)} ${t('ui.枚','枚')}`} />
          <StatCard label={t('ui.已过期批次','已过期批次')} value={stats.expiredBatches} tone="red" />
          <StatCard label={t('ui.退货待检批次','退货待检批次')} value={stats.returnedBatches} tone="purple" />
          {stats.skuLinkedBatches !== undefined && <StatCard label={t('ui.已接入 SKU 批次','已接入 SKU 批次')} value={stats.skuLinkedBatches} tone="blue" sub={t('ui.SKU 批次','SKU 批次')} />}
          <StatCard label={t('ui.今日过期损耗（枚）','今日过期损耗（枚）')} value={fmt(stats.todayExpireLoss)} tone="red" />
          <StatCard label={t('ui.今日破损损耗（枚）','今日破损损耗（枚）')} value={fmt(stats.todayDamageLoss)} tone="amber" />
        </div>}

      {/* 标签页 */}
      <div className={styles.tabs}>
        {TABS.map(t => <button key={t.key} onClick={() => setTab(t.key)} style={{
        padding: '8px 18px',
        border: 'none',
        borderRadius: '6px 6px 0 0',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 600,
        background: tab === t.key ? 'var(--color-accent)' : 'transparent',
        color: tab === t.key ? 'var(--bg-card)' : 'var(--gray-500)',
        borderBottom: tab === t.key ? '2px solid var(--color-accent)' : '2px solid transparent',
        marginBottom: -2
      }}>
            {t.label}
          </button>)}
      </div>

      {/* 内容区 */}
      <div className={styles.content}>
        {tab === 'batches' && <BatchesTab />}
        {tab === 'expiring' && <ExpiringTab />}
        {tab === 'fifo' && <FifoTab />}
        {tab === 'loss' && <LossTab />}
      </div>
    </div>;
}
