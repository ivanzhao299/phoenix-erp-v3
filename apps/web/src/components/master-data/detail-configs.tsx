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
      value: (info) => ({ display: info?.uom || '—' }),
    },
    {
      label: '类目', icon: <BookOpen size={16} />,
      value: (info) => ({ display: info?.category || '—' }),
    },
  ],
  basicFields: [
    { key: 'product_name_en', label: '英文名' },
    { key: 'category',        label: '类目' },
    { key: 'uom',             label: '计量单位' },
    { key: 'default_grade',   label: '默认等级' },
    { key: 'shelf_life_days', label: '保质期(天)' },
    { key: 'effective_date',  label: '生效日期', format: dateStr },
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
