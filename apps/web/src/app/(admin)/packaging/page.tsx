"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Package, CheckCircle, AlertCircle, Layers, Plus, ArrowRight, RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";

const tok = () => typeof window !== "undefined" ? (sessionStorage.getItem("phoenix_token") || "") : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });
const API = (p: string) => `/api${p}`;

const getRole = () => { try { return JSON.parse(sessionStorage.getItem("phoenix_user") || "{}").role || ""; } catch { return ""; } };
const isPkgWrite = () => ["ROLE_ADMIN", "ROLE_PKG_MGR", "ROLE_PKG_OP"].includes(getRole());
const isPkgMgr = () => ["ROLE_ADMIN", "ROLE_PKG_MGR"].includes(getRole());

interface Shift {
  id: number; shiftId: string; shift: string; leader: string;
  farmHouse: string; collected: number; dirty: number; broken: number;
  bad: number; status: string; time: string;
}

export default function EggCollectionPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const rightRef = useRef<HTMLDivElement>(null);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [houses, setHouses] = useState<{ code: string; label: string }[]>([]);
  const [shiftOptions, setShiftOptions] = useState<{ code: string; label: string }[]>([]);
  const [operators, setOperators] = useState<{ username: string; real_name_zh: string; role_name_zh?: string }[]>([]);
  const [activeShift, setActiveShift] = useState<number | null>(null);
  const [eggCount, setEggCount] = useState("");
  const [dirtyEggs, setDirtyEggs] = useState("");
  const [brokenEggs, setBrokenEggs] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pendingTaskNo, setPendingTaskNo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");

  // localStorage 记忆 key & helpers
  const LS_HOUSE  = "pkg_lastHouse";
  const LS_SHIFT  = "pkg_lastShift";
  const LS_LEADER = "pkg_lastLeader";
  const readLS  = (key: string) => { try { return localStorage.getItem(key) || ""; } catch { return ""; } };
  const writeLS = (key: string, val: string) => { try { if (val) localStorage.setItem(key, val); } catch {} };

  const [newShift, setNewShift] = useState({ farmHouse: "", shift: "", leader: "" });
  const [errMsg, setErrMsg] = useState("");

  const loadShifts = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(API("/crud/pkg_shifts?limit=200"), { headers: hdr() });
      if (!r.ok) { setLoading(false); return; } // 未登录或权限不足，跳过
      const j = await r.json();
      const rows: Shift[] = ((j.data || j) as Record<string, unknown>[])
        .filter((x) => (x.shift_date as string)?.slice(0, 10) === today)
        .map((x) => ({
          id: x.id as number,
          shiftId: (x.shift_no || x.shift_id || "") as string,
          shift: (x.shift_type || x.shift_time || x.shift_name || "") as string,
          leader: (x.operator || x.leader || "") as string,
          farmHouse: (x.house_code || "") as string,
          collected: Number(x.total_qty || x.eggs_collected || 0),
          dirty: Number(x.dirty_qty || x.dirty_eggs || 0),
          broken: Number(x.broken_qty || x.broken_eggs || 0),
          // C5: 优先用 DB 的 bad_eggs 列；只有 V2 旧数据没填 bad_eggs 时才从 dirty+broken 算
          bad: Number(x.bad_eggs ?? (Number(x.dirty_qty || x.dirty_eggs || 0) + Number(x.broken_qty || x.broken_eggs || 0))),
          status: (x.status || "PENDING") as string,
          time: ((x.completed_at || x.completed_time || x.updated_at || "") as string).slice(11, 16),
        }));
      setShifts(rows);
      if (rows.length > 0 && !activeShift) setActiveShift(rows[0].id);
    } finally { setLoading(false); }
  }, [today]);

  const loadDrawerData = useCallback(async () => {
    const token = typeof window !== "undefined" ? (sessionStorage.getItem("phoenix_token") || "") : "";
    const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    try {
      // C1: 移除 /v3/debug/token-echo 调试端点引用（生产代码不应依赖调试 API；
      //     真无效 token 后续 401 会被全局 api-client 兜底处理）。
      // 鸡舍和字典：登录用户均可 GET（READ_ALL_TABLES 策略）
      const [r1, r2, r3] = await Promise.all([
        fetch(API("/crud/brd_houses?limit=200"), { headers: hdrs }),
        fetch(API("/crud/sys_dict?dict_type=PKG_SHIFT&status=ACTIVE&limit=100"), { headers: hdrs }),
        fetch(API("/packaging/operators"), { headers: hdrs }),
      ]);

      if (process.env.NODE_ENV !== "production") {
        setDebugInfo(`houses=${r1.status} | dict=${r2.status} | ops=${r3.status}`);
      }

      if (r1.ok) {
        const j = await r1.json();
        setHouses(((j.data || j) as Record<string, unknown>[])
          .filter(h => h.house_code && h.status !== "DISABLED" && h.status !== "INACTIVE" && h.status !== "DELETED")
          .map(h => ({
            code: h.house_code as string,
            label: h.house_name ? `${h.house_code} · ${h.house_name}` : h.house_code as string,
          })));
      }
      if (r2.ok) {
        const j = await r2.json();
        const all = (j.data || j) as Record<string, unknown>[];
        const opts = all.filter(d => d.dict_type === "PKG_SHIFT" && d.status === "ACTIVE")
          .map(d => ({ code: d.dict_code as string, label: (d.dict_label_zh || d.dict_code) as string }));
        setShiftOptions(opts);
        if (opts.length > 0) setNewShift(p => ({ ...p, shift: p.shift || opts[0].code }));
      }
      if (r3.ok) {
        const j = await r3.json();
        setOperators(j.data || []);
      }
    } catch (e: any) {
      if (process.env.NODE_ENV !== "production") {
        setDebugInfo(`❌ 网络错误 | err=${e?.message || "unknown"}`);
      }
    }
  }, []);

  const openDrawer = () => {
    const lastHouse  = readLS(LS_HOUSE);
    const lastShift  = readLS(LS_SHIFT);
    const lastLeader = readLS(LS_LEADER) || (() => {
      try { return JSON.parse(sessionStorage.getItem("phoenix_user") || "{}").username || ""; } catch { return ""; }
    })();
    setNewShift({ farmHouse: lastHouse, shift: lastShift, leader: lastLeader });
    setErrMsg("");
    setShowDrawer(true);
    loadDrawerData(); // 每次打开都重新加载，确保 token 有效后数据最新
  };

  useEffect(() => {
    loadShifts();
  }, []);

  const selectShift = (id: number) => {
    setActiveShift(id);
    setSubmitted(false); setPendingTaskNo(null);
    setEggCount(""); setDirtyEggs(""); setBrokenEggs("");
    setTimeout(() => rightRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const handleSaveShift = async () => {
    if (!newShift.farmHouse) { setErrMsg("请选择鸡舍"); return; }
    if (!newShift.shift) { setErrMsg("请选择班次"); return; }
    if (!newShift.leader) { setErrMsg("请选择负责人"); return; }
    setErrMsg(""); setSaving(true);
    try {
      const shiftNo = "S" + today.replace(/-/g, "") + Date.now().toString().slice(-6);
      // B2: shift_type 存 dict code (与 egg-terminal 对齐)；shift_time 存可读 label
      const shiftLabel = shiftOptions.find(o => o.code === newShift.shift)?.label || newShift.shift;
      const resp = await fetch(API("/crud/pkg_shifts"), { method: "POST", headers: hdr(), body: JSON.stringify({
        shift_no:       shiftNo,
        shift_date:     today,
        shift_time:     shiftLabel,
        shift_type:     newShift.shift,
        leader:         newShift.leader,
        operator:       newShift.leader,
        house_code:     newShift.farmHouse,
        status:         "PENDING",
        eggs_collected: 0,
        dirty_eggs:     0,
        broken_eggs:    0,
        total_qty:      0,
        dirty_qty:      0,
        broken_qty:     0,
        completed_time: "",
      })});
      if (!resp.ok) { const e = await resp.json(); setErrMsg(e.message || `保存失败 (${resp.status})`); return; }
      // 将本次选择写入 localStorage
      writeLS(LS_HOUSE,  newShift.farmHouse);
      writeLS(LS_SHIFT,  newShift.shift);
      writeLS(LS_LEADER, newShift.leader);
      setShowDrawer(false);
      setNewShift(p => ({ ...p, farmHouse: "" }));
      await loadShifts();
    } catch { setErrMsg("保存失败，请重试"); }
    finally { setSaving(false); }
  };

  const handleSubmit = async () => {
    if (!eggCount || Number(eggCount) <= 0) { alert("请输入集蛋数量"); return; }
    if (!activeShift) { alert("请先选择班次"); return; }
    const total = Number(eggCount), bad = Number(dirtyEggs || 0) + Number(brokenEggs || 0);
    if (bad > total) { alert(`❌ 脏蛋+破损 ${bad} 枚超过总量 ${total} 枚，请检查`); return; }
    const badRate = total > 0 ? bad / total * 100 : 0;
    if (bad > 0 && badRate > 50 && !confirm(`⚠️ 非优品率高达 ${badRate.toFixed(1)}%，确认提交？`)) return;
    try {
      const resp = await fetch(API(`/packaging/shifts/${activeShift}/complete`), {
        method: "POST", headers: hdr(),
        // 字段名与 V2 保持一致
        body: JSON.stringify({
          eggs_collected: Number(eggCount),
          dirty_eggs:     Number(dirtyEggs)  || 0,
          broken_eggs:    Number(brokenEggs) || 0,
          // V3 兼容
          total_qty:      Number(eggCount),
          dirty_qty:      Number(dirtyEggs)  || 0,
          broken_qty:     Number(brokenEggs) || 0,
        }),
      });
      const result = await resp.json();
      if (!resp.ok) { alert(result.msg || `提交失败 (${resp.status})`); return; }
      setPendingTaskNo(result.task_no || null);
      setSubmitted(true);
      await loadShifts();
    } catch { alert("提交失败，请检查网络"); }
  };

  const handleReopen = async (shiftData: Shift) => {
    if (!confirm(`确认重新开放"${shiftData.farmHouse} · ${shiftData.shift}"班次进行数据更正？`)) return;
    const resp = await fetch(API(`/packaging/shifts/${shiftData.id}/reopen`), {
      method: "POST", headers: hdr(), body: JSON.stringify({ reason: "管理员手动更正" }),
    });
    const json = await resp.json();
    if (resp.ok) {
      setEggCount(shiftData.collected > 0 ? String(shiftData.collected) : "");
      setDirtyEggs(shiftData.dirty > 0 ? String(shiftData.dirty) : "");
      setBrokenEggs(shiftData.broken > 0 ? String(shiftData.broken) : "");
      setSubmitted(false);
      await loadShifts();
    } else { alert(json.msg || "重开失败"); }
  };

  const todayTotal = useMemo(() => shifts.filter(s => ["done", "DONE"].includes(s.status)).reduce((a, s) => a + s.collected, 0), [shifts]);
  const doneCount = useMemo(() => shifts.filter(s => ["done", "DONE"].includes(s.status)).length, [shifts]);
  const inProgCount = useMemo(() => shifts.filter(s => ["inProgress", "IN_PROGRESS"].includes(s.status)).length, [shifts]);
  const totalCollected = shifts.reduce((a, s) => a + s.collected, 0);
  const totalBad = shifts.reduce((a, s) => a + s.bad, 0);
  const badRate = totalCollected > 0 ? (totalBad / totalCollected * 100).toFixed(2) : "0.00";
  const activeShiftData = shifts.find(s => s.id === activeShift);

  const statusLabel = (st: string) => {
    if (["done", "DONE"].includes(st)) return { text: "已完成", cls: s.badgeGreen };
    if (["inProgress", "IN_PROGRESS"].includes(st)) return { text: "进行中", cls: s.badgeBlue };
    return { text: "待处理", cls: s.badgeGray };
  };

  // Real-time summary box
  const total = Number(eggCount) || 0;
  const dirty = Number(dirtyEggs) || 0;
  const broken = Number(brokenEggs) || 0;
  const badSum = dirty + broken;
  const good = Math.max(0, total - badSum);
  const brCalc = total > 0 ? badSum / total * 100 : 0;
  const isOverflow = badSum > total;
  const isHighBad = !isOverflow && brCalc > 50;
  const isWarnBad = !isOverflow && brCalc > 20;

  return (
    <div>
      <PageHeader
        title={t("packaging.collection", "集蛋作业台")}
        subtitle={`今日集蛋 · ${today} · ${shifts.length} 个班次`}
        breadcrumb={["分级包装", "集蛋作业台"]}
        actions={isPkgWrite() ? (
          <button className={s.btnPrimaryGrad} onClick={openDrawer}>
            <Plus size={14} /> 新建班次
          </button>
        ) : undefined}
      />

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { icon: <Package size={20}/>, label: "今日累计集蛋", val: loading ? "…" : todayTotal.toLocaleString(), unit: "枚" },
          { icon: <CheckCircle size={20}/>, label: "已完成班次", val: loading ? "…" : String(doneCount), unit: "个" },
          { icon: <AlertCircle size={20}/>, label: "进行中", val: loading ? "…" : String(inProgCount), unit: "个" },
          { icon: <Layers size={20}/>, label: "今日破损率", val: loading ? "…" : badRate, unit: "%" },
        ].map(k => (
          <div key={k.label} className={s.kpiCard}>
            <div className={s.kpiIcon}>{k.icon}</div>
            <div>
              <div className={s.kpiValue}>{k.val} <span style={{fontSize:12,fontWeight:400}}>{k.unit}</span></div>
              <div className={s.kpiLabel}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20 }}>
        {/* Left: shift list */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-primary)", margin: 0 }}>今日班次</h3>
            <button className={s.btnIcon} onClick={loadShifts} title="刷新"><RefreshCw size={13}/></button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {loading ? <div className={s.emptyStateText}>加载中…</div>
              : shifts.length === 0 ? (
                <div className={s.emptyState} style={{ border: "1px dashed var(--border)", borderRadius: 8, padding: 24 }}>
                  <div className={s.emptyStateText}>今日暂无班次，点击「新建班次」创建</div>
                </div>
              ) : shifts.map(sh => {
                const sl = statusLabel(sh.status);
                return (
                  <div key={sh.id} onClick={() => selectShift(sh.id)}
                    className={s.listCard}
                    style={{ borderColor: activeShift === sh.id ? "var(--color-primary)" : "var(--border)", cursor: "pointer",
                      background: activeShift === sh.id ? "var(--bg-muted)" : "var(--bg-card)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{sh.farmHouse}</span>
                      <span className={sl.cls}>{sl.text}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{sh.shift} · {sh.leader}</div>
                    {["done", "DONE"].includes(sh.status) && (
                      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: "var(--color-primary)" }}>
                        {sh.collected.toLocaleString()} 枚 · 脏/破 {sh.bad.toLocaleString()} 枚
                        {sh.time && <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 400, marginLeft: 8 }}>完成于 {sh.time}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Right: entry form */}
        <div ref={rightRef}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-primary)", marginBottom: 10 }}>集蛋录入</h3>
          <div className={s.card}>
            {!activeShiftData && !loading ? (
              <div className={s.emptyState} style={{ padding: 40 }}><div className={s.emptyStateText}>请先从左侧选择班次</div></div>
            ) : submitted ? (
              <div style={{ textAlign: "center", padding: 30 }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--status-success)", marginBottom: 6 }}>集蛋数据已录入</div>
                {pendingTaskNo && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>已自动生成分级任务：<code style={{ background: "var(--bg-muted)", padding: "2px 6px", borderRadius: 4 }}>{pendingTaskNo}</code></div>}
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button className={s.btnPrimaryGrad} onClick={() => router.push(pendingTaskNo ? `/packaging/grading?task=${encodeURIComponent(pendingTaskNo)}` : "/packaging/grading")}>
                    <ArrowRight size={14}/> 前往分级作业
                  </button>
                  <button className={s.btnGhost} onClick={() => { setSubmitted(false); setPendingTaskNo(null); setEggCount(""); setDirtyEggs(""); setBrokenEggs(""); }}>
                    继续录入
                  </button>
                </div>
              </div>
            ) : ["done", "DONE"].includes(activeShiftData?.status || "") ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--status-success)" }}>✅ 集蛋数据已完成录入</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{activeShiftData!.farmHouse} · {activeShiftData!.shift} · {activeShiftData!.leader}</div>
                  </div>
                  {isPkgMgr() && <button className={s.btnWarning} onClick={() => handleReopen(activeShiftData!)}>🔧 申请更正</button>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                  {[
                    { label: "总集蛋量", val: activeShiftData!.collected.toLocaleString(), unit: "枚" },
                    { label: "脏蛋", val: activeShiftData!.dirty.toLocaleString(), unit: "枚" },
                    { label: "破损蛋", val: activeShiftData!.broken.toLocaleString(), unit: "枚" },
                    { label: "合格蛋入库", val: Math.max(0, activeShiftData!.collected - activeShiftData!.bad).toLocaleString(), unit: "枚" },
                  ].map(item => (
                    <div key={item.label} className={s.statBox}>
                      <div className={s.statValue}>{item.val}</div>
                      <div className={s.statLabel}>{item.label}（{item.unit}）</div>
                    </div>
                  ))}
                </div>
                {activeShiftData!.time && <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-secondary)", textAlign: "right" }}>完成于 {activeShiftData!.time}</div>}
              </div>
            ) : (
              <>
                {activeShiftData && (
                  <div className={s.infoBanner} style={{ marginBottom: 16 }}>
                    🏠 <strong style={{ color: "var(--color-primary)" }}>{activeShiftData.farmHouse}</strong> · {activeShiftData.shift} · <strong>{activeShiftData.leader}</strong>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                  {[
                  { key: "egg",    label: "🥚 产蛋数量（枚）",  ph: "请输入集蛋总数",    sub: "本班次集蛋总量",        val: eggCount,    set: setEggCount },
                    { key: "dirty",  label: "🟡 脏蛋数量（枚）",  ph: "表面污染，可清洗",   sub: "可清洗后重新分级",     val: dirtyEggs,   set: setDirtyEggs },
                    { key: "broken", label: "🔴 破损蛋数量（枚）", ph: "裂纹/破壳，需隔离",  sub: "⚠️ 当日处理，不可储存", val: brokenEggs,  set: setBrokenEggs },
                  ].map(f => (
                    <div key={f.key}>
                      <label className={s.fieldLabel}>{f.label}</label>
                      <input type="number" min="0" step="1" value={f.val}
                        onChange={e => f.set(String(Math.max(0, Math.floor(Number(e.target.value) || 0)) || ""))}
                        placeholder={f.ph} className={s.inp} style={{ fontSize: 16, fontWeight: 600, textAlign: "right" }} />
                      <div style={{ fontSize: 11, marginTop: 4, color: "var(--text-secondary)" }}>{f.sub}</div>
                    </div>
                  ))}
                </div>
                {eggCount && (
                  <div className={s.summaryBox} style={{
                    background: isOverflow ? "var(--status-danger-bg)" : isHighBad ? "var(--status-danger-bg)" : isWarnBad ? "var(--status-warning-bg)" : "var(--status-success-bg)",
                    borderColor: isOverflow || isHighBad ? "var(--status-danger)" : isWarnBad ? "var(--status-warning)" : "var(--status-success)",
                    marginBottom: 16,
                  }}>
                    {isOverflow ? <strong>❌ 错误：脏蛋+破损合计 {badSum} 枚，已超过总集蛋量 {total} 枚！</strong>
                      : <>合格蛋：<strong>{good.toLocaleString()} 枚</strong>&nbsp;&nbsp;
                        脏蛋 <strong>{dirty.toLocaleString()}</strong> 枚&nbsp;&nbsp;
                        破损 <strong>{broken.toLocaleString()}</strong> 枚&nbsp;&nbsp;
                        非优品率 <strong>{brCalc.toFixed(2)}%</strong>
                        {isHighBad && <span style={{ marginLeft: 8 }}>🔴 破损率极高，请核实</span>}
                        {isWarnBad && !isHighBad && <span style={{ marginLeft: 8 }}>⚠️ 破损率偏高</span>}
                      </>}
                  </div>
                )}
                <button className={s.btnPrimaryGrad} style={{ width: "100%", padding: 12, fontSize: 15 }} onClick={handleSubmit}>
                  提交集蛋记录
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* New Shift Drawer */}
      {showDrawer && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={() => setShowDrawer(false)} />
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 450, background: "var(--bg-card)", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 15 }}>新建集蛋排班</div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
              {/* C1: 调试信息仅开发环境显示 */}
              {process.env.NODE_ENV !== "production" && debugInfo && (
                <div style={{ fontSize: 11, background: "#1e293b", color: "#94a3b8", padding: "6px 10px", borderRadius: 6, fontFamily: "monospace", wordBreak: "break-all" }}>
                  🔍 {debugInfo}
                </div>
              )}
              <div>
                <label className={s.fieldLabel}>指派鸡舍</label>
                <select className={s.inp} value={newShift.farmHouse} onChange={e => setNewShift(p => ({ ...p, farmHouse: e.target.value }))}>
                  <option value="">选择目标生产栋舍</option>
                  {houses.map(h => <option key={h.code} value={h.code}>{h.label}</option>)}
                </select>
              </div>
              <div>
                <label className={s.fieldLabel}>班次时间</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  {shiftOptions.length === 0 ? <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>班次字典加载中...</span>
                    : shiftOptions.map(opt => (
                      <label key={opt.code} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
                        {/* B2: 存 code（与 egg-terminal 对齐），label 仅用于显示 */}
                        <input type="radio" name="shiftTime" value={opt.code} checked={newShift.shift === opt.code}
                          onChange={e => setNewShift(p => ({ ...p, shift: e.target.value }))} />
                        {opt.label}
                      </label>
                    ))}
                </div>
              </div>
              <div>
                <label className={s.fieldLabel}>责任班长/负责人</label>
                <select className={s.inp} value={newShift.leader} onChange={e => setNewShift(p => ({ ...p, leader: e.target.value }))}>
                  <option value="">-- 选择负责人 --</option>
                  {operators.map(op => <option key={op.username} value={op.username}>{op.real_name_zh}{op.role_name_zh ? ` (${op.role_name_zh})` : ""}</option>)}
                </select>
                {newShift.leader && <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}>👤 已关联系统账号：{newShift.leader}</div>}
              </div>
              {errMsg && <div style={{ color: "var(--status-danger)", fontSize: 13 }}>❌ {errMsg}</div>}
            </div>
            <div style={{ padding: 24, borderTop: "1px solid var(--border)", display: "flex", gap: 12 }}>
              <button className={s.btnGhost} style={{ flex: 1 }} onClick={() => setShowDrawer(false)}>取消</button>
              <button className={s.btnPrimaryGrad} style={{ flex: 2 }} onClick={handleSaveShift} disabled={saving}>
                {saving ? "保存中..." : "确认并生成班次"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}