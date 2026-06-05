"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePolling } from '@/hooks/usePolling';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HouseSystem {
  code:       string;
  name:       string;
  icon:       string;
  status:     string; // "normal"|"warning"|"critical"|"standby"|"no_data"
  alarmCount: number;
}

interface HouseData {
  houseCode:      string;
  houseName:      string;
  farmCode:       string;
  dataFreshness:  "normal" | "delayed" | "stale" | "no_data";
  lastUpdateTime: string;
  alarmCount:     number;
  totalSensors:   number;
  onlineSensors:  number;
  onlineRate:     number;
  systems:        HouseSystem[];
  avgTemp:        number | null;
  avgHumidity:    number | null;
  co2:            number | null;
  ammonia:        number | null;
}

interface AlarmItem {
  id:             string | number;
  house_code:     string;
  erp_house_code: string;
  farm_code:      string;
  property_name:  string;
  property_code:  string;
  value:          number;
  unit:           string;
  category:       string;
  system_category: string;
  severity:       "critical" | "warning" | "normal";
  triggered_at:   string | number;
  threshold_val:  number | null;
  alarm_status:   string;
  house_name?:    string;
}

interface Summary {
  totalHouses:     number;
  activeHouses:    number;
  totalAlarms:     number;
  alarmHouses:     number;
  onlineSensorCnt: number;
  totalSensorCnt:  number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FRESH = {
  normal:  { color: "var(--status-success)", label: "实时" },
  delayed: { color: "var(--status-warning)", label: "延迟" },
  stale:   { color: "var(--status-danger)", label: "陈旧" },
  no_data: { color: "var(--text-disabled)", label: "无数据" },
};

const STATUS_DOT_COLOR: Record<string, string> = {
  normal:   "var(--status-success)",
  standby:  "var(--text-disabled)",
  warning:  "var(--status-warning)",
  critical: "var(--status-danger)",
  no_data:  "var(--text-disabled)",
};

const SYSTEM_CATEGORY_MAP: Record<string, { label: string; cssClass: string; icon: string }> = {
  environment: { label: "环境", cssClass: "badgeSuccess", icon: "🌡" },
  control:     { label: "控制", cssClass: "badgeInfo",    icon: "⚙️" },
  feed:        { label: "饲喂", cssClass: "badgeOrange",  icon: "🌾" },
  water:       { label: "饮水", cssClass: "badgeBlue",    icon: "💧" },
  actuator:    { label: "执行器", cssClass: "badgePurple", icon: "⚡" },
};

// Canonical system codes matching API response (system.code values)
const SYSTEM_CODES = [
  { code: "environment", label: "环境", icon: "🌡" },
  { code: "control",     label: "控制", icon: "⚙️" },
  { code: "feed",        label: "饲喂", icon: "🌾" },
  { code: "water",       label: "饮水", icon: "💧" },
  { code: "actuator",    label: "执行器", icon: "⚡" },
];

// ── Utilities ─────────────────────────────────────────────────────────────────

function relativeTime(raw: string | number, now: Date): string {
  if (!raw) return "—";
  let ts: number;
  if (typeof raw === "number") {
    ts = raw > 1e10 ? raw : raw * 1000;
  } else {
    const s = String(raw).trim();
    ts = /^\d{10,}$/.test(s) ? parseInt(s, 10) : new Date(s).getTime();
    if (ts > 0 && ts < 1e10) ts *= 1000; // seconds → ms
  }
  if (isNaN(ts)) return "—";
  const min = Math.floor((now.getTime() - ts) / 60000);
  if (min < 1)  return "刚刚";
  if (min < 60) return `${min}分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
}

function thresholdText(value: number, thresholdVal: number | null, unit: string): string {
  if (thresholdVal == null) return "超出阈值";
  if (value > thresholdVal) {
    const pct = Math.abs(thresholdVal) > 0
      ? `${((value - thresholdVal) / Math.abs(thresholdVal) * 100).toFixed(0)}%`
      : `+${(value - thresholdVal).toFixed(1)}`;
    return `↑ 超 ${pct}（阈值 ${thresholdVal}${unit}）`;
  }
  return `↓ 低于阈值 ${thresholdVal}${unit}`;
}

function getCategoryClass(cssClass: string): string {
  switch (cssClass) {
    case "badgeSuccess": return s.badgeSuccess;
    case "badgeInfo":    return s.badgeInfo;
    case "badgeOrange":  return s.badgeOrange;
    case "badgeBlue":    return s.badgeBlue;
    case "badgePurple":  return s.badgePurple;
    default:             return s.badgeInfo;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SystemDot({ sys, alarmCount }: { sys: typeof SYSTEM_CODES[0]; alarmCount: number; status?: string }) {
  const isCritical = alarmCount > 0;
  const color = isCritical ? "var(--status-danger)" : "var(--status-success)";
  return (
    <div
      title={`${sys.label}${alarmCount > 0 ? ` · ${alarmCount} 告警` : " · 正常"}`}
      style={{
        width: 10, height: 10, borderRadius: "50%",
        background: color,
        boxShadow: isCritical ? `0 0 6px ${color}` : "none",
        cursor: "default",
        flexShrink: 0,
      }}
    />
  );
}

function CompactHouseCard({ house, onClick }: { house: HouseData; onClick: () => void }) {
  const fresh = FRESH[house.dataFreshness] ?? FRESH.no_data;

  // Map system alarm counts by full code (e.g. "environment", "control")
  const sysAlarmMap: Record<string, number> = {};
  for (const sys of house.systems ?? []) {
    sysAlarmMap[sys.code] = (sysAlarmMap[sys.code] ?? 0) + sys.alarmCount;
  }

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--bg-card)",
        border: "1.5px solid color-mix(in srgb, var(--status-danger) 45%, transparent)",
        borderRadius: 12,
        padding: "14px 16px",
        cursor: "pointer",
        transition: "transform 0.15s, box-shadow 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minWidth: 0,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px var(--status-danger-bg-medium)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {house.houseName || house.houseCode}
        </span>
        <span className={s.severityBadge} style={{ background: "var(--status-danger-bg-medium)", color: "var(--status-danger)", flexShrink: 0, fontSize: 11, padding: "2px 8px", borderRadius: 10 }}>
          ⚠ {house.alarmCount}
        </span>
      </div>

      {/* Metrics */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {house.avgTemp != null && (
          <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 8, background: "var(--status-danger-bg-light)", color: "var(--status-danger)", fontWeight: 600 }}>
            🌡 {house.avgTemp.toFixed(1)}°C
          </span>
        )}
        {house.avgHumidity != null && (
          <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 8, background: "var(--status-info-bg)", color: "var(--color-accent)", fontWeight: 600 }}>
            💧 {house.avgHumidity.toFixed(0)}%
          </span>
        )}
        {house.co2 != null ? (
          <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 8, background: "var(--status-warning-bg-light)", color: "var(--status-warning)", fontWeight: 600 }}>
            CO₂ {house.co2.toFixed(0)}
          </span>
        ) : house.ammonia != null ? (
          <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 8, background: "var(--status-warning-bg-light)", color: "var(--status-warning)", fontWeight: 600 }}>
            NH₃ {house.ammonia.toFixed(2)}
          </span>
        ) : null}
      </div>

      {/* System dots */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {SYSTEM_CODES.map(sys => (
          <SystemDot key={sys.code} sys={sys} alarmCount={sysAlarmMap[sys.code] ?? 0} />
        ))}
        <span style={{ fontSize: 10, color: "var(--text-secondary)", marginLeft: 4 }}>系统健康</span>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, background: `${fresh.color}18`, color: fresh.color, fontWeight: 600 }}>
          {fresh.label}
        </span>
        <span style={{ fontSize: 11, color: "var(--color-primary)", fontWeight: 600 }}>
          进入鸡舍 →
        </span>
      </div>
    </div>
  );
}

function AlarmRow({ alarm, now }: { alarm: AlarmItem; now: Date }) {
  const catKey = alarm.system_category || alarm.category || "";
  const catCfg = SYSTEM_CATEGORY_MAP[catKey];
  const isCritical = alarm.severity === "critical";
  const alertClass = isCritical
    ? `${s.alertCard} ${s.alertCritical}`
    : `${s.alertCard} ${s.alertMedium}`;
  const severityClass = isCritical ? s.severityBadgeCritical : s.severityBadgeMedium;
  const tText = thresholdText(alarm.value, alarm.threshold_val, alarm.unit);
  const time = relativeTime(alarm.triggered_at, now);

  return (
    <div className={alertClass} style={{ padding: "14px 18px", display: "flex", gap: 14, alignItems: "flex-start" }}>
      {/* Category badge */}
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        {catCfg ? (
          <span
            className={getCategoryClass(catCfg.cssClass)}
            style={{ fontSize: 11, padding: "3px 8px", borderRadius: 8, border: "1px solid", display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            {catCfg.icon} {catCfg.label}
          </span>
        ) : (
          <span className={s.badgeInfo} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 8, border: "1px solid" }}>
            📊 传感器
          </span>
        )}
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
            {alarm.property_name}
          </span>
          <span style={{ fontWeight: 800, fontSize: 16, color: isCritical ? "var(--status-danger)" : "var(--status-warning)" }}>
            {alarm.value != null ? Number(alarm.value).toFixed(1) : "—"} {alarm.unit}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.6 }}>
          {tText}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
            {alarm.house_name || alarm.erp_house_code || alarm.house_code}
          </span>
          {alarm.farm_code && <span>{alarm.farm_code}</span>}
        </div>
      </div>

      {/* Right column: severity + time */}
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <span className={`${s.severityBadge} ${severityClass}`} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 8 }}>
          {isCritical ? "紧急" : "预警"}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{time}</span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type FilterMode = "all" | "critical" | "warning" | "byHouse";
type SortMode   = "severity" | "house" | "time";

export default function DeviceAlertsPage() {
  const { t } = useLanguage();
  const router = useRouter();

  const [houses,     setHouses]     = useState<HouseData[]>([]);
  const [alarms,     setAlarms]     = useState<AlarmItem[]>([]);
  const [summary,    setSummary]    = useState<Summary | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [sortMode,   setSortMode]   = useState<SortMode>("severity");
  const [now,        setNow]        = useState(() => new Date());

  // Tick every minute for relative timestamps
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchAlarms = useCallback(async () => {
    try {
      const token = sessionStorage.getItem("phoenix_token") ?? "";
      const res   = await fetch("/api/v3/iot/devices/all-summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`IoT API 返回 ${res.status}`);
      const json = await res.json();

      setSummary(json.data?.summary ?? null);

      // Extract houses array
      const rawHouses = (Array.isArray(json.data?.houses) ? json.data.houses : []) as Record<string, unknown>[];
      const housesData: HouseData[] = rawHouses.map((h) => ({
        houseCode:      String(h.houseCode      ?? h.erp_house_code ?? h.house_code ?? ""),
        houseName:      String(h.houseName      ?? h.house_name     ?? ""),
        farmCode:       String(h.farmCode       ?? h.farm_code      ?? ""),
        dataFreshness:  (h.dataFreshness ?? h.data_freshness ?? "no_data") as HouseData["dataFreshness"],
        lastUpdateTime: String(h.lastUpdateTime ?? h.last_update_time ?? ""),
        alarmCount:     Number(h.alarmCount     ?? h.alarm_count    ?? 0),
        totalSensors:   Number(h.totalSensors   ?? h.total_sensors  ?? 0),
        onlineSensors:  Number(h.onlineSensors  ?? h.online_sensors ?? 0),
        onlineRate:     Number(h.onlineRate     ?? h.online_rate    ?? 0),
        systems:        Array.isArray(h.systems) ? (h.systems as Record<string, unknown>[]).map((sys) => ({
          code:       String(sys.code       ?? sys.system_code  ?? ""),
          name:       String(sys.name       ?? sys.system_name  ?? ""),
          icon:       String(sys.icon       ?? ""),
          status:     String(sys.status     ?? "no_data"),
          alarmCount: Number(sys.alarmCount ?? sys.alarm_count  ?? 0),
        })) : [],
        avgTemp:     h.avgTemp != null ? Number(h.avgTemp) : (h.avg_temp != null ? Number(h.avg_temp) : null),
        avgHumidity: h.avgHumidity != null ? Number(h.avgHumidity) : (h.avg_humidity != null ? Number(h.avg_humidity) : null),
        co2:         (h.co2  != null && h.co2  !== 0) ? Number(h.co2)  : null,
        ammonia:     (h.ammonia != null && h.ammonia !== 0) ? Number(h.ammonia) : null,
      }));
      setHouses(housesData);

      // Extract alarms with full fields
      const recentAlarms = (Array.isArray(json.data?.recentAlarms) ? json.data.recentAlarms : []) as Record<string, unknown>[];
      const alarmItems: AlarmItem[] = recentAlarms.map((a, idx) => ({
        id:              (a.id as string | number | undefined) ?? idx,
        house_code:      String(a.erp_house_code ?? a.house_code ?? ""),
        erp_house_code:  String(a.erp_house_code ?? a.house_code ?? ""),
        farm_code:       String(a.farm_code ?? ""),
        property_name:   String(a.name_zh ?? a.property_name ?? "未知指标"),
        property_code:   String(a.property_code ?? ""),
        value:           Number(a.current_val ?? a.value ?? 0),
        unit:            String(a.unit ?? ""),
        category:        String(a.category ?? ""),
        system_category: String(a.system_category ?? a.category ?? ""),
        severity:        (a.severity === "warning" || a.severity === "normal") ? a.severity : "critical",
        triggered_at:    (a.triggered_at ?? a.created_at ?? "") as string | number,
        threshold_val:   a.threshold_val != null ? Number(a.threshold_val) : (a.threshold_value != null ? Number(a.threshold_value) : null),
        alarm_status:    String(a.alarm_status ?? a.status ?? ""),
      }));
      setAlarms(alarmItems);
      setLastUpdate(new Date());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(fetchAlarms, 30_000);

  // ── Derived data ────────────────────────────────────────────────────────────

  const houseMap = useMemo(
    () => Object.fromEntries(houses.map(h => [h.houseCode, h])),
    [houses]
  );

  const enrichedAlarms = useMemo(
    () => alarms.map(a => ({
      ...a,
      house_name: houseMap[a.erp_house_code]?.houseName
               ?? houseMap[a.house_code]?.houseName
               ?? a.house_code,
    })),
    [alarms, houseMap]
  );

  const affectedHouses = useMemo(
    () => houses.filter(h => h.alarmCount > 0).sort((a, b) => b.alarmCount - a.alarmCount),
    [houses]
  );

  const criticalCount = useMemo(() => alarms.filter(a => a.severity === "critical").length, [alarms]);
  const warningCount  = useMemo(() => alarms.filter(a => a.severity === "warning").length,  [alarms]);

  const worstFreshness = useMemo(() => {
    const order = { stale: 0, delayed: 1, no_data: 2, normal: 3 };
    const worst = houses.reduce<HouseData | null>((acc, h) =>
      !acc || (order[h.dataFreshness] ?? 4) < (order[acc.dataFreshness] ?? 4) ? h : acc, null
    );
    return worst?.dataFreshness ?? "no_data";
  }, [houses]);

  const filteredAlarms = useMemo(() => {
    let list = [...enrichedAlarms];
    if (filterMode === "critical") list = list.filter(a => a.severity === "critical");
    else if (filterMode === "warning") list = list.filter(a => a.severity === "warning");

    if (sortMode === "severity") {
      list.sort((a, b) => {
        const order = { critical: 0, warning: 1, normal: 2 };
        return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
      });
    } else if (sortMode === "house") {
      list.sort((a, b) => (a.erp_house_code ?? "").localeCompare(b.erp_house_code ?? ""));
    } else if (sortMode === "time") {
      list.sort((a, b) => {
        const ta = typeof a.triggered_at === "number" ? a.triggered_at : new Date(String(a.triggered_at)).getTime();
        const tb = typeof b.triggered_at === "number" ? b.triggered_at : new Date(String(b.triggered_at)).getTime();
        return tb - ta;
      });
    }
    return list;
  }, [enrichedAlarms, filterMode, sortMode]);

  // Group by house when filterMode === "byHouse"
  const groupedByHouse = useMemo(() => {
    if (filterMode !== "byHouse") return null;
    const groups: Record<string, AlarmItem[]> = {};
    for (const a of filteredAlarms) {
      const key = a.erp_house_code || a.house_code || "未知";
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    }
    return groups;
  }, [filteredAlarms, filterMode]);

  const hasAlarm = (summary?.totalAlarms ?? alarms.length) > 0;

  // ── KPI cards ───────────────────────────────────────────────────────────────

  const freshCfg = FRESH[worstFreshness];

  const KPI_CARDS = [
    {
      label:    "活跃告警",
      val:      loading ? "—" : String(summary?.totalAlarms ?? alarms.length),
      sub:      `${summary?.alarmHouses ?? affectedHouses.length} 栋鸡舍受影响`,
      modifier: hasAlarm ? s.statCardDanger : s.statCardSuccess,
      valColor: hasAlarm ? "var(--status-danger)" : "var(--status-success)",
    },
    {
      label:    "紧急 / 预警",
      val:      loading ? "—" : `${criticalCount} / ${warningCount}`,
      sub:      "按严重程度分类",
      modifier: criticalCount > 0 ? s.statCardDanger : s.statCardWarning,
      valColor: criticalCount > 0 ? "var(--status-danger)" : "var(--status-warning)",
    },
    {
      label:    "在线传感器",
      val:      loading ? "—" : String(summary?.onlineSensorCnt ?? "—"),
      sub:      `共 ${summary?.totalSensorCnt ?? 0} 个监测点`,
      modifier: s.statCardPrimary,
      valColor: "var(--color-primary)",
    },
    {
      label:    "数据状态",
      val:      loading ? "—" : freshCfg.label,
      sub:      lastUpdate ? `更新于 ${lastUpdate.toLocaleTimeString("zh-CN")}` : "—",
      modifier: worstFreshness === "normal" ? s.statCardSuccess : worstFreshness === "stale" ? s.statCardDanger : s.statCardWarning,
      valColor: freshCfg.color,
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("ui.环境预警", "环境预警")}
        subtitle={t("ui.环境预警副标题", "实时环境异常告警列表（每 30 秒自动刷新）")}
        breadcrumb={[t("ui.养殖管理", "养殖管理"), t("ui.环境预警", "环境预警")]}
        actions={
          <button type="button" className={s.btnSecondary} onClick={fetchAlarms} disabled={loading}>
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            {t("common.refresh", "刷新")}
          </button>
        }
      />

      {/* Zone A: KPI Strip */}
      <div className={s.statsRow} style={{ marginBottom: 24 }}>
        {KPI_CARDS.map(c => (
          <div key={c.label} className={`${s.statCard} ${c.modifier}`}>
            <div className={s.statValue} style={{ color: c.valColor }}>{c.val}</div>
            <div className={s.statLabel}>{c.label}</div>
            <div className={s.statSub}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          background: "var(--status-danger-bg-faint)", border: "1px solid var(--status-danger-bg-strong)",
          borderRadius: 10, padding: "12px 16px", marginBottom: 20,
          color: "var(--status-danger)", display: "flex", alignItems: "center", gap: 8, fontSize: 13,
        }}>
          <WifiOff size={15} />
          IoT 数据获取失败：{error}
        </div>
      )}

      {/* Zone B: Affected house grid */}
      {(loading || affectedHouses.length > 0) && (
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: "var(--text-secondary)",
            letterSpacing: "0.06em", textTransform: "uppercase",
            marginBottom: 12, display: "flex", alignItems: "center", gap: 6,
          }}>
            <AlertTriangle size={12} style={{ color: "var(--status-danger)" }} />
            告警鸡舍 {!loading && `(${affectedHouses.length})`}
          </div>

          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {[1,2,3,4].map(i => (
                <div key={i} className={s.shimmer} style={{ height: 140, borderRadius: 12 }} />
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {affectedHouses.map(house => (
                <CompactHouseCard
                  key={house.houseCode}
                  house={house}
                  onClick={() => router.push(`/breeding/device/${house.houseCode}`)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Zone C: Alarm list */}
      <div>
        {/* Toolbar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 10, marginBottom: 14,
        }}>
          {/* Filter pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["all", "critical", "warning", "byHouse"] as FilterMode[]).map(mode => {
              const labels: Record<FilterMode, string> = {
                all:     `全部 (${alarms.length})`,
                critical: `紧急 (${criticalCount})`,
                warning:  `预警 (${warningCount})`,
                byHouse:  "按鸡舍",
              };
              return (
                <button
                  key={mode}
                  type="button"
                  className={filterMode === mode ? `${s.tabPill} ${s.tabPillActive}` : s.tabPill}
                  onClick={() => setFilterMode(mode)}
                >
                  {labels[mode]}
                </button>
              );
            })}
          </div>

          {/* Sort select */}
          <select
            className={s.filterSelect}
            value={sortMode}
            onChange={e => setSortMode(e.target.value as SortMode)}
            style={{ minWidth: 110, fontSize: 12 }}
          >
            <option value="severity">严重程度 ▼</option>
            <option value="house">按鸡舍</option>
            <option value="time">最新时间</option>
          </select>
        </div>

        {/* Alarm items */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ padding: "14px 18px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                <div className={s.shimmerLine} style={{ width: "40%", marginBottom: 8 }} />
                <div className={s.shimmerLineSm} style={{ width: "65%" }} />
              </div>
            ))}
          </div>
        ) : filteredAlarms.length === 0 ? (
          <div className={s.emptyState} style={{ padding: "60px 20px" }}>
            <Wifi size={40} style={{ color: "var(--status-success)", opacity: 0.6 }} />
            <div className={s.emptyStateText} style={{ color: "var(--status-success)", fontWeight: 600 }}>
              {filterMode === "all"
                ? "✅ 当前所有鸡舍环境指标正常，无告警"
                : `当前筛选条件下无告警`}
            </div>
          </div>
        ) : groupedByHouse ? (
          // Grouped by house
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {Object.entries(groupedByHouse).map(([houseCode, houseAlarms]) => {
              const houseName = houseMap[houseCode]?.houseName ?? houseCode;
              return (
                <div key={houseCode}>
                  <div className={s.dividerLabel} style={{ marginBottom: 10, fontSize: 12 }}>
                    {houseName} ({houseAlarms.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {houseAlarms.map((a, i) => (
                      <AlarmRow key={`${a.id}-${i}`} alarm={a} now={now} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // Flat list
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredAlarms.map((a, i) => (
              <AlarmRow key={`${a.id}-${i}`} alarm={a} now={now} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
