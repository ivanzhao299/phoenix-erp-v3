"use client";
import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

// ✅ 环境预警页面
// 数据来源: GET /api/v3/iot/devices/all-summary（IoT 专用模块）
// mon_device_alert_event 不在 CRUD ALLOWED_TABLES，必须通过 IoT API 过滤告警数据

interface AlarmItem {
  house_code:    string;
  farm_code:     string;
  property_name: string;
  value:         number;
  unit:          string;
  category:      string;
  severity:      "critical" | "warning" | "normal";
}

interface Summary {
  totalHouses:    number;
  activeHouses:   number;
  totalAlarms:    number;
  alarmHouses:    number;
  onlineSensorCnt: number;
  totalSensorCnt:  number;
}

export default function DeviceAlertsPage() {
  const [alarms,     setAlarms]     = useState<AlarmItem[]>([]);
  const [summary,    setSummary]    = useState<Summary | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchAlarms = useCallback(async () => {
    try {
      const token = sessionStorage.getItem("phoenix_token") ?? "";
      const res   = await fetch("/api/v3/iot/devices/all-summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`IoT API 返回 ${res.status}`);
      const json = await res.json();

      // 汇总统计
      setSummary(json.data?.summary ?? null);

      // recentAlarms 是来自 mon_device_alert_event 的真实告警事件
      const recentAlarms = json.data?.recentAlarms ?? [];
      const alarmItems: AlarmItem[] = (Array.isArray(recentAlarms) ? recentAlarms : []).map((a: any) => ({
        house_code:    a.erp_house_code ?? '',
        farm_code:     a.farm_code ?? '',
        property_name: a.name_zh ?? a.property_name ?? '未知指标',
        value:         a.current_val,
        unit:          a.unit ?? '',
        category:      a.category ?? '',
        // C3: 由后端字段透传 — 旧版强写 'critical' 把 warning 都吞了，全显红
        severity:      (a.severity === 'warning' || a.severity === 'normal') ? a.severity : 'critical',
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

  useEffect(() => {
    fetchAlarms();
    const t = setInterval(fetchAlarms, 30000);
    return () => clearInterval(t);
  }, [fetchAlarms]);

  const hasAlarm = (summary?.totalAlarms ?? alarms.length) > 0;

  const KPI_CARDS = [
    {
      label: '活跃告警',
      val:   loading ? '—' : String(summary?.totalAlarms ?? alarms.length),
      sub:   `${summary?.alarmHouses ?? 0} 栋鸡舍有告警`,
      color: hasAlarm ? '#ef4444' : '#22c55e',
    },
    {
      label: '已接入鸡舍',
      val:   loading ? '—' : String(summary?.totalHouses ?? '—'),
      sub:   `${summary?.activeHouses ?? 0} 栋有实时数据`,
      color: 'var(--color-primary)',
    },
    {
      label: '在线传感器',
      val:   loading ? '—' : String(summary?.onlineSensorCnt ?? '—'),
      sub:   `共 ${summary?.totalSensorCnt ?? 0} 个监测点`,
      color: 'var(--color-primary)',
    },
    {
      label: '系统状态',
      val:   hasAlarm ? '⚠ 异常' : '✓ 正常',
      sub:   lastUpdate ? `更新于 ${lastUpdate.toLocaleTimeString('zh-CN')}` : '—',
      color: hasAlarm ? '#ef4444' : '#22c55e',
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="环境预警"
        subtitle="实时环境异常告警列表（每 30 秒自动刷新）"
        breadcrumb={['养殖管理', '环境预警']}
        actions={
          <button type="button" className={s.btnSecondary} onClick={fetchAlarms} disabled={loading}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            刷新
          </button>
        }
      />

      {/* KPI 卡片 */}
      <div className={s.statsRow} style={{ marginBottom: 20 }}>
        {KPI_CARDS.map(c => (
          <div key={c.label} className={s.statCard} style={{ borderLeftColor: c.color }}>
            <div className={s.statValue} style={{ color: c.color }}>{c.val}</div>
            <div className={s.statLabel}>{c.label}</div>
            <div className={s.statSub}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* 错误提示 */}
      {error && (
        <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid #ef4444", borderRadius:10, padding:16, marginBottom:20, color:"#ef4444", display:'flex', alignItems:'center', gap:8 }}>
          <AlertTriangle size={16} />
          IoT 数据获取失败：{error}
        </div>
      )}

      {/* 告警列表 */}
      {loading ? (
        <div style={{ textAlign:"center", padding:60, color:"var(--text-secondary)" }}>加载告警数据中...</div>
      ) : alarms.length === 0 ? (
        <div style={{ textAlign:"center", padding:60, color:"#22c55e", fontSize:15, fontWeight:600 }}>
          ✅ 当前所有鸡舍环境指标正常，无告警
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {alarms.map((a, i) => (
            <div key={i} style={{
              background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.25)",
              borderRadius:10, padding:"14px 18px", display:"flex", alignItems:"center", gap:16,
            }}>
              <div style={{ width:38, height:38, borderRadius:"50%", background:"rgba(239,68,68,0.15)",
                display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <AlertTriangle size={18} style={{ color:"#ef4444" }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, color:"var(--text-primary)", marginBottom:4 }}>
                  {a.property_name}
                  <span style={{ fontSize:"1.1rem", fontWeight:800, color:"#ef4444", marginLeft:12 }}>
                    {a.value != null ? Number(a.value).toFixed(1) : "—"} {a.unit}
                  </span>
                </div>
                <div style={{ fontSize:"0.8rem", color:"var(--text-secondary)", display:"flex", gap:16 }}>
                  <span style={{ display:"flex", alignItems:"center", gap:4 }}><Home size={12} /> {a.house_code}</span>
                  {a.category && <span>{a.category}</span>}
                </div>
              </div>
              <span style={{ fontSize:"0.75rem", padding:"3px 10px", borderRadius:6, background:"rgba(239,68,68,0.15)", color:"#ef4444", fontWeight:700 }}>
                超出阈值
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
