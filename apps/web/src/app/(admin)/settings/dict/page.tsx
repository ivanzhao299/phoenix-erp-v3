"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import RightDrawer from "@/components/RightDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/contexts/ToastContext";
import { Database, Plus, Edit2, Trash2, Save, ChevronDown, ChevronRight, Search } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

const TYPE_LABEL: Record<string,string> = {
  // 包装
  PKG_ANOMALY_REASON:"包装异常原因", PKG_EGG_GRADE:"鸡蛋等级配置", PKG_PACK_SPEC:"包装规格配置",
  PKG_PRESORT_STANDARD:"预分拣标准", PKG_SHIFT:"包装班次", PKG_CUSTOM_LABEL:"临时标签类型",
  // 审批
  APPROVAL:"审批流程", APR_MODULE_TYPE:"审批模块类型",
  // 养殖
  BREEDING:"养殖管理", BRD_BREED_TYPE:"鸡种类型", BRD_HOUSE_TYPE:"鸡舍类型",
  BRD_FLOCK_STATUS:"鸡群状态", BRD_VACCINE_TYPE:"疫苗种类", BRD_VACCINATE_METHOD:"接种方式",
  // 业务
  BUSINESS:"业务设置", BS_PAYMENT_TERM:"付款条款", BS_CUSTOMER_LEVEL:"客户等级",
  // CRM
  CRM:"客户管理", CRM_MEMBER_LEVEL:"会员等级", CRM_ACTIVITY_TYPE:"营销活动类型",
  CRM_COUPON_LEVEL:"优惠券等级",     // 补充
  CRM_COUPON_TYPE:"优惠券类型",      // 补充
  CRM_TARGET_GROUP:"营销目标群体",   // 补充
  CRM_POINTS_RULE:"积分规则",        // 补充
  // 包装/产品
  PACKAGING:"包装配置", PRODUCT:"产品设置",
  PRD_PRODUCT_GRADE:"产品品质等级", PRD_CATEGORY:"产品分类", PRD_PRODUCT_TYPE:"产品类型",
  // 质检
  QUALITY:"质检管理",
  QC_TRACE_TYPE:"追溯类型", QC_NCR_SOURCE:"异常反馈来源",
  QC_INSPECTION_METHOD:"质检方式", QC_INSPECTION_TYPE:"巡检类型",
  QC_INSPECT_CATEGORY:"质检分类",    // 补充
  QC_INSPECT_TYPE:"质检类型",        // 补充
  QC_NC_SOURCE:"异常来源",           // 补充（与 QC_NCR_SOURCE 不同）
  QC_PRODUCT_CATEGORY:"产品质检分类", // 补充
  // 系统
  SYSTEM:"系统设置",
  SYS_ORG_LEVEL:"组织架构层级",      // 补充
  // 运输
  TRANSPORT:"运输管理", TRP_EXCEPTION_TYPE:"运输异常原因", TRP_RECEIPT_STATUS:"签收状态",
  // 仓储
  WAREHOUSE:"仓库管理", WMS_INBOUND_TYPE:"入库类型", WMS_OUTBOUND_TYPE:"出库类型",
  WMS_STATUS:"库位状态", WMS_ZONE_TYPE:"库区类型", WMS_LOCATION_PURPOSE:"特殊库位用途",
  // 组织
  ORG_DEPT_LEVEL:"部门层级",
  // 通用
  GENERAL:"通用字典",
};
const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4","#ec4899","#14b8a6","#f97316","#6366f1"];
const typeColor = (t: string) => COLORS[t.charCodeAt(0) % COLORS.length];

const tok = () => (typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token")||"" : "");
const hdr = () => ({ "Content-Type":"application/json", Authorization:`Bearer ${tok()}` });

interface DictRow { id:number; dict_code:string; dict_type:string; dict_label_zh:string; dict_label_lo?:string; dict_label_en?:string; sort_no:number; status:string; config_json?:string; name?:string; }


export default function DictPage() {
  const toast = useToast();
  const [rows,    setRows]    = useState<DictRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState("");
  const [expanded,setExpanded]= useState<Record<string,boolean>>(() => { try { return JSON.parse(sessionStorage.getItem("ph_dict_exp")||"{}"); } catch { return {}; } });
  const [open,    setOpen]    = useState(false);
  const [edit,    setEdit]    = useState<DictRow|null>(null);
  const [cloned,  setCloned]  = useState<DictRow|null>(null);
  const [delRow,  setDelRow]  = useState<DictRow|null>(null);
  const [form, setForm] = useState({ dict_code:"", dict_type:"", label_zh:"", label_lo:"", label_en:"", sort_no:"0", cfg:{} as any });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/crud/sys_dict?limit=1000", { headers: hdr() });
      const d = await r.json();
      setRows(d.data || d || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? rows.filter(r =>
      (r.dict_code||"").toLowerCase().includes(q) ||
      (r.dict_label_zh||r.name||"").toLowerCase().includes(q) ||
      (r.dict_type||"").toLowerCase().includes(q)
    ) : rows;
    const map: Record<string, DictRow[]> = {};
    filtered.forEach(r => { const tp = r.dict_type||"GENERAL"; (map[tp]||=[]).push(r); });
    Object.values(map).forEach(arr => arr.sort((a,b) => (a.sort_no||0)-(b.sort_no||0)));
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b));
  }, [rows, search]);

  const toggleGroup = (tp: string) => setExpanded(p => { const n = {...p,[tp]:!p[tp]}; try { sessionStorage.setItem("ph_dict_exp", JSON.stringify(n)); } catch {} return n; });

  const openEdit = (r: DictRow) => {
    setEdit(r); setCloned(null);
    let cfg: any = null; try { cfg = r.config_json ? JSON.parse(r.config_json) : null; } catch {}
    setForm({ dict_code:r.dict_code, dict_type:r.dict_type, label_zh:r.dict_label_zh||r.name||"", label_lo:r.dict_label_lo||"", label_en:r.dict_label_en||"", sort_no:String(r.sort_no||0), cfg:cfg||{} });
    setOpen(true);
  };

  const openNew = (preset = "") => {
    setEdit(null);
    if (preset) {
      const same = rows.filter(r=>r.dict_type===preset).sort((a,b)=>(b.sort_no||0)-(a.sort_no||0));
      if (same.length > 0) {
        const last = same[0];
        let cfg:any=null; try { cfg = last.config_json ? JSON.parse(last.config_json) : null; } catch {}
        const codeM = (last.dict_code||"").match(/(.*?)(_?)([0-9]+)$/);
        const codeHint = codeM ? `${codeM[1]}${codeM[2]}${Number(codeM[3])+1}` : "";
        setCloned(last);
        setForm({ dict_code:codeHint, dict_type:preset, label_zh:last.dict_label_zh||last.name||"", label_lo:last.dict_label_lo||"", label_en:last.dict_label_en||"", sort_no:String((last.sort_no||0)+1), cfg:cfg||{} });
        setOpen(true); return;
      }
    }
    setCloned(null);
    setForm({ dict_code:"", dict_type:preset, label_zh:"", label_lo:"", label_en:"", sort_no:"0", cfg:{} });
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.label_zh) { toast.error("中文名称不能为空"); return; }
    if (!form.dict_type) { toast.error("所属字典类型不能为空"); return; }
    if (!edit && !form.dict_code.trim()) { toast.error("字典代码不能为空"); return; }

    let config_json: string|undefined;
    if (form.dict_type==="PKG_EGG_GRADE") config_json = JSON.stringify({ code:form.cfg?.code||"", nameZh:form.label_zh, weightRange:form.cfg?.weightRange||"—", saleable:form.cfg?.saleable!==false, productCode:form.cfg?.productCode||"", nameEn:form.label_en, nameLo:form.label_lo });
    else if (form.dict_type==="PKG_PACK_SPEC") config_json = JSON.stringify({ name:form.label_zh, capacity:Number(form.cfg?.capacity)||0, unit:form.cfg?.unit||"", requireBoxCode:form.cfg?.requireBoxCode!==false });

    const payload: any = { name:form.label_zh, dict_label_zh:form.label_zh, dict_label_lo:form.label_lo, dict_label_en:form.label_en, dict_type:form.dict_type, sort_no:Number(form.sort_no)||0, status:"ACTIVE", ...(config_json!==undefined?{config_json}:{}) };
    setLoading(true);
    try {
      let r: any;
      if (edit) {
        // 始终用数字 id，避免 dict_code 类型不匹配
        r = await fetch(`/api/crud/sys_dict/${edit.id}`, { method:"PUT", headers:hdr(), body:JSON.stringify(payload) }).then(x=>x.json());
      } else {
        r = await fetch("/api/crud/sys_dict", { method:"POST", headers:hdr(), body:JSON.stringify({...payload, dict_code:form.dict_code.trim()}) }).then(x=>x.json());
      }
      if (r.code===200 || r.dict_code || r.id) { setOpen(false); setEdit(null); load(); toast.success(edit?"更新成功":"创建成功"); }
      else toast.error(r.msg||"操作失败");
    } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!delRow) return;
    // 始终用数字 id，避免 dict_code 类型不匹配
    const r = await fetch(`/api/crud/sys_dict/${delRow.id}`, { method:"DELETE", headers:hdr() }).then(x=>x.json());
    setDelRow(null);
    if (r.code===200) { load(); toast.success("已删除"); } else toast.error(r.msg||"删除失败");
  };

  const f = (k: string, v: any) => setForm(p=>({...p,[k]:v}));
  const fc = (k: string, v: any) => setForm(p=>({...p, cfg:{...p.cfg,[k]:v}}));

  return (
    <div className="animate-fade-in" style={{ display:"flex", flexDirection:"column", gap:4 }}>
      <PageHeader
        title="数据字典管理"
        subtitle="管理系统数据字典配置项"
        breadcrumb={["系统设置","数据字典"]}
        actions={
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div className={s.searchBox}>
              <Search size={14} color="var(--text-secondary)"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索字典代码、名称或类型…"/>
            </div>
            <button type="button" onClick={()=>openNew()} className={s.btnPrimaryGrad}>
              <Plus size={15}/> 新建字典条目
            </button>
          </div>
        }
      />

      <div style={{ display:"flex", flexDirection:"column", gap:6, paddingBottom:24, marginTop:-12 }}>
        {loading && rows.length===0 && <div style={{ padding:40, textAlign:"center", color:"var(--text-secondary)" }}>加载中...</div>}
        {groups.length===0 && !loading && <div style={{ padding:40, textAlign:"center", color:"var(--text-secondary)" }}>{search?"没有匹配的字典条目":"暂无字典数据"}</div>}

        {groups.map(([tp, items]) => {
          const isOpen = expanded[tp]===true;
          const color  = typeColor(tp);
          const label  = TYPE_LABEL[tp]||tp;
          return (
            <div key={tp} style={{ background:"var(--bg-card)", border:`1px solid ${color}25`, borderRadius:12, overflow:"hidden" }}>
              <div onClick={()=>toggleGroup(tp)} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 14px", cursor:"pointer", userSelect:"none", background:isOpen?`${color}12`:"transparent", borderBottom:isOpen?`1px solid ${color}30`:"none" }}>
                <div style={{ width:3, height:18, borderRadius:2, background:color, flexShrink:0 }}/>
                <div style={{ color:"var(--text-secondary)", flexShrink:0 }}>{isOpen?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"var(--text-primary)" }}>{label}</div>
                  <div style={{ fontSize:10, fontFamily:"monospace", color:"var(--text-secondary)", marginTop:1 }}>{tp}</div>
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:"#fff", background:color, padding:"2px 8px", borderRadius:999 }}>{items.length} 条</span>
                <button onClick={e=>{e.stopPropagation();openNew(tp);}} style={{ padding:"4px 10px", border:`1px solid ${color}`, borderRadius:6, background:`${color}15`, color, fontSize:12, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
                  <Plus size={12}/> 新增
                </button>
              </div>

              {isOpen && (
                <div style={{ overflowX:"auto" }}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        {[["字典代码","180px"],["中文名称","150px"],["老挝语","160px"],["英文","160px"],["排序","70px"],["状态","70px"],["操作","80px"]].map(([h,w])=>(
                          <th key={h} style={{ width:w }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((r,i)=>(
                        <tr key={r.id ?? i}>
                          <td>
                            <span className={s.code} style={{ color, background:`${color}12`, borderColor:`${color}30` }}>{r.dict_code}</span>
                          </td>
                          <td style={{ fontWeight:600 }}>{r.dict_label_zh||r.name||"—"}</td>
                          <td style={{ fontSize:12, opacity:r.dict_label_lo?1:0.35 }}>{r.dict_label_lo||"未填"}</td>
                          <td style={{ fontSize:12, opacity:r.dict_label_en?1:0.35 }}>{r.dict_label_en||"未填"}</td>
                          <td style={{ fontWeight:600, fontSize:12 }}>{r.sort_no||0}</td>
                          <td>
                            <span className={`${s.badge} ${r.status==="ACTIVE"?s.badgeSuccess:s.badgeDanger}`}>
                              {r.status==="ACTIVE"?"启用":"停用"}
                            </span>
                          </td>
                          <td>
                            <div style={{ display:"flex", gap:6 }}>
                              <button type="button" onClick={()=>openEdit(r)} className={s.btnIcon} style={{ color:"var(--color-primary)", borderColor:"rgba(31,56,100,0.2)" }}><Edit2 size={13}/></button>
                              <button type="button" onClick={()=>setDelRow(r)} className={s.btnIcon} style={{ color:"#dc2626", borderColor:"rgba(220,38,38,0.2)" }}><Trash2 size={13}/></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 编辑抽屉 */}
      <RightDrawer isOpen={open} onClose={()=>{setOpen(false);setEdit(null);}} title={edit?`编辑：${edit.dict_label_zh||edit.dict_code}`:cloned?"新建条目（参照上一条）":"新建字典条目"} width="460px">
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {!edit && cloned && (
            <div className={s.infoBanner}>
              📋 已从 <strong style={{ fontFamily:"monospace" }}>{cloned.dict_code}</strong> 预填，可直接修改各字段
            </div>
          )}
          <div className={s.field}>
            <label className={s.lbl}>字典代码 <span style={{ fontWeight:400, fontSize:11, color:"var(--text-secondary)" }}>（创建后不可修改）</span></label>
            <input value={form.dict_code} disabled={!!edit} onChange={e=>f("dict_code",e.target.value)} placeholder="如 MACH_FAULT"
              className={s.inp} style={{ fontFamily:"monospace", opacity:edit?0.6:1, borderColor:!edit&&cloned?"var(--color-primary)":undefined }}/>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>所属字典类型 <span style={{color:"var(--status-danger)"}}>*</span></label>
            <input value={form.dict_type} disabled={!!edit} onChange={e=>f("dict_type",e.target.value)} placeholder="如 PKG_ANOMALY_REASON"
              className={s.inp} style={{ fontFamily:"monospace", opacity:edit?0.6:1 }}/>
            {!edit && <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:4 }}>输入已有类型名可归入该分组，输入新类型名自动创建新分组</div>}
          </div>
          <div className={s.formSection}>多语言名称</div>
          <div className={s.field}>
            <label className={s.lbl}>🇨🇳 中文名称 <span style={{color:"var(--status-danger)"}}>*</span></label>
            <input value={form.label_zh} onChange={e=>f("label_zh",e.target.value)} placeholder="如 机器原因" className={s.inp}/>
          </div>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>🇱🇦 老挝语</label>
              <input value={form.label_lo} onChange={e=>f("label_lo",e.target.value)} placeholder="如 ເຫດຜົນ" className={s.inp}/>
            </div>
            <div>
              <label className={s.lbl}>🇬🇧 英文</label>
              <input value={form.label_en} onChange={e=>f("label_en",e.target.value)} placeholder="如 Machine Fault" className={s.inp}/>
            </div>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>🔢 排序值</label>
            <input type="number" value={form.sort_no} onChange={e=>f("sort_no",e.target.value)} className={s.inp}/>
          </div>

          {/* 扩展配置：鸡蛋等级 */}
          {form.dict_type==="PKG_EGG_GRADE" && <>
            <div style={{ height:1, background:"var(--border)", margin:"4px 0" }}/>
            <div style={{ fontSize:12, fontWeight:700, color:"var(--text-secondary)" }}>扩展配置（鸡蛋等级）</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div><label style={{ display:"block", fontSize:12, marginBottom:4, color:"var(--text-primary)" }}>内部编码</label><input value={form.cfg?.code||""} onChange={e=>fc("code",e.target.value)} className={s.inp}/></div>
              <div><label style={{ display:"block", fontSize:12, marginBottom:4, color:"var(--text-primary)" }}>重量范围</label><input value={form.cfg?.weightRange||""} onChange={e=>fc("weightRange",e.target.value)} placeholder="如 59-66g" className={s.inp}/></div>
              <div><label style={{ display:"block", fontSize:12, marginBottom:4, color:"var(--text-primary)" }}>关联产品号</label><input value={form.cfg?.productCode||""} onChange={e=>fc("productCode",e.target.value)} placeholder="PRD-EGG-1" className={s.inp}/></div>
              <div style={{ display:"flex", alignItems:"flex-end", paddingBottom:6 }}>
                <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, cursor:"pointer", color:"var(--text-primary)" }}>
                  <input type="checkbox" checked={form.cfg?.saleable!==false} onChange={e=>fc("saleable",e.target.checked)}/> 支持正常售卖
                </label>
              </div>
            </div>
          </>}

          {/* 扩展配置：包装规格 */}
          {form.dict_type==="PKG_PACK_SPEC" && <>
            <div style={{ height:1, background:"var(--border)", margin:"4px 0" }}/>
            <div style={{ fontSize:12, fontWeight:700, color:"var(--text-secondary)" }}>扩展配置（包装规格）</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div><label style={{ display:"block", fontSize:12, marginBottom:4, color:"var(--text-primary)" }}>容量/单品数</label><input type="number" value={form.cfg?.capacity||""} onChange={e=>fc("capacity",e.target.value)} placeholder="如 360" className={s.inp}/></div>
              <div><label style={{ display:"block", fontSize:12, marginBottom:4, color:"var(--text-primary)" }}>计件单位</label><input value={form.cfg?.unit||""} onChange={e=>fc("unit",e.target.value)} placeholder="如 枚/箱" className={s.inp}/></div>
              <div style={{ gridColumn:"1 / -1" }}>
                <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, cursor:"pointer", color:"var(--text-primary)" }}>
                  <input type="checkbox" checked={form.cfg?.requireBoxCode!==false} onChange={e=>fc("requireBoxCode",e.target.checked)}/> 必须扫描大箱箱码入库
                </label>
              </div>
            </div>
          </>}

          <div className={s.drawerFooter} style={{ marginTop:"auto", paddingTop:8, borderTop:"1px solid var(--border)" }}>
            <button onClick={()=>{setOpen(false);setEdit(null);}} className={s.btnSecondary}>取消</button>
            <button onClick={handleSubmit} disabled={loading} className={s.btnPrimaryGrad}>
              {loading?"保存中…":<><Save size={15}/>保存</>}
            </button>
          </div>
        </div>
      </RightDrawer>

      <ConfirmDialog
        open={!!delRow}
        title="确认删除"
        message={`确认删除字典条目「${delRow?.dict_label_zh||delRow?.dict_code}」？此操作不可撤销。`}
        confirmLabel="确认删除"
        danger={true}
        onConfirm={handleDelete}
        onCancel={()=>setDelRow(null)}
      />
    </div>
  );
}