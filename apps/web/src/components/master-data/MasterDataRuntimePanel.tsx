"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Pencil, Send, Snowflake, Archive, RotateCcw, X, Link2, MoreHorizontal, Info } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import DictSelect from "@/components/shared-selectors/DictSelect";  // G66 字段挂字典
import { useDictOptions } from "@/hooks/useDictOptions";  // g200o:列表 dict 转译
import {
  CompanySelector, CustomerSelector, SupplierSelector, ProjectSelector,
  WarehouseSelector, ZoneSelector, LocationSelector, SkuSelector, UserSelector, FarmSelector,
} from "@/components/shared-selectors/MasterDataSelectors";  // G83 主数据档案选择器化
import { EmptyState, LoadingSkeleton, SelectField } from "@/components/design-system";
import {
  primaryActionButton, secondaryActionButton, inputField, formLabel, inlineBadge,
  drawerMask, drawerPanelFlex, drawerBody, drawerHeaderFlex, drawerHeaderTitle, drawerCloseButton, drawerFooterFlex,
  drawerHeroBox, drawerHeroLabel, drawerHeroCodeValue, drawerHeroNameValue, inlineAlert,
} from "@/components/design-system/cockpit-styles";
import request from "@/lib/api-client";
import { useRefreshToken } from "@/lib/list-refresh";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * MasterDataRuntimePanel — 通用核心主数据 Runtime 面板（G3-A）
 * 配置驱动：客户/供应商/项目/现金账户复用同一组件。
 * 能力：列表 + 新增 + 编辑 + 生命周期（提交审批/冻结/归档/恢复）+ 状态标签。
 */

export interface MdField {
  key: string; label: string; required?: boolean;
  type?: "text" | "number" | "date" | "select" | "readonly"
    | "company" | "customer" | "supplier" | "project"
    | "warehouse" | "zone" | "location" | "sku" | "user" | "farm";
  options?: { value: string; label: string }[];
  dictType?: string;   // 字段挂字典 → DictSelect
  onPickKeys?: Record<string, string>;   // 主数据自动带出：{ 目标key: raw字段名 }（onPick 有 ?? label 兜底）
  filterBy?: { warehouseField?: string; zoneField?: string; companyField?: string };  // 级联过滤
  readOnlyOnEdit?: boolean;
  // g200p: 分组(同 group 字段渲染到同一 section);page 模式下按 group 切 Panel;drawer 模式无效
  group?: string;
}

export interface MasterDataRuntimePanelProps {
  type: string;          // customer | supplier | project | cash-account
  title: string;
  codeKey: string;       // customer_no / supplier_code ...
  nameKey: string;
  fields: MdField[];     // 表单字段（不含编码，编码自动生成）
  columns: { key: string; label: string }[];  // 列表展示列
  objectType?: string;   // G5.5-D：用于引用关系查询（CUSTOMER/SUPPLIER/...）；默认按 type 推断
  /** UIX-7：点击编码触发详情 drawer（产品化 — 不传则编码列仅显示） */
  onCodeClick?: (code: string, row: Record<string, any>) => void;
  /** g200p:编辑模式 — drawer(默认,字段少时用) / page(字段多于 8 时,路由到全屏页) */
  mode?: "drawer" | "page";
  /** g200p:page 模式下,新建/编辑跳转的路由前缀。默认 `/master-data/<type>s` */
  pageRoutePrefix?: string;
}

type StatusTone = 'default' | 'success' | 'warning' | 'danger';
const STATUS_LABEL: Record<string, { label: string; tone: StatusTone }> = {
  DRAFT:            { label: "草稿",     tone: 'default' },
  PENDING_APPROVAL: { label: "待审批",   tone: 'warning' },
  ACTIVE:           { label: "已生效",   tone: 'success' },
  FROZEN:           { label: "已冻结",   tone: 'default' },
  ARCHIVED:         { label: "已归档",   tone: 'default' },
  REJECTED:         { label: "已驳回",   tone: 'danger' },
};

// 把后端裸错误码译成面向用户的中文提示（避免页面直接甩 MENU_PERMISSION_DENIED 这类技术码）
function friendlyError(raw: string, title: string): string {
  const m = raw || "";
  if (/MENU_PERMISSION_DENIED|forbidden|403/i.test(m)) {
    return `您没有「${title}」的访问权限。如需开通，请联系系统管理员。`;
  }
  if (/unauthorized|401|登录/i.test(m)) return "登录已失效，请重新登录后再试。";
  if (/network|fetch|timeout|超时/i.test(m)) return "网络异常或服务暂不可用，请稍后重试。";
  return m || "加载失败";
}

// g200p: 字段渲染抽公共函数 — 抽屉(RuntimePanel)和路由全屏页(MasterDataFormPage)共用
export function renderMdFieldInput(
  f: MdField,
  form: Record<string, any>,
  setForm: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  t?: (key: string, fallback?: string) => string,
  translateLiteral?: (text: string) => string,
): React.ReactNode {
  const tr = t ?? ((_k: string, fb?: string) => fb ?? _k);
  const tl = translateLiteral ?? ((text: string) => text);
  // G83：主数据选择器化 — 函数式 setForm 防 onChange→onPick 顺序污染
  const code = String(form[f.key] ?? "");
  const onChange = (v: string) => setForm(prev => ({ ...prev, [f.key]: v }));
  const onPick = (o: any) => {
    if (!f.onPickKeys) return;
    setForm(prev => {
      const next = { ...prev };
      Object.entries(f.onPickKeys!).forEach(([k, raw]) => { next[k] = o?.raw?.[raw] ?? o?.label ?? ""; });
      return next;
    });
  };
  const filterCompany = f.filterBy?.companyField ? String(form[f.filterBy.companyField] ?? "") : undefined;
  const filterWh = f.filterBy?.warehouseField ? String(form[f.filterBy.warehouseField] ?? "") : undefined;
  const filterZone = f.filterBy?.zoneField ? String(form[f.filterBy.zoneField] ?? "") : undefined;
  switch (f.type) {
    case "company":   return <CompanySelector value={code} onChange={onChange} onPick={onPick} />;
    case "customer":  return <CustomerSelector value={code} onChange={onChange} onPick={onPick} />;
    case "supplier":  return <SupplierSelector value={code} onChange={onChange} onPick={onPick} />;
    case "project":   return <ProjectSelector value={code} onChange={onChange} onPick={onPick} companyCode={filterCompany} />;
    case "warehouse": return <WarehouseSelector value={code} onChange={onChange} onPick={onPick} companyCode={filterCompany} />;
    case "zone":      return <ZoneSelector value={code} onChange={onChange} onPick={onPick} warehouseCode={filterWh} />;
    case "location":  return <LocationSelector value={code} onChange={onChange} onPick={onPick} warehouseCode={filterWh} zoneCode={filterZone} />;
    case "sku":       return <SkuSelector value={code} onChange={onChange} onPick={onPick} />;
    case "user":      return <UserSelector value={code} onChange={onChange} onPick={onPick} />;
    case "farm":      return <FarmSelector value={code} onChange={onChange} onPick={onPick} />;
  }
  if (f.dictType)
    return <DictSelect dictType={f.dictType} value={code} onChange={onChange} allowEmpty />;
  if (f.type === "select")
    return <select value={code} onChange={e => onChange(e.target.value)} style={inputField}>
      <option value="">{tr('ui.请选择','请选择')}</option>
      {(f.options ?? []).map(o => <option key={o.value} value={o.value}>{tl(o.label)}</option>)}
    </select>;
  if (f.type === "readonly")
    return <input type="text" value={code} readOnly style={{ ...inputField, background: "var(--bg-muted)", cursor: "not-allowed" }} />;
  return <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
    value={code} onChange={e => onChange(e.target.value)} style={inputField} />;
}

// G130/Governance: 主数据类型 → 专属菜单码（镜像后端 MasterDataTypeGuard 的 TYPE_TO_MENU）。
// 按类型维护人门控增/改按钮；ROLE_ADMIN 或 "*" 仍通过 usePermission 的 isSuper 处理，
// 不再把 MENU_MASTER_DATA 当作所有主数据叶子的可见性兜底。
const TYPE_TO_MENU: Record<string, string> = {
  customer: "MENU_MD_CUSTOMER", supplier: "MENU_MD_SUPPLIER", project: "MENU_MD_PROJECT",
  product: "MENU_MD_PRODUCT", grade: "MENU_MD_GRADE", spec: "MENU_MD_PACKAGING", sku: "MENU_MD_SKU",
  warehouse: "MENU_MD_WAREHOUSE", store: "MENU_MD_STORE", driver: "MENU_MD_DRIVER", vehicle: "MENU_MD_VEHICLE",
  "cash-account": "MENU_MD_CASH_ACCOUNT", "bank-account": "MENU_MD_BANK_ACCOUNT", material: "MENU_MD_MATERIAL",
};

// task #25：名称支持多语言维护的类型（DB 已补 <nameKey>_en / <nameKey>_lo 列；见迁移
//   AddMasterDataMultilingualNames + 服务 writableCols）。列表名称列按当前语言显示，
//   新建/编辑表单额外暴露英文/老挝文名称输入。vehicle 的"名称"是车牌（语言中性）故不含。
export const I18N_NAME_TYPES = new Set<string>([
  "customer", "supplier", "project", "material", "cash-account", "product",
  "store", "bank-account", "sku", "warehouse", "grade", "spec", "driver",
]);

/** task #25：为多语言类型追加「英文名称 / 老挝文名称」表单字段（抽屉与全屏页共用）。 */
export function multilingualNameFields(type: string, nameKey: string): MdField[] {
  if (!I18N_NAME_TYPES.has(type)) return [];
  return [
    { key: `${nameKey}_en`, label: "名称（English）", type: "text", group: "多语言名称" },
    { key: `${nameKey}_lo`, label: "名称（ລາວ 老挝文）", type: "text", group: "多语言名称" },
  ];
}

export function MasterDataRuntimePanel(props: MasterDataRuntimePanelProps) {
  const { type, title, codeKey, nameKey, fields, columns, objectType, onCodeClick, mode = "drawer", pageRoutePrefix } = props;
  const { tField, t, translateLiteral } = useLanguage();  // task #25：列表名称列按当前语言显示
  // task #25：多语言类型在表单末尾追加英文/老挝文名称输入；已在页面 fields 里配过的语言键不重复注入
  const formFields = useMemo(() => {
    const have = new Set(fields.map(f => f.key));
    return [...fields, ...multilingualNameFields(type, nameKey).filter(f => !have.has(f.key))];
  }, [fields, type, nameKey]);
  // g200o:聚合 fields 中所有 dictType,列表 cell 用 codeMap 转译,避免 DB enum 暴露
  const dictTypes = useMemo(() => Array.from(new Set(fields.filter(f => f.dictType).map(f => f.dictType!))), [fields]);
  const { codeMap: dictCodeMap } = useDictOptions(dictTypes.length > 0 ? dictTypes : "");
  // 列 key → field 反查(dict 转译用)
  const fieldByKey = useMemo(() => {
    const m: Record<string, MdField> = {};
    fields.forEach(f => { m[f.key] = f; });
    return m;
  }, [fields]);
  const perType = usePermission(TYPE_TO_MENU[type] ?? "MENU_MD_CENTER");
  const canCreate = perType.canCreate || perType.isSuper;
  const canEdit = perType.canEdit || perType.isSuper;
  // G131：支持业务单据页(如采购供应商档案)直达「新增」——?create=1 自动开新增抽屉，
  //   存完后 returnTo 自动回跳来源页（采购员无需手动绕回）。
  //   用 window.location 读 query（避免 useSearchParams 强制 Suspense 边界 / 整页 CSR bailout）。
  const router = useRouter();
  const [returnTo, setReturnTo] = useState("");
  const [autoCreate, setAutoCreate] = useState(false);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");   // G92：关键字段变更转审批等正向提示
  const [filterStatus, setFilterStatus] = useState("");
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  // G5.5-D：行内引用计数
  const [refCounts, setRefCounts] = useState<Record<string, { total: number; loading: boolean }>>({});

  const resolvedObjectType = (objectType ?? type.toUpperCase().replace(/-/g, '_'));

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const qs = filterStatus ? `?status=${filterStatus}` : "";
      setRows(await request<Record<string, any>[]>(`/master-data/runtime/${type}${qs}`));
    } catch (e: unknown) { setError(friendlyError(e instanceof Error ? e.message : "", title)); }
    finally { setLoading(false); }
  }, [type, filterStatus]);

  useRefreshToken(load);
  // G131：挂载时读 query（?create=1 / returnTo）；create=1 且有权 → 自动打开「新增」抽屉
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setReturnTo(sp.get("returnTo") || "");
    setAutoCreate(sp.get("create") === "1");
  }, []);
  useEffect(() => {
    if (autoCreate && canCreate) { setForm({}); setEditing({}); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCreate, canCreate]);

  // G5.5-D：按需懒加载行的引用计数（避免一次性查询全部）
  const fetchRefCount = useCallback(async (code: string) => {
    if (refCounts[code]) return;
    setRefCounts(prev => ({ ...prev, [code]: { total: 0, loading: true } }));
    try {
      const r = await request<{ totalReferences: number }>(`/master-data/references/${resolvedObjectType}/${encodeURIComponent(code)}`);
      setRefCounts(prev => ({ ...prev, [code]: { total: r.totalReferences ?? 0, loading: false } }));
    } catch {
      setRefCounts(prev => ({ ...prev, [code]: { total: -1, loading: false } }));
    }
  }, [resolvedObjectType, refCounts]);

  // g200p: page 模式跳路由,drawer 模式开抽屉
  const routePrefix = pageRoutePrefix ?? `/master-data/${type}s`;
  const openNew = () => {
    if (mode === "page") router.push(`${routePrefix}/new`);
    else { setForm({}); setEditing({}); }
  };
  const openEdit = (row: Record<string, any>) => {
    if (mode === "page") router.push(`${routePrefix}/${encodeURIComponent(row[codeKey])}/edit`);
    else { setForm({ ...row }); setEditing(row); }
  };

  const save = async () => {
    for (const f of fields) {
      if (f.required && !form[f.key]) { setError(`${t('ui.请填写：','请填写：')}${translateLiteral(f.label)}`); return; }
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const isNew = !editing?.[codeKey];
      if (isNew) {
        await request(`/master-data/runtime/${type}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      } else {
        // G92：编辑可能返回 pendingChange（关键字段变更转审批）——透出提示让用户知道原值在通过前保持
        const resp = await request<{ pendingChange?: boolean; message?: string }>(
          `/master-data/runtime/${type}/${editing[codeKey]}`,
          { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) },
        );
        if (resp?.pendingChange) {
          setNotice(resp.message || t('ui.关键字段变更已提交审批，通过后生效。','关键字段变更已提交审批，通过后生效。'));
        }
      }
      setEditing(null); await load();
      // G131：从业务页直达新增的，新建成功后自动回跳来源页（带 created 标记供来源页刷新/提示）
      if (isNew && returnTo) {
        router.push(`${returnTo}${returnTo.includes("?") ? "&" : "?"}created=1`);
      }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : t('ui.保存失败','保存失败')); }
    finally { setSaving(false); }
  };

  const doTransition = async (row: Record<string, any>, action: string) => {
    try {
      await request(`/master-data/runtime/${type}/${row[codeKey]}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : t('ui.操作失败','操作失败')); }
  };

  // 按状态决定可用动作（PENDING_APPROVAL 由「审批中心」走 Workflow，面板不直接审批，避免绕过治理）
  const actionsFor = (status: string) => {
    const a: { action: string; label: string; icon: any }[] = [];
    if (status === "DRAFT" || status === "REJECTED") a.push({ action: "submit", label: t('ui.提交审批','提交审批'), icon: Send });
    if (status === "ACTIVE") a.push({ action: "freeze", label: t('ui.冻结','冻结'), icon: Snowflake });
    if (status === "FROZEN" || status === "ARCHIVED") a.push({ action: "restore", label: t('ui.恢复','恢复'), icon: RotateCcw });
    if (status !== "ARCHIVED") a.push({ action: "archive", label: t('ui.归档','归档'), icon: Archive });
    return a;
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ width: 150 }}>
          <SelectField
            value={filterStatus}
            onChange={setFilterStatus}
            options={Object.entries(STATUS_LABEL).map(([k, v]) => ({ value: k, label: translateLiteral(v.label) }))}
            emptyLabel={t('ui.全部状态','全部状态')}
            allowEmpty
            filter
          />
        </div>
        <button onClick={load} disabled={loading} className="bg-bg-muted border border-border text-text-muted"
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> {t('ui.刷新','刷新')}
        </button>
        {canCreate && (
          <button onClick={openNew} style={{ ...primaryActionButton, marginLeft: "auto" }}>
            <Plus size={14} /> {t('ui.新增','新增')}{translateLiteral(title)}
          </button>
        )}
      </div>

      {error && <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 14, background: "var(--status-danger-bg)", border: "1px solid var(--status-danger-border)", color: "var(--status-danger)", fontSize: 13 }}>{error}</div>}

      {notice && (
        <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 14, background: "var(--status-warning-bg)", border: "1px solid var(--status-warning-border)", color: "var(--status-warning)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Send size={14} /> {notice}
          <button onClick={() => setNotice("")} style={{ marginLeft: "auto", background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 13 }}>✕</button>
        </div>
      )}

      <div style={{ borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden", background: "var(--bg-card)" }}>
        {loading ? <div style={{ padding: 16 }}><LoadingSkeleton variant="table" rows={6} /></div>
          : rows.length === 0 ? <div style={{ padding: 32 }}><EmptyState title={`${t('ui.暂无','暂无')}${translateLiteral(title)}${t('ui.数据','数据')}`} compact /></div>
          : (
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "auto" }}>
              <thead><tr style={{ background: "var(--bg-muted)", color: "var(--text-secondary)" }}>
                <th style={thStyle}>{t('ui.编码','编码')}</th>
                {columns.map(c => <th key={c.key} style={thStyle}>{translateLiteral(c.label)}</th>)}
                <th style={{ ...thStyle, textAlign: "center", width: 80 }}>{t('ui.状态','状态')}</th>
                <th style={{ ...thStyle, textAlign: "center", width: 60 }}>{t('ui.引用','引用')}</th>
                <th style={{ ...thStyle, textAlign: "right", width: 130 }}>{t('ui.操作','操作')}</th>
              </tr></thead>
              <tbody>
                {rows.map(r => {
                  const st = STATUS_LABEL[r.status] ?? { label: r.status, tone: 'default' as StatusTone };
                  return (
                    <tr key={r[codeKey]} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--color-primary)" }}>
                        {onCodeClick ? (
                          <button
                            type="button"
                            onClick={() => onCodeClick(r[codeKey], r)}
                            style={{
                              background: "transparent", border: "none", color: "var(--color-primary)",
                              fontFamily: "monospace", fontSize: 13, padding: 0, cursor: "pointer",
                              textDecoration: "underline", textUnderlineOffset: 2,
                              whiteSpace: "nowrap",
                            }}
                          >{r[codeKey]}</button>
                        ) : r[codeKey]}
                      </td>
                      {columns.map(c => {
                        const raw = r[c.key];
                        const dt  = fieldByKey[c.key]?.dictType;
                        // task #25：名称列按当前语言取 <nameKey>_<lang>（缺则回退中文）；
                        //   兼容部分页面把名称列配成 <nameKey>_zh（如 products/warehouses）
                        const i18nName = I18N_NAME_TYPES.has(type) && (c.key === nameKey || c.key === `${nameKey}_zh`);
                        // g200o:dict 字段查 codeMap 转中文,fallback 原值
                        const shown = i18nName ? tField(r, nameKey)
                          : dt && raw != null && raw !== '' ? (dictCodeMap[String(raw)] ?? raw) : raw;
                        return <td key={c.key} style={tdStyle} title={String(raw ?? "")}>{shown ?? "—"}</td>;
                      })}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span style={{ ...inlineBadge(st.tone), whiteSpace: "nowrap" }}>{translateLiteral(st.label)}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {/* G5.5-D：引用计数（懒加载，悬浮触发） */}
                        {refCounts[r[codeKey]] ? (
                          refCounts[r[codeKey]].loading ? <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>…</span> :
                          refCounts[r[codeKey]].total < 0 ? <span style={{ fontSize: 11, color: "var(--status-danger)" }}>err</span> :
                          refCounts[r[codeKey]].total === 0 ? <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>0</span> :
                          <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "var(--status-warning-bg, var(--status-warning-bg-light))", color: "var(--status-warning, var(--status-warning))", fontWeight: 600 }} title={`${t('ui.被','被')} ${refCounts[r[codeKey]].total} ${t('ui.处业务引用','处业务引用')}`}>
                            <Link2 size={9} style={{ display: "inline", marginRight: 2 }} />{refCounts[r[codeKey]].total}
                          </span>
                        ) : (
                          <button onClick={() => fetchRefCount(r[codeKey])}
                            style={{ fontSize: 11, padding: "1px 8px", borderRadius: 4, background: "var(--bg-muted)", color: "var(--text-secondary)", border: "1px solid var(--border)", cursor: "pointer" }}>
                            {t('ui.查询','查询')}
                          </button>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <RowActions
                          row={r}
                          canEdit={canEdit}
                          onEdit={() => openEdit(r)}
                          transitions={actionsFor(r.status)}
                          onTransition={(action) => doTransition(r, action)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
      </div>

      {/* 新增/编辑抽屉 — g200o-2 flex 三段 + Portal 渲染到 body 顶层
           (绕过 animate-fade-in 的 transform 让 fixed containing block 锚到祖先的问题) */}
      {editing !== null && typeof document !== 'undefined' && createPortal(
        <div style={drawerMask} onClick={() => setEditing(null)}>
          <div style={drawerPanelFlex(480)} onClick={e => e.stopPropagation()}>
            <div style={drawerHeaderFlex}>
              <h2 style={drawerHeaderTitle}>{editing[codeKey] ? `${t('ui.编辑','编辑')}${translateLiteral(title)}` : `${t('ui.新增','新增')}${translateLiteral(title)}`}</h2>
              <button onClick={() => setEditing(null)} style={drawerCloseButton}><X size={20} /></button>
            </div>
            <div style={drawerBody}>
            {/* g200o-1:hero 块 — 编辑显示编码 + 名称;新增显示 inlineAlert 提示 */}
            {editing[codeKey] ? (
              <div style={drawerHeroBox}>
                <div>
                  <div style={drawerHeroLabel}>{translateLiteral(title)}{t('ui.编码','编码')}</div>
                  <div style={drawerHeroCodeValue}>{editing[codeKey]}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={drawerHeroLabel}>{t('ui.名称','名称')}</div>
                  <div style={drawerHeroNameValue}>{String(editing[nameKey] ?? form[nameKey] ?? "—")}</div>
                </div>
              </div>
            ) : (
              <div style={{ ...inlineAlert("info"), marginBottom: 18 }}>
                <Info size={14} />
                <span>{t('ui.编码将在保存时自动生成,无需手填','编码将在保存时自动生成,无需手填')}</span>
              </div>
            )}
            {formFields.map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={formLabel}>
                  {translateLiteral(f.label)}{f.required && <span style={{ color: "var(--status-danger)", marginLeft: 4 }}>*</span>}
                </label>
                {renderMdFieldInput(f, form, setForm, t, translateLiteral)}
              </div>
            ))}
            </div>
            <div style={drawerFooterFlex}>
              <button onClick={() => setEditing(null)} style={{ ...secondaryActionButton, flex: 1, justifyContent: "center" }}>{t('ui.取消','取消')}</button>
              <button onClick={save} disabled={saving} style={{ ...primaryActionButton, flex: 2, justifyContent: "center", opacity: saving ? 0.6 : 1 }}>
                {saving ? t('ui.保存中…','保存中…') : t('ui.保存','保存')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 28, height: 26, borderRadius: 6, border: "1px solid var(--border)",
  background: "var(--bg-muted)", color: "var(--text-secondary)", cursor: "pointer",
};

// UIX-PROD-2: 紧凑表格单元格
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "9px 12px",
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const tdStyle: React.CSSProperties = {
  padding: "9px 12px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 240,
};

// UIX-PROD-2: 行操作（编辑 + dropdown）
function RowActions({ row, canEdit, onEdit, transitions, onTransition }: {
  row: Record<string, any>;
  canEdit: boolean;
  onEdit: () => void;
  transitions: { action: string; label: string; icon: any }[];
  onTransition: (action: string) => void;
}) {
  const { t, translateLiteral } = useLanguage();
  const [open, setOpen] = useState(false);
  // FIX：下拉菜单经 createPortal 渲染到 body，并按按钮 rect 用 position:fixed 定位。
  //   旧实现用 position:absolute 渲染在表格内，被外层卡片 overflow:hidden + 表格
  //   overflowX:auto 两层裁剪框纵向裁掉 → 菜单整体被裁不可见也不可点（点 ⋯「无响应」）。
  //   与编辑抽屉、消息中心下拉同模式（portal 到 body 绕过祖先裁剪/transform）。
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [menuRect, setMenuRect] = useState<{ top: number; right: number } | null>(null);
  const archived = row.status === "ARCHIVED";

  if (!canEdit) return null;

  const toggleMenu = () => {
    setOpen(o => {
      const next = !o;
      if (next && moreBtnRef.current) {
        const r = moreBtnRef.current.getBoundingClientRect();
        setMenuRect({ top: r.bottom + 4, right: window.innerWidth - r.right });
      }
      return next;
    });
  };

  return (
    <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
      {!archived && (
        <button onClick={onEdit} title={t('ui.编辑','编辑')} style={iconBtn}>
          <Pencil size={13} />
        </button>
      )}
      {transitions.length > 0 && (
        <div style={{ position: "relative" }}>
          <button
            ref={moreBtnRef}
            type="button"
            onClick={toggleMenu}
            title={t('ui.更多操作','更多操作')}
            style={iconBtn}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          >
            <MoreHorizontal size={14} />
          </button>
          {open && menuRect && typeof document !== 'undefined' && createPortal(
            <div style={{
              position: "fixed", right: menuRect.right, top: menuRect.top, zIndex: 11000,
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: 8, padding: 4, minWidth: 130,
              boxShadow: "0 4px 16px var(--overlay-black-15)",
            }}>
              {transitions.map(a => (
                <button
                  key={a.action}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); onTransition(a.action); setOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "7px 10px", background: "transparent", border: "none",
                    color: "var(--text-primary)", fontSize: 12, cursor: "pointer",
                    borderRadius: 6, textAlign: "left",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-muted)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <a.icon size={12} /> {translateLiteral(a.label)}
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>
      )}
    </div>
  );
}

export default MasterDataRuntimePanel;
