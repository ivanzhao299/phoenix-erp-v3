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

// ── 项目（MDM-1 切换为 biz_projects 统一项目主表，按 company_code 过滤）─────
// 注：原 /master-data/runtime/project/active 从 prc2_projects 取（空表），
//      已切换为 /biz/projects（biz_projects 数据源），按 status=ACTIVE 过滤；
//      若 biz_projects 表暂未建（业务方未授权 migration 执行），端点 fallback
//      返回空数组，前端下拉显示"暂无项目"。
export interface ProjectSelectorProps extends BaseProps {
  companyCode?: string;  // 选公司后过滤；不传则返回全部 ACTIVE 项目
}
export function ProjectSelector(p: ProjectSelectorProps) {
  const { companyCode, ...base } = p;
  return <ScopedSelect {...base} placeholder={base.placeholder ?? '请选择项目'}
    loader={async () => {
      const url = companyCode
        ? `/biz/projects/active?company_code=${encodeURIComponent(companyCode)}`
        : '/biz/projects/active';
      try {
        const list = await request<any[]>(url);
        return (list || []).map(r => ({
          value: r.project_code,
          label: `${r.project_name}（${r.project_code}）`,
          raw: r,
        }));
      } catch {
        // 兼容：表未建或端点未部署时返回空，前端显示"暂无项目"
        return [];
      }
    }} />;
}

// ── 公司（org_units COMPANY 类型，DataScope 由后端鉴权）────────────────────────
export function CompanySelector(p: BaseProps) {
  return <ScopedSelect {...p} placeholder={p.placeholder ?? '请选择公司'}
    loader={async () => {
      // 2026-06-06：改用 /api/lookup/companies（无 MENU_SYS_ORG 限制），
      // 业务录入用户（如孟赛生产数据主管）也能拉到公司下拉。
      const list = await request<any[]>('/lookup/companies');
      return (Array.isArray(list) ? list : [])
        .map(o => ({ value: o.orgCode, label: o.orgNameCn || o.orgName, raw: o }));
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

// ── 用户（G4-B：申请人 / 收货人 / 经办人）─────────────────────────────────────
/**
 * 仅返回 status=ACTIVE 用户。
 *
 * 数据范围（前端兜底）：
 *   · scopeStore（默认 true）→ 仅当前登录用户同 store_code 的人
 *   · scopeStore=false → 全集团（仅 ROLE_ADMIN 等高权限场景使用）
 *
 * 注：后端 /api/users 当前不做 store_code 过滤，前端兜底；
 *     后续 MDM-3 阶段加 DataScopeGuard 时可移除前端过滤。
 */
export function UserSelector(p: BaseProps & {
  valueField?: 'username' | 'id';
  scopeStore?: boolean;  // 默认 true：同站点过滤
}) {
  const { valueField = 'username', scopeStore = true, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? '请选择用户'}
    loader={async () => {
      const r = await request<any>('/users');
      const list: any[] = Array.isArray(r) ? r : (r?.data ?? []);
      // 当前登录用户的 store_code（从 JWT/sessionStorage 取）
      let myStore = '';
      try {
        const raw = typeof window !== 'undefined'
          ? sessionStorage.getItem('phoenix_user') || localStorage.getItem('phoenix_user')
          : null;
        if (raw) {
          const me = JSON.parse(raw);
          myStore = me?.storeCode || me?.store_code || '';
        }
      } catch { /* */ }

      return list
        .filter(u => (u.status ?? 'ACTIVE') === 'ACTIVE')
        // 站点过滤：仅显示同 store_code（或 store_code='ALL' 的全局用户）
        .filter(u => {
          if (!scopeStore || !myStore || myStore === 'ALL') return true;
          const userStore = u.store_code || u.storeCode || '';
          return userStore === myStore || userStore === 'ALL';
        })
        .map(u => ({
          value: valueField === 'id' ? String(u.id) : u.username,
          label: `${u.real_name_zh ?? u.username}（${u.username}${u.role ? ' · ' + u.role : ''}）`,
          raw: u,
        }));
    }} />;
}

// ── 仓库（wms_warehouses，仅 ACTIVE）─────────────────────────────────────────
export function WarehouseSelector(p: BaseProps & { companyCode?: string }) {
  const { companyCode, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? '请选择仓库'}
    loader={async () => {
      const r = await request<any>('/crud/wms_warehouses?status=ACTIVE&pageSize=200');
      const list: any[] = Array.isArray(r) ? r : (r?.data?.items ?? r?.data ?? r?.items ?? []);
      return list
        .filter(w => (w.status ?? 'ACTIVE') === 'ACTIVE')
        .filter(w => !companyCode || w.company_code === companyCode || w.org_code === companyCode)
        .map(w => ({
          value: w.warehouse_code ?? w.code,
          label: `${w.warehouse_name ?? w.name ?? w.warehouse_code}（${w.warehouse_code ?? w.code}）`,
          raw: w,
        }));
    }} />;
}

// ── 库区（wms_zones）─────────────────────────────────────────────────────────
export function ZoneSelector(p: BaseProps & { warehouseCode?: string }) {
  const { warehouseCode, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? '请选择库区'}
    loader={async () => {
      const r = await request<any>('/crud/wms_zones?status=ACTIVE&pageSize=500');
      const list: any[] = Array.isArray(r) ? r : (r?.data?.items ?? r?.data ?? r?.items ?? []);
      return list
        .filter(z => (z.status ?? 'ACTIVE') === 'ACTIVE')
        .filter(z => !warehouseCode || z.warehouse_code === warehouseCode)
        .map(z => ({
          value: z.zone_code,
          label: `${z.zone_name ?? z.zone_code}（${z.zone_code}）`,
          raw: z,
        }));
    }} />;
}

// ── 货位（wms_locations）─────────────────────────────────────────────────────
export function LocationSelector(p: BaseProps & { warehouseCode?: string; zoneCode?: string }) {
  const { warehouseCode, zoneCode, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? '请选择货位'}
    loader={async () => {
      const r = await request<any>('/crud/wms_locations?status=ACTIVE&pageSize=500');
      const list: any[] = Array.isArray(r) ? r : (r?.data?.items ?? r?.data ?? r?.items ?? []);
      return list
        .filter(l => (l.status ?? 'ACTIVE') === 'ACTIVE')
        .filter(l => !warehouseCode || l.warehouse_code === warehouseCode)
        .filter(l => !zoneCode || l.zone_code === zoneCode)
        .map(l => ({
          value: l.location_code,
          label: `${l.location_name ?? l.location_code}（${l.location_code}）`,
          raw: l,
        }));
    }} />;
}

// ── 渠道（sal_channels）──────────────────────────────────────────────────────
export function ChannelSelector(p: BaseProps) {
  return <ScopedSelect {...p} placeholder={p.placeholder ?? '请选择渠道'}
    loader={async () => {
      const r = await request<any>('/v2/sales/channels');
      const list: any[] = Array.isArray(r) ? r : (r?.data?.items ?? r?.data ?? r?.items ?? []);
      return list
        .filter(c => (c.status ?? 'ACTIVE') === 'ACTIVE')
        .map(c => ({
          value: c.channel_code ?? c.channelCode,
          label: `${c.channel_name ?? c.channelName ?? c.channel_code}（${c.channel_code ?? c.channelCode}）`,
          raw: c,
        }));
    }} />;
}

// ── 门店（mst_stores / sys_store via generic-crud）────────────────────────────
export function StoreSelector(p: BaseProps & { companyCode?: string }) {
  const { companyCode, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? '请选择门店'}
    loader={async () => {
      const r = await request<any>('/crud/mst_stores?status=ACTIVE&pageSize=500');
      const list: any[] = Array.isArray(r) ? r : (r?.data?.items ?? r?.data ?? r?.items ?? []);
      return list
        .filter(st => (st.status ?? 'ACTIVE') === 'ACTIVE')
        .filter(st => !companyCode || st.company_code === companyCode)
        .map(st => ({
          value: st.store_code,
          label: `${st.store_name ?? st.store_code}（${st.store_code}）`,
          raw: st,
        }));
    }} />;
}

// ── 司机（sal_drivers）───────────────────────────────────────────────────────
export function DriverSelector(p: BaseProps & { companyCode?: string }) {
  const { companyCode, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? '请选择司机'}
    loader={async () => {
      const r = await request<any>('/v2/sales/delivery/drivers');
      const list: any[] = Array.isArray(r) ? r : (r?.data?.items ?? r?.data ?? r?.items ?? []);
      return list
        .filter(d => (d.status ?? 'ACTIVE') === 'ACTIVE')
        .filter(d => !companyCode || d.company_code === companyCode)
        .map(d => ({
          value: d.driver_name ?? d.driverName,
          label: `${d.driver_name ?? d.driverName}（${d.phone ?? ''}${d.license_no ?? d.licenseNo ? ' · ' + (d.license_no ?? d.licenseNo) : ''}）`,
          raw: d,
        }));
    }} />;
}

// ── 车辆（sal_vehicles）─────────────────────────────────────────────────────
export function VehicleSelector(p: BaseProps & { companyCode?: string }) {
  const { companyCode, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? '请选择车辆'}
    loader={async () => {
      const r = await request<any>('/v2/sales/delivery/vehicles');
      const list: any[] = Array.isArray(r) ? r : (r?.data?.items ?? r?.data ?? r?.items ?? []);
      return list
        .filter(v => (v.status ?? 'ACTIVE') === 'ACTIVE')
        .filter(v => !companyCode || v.company_code === companyCode)
        .map(v => ({
          value: v.vehicle_no ?? v.vehicleNo,
          label: `${v.vehicle_no ?? v.vehicleNo}${v.plate_no ?? v.plateNo ? '（' + (v.plate_no ?? v.plateNo) + '）' : ''}`,
          raw: v,
        }));
    }} />;
}

// ── 场站（brd_farms，仅 ACTIVE）─────────────────────────────────────────────
export function FarmSelector(p: BaseProps) {
  return <ScopedSelect {...p} placeholder={p.placeholder ?? '请选择场站'}
    loader={async () => {
      const r = await request<any>('/crud/brd_farms?status=ACTIVE&pageSize=200');
      const list: any[] = Array.isArray(r) ? r : (r?.data?.items ?? r?.data ?? r?.items ?? []);
      return list
        .filter(f => (f.status ?? 'ACTIVE') === 'ACTIVE')
        .map(f => ({
          value: f.farm_code,
          label: `${f.farm_name ?? f.farm_code}（${f.farm_code}）`,
          raw: f,
        }));
    }} />;
}

// ── 鸡舍（brd_houses）─────────────────────────────────────────────────────────
export function HouseSelector(p: BaseProps & { farmCode?: string }) {
  const { farmCode, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? '请选择鸡舍'}
    loader={async () => {
      const r = await request<any>('/crud/brd_houses?status=ACTIVE&pageSize=500');
      const list: any[] = Array.isArray(r) ? r : (r?.data?.items ?? r?.data ?? r?.items ?? []);
      return list
        .filter(h => (h.status ?? 'ACTIVE') === 'ACTIVE')
        .filter(h => !farmCode || h.farm_code === farmCode)
        .map(h => ({
          value: h.house_code,
          label: `${h.house_name ?? h.house_code}（${h.house_code}${h.house_type ? ' · ' + h.house_type : ''}）`,
          raw: h,
        }));
    }} />;
}

// ── 鸡群（brd_flocks）─────────────────────────────────────────────────────────
export function FlockSelector(p: BaseProps & { farmCode?: string; houseCode?: string }) {
  const { farmCode, houseCode, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? '请选择鸡群'}
    loader={async () => {
      const r = await request<any>('/crud/brd_flocks?status=ACTIVE&pageSize=500');
      const list: any[] = Array.isArray(r) ? r : (r?.data?.items ?? r?.data ?? r?.items ?? []);
      return list
        .filter(f => (f.status ?? 'ACTIVE') === 'ACTIVE')
        .filter(f => !farmCode || f.farm_code === farmCode)
        .filter(f => !houseCode || f.house_code === houseCode)
        .map(f => ({
          value: f.flock_no,
          label: `${f.flock_no}（${f.house_code ?? ''}${f.current_qty ? ' · ' + f.current_qty + '羽' : ''}）`,
          raw: f,
        }));
    }} />;
}

// ── 等级（product_grades，仅 ACTIVE）────────────────────────────────────────
export function GradeSelector(p: BaseProps) {
  return <ScopedSelect {...p} placeholder={p.placeholder ?? '请选择等级'}
    loader={async () => {
      const r = await request<any>('/product-master/grades?status=ACTIVE');
      const list: any[] = Array.isArray(r) ? r : (r?.data?.items ?? r?.data ?? r?.items ?? []);
      return list
        .filter(g => (g.status ?? 'ACTIVE') === 'ACTIVE')
        .map(g => ({
          value: g.grade_code,
          label: `${g.grade_name ?? g.grade_code}（${g.grade_code}）`,
          raw: g,
        }));
    }} />;
}

// ── 规格（packaging_specs，仅 ACTIVE）───────────────────────────────────────
export function SpecSelector(p: BaseProps) {
  return <ScopedSelect {...p} placeholder={p.placeholder ?? '请选择规格'}
    loader={async () => {
      const r = await request<any>('/product-master/specs?status=ACTIVE');
      const list: any[] = Array.isArray(r) ? r : (r?.data?.items ?? r?.data ?? r?.items ?? []);
      return list
        .filter(s => (s.status ?? 'ACTIVE') === 'ACTIVE')
        .map(s => ({
          value: s.spec_code,
          label: `${s.spec_name ?? s.spec_code}（${s.spec_code}）`,
          raw: s,
        }));
    }} />;
}

// ── 班次（sys_dict.PKG_SHIFT 已有，提供别名 ShiftSelector 便于使用）─────────
//    用法：import { ShiftSelector } from '@/components/shared-selectors/MasterDataSelectors'
//          <ShiftSelector value={shift} onChange={setShift} />
//    内部委托 DictSelect(PKG_SHIFT)；G4-E 统一命名。
export function ShiftSelector(p: BaseProps) {
  // 班次实际是字典而非主数据，但用户任务命名要求 ShiftSelector，故在此封装
  return <ScopedSelect {...p} placeholder={p.placeholder ?? '请选择班次'}
    loader={async () => {
      const r = await request<any>('/crud/sys_dict?dict_type=PKG_SHIFT&status=ACTIVE');
      const list: any[] = Array.isArray(r) ? r : (r?.data ?? []);
      return list
        .filter(d => (d.status ?? 'ACTIVE') === 'ACTIVE')
        .sort((a, b) => (Number(a.sort_no) || 0) - (Number(b.sort_no) || 0))
        .map(d => ({
          value: d.dict_code,
          label: d.dict_label_zh ?? d.name ?? d.dict_code,
          raw: d,
        }));
    }} />;
}

// ── SKU（物料主数据，仅 ACTIVE）──────────────────────────────────────────────
/** value = sku_code；onPick 回传 raw（包含 product_code/product_name/grade_code/spec_code/sku_name） */
export function SkuSelector(p: BaseProps & { productCode?: string; gradeCode?: string }) {
  const { productCode, gradeCode, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? '请选择物料'}
    loader={async () => {
      const params = new URLSearchParams({ status: 'ACTIVE' });
      if (productCode) params.set('product_code', productCode);
      if (gradeCode) params.set('grade_code', gradeCode);
      const r = await request<any>(`/product-master/skus?${params}`);
      const list: any[] = Array.isArray(r) ? r : (r?.data ?? []);
      return list
        .filter(s => (s.status ?? 'ACTIVE') === 'ACTIVE')
        .map(s => ({
          value: s.sku_code,
          label: `${s.sku_name ?? s.product_name ?? s.sku_code}（${s.sku_code}${s.spec_code ? ' · ' + s.spec_code : ''}${s.grade_code ? ' · ' + s.grade_code : ''}）`,
          raw: s,
        }));
    }} />;
}
