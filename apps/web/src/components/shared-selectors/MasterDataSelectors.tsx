'use client';
import { useState, useEffect } from 'react';
import request from '@/lib/api-client';

/**
 * 统一主数据选择器（G4-A 财务单据主数据驱动）
 * ════════════════════════════════════════════════════════════════════════
 * 所有选择器只加载 ACTIVE 主数据；选中后通过 onChange(code) + onPick(item) 回传，
 * 业务表单据此自动带出名称等字段，杜绝裸字段手填。
 *
 * 复用 G3-A 的 /master-data/runtime/:type/active（仅 ACTIVE + 生效期内）。
 */

interface Opt { value: string; label: string; raw?: any }

interface BaseProps {
  value: string;
  onChange: (value: string) => void;
  onPick?: (opt: Opt | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const selStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 7,
  border: '1px solid var(--border)', background: 'var(--bg-card)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
};

/** 通用：从端点加载 {value,label} 选项的下拉 */
function ScopedSelect({
  value, onChange, onPick, placeholder = '请选择', disabled, className, style,
  loader,
}: BaseProps & { loader: () => Promise<Opt[]> }) {
  const [opts, setOpts] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loader().then(list => { if (alive) setOpts(list); }).catch(() => { if (alive) setOpts([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []); // eslint-disable-line

  return (
    <select className={className} style={{ ...selStyle, ...style }} value={value} disabled={disabled || loading}
      onChange={e => { onChange(e.target.value); onPick?.(opts.find(o => o.value === e.target.value) ?? null); }}>
      <option value="">{loading ? '加载中…' : placeholder}</option>
      {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ── 客户（仅 ACTIVE）──────────────────────────────────────────────────────────
export function CustomerSelector(p: BaseProps) {
  return <ScopedSelect {...p} placeholder={p.placeholder ?? '请选择客户'}
    loader={async () => (await request<any[]>('/master-data/runtime/customer/active')).map(r => ({ value: r.code, label: `${r.name}（${r.code}）`, raw: r }))} />;
}

// ── 供应商（仅 ACTIVE）────────────────────────────────────────────────────────
export function SupplierSelector(p: BaseProps) {
  return <ScopedSelect {...p} placeholder={p.placeholder ?? '请选择供应商'}
    loader={async () => (await request<any[]>('/master-data/runtime/supplier/active')).map(r => ({ value: r.code, label: `${r.name}（${r.code}）`, raw: r }))} />;
}

// ── 项目公司（仅 ACTIVE）──────────────────────────────────────────────────────
export function ProjectSelector(p: BaseProps) {
  return <ScopedSelect {...p} placeholder={p.placeholder ?? '请选择项目'}
    loader={async () => (await request<any[]>('/master-data/runtime/project/active')).map(r => ({ value: r.code, label: `${r.name}（${r.code}）`, raw: r }))} />;
}

// ── 公司（org_units COMPANY 类型，DataScope 由后端鉴权）────────────────────────
export function CompanySelector(p: BaseProps) {
  return <ScopedSelect {...p} placeholder={p.placeholder ?? '请选择公司'}
    loader={async () => {
      const list = await request<any[]>('/org/organizations?type=COMPANY');
      return (Array.isArray(list) ? list : [])
        .filter(o => (o.status ?? 'ACTIVE') === 'ACTIVE')
        .map(o => ({ value: o.orgCode ?? o.org_code, label: o.orgName ?? o.org_name, raw: o }));
    }} />;
}

// ── 资金账户（fin_cash_accounts，仅 ACTIVE）────────────────────────────────────
/**
 * valueField:
 *   - 'code'（默认）：value = account_code，适用于 fin_payment.payer_account 这类文本字段
 *   - 'id'：value = uuid，适用于 fin_fund_transfer / fin_reimbursement / fin_ar_receipt 这类 FK
 * currencyCode：可选过滤，仅显示该币种账户
 */
export function CashAccountSelector(p: BaseProps & { valueField?: 'code' | 'id'; currencyCode?: string }) {
  const { valueField = 'code', currencyCode, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? '请选择资金账户'}
    loader={async () => {
      const r = await request<any>('/v2/finance/cash/accounts');
      const list: any[] = Array.isArray(r) ? r : (r?.items ?? r?.data ?? []);
      return list
        .filter(a => (a.status ?? 'ACTIVE') === 'ACTIVE')
        .filter(a => !currencyCode || (a.currency_code ?? a.currencyCode) === currencyCode)
        .map(a => {
          const code = a.account_code ?? a.accountCode;
          const id   = a.id;
          const name = a.account_name ?? a.accountName;
          const ccy  = a.currency_code ?? a.currencyCode ?? '';
          const bal  = a.current_balance ?? a.currentBalance;
          const balStr = bal !== undefined ? `｜余额 ${Number(bal).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` : '';
          return {
            value: valueField === 'id' ? id : code,
            label: `${name}（${code}${ccy ? ' ' + ccy : ''}）${balStr}`,
            raw: a,
          };
        });
    }} />;
}

// ── 股东 ──────────────────────────────────────────────────────────────────────
export function ShareholderSelector(p: BaseProps) {
  return <ScopedSelect {...p} placeholder={p.placeholder ?? '请选择股东'}
    loader={async () => {
      const list = await request<any[]>('/shareholders');
      return (Array.isArray(list) ? list : [])
        .map(s => ({ value: s.shareholderCode ?? s.shareholder_code, label: s.shareholderName ?? s.shareholder_name, raw: s }));
    }} />;
}
