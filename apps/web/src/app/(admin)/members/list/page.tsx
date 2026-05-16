"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, RefreshCw, Users, Star, Gift } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";

// V3 表: crm_members
// 字段: id, member_no, member_name, phone, gender, birthday, level(SILVER/GOLD/PLATINUM),
//        points, total_spent, store_code, status(ACTIVE/INACTIVE), created_at, updated_at

const STATUS_CLS: Record<string,string>   = { ACTIVE:"badgeSuccess",INACTIVE:"badgeNeutral" };

interface Member {
  id:number; member_no:string; member_name:string; phone?:string;
  gender?:string; birthday?:string; level:string; points?:number;
  total_spent?:number; store_code?:string; status:string; created_at?:string; updated_at?:string;
}
interface Form {
  member_no:string; member_name:string; phone:string; gender:string;
  birthday:string; level:string; store_code:string;
}
const DEF: Form = {
  member_no:"", member_name:"", phone:"", gender:"female",
  birthday:"", level:"SILVER", store_code:"ALL",
};

export default function MemberListPage() {
  const { t } = useLanguage();
  const toast = useToast();

  const LEVEL_STYLE: Record<string,{color:string;bg:string;label:string}> = {
    SILVER:   { color:"#64748b",bg:"#f1f5f9",  label:t('ui.白银会员', '白银会员') },
    GOLD:     { color:"#f59e0b",bg:"#fef3c7",  label:t('ui.黄金会员', '黄金会员') },
    PLATINUM: { color:"#7c3aed",bg:"#ede9fe",  label:t('ui.铂金会员', '铂金会员') },
  };
  const STATUS_LABEL: Record<string,string> = { ACTIVE:t('status.active', '活跃'), INACTIVE:t('ui.停用', '停用') };

  const [list, setList]       = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [levelF, setLevelF]   = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing]       = useState<Member|null>(null);
  const [form, setForm]             = useState<Form>(DEF);
  const [saving, setSaving]         = useState(false);

  const token = typeof window!=="undefined"?(sessionStorage.getItem("phoenix_token")||localStorage.getItem("phoenix_token")||""):"";
  const hdr = { Authorization:`Bearer ${token}`,"Content-Type":"application/json" };

  const load = useCallback(()=>{
    setLoading(true);
    fetch("/api/crud/crm_members?limit=300")
      .then(r=>r.json()).then(d=>setList(d.data||[])).catch(()=>{}).finally(()=>setLoading(false));
  },[]);
  useEffect(()=>{ load(); },[load]);

  const filtered = useMemo(()=>list.filter(m=>
    (!search||(m.member_name||"").includes(search)||(m.member_no||"").includes(search)||(m.phone||"").includes(search)) &&
    (!levelF||m.level===levelF)
  ),[list,search,levelF]);

  const totalPoints   = list.reduce((s,m)=>s+(Number(m.points)||0),0);
  const totalSpent    = list.reduce((s,m)=>s+(Number(m.total_spent)||0),0);
  const platinumCnt   = list.filter(m=>m.level==="PLATINUM").length;
  const activeCnt     = list.filter(m=>m.status==="ACTIVE").length;

  function openNew() {
    setEditing(null);
    setForm({ ...DEF, member_no:`MBR-${Date.now().toString().slice(-8)}` });
    setDrawerOpen(true);
  }
  function openEdit(row:Member) {
    setEditing(row);
    setForm({
      member_no:row.member_no, member_name:row.member_name, phone:row.phone||"",
      gender:row.gender||"female", birthday:row.birthday?.slice(0,10)||"",
      level:row.level||"SILVER", store_code:row.store_code||"ALL",
    });
    setDrawerOpen(true);
  }
  const save = async ()=>{
    if (!form.member_name||!form.phone){ toast.error(t('ui.姓名和手机号为必填项', '姓名和手机号为必填项')); return; }
    setSaving(true);
    try {
      if (editing?.id) {
        await fetch(`/api/crud/crm_members/${editing.id}`,{ method:"PUT",headers:hdr,body:JSON.stringify(form) });
        toast.success(t('ui.会员信息已更新', '会员信息已更新'));
      } else {
        await fetch("/api/crud/crm_members",{ method:"POST",headers:hdr,body:JSON.stringify({ ...form,points:0,total_spent:0,status:"ACTIVE" }) });
        toast.success(t('ui.会员已新增', '会员已新增'));
      }
      setDrawerOpen(false); setEditing(null); load();
    } catch { toast.error(t('ui.操作失败', '操作失败')); } finally { setSaving(false); }
  };
  const upgradeLevel = async (row:Member)=>{
    const levels = ["SILVER","GOLD","PLATINUM"];
    const cur = levels.indexOf(row.level||"SILVER");
    if (cur>=levels.length-1){ toast.error(t('ui.已是最高等级', '已是最高等级')); return; }
    await fetch(`/api/crud/crm_members/${row.id}`,{ method:"PUT",headers:hdr,body:JSON.stringify({ level:levels[cur+1] }) });
    toast.success(`${t('ui.已升级为', '已升级为')}${LEVEL_STYLE[levels[cur+1]]?.label}`); load();
  };
  const setF = (k:keyof Form,v:string)=>setForm(p=>({...p,[k]:v}));
  const inp = { padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" } as React.CSSProperties;

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('ui.会员列表', '会员列表')} subtitle={t('ui.CRM会员档案积分等级消费记录', 'CRM 会员档案·积分·等级·消费记录')} breadcrumb={[t('ui.会员管理', '会员管理'), t('ui.会员列表', '会员列表')]}
        actions={
          <div style={{ display:"flex",gap:8 }}>
            <button type="button" className={s.btnSecondary} onClick={load} disabled={loading} style={{ display:"flex",alignItems:"center",gap:6 }}><RefreshCw size={14}/> {t('common.refresh', '刷新')}</button>
            <button type="button" className={s.btnPrimary} onClick={openNew} style={{ display:"flex",alignItems:"center",gap:6 }}><Plus size={14}/> {t('ui.新增会员', '新增会员')}</button>
          </div>
        }/>

      {/* KPI */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:16 }}>
        {[
          { label:t('ui.会员总数', '会员总数'),   value:list.length,                          accent:"var(--color-primary)",icon:<Users size={15}/> },
          { label:t('ui.活跃会员', '活跃会员'),   value:activeCnt,                            accent:"#10b981",             icon:<Users size={15}/> },
          { label:t('ui.铂金会员', '铂金会员'),   value:platinumCnt,                          accent:"#7c3aed",             icon:<Star size={15}/> },
          { label:t('ui.积分总量', '积分总量'),   value:totalPoints.toLocaleString(),          accent:"#f59e0b",             icon:<Gift size={15}/> },
          { label:t('ui.累计消费额', '累计消费额'), value:`¥${totalSpent.toLocaleString()}`,    accent:"#3b82f6",             icon:<Star size={15}/> },
        ].map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`3px solid ${k.accent}`,borderRadius:"var(--radius-md)",padding:"10px 14px" }}>
            <div style={{ display:"flex",alignItems:"center",gap:4,fontSize:11,color:k.accent,fontWeight:700,marginBottom:4 }}>{k.icon}{k.label}</div>
            <div style={{ fontSize:16,fontWeight:800,color:k.accent }}>{String(k.value)}</div>
          </div>
        ))}
      </div>

      {/* 过滤 */}
      <div style={{ display:"flex",gap:10,marginBottom:14 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('ui.搜索姓名会员号手机号', '搜索姓名 / 会员号 / 手机号…')}
          style={{ flex:1,...inp,padding:"9px 14px" }}/>
        <select value={levelF} onChange={e=>setLevelF(e.target.value)} style={{ ...inp,width:140 }}>
          <option value="">{t('ui.全部等级', '全部等级')}</option>
          {Object.entries(LEVEL_STYLE).map(([v,l])=><option key={v} value={v}>{l.label}</option>)}
        </select>
      </div>

      {/* 表格 */}
      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"auto" }}>
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--bg-page)",borderBottom:"1px solid var(--border)" }}>
              {[t('ui.会员号', '会员号'), t('ui.姓名', '姓名'), t('ui.手机号', '手机号'), t('ui.性别', '性别'), t('ui.生日', '生日'), t('ui.等级', '等级'), t('ui.积分', '积分'), t('ui.累计消费', '累计消费'), t('common.status', '状态'), t('common.operation', '操作')].map(h=>(
                <th key={h} style={{ padding:"9px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--text-secondary)",whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={10} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t('common.loading', '加载中…')}</td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={10} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t('common.no_data', '暂无会员记录')}</td></tr>}
            {!loading&&filtered.map((row,i)=>{
              const lv  = LEVEL_STYLE[row.level||"SILVER"]||LEVEL_STYLE.SILVER;
              const st  = row.status?.toUpperCase()||"ACTIVE";
              const canUp = row.level!=="PLATINUM";
              return (
                <tr key={row.id} style={{ borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg-card)":"var(--bg-page)" }}>
                  <td style={{ padding:"9px 12px",fontFamily:"monospace",fontSize:11,color:"var(--text-secondary)" }}>{row.member_no}</td>
                  <td style={{ padding:"9px 12px",fontWeight:700 }}>
                    <button type="button" onClick={()=>openEdit(row)} style={{ background:"none",border:"none",color:"var(--color-primary)",cursor:"pointer",fontWeight:700,fontSize:13,padding:0 }}>{row.member_name}</button>
                  </td>
                  <td style={{ padding:"9px 12px",fontFamily:"monospace",fontSize:12 }}>{row.phone||"—"}</td>
                  <td style={{ padding:"9px 12px" }}>{row.gender==="male"?t('ui.男', '男'):t('ui.女', '女')}</td>
                  <td style={{ padding:"9px 12px",fontSize:11 }}>{row.birthday?.slice(0,10)||"—"}</td>
                  <td style={{ padding:"9px 12px" }}>
                    <span style={{ fontWeight:700,fontSize:11,color:lv.color,background:lv.bg,borderRadius:6,padding:"3px 8px" }}>{lv.label}</span>
                  </td>
                  <td style={{ padding:"9px 12px",fontWeight:700,color:"#f59e0b" }}>{Number(row.points||0).toLocaleString()}</td>
                  <td style={{ padding:"9px 12px",color:"var(--color-primary)" }}>¥{Number(row.total_spent||0).toLocaleString()}</td>
                  <td style={{ padding:"9px 12px" }}><span className={`${s.badge} ${s[STATUS_CLS[st]||'badgeNeutral']}`}>{STATUS_LABEL[st]||st}</span></td>
                  <td style={{ padding:"9px 12px",display:"flex",gap:5,flexWrap:"wrap" }}>
                    <button className={s.btnSecondary} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>openEdit(row)}>{t('common.edit', '编辑')}</button>
                    {canUp&&<button className={s.btnSuccess} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>upgradeLevel(row)}>{t('ui.升级', '升级')}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <RightDrawer open={drawerOpen} title={editing?t('ui.编辑会员', '编辑会员'):t('ui.新增会员', '新增会员')} onClose={()=>{ setDrawerOpen(false); setEditing(null); }}>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t('ui.会员号自动', '会员号（自动）')}</label>
              <input value={form.member_no} readOnly style={{ ...inp,background:"var(--bg-page)",color:"var(--text-secondary)",fontFamily:"monospace",fontSize:12 }}/>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t('ui.等级', '等级')}</label>
              <select value={form.level} onChange={e=>setF("level",e.target.value)} style={{ ...inp }}>
                {Object.entries(LEVEL_STYLE).map(([v,l])=><option key={v} value={v}>{l.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t('ui.姓名', '姓名')} <span className={s.textDanger}>*</span></label>
            <input value={form.member_name} onChange={e=>setF("member_name",e.target.value)} style={{ ...inp }}/>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t('ui.手机号', '手机号')} <span className={s.textDanger}>*</span></label>
              <input type="tel" value={form.phone} onChange={e=>setF("phone",e.target.value)} style={{ ...inp }}/>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t('ui.性别', '性别')}</label>
              <select value={form.gender} onChange={e=>setF("gender",e.target.value)} style={{ ...inp }}>
                <option value="female">{t('ui.女', '女')}</option><option value="male">{t('ui.男', '男')}</option>
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t('ui.生日', '生日')}</label>
            <input type="date" value={form.birthday} onChange={e=>setF("birthday",e.target.value)} style={{ ...inp }}/>
          </div>
          <div style={{ display:"flex",gap:10,paddingTop:8 }}>
            <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>{ setDrawerOpen(false); setEditing(null); }}>{t('common.cancel', '取消')}</button>
            <button type="button" className={s.btnPrimary} style={{ flex:2 }} disabled={saving} onClick={save}>{saving?t('ui.保存中', '保存中…'):t('ui.保存会员', '保存会员')}</button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}
