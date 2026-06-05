"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Plus, Edit2, Trash2, Save, Search } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

// TYPE_LABEL 在组件内通过 useTypeLabelMap() 动态生成，支持多语言

const COLORS = ["var(--color-accent)","var(--status-special)","var(--status-success)","var(--status-warning)","var(--status-danger)","var(--color-accent)","var(--status-special)","var(--status-success)","var(--status-warning)","var(--status-special)"];
const typeColor = (t: string) => COLORS[t.charCodeAt(0) % COLORS.length];

const tok = () => (typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token")||"" : "");
const hdr = () => ({ "Content-Type":"application/json", Authorization:`Bearer ${tok()}` });

interface DictRow { id:number; dict_code:string; dict_type:string; dict_label_zh:string; dict_label_lo?:string; dict_label_en?:string; sort_no:number; status:string; config_json?:string; name?:string; }

export default function DictPage() {
  const toast = useToast();
  const { t } = useLanguage();

  // 字典类型中文/多语言标签映射，随语言切换动态更新
  const TYPE_LABEL = useMemo<Record<string,string>>(() => ({
    // 包装
    PKG_ANOMALY_REASON: t("dict.PKG_ANOMALY_REASON","包装异常原因"),
    PKG_EGG_GRADE:      t("dict.PKG_EGG_GRADE","鸡蛋等级配置"),
    PKG_EGG_DEFECT:     t("dict.PKG_EGG_DEFECT","蛋品缺陷类型"),
    PKG_PACK_LINE:      t("dict.PKG_PACK_LINE","包装产线"),
    PKG_PACK_SPEC:      t("dict.PKG_PACK_SPEC","包装规格配置"),
    PKG_PRESORT_STANDARD: t("dict.PKG_PRESORT_STANDARD","预分拣标准"),
    PKG_SHIFT:          t("dict.PKG_SHIFT","包装班次"),
    PKG_CUSTOM_LABEL:   t("dict.PKG_CUSTOM_LABEL","临时标签类型"),
    PKG_QC_RESULT:      t("dict.PKG_QC_RESULT","QC检验结论"),
    // 审批
    APPROVAL:           t("dict.APPROVAL","审批流程"),
    APR_MODULE_TYPE:    t("dict.APR_MODULE_TYPE","审批模块类型"),
    // 养殖
    BREEDING:           t("dict.BREEDING","养殖管理"),
    BRD_BREED_TYPE:     t("dict.BRD_BREED_TYPE","鸡种类型"),
    BRD_HOUSE_TYPE:     t("dict.BRD_HOUSE_TYPE","鸡舍类型"),
    BRD_SHIFT:          t("dict.BRD_SHIFT","养殖班次"),
    BRD_FLOCK_STATUS:   t("dict.BRD_FLOCK_STATUS","鸡群状态"),
    BRD_VACCINE_TYPE:   t("dict.BRD_VACCINE_TYPE","疫苗种类"),
    BRD_VACCINATE_METHOD: t("dict.BRD_VACCINATE_METHOD","接种方式"),
    // 业务
    BUSINESS:           t("dict.BUSINESS","业务设置"),
    BS_PAYMENT_TERM:    t("dict.BS_PAYMENT_TERM","付款条款"),
    BS_CUSTOMER_LEVEL:  t("dict.BS_CUSTOMER_LEVEL","客户等级"),
    // CRM
    CRM:                t("dict.CRM","客户管理"),
    CRM_MEMBER_LEVEL:   t("dict.CRM_MEMBER_LEVEL","会员等级"),
    CRM_ACTIVITY_TYPE:  t("dict.CRM_ACTIVITY_TYPE","营销活动类型"),
    CRM_COUPON_LEVEL:   t("dict.CRM_COUPON_LEVEL","优惠券等级"),
    CRM_COUPON_TYPE:    t("dict.CRM_COUPON_TYPE","优惠券类型"),
    CRM_TARGET_GROUP:   t("dict.CRM_TARGET_GROUP","营销目标群体"),
    CRM_POINTS_RULE:    t("dict.CRM_POINTS_RULE","积分规则"),
    // 产品
    PRD_PRODUCT_GRADE:  t("dict.PRD_PRODUCT_GRADE","产品品质等级"),
    PRD_CATEGORY:       t("dict.PRD_CATEGORY","产品分类"),
    PRD_PRODUCT_TYPE:   t("dict.PRD_PRODUCT_TYPE","产品类型"),
    // 质检
    QC_TRACE_TYPE:      t("dict.QC_TRACE_TYPE","追溯类型"),
    QC_NCR_SOURCE:      t("dict.QC_NCR_SOURCE","异常反馈来源"),
    QC_INSPECTION_METHOD: t("dict.QC_INSPECTION_METHOD","质检方式"),
    QC_INSPECTION_TYPE: t("dict.QC_INSPECTION_TYPE","巡检类型"),
    QC_INSPECT_CATEGORY: t("dict.QC_INSPECT_CATEGORY","质检分类"),
    QC_INSPECT_TYPE:    t("dict.QC_INSPECT_TYPE","质检类型"),
    QC_NC_SOURCE:       t("dict.QC_NC_SOURCE","异常来源"),
    QC_PRODUCT_CATEGORY: t("dict.QC_PRODUCT_CATEGORY","产品质检分类"),
    // 系统
    SYS_ORG_LEVEL:      t("dict.SYS_ORG_LEVEL","组织架构层级"),
    // 运输
    TRP_EXCEPTION_TYPE: t("dict.TRP_EXCEPTION_TYPE","运输异常原因"),
    TRP_RECEIPT_STATUS: t("dict.TRP_RECEIPT_STATUS","签收状态"),
    // 仓储
    WMS_INBOUND_TYPE:   t("dict.WMS_INBOUND_TYPE","入库类型"),
    WMS_OUTBOUND_TYPE:  t("dict.WMS_OUTBOUND_TYPE","出库类型"),
    WMS_STATUS:         t("dict.WMS_STATUS","库位状态"),
    WMS_ZONE_TYPE:      t("dict.WMS_ZONE_TYPE","库区类型"),
    WMS_LOCATION_PURPOSE: t("dict.WMS_LOCATION_PURPOSE","特殊库位用途"),
    // 通用
    ORG_DEPT_LEVEL:     t("dict.ORG_DEPT_LEVEL","部门层级"),
    GENERAL:            t("dict.GENERAL","通用字典"),
  }), [t]);

  const [rows,    setRows]    = useState<DictRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState("");
  const [selected,setSelected]= useState<string>("");  // currently selected dict type
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
      const data: DictRow[] = d.data || d || [];
      setRows(data);
      // auto-select first group on initial load
      setSelected(prev => {
        if (prev) return prev;
        const first = [...new Set(data.map(r => r.dict_type))].sort()[0];
        return first || "";
      });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // groups for sidebar (filtered by search)
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

  // when search changes, auto-select first visible group
  useEffect(() => {
    if (search && groups.length > 0) setSelected(groups[0][0]);
  }, [search, groups]);

  // items for the right panel
  const selectedItems = useMemo(() =>
    groups.find(([tp]) => tp === selected)?.[1] ?? [],
    [groups, selected]
  );

  const openEdit = (r: DictRow) => {
    setEdit(r); setCloned(null);
    let cfg: Record<string, unknown> | null = null; try { cfg = r.config_json ? JSON.parse(r.config_json) : null; } catch {}
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
        setForm({ dict_code:codeHint, dict_type:preset, label_zh:"", label_lo:"", label_en:"", sort_no:String((last.sort_no||0)+1), cfg:cfg||{} });
        setOpen(true); return;
      }
    }
    setCloned(null);
    setForm({ dict_code:"", dict_type:preset||selected, label_zh:"", label_lo:"", label_en:"", sort_no:"0", cfg:{} });
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.label_zh) { toast.error(t("ui.中文名称不能为空","中文名称不能为空")); return; }
    if (!form.dict_type) { toast.error(t("ui.所属字典类型不能为空","所属字典类型不能为空")); return; }
    if (!edit && !form.dict_code.trim()) { toast.error(t("ui.字典代码不能为空","字典代码不能为空")); return; }

    let config_json: string|undefined;
    if (form.dict_type==="PKG_EGG_GRADE") config_json = JSON.stringify({ code:form.cfg?.code||"", nameZh:form.label_zh, weightRange:form.cfg?.weightRange||"—", saleable:form.cfg?.saleable!==false, productCode:form.cfg?.productCode||"", nameEn:form.label_en, nameLo:form.label_lo });
    else if (form.dict_type==="PKG_PACK_SPEC") config_json = JSON.stringify({ name:form.label_zh, capacity:Number(form.cfg?.capacity)||0, unit:form.cfg?.unit||"", requireBoxCode:form.cfg?.requireBoxCode!==false });
    else if (form.dict_type==="PKG_SHIFT") config_json = JSON.stringify({ timeRange:form.cfg?.timeRange||"" });

    const payload: Record<string, unknown> = { name:form.label_zh, dict_label_zh:form.label_zh, dict_label_lo:form.label_lo, dict_label_en:form.label_en, dict_type:form.dict_type, sort_no:Number(form.sort_no)||0, status:"ACTIVE", ...(config_json!==undefined?{config_json}:{}) };
    setLoading(true);
    try {
      let r: Record<string, unknown>;
      if (edit) {
        r = await fetch(`/api/crud/sys_dict/${edit.id}`, { method:"PUT", headers:hdr(), body:JSON.stringify(payload) }).then(x=>x.json());
      } else {
        r = await fetch("/api/crud/sys_dict", { method:"POST", headers:hdr(), body:JSON.stringify({...payload, dict_code:form.dict_code.trim()}) }).then(x=>x.json());
      }
      if (r.code===200 || r.dict_code || r.id) {
        setOpen(false); setEdit(null); load(); toast.success(edit ? t("ui.更新成功","更新成功") : t("ui.创建成功","创建成功"));
        if (!edit) setSelected(form.dict_type); // jump to newly created type
      } else toast.error((r.msg as string | undefined) || t("ui.操作失败","操作失败"));
    } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!delRow) return;
    const r = await fetch(`/api/crud/sys_dict/${delRow.id}`, { method:"DELETE", headers:hdr() }).then(x=>x.json());
    setDelRow(null);
    if (r.code===200) { load(); toast.success(t("ui.已删除","已删除")); } else toast.error(r.msg || t("ui.删除失败","删除失败"));
  };

  const f  = (k: string, v: unknown) => setForm(p=>({...p,[k]:v}));
  const fc = (k: string, v: unknown) => setForm(p=>({...p, cfg:{...p.cfg,[k]:v}}));

  const selColor = selected ? typeColor(selected) : "var(--color-accent)";
  const selLabel = selected ? (TYPE_LABEL[selected]||selected) : "";

  return (
    <div className="animate-fade-in" style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <PageHeader
        title={t("ui.数据字典管理","数据字典管理")}
        subtitle={t("ui.管理系统数据字典配置项","管理系统数据字典配置项")}
        breadcrumb={[t("ui.系统设置","系统设置"), t("ui.数据字典","数据字典")]}
        actions={
          <button type="button" onClick={()=>openNew()} className={s.btnPrimaryGrad}>
            <Plus size={15}/> {t("ui.新建字典条目","新建字典条目")}
          </button>
        }
      />

      {/* 左右分栏主体 */}
      <div style={{ display:"flex", flex:1, gap:0, minHeight:0, marginTop:-8, overflow:"hidden" }}>

        {/* ── 左侧：字典类型导航 ── */}
        <div style={{ width:232, flexShrink:0, display:"flex", flexDirection:"column",
          background:"var(--bg-card)", borderRadius:12, border:"1px solid var(--border)",
          overflow:"hidden", marginRight:12 }}>

          {/* 搜索框 */}
          <div style={{ padding:"10px 10px 8px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6,
              background:"var(--bg-page)", borderRadius:8, padding:"6px 10px",
              border:"1px solid var(--border)" }}>
              <Search size={13} color="var(--text-secondary)"/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder={t("ui.搜索字典","搜索字典…")}
                style={{ border:"none", background:"transparent", outline:"none",
                  fontSize:12, color:"var(--text-primary)", width:"100%" }}/>
            </div>
          </div>

          {/* 类型列表 */}
          <div style={{ flex:1, overflowY:"auto", padding:"6px 6px" }}>
            {loading && rows.length===0 && (
              <div style={{ padding:20, textAlign:"center", fontSize:12, color:"var(--text-secondary)" }}>{t("common.loading","加载中...")}</div>
            )}
            {groups.map(([tp, items]) => {
              const color = typeColor(tp);
              const label = TYPE_LABEL[tp]||tp;
              const isSel = tp === selected;
              return (
                <button type="button" key={tp} onClick={()=>setSelected(tp)}
                  style={{ width:"100%", display:"flex", alignItems:"center", gap:8,
                    padding:"8px 10px", borderRadius:8, cursor:"pointer", border:"none",
                    background: isSel ? `${color}18` : "transparent",
                    marginBottom:2, textAlign:"left", transition:"background 0.12s" }}>
                  <div style={{ width:3, height:16, borderRadius:2, background:color, flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight: isSel ? 700 : 500,
                      color: isSel ? color : "var(--text-primary)",
                      whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {label}
                    </div>
                    <div style={{ fontSize:10, fontFamily:"monospace",
                      color:"var(--text-secondary)", marginTop:1,
                      whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {tp}
                    </div>
                  </div>
                  <span style={{ fontSize:10, fontWeight:700, color:"var(--text-on-dark)",
                    background: isSel ? color : "var(--text-secondary)",
                    padding:"1px 6px", borderRadius:999, flexShrink:0 }}>
                    {items.length}
                  </span>
                </button>
              );
            })}
            {groups.length===0 && !loading && (
              <div style={{ padding:20, textAlign:"center", fontSize:12, color:"var(--text-secondary)" }}>{t("ui.无匹配","无匹配")}</div>
            )}
          </div>
        </div>

        {/* ── 右侧：选中类型的条目表格 ── */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0,
          background:"var(--bg-card)", borderRadius:12, border:"1px solid var(--border)",
          overflow:"hidden" }}>

          {selected ? (
            <>
              {/* 右侧标题栏 */}
              <div style={{ display:"flex", alignItems:"center", gap:10,
                padding:"12px 16px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
                <div style={{ width:4, height:20, borderRadius:2, background:selColor }}/>
                <div className={u.flex1}>
                  <div style={{ fontSize:14, fontWeight:700, color:"var(--text-primary)" }}>{selLabel}</div>
                  <div style={{ fontSize:11, fontFamily:"monospace", color:"var(--text-secondary)", marginTop:1 }}>{selected}</div>
                </div>
                <span style={{ fontSize:12, fontWeight:700, color:"var(--text-on-dark)",
                  background:selColor, padding:"2px 10px", borderRadius:999 }}>
                  {selectedItems.length} {t("ui.条","条")}
                </span>
                <button type="button" onClick={()=>openNew(selected)}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px",
                    border:`1px solid ${selColor}`, borderRadius:8, background:`${selColor}15`,
                    color:selColor, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  <Plus size={13}/> {t("ui.新增条目","新增条目")}
                </button>
              </div>

              {/* 表格 */}
              <div style={{ flex:1, overflow:"auto" }}>
                {selectedItems.length === 0 ? (
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
                    justifyContent:"center", height:"100%", gap:8, color:"var(--text-secondary)" }}>
                    <div style={{ fontSize:32 }}>📭</div>
                    <div className={u.fs13}>{t("ui.暂无条目点击新增条目添加","暂无条目，点击「新增条目」添加")}</div>
                  </div>
                ) : (
                  <table className={s.table} style={{ tableLayout:"fixed" }}>
                    <colgroup>
                      <col style={{ width:200 }}/>
                      <col style={{ width:160 }}/>
                      <col style={{ width:180 }}/>
                      <col style={{ width:200 }}/>
                      <col style={{ width:64 }}/>
                      <col style={{ width:72 }}/>
                      <col style={{ width:88 }}/>
                    </colgroup>
                    <thead>
                      <tr>
                        {[t("ui.字典代码","字典代码"), t("ui.中文名称","中文名称"), t("ui.老挝语","老挝语"), t("ui.英文","英文"), t("ui.排序","排序"), t("common.status","状态"), t("common.operation","操作")].map(h=>(
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedItems.map((r,i) => (
                        <tr key={r.id ?? i}>
                          <td>
                            <span className={s.code} style={{ color:selColor, background:`${selColor}12`, borderColor:`${selColor}30` }}>
                              {r.dict_code}
                            </span>
                          </td>
                          <td className={u.fw600}>{r.dict_label_zh||r.name||"—"}</td>
                          <td style={{ fontSize:12, opacity:r.dict_label_lo?1:0.35 }}>{r.dict_label_lo || t("ui.未填","未填")}</td>
                          <td style={{ fontSize:12, opacity:r.dict_label_en?1:0.35 }}>{r.dict_label_en || t("ui.未填","未填")}</td>
                          <td style={{ fontWeight:600, fontSize:12 }}>{r.sort_no||0}</td>
                          <td>
                            <span className={`${s.badge} ${r.status==="ACTIVE"?s.badgeSuccess:s.badgeDanger}`}>
                              {r.status==="ACTIVE" ? t("status.active","启用") : t("status.inactive","停用")}
                            </span>
                          </td>
                          <td>
                            <div style={{ display:"flex", gap:6 }}>
                              <button type="button" onClick={()=>openEdit(r)} className={s.btnIcon}
                                style={{ color:"var(--color-primary)", borderColor:"var(--status-info-bg-medium)" }}>
                                <Edit2 size={13}/>
                              </button>
                              <button type="button" onClick={()=>setDelRow(r)} className={s.btnIcon}
                                style={{ color:"var(--status-danger)", borderColor:"rgba(220,38,38,0.2)" }}>
                                <Trash2 size={13}/>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
              justifyContent:"center", height:"100%", gap:8, color:"var(--text-secondary)" }}>
              <div style={{ fontSize:32 }}>👈</div>
              <div className={u.fs13}>{t("ui.从左侧选择字典类型查看条目","从左侧选择字典类型查看条目")}</div>
            </div>
          )}
        </div>
      </div>

      {/* 编辑抽屉 */}
      <RightDrawer open={open} onClose={()=>{setOpen(false);setEdit(null);}}
        title={edit ? `${t("common.edit","编辑")}：${edit.dict_label_zh||edit.dict_code}` : cloned ? t("ui.新建条目参照上一条","新建条目（参照上一条）") : t("ui.新建字典条目","新建字典条目")}
        width="460px">
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {!edit && cloned && (
            <div className={s.infoBanner}>
              📋 {t("ui.已从预填可直接修改各字段","已从")} <strong style={{ fontFamily:"monospace" }}>{cloned.dict_code}</strong> {t("ui.预填可直接修改各字段","预填，可直接修改各字段")}
            </div>
          )}
          <div className={s.field}>
            <label className={s.lbl}>{t("ui.字典代码","字典代码")} <span style={{ fontWeight:400, fontSize:11, color:"var(--text-secondary)" }}>（{t("ui.创建后不可修改","创建后不可修改")}）</span></label>
            <input value={form.dict_code} disabled={!!edit} onChange={e=>f("dict_code",e.target.value)}
              placeholder="如 MACH_FAULT" className={s.inp}
              style={{ fontFamily:"monospace", opacity:edit?0.6:1, borderColor:!edit&&cloned?"var(--color-primary)":undefined }}/>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t("ui.所属字典类型","所属字典类型")} <span style={{color:"var(--status-danger)"}}>*</span></label>
            <input value={form.dict_type} disabled={!!edit} onChange={e=>f("dict_type",e.target.value)}
              placeholder="如 PKG_ANOMALY_REASON" className={s.inp}
              style={{ fontFamily:"monospace", opacity:edit?0.6:1 }}/>
            {!edit && <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:4 }}>{t("ui.输入已有类型名可归入该分组输入新类型名自动创建新分组","输入已有类型名可归入该分组，输入新类型名自动创建新分组")}</div>}
          </div>
          <div className={s.formSection}>{t("ui.多语言名称","多语言名称")}</div>
          <div className={s.field}>
            <label className={s.lbl}>🇨🇳 {t("ui.中文名称","中文名称")} <span style={{color:"var(--status-danger)"}}>*</span></label>
            <input value={form.label_zh} onChange={e=>f("label_zh",e.target.value)} placeholder="如 机器原因" className={s.inp}/>
          </div>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>🇱🇦 {t("ui.老挝语","老挝语")}</label>
              <input value={form.label_lo} onChange={e=>f("label_lo",e.target.value)} placeholder="如 ເຫດຜົນ" className={s.inp}/>
            </div>
            <div>
              <label className={s.lbl}>🇬🇧 {t("ui.英文","英文")}</label>
              <input value={form.label_en} onChange={e=>f("label_en",e.target.value)} placeholder="如 Machine Fault" className={s.inp}/>
            </div>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>🔢 {t("ui.排序值","排序值")}</label>
            <input type="number" value={form.sort_no} onChange={e=>f("sort_no",e.target.value)} className={s.inp}/>
          </div>

          {form.dict_type==="PKG_SHIFT" && <>
            <div style={{ height:1, background:"var(--border)", margin:"4px 0" }}/>
            <div style={{ fontSize:12, fontWeight:700, color:"var(--text-secondary)" }}>{t("ui.扩展配置班次时间段","扩展配置（班次时间段）")}</div>
            <div className={s.field}>
              <label style={{ display:"block", fontSize:12, marginBottom:4, color:"var(--text-primary)" }}>
                ⏰ {t("ui.时间范围","时间范围")}
              </label>
              <input
                value={form.cfg?.timeRange||""}
                onChange={e=>fc("timeRange", e.target.value)}
                placeholder={t("ui.班次时间示例","如 08:00-14:00")}
                className={s.inp}
              />
              <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:4 }}>
                {t("ui.班次时间格式说明","格式：HH:MM-HH:MM，如 08:00-14:00 或 22:00-06:00（跨夜）")}
              </div>
            </div>
          </>}

          {form.dict_type==="PKG_EGG_GRADE" && <>
            <div style={{ height:1, background:"var(--border)", margin:"4px 0" }}/>
            <div style={{ fontSize:12, fontWeight:700, color:"var(--text-secondary)" }}>{t("ui.扩展配置鸡蛋等级","扩展配置（鸡蛋等级）")}</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div><label style={{ display:"block", fontSize:12, marginBottom:4, color:"var(--text-primary)" }}>{t("ui.内部编码","内部编码")}</label><input value={form.cfg?.code||""} onChange={e=>fc("code",e.target.value)} className={s.inp}/></div>
              <div><label style={{ display:"block", fontSize:12, marginBottom:4, color:"var(--text-primary)" }}>{t("ui.重量范围","重量范围")}</label><input value={form.cfg?.weightRange||""} onChange={e=>fc("weightRange",e.target.value)} placeholder={t("ui.重量范围示例","如 59-66g")} className={s.inp}/></div>
              <div><label style={{ display:"block", fontSize:12, marginBottom:4, color:"var(--text-primary)" }}>{t("ui.关联产品号","关联产品号")}</label><input value={form.cfg?.productCode||""} onChange={e=>fc("productCode",e.target.value)} placeholder="PRD-EGG-1" className={s.inp}/></div>
              <div style={{ display:"flex", alignItems:"flex-end", paddingBottom:6 }}>
                <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, cursor:"pointer", color:"var(--text-primary)" }}>
                  <input type="checkbox" checked={form.cfg?.saleable!==false} onChange={e=>fc("saleable",e.target.checked)}/> {t("ui.支持正常售卖","支持正常售卖")}
                </label>
              </div>
            </div>
          </>}

          {form.dict_type==="PKG_PACK_SPEC" && <>
            <div style={{ height:1, background:"var(--border)", margin:"4px 0" }}/>
            <div style={{ fontSize:12, fontWeight:700, color:"var(--text-secondary)" }}>{t("ui.扩展配置包装规格","扩展配置（包装规格）")}</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div><label style={{ display:"block", fontSize:12, marginBottom:4, color:"var(--text-primary)" }}>{t("ui.容量单品数","容量/单品数")}</label><input type="number" value={form.cfg?.capacity||""} onChange={e=>fc("capacity",e.target.value)} placeholder={t("ui.容量示例","如 360")} className={s.inp}/></div>
              <div><label style={{ display:"block", fontSize:12, marginBottom:4, color:"var(--text-primary)" }}>{t("ui.计件单位","计件单位")}</label><input value={form.cfg?.unit||""} onChange={e=>fc("unit",e.target.value)} placeholder={t("ui.计件单位示例","如 枚/箱")} className={s.inp}/></div>
              <div style={{ gridColumn:"1 / -1" }}>
                <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, cursor:"pointer", color:"var(--text-primary)" }}>
                  <input type="checkbox" checked={form.cfg?.requireBoxCode!==false} onChange={e=>fc("requireBoxCode",e.target.checked)}/> {t("ui.必须扫描大箱箱码入库","必须扫描大箱箱码入库")}
                </label>
              </div>
            </div>
          </>}

          <div className={s.drawerFooter} style={{ marginTop:"auto", paddingTop:8, borderTop:"1px solid var(--border)" }}>
            <button type="button" onClick={()=>{setOpen(false);setEdit(null);}} className={s.btnSecondary}>{t("common.cancel","取消")}</button>
            <button type="button" onClick={handleSubmit} disabled={loading} className={s.btnPrimaryGrad}>
              {loading ? t("ui.保存中","保存中…") : <><Save size={15}/>{t("common.save","保存")}</>}
            </button>
          </div>
        </div>
      </RightDrawer>

      <ConfirmDialog
        open={!!delRow}
        title={t("ui.确认删除","确认删除")}
        message={`${t("ui.确认删除字典条目","确认删除字典条目")}「${delRow?.dict_label_zh||delRow?.dict_code}」？${t("ui.此操作不可撤销","此操作不可撤销")}。`}
        confirmLabel={t("ui.确认删除","确认删除")}
        danger={true}
        onConfirm={handleDelete}
        onCancel={()=>setDelRow(null)}
      />
    </div>
  );
}
