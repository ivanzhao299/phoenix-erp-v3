'use client';
import { useState, useEffect } from 'react';
import { useLanguage } from "@/contexts/LanguageContext";
import request from '@/lib/api-client';
import { cachedGet, TTL } from '@/lib/request-cache'; // G89-P1 主数据下拉缓存+去重
import { fetchDictMap } from '@/lib/dict-cache'; // G25-A 字典异步缓存
import { loadStorePosContexts } from '@/lib/store-pos-api';
import { localizedMasterName, masterNameWithCode } from '@/lib/localized-master-data';

/**
 * 统一主数据选择器（G4-A 财务单据主数据驱动 + G5-B Lookup 范式化 + G7 收口）
 * ════════════════════════════════════════════════════════════════════════
 * 所有选择器只加载可用主数据（通常为 ACTIVE；WMS 库区/库位兼容 ACTIVE/NORMAL）；
 * 选中后通过 onChange(code) + onPick(item) 回传，
 * 业务表单据此自动带出名称等字段，杜绝裸字段手填。
 *
 * 数据源（G5-B 后）：
 *   - 业务录入用必备 (公司/客户/供应商/仓库/门店/场站/鸡舍/鸡群/字典) → /api/lookup/*
 *   - 项目                                                          → /api/lookup/projects
 *   - 等级/规格                                                     → /lookup/product-grades, /lookup/packaging-specs
 *   - 资金账户/用户                                                 → /lookup/cash-accounts, /lookup/users
 *   - 渠道/司机/车辆/股东（管理员路径）                              → V2 Runtime 专属 endpoint
 *
 * 所有 /api/lookup/* 端点都仅 JWT 守卫，业务录入用户可拉，与主数据写权限解耦。
 */

interface Opt { value: string; label: string; raw?: any; disabled?: boolean }

// G16：兼容 /lookup/* 端点的 { code, data } 包装与原始数组两种格式
async function lookupArr<T = any>(path: string): Promise<T[]> {
  // G89-P1：主数据下拉缓存 5min + 并发去重（同页多个相同选择器、切回页面均不再重复拉）
  return cachedGet<T[]>(`lookup:${path}`, TTL.lookup, async () => {
    const j: any = await request<any>(path);
    if (Array.isArray(j)) return j as T[];
    if (Array.isArray(j?.data)) return j.data as T[];
    return [];
  });
}

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
  width: '100%',
  boxSizing: 'border-box',
};

/** 通用：从端点加载 {value,label} 选项的下拉 */
function ScopedSelect({
  value, onChange, onPick, placeholder, disabled, className, style,
  loader, reloadDeps, emptyMessage, errorMessage,
}: BaseProps & {
  loader: () => Promise<Opt[]>;
  reloadDeps?: any[];
  emptyMessage?: string;
  errorMessage?: string;
}) {
  const { t } = useLanguage();
  const resolvedPlaceholder = placeholder ?? t('ui.请选择', '请选择');
  const [opts, setOpts] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // 定长依赖键：序列化 reloadDeps 成单一字符串，避免同一 JSX 槽位在不同 Selector
  // （如付款人=公司↔股东）间复用 fiber 时依赖数组长度变化触发 React 警告。
  const reloadKey = JSON.stringify(reloadDeps ?? []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    loader().then(list => { if (alive) setOpts(list); }).catch((error) => {
      // 只记录受控错误对象，不记录 token/响应体等敏感数据。
      console.error('[ScopedSelect] option loading failed', error instanceof Error ? error.message : 'unknown error');
      if (alive) { setOpts([]); setFailed(true); }
    })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [reloadKey]); // eslint-disable-line

  const mergedClassName = ['phx-select', className].filter(Boolean).join(' ');

  const statusMessage = !loading && (failed ? errorMessage : (!opts.length ? emptyMessage : undefined));
  return <>
    <select className={mergedClassName} style={{ ...selStyle, ...style }} value={value} disabled={disabled || loading}
      onChange={e => { onChange(e.target.value); onPick?.(opts.find(o => o.value === e.target.value) ?? null); }}>
      <option value="">{loading ? t('ui.加载中…','加载中…') : resolvedPlaceholder}</option>
      {opts.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
    </select>
    {statusMessage && <small role="status" style={{ display: 'block', marginTop: 4, color: 'var(--text-secondary)' }}>{statusMessage}</small>}
  </>;
}

// ── 客户（仅 ACTIVE，G5-B 切 /api/lookup）─────────────────────────────────────
export function CustomerSelector(p: BaseProps) {
  const { t } = useLanguage();
  return <ScopedSelect {...p} placeholder={p.placeholder ?? t('ui.请选择客户','请选择客户')}
    emptyMessage={t('ui.当前账号无可用客户，请联系管理员检查数据范围', '当前账号无可用客户，请联系管理员检查数据范围')}
    errorMessage={t('ui.客户数据加载失败，请重试', '客户数据加载失败，请重试')}
    loader={async () => (await lookupArr('/lookup/customers')).map((r: any) => ({ value: r.code, label: `${r.name}（${r.code}）`, raw: r }))} />;
}

// ── 供应商（仅 ACTIVE，G5-B 切 /api/lookup）───────────────────────────────────
export function SupplierSelector(p: BaseProps) {
  const { t } = useLanguage();
  return <ScopedSelect {...p} placeholder={p.placeholder ?? t('ui.请选择供应商','请选择供应商')}
    loader={async () => (await lookupArr('/lookup/suppliers')).map((r: any) => ({ value: r.code, label: `${r.name}（${r.code}）`, raw: r }))} />;
}

// ── 项目（MDM-1 切换为 biz_projects 统一项目主表，按 company_code 过滤）─────
// 业务录入页面必须走 /api/lookup/projects：仅 JWT + DataScope，不要求用户具备
// MENU_PRC2_PROJECT 主数据维护/项目档案权限。付款单等页面只需要“引用项目”，
// 不应因为缺项目维护菜单而看不到项目下拉。
export interface ProjectSelectorProps extends BaseProps {
  companyCode?: string;  // 选公司后过滤；不传则返回全部 ACTIVE 项目
}
export function ProjectSelector(p: ProjectSelectorProps) {
  const { t } = useLanguage();
  const { companyCode, ...base } = p;
  return <ScopedSelect {...base} placeholder={base.placeholder ?? t('ui.请选择项目','请选择项目')}
    reloadDeps={[companyCode]}   // G86：随公司切换重载过滤
    loader={async () => {
      const url = companyCode
        ? `/lookup/projects?companyCode=${encodeURIComponent(companyCode)}`
        : '/lookup/projects';
      try {
        const list = await lookupArr<any>(url);
        return (list || []).map(r => ({
          value: r.projectCode ?? r.project_code,
          label: `${r.projectName ?? r.project_name}（${r.projectCode ?? r.project_code}）`,
          raw: r,
        })).filter(o => o.value);
      } catch {
        // 兼容：表未建或端点未部署时返回空，前端显示占位。
        return [];
      }
    }} />;
}

// ── 公司（org_units COMPANY 类型，DataScope 由后端鉴权）────────────────────────
export function CompanySelector(p: BaseProps) {
  const { t } = useLanguage();
  return <ScopedSelect {...p} placeholder={p.placeholder ?? t('ui.请选择公司','请选择公司')}
    emptyMessage={t('ui.当前账号无可用公司，请联系管理员检查数据范围', '当前账号无可用公司，请联系管理员检查数据范围')}
    errorMessage={t('ui.公司数据加载失败，请重试', '公司数据加载失败，请重试')}
    loader={async () => {
      // 2026-06-06：改用 /api/lookup/companies（无 MENU_SYS_ORG 限制），
      // 业务录入用户（如孟赛生产数据主管）也能拉到公司下拉。
      const list = await lookupArr<any>('/lookup/companies');
      return (Array.isArray(list) ? list : [])
        .map(o => {
          const value = o.companyCode || o.orgCode;
          return { value, label: masterNameWithCode(o.orgNameCn || o.orgName, value), raw: o };
        });
    }} />;
}

// ── 资金账户（fin_cash_accounts，仅 ACTIVE）────────────────────────────────────
/**
 * valueField:
 *   - 'code'（默认）：value = account_code，适用于 fin_payment.payer_account 这类文本字段
 *   - 'id'：value = uuid，适用于 fin_fund_transfer / fin_reimbursement / fin_ar_receipt 这类 FK
 * currencyCode：可选过滤，仅显示该币种账户
 */
export function CashAccountSelector(p: BaseProps & { valueField?: 'code' | 'id'; currencyCode?: string; companyCode?: string }) {
  const { t } = useLanguage();
  const { valueField = 'code', currencyCode, companyCode, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? t('ui.请选择资金账户','请选择资金账户')}
    reloadDeps={[currencyCode, companyCode]}
    loader={async () => {
      // G5-B 切 /api/lookup/cash-accounts；支持 currency / company query 直接过滤
      const qs = new URLSearchParams();
      if (currencyCode) qs.set('currency', currencyCode);
      if (companyCode)  qs.set('company',  companyCode);
      const url = qs.toString() ? `/lookup/cash-accounts?${qs.toString()}` : '/lookup/cash-accounts';
      const list = await lookupArr<any>(url);
      return list
        .map(a => {
          const code = a.accountCode;
          const name = a.accountName;
          const ccy  = a.currencyCode ?? '';
          const bal  = a.currentBalance;
          const balStr = bal !== undefined && bal !== null ? `｜余额 ${Number(bal).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` : '';
          return {
            value: valueField === 'id' ? (a as any).id : code,
            label: `${name}（${code}${ccy ? ' ' + ccy : ''}）${balStr}`,
            raw: a,
          };
        });
    }} />;
}

// ── 股东（G36-fix：切 /api/lookup/shareholders，仅 JWT 不绑 MENU）──────────────
// 原走 /shareholders（需 MENU_SHAREHOLDER_VIEW:V）→ 出纳/财务录入用户拉不到股东。
// G39：传 companyCode 时仅列该公司名下持股股东（先选公司→股东按公司收窄），
//      随 companyCode 变化自动重载。不传则列全部 ACTIVE（付款单等兼容）。
export function ShareholderSelector(p: BaseProps & { companyCode?: string }) {
  const { t } = useLanguage();
  const { companyCode, ...base } = p;
  return <ScopedSelect {...base} placeholder={base.placeholder ?? t('ui.请选择股东','请选择股东')}
    reloadDeps={[companyCode]}
    loader={async () => {
      const url = companyCode
        ? `/lookup/shareholders?companyCode=${encodeURIComponent(companyCode)}`
        : '/lookup/shareholders';
      return (await lookupArr(url)).map((s: any) => ({ value: s.code, label: s.name, raw: s }));
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
  const { t } = useLanguage();
  const { valueField = 'username', scopeStore = true, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? t('ui.请选择用户','请选择用户')}
    loader={async () => {
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

      // G5-B 切 /api/lookup/users（无 MENU_USER_MGR:V 限制）。
      // P1 权限收紧：默认把当前 storeCode 传给后端先收窄；前端过滤仅作二次兜底。
      const query = scopeStore && myStore && myStore !== 'ALL'
        ? `?storeCode=${encodeURIComponent(myStore)}`
        : '';
      const list = await lookupArr<any>(`/lookup/users${query}`);

      return (Array.isArray(list) ? list : [])
        // 站点过滤：仅显示同 store_code（或 store_code='ALL' 的全局用户）
        .filter(u => {
          if (!scopeStore || !myStore || myStore === 'ALL') return true;
          const userStore = u.storeCode || '';
          return userStore === myStore || userStore === 'ALL';
        })
        .map(u => ({
          value: valueField === 'id' ? String(u.userId) : u.username,
          label: `${u.realName ?? u.username}（${u.username}）`,
          raw: u,
        }));
    }} />;
}

// ── 仓库（wms_warehouses，G5-B 切 /api/lookup，G15 支持 type 过滤）─────────────
// type 枚举：EGG_FARM / EGG_SALES / MEDICINE / FEED / RAW_MATERIAL / PURCHASE_RECV / FINISHED
export function WarehouseSelector(p: BaseProps & { companyCode?: string; siteCode?: string; type?: string; facilityClass?: string }) {
  const { t, lang } = useLanguage();
  const { companyCode, siteCode, type, facilityClass, ...rest } = p;
  return <ScopedSelect {...rest} reloadDeps={[companyCode, siteCode, type, facilityClass, lang]} placeholder={p.placeholder ?? t('ui.请选择仓库','请选择仓库')}
    loader={async () => {
      const qs = new URLSearchParams();
      if (companyCode) qs.set('companyCode', companyCode);
      if (siteCode)    qs.set('siteCode',    siteCode);
      if (type)        qs.set('type',        type);
      if (facilityClass) qs.set('facilityClass', facilityClass);
      const url = qs.toString() ? `/lookup/warehouses?${qs.toString()}` : '/lookup/warehouses';
      const list = await lookupArr<any>(url);
      return (Array.isArray(list) ? list : [])
        .map(w => ({
          value: w.warehouseCode,
          label: masterNameWithCode(localizedMasterName(w, 'warehouseName', lang), w.warehouseCode),
          raw: w,
        }));
    }} />;
}

// ── 库区（wms_zones）─────────────────────────────────────────────────────────
export function ZoneSelector(p: BaseProps & { warehouseCode?: string }) {
  const { t } = useLanguage();
  const { warehouseCode, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? t('ui.请选择库区','请选择库区')}
    reloadDeps={[warehouseCode]}
    loader={async () => {
      // 不在 URL 传单值 status：历史 WMS 可用态同时存在 ACTIVE/NORMAL，统一在客户端收口。
      const r = await request<any>('/crud/wms_zones?limit=500');
      const list: any[] = Array.isArray(r) ? r : (r?.data?.items ?? r?.data ?? r?.items ?? []);
      return list
        .filter(z => ['ACTIVE', 'NORMAL'].includes(z.status ?? 'ACTIVE'))
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
  const { t } = useLanguage();
  const { warehouseCode, zoneCode, ...rest } = p;
  return <ScopedSelect {...rest} reloadDeps={[warehouseCode, zoneCode]} placeholder={p.placeholder ?? t('ui.请选择货位','请选择货位')}
    loader={async () => {
      // Generic CRUD 的 status=ACTIVE 是精确等值，会在客户端过滤前滤光 NORMAL 库位。
      const r = await request<any>('/crud/wms_locations?pageSize=500');
      const list: any[] = Array.isArray(r) ? r : (r?.data?.items ?? r?.data ?? r?.items ?? []);
      return list
        .filter(l => ['ACTIVE', 'NORMAL'].includes(l.status ?? 'ACTIVE'))
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
  const { t } = useLanguage();
  return <ScopedSelect {...p} placeholder={p.placeholder ?? t('ui.请选择渠道','请选择渠道')}
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

// ── 门店（mst_stores，G5-B 切 /api/lookup）────────────────────────────────────
export function StoreSelector(p: BaseProps & { companyCode?: string }) {
  const { t, lang } = useLanguage();
  const { companyCode, ...rest } = p;
  return <ScopedSelect {...rest} reloadDeps={[companyCode, lang]} placeholder={p.placeholder ?? t('ui.请选择门店','请选择门店')}
    emptyMessage={t('ui.当前数据范围内无可用门店','当前数据范围内无可用门店')}
    errorMessage={t('ui.门店服务加载失败，请刷新重试','门店服务加载失败，请刷新重试')}
    loader={async () => {
      const url = companyCode ? `/lookup/stores?companyCode=${encodeURIComponent(companyCode)}` : '/lookup/stores';
      const list = await lookupArr<any>(url);
      return (Array.isArray(list) ? list : [])
        .map(st => ({
          value: st.storeCode,
          label: masterNameWithCode(localizedMasterName(st, 'storeName', lang), st.storeCode),
          raw: st,
        }));
    }} />;
}

/** POS 专用门店：只展示当前用户有效 membership，legacy store_code 不参与。 */
export function StoreMembershipSelector(p: BaseProps) {
  const { t, lang } = useLanguage();
  return <ScopedSelect {...p} reloadDeps={[lang]} placeholder={p.placeholder ?? t('ui.请选择门店','请选择门店')}
    emptyMessage={t('ui.当前账号无门店授权，请使用店长/收银账号或联系管理员配置 membership','当前账号无门店授权，请使用店长/收银账号或联系管理员配置 membership')}
    errorMessage={t('ui.门店授权服务加载失败，请刷新重试','门店授权服务加载失败，请刷新重试')}
    loader={async () => {
      const contexts = await loadStorePosContexts();
      const unique = [...new Map(contexts.map(st => [st.storeCode, st])).values()];
      return unique.map(st => ({
        value: st.storeCode,
        label: `${masterNameWithCode(localizedMasterName(st as any, 'storeName', lang), st.storeCode)}${!st.hasSalesWarehouse
          ? ` · ${t('ui.未绑定有效销售仓，请联系管理员配置门店仓','未绑定有效销售仓，请联系管理员配置门店仓')}`
          : st.hasWarehouseScopeIntersection === false
            ? ` · ${t('ui.无门店仓权限交集，请联系管理员配置 WarehouseScope','无门店仓权限交集，请联系管理员配置 WarehouseScope')}`
            : ''}`,
        raw: st,
        disabled: st.hasSalesWarehouse === false || st.hasWarehouseScopeIntersection === false,
      }));
    }} />;
}

// ── 司机（sal_drivers）───────────────────────────────────────────────────────
export function DriverSelector(p: BaseProps & { companyCode?: string }) {
  const { t } = useLanguage();
  const { companyCode, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? t('ui.请选择司机','请选择司机')}
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
  const { t } = useLanguage();
  const { companyCode, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? t('ui.请选择车辆','请选择车辆')}
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

// ── 场站（brd_farms，G5-B 切 /api/lookup）────────────────────────────────────
export function FarmSelector(p: BaseProps) {
  const { t } = useLanguage();
  return <ScopedSelect {...p} placeholder={p.placeholder ?? t('ui.请选择场站','请选择场站')}
    loader={async () => {
      const list = await lookupArr<any>('/lookup/farms');
      return (Array.isArray(list) ? list : [])
        .map(f => ({
          value: f.farmCode,
          label: `${f.farmName ?? f.farmCode}（${f.farmCode}）`,
          raw: f,
        }));
    }} />;
}

// ── 库存批次（inv_batches，唯一台账；仅列 qty_available>0 的批次）──────────────
export function BatchSelector(p: BaseProps) {
  const { t } = useLanguage();
  return <ScopedSelect {...p} placeholder={p.placeholder ?? t('ui.请选择批次','请选择批次')}
    loader={async () => {
      const list = await lookupArr<any>('/lookup/batches');
      return (Array.isArray(list) ? list : [])
        .map(b => ({
          value: b.batch_no,
          label: `${b.batch_no}｜${b.material_code ?? b.sku_code ?? b.product_code ?? ''} 可用${b.qty_available ?? ''}${b.unit ? ` ${b.unit}` : ''}`,
          raw: {
            ...b,
            inventory_item_code: b.material_code ?? b.sku_code ?? b.product_code ?? '',
          },
        }));
    }} />;
}

// ── 鸡舍（brd_houses）— G25-A 字典完整化（D1 治理收口）
//   houseType 走 sys_dict.BRD_HOUSE_TYPE 异步拉取 + 模块级 5min 缓存
//   彻底删除 HOUSE_TYPE_ZH 硬编码 map；字典 seed 改动无需改前端
export function HouseSelector(p: BaseProps & { farmCode?: string; siteCode?: string }) {
  const { t } = useLanguage();
  const { farmCode, siteCode, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? t('ui.请选择鸡舍','请选择鸡舍')}
    loader={async () => {
      const qs = new URLSearchParams();
      if (farmCode) qs.set('farmCode', farmCode);
      if (siteCode) qs.set('siteCode', siteCode);
      const url = qs.toString() ? `/lookup/houses?${qs.toString()}` : '/lookup/houses';
      const [list, typeMap] = await Promise.all([
        lookupArr<any>(url),
        fetchDictMap('BRD_HOUSE_TYPE'),
      ]);
      return list.map(h => {
        const typeZh = h.houseType ? (typeMap[h.houseType] ?? '') : '';
        const baseLabel = typeZh ? `${h.houseName ?? h.houseCode} · ${typeZh}` : (h.houseName ?? h.houseCode);
        return {
          value: h.houseCode,
          label: h.ownershipResolved === false ? `${baseLabel}（未归属）` : baseLabel,
          raw: h,
        };
      });
    }} />;
}

// ── 鸡群（brd_flocks，G5-B 切 /api/lookup）────────────────────────────────────
export function FlockSelector(p: BaseProps & { farmCode?: string; houseCode?: string; siteCode?: string }) {
  const { t } = useLanguage();
  const { farmCode, houseCode, siteCode, ...rest } = p;
  return <ScopedSelect {...rest} placeholder={p.placeholder ?? t('ui.请选择鸡群','请选择鸡群')}
    loader={async () => {
      const qs = new URLSearchParams();
      if (siteCode) qs.set('siteCode', siteCode);
      if (houseCode) qs.set('houseCode', houseCode);
      if (farmCode)  qs.set('farmCode',  farmCode);
      const url = qs.toString() ? `/lookup/flocks?${qs.toString()}` : '/lookup/flocks';
      const list = await lookupArr<any>(url);
      return (Array.isArray(list) ? list : [])
        .map(f => ({
          value: f.flockNo,
          label: `${f.flockNo}（${f.houseCode ?? ''}${f.currentQty ? ` · ${f.currentQty}${t('ui.羽', '羽')}` : ''}）`,
          raw: f,
        }));
    }} />;
}

// ── 等级（product_grades，仅 ACTIVE）────────────────────────────────────────
export function GradeSelector(p: BaseProps) {
  const { t } = useLanguage();
  return <ScopedSelect {...p} placeholder={p.placeholder ?? t('ui.请选择等级','请选择等级')}
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
  const { t } = useLanguage();
  return <ScopedSelect {...p} placeholder={p.placeholder ?? t('ui.请选择规格','请选择规格')}
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
  const { t } = useLanguage();
  return <ScopedSelect {...p} placeholder={p.placeholder ?? t('ui.请选择班次','请选择班次')}
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
  const { t, lang } = useLanguage();
  const { productCode, gradeCode, ...rest } = p;
  return <ScopedSelect {...rest} reloadDeps={[productCode, gradeCode, lang]} placeholder={p.placeholder ?? t('ui.请选择物料','请选择物料')}
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
          label: `${localizedMasterName(s, 'sku_name', lang) || s.product_name || s.sku_code}（${s.sku_code}${s.spec_code ? ' · ' + s.spec_code : ''}${s.grade_code ? ' · ' + s.grade_code : ''}）`,
          raw: s,
        }));
    }} />;
}

// ── 采购物料（mst_materials Runtime，仅 ACTIVE）──────────────────────────────
/**
 * 采购物资（饲料/兽药/包材/配件/建材等），与自家产品 SKU 区分。
 * value = material_code；onPick 回传 raw（material_code/material_name/material_type/spec/unit）。
 * 兼容 runtime active 返回 {code,name} 简化形态与全行形态。
 */
export function MaterialSelector(p: BaseProps) {
  const { t } = useLanguage();
  return <ScopedSelect {...p} placeholder={p.placeholder ?? t('ui.请选择物料','请选择物料')}
    loader={async () => (await lookupArr('/lookup/materials')).map((r: any) => {
      const code = r.material_code ?? r.code ?? '';
      const name = r.material_name ?? r.name ?? code;
      const spec = r.spec ?? '';
      return { value: code, label: `${name}（${code}${spec ? ' · ' + spec : ''}）`, raw: r };
    })} />;
}

// ── WMS 统一品目（物料 + 产成品 SKU）─────────────────────────────────────────
export function InventoryItemSelector(p: BaseProps) {
  const { t } = useLanguage();
  return <ScopedSelect {...p} placeholder={p.placeholder ?? t('ui.请选择库存品目','请选择物料或产成品 SKU')}
    loader={async () => (await lookupArr('/lookup/inventory-items')).map((r: any) => ({
      value: r.itemCode,
      label: `${r.itemName}（${r.itemCode} · ${r.itemType === 'SKU' ? t('ui.产成品','产成品') : t('ui.物料','物料')}${r.unit ? ` · ${r.unit}` : ''}）`,
      raw: r,
    }))} />;
}

// ── 成本归集部门（仅 ACTIVE，按公司 DataScope）──────────────────────────────
export function DepartmentSelector(p: BaseProps & { companyCode?: string }) {
  const { t } = useLanguage();
  const { companyCode, ...base } = p;
  const url = companyCode
    ? `/lookup/departments?companyCode=${encodeURIComponent(companyCode)}`
    : '/lookup/departments';
  return <ScopedSelect {...base} placeholder={base.placeholder ?? t('ui.请选择部门','请选择部门')}
    reloadDeps={[companyCode]}
    loader={async () => (await lookupArr(url)).map((r: any) => ({
      value: r.departmentCode,
      label: `${r.departmentName}（${r.departmentCode}）`,
      raw: r,
    }))} />;
}
