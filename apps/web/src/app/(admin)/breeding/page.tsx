"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Home, Layers, Users, BookOpen, ClipboardList,
  Droplets, AlertTriangle, BarChart2, Edit2, Trash2, Wifi, ArrowUpRight, Plus
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useDialog } from "@/contexts/DialogContext";
import styles from "@/components/ui/admin-ui.module.css";

const API = "";

async function apiFetch(path: string) {
  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "")
    : "";
  const r = await fetch(`${API}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) return null;
  return r.json();
}

const PROVINCES = [
  "万象直辖市VientianePref","万象省VientianeProv","琅勃拉邦省LuangPrabang",
  "沙湾拿吉省Savannakhet","占巴塞省Champasak","波乔省Bokeo",
  "南塔省LuangNamtha","乌多姆赛省Oudomxay","甘蒙省Khammouane",
  "赛宋奔省Xaysomboun","云南省中国特区",
];

const SUB_NAV = [
  { label:"养殖场总览", path:"/breeding", active:true, icon:<Home size={16}/> },
  { label:"鸡舍管理",   path:"/breeding/henhouse",  icon:<Layers size={16}/> },
  { label:"鸡群档案",   path:"/breeding/flock",     icon:<Users size={16}/> },
  { label:"日生产日报", path:"/breeding/daily",     icon:<ClipboardList size={16}/> },
  { label:"免疫计划",   path:"/breeding/immune",    icon:<BookOpen size={16}/> },
  { label:"用药记录",   path:"/breeding/medicine",  icon:<Droplets size={16}/> },
  { label:"停药期预警", path:"/breeding/medicine",   icon:<AlertTriangle size={16}/> },
  // { label:"养殖分析", path:"/breeding/analysis", icon:<BarChart2 size={16}/> }, // TODO: 功能待开发
];

interface Farm {
  id: string; name: string; location: string;
  houses: number; totalBirds: number; layingRate: string | number;
  status: "normal" | "warning";
}
interface AlertItem { id: string; type: string; label: string; msg: string; time: string; }
interface FarmEnv { temp: string|null; hum: string|null; co2: number|null; }
interface FormState { name: string; location: string; houses: string; capacity: string; }
interface DeviceStats { openAlerts: number; offlineDevices: number; }
interface WeekSummary { eggs: number; mortality: number; feedRatio: string|number; immuneDone: number; immuneTotal: number; }

export default function BreedingPage() {
  const router = useRouter();
  const toast = useToast();
  const dialog = useDialog();

  const [farms,       setFarms]       = useState<Farm[]>([]);
  const [alerts,      setAlerts]      = useState<AlertItem[]>([]);
  const [weekSummary, setWeekSummary] = useState<WeekSummary>({ eggs:0, mortality:0, feedRatio:0, immuneDone:0, immuneTotal:0 });
  const [todayEggs,   setTodayEggs]   = useState(0);
  const [todayDeaths, setTodayDeaths] = useState(0);
  const [deviceStats, setDeviceStats] = useState<DeviceStats>({ openAlerts:0, offlineDevices:0 });
  const [farmEnvMap,  setFarmEnvMap]  = useState<Record<string,FarmEnv>>({});
  const [drawerOpen,  setDrawerOpen]  = useState(false);
  const [editId,      setEditId]      = useState<string|null>(null);
  const [saving,      setSaving]      = useState(false);
  const [form,        setForm]        = useState<FormState>({ name:"", location:"", houses:"", capacity:"" });

  const loadData = async () => {
    const today   = new Date().toISOString().slice(0,10);
    const weekAgo = new Date(Date.now()-7*86400000).toISOString().slice(0,10);
    const ydStr   = new Date(Date.now()-86400000).toISOString().slice(0,10);

    const [farmsRaw, flocksRaw, logsRaw, medsRaw, immuneRaw] = await Promise.all([
      apiFetch("/api/crud/brd_farms"),
      apiFetch("/api/crud/brd_flocks"),
      apiFetch("/api/crud/brd_daily_logs"),
      apiFetch("/api/crud/brd_medications"),
      apiFetch("/api/crud/brd_vaccinations"),
    ]);

    const farmsData  = farmsRaw?.data   || farmsRaw  || [];
    const flocks     = flocksRaw?.data  || flocksRaw || [];
    const logs       = logsRaw?.data    || logsRaw   || [];
    const meds       = medsRaw?.data    || medsRaw   || [];
    const immune     = immuneRaw?.data  || immuneRaw || [];

    const flockFarmMap: Record<string,string> = {};
    const flockQtyMap:  Record<string,number> = {};
    flocks.forEach((fk: Record<string,unknown>) => {
      if (fk.flock_no) {
        flockFarmMap[fk.flock_no as string] = fk.farm_code as string;
        flockQtyMap[fk.flock_no  as string] = Number(fk.current_qty) || 0;
      }
    });

    const todayLogs = logs.filter((l: Record<string,unknown>) => l.log_date === today);
    setTodayEggs(  todayLogs.reduce((s: number, l: Record<string,unknown>) => s + (Number(l.eggs_produced)||0), 0));
    setTodayDeaths(todayLogs.reduce((s: number, l: Record<string,unknown>) => s + (Number(l.mortality_qty)||0), 0));

    const weekLogs = logs.filter((l: Record<string,unknown>) => (l.log_date as string) >= weekAgo);
    const wEggs  = weekLogs.reduce((s: number, l: Record<string,unknown>) => s+(Number(l.eggs_produced)||0),0);
    const wDeath = weekLogs.reduce((s: number, l: Record<string,unknown>) => s+(Number(l.mortality_qty)||0),0);
    const wFeed  = weekLogs.reduce((s: number, l: Record<string,unknown>) => s+(Number(l.feed_consumed)||0),0);
    // P0-1 fix: brd_vaccinations 用 actual_date 表示已执行
    const immuneDone  = immune.filter((i: Record<string,unknown>) => i.actual_date && (i.plan_date as string)>=weekAgo).length;
    const immuneTotal = immune.filter((i: Record<string,unknown>) => (i.plan_date as string)>=weekAgo).length;
    setWeekSummary({ eggs:wEggs, mortality:wDeath, feedRatio:wEggs>0?(wFeed/wEggs*1000).toFixed(2):"—", immuneDone, immuneTotal });

    const latestDate = logs.reduce((mx: string, l: Record<string,unknown>) => (l.log_date as string)>mx?(l.log_date as string):mx, "");
    const recentLogs = logs.filter((l: Record<string,unknown>) => l.log_date===latestDate);
    const farmEggMap: Record<string,number> = {};
    const farmCapMap: Record<string,number> = {};
    recentLogs.forEach((l: Record<string,unknown>) => {
      const fc = flockFarmMap[l.flock_no as string]; if(!fc) return;
      farmEggMap[fc]=(farmEggMap[fc]||0)+(Number(l.eggs_produced)||0);
      farmCapMap[fc]=(farmCapMap[fc]||0)+(flockQtyMap[l.flock_no as string]||0);
    });

      const mapped: Farm[] = farmsData.map((d: Record<string, unknown>) => {
        const fc = d.farm_code as string;
        const qty = farmCapMap[fc] || 0;
        const eggs = farmEggMap[fc] || 0;
        const rate = qty > 0 ? (eggs / qty * 100).toFixed(1) : "—";
        // ✅ DB 列名是 location 和 capacity
        const location = (d.location as string) || "—";
        return {
          id: fc,
          name: (d.farm_name || d.name || fc) as string,
          location,
          houses: Number(d.houses) || 0,
          // C2: 显示实际在栏（farmCapMap 已是按 flock.current_qty 汇总到 farm_code），
          //     之前用 d.capacity 是设计容量而非存栏，KPI 误导
          totalBirds: qty || Number(d.capacity) || 0,
          layingRate: rate,
          status: (qty > 0 && Number(rate) < 88) || d.status === "WARNING" ? "warning" : "normal",
        };
      });
    setFarms(mapped);

    // Build alerts
    const alertList: AlertItem[] = [];
    const todayTs = new Date(today);
    meds.forEach((m: Record<string,unknown>) => {
      const endDate = new Date((m.clear_date || m.end_date || m.withdrawDate) as string);
      const daysLeft = Math.ceil((endDate.getTime()-todayTs.getTime())/86400000);
      if(daysLeft>=0&&daysLeft<=5)
        alertList.push({ id:"wd-"+m.id, type:daysLeft<=2?"danger":"warning", label:"停药期预警",
          msg:`${m.farm_house||m.house_code||"鸡舍"} ${m.medicine||m.drug_name||"药物"} 停药期还剩 ${daysLeft} 天`, time:"系统" });
    });
    const ydLogs = logs.filter((l: Record<string,unknown>) => l.log_date===ydStr);
    const ydMap: Record<string,{eggs:number;cap:number}> = {};
    ydLogs.forEach((l: Record<string,unknown>) => {
      const fc=flockFarmMap[l.flock_no as string]; if(!fc) return;
      if(!ydMap[fc]) ydMap[fc]={eggs:0,cap:0};
      ydMap[fc].eggs+=Number(l.eggs_produced)||0;
      ydMap[fc].cap +=flockQtyMap[l.flock_no as string]||0;
    });
    mapped.forEach(farm => {
      const todayR=farmEggMap[farm.id]&&farmCapMap[farm.id]?farmEggMap[farm.id]/farmCapMap[farm.id]*100:null;
      const ydD=ydMap[farm.id];
      const ydR=ydD&&ydD.cap>0?ydD.eggs/ydD.cap*100:null;
      if(todayR!==null&&ydR!==null&&(ydR-todayR)>2)
        alertList.push({ id:"lr-"+farm.id, type:"warning", label:"产蛋率下降",
          msg:`${farm.name} 产蛋率较昨日下降 ${(ydR-todayR).toFixed(1)}%`, time:"实时" });
    });
    // P0-1 fix: brd_vaccinations 无 actual_date = 待执行
    immune.filter((i: Record<string,unknown>)=>i.plan_date===today&&!i.actual_date).forEach((i: Record<string,unknown>)=>{
      alertList.push({ id:"im-"+i.id, type:"info", label:"免疫计划",
        msg:`${i.farm_house||i.house_code||i.flock_no||"鸡群"} 今日应执行 ${i.vaccine||i.vaccine_name||"疫苗"} 免疫`, time:"计划" });
    });
    if(alertList.length===0&&logs.length>0)
      alertList.push({ id:"ok", type:"info", label:"系统正常", msg:"当前无待处理预警事项", time:"实时" });
    setAlerts(alertList.slice(0,6));

    // Device stats
    const token = sessionStorage.getItem("phoenix_token")||localStorage.getItem("phoenix_token")||"";
    const hdr = { Authorization:`Bearer ${token}` };
    Promise.all([
      fetch("/api/farm-device/alerts?status=OPEN",    {headers:hdr}).then(r=>r.ok?r.json():[]).catch(()=>[]),
      fetch("/api/farm-device/devices/offline",       {headers:hdr}).then(r=>r.ok?r.json():[]).catch(()=>[]),
      fetch("/api/farm-device/cabins/all-summary",    {headers:hdr}).then(r=>r.ok?r.json():{data:{houses:[]}}).catch(()=>({data:{houses:[]}})),
    ]).then(([al,off,sumData])=>{
      setDeviceStats({ openAlerts:Array.isArray(al)?al.length:0, offlineDevices:Array.isArray(off)?off.length:0 });
      const houses = sumData?.data?.houses||[];
      const envMap: Record<string,{temps:number[];hums:number[];co2s:number[]}> = {};
      houses.forEach((h: Record<string,unknown>)=>{
        if(!h.farmCode||!h.hasData) return;
        const fc=h.farmCode as string;
        if(!envMap[fc]) envMap[fc]={temps:[],hums:[],co2s:[]};
        if(h.avgTemp!=null)     envMap[fc].temps.push(h.avgTemp as number);
        if(h.avgHumidity!=null) envMap[fc].hums.push(h.avgHumidity as number);
        if(h.co2!=null)         envMap[fc].co2s.push(h.co2 as number);
      });
      const final: Record<string,FarmEnv> = {};
      Object.keys(envMap).forEach(fc=>{
        const {temps,hums,co2s}=envMap[fc];
        final[fc]={
          temp: temps.length?(temps.reduce((a,b)=>a+b,0)/temps.length).toFixed(1):null,
          hum:  hums.length ?(hums.reduce((a,b)=>a+b,0)/hums.length).toFixed(1):null,
          co2:  co2s.length ?Math.round(co2s.reduce((a,b)=>a+b,0)/co2s.length):null,
        };
      });
      setFarmEnvMap(final);
    });
  };

  useEffect(()=>{ loadData(); },[]);

  const openCreate = () => { setEditId(null); setForm({name:"",location:"",houses:"",capacity:""}); setDrawerOpen(true); };
  const openEdit = (e: React.MouseEvent, farm: Farm) => {
    e.stopPropagation();
    setEditId(farm.id);
    setForm({
      name:     farm.name,
      location: farm.location,
      houses:   String(farm.houses),
      capacity: String(farm.totalBirds),
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
      const hdrAuth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    // ✅ 字段与 DB 实际列名对齐: location, capacity（max_capacity 已于 2026-05-10 删除）
      const payload = {
        farm_name: form.name,
        location:  form.location,
        houses:    parseInt(form.houses)   || 0,  // 规划栋数（auto-repair 会自动建列）
        capacity:  parseInt(form.capacity) || 0,
        status:    "ACTIVE",
      };
      if (editId) {
        const res = await fetch(`/api/crud/brd_farms/${editId}`, {
          method: "PUT", headers: hdrAuth, body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.success("养殖场档案已更新！");
      } else {
        const farmCode = "F" + Date.now().toString().slice(-6).padStart(6, "0");
        const res = await fetch("/api/crud/brd_farms", {
          method: "POST", headers: hdrAuth, body: JSON.stringify({ ...payload, farm_code: farmCode }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.success("新建养殖场档案成功！");
      }
      setDrawerOpen(false);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败，请检查登录状态");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, farm: Farm) => {
    e.stopPropagation();
    const token = sessionStorage.getItem("phoenix_token")||localStorage.getItem("phoenix_token")||"";

    // A5: 删除前先检查是否还有子鸡舍 — 直接删 brd_farms 会留下孤儿 brd_houses/brd_flocks/brd_daily_logs
    try {
      const childRes = await fetch(`/api/crud/brd_houses?farm_code=${encodeURIComponent(farm.id)}&limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const childJson = await childRes.json().catch(() => null);
      const childRows = (childJson?.data ?? childJson ?? []) as unknown[];
      if (Array.isArray(childRows) && childRows.length > 0) {
        await dialog.showAlert({
          title: "无法删除",
          message: `养殖场「${farm.name}」下仍有鸡舍存在，请先解散所有鸡舍后再删除场区`,
          type: "warning",
          icon: "🚫",
        });
        return;
      }
    } catch {
      // 子表查询失败不阻塞主流程，但用户应被告知
      console.warn("[handleDelete] child-check 查询失败，继续删除可能产生孤儿数据");
    }

    const ok = await dialog.showConfirm({ title:"确认解散", message:`确认拆除空管区：${farm.name} 吗？`, type:"danger", confirmLabel:"确认解散" });
    if(!ok) return;
    try {
      const res = await fetch(`/api/crud/brd_farms/${farm.id}`, {method:"DELETE", headers:{Authorization:`Bearer ${token}`}});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("养殖场已删除");
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const totalBirds = farms.reduce((s,f)=>s+(Number(f.totalBirds)||0),0);
  const withdrawalCount = alerts.filter(a=>a.label==="停药期预警").length;
  const immuneCount     = alerts.filter(a=>a.label==="免疫计划").length;

  const statusColor = (type: string) => ({ danger:"#dc2626", warning:"#f59e0b", info:"#3b82f6", success:"#22c55e" }[type]||"#94a3b8");

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="养殖生产中心"
        subtitle="实时监控所有养殖场运营状态"
        breadcrumb={["总部门户","养殖生产中心"]}
        actions={
          <button type="button" onClick={openCreate} className={styles.btnPrimary}>
            <Plus size={14}/> 新增养殖场
          </button>
        }
      />

      {/* Sub-nav pills */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:24 }}>
        {SUB_NAV.map(item => (
          // key 用 label：两个 tab 都指向 /breeding/medicine（用药记录 / 停药期预警，同页内 anchor 切换），不能用 path 当 key
          <button key={item.label} onClick={()=>router.push(item.path)}
            className={item.active ? styles.btnPrimary : styles.btnSecondary}
            style={{ display:"flex", alignItems:"center", gap:6 }}>
            {item.icon}{item.label}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:16, marginBottom:24 }}>
        {[
          { title:"存栏总数",   value:totalBirds.toLocaleString(),    unit:"羽",  accent:"var(--color-primary)",  icon:<Users size={22}/> },
          { title:"今日产蛋",   value:todayEggs.toLocaleString(),     unit:"枚",  accent:"#f59e0b",               icon:<Home size={22}/> },
          { title:"有效养殖场", value:String(farms.length),           unit:"个",  accent:"var(--status-success,#22c55e)", icon:<BarChart2 size={22}/> },
          { title:"今日死淘",   value:todayDeaths.toLocaleString(),   unit:"羽",  accent:"#dc2626",               icon:<AlertTriangle size={22}/> },
          { title:"停药期预警", value:String(withdrawalCount),        unit:"批",  accent:"#7c3aed",               icon:<Droplets size={22}/> },
          { title:"今日免疫任务",value:String(immuneCount),           unit:"项",  accent:"#059669",               icon:<ClipboardList size={22}/> },
        ].map(c=>(
          <div key={c.title} style={{ background:"var(--bg-card)", borderRadius:"var(--radius-lg)", padding:20,
            boxShadow:"var(--shadow-sm)", border:"1px solid var(--border)", borderLeft:`4px solid ${c.accent}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <p style={{ fontSize:13, color:"var(--text-secondary)", fontWeight:500, marginBottom:12 }}>{c.title}</p>
              <div style={{ width:44, height:44, borderRadius:"var(--radius-md)", display:"flex", alignItems:"center",
                justifyContent:"center", background:`color-mix(in srgb,${c.accent} 12%,transparent)`, color:c.accent }}>
                {c.icon}
              </div>
            </div>
            <div style={{ fontSize:28, fontWeight:700, lineHeight:1, color:c.accent }}>{c.value}
              <span style={{ fontSize:14, fontWeight:500, marginLeft:4, color:"var(--text-secondary)" }}>{c.unit}</span>
            </div>
          </div>
        ))}

        {/* 环境设备卡 */}
        <div style={{ background:"var(--bg-card)", borderRadius:"var(--radius-lg)", padding:20,
          boxShadow:"var(--shadow-sm)", border:"1px solid var(--border)", borderLeft:"4px solid #0891b2", position:"relative" }}>
          <button onClick={()=>router.push("/breeding/device-alerts")}
            title="进入环境预警中心"
            style={{ position:"absolute", top:12, right:12, background:"none", border:"none",
              cursor:"pointer", color:"var(--text-secondary)", padding:4, borderRadius:4 }}>
            <ArrowUpRight size={15}/>
          </button>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <p style={{ fontSize:13, color:"var(--text-secondary)", fontWeight:500, marginBottom:12 }}>环境设备</p>
              <div style={{ display:"flex", gap:20 }}>
                <div>
                  <div style={{ fontSize:28, fontWeight:700, lineHeight:1,
                    color: deviceStats.openAlerts>0?"#ea580c":"var(--text-primary)" }}>{deviceStats.openAlerts}</div>
                  <div style={{ fontSize:12, color:"var(--text-secondary)", marginTop:4 }}>未处理告警</div>
                </div>
                <div>
                  <div style={{ fontSize:28, fontWeight:700, lineHeight:1,
                    color: deviceStats.offlineDevices>0?"#dc2626":"var(--text-primary)" }}>{deviceStats.offlineDevices}</div>
                  <div style={{ fontSize:12, color:"var(--text-secondary)", marginTop:4 }}>离线设备</div>
                </div>
              </div>
            </div>
            <div style={{ width:48, height:48, borderRadius:"var(--radius-md)", display:"flex", alignItems:"center",
              justifyContent:"center", background:"color-mix(in srgb,#0891b2 12%,transparent)", color:"#0891b2", flexShrink:0 }}>
              <Wifi size={22}/>
            </div>
          </div>
        </div>
      </div>

      {/* Main content: farm list + alerts */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:20 }}>
        {/* Farm list */}
        <div>
          <h3 style={{ fontSize:15, fontWeight:700, marginBottom:12, color:"var(--color-primary)" }}>养殖场一览</h3>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {farms.length===0 && (
              <div style={{ padding:"32px", textAlign:"center", color:"var(--text-secondary)", background:"var(--bg-card)",
                border:"1px solid var(--border)", borderRadius:"var(--radius-lg)" }}>
                暂无养殖场数据，点击右上角「新增养殖场」开始
              </div>
            )}
            {farms.map(farm => (
              // ✅ 修复：移除整行硬编码跳转 /breeding/flock，改为仅显示卡片（编辑/删除通过按钮操作）
              <div key={farm.id}
                style={{ background: "var(--bg-card)", borderRadius: "var(--radius-lg)", padding: "18px 20px",
                  border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 16,
                  transition: "border-color 0.15s,box-shadow 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--color-primary)"; (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}>
                <div style={{ width:48, height:48, borderRadius:"var(--radius-md)", flexShrink:0,
                  background: farm.status==="warning"?"#fef2f2":"#eff6ff",
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>🐔</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                    <span style={{ fontWeight:700, fontSize:15, color:"var(--text-primary)" }}>{farm.name}</span>
                    <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:12,
                      background: farm.status==="warning"?"#fef2f2":"#f0fdf4",
                      color: farm.status==="warning"?"#dc2626":"#16a34a",
                      border:`1px solid ${farm.status==="warning"?"#fca5a5":"#86efac"}` }}>
                      {farm.status==="warning"?"需关注":"正常"}
                    </span>
                  </div>
                  <div style={{ fontSize:12, color:"var(--text-secondary)" }}>
                    {farm.location} · {farm.houses}栋鸡舍 · 存栏 {Number(farm.totalBirds).toLocaleString()} 羽
                  </div>
                  {farmEnvMap[farm.id]&&(farmEnvMap[farm.id].temp!=null||farmEnvMap[farm.id].hum!=null)&&(
                    <div style={{ display:"flex", gap:8, marginTop:8, fontSize:11, fontWeight:600 }}>
                      {farmEnvMap[farm.id].temp!=null&&<span style={{ background:"#fffbeb", padding:"3px 8px", borderRadius:12, color:"#d97706", border:"1px solid #fde68a" }}>🌡️ {farmEnvMap[farm.id].temp}℃</span>}
                      {farmEnvMap[farm.id].hum!=null &&<span style={{ background:"#f0fdf4", padding:"3px 8px", borderRadius:12, color:"#16a34a", border:"1px solid #86efac" }}>💧 {farmEnvMap[farm.id].hum}%</span>}
                      {farmEnvMap[farm.id].co2!=null &&<span style={{ background:"var(--bg-page)", padding:"3px 8px", borderRadius:12, color:"var(--text-secondary)", border:"1px solid var(--border)" }}>☁️ {farmEnvMap[farm.id].co2} ppm</span>}
                    </div>
                  )}
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:22, fontWeight:700, color: typeof farm.layingRate === "string" && isNaN(Number(farm.layingRate)) ? "var(--text-secondary)" : Number(farm.layingRate)<88?"#dc2626":"#16a34a" }}>
                    {farm.layingRate}%
                  </div>
                  <div style={{ fontSize:11, color:"var(--text-secondary)" }}>产蛋率</div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:6, flexShrink:0, marginLeft:10 }}>
                  <button type="button" onClick={e=>openEdit(e,farm)} className={styles.btnSecondary}
                    style={{ padding:6, display:"flex", alignItems:"center" }}>
                    <Edit2 size={14}/>
                  </button>
                  <button type="button" onClick={e=>handleDelete(e,farm)} className={styles.btnDanger}
                    style={{ padding:6, display:"flex", alignItems:"center" }}>
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts + weekly summary */}
        <div>
          <h3 style={{ fontSize:15, fontWeight:700, marginBottom:12, color:"var(--color-primary)" }}>今日预警任务</h3>
          <div style={{ background:"var(--bg-card)", borderRadius:"var(--radius-lg)", border:"1px solid var(--border)", overflow:"hidden" }}>
            {alerts.map((a,i)=>(
              <div key={a.id} style={{ padding:"14px 16px",
                borderBottom: i<alerts.length-1?"1px solid var(--border)":"none" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:12,
                    background:`color-mix(in srgb,${statusColor(a.type)} 12%,transparent)`,
                    color:statusColor(a.type), border:`1px solid color-mix(in srgb,${statusColor(a.type)} 30%,transparent)` }}>
                    {a.label}
                  </span>
                  <span style={{ fontSize:12, color:"var(--text-secondary)", marginLeft:"auto" }}>{a.time}</span>
                </div>
                <p style={{ fontSize:13, color:"var(--text-primary)", lineHeight:1.5 }}>{a.msg}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop:16, background:"var(--bg-card)", borderRadius:"var(--radius-lg)",
            border:"1px solid var(--border)", padding:16 }}>
            <h4 style={{ fontSize:13, fontWeight:700, marginBottom:12, color:"var(--text-secondary)",
              textTransform:"uppercase", letterSpacing:"0.5px" }}>本周汇总</h4>
            {[
              { label:"累计产蛋", val: weekSummary.eggs>0?weekSummary.eggs.toLocaleString()+" 枚":"—",  color:"var(--color-primary)" },
              { label:"死淘累计", val: weekSummary.mortality>0?weekSummary.mortality.toLocaleString()+" 羽":"0 羽", color:"#dc2626" },
              { label:"料蛋比均", val: String(weekSummary.feedRatio)||"—",                              color:"#16a34a" },
              { label:"完成免疫", val: weekSummary.immuneTotal>0?`${weekSummary.immuneDone} / ${weekSummary.immuneTotal} 项`:"暂无计划", color:"#f59e0b" },
            ].map(item=>(
              <div key={item.label} style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <span style={{ fontSize:13, color:"var(--text-secondary)" }}>{item.label}</span>
                <span style={{ fontSize:13, fontWeight:700, color:item.color }}>{item.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create/Edit Drawer */}
      <RightDrawer open={drawerOpen} title={editId?"编辑养殖场档案":"新增养殖场档案"} onClose={()=>setDrawerOpen(false)}>
        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
          <div>
            <label style={{ display:"block", fontSize:13, fontWeight:600, marginBottom:8 }}>所属大区省份</label>
            <input list="province-list" value={form.location}
              onChange={e=>setForm({...form,location:e.target.value})}
              placeholder="请下拉选择或手工输入任意州省份"
              style={{ width:"100%", padding:"10px 14px", border:"1px solid var(--border)",
                borderRadius:"var(--radius-md)", background:"var(--bg-page)", color:"var(--text-primary)",
                fontSize:14, outline:"none", boxSizing:"border-box" }}/>
            <datalist id="province-list">
              {PROVINCES.map(p=><option key={p} value={p}/>)}
            </datalist>
          </div>
          <div>
            <label style={{ display:"block", fontSize:13, fontWeight:600, marginBottom:8 }}>新场项目代号名称</label>
            <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}
              placeholder="例 凤凰五场"
              style={{ width:"100%", padding:"10px 14px", border:"1px solid var(--border)",
                borderRadius:"var(--radius-md)", background:"var(--bg-page)", color:"var(--text-primary)",
                fontSize:14, outline:"none", boxSizing:"border-box" }}/>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <div>
              <label style={{ display:"block", fontSize:13, fontWeight:600, marginBottom:8 }}>规划栋数</label>
              <input type="number" value={form.houses} onChange={e=>setForm({...form,houses:e.target.value})}
                onFocus={e=>e.target.select()}
                placeholder="0"
                style={{ width:"100%", padding:"10px 14px", border:"1px solid var(--border)",
                  borderRadius:"var(--radius-md)", background:"var(--bg-page)", color:"var(--text-primary)",
                  fontSize:14, outline:"none", boxSizing:"border-box" }}/>
            </div>
            <div>
              <label style={{ display:"block", fontSize:13, fontWeight:600, marginBottom:8 }}>总设计容量（羽）</label>
              <input type="number" value={form.capacity} onChange={e=>setForm({...form,capacity:e.target.value})}
                onFocus={e=>e.target.select()}
                placeholder="0"
                style={{ width:"100%", padding:"10px 14px", border:"1px solid var(--border)",
                  borderRadius:"var(--radius-md)", background:"var(--bg-page)", color:"var(--text-primary)",
                  fontSize:14, outline:"none", boxSizing:"border-box" }}/>
            </div>
          </div>
          <div style={{ marginTop:4, display:"flex", gap:12 }}>
            <button type="button" onClick={()=>setDrawerOpen(false)} className={styles.btnSecondary} style={{ flex:1 }}>
              取消
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className={styles.btnPrimary} style={{ flex:2 }}>
              {saving?"保存中...":(editId?"保存修改":"确认并建档")}
            </button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}

