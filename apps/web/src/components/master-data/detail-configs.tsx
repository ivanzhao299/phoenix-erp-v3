'use client';

/**
 * detail-configs.tsx — UIX-8 通用主数据详情配置
 *
 * 6 类配置：customer / supplier / product / warehouse / project / sku
 * 每个 config 描述：业务 KPI / 基础字段 / 自定义 sections / 引用 objectType
 */

import { ReactNode } from 'react';
import {
  Phone, User, Building2, Calendar, ShoppingCart, ShoppingBag,
  Receipt, CreditCard, Activity, AlertCircle, Package, Layers,
  Warehouse, FolderOpen, Banknote, BookOpen, Snowflake,
  Network, Truck, MapPin, Coins, Wallet, Tag, Box, Users, Globe,
} from 'lucide-react';

export interface KpiSpec {
  label: string;
  icon: ReactNode;
  value: (info: any, extra: Record<string, any>) => { display: ReactNode; suffix?: string; tone?: 'default' | 'warning' | 'danger' | 'success' } | null;
}

export interface BasicField {
  key: string;
  label: string;
  format?: (v: any, info: any) => string;
}

export interface SectionSpec {
  title: string;
  render: (extra: Record<string, any>, info: any) => ReactNode;
}

export interface ExtraApiSpec {
  key: string;
  label: string;
  /** 路径里用 :code 占位 */
  path: string;
}

export interface MasterDataConfig {
  type: string;            // customer / supplier / product / warehouse / project / sku
  centerName: string;      // 标题中心名（如"客户中心"）
  nameKey: string;
  referenceObjectType: string; // CUSTOMER / SUPPLIER / ...
  kpis?: KpiSpec[];
  basicFields?: BasicField[];
  extraApis?: ExtraApiSpec[];
  sections?: SectionSpec[];
}

// ── 通用：金额格式化 ───────────────────────────────────────
const yuan = (v: any) => v ? `¥${Number(v).toLocaleString()}` : '—';
const dateStr = (v: any) => v ? new Date(v).toLocaleDateString('zh-CN') : '—';
const dateTime = (v: any) => v ? new Date(v).toLocaleString('zh-CN') : '—';
const arr = (v: any): any[] => Array.isArray(v) ? v : (v?.items || v?.data || []);

// ── 通用：简单"最近 N 行"列表渲染 ─────────────────────────
function RecentRows({ rows, getKey, getLabel, getSub, getRight }: {
  rows: any[]; getKey: (r: any) => string;
  getLabel: (r: any) => ReactNode; getSub?: (r: any) => ReactNode;
  getRight?: (r: any) => ReactNode;
}) {
  if (!rows || rows.length === 0) {
    return <div style={{ padding: '16px 12px', textAlign: 'center', background: 'var(--bg-muted)', borderRadius: 'var(--radius-card)', fontSize: 12, color: 'var(--text-secondary)' }}>暂无</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(r => (
        <div key={getKey(r)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 12 }}>{getLabel(r)}</div>
            {getSub && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{getSub(r)}</span>}
          </div>
          {getRight && <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{getRight(r)}</div>}
        </div>
      ))}
    </div>
  );
}

// ── 配置：客户 ────────────────────────────────────────────
export const customerConfig: MasterDataConfig = {
  type: 'customer',
  centerName: '客户中心',
  nameKey: 'customer_name',
  referenceObjectType: 'CUSTOMER',
  extraApis: [
    { key: 'orders',    label: '订单',  path: '/v2/sales/orders?customer_code=:code&limit=5' },
    { key: 'arSummary', label: 'AR',    path: '/v2/finance/ar/summary?customer_code=:code' },
  ],
  kpis: [
    {
      label: '订单数', icon: <ShoppingCart size={16} />,
      value: (_i, extra) => { const list = arr(extra.orders); return { display: list.length, suffix: '单 (近期)' }; },
    },
    {
      label: '近期销售额', icon: <Activity size={16} />,
      value: (_i, extra) => { const total = arr(extra.orders).reduce((s, o) => s + Number(o.total_amount || 0), 0); return { display: total > 0 ? yuan(total) : '—' }; },
    },
    {
      label: 'AR 余额', icon: <Receipt size={16} />,
      value: (_i, extra) => {
        const bal = extra.arSummary?.balance_amount_original;
        return { display: bal ? yuan(bal) : '—', tone: Number(bal || 0) > 0 ? 'warning' : 'default' };
      },
    },
    {
      label: '逾期单据', icon: <AlertCircle size={16} />,
      value: (_i, extra) => {
        const n = extra.arSummary?.overdue_invoices ?? 0;
        return { display: n, tone: n > 0 ? 'danger' : 'default' };
      },
    },
  ],
  basicFields: [
    { key: 'contact_name',  label: '联系人' },
    { key: 'contact_phone', label: '联系电话' },
    { key: 'company_code',  label: '所属公司' },
    { key: 'customer_type', label: '客户类型' },
    { key: 'effective_date', label: '生效日期', format: dateStr },
    { key: 'expire_date',    label: '失效日期', format: (v) => v ? dateStr(v) : '永久' },
  ],
  sections: [
    {
      title: '最近订单',
      render: (extra) => {
        const rows = arr(extra.orders).slice(0, 5);
        return (
          <RecentRows
            rows={rows}
            getKey={(r) => String(r.id)}
            getLabel={(r) => <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>{r.order_no}</code>}
            getSub={(r) => dateTime(r.created_at)}
            getRight={(r) => (
              <>
                <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{yuan(r.total_amount)}</strong>
                <span style={{ padding: '1px 7px', fontSize: 11, fontWeight: 600, background: 'var(--bg-muted)', color: 'var(--text-secondary)', borderRadius: 100 }}>{r.status}</span>
              </>
            )}
          />
        );
      },
    },
  ],
};

// ── 配置：供应商 ─────────────────────────────────────────
export const supplierConfig: MasterDataConfig = {
  type: 'supplier',
  centerName: '供应商中心',
  nameKey: 'supplier_name',
  referenceObjectType: 'SUPPLIER',
  extraApis: [
    { key: 'pos', label: '采购单', path: '/v2/procurement/orders?supplier_code=:code&limit=5' },
    { key: 'apSummary', label: 'AP', path: '/v2/finance/ap/summary?supplier_code=:code' },
  ],
  kpis: [
    {
      label: '采购单数', icon: <ShoppingBag size={16} />,
      value: (_i, extra) => { const list = arr(extra.pos); return { display: list.length, suffix: '单 (近期)' }; },
    },
    {
      label: '近期采购额', icon: <Activity size={16} />,
      value: (_i, extra) => { const total = arr(extra.pos).reduce((s, o) => s + Number(o.total_amount || 0), 0); return { display: total > 0 ? yuan(total) : '—' }; },
    },
    {
      label: 'AP 余额', icon: <CreditCard size={16} />,
      value: (_i, extra) => { const bal = extra.apSummary?.balance_amount_original; return { display: bal ? yuan(bal) : '—', tone: Number(bal || 0) > 0 ? 'warning' : 'default' }; },
    },
    {
      label: '逾期单据', icon: <AlertCircle size={16} />,
      value: (_i, extra) => { const n = extra.apSummary?.overdue_invoices ?? 0; return { display: n, tone: n > 0 ? 'danger' : 'default' }; },
    },
  ],
  basicFields: [
    { key: 'contact_name',  label: '联系人' },
    { key: 'contact_phone', label: '联系电话' },
    { key: 'country_code',  label: '国家' },
    { key: 'supplier_type', label: '类型' },
    { key: 'default_currency', label: '默认币种' },
    { key: 'payment_terms', label: '账期', format: (v) => v ? `${v} 天` : '—' },
  ],
  sections: [
    {
      title: '最近采购',
      render: (extra) => {
        const rows = arr(extra.pos).slice(0, 5);
        return (
          <RecentRows
            rows={rows}
            getKey={(r) => String(r.id)}
            getLabel={(r) => <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>{r.po_no}</code>}
            getSub={(r) => dateTime(r.created_at)}
            getRight={(r) => (
              <>
                <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{yuan(r.total_amount)}</strong>
                <span style={{ padding: '1px 7px', fontSize: 11, fontWeight: 600, background: 'var(--bg-muted)', color: 'var(--text-secondary)', borderRadius: 100 }}>{r.status}</span>
              </>
            )}
          />
        );
      },
    },
  ],
};

// ── 配置：产品 ───────────────────────────────────────────
export const productConfig: MasterDataConfig = {
  type: 'product',
  centerName: '产品中心',
  nameKey: 'product_name',
  referenceObjectType: 'PRODUCT',
  extraApis: [
    { key: 'skus', label: 'SKU 列表', path: '/product-master/skus?product_code=:code&limit=10' },
  ],
  kpis: [
    {
      label: '关联 SKU', icon: <Package size={16} />,
      value: (_i, extra) => { const list = arr(extra.skus); return { display: list.length, suffix: '个' }; },
    },
    {
      label: '保质期', icon: <Calendar size={16} />,
      value: (info) => ({ display: info?.shelf_life_days ? `${info.shelf_life_days}d` : '—' }),
    },
    {
      label: '计量单位', icon: <Layers size={16} />,
      value: (info) => ({ display: info?.unit_zh || info?.unit_lo || '—' }),
    },
    {
      label: '类目', icon: <BookOpen size={16} />,
      value: (info) => ({ display: info?.category_code || '—' }),
    },
  ],
  basicFields: [
    { key: 'product_name_zh', label: '中文名' },
    { key: 'product_name_lo', label: '老挝语名' },
    { key: 'category_code',   label: '品类' },
    { key: 'unit_zh',         label: '计量单位' },
    { key: 'shelf_life_days', label: '保质期(天)' },
    { key: 'price_retail',    label: '零售价' },
  ],
  sections: [
    {
      title: '关联 SKU',
      render: (extra) => {
        const rows = arr(extra.skus).slice(0, 10);
        return (
          <RecentRows
            rows={rows}
            getKey={(r) => String(r.id || r.sku_code)}
            getLabel={(r) => <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>{r.sku_code}</code>}
            getSub={(r) => `${r.grade_code || '—'} · ${r.spec_code || '—'}`}
            getRight={(r) => <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{r.sku_name || ''}</span>}
          />
        );
      },
    },
  ],
};

// ── 配置：仓库 ───────────────────────────────────────────
export const warehouseConfig: MasterDataConfig = {
  type: 'warehouse',
  centerName: '仓库中心',
  nameKey: 'warehouse_name',
  referenceObjectType: 'WAREHOUSE',
  extraApis: [
    { key: 'batches', label: '批次', path: '/inventory/batches?warehouse_code=:code&limit=10' },
  ],
  kpis: [
    {
      label: '批次数', icon: <Package size={16} />,
      value: (_i, extra) => { const list = arr(extra.batches); return { display: list.length, suffix: '批 (取样)' }; },
    },
    {
      label: '总量', icon: <Layers size={16} />,
      value: (_i, extra) => { const total = arr(extra.batches).reduce((s, b) => s + Number(b.qty || 0), 0); return { display: total }; },
    },
    {
      label: '冻结/不可用', icon: <Snowflake size={16} />,
      value: (_i, extra) => {
        const frozen = arr(extra.batches).filter(b => b.status === 'FROZEN' || b.status === 'DAMAGED' || b.status === 'QUARANTINE').length;
        return { display: frozen, tone: frozen > 0 ? 'warning' : 'default' };
      },
    },
    {
      label: '可用比例', icon: <Activity size={16} />,
      value: (_i, extra) => {
        const all = arr(extra.batches);
        if (all.length === 0) return { display: '—' };
        const ok = all.filter(b => b.status === 'AVAILABLE').length;
        return { display: `${Math.round((ok / all.length) * 100)}%` };
      },
    },
  ],
  basicFields: [
    { key: 'warehouse_name_zh', label: '中文名' },
    { key: 'type',              label: '类型' },
    { key: 'company_code',      label: '公司' },
    { key: 'manager',           label: '负责人' },
    { key: 'effective_date',    label: '生效日期', format: dateStr },
  ],
  sections: [
    {
      title: '最近批次',
      render: (extra) => {
        const rows = arr(extra.batches).slice(0, 8);
        return (
          <RecentRows
            rows={rows}
            getKey={(r) => String(r.id || r.batch_no)}
            getLabel={(r) => <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>{r.batch_no}</code>}
            getSub={(r) => `${r.sku_code || r.product_code || '—'} · qty ${r.qty || 0}`}
            getRight={(r) => <span style={{ padding: '1px 7px', fontSize: 11, fontWeight: 600, background: 'var(--bg-muted)', color: 'var(--text-secondary)', borderRadius: 100 }}>{r.status}</span>}
          />
        );
      },
    },
  ],
};

// ── 配置：项目 ───────────────────────────────────────────
export const projectConfig: MasterDataConfig = {
  type: 'project',
  centerName: '项目中心',
  nameKey: 'project_name',
  referenceObjectType: 'PROJECT',
  basicFields: [
    { key: 'company_code',     label: '公司' },
    { key: 'site_code',        label: '场站' },
    { key: 'project_type',     label: '项目类型' },
    { key: 'effective_date',   label: '生效日期', format: dateStr },
    { key: 'expire_date',      label: '失效日期', format: (v) => v ? dateStr(v) : '长期' },
    { key: 'remark',           label: '备注' },
  ],
  kpis: [
    {
      label: '状态', icon: <FolderOpen size={16} />,
      value: (info) => ({ display: info?.status || '—' }),
    },
    {
      label: '公司归属', icon: <Building2 size={16} />,
      value: (info) => ({ display: info?.company_code || '—' }),
    },
  ],
};

// ── 配置：组织（UIX-9A）─────────────────────────────────
export const organizationConfig: MasterDataConfig = {
  type: 'organization',
  centerName: '组织中心',
  nameKey: 'org_name',
  referenceObjectType: 'ORGANIZATION',
  kpis: [
    { label: '组织类型', icon: <Network size={16} />, value: (info) => ({ display: info?.org_type || '—' }) },
    { label: '层级',     icon: <Layers size={16} />,  value: (info) => ({ display: info?.level ?? '—' }) },
    { label: '上级',     icon: <FolderOpen size={16} />, value: (info) => ({ display: info?.parent_code || '顶级' }) },
    { label: '负责人',   icon: <User size={16} />,    value: (info) => ({ display: info?.manager_name || info?.manager || '—' }) },
  ],
  basicFields: [
    { key: 'org_short_name', label: '简称' },
    { key: 'org_type',       label: '类型' },
    { key: 'parent_code',    label: '上级组织' },
    { key: 'company_code',   label: '关联公司' },
    { key: 'sort_order',     label: '排序权重' },
    { key: 'remark',         label: '备注' },
  ],
};

// ── 配置：公司（UIX-9A）─────────────────────────────────
export const companyConfig: MasterDataConfig = {
  type: 'company',
  centerName: '公司中心',
  nameKey: 'org_name',
  referenceObjectType: 'COMPANY',
  kpis: [
    { label: '公司编码', icon: <Building2 size={16} />, value: (info) => ({ display: info?.org_code || '—' }) },
    { label: '负责人',   icon: <User size={16} />, value: (info) => ({ display: info?.manager_name || info?.manager || '—' }) },
    { label: '层级',     icon: <Layers size={16} />, value: (info) => ({ display: info?.level ?? '—' }) },
    { label: '状态',     icon: <Activity size={16} />, value: (info) => ({ display: info?.status || '—' }) },
  ],
  basicFields: [
    { key: 'org_short_name', label: '简称' },
    { key: 'parent_code',    label: '上级集团' },
    { key: 'company_code',   label: '公司编码' },
    { key: 'manager_name',   label: '负责人' },
    { key: 'sort_order',     label: '排序权重' },
    { key: 'remark',         label: '备注' },
  ],
};

// ── 配置：资金账户（UIX-9A）─────────────────────────────
export const cashAccountConfig: MasterDataConfig = {
  type: 'cash-account',
  centerName: '资金账户中心',
  nameKey: 'account_name',
  referenceObjectType: 'CASH_ACCOUNT',
  extraApis: [
    { key: 'txns', label: '资金流水', path: '/v2/finance/cash/transactions?account_code=:code&limit=10' },
  ],
  kpis: [
    { label: '币种', icon: <Coins size={16} />, value: (info) => ({ display: info?.currency_code || '—' }) },
    { label: '账户类型', icon: <Wallet size={16} />, value: (info) => ({ display: info?.account_type || '—' }) },
    { label: '所属公司', icon: <Building2 size={16} />, value: (info) => ({ display: info?.company_code || '—' }) },
    {
      label: '近期流水', icon: <Activity size={16} />,
      value: (_i, extra) => { const list = arr(extra.txns); return { display: list.length, suffix: '笔 (近期)' }; },
    },
  ],
  basicFields: [
    { key: 'company_code',    label: '所属公司' },
    { key: 'currency_code',   label: '币种' },
    { key: 'account_type',    label: '账户类型' },
    { key: 'bank_name',       label: '开户行' },
    { key: 'bank_account_no', label: '银行账号' },
    { key: 'bank_acc_code',   label: '绑定银行账户' },
  ],
  sections: [
    {
      title: '最近流水',
      render: (extra) => {
        const rows = arr(extra.txns).slice(0, 8);
        return (
          <RecentRows
            rows={rows}
            getKey={(r) => String(r.id || r.txn_no)}
            getLabel={(r) => <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>{r.txn_no}</code>}
            getSub={(r) => dateTime(r.created_at || r.txn_date)}
            getRight={(r) => {
              const amt = Number(r.amount_original || r.amount || 0);
              const tone = amt < 0 ? 'var(--status-danger)' : 'var(--status-success)';
              return <strong style={{ fontSize: 14, color: tone }}>{yuan(Math.abs(amt))}</strong>;
            }}
          />
        );
      },
    },
  ],
};

// ── 配置：银行账户（UIX-9A）─────────────────────────────
export const bankAccountConfig: MasterDataConfig = {
  type: 'bank-account',
  centerName: '银行账户中心',
  nameKey: 'bank_name',
  referenceObjectType: 'BANK_ACCOUNT',
  extraApis: [
    { key: 'linked', label: '绑定 ERP 账户', path: '/master-data/runtime/cash-account?bank_acc_code=:code&limit=10' },
  ],
  kpis: [
    { label: '币种',     icon: <Coins size={16} />, value: (info) => ({ display: info?.currency_code || '—' }) },
    { label: '国家',     icon: <Globe size={16} />, value: (info) => ({ display: info?.country_code || '—' }) },
    {
      label: '绑定账户', icon: <Wallet size={16} />,
      value: (_i, extra) => { const list = arr(extra.linked); return { display: list.length, suffix: '个' }; },
    },
    { label: '所属公司', icon: <Building2 size={16} />, value: (info) => ({ display: info?.company_code || '—' }) },
  ],
  basicFields: [
    { key: 'bank_name_en',    label: 'Bank Name' },
    { key: 'branch_name',     label: '支行' },
    { key: 'account_no',      label: '账号' },
    { key: 'account_holder',  label: '开户名' },
    { key: 'currency_code',   label: '币种' },
    { key: 'country_code',    label: '国家' },
    { key: 'swift_code',      label: 'SWIFT' },
    { key: 'company_code',    label: '所属公司' },
  ],
  sections: [
    {
      title: '绑定 ERP 资金账户',
      render: (extra) => {
        const rows = arr(extra.linked).slice(0, 8);
        return (
          <RecentRows
            rows={rows}
            getKey={(r) => String(r.id || r.account_code)}
            getLabel={(r) => <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>{r.account_code}</code>}
            getSub={(r) => `${r.account_name || ''} · ${r.currency_code || ''}`}
            getRight={(r) => <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.account_type || ''}</span>}
          />
        );
      },
    },
  ],
};

// ── 配置：门店（UIX-9A）─────────────────────────────────
export const storeConfig: MasterDataConfig = {
  type: 'store',
  centerName: '门店中心',
  nameKey: 'store_name',
  referenceObjectType: 'STORE',
  extraApis: [
    { key: 'orders', label: '销售订单', path: '/v2/sales/orders?store_code=:code&limit=10' },
    { key: 'pos',    label: 'POS 销售', path: '/crud/pos_sales?store_code=:code&limit=10' },
  ],
  kpis: [
    { label: '负责人', icon: <User size={16} />, value: (info) => ({ display: info?.manager || '—' }) },
    { label: '电话',   icon: <Phone size={16} />, value: (info) => ({ display: info?.phone || '—' }) },
    {
      label: '订单数', icon: <ShoppingCart size={16} />,
      value: (_i, extra) => { const list = arr(extra.orders); return { display: list.length, suffix: '单 (近期)' }; },
    },
    {
      label: '销售额', icon: <Activity size={16} />,
      value: (_i, extra) => {
        const total = arr(extra.orders).reduce((s, o) => s + Number(o.total_amount || 0), 0);
        return { display: total > 0 ? yuan(total) : '—' };
      },
    },
  ],
  basicFields: [
    { key: 'company_code',   label: '所属公司' },
    { key: 'manager',        label: '店长' },
    { key: 'phone',          label: '联系电话' },
    { key: 'address',        label: '地址' },
    { key: 'effective_date', label: '生效日期', format: dateStr },
    { key: 'expire_date',    label: '失效日期', format: (v) => v ? dateStr(v) : '长期' },
  ],
  sections: [
    {
      title: '最近订单',
      render: (extra) => {
        const rows = arr(extra.orders).slice(0, 6);
        return (
          <RecentRows
            rows={rows}
            getKey={(r) => String(r.id)}
            getLabel={(r) => <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>{r.order_no}</code>}
            getSub={(r) => dateTime(r.created_at)}
            getRight={(r) => (
              <>
                <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{yuan(r.total_amount)}</strong>
                <span style={{ padding: '1px 7px', fontSize: 11, fontWeight: 600, background: 'var(--bg-muted)', color: 'var(--text-secondary)', borderRadius: 100 }}>{r.status}</span>
              </>
            )}
          />
        );
      },
    },
  ],
};

// ── 配置：司机（UIX-9A）─────────────────────────────────
export const driverConfig: MasterDataConfig = {
  type: 'driver',
  centerName: '司机中心',
  nameKey: 'driver_name',
  referenceObjectType: 'DRIVER',
  extraApis: [
    { key: 'deliveries', label: '配送单', path: '/crud/sal_delivery_orders?driver_name=:code&limit=10' },
  ],
  kpis: [
    { label: '电话',   icon: <Phone size={16} />, value: (info) => ({ display: info?.phone || '—' }) },
    { label: '驾照',   icon: <Tag size={16} />,  value: (info) => ({ display: info?.license_no || '—' }) },
    {
      label: '配送次数', icon: <Truck size={16} />,
      value: (_i, extra) => { const list = arr(extra.deliveries); return { display: list.length, suffix: '单 (近期)' }; },
    },
    { label: '所属公司', icon: <Building2 size={16} />, value: (info) => ({ display: info?.company_code || '—' }) },
  ],
  basicFields: [
    { key: 'phone',          label: '联系电话' },
    { key: 'license_no',     label: '驾照号' },
    { key: 'company_code',   label: '所属公司' },
    { key: 'effective_date', label: '生效日期', format: dateStr },
    { key: 'expire_date',    label: '失效日期', format: (v) => v ? dateStr(v) : '长期' },
  ],
  sections: [
    {
      title: '最近配送',
      render: (extra) => {
        const rows = arr(extra.deliveries).slice(0, 6);
        return (
          <RecentRows
            rows={rows}
            getKey={(r) => String(r.id || r.delivery_no)}
            getLabel={(r) => <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>{r.delivery_no}</code>}
            getSub={(r) => `${r.vehicle_no || '—'} · ${dateTime(r.delivered_at || r.created_at)}`}
            getRight={(r) => <span style={{ padding: '1px 7px', fontSize: 11, fontWeight: 600, background: 'var(--bg-muted)', color: 'var(--text-secondary)', borderRadius: 100 }}>{r.status || '—'}</span>}
          />
        );
      },
    },
  ],
};

// ── 配置：车辆（UIX-9A）─────────────────────────────────
export const vehicleConfig: MasterDataConfig = {
  type: 'vehicle',
  centerName: '车辆中心',
  nameKey: 'vehicle_no',
  referenceObjectType: 'VEHICLE',
  extraApis: [
    { key: 'deliveries', label: '配送单', path: '/crud/sal_delivery_orders?vehicle_no=:code&limit=10' },
  ],
  kpis: [
    { label: '车牌',   icon: <Truck size={16} />, value: (info) => ({ display: info?.plate_no || '—' }) },
    { label: '类型',   icon: <Layers size={16} />, value: (info) => ({ display: info?.vehicle_type || '—' }) },
    { label: '载重',   icon: <Box size={16} />, value: (info) => ({ display: info?.capacity ? `${info.capacity} kg` : '—' }) },
    {
      label: '配送次数', icon: <Activity size={16} />,
      value: (_i, extra) => { const list = arr(extra.deliveries); return { display: list.length, suffix: '单 (近期)' }; },
    },
  ],
  basicFields: [
    { key: 'plate_no',       label: '车牌号' },
    { key: 'vehicle_type',   label: '车辆类型' },
    { key: 'capacity',       label: '载重(kg)' },
    { key: 'company_code',   label: '所属公司' },
    { key: 'effective_date', label: '生效日期', format: dateStr },
    { key: 'expire_date',    label: '失效日期', format: (v) => v ? dateStr(v) : '长期' },
  ],
  sections: [
    {
      title: '最近配送',
      render: (extra) => {
        const rows = arr(extra.deliveries).slice(0, 6);
        return (
          <RecentRows
            rows={rows}
            getKey={(r) => String(r.id || r.delivery_no)}
            getLabel={(r) => <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>{r.delivery_no}</code>}
            getSub={(r) => `${r.driver_name || '—'} · ${dateTime(r.delivered_at || r.created_at)}`}
            getRight={(r) => <span style={{ padding: '1px 7px', fontSize: 11, fontWeight: 600, background: 'var(--bg-muted)', color: 'var(--text-secondary)', borderRadius: 100 }}>{r.status || '—'}</span>}
          />
        );
      },
    },
  ],
};

// ── 配置：等级（UIX-9A）─────────────────────────────────
export const gradeConfig: MasterDataConfig = {
  type: 'grade',
  centerName: '等级中心',
  nameKey: 'grade_name',
  referenceObjectType: 'GRADE',
  extraApis: [
    { key: 'skus', label: '关联 SKU', path: '/product-master/skus?grade_code=:code&limit=10' },
  ],
  kpis: [
    {
      label: '关联 SKU', icon: <Package size={16} />,
      value: (_i, extra) => { const list = arr(extra.skus); return { display: list.length, suffix: '个' }; },
    },
    { label: '排序', icon: <Layers size={16} />, value: (info) => ({ display: info?.sort_order ?? '—' }) },
    { label: '可销售', icon: <ShoppingCart size={16} />, value: (info) => ({ display: info?.is_saleable === false ? '否' : '是' }) },
    { label: '可入库', icon: <Warehouse size={16} />, value: (info) => ({ display: info?.is_storable === false ? '否' : '是' }) },
  ],
  basicFields: [
    { key: 'grade_name',  label: '等级名称' },
    { key: 'sort_order',  label: '排序' },
    { key: 'is_saleable', label: '可销售', format: (v) => v === false ? '否' : '是' },
    { key: 'is_storable', label: '可入库', format: (v) => v === false ? '否' : '是' },
    { key: 'remark',      label: '备注' },
  ],
  sections: [
    {
      title: '关联 SKU',
      render: (extra) => {
        const rows = arr(extra.skus).slice(0, 8);
        return (
          <RecentRows
            rows={rows}
            getKey={(r) => String(r.id || r.sku_code)}
            getLabel={(r) => <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>{r.sku_code}</code>}
            getSub={(r) => `${r.product_code || '—'} · ${r.spec_code || '—'}`}
            getRight={(r) => <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{r.sku_name || ''}</span>}
          />
        );
      },
    },
  ],
};

// ── 配置：规格（UIX-9A）─────────────────────────────────
export const specConfig: MasterDataConfig = {
  type: 'spec',
  centerName: '规格中心',
  nameKey: 'spec_name',
  referenceObjectType: 'SPEC',
  extraApis: [
    { key: 'skus', label: '关联 SKU', path: '/product-master/skus?spec_code=:code&limit=10' },
  ],
  kpis: [
    {
      label: '关联 SKU', icon: <Package size={16} />,
      value: (_i, extra) => { const list = arr(extra.skus); return { display: list.length, suffix: '个' }; },
    },
    { label: '单位数量', icon: <Box size={16} />, value: (info) => ({ display: info?.qty_per_unit ?? info?.unit_count ?? '—' }) },
    { label: '基本单位', icon: <Tag size={16} />, value: (info) => ({ display: info?.base_unit || '—' }) },
    { label: '排序', icon: <Layers size={16} />, value: (info) => ({ display: info?.sort_order ?? '—' }) },
  ],
  basicFields: [
    { key: 'spec_name',    label: '规格名称' },
    { key: 'qty_per_unit', label: '单位数量', format: (v, info) => String(v ?? info?.unit_count ?? '—') },
    { key: 'base_unit',    label: '基本单位' },
    { key: 'display_unit', label: '展示单位' },
    { key: 'sort_order',   label: '排序' },
    { key: 'remark',       label: '备注' },
  ],
  sections: [
    {
      title: '关联 SKU',
      render: (extra) => {
        const rows = arr(extra.skus).slice(0, 8);
        return (
          <RecentRows
            rows={rows}
            getKey={(r) => String(r.id || r.sku_code)}
            getLabel={(r) => <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>{r.sku_code}</code>}
            getSub={(r) => `${r.product_code || '—'} · ${r.grade_code || '—'}`}
            getRight={(r) => <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{r.sku_name || ''}</span>}
          />
        );
      },
    },
  ],
};

// ── 配置：SKU ────────────────────────────────────────────
export const skuConfig: MasterDataConfig = {
  type: 'sku',
  centerName: 'SKU 中心',
  nameKey: 'sku_name',
  referenceObjectType: 'SKU',
  extraApis: [
    { key: 'batches', label: '批次', path: '/inventory/batches?sku_code=:code&limit=10' },
  ],
  kpis: [
    {
      label: '关联产品', icon: <BookOpen size={16} />,
      value: (info) => ({ display: info?.product_code || '—' }),
    },
    {
      label: '等级', icon: <Layers size={16} />,
      value: (info) => ({ display: info?.grade_code || '—' }),
    },
    {
      label: '规格', icon: <Package size={16} />,
      value: (info) => ({ display: info?.spec_code || '—' }),
    },
    {
      label: '在库批次', icon: <Warehouse size={16} />,
      value: (_i, extra) => ({ display: arr(extra.batches).length }),
    },
  ],
  basicFields: [
    { key: 'product_code',   label: '产品编码' },
    { key: 'product_name',   label: '产品名称' },
    { key: 'grade_code',     label: '等级' },
    { key: 'spec_code',      label: '规格' },
    { key: 'barcode',        label: '条码' },
    { key: 'effective_date', label: '生效日期', format: dateStr },
  ],
  sections: [
    {
      title: '在库批次',
      render: (extra) => {
        const rows = arr(extra.batches).slice(0, 8);
        return (
          <RecentRows
            rows={rows}
            getKey={(r) => String(r.id || r.batch_no)}
            getLabel={(r) => <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>{r.batch_no}</code>}
            getSub={(r) => `${r.warehouse_code || '—'} · qty ${r.qty || 0}`}
            getRight={(r) => <span style={{ padding: '1px 7px', fontSize: 11, fontWeight: 600, background: 'var(--bg-muted)', color: 'var(--text-secondary)', borderRadius: 100 }}>{r.status}</span>}
          />
        );
      },
    },
  ],
};
