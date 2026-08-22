"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import u from "@/styles/uix-utils.module.css";
import PageHeader from "@/components/PageHeader";
import { ModalV2 } from "@/components/design-system/dialogs/ModalV2";
import { RefreshCw, Link2, Settings, ClipboardList, Wifi, WifiOff } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
import { primaryActionButton, secondaryActionButton, actionPill } from "@/components/design-system/cockpit-styles";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDialog } from "@/contexts/DialogContext";
import { useToast } from "@/contexts/ToastContext";
const API = "/api/farm-device";
type TabId = "mapping" | "jobs" | "devices" | "dict" | "opslog";

// ── Types ────────────────────────────────────────────────────────────────────
interface Mapping {
  id: number;
  erp_farm_code: string;
  erp_house_code: string;
  house_name?: string;
  vendor_farm_id: string;
  vendor_house_id: string;
  vendor_house_name?: string;
  sync_freq_min: number;
  status: "ACTIVE" | "INACTIVE";
  mapped_by?: string;
  mapped_at?: string;
}
interface VendorHouse {
  vendor_farm_id: string;
  vendor_farm_name?: string;
  vendor_house_id: string;
  vendor_house_name?: string;
}
interface ErpHouse {
  house_code: string;
  house_name: string;
  farm_code: string;
}
interface ErpFarm {
  farm_code: string;
  farm_name: string;
}
interface SyncJob {
  id: number;
  job_no: string;
  job_type: string;
  triggered_by: string;
  started_at?: string;
  duration_ms?: number;
  total_houses?: number;
  success_count?: number;
  fail_count?: number;
  record_count?: number;
  status: "SUCCESS" | "RUNNING" | "FAILED" | "PARTIAL";
}
interface OfflineDevice {
  id: number;
  imei: string;
  device_name?: string;
  device_type?: string;
  erp_house_code?: string;
  status?: string;
  last_online_at?: string;
}
interface PropDict {
  id: number;
  property_code: string;
  name_zh: string;
  unit?: string;
  category?: string;
  threshold_high?: number | null;
  threshold_low?: number | null;
  alert_min_duration_cycles?: number;
  alert_volatility_pct?: number;
  alarm_enabled: number;
  trend_enabled: number;
}
interface OpsLog {
  id: number;
  op_type: string;
  erp_house_code?: string;
  operator?: string;
  detail_json?: string;
  result: "SUCCESS" | "FAILED";
  created_at: string;
}
interface AuthStatus {
  hasToken: boolean;
  appId?: string;
  remainMin?: number;
  base?: string;
  error?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getToken() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}
function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`
  };
}
async function apiFetch<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...authHeaders(),
        ...(init?.headers ?? {})
      }
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d;
  } catch {
    return null;
  }
}
function isAuthStatus(value: unknown): value is AuthStatus {
  return Boolean(value && typeof value === "object" && "hasToken" in value && typeof (value as AuthStatus).hasToken === "boolean");
}
function StatusPill({
  active,
  label
}: {
  active: boolean;
  label: string;
}) {
  return <span style={{
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 700,
    background: active ? "color-mix(in srgb, var(--status-success) 14%, transparent)" : "var(--text-primary)",
    color: active ? "var(--status-success)" : "var(--text-secondary)"
  }}>{label}</span>;
}
function JobStatusPill({
  status
}: {
  status: string;
}) {
  const map: Record<string, [string, string]> = {
    SUCCESS: ["color-mix(in srgb, var(--status-success) 14%, transparent)", "var(--status-success)"],
    RUNNING: ["color-mix(in srgb, var(--color-accent) 14%, transparent)", "var(--color-accent)"],
    FAILED: ["color-mix(in srgb, var(--status-danger) 14%, transparent)", "var(--status-danger)"],
    PARTIAL: ["color-mix(in srgb, var(--status-warning) 14%, transparent)", "var(--status-warning)"]
  };
  const [bg, color] = map[status] || ["var(--text-primary)", "var(--text-secondary)"];
  return <span style={{
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 700,
    background: bg,
    color
  }}>{status}</span>;
}
function fmtDt(v?: string | null) {
  return v ? new Date(v).toLocaleString("zh-CN") : "—";
}

// ── empty forms ───────────────────────────────────────────────────────────────
const emptyMapForm = () => ({
  erp_farm_code: "",
  erp_house_code: "",
  vendor_farm_id: "",
  vendor_house_id: ""
});
type EditFormState = {
  erp_farm_code: string;
  erp_house_code: string;
  vendor_farm_id: string;
  vendor_house_id: string;
  sync_freq_min: number;
  status: "ACTIVE" | "INACTIVE";
  alert_config: Record<string, {
    threshold_high?: number;
    threshold_low?: number;
  }>;
};
const emptyEditForm = (): EditFormState => ({
  erp_farm_code: "",
  erp_house_code: "",
  vendor_farm_id: "",
  vendor_house_id: "",
  sync_freq_min: 5,
  status: "ACTIVE",
  alert_config: {}
});


// ── Input style ───────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--bg-page)",
  color: "var(--text-primary)",
  fontSize: 13,
  boxSizing: "border-box"
};
const inpSm: React.CSSProperties = {
  ...inp,
  padding: "5px 8px",
  fontSize: 12
};
function Label({
  children
}: {
  children: React.ReactNode;
}) {
  return <div style={{
    fontSize: 12,
    color: "var(--text-secondary)",
    marginBottom: 4
  }}>{children}</div>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DeviceOpsPage() {
  const {
    t
  } = useLanguage();
  const { showConfirm } = useDialog();
  const toast = useToast();
  const [tab, setTab] = useState<TabId>("mapping");
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [vendorHouses, setVendorHouses] = useState<VendorHouse[]>([]);
  const [erpHouses, setErpHouses] = useState<ErpHouse[]>([]);
  const [erpFarms, setErpFarms] = useState<ErpFarm[]>([]);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [offlineDevices, setOfflineDevices] = useState<OfflineDevice[]>([]);
  const [propDict, setPropDict] = useState<PropDict[]>([]);
  const [opsLog, setOpsLog] = useState<OpsLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");

  // modals
  const [showMapForm, setShowMapForm] = useState(false);
  const [mapForm, setMapForm] = useState(emptyMapForm());
  const [editRow, setEditRow] = useState<Mapping | null>(null);
  const [editForm, setEditForm] = useState(emptyEditForm());
  const [dictEditRow, setDictEditRow] = useState<PropDict | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Data loaders ─────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [mapRes, vhRes, erpHRes, erpFRes, authRes] = await Promise.all([apiFetch<Mapping[]>(`${API}/mappings`), apiFetch<VendorHouse[]>(`${API}/vendor-houses`), apiFetch<{
        data?: ErpHouse[];
      } | ErpHouse[]>("/api/crud/brd_houses?limit=200"), apiFetch<{
        data?: ErpFarm[];
      } | ErpFarm[]>("/api/crud/brd_farms?limit=50"), apiFetch<AuthStatus>(`${API}/auth/status`)]);
      setMappings(Array.isArray(mapRes) ? mapRes : []);
      setVendorHouses(Array.isArray(vhRes) ? vhRes : []);
      const hd = erpHRes as any;
      setErpHouses(Array.isArray(hd?.data) ? hd.data : Array.isArray(hd) ? hd : []);
      const fd = erpFRes as any;
      setErpFarms(Array.isArray(fd?.data) ? fd.data : Array.isArray(fd) ? fd : []);
      setAuthStatus(isAuthStatus(authRes) ? authRes : {
        hasToken: false,
        appId: "",
        remainMin: 0,
        error: "认证状态接口暂不可用",
      });
    } finally {
      setLoading(false);
    }
  }, []);
  const loadJobs = useCallback(async () => {
    const d = await apiFetch<SyncJob[]>(`${API}/sync/jobs`);
    setJobs(Array.isArray(d) ? d : []);
  }, []);
  const loadOffline = useCallback(async () => {
    const d = await apiFetch<OfflineDevice[]>(`${API}/devices/offline`);
    setOfflineDevices(Array.isArray(d) ? d : []);
  }, []);
  const loadDict = useCallback(async () => {
    const d = await apiFetch<PropDict[]>(`${API}/property-dict`);
    setPropDict(Array.isArray(d) ? d : []);
  }, []);
  const loadOpsLog = useCallback(async () => {
    const d = await apiFetch<OpsLog[]>(`${API}/ops-log?limit=100`);
    setOpsLog(Array.isArray(d) ? d : []);
  }, []);
  useEffect(() => {
    loadAll();
  }, [loadAll]);
  useEffect(() => {
    if (tab === "jobs") loadJobs();
    if (tab === "devices") loadOffline();
    if (tab === "dict") loadDict();
    if (tab === "opslog") loadOpsLog();
  }, [tab]); // eslint-disable-line

  // ── Derived lists ────────────────────────────────────────────────────────
  const vendorFarmIds = useMemo(() => [...new Set(vendorHouses.map(h => h.vendor_farm_id).filter(Boolean))], [vendorHouses]);
  const filterHouses = useMemo(() => erpHouses.filter(h => !mapForm.erp_farm_code || h.farm_code === mapForm.erp_farm_code), [erpHouses, mapForm.erp_farm_code]);
  const filterVendorHouses = useMemo(() => vendorHouses.filter(h => !mapForm.vendor_farm_id || h.vendor_farm_id === mapForm.vendor_farm_id), [vendorHouses, mapForm.vendor_farm_id]);
  const editFilterHouses = useMemo(() => erpHouses.filter(h => !editForm.erp_farm_code || h.farm_code === editForm.erp_farm_code), [erpHouses, editForm.erp_farm_code]);
  const editVendorHouses = useMemo(() => vendorHouses.filter(h => !editForm.vendor_farm_id || h.vendor_farm_id === editForm.vendor_farm_id), [vendorHouses, editForm.vendor_farm_id]);
  const filteredMappings = useMemo(() => {
    if (!search) return mappings;
    const q = search.toLowerCase();
    return mappings.filter(m => [m.erp_house_code, m.erp_farm_code, m.vendor_house_id, m.vendor_farm_id, m.house_name, m.vendor_house_name].some(v => v?.toLowerCase().includes(q)));
  }, [mappings, search]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSyncHouses = async () => {
    setSyncing(true);
    try {
      const d = await apiFetch<{
        ok: boolean;
        synced?: number;
        error?: string;
      }>(`${API}/sync/houses`, {
        method: "POST"
      });
      if (!d) {
        toast.error(t("crud.err.timeout", "网络连接失败，请检查服务器后重试"));
        return;
      }
      const syncMessage = d.ok ? `${t('ui.已同步', '已同步')} ${d.synced ?? 0} ${t('ui.条第三方栏舍数据', '条第三方栏舍数据')}` : d.error || t('ui.第三方 API 返回错误，请检查认证配置', '第三方 API 返回错误，请检查认证配置');
      if (d.ok) toast.success(syncMessage);
      else toast.error(syncMessage);
      if (d.ok) await loadAll();
    } finally {
      setSyncing(false);
    }
  };
  const handleSaveMapping = async () => {
    const {
      erp_farm_code,
      erp_house_code,
      vendor_farm_id,
      vendor_house_id
    } = mapForm;
    if (!erp_farm_code || !erp_house_code || !vendor_farm_id || !vendor_house_id) {
      return toast.warning(t("ui.请完整填写所有映射字段", "请完整填写所有映射字段"));
    }
    setSaving(true);
    try {
      const d = await apiFetch<{
        ok: boolean;
        message?: string;
        error?: string;
      }>(`${API}/mapping`, {
        method: "POST",
        body: JSON.stringify(mapForm)
      });
      if (d?.ok) {
        toast.success(d.message || t("ui.映射已保存", "映射已保存"));
        setShowMapForm(false);
        setMapForm(emptyMapForm());
        loadAll();
      } else {
        toast.error(d?.error || t("ui.保存失败", "保存失败"));
      }
    } finally {
      setSaving(false);
    }
  };
  const handleDeleteMapping = async (row: Mapping) => {
    const ok = await showConfirm({
      icon: "🗑️",
      type: "danger",
      title: t("ui.确认删除映射", "确认删除映射"),
      message: `${row.erp_house_code} ↔ ${row.vendor_house_name || row.vendor_house_id}`,
      confirmLabel: t("ui.确认删除", "确认删除"),
      cancelLabel: t("common.cancel", "取消")
    });
    if (!ok) return;
    const d = await apiFetch<{
      ok: boolean;
      msg?: string;
      error?: string;
    }>(`${API}/mapping/${row.id}`, {
      method: "DELETE"
    });
    const deleteMessage = d?.msg || d?.error || (d?.ok ? t("ui.已删除", "已删除") : t("ui.删除失败", "删除失败"));
    if (d?.ok) toast.success(deleteMessage);
    else toast.error(deleteMessage);
    if (d?.ok) loadAll();
  };
  const handleOpenEdit = async (row: Mapping) => {
    const d = await apiFetch<{
      alert_config?: Record<string, any>;
    }>(`${API}/mapping/${row.id}/alert-config`);
    setEditForm({
      erp_farm_code: row.erp_farm_code || "",
      erp_house_code: row.erp_house_code || "",
      vendor_farm_id: row.vendor_farm_id || "",
      vendor_house_id: row.vendor_house_id || "",
      sync_freq_min: row.sync_freq_min ?? 5,
      status: (row.status || "ACTIVE") as "ACTIVE" | "INACTIVE",
      alert_config: d?.alert_config || {}
    });
    setEditRow(row);
    // ensure propDict loaded for alert override section
    if (propDict.length === 0) loadDict();
  };
  const handleSaveEdit = async () => {
    const {
      erp_farm_code,
      erp_house_code,
      vendor_farm_id,
      vendor_house_id
    } = editForm;
    if (!erp_farm_code || !erp_house_code || !vendor_farm_id || !vendor_house_id) {
      return toast.warning(t("ui.请完整填写", "请完整填写必填字段"));
    }
    if (!editRow) return;
    setSaving(true);
    try {
      const d = await apiFetch<{
        ok: boolean;
        msg?: string;
        error?: string;
      }>(`${API}/mapping/${editRow.id}`, {
        method: "PUT",
        body: JSON.stringify(editForm)
      });
      if (d?.ok) {
        toast.success(d.msg || t("ui.保存成功", "保存成功"));
        setEditRow(null);
        loadAll();
      } else {
        toast.error(d?.error || t("ui.保存失败", "保存失败"));
      }
    } finally {
      setSaving(false);
    }
  };
  const handleSaveDictEdit = async () => {
    if (!dictEditRow) return;
    setSaving(true);
    try {
      const d = await apiFetch<{
        ok: boolean;
        error?: string;
      }>(`${API}/property-dict/${dictEditRow.id}`, {
        method: "PUT",
        body: JSON.stringify({
          threshold_high: dictEditRow.threshold_high !== undefined && dictEditRow.threshold_high !== null && String(dictEditRow.threshold_high) !== "" ? Number(dictEditRow.threshold_high) : null,
          threshold_low: dictEditRow.threshold_low !== undefined && dictEditRow.threshold_low !== null && String(dictEditRow.threshold_low) !== "" ? Number(dictEditRow.threshold_low) : null,
          alarm_enabled: dictEditRow.alarm_enabled ? 1 : 0,
          trend_enabled: dictEditRow.trend_enabled ? 1 : 0,
          alert_min_duration_cycles: Number(dictEditRow.alert_min_duration_cycles) || 3,
          alert_volatility_pct: Number(dictEditRow.alert_volatility_pct) || 0.2
        })
      });
      if (d?.ok) {
        setDictEditRow(null);
        loadDict();
      } else toast.error(d?.error || t("ui.保存失败", "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  // ── Tab definitions ───────────────────────────────────────────────────────
  const TABS: {
    id: TabId;
    label: string;
  }[] = [{
    id: "mapping",
    label: t("ui.栏舍映射", "栏舍映射")
  }, {
    id: "jobs",
    label: t("ui.采集日志", "采集日志")
  }, {
    id: "devices",
    label: t("ui.离线设备", "离线设备")
  }, {
    id: "dict",
    label: t("ui.属性字典", "属性字典")
  }, {
    id: "opslog",
    label: t("ui.运维审计", "运维审计")
  }];
  const OP_TYPE_COLORS: Record<string, string> = {
    MAPPING: "var(--status-special)",
    THRESHOLD: "var(--status-warning)",
    ALERT_CONFIG: "var(--status-special)",
    MANUAL_SYNC: "var(--status-success)"
  };
  return <div className="animate-fade-in">
      <PageHeader title={t("ui.设备运维中心", "设备运维中心")} subtitle={t("ui.栏舍映射配置", "第三方 IoT 采集映射 · 属性字典 · 运维审计")} breadcrumb={[t("ui.养殖管理", "养殖生产中心"), t("ui.设备运维中心", "设备运维中心")]} actions={<div style={{
      display: "flex",
      gap: 8
    }}>
            <button type="button" style={secondaryActionButton} onClick={handleSyncHouses} disabled={syncing || loading}>
              <RefreshCw size={13} style={{
          animation: syncing ? "spin 1s linear infinite" : "none"
        }} />
              {t("ui.同步第三方栏舍", "同步第三方栏舍")}
            </button>
            <button type="button" style={primaryActionButton} onClick={() => {
        setMapForm(emptyMapForm());
        setShowMapForm(true);
      }}>
              <Link2 size={13} />
              {t("ui.新建映射", "新建映射")}
            </button>
          </div>} />

      {/* API 认证状态 */}
      {authStatus && <div style={{
      background: authStatus.hasToken ? "color-mix(in srgb,var(--status-success) 8%,transparent)" : "color-mix(in srgb,var(--status-warning) 10%,transparent)",
      border: `1px solid ${authStatus.hasToken ? "var(--status-success)" : "color-mix(in srgb, var(--status-warning) 18%, transparent)"}`,
      borderRadius: 8,
      padding: "10px 16px",
      marginBottom: 16,
      display: "flex",
      alignItems: "center",
      gap: 10,
      fontSize: 13
    }}>
          {authStatus.hasToken ? <Wifi size={14} style={{
        color: "var(--status-success)"
      }} /> : <WifiOff size={14} style={{
        color: "var(--status-warning)"
      }} />}
          <span className={u.fw600}>{t('ui.第三方 IoT API：', '第三方 IoT API：')}</span>
          {authStatus.hasToken ? `${t("ui.已认证", "已认证")} · AppID: ${authStatus.appId || "—"} · ${t('ui.Token 剩余', 'Token 剩余')} ${authStatus.remainMin ?? 0} min` : `${t("ui.未获取Token", "未获取 Token — 请检查环境变量配置")}${authStatus.error ? `：${authStatus.error}` : ""}`}
        </div>}

      {/* Tab 切换 */}
      <div style={{
      display: "flex",
      borderBottom: "2px solid var(--border)",
      marginBottom: 16
    }}>
        {TABS.map(tb => <button key={tb.id} type="button" onClick={() => {
        setTab(tb.id);
        setSearch("");
      }} style={{
        padding: "10px 20px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontWeight: 600,
        fontSize: 13,
        marginBottom: -2,
        borderBottom: tab === tb.id ? "2px solid var(--color-primary)" : "2px solid transparent",
        color: tab === tb.id ? "var(--color-primary)" : "var(--text-secondary)"
      }}>
            {tb.label}
          </button>)}
      </div>

      {/* ── Tab: 栏舍映射 ──────────────────────────────────────────────────── */}
      {tab === "mapping" && <div className={s.card}>
          <div className={`${s.cardHeader} ${u.flexBetween}`}>
            <span className={s.cardTitle}>{t("ui.栏舍映射列表", "栏舍映射列表")} ({filteredMappings.length})</span>
            <input placeholder={t("ui.搜索", "搜索鸡舍、场区...")} value={search} onChange={e => setSearch(e.target.value)} style={{
          ...inp,
          width: 220
        }} />
          </div>
          <div className={u.scrollX}>
            <table className={s.table}>
              <thead>
                <tr>
                  {[t("ui.ERP场区", "ERP场区"), t("ui.ERP鸡舍", "ERP鸡舍"), t("ui.鸡舍名称", "鸡舍名称"), t("ui.第三方Farm", "第三方Farm"), t("ui.第三方House", "第三方House"), t("ui.第三方名称", "第三方名称"), t("ui.采集频率", "频率(min)"), t("ui.状态", "状态"), t("ui.操作人", "操作人"), t("ui.映射时间", "映射时间"), t("ui.操作", "操作")].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={11} className={u.emptyPad40}>{t("common.loading", "加载中...")}</td></tr> : filteredMappings.length === 0 ? <tr><td colSpan={11} className={u.emptyPad40}>{t('ui.暂无映射记录', '暂无映射记录')}</td></tr> : filteredMappings.map(row => <tr key={row.id}>
                    <td><code className={u.fs12}>{row.erp_farm_code}</code></td>
                    <td><code className={u.fs12}>{row.erp_house_code}</code></td>
                    <td>{row.house_name || "—"}</td>
                    <td className={u.muted12}>{row.vendor_farm_id}</td>
                    <td className={u.muted12}>{row.vendor_house_id}</td>
                    <td>{row.vendor_house_name || "—"}</td>
                    <td>{row.sync_freq_min} min</td>
                    <td><StatusPill active={row.status === "ACTIVE"} label={row.status === "ACTIVE" ? t("ui.启用", "启用") : t("ui.禁用", "禁用")} /></td>
                    <td className={u.muted12}>{row.mapped_by || "—"}</td>
                    <td style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                whiteSpace: "nowrap"
              }}>{fmtDt(row.mapped_at)}</td>
                    <td>
                      <div className={s.tableActions}>
                        <button type="button" onClick={() => handleOpenEdit(row)} style={{ ...secondaryActionButton, fontSize: 12, padding: "3px 10px" }}>
                          {t("ui.修改", "修改")}
                        </button>
                        <button type="button" onClick={() => handleDeleteMapping(row)} style={{ ...actionPill('danger'), fontSize: 12, padding: "3px 10px" }}>
                          {t("ui.删除", "删除")}
                        </button>
                      </div>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
        </div>}

      {/* ── Tab: 采集日志 ──────────────────────────────────────────────────── */}
      {tab === "jobs" && <div className={s.card}>
          <div className={`${s.cardHeader} ${u.flexBetween}`}>
            <span className={s.cardTitle}>{t("ui.采集日志", "同步任务日志")}</span>
            <button type="button" style={secondaryActionButton} onClick={loadJobs}><RefreshCw size={13} />{t("ui.刷新", "刷新")}</button>
          </div>
          <div className={u.scrollX}>
            <table className={s.table}>
              <thead>
                <tr>
                  {[t("ui.任务编号", "任务编号"), t("ui.类型", "类型"), t("ui.触发方式", "触发"), t("ui.开始", "开始时间"), t("ui.耗时", "耗时"), t("ui.鸡舍数", "鸡舍数"), t("ui.成功", "成功"), t("ui.失败", "失败"), t("ui.写入条数", "写入数"), t("ui.状态", "状态")].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? <tr><td colSpan={10} className={u.emptyPad40}>{t('ui.暂无日志', '暂无日志')}</td></tr> : jobs.map(row => <tr key={row.id}>
                    <td><code className={u.fs11}>{row.job_no}</code></td>
                    <td className={u.fs12}>{row.job_type}</td>
                    <td className={u.fs12}>{row.triggered_by}</td>
                    <td style={{
                fontSize: 12,
                whiteSpace: "nowrap"
              }}>{fmtDt(row.started_at)}</td>
                    <td>{row.duration_ms != null ? `${row.duration_ms}ms` : "—"}</td>
                    <td>{row.total_houses ?? "—"}</td>
                    <td style={{
                color: "var(--status-success)",
                fontWeight: 600
              }}>{row.success_count ?? "—"}</td>
                    <td style={{
                color: (row.fail_count ?? 0) > 0 ? "var(--status-danger)" : "var(--text-secondary)",
                fontWeight: 600
              }}>{row.fail_count ?? "—"}</td>
                    <td>{row.record_count ?? "—"}</td>
                    <td><JobStatusPill status={row.status} /></td>
                  </tr>)}
              </tbody>
            </table>
          </div>
        </div>}

      {/* ── Tab: 离线设备 ──────────────────────────────────────────────────── */}
      {tab === "devices" && <div className={s.card}>
          <div className={`${s.cardHeader} ${u.flexBetween}`}>
            <span className={s.cardTitle}>{t("ui.离线设备", "离线设备")} ({offlineDevices.length})</span>
            <button type="button" style={secondaryActionButton} onClick={loadOffline}><RefreshCw size={13} />{t("ui.刷新", "刷新")}</button>
          </div>
          <div className={u.scrollX}>
            <table className={s.table}>
              <thead>
                <tr>
                  {["IMEI", t("ui.设备名称", "设备名称"), t("ui.类型", "类型"), t("ui.鸡舍", "鸡舍"), t("ui.状态", "状态"), t("ui.最后登录", "最后在线")].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {offlineDevices.length === 0 ? <tr><td colSpan={6} style={{
                textAlign: "center",
                padding: 40,
                color: "var(--status-success)"
              }}>✅ {t('ui.暂无离线设备', '暂无离线设备')}</td></tr> : offlineDevices.map(row => <tr key={row.id}>
                    <td><code className={u.fs12}>{row.imei}</code></td>
                    <td>{row.device_name || "—"}</td>
                    <td className={u.muted12}>{row.device_type || "—"}</td>
                    <td><code className={u.fs12}>{row.erp_house_code || "—"}</code></td>
                    <td><span style={{
                  padding: "2px 8px",
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 700,
                  background: "color-mix(in srgb, var(--status-danger) 14%, transparent)",
                  color: "var(--status-danger)"
                }}>{row.status || t('ui.离线', '离线')}</span></td>
                    <td style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                whiteSpace: "nowrap"
              }}>{fmtDt(row.last_online_at)}</td>
                  </tr>)}
              </tbody>
            </table>
          </div>
        </div>}

      {/* ── Tab: 属性字典 ──────────────────────────────────────────────────── */}
      {tab === "dict" && <div className={s.card}>
          <div className={`${s.cardHeader} ${u.flexBetween}`}>
            <span className={s.cardTitle}>{t("ui.属性字典", "传感器属性字典")} ({propDict.length})</span>
            <button type="button" style={secondaryActionButton} onClick={loadDict}><RefreshCw size={13} />{t("ui.刷新", "刷新")}</button>
          </div>
          <div className={u.scrollX}>
            <table className={s.table}>
              <thead>
                <tr>
                  {[t("ui.编码", "编码"), t("ui.中文名", "中文名"), t("ui.单位", "单位"), t("ui.类别", "类别"), t("ui.上限", "上限"), t("ui.下限", "下限"), t("ui.消抖次数", "消抖次数"), t("ui.波动", "波动阈值%"), t("ui.告警", "告警"), t("ui.趋势", "趋势图"), t("ui.操作", "操作")].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {propDict.length === 0 ? <tr><td colSpan={11} className={u.emptyPad40}>{t('ui.暂无属性', '暂无属性')}</td></tr> : propDict.map(row => <tr key={row.id}>
                    <td><code style={{
                  fontSize: 12,
                  color: "var(--color-primary)"
                }}>{row.property_code}</code></td>
                    <td className={u.fw600}>{row.name_zh}</td>
                    <td className={u.muted}>{row.unit || "—"}</td>
                    <td className={u.muted12}>{row.category || "—"}</td>
                    <td style={{
                color: row.threshold_high != null ? "var(--status-danger)" : "var(--text-secondary)"
              }}>{row.threshold_high ?? "—"}</td>
                    <td style={{
                color: row.threshold_low != null ? "var(--color-accent)" : "var(--text-secondary)"
              }}>{row.threshold_low ?? "—"}</td>
                    <td>{row.alert_min_duration_cycles ?? 3}{t('ui.次', '次')}</td>
                    <td>{Math.round((row.alert_volatility_pct ?? 0.2) * 100)}%</td>
                    <td><span style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  display: "inline-block",
                  background: row.alarm_enabled ? "var(--status-success)" : "var(--text-disabled)"
                }} /></td>
                    <td><span style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  display: "inline-block",
                  background: row.trend_enabled ? "var(--color-accent)" : "var(--text-disabled)"
                }} /></td>
                    <td>
                      <button type="button" onClick={() => setDictEditRow({ ...row })} style={{ ...secondaryActionButton, fontSize: 11, padding: "3px 8px" }}>
                        {t("ui.编辑", "编辑")}
                      </button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
        </div>}

      {/* ── Tab: 运维审计 ──────────────────────────────────────────────────── */}
      {tab === "opslog" && <div className={s.card}>
          <div className={`${s.cardHeader} ${u.flexBetween}`}>
            <div className={u.flexRow8}>
              <ClipboardList size={15} style={{
            color: "var(--color-primary)"
          }} />
              <span className={s.cardTitle}>{t("ui.运维操作审计日志", "运维操作审计日志")}{t('ui.（最近 100 条）', '（最近 100 条）')}</span>
            </div>
            <button type="button" style={secondaryActionButton} onClick={loadOpsLog}><RefreshCw size={13} />{t("ui.刷新", "刷新")}</button>
          </div>
          {opsLog.length === 0 ? <div style={{
        padding: 60,
        textAlign: "center",
        color: "var(--text-secondary)",
        fontSize: 13
      }}>
              {t('ui.暂无操作记录。完成映射、阈值或告警配置操作后将在此显示。', '暂无操作记录。完成映射、阈值或告警配置操作后将在此显示。')}
            </div> : <table className={s.table}>
              <thead>
                <tr>
                  {[t("ui.操作类型", "操作类型"), t("ui.鸡舍", "鸡舍"), t("ui.操作人", "操作人"), t("ui.操作详情", "详情"), t("ui.结果", "结果"), t("ui.时间", "时间")].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {opsLog.map(row => {
            const color = OP_TYPE_COLORS[row.op_type] || "var(--text-disabled)";
            let detail = row.detail_json || "";
            try {
              const d = JSON.parse(row.detail_json || "{}");
              detail = JSON.stringify(d).slice(0, 80);
            } catch {/* noop */}
            return <tr key={row.id}>
                      <td>
                        <span style={{
                  padding: "2px 8px",
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 700,
                  background: `${color}18`,
                  color
                }}>{row.op_type}</span>
                      </td>
                      <td><code style={{
                  fontSize: 11,
                  color: "var(--color-primary)"
                }}>{row.erp_house_code || "—"}</code></td>
                      <td className={u.fw500}>{row.operator || "—"}</td>
                      <td style={{
                maxWidth: 240,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--text-secondary)",
                fontSize: 12
              }} title={row.detail_json || ""}>{detail}</td>
                      <td>
                        <span style={{
                  padding: "2px 8px",
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 700,
                  background: row.result === "SUCCESS" ? "color-mix(in srgb, var(--status-success) 14%, transparent)" : "color-mix(in srgb, var(--status-danger) 14%, transparent)",
                  color: row.result === "SUCCESS" ? "var(--status-success)" : "var(--status-danger)"
                }}>
                          {row.result === "SUCCESS" ? t("ui.成功", "成功") : t("ui.失败", "失败")}
                        </span>
                      </td>
                      <td style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                whiteSpace: "nowrap"
              }}>{fmtDt(row.created_at)}</td>
                    </tr>;
          })}
              </tbody>
            </table>}
        </div>}

      {/* ── Modal: 新建映射 ───────────────────────────────────────────────── */}
      <ModalV2 open={showMapForm} onClose={() => { setShowMapForm(false); setMapForm(emptyMapForm()); }} title={t("ui.新建栏舍映射", "新建栏舍映射")} width={540}>
          <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
        marginBottom: 16
      }}>
            <div>
              <Label>{t("ui.ERP场区", "ERP 场区")} *</Label>
              <select value={mapForm.erp_farm_code} style={inp} onChange={e => setMapForm(f => ({
            ...f,
            erp_farm_code: e.target.value,
            erp_house_code: ""
          }))}>
                <option value="">{t("ui.请选择", "请选择...")}</option>
                {erpFarms.map(f => <option key={f.farm_code} value={f.farm_code}>{f.farm_name} ({f.farm_code})</option>)}
              </select>
            </div>
            <div>
              <Label>{t("ui.ERP鸡舍", "ERP 鸡舍")} *</Label>
              <select value={mapForm.erp_house_code} style={inp} disabled={!mapForm.erp_farm_code} onChange={e => setMapForm(f => ({
            ...f,
            erp_house_code: e.target.value
          }))}>
                <option value="">{t("ui.请选择", "请选择...")}</option>
                {filterHouses.map(h => <option key={h.house_code} value={h.house_code}>{h.house_name} ({h.house_code})</option>)}
              </select>
            </div>
            <div>
              <Label>{t("ui.第三方Farm", "第三方 Farm")} *</Label>
              <select value={mapForm.vendor_farm_id} style={inp} onChange={e => setMapForm(f => ({
            ...f,
            vendor_farm_id: e.target.value,
            vendor_house_id: ""
          }))}>
                <option value="">{t("ui.请选择", "请选择...")}</option>
                {vendorFarmIds.map(id => {
              const h = vendorHouses.find(v => v.vendor_farm_id === id);
              return <option key={id} value={id}>{h?.vendor_farm_name || id} ({id})</option>;
            })}
              </select>
            </div>
            <div>
              <Label>{t("ui.第三方House", "第三方 House")} *</Label>
              <select value={mapForm.vendor_house_id} style={inp} disabled={!mapForm.vendor_farm_id} onChange={e => setMapForm(f => ({
            ...f,
            vendor_house_id: e.target.value
          }))}>
                <option value="">{t("ui.请选择", "请选择...")}</option>
                {filterVendorHouses.map(h => <option key={h.vendor_house_id} value={h.vendor_house_id}>{h.vendor_house_name} ({h.vendor_house_id})</option>)}
              </select>
            </div>
          </div>
          <div style={{
        background: "color-mix(in srgb,var(--status-warning) 10%,transparent)",
        borderRadius: 6,
        padding: "10px 12px",
        fontSize: 12,
        color: "var(--status-warning)",
        marginBottom: 16
      }}>
            ⚠️ {t('ui.层级约束：ERP 鸡舍必须属于所选 ERP 场区；第三方 House 必须属于所选第三方 Farm。系统将在保存时验证。', '层级约束：ERP 鸡舍必须属于所选 ERP 场区；第三方 House 必须属于所选第三方 Farm。系统将在保存时验证。')}
          </div>
          <div style={{
        display: "flex",
        justifyContent: "flex-end",
        gap: 10
      }}>
            <button type="button" style={secondaryActionButton} onClick={() => {
          setShowMapForm(false);
          setMapForm(emptyMapForm());
        }}>{t("common.cancel", "取消")}</button>
            <button type="button" style={primaryActionButton} disabled={saving} onClick={handleSaveMapping}>{saving ? t("common.saving", "保存中...") : t("ui.保存映射", "保存映射")}</button>
          </div>
      </ModalV2>

      {/* ── Modal: 编辑映射 ───────────────────────────────────────────────── */}
      <ModalV2 open={!!editRow} onClose={() => setEditRow(null)} title={`${t("ui.修改", "修改映射")}: ${editRow?.erp_house_code ?? ""}`} width={540}>
          <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
        marginBottom: 14
      }}>
            <div>
              <Label>{t("ui.ERP场区", "ERP 场区")} *</Label>
              <select value={editForm.erp_farm_code} style={inp} onChange={e => setEditForm(f => ({
            ...f,
            erp_farm_code: e.target.value,
            erp_house_code: ""
          }))}>
                {erpFarms.map(f => <option key={f.farm_code} value={f.farm_code}>{f.farm_name} ({f.farm_code})</option>)}
              </select>
            </div>
            <div>
              <Label>{t("ui.ERP鸡舍", "ERP 鸡舍")} *</Label>
              <select value={editForm.erp_house_code} style={inp} onChange={e => setEditForm(f => ({
            ...f,
            erp_house_code: e.target.value
          }))}>
                <option value="">{t("ui.请选择", "请选择...")}</option>
                {editFilterHouses.map(h => <option key={h.house_code} value={h.house_code}>{h.house_name} ({h.house_code})</option>)}
              </select>
            </div>
            <div>
              <Label>{t("ui.第三方Farm", "第三方 Farm")} *</Label>
              <select value={editForm.vendor_farm_id} style={inp} onChange={e => setEditForm(f => ({
            ...f,
            vendor_farm_id: e.target.value,
            vendor_house_id: ""
          }))}>
                {vendorFarmIds.map(id => {
              const h = vendorHouses.find(v => v.vendor_farm_id === id);
              return <option key={id} value={id}>{h?.vendor_farm_name || id} ({id})</option>;
            })}
              </select>
            </div>
            <div>
              <Label>{t("ui.第三方House", "第三方 House")} *</Label>
              <select value={editForm.vendor_house_id} style={inp} onChange={e => setEditForm(f => ({
            ...f,
            vendor_house_id: e.target.value
          }))}>
                <option value="">{t("ui.请选择", "请选择...")}</option>
                {editVendorHouses.map(h => <option key={h.vendor_house_id} value={h.vendor_house_id}>{h.vendor_house_name} ({h.vendor_house_id})</option>)}
              </select>
            </div>
          </div>
          <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
        marginBottom: 18
      }}>
            <div>
              <Label>{t("ui.采集频率", "采集频率 (min)")}</Label>
              <input type="number" min={1} max={60} value={editForm.sync_freq_min} style={inp} onChange={e => setEditForm(f => ({
            ...f,
            sync_freq_min: Number(e.target.value)
          }))} />
            </div>
            <div>
              <Label>{t("ui.状态", "状态")}</Label>
              <select value={editForm.status} style={inp} onChange={e => setEditForm(f => ({
            ...f,
            status: e.target.value as "ACTIVE" | "INACTIVE"
          }))}>
                <option value="ACTIVE">{t("ui.启用", "启用")}</option>
                <option value="INACTIVE">{t("ui.禁用", "禁用")}</option>
              </select>
            </div>
          </div>
          {/* 告警阈值覆盖 */}
          {propDict.filter(d => d.alarm_enabled).length > 0 && <div style={{
        borderTop: "1px solid var(--border)",
        paddingTop: 14,
        marginBottom: 14
      }}>
              <div style={{
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 10,
          color: "var(--text-secondary)"
        }}>
                ⚙️ {t("ui.告警阈值覆盖", "告警阈值覆盖")}{t('ui.（留空则使用全局字典值）', '（留空则使用全局字典值）')}
              </div>
              {propDict.filter(d => d.alarm_enabled).map(d => <div key={d.property_code} style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
          marginBottom: 8,
          alignItems: "center"
        }}>
                  <div>
                    <div style={{
              fontSize: 13,
              fontWeight: 600
            }}>{d.name_zh}</div>
                    <code style={{
              fontSize: 11,
              color: "var(--text-secondary)"
            }}>{d.property_code}</code>
                  </div>
                  <div>
                    <Label>{t("ui.上限", "上限")} ({t('ui.全局', '全局')}: {d.threshold_high ?? "—"})</Label>
                    <input type="number" step="any" style={inpSm} value={editForm.alert_config[d.property_code]?.threshold_high ?? ""} placeholder={String(d.threshold_high ?? "")} onChange={e => setEditForm(f => ({
              ...f,
              alert_config: {
                ...f.alert_config,
                [d.property_code]: {
                  ...(f.alert_config[d.property_code] || {}),
                  threshold_high: e.target.value === "" ? undefined : Number(e.target.value)
                }
              }
            }))} />
                  </div>
                  <div>
                    <Label>{t("ui.下限", "下限")} ({t('ui.全局', '全局')}: {d.threshold_low ?? "—"})</Label>
                    <input type="number" step="any" style={inpSm} value={editForm.alert_config[d.property_code]?.threshold_low ?? ""} placeholder={String(d.threshold_low ?? "")} onChange={e => setEditForm(f => ({
              ...f,
              alert_config: {
                ...f.alert_config,
                [d.property_code]: {
                  ...(f.alert_config[d.property_code] || {}),
                  threshold_low: e.target.value === "" ? undefined : Number(e.target.value)
                }
              }
            }))} />
                  </div>
                </div>)}
            </div>}
          <div style={{
        display: "flex",
        justifyContent: "flex-end",
        gap: 10
      }}>
            <button type="button" style={secondaryActionButton} onClick={() => setEditRow(null)}>{t("common.cancel", "取消")}</button>
            <button type="button" style={primaryActionButton} disabled={saving} onClick={handleSaveEdit}>{saving ? t("common.saving", "保存中...") : t("ui.保存", "保存")}</button>
          </div>
      </ModalV2>

      {/* ── Modal: 编辑属性字典 ───────────────────────────────────────────── */}
      <ModalV2 open={!!dictEditRow} onClose={() => setDictEditRow(null)} title={`${t("ui.编辑属性", "编辑属性")}: ${dictEditRow?.name_zh ?? ""} (${dictEditRow?.property_code ?? ""})`} width={540}>
        {dictEditRow ? <>
          <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
        marginBottom: 16
      }}>
            {([["threshold_high", t("ui.上限", "高告警阈值")] as const, ["threshold_low", t("ui.下限", "低告警阈值")] as const, ["alert_min_duration_cycles", t("ui.消抖次数", "消抖次数（触发几次才告警）")] as const, ["alert_volatility_pct", t("ui.波动", "波动阈值 (0.2 = 20%)")] as const] as [keyof PropDict, string][]).map(([field, label]) => <div key={field}>
                <Label>{label}</Label>
                <input type="number" step="any" style={inp} value={dictEditRow[field] ?? ""} onChange={e => setDictEditRow(r => r ? {
            ...r,
            [field]: e.target.value
          } : r)} />
              </div>)}
          </div>
          <div style={{
        display: "flex",
        gap: 20,
        marginBottom: 16
      }}>
            {([["alarm_enabled", t("ui.告警", "启用告警")], ["trend_enabled", t("ui.趋势", "显示在趋势图")]] as [keyof PropDict, string][]).map(([field, label]) => <label key={field} style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          cursor: "pointer"
        }}>
                <input type="checkbox" checked={Boolean(dictEditRow[field])} onChange={e => setDictEditRow(r => r ? {
            ...r,
            [field]: e.target.checked ? 1 : 0
          } : r)} />
                {label}
              </label>)}
          </div>
          <div style={{
        display: "flex",
        justifyContent: "flex-end",
        gap: 10
      }}>
            <button type="button" style={secondaryActionButton} onClick={() => setDictEditRow(null)}>{t("common.cancel", "取消")}</button>
            <button type="button" style={primaryActionButton} disabled={saving} onClick={handleSaveDictEdit}>{saving ? t("common.saving", "保存中...") : t("ui.保存", "保存")}</button>
          </div>
        </> : null}
      </ModalV2>
    </div>;
}
