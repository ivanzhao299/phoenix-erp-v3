"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import { useRouter } from "next/navigation";
import { Home, Layers, Users, BookOpen, ClipboardList, Droplets, AlertTriangle, BarChart2, Trash2, Wifi, ArrowUpRight, Settings, Wheat, FileBarChart, Package, Bird, Thermometer, Droplet, Wind } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/contexts/ToastContext";
import { useDialog } from "@/contexts/DialogContext";
import { useLanguage } from "@/contexts/LanguageContext";
import styles from "@/components/ui/admin-ui.module.css";
// g200f 模板 token(2026-06-20)
import {
  primaryActionButton, secondaryActionButton, actionPill,
  kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
  actionGroupBox, detailInfoBox, MONO_FONT,
} from "@/components/design-system/cockpit-styles";
import {
  addLocalDays,
  asDailyLogRows,
  asNumber,
  dailyLogDateKey,
  dailyLogMortalityTotal,
  dailyLogRowDate,
  localDateString,
  sumBreedingOverviewTodayMetrics,
} from "@/lib/breeding-overview-metrics";
import { isCanonicalCurrentFlock } from "@/lib/home-farm-kpi";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "brand";
const API = "";
async function apiFetch(path: string) {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "" : "";
  const r = await fetch(`${API}${path}`, {
    headers: token ? {
      Authorization: `Bearer ${token}`
    } : {}
  });
  if (!r.ok) return null;
  return r.json();
}

function dateKey(value: unknown): string {
  return dailyLogDateKey(value);
}

// 产蛋率低于此值视为异常（业务规则，非动态配置）
const WARN_LAY_RATE_PCT = 88;
interface Farm {
  id: string;
  name: string;
  location: string;
  houses: number;
  totalBirds: number;
  designCapacity: number;
  layingRate: string | number;
  status: "normal" | "warning";
}
interface AlertItem {
  id: string;
  type: string;
  label: string;
  msg: string;
  time: string;
}
interface FarmEnv {
  temp: string | null;
  hum: string | null;
  co2: number | null;
}
interface DeviceStats {
  openAlerts: number;
  offlineDevices: number;
}
interface WeekSummary {
  eggs: number;
  mortality: number;
  feedRatio: string | number;
  immuneDone: number;
  immuneTotal: number;
}
export default function BreedingPage() {
  const router = useRouter();
  const toast = useToast();
  const dialog = useDialog();
  const {
    t
  } = useLanguage();
  const SUB_NAV = [{
    label: t('ui.养殖场总览', '养殖场总览'),
    path: "/breeding",
    active: true,
    icon: <Home size={16} />
  }, {
    label: t('ui.鸡舍管理', '鸡舍管理'),
    path: "/breeding/henhouse",
    icon: <Layers size={16} />
  }, {
    label: t('ui.鸡群档案', '鸡群档案'),
    path: "/breeding/flock",
    icon: <Users size={16} />
  }, {
    label: t('ui.日生产日报', '日生产日报'),
    path: "/breeding/daily",
    icon: <ClipboardList size={16} />
  }, {
    label: t('ui.免疫计划', '免疫计划'),
    path: "/breeding/immune",
    icon: <BookOpen size={16} />
  }, {
    label: t('ui.用药记录', '用药记录'),
    path: "/breeding/medicine",
    icon: <Droplets size={16} />
  }, {
    label: t('ui.饲料台账', '饲料台账'),
    path: "/breeding/feed",
    icon: <Wheat size={16} />
  }, {
    label: t('ui.存栏日报', '存栏日报'),
    path: "/breeding/henreport",
    icon: <FileBarChart size={16} />
  }, {
    label: t('ui.药品库存', '药品库存'),
    path: "/breeding/med-stock",
    icon: <Package size={16} />
  }, {
    label: t('ui.蛋品台账', '蛋品台账'),
    path: "/breeding/egg-ledger",
    icon: <BarChart2 size={16} />
  }];
  const [farms, setFarms] = useState<Farm[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [weekSummary, setWeekSummary] = useState<WeekSummary>({
    eggs: 0,
    mortality: 0,
    feedRatio: 0,
    immuneDone: 0,
    immuneTotal: 0
  });
  const [todayEggs, setTodayEggs] = useState(0);
  const [todayDeaths, setTodayDeaths] = useState(0);
  const [deviceStats, setDeviceStats] = useState<DeviceStats>({
    openAlerts: 0,
    offlineDevices: 0
  });
  const [farmEnvMap, setFarmEnvMap] = useState<Record<string, FarmEnv>>({});
  const loadData = useCallback(async (cancelled?: {
    v: boolean;
  }) => {
    const now = new Date();
    const today = localDateString(now);
    const weekAgo = localDateString(addLocalDays(now, -7));
    const ydStr = localDateString(addLocalDays(now, -1));
    const [farmsRaw, flocksRaw, logsRaw, todayLogsRaw, medsRaw, immuneRaw] = await Promise.all([
      apiFetch("/api/crud/brd_farms"),
      apiFetch("/api/crud/brd_flocks?limit=1000"),
      apiFetch("/api/crud/brd_daily_logs?limit=1000"),
      apiFetch(`/api/crud/brd_daily_logs?log_date=${today}&limit=1000`),
      apiFetch("/api/crud/brd_medications"),
      apiFetch("/api/crud/brd_vaccinations")
    ]);

    // If the effect was superseded (Strict Mode double-invoke) or farms API failed,
    // bail out — never wipe existing displayed data with an empty/error result.
    if (cancelled?.v) return;
    if (farmsRaw === null) return;
    const farmsData = Array.isArray(farmsRaw?.data) ? farmsRaw.data : Array.isArray(farmsRaw) ? farmsRaw : [];
    const flocks = Array.isArray(flocksRaw?.data) ? flocksRaw.data : Array.isArray(flocksRaw) ? flocksRaw : [];
    const logs = asDailyLogRows(logsRaw);
    const todayMetricLogs = todayLogsRaw === null ? logs : asDailyLogRows(todayLogsRaw);
    const meds = Array.isArray(medsRaw?.data) ? medsRaw.data : Array.isArray(medsRaw) ? medsRaw : [];
    const immune = Array.isArray(immuneRaw?.data) ? immuneRaw.data : Array.isArray(immuneRaw) ? immuneRaw : [];
    const flockFarmMap: Record<string, string> = {};
    const flockQtyMap: Record<string, number> = {};
    // 按农场直接汇总实际存栏数（brd_flocks.current_qty），不依赖日志
    const farmBirdsMap: Record<string, number> = {};
    flocks.forEach((fk: Record<string, unknown>) => {
      if (fk.flock_no) {
        flockFarmMap[fk.flock_no as string] = fk.farm_code as string;
        flockQtyMap[fk.flock_no as string] = asNumber(fk.current_qty);
      }
      if (fk.farm_code && isCanonicalCurrentFlock(fk)) {
        const fc = fk.farm_code as string;
        farmBirdsMap[fc] = (farmBirdsMap[fc] || 0) + asNumber(fk.current_qty);
      }
    });
    const todayMetrics = sumBreedingOverviewTodayMetrics(todayMetricLogs, today);
    setTodayEggs(todayMetrics.eggs);
    setTodayDeaths(todayMetrics.mortality);
    const weekLogs = logs.filter((l: Record<string, unknown>) => dailyLogRowDate(l) >= weekAgo);
    const wEggs = weekLogs.reduce((s: number, l: Record<string, unknown>) => s + asNumber(l.eggs_produced), 0);
    const wDeath = weekLogs.reduce((s: number, l: Record<string, unknown>) => s + dailyLogMortalityTotal(l), 0);
    const wFeed = weekLogs.reduce((s: number, l: Record<string, unknown>) => s + asNumber(l.feed_consumed), 0);
    const immuneDone = immune.filter((i: Record<string, unknown>) => i.actual_date && dateKey(i.plan_date) >= weekAgo).length;
    const immuneTotal = immune.filter((i: Record<string, unknown>) => dateKey(i.plan_date) >= weekAgo).length;
    setWeekSummary({
      eggs: wEggs,
      mortality: wDeath,
      feedRatio: wEggs > 0 ? (wFeed / wEggs * 1000).toFixed(2) : "—",
      immuneDone,
      immuneTotal
    });
    const latestDate = logs.reduce((mx: string, l: Record<string, unknown>) => dailyLogRowDate(l) > mx ? dailyLogRowDate(l) : mx, "");
    const recentLogs = logs.filter((l: Record<string, unknown>) => dailyLogRowDate(l) === latestDate);
    const farmEggMap: Record<string, number> = {};
    // farmLayMap: 用于产蛋率分母（有日报记录的当日在产鸡数），独立于存栏总数
    const farmLayMap: Record<string, number> = {};
    recentLogs.forEach((l: Record<string, unknown>) => {
      const fc = flockFarmMap[l.flock_no as string];
      if (!fc) return;
      farmEggMap[fc] = (farmEggMap[fc] || 0) + asNumber(l.eggs_produced);
      farmLayMap[fc] = (farmLayMap[fc] || 0) + (flockQtyMap[l.flock_no as string] || 0);
    });
    const mapped: Farm[] = farmsData.map((d: Record<string, unknown>) => {
      const fc = d.farm_code as string;
      const totalBirds = farmBirdsMap[fc] || 0; // 实际存栏：来自 brd_flocks.current_qty
      const layBirds = farmLayMap[fc] || 0; // 产蛋率分母：当日有日报的鸡数
      const eggs = farmEggMap[fc] || 0;
      const rate = layBirds > 0 ? (eggs / layBirds * 100).toFixed(1) : "—";
      const location = d.location as string || "—";
      return {
        id: fc,
        name: (d.farm_name || d.name || fc) as string,
        location,
        houses: asNumber(d.houses),
        designCapacity: asNumber(d.capacity),
        totalBirds,
        layingRate: rate,
        status: layBirds > 0 && Number(rate) < WARN_LAY_RATE_PCT || d.status === "WARNING" ? "warning" : "normal"
      };
    });
    setFarms(mapped);

    // Build alerts
    const alertList: AlertItem[] = [];
    const todayTs = new Date(today);
    meds.forEach((m: Record<string, unknown>) => {
      const endDate = new Date((m.clear_date || m.end_date || m.withdrawDate) as string);
      const daysLeft = Math.ceil((endDate.getTime() - todayTs.getTime()) / 86400000);
      if (daysLeft >= 0 && daysLeft <= 5) alertList.push({
        id: "wd-" + m.id,
        type: daysLeft <= 2 ? "danger" : "warning",
        label: t('ui.停药期预警', '停药期预警'),
        msg: `${m.farm_house || m.house_code || t('ui.鸡舍', '鸡舍')} ${m.medicine || m.drug_name || t('ui.药物', '药物')} ${t('ui.停药期还剩', '停药期还剩')} ${daysLeft} ${t('ui.天', '天')}`,
        time: t('ui.系统', '系统')
      });
    });
    const ydLogs = logs.filter((l: Record<string, unknown>) => dailyLogRowDate(l) === ydStr);
    const ydMap: Record<string, {
      eggs: number;
      cap: number;
    }> = {};
    ydLogs.forEach((l: Record<string, unknown>) => {
      const fc = flockFarmMap[l.flock_no as string];
      if (!fc) return;
      if (!ydMap[fc]) ydMap[fc] = {
        eggs: 0,
        cap: 0
      };
      ydMap[fc].eggs += asNumber(l.eggs_produced);
      ydMap[fc].cap += flockQtyMap[l.flock_no as string] || 0;
    });
    mapped.forEach(farm => {
      const todayR = farmEggMap[farm.id] && farmLayMap[farm.id] ? farmEggMap[farm.id] / farmLayMap[farm.id] * 100 : null;
      const ydD = ydMap[farm.id];
      const ydR = ydD && ydD.cap > 0 ? ydD.eggs / ydD.cap * 100 : null;
      if (todayR !== null && ydR !== null && ydR - todayR > 2) alertList.push({
        id: "lr-" + farm.id,
        type: "warning",
        label: t('ui.产蛋率下降', '产蛋率下降'),
        msg: `${farm.name} ${t('ui.产蛋率较昨日下降', '产蛋率较昨日下降')} ${(ydR - todayR).toFixed(1)}%`,
        time: t('ui.实时', '实时')
      });
    });
    immune.filter((i: Record<string, unknown>) => dateKey(i.plan_date) === today && !i.actual_date).forEach((i: Record<string, unknown>) => {
      alertList.push({
        id: "im-" + i.id,
        type: "info",
        label: t('ui.免疫计划', '免疫计划'),
        msg: `${i.farm_house || i.house_code || i.flock_no || t('ui.鸡群', '鸡群')} ${t('ui.今日应执行', '今日应执行')} ${i.vaccine || i.vaccine_name || t('ui.疫苗', '疫苗')} ${t('ui.免疫', '免疫')}`,
        time: t('ui.计划', '计划')
      });
    });
    if (alertList.length === 0 && logs.length > 0) alertList.push({
      id: "ok",
      type: "info",
      label: t('ui.系统正常', '系统正常'),
      msg: t('ui.当前无待处理预警事项', '当前无待处理预警事项'),
      time: t('ui.实时', '实时')
    });
    setAlerts(alertList.slice(0, 6));

    // Device stats
    const token = sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
    const hdr = {
      Authorization: `Bearer ${token}`
    };
    Promise.all([fetch("/api/farm-device/alerts?status=OPEN", {
      headers: hdr
    }).then(r => r.ok ? r.json() : []).catch(() => []), fetch("/api/farm-device/devices/offline", {
      headers: hdr
    }).then(r => r.ok ? r.json() : []).catch(() => []), fetch("/api/farm-device/cabins/all-summary", {
      headers: hdr
    }).then(r => r.ok ? r.json() : {
      data: {
        houses: []
      }
    }).catch(() => ({
      data: {
        houses: []
      }
    }))]).then(([al, off, sumData]) => {
      setDeviceStats({
        openAlerts: Array.isArray(al) ? al.length : 0,
        offlineDevices: Array.isArray(off) ? off.length : 0
      });
      const houses = sumData?.data?.houses || [];
      const envMap: Record<string, {
        temps: number[];
        hums: number[];
        co2s: number[];
      }> = {};
      houses.forEach((h: Record<string, unknown>) => {
        if (!h.farmCode || !h.hasData) return;
        const fc = h.farmCode as string;
        if (!envMap[fc]) envMap[fc] = {
          temps: [],
          hums: [],
          co2s: []
        };
        if (h.avgTemp != null) envMap[fc].temps.push(h.avgTemp as number);
        if (h.avgHumidity != null) envMap[fc].hums.push(h.avgHumidity as number);
        if (h.co2 != null) envMap[fc].co2s.push(h.co2 as number);
      });
      const final: Record<string, FarmEnv> = {};
      Object.keys(envMap).forEach(fc => {
        const {
          temps,
          hums,
          co2s
        } = envMap[fc];
        final[fc] = {
          temp: temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : null,
          hum: hums.length ? (hums.reduce((a, b) => a + b, 0) / hums.length).toFixed(1) : null,
          co2: co2s.length ? Math.round(co2s.reduce((a, b) => a + b, 0) / co2s.length) : null
        };
      });
      setFarmEnvMap(final);
    });
  }, [t]);
  useEffect(() => {
    const cancelled = {
      v: false
    };
    loadData(cancelled);
    return () => {
      cancelled.v = true;
    };
  }, []);
  const handleDelete = async (e: React.MouseEvent, farm: Farm) => {
    e.stopPropagation();
    const token = sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
    try {
      const childRes = await fetch(`/api/crud/brd_houses?farm_code=${encodeURIComponent(farm.id)}&limit=1`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const childJson = await childRes.json().catch(() => null);
      const childRows = (childJson?.data ?? childJson ?? []) as unknown[];
      if (Array.isArray(childRows) && childRows.length > 0) {
        toast.warning(`${t('ui.养殖场', '养殖场')}「${farm.name}」${t('ui.下仍有鸡舍存在请先解散', '下仍有鸡舍存在，请先解散所有鸡舍后再删除场区')}`);
        return;
      }
    } catch {
      toast.warning(t('ui.子记录检查失败删除已取消', '子记录检查失败，删除已取消以防止数据孤立，请稍后重试'));
      return;
    }
    const ok = await dialog.showConfirm({
      title: t('ui.确认解散', '确认解散'),
      message: `${t('ui.确认拆除空管区', '确认拆除空管区：')}${farm.name}?`,
      type: "danger",
      confirmLabel: t('ui.确认解散', '确认解散')
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/crud/brd_farms/${farm.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(t('ui.养殖场已删除', '养殖场已删除'));
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('ui.删除失败', '删除失败'));
    }
  };
  const totalBirds = useMemo(() => farms.reduce((s, f) => s + (Number(f.totalBirds) || 0), 0), [farms]);
  const withdrawalLabel = t('ui.停药期预警', '停药期预警');
  const immuneLabel = t('ui.免疫计划', '免疫计划');
  const withdrawalCount = useMemo(() => alerts.filter(a => a.label === withdrawalLabel).length, [alerts, withdrawalLabel]);
  const immuneCount = useMemo(() => alerts.filter(a => a.label === immuneLabel).length, [alerts, immuneLabel]);
  const statusColor = (type: string) => ({
    danger: "var(--status-danger)",
    warning: "var(--status-warning)",
    info: "var(--color-accent)",
    success: "var(--status-success)"
  })[type] || "var(--text-disabled)";
  return <div className="animate-fade-in">
      <PageHeader title={t('ui.养殖生产中心', '养殖生产中心')} subtitle={t('ui.实时监控所有养殖场运营状态', '实时监控所有养殖场运营状态')} breadcrumb={[t('ui.总部门户', '总部门户'), t('ui.养殖生产中心', '养殖生产中心')]} />

      {/* g200f Sub-nav pills — toolbarFilterPill 风格,统一 active 蓝/inactive 灰 */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
        {SUB_NAV.map(item => (
          <button
            key={item.label}
            type="button"
            onClick={() => router.push(item.path)}
            style={{ ...(item.active ? primaryActionButton : secondaryActionButton), padding: "7px 14px", fontSize: 13 }}
          >
            {item.icon}{item.label}
          </button>
        ))}
      </div>

      {/* g200f KPI 7 卡 — kpiCardCompact(tone),emoji-color 风格清除 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
        gap: 12,
        marginBottom: 24,
      }}>
        {([
          { title: t('ui.存栏总数',   '存栏总数'),   value: totalBirds.toLocaleString(),  unit: t('ui.羽', '羽'), tone: "brand"   as Tone, Icon: Users          },
          { title: t('ui.今日产蛋',   '今日产蛋'),   value: todayEggs.toLocaleString(),   unit: t('ui.枚', '枚'), tone: "warning" as Tone, Icon: Wheat          },
          { title: t('ui.有效养殖场', '有效养殖场'), value: String(farms.length),         unit: t('ui.个', '个'), tone: "success" as Tone, Icon: BarChart2      },
          { title: t('ui.今日死淘',   '今日死淘'),   value: todayDeaths.toLocaleString(), unit: t('ui.羽', '羽'), tone: "danger"  as Tone, Icon: AlertTriangle  },
          { title: t('ui.停药期预警', '停药期预警'), value: String(withdrawalCount),      unit: t('ui.批', '批'), tone: "info"    as Tone, Icon: Droplets       },
          { title: t('ui.今日免疫任务', '今日免疫任务'), value: String(immuneCount),       unit: t('ui.项', '项'), tone: "success" as Tone, Icon: ClipboardList  },
        ]).map(c => {
          const Icon = c.Icon;
          return (
            <div key={c.title} style={kpiCardCompact(c.tone)}>
              <div style={kpiCardCompactLabel}>
                <Icon size={13} /> {c.title}
              </div>
              <div style={{ ...kpiCardCompactValue(c.tone), display: "flex", alignItems: "baseline", gap: 4 }}>
                {c.value}
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 400 }}>{c.unit}</span>
              </div>
            </div>
          );
        })}

        {/* 环境设备特殊卡(2 数字 + 入口箭头) — 沿用 kpiCardCompact 但内嵌双值 */}
        <div style={{ ...kpiCardCompact("info"), position: "relative" }}>
          <button type="button" onClick={() => router.push("/breeding/device-alerts")} title={t('ui.进入环境预警中心', '进入环境预警中心')}
            style={{ position: "absolute", top: 10, right: 10, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 4 }}>
            <ArrowUpRight size={14} />
          </button>
          <div style={kpiCardCompactLabel}><Wifi size={13} /> {t('ui.环境设备', '环境设备')}</div>
          <div style={{ display: "flex", gap: 16, marginTop: 2 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.15, fontFamily: MONO_FONT, color: deviceStats.openAlerts > 0 ? "var(--status-warning)" : "var(--text-primary)" }}>{deviceStats.openAlerts}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{t('ui.未处理告警', '未处理告警')}</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.15, fontFamily: MONO_FONT, color: deviceStats.offlineDevices > 0 ? "var(--status-danger)" : "var(--text-primary)" }}>{deviceStats.offlineDevices}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{t('ui.离线设备', '离线设备')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content: farm list + alerts */}
      <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 340px",
      gap: 20
    }}>
        {/* Farm list */}
        <div>
          <h3 style={{
          fontSize: 15,
          fontWeight: 700,
          marginBottom: 12,
          color: "var(--color-primary)"
        }}>{t('ui.养殖场一览', '养殖场一览')}</h3>
          <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 12
        }}>
            {farms.length === 0 && <div style={{
            padding: "32px",
            textAlign: "center",
            color: "var(--text-secondary)",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)"
          }}>
                {t('ui.暂无养殖场数据', '暂无养殖场数据，请前往「主数据 → 养殖场」维护')}
              </div>}
            {farms.map(farm => <div key={farm.id} style={{
            background: "var(--bg-card)",
            borderRadius: "var(--radius-lg)",
            padding: "18px 20px",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 16,
            transition: "border-color 0.15s,box-shadow 0.15s"
          }} onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--color-primary)";
            (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md)";
          }} onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLElement).style.boxShadow = "none";
          }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                  background: farm.status === "warning" ? "color-mix(in srgb, var(--status-danger) 10%, transparent)" : "color-mix(in srgb, var(--color-accent) 12%, transparent)",
                  color: farm.status === "warning" ? "var(--status-danger)" : "var(--color-accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Bird size={22} />
                </div>
                <div className={u.flex1}>
                  <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 4
              }}>
                    <span style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: "var(--text-primary)"
                }}>{farm.name}</span>
                    <span style={actionPill(farm.status === "warning" ? "danger" : "success")}>
                      {farm.status === "warning" ? t('ui.需关注', '需关注') : t('ui.正常', '正常')}
                    </span>
                  </div>
                  <div className={u.muted12}>
                    {farm.location} · {farm.houses}{t('ui.栋鸡舍', '栋鸡舍')} · {t('ui.存栏', '存栏')} {Number(farm.totalBirds).toLocaleString()} {t('ui.羽', '羽')}
                  </div>
                  {farmEnvMap[farm.id] && (farmEnvMap[farm.id].temp != null || farmEnvMap[farm.id].hum != null) && <div style={{
                display: "flex",
                gap: 8,
                marginTop: 8,
                fontSize: 11,
                fontWeight: 600
              }}>
                      {farmEnvMap[farm.id].temp != null && (
                        <span style={{ ...actionPill("warning"), gap: 4 }}>
                          <Thermometer size={11} /> {farmEnvMap[farm.id].temp}℃
                        </span>
                      )}
                      {farmEnvMap[farm.id].hum != null && (
                        <span style={{ ...actionPill("success"), gap: 4 }}>
                          <Droplet size={11} /> {farmEnvMap[farm.id].hum}%
                        </span>
                      )}
                      {farmEnvMap[farm.id].co2 != null && (
                        <span style={{ ...actionPill("default"), gap: 4 }}>
                          <Wind size={11} /> {farmEnvMap[farm.id].co2} ppm
                        </span>
                      )}
                    </div>}
                </div>
                <div style={{
              textAlign: "right",
              flexShrink: 0
            }}>
                  <div style={{
                fontSize: 22,
                fontWeight: 700,
                color: typeof farm.layingRate === "string" && isNaN(Number(farm.layingRate)) ? "var(--text-secondary)" : Number(farm.layingRate) < WARN_LAY_RATE_PCT ? "var(--status-danger)" : "var(--status-success)"
              }}>
                    {farm.layingRate}%
                  </div>
                  <div style={{
                fontSize: 11,
                color: "var(--text-secondary)"
              }}>{t('ui.产蛋率', '产蛋率')}</div>
                </div>
                <div style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              flexShrink: 0,
              marginLeft: 10
            }}>
                  <button type="button" onClick={e => { e.stopPropagation(); router.push('/master/farms'); }} title={t('ui.在主数据中编辑', '在主数据中编辑')} style={{ ...actionPill("default"), padding: 6 }}>
                    <Settings size={14} />
                  </button>
                  <button type="button" onClick={e => handleDelete(e, farm)} style={{ ...actionPill("danger"), padding: 6 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>)}
          </div>
        </div>

        {/* Alerts + weekly summary */}
        <div>
          <h3 style={{
          fontSize: 15,
          fontWeight: 700,
          marginBottom: 12,
          color: "var(--color-primary)"
        }}>{t('ui.今日预警任务', '今日预警任务')}</h3>
          {/* g200f 今日预警容器 — actionGroupBox(避免与顶部 KPI 同款卡片) */}
          <div style={{ ...actionGroupBox, background: "var(--bg-card)", overflow: "hidden", padding: 0 }}>
            {alerts.map((a, i) => {
              const aTone: Tone =
                a.type === "danger"  ? "danger"  :
                a.type === "warning" ? "warning" :
                a.type === "success" ? "success" :
                a.type === "info"    ? "info"    : "default";
              return (
                <div key={a.id} style={{
                  padding: "14px 16px",
                  borderBottom: i < alerts.length - 1 ? "1px solid var(--border)" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={actionPill(aTone)}>{a.label}</span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: "auto" }}>{a.time}</span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5, margin: 0 }}>{a.msg}</p>
                </div>
              );
            })}
          </div>
          {/* g200f 本周汇总 — detailInfoBox 风格,不重复 KPI 卡 */}
          <div style={{ ...detailInfoBox, background: "var(--bg-card)", marginTop: 16, padding: 16 }}>
            <h4 style={{
            fontSize: 13,
            fontWeight: 700,
            marginBottom: 12,
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.5px"
          }}>{t('ui.本周汇总', '本周汇总')}</h4>
            {[{
            label: t('ui.累计产蛋', '累计产蛋'),
            val: weekSummary.eggs > 0 ? weekSummary.eggs.toLocaleString() + ` ${t('ui.枚', '枚')}` : "—",
            color: "var(--color-primary)"
          }, {
            label: t('ui.死淘累计', '死淘累计'),
            val: weekSummary.mortality > 0 ? weekSummary.mortality.toLocaleString() + ` ${t('ui.羽', '羽')}` : `0 ${t('ui.羽', '羽')}`,
            color: "var(--status-danger)"
          }, {
            label: t('ui.料蛋比均', '料蛋比均'),
            val: String(weekSummary.feedRatio) || "—",
            color: "var(--status-success)"
          }, {
            label: t('ui.完成免疫', '完成免疫'),
            val: weekSummary.immuneTotal > 0 ? `${weekSummary.immuneDone} / ${weekSummary.immuneTotal} ${t('ui.项', '项')}` : t('ui.暂无计划', '暂无计划'),
            color: "var(--status-warning)"
          }].map(item => <div key={item.label} style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 8
          }}>
                <span style={{
              fontSize: 13,
              color: "var(--text-secondary)"
            }}>{item.label}</span>
                <span style={{
              fontSize: 13,
              fontWeight: 700,
              color: item.color
            }}>{item.val}</span>
              </div>)}
          </div>
        </div>
      </div>

    </div>;
}
