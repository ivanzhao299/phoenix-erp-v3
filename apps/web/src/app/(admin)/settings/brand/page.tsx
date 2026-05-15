"use client";
import { useState, useRef, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/contexts/ToastContext";
import { useBrand } from "@/contexts/BrandContext";
import { Upload, Save, RefreshCw, Image, Type } from "lucide-react";

const inp: React.CSSProperties = { width:"100%", padding:"10px 14px", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-page)", color:"var(--text-primary)", fontSize:14, boxSizing:"border-box", outline:"none" };
const card: React.CSSProperties = { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:24, marginBottom:20 };

const DEFAULT = {
  system_name:  "凤凰农业ERP管理系统",
  company_name: "凤凰农业食品集团",
  logo_url:     "",
  footer_text:  "© 2026 Phoenix ERP · All rights reserved",
};

export default function BrandSettingsPage() {
  const toast = useToast();
  const { reloadBrand } = useBrand();   // ✅ 保存后立即同步全局品牌
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(DEFAULT);
  const [saving, setSaving] = useState(false);
  const f = (k: string, v: string) => setForm(p=>({...p,[k]:v}));

  // 页面加载时从后端读取已保存的品牌配置
  useEffect(() => {
    fetch("/api/system/brand")
      .then(r => r.json())
      .then(d => {
        // 仅当 ok===true 时才用服务端数据覆盖表单
        // ok===false 说明数据库为空或出错，保留本地默认值
        if (d.ok === true && d.data) {
          setForm(prev => ({ ...prev, ...d.data }));
        }
      })
      .catch(() => {});
  }, []);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("请上传图片文件（PNG / JPG / SVG）"); return; }
    if (file.size > 2_000_000) { toast.error("图片不能超过 2MB"); return; }

    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      // Canvas 压缩：最大 600px，JPEG quality 0.82
      const MAX = 600;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL("image/jpeg", 0.82);
      URL.revokeObjectURL(url);
      // 大小提示（base64 长度转换）
      const kb = Math.round(compressed.length * 0.75 / 1024);
      if (kb > 800) { toast.error(`图片压缩后仍达 ${kb}KB，请使用更小图片`); return; }
      f("logo_url", compressed);
      toast.success(`图片已压缩并加载（${kb}KB）`);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast.error("图片读取失败"); };
    img.src = url;
  };

  const handleSave = async () => {
    if (!form.system_name?.trim()) { toast.error("系统名称不能为空"); return; }
    setSaving(true);
    try {
      // 后端 PUT /api/system/brand 无需 JWT，返回 { ok: true, data }
      const res  = await fetch("/api/system/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok === true) {
        toast.success("品牌配置已保存，页面即时生效");
        if (data.data) setForm(prev => ({ ...prev, ...data.data }));
        reloadBrand();   // ✅ 立即刷新全局 Brand Context（侧边栏/登录页/favicon 同步更新）
      } else {
        toast.error(data.message || data.msg || "保存失败，请检查后端连接");
      }
    } catch (err) {
      toast.error("网络错误：" + (err instanceof Error ? err.message : "未知"));
    } finally { setSaving(false); }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="系统品牌设置" subtitle="自定义系统名称、公司简称和 Logo" breadcrumb={["系统设置","品牌配置"]}/>

      {/* 实时预览卡 */}
      <div style={{ ...card, background:"linear-gradient(135deg,#1a1f2e 0%,#252d40 100%)", border:"none" }}>
        <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginBottom:14, letterSpacing:"0.1em" }}>预 览</div>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          {form.logo_url
            ? <img src={form.logo_url} alt="logo" style={{ width:48, height:48, objectFit:"contain", borderRadius:8, background:"rgba(255,255,255,0.08)", padding:4 }}/>
            : <div style={{ width:48, height:48, borderRadius:8, background:"rgba(255,255,255,0.08)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>🏢</div>}
          <div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginBottom:2 }}>{form.company_name||"公司简称"}</div>
            <div style={{ fontSize:16, fontWeight:800, color:"#f59e0b", lineHeight:1.2 }}>{form.system_name||"系统名称"}</div>
          </div>
        </div>
        {form.footer_text && <div style={{ marginTop:16, fontSize:11, color:"rgba(255,255,255,0.25)", borderTop:"1px solid rgba(255,255,255,0.08)", paddingTop:12 }}>{form.footer_text}</div>}
      </div>

      {/* 文字字段 */}
      <div style={card}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:18, display:"flex", alignItems:"center", gap:8, color:"var(--text-primary)" }}><Type size={16}/> 文字信息</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <div>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"var(--text-secondary)", marginBottom:6 }}>系统名称 <span style={{ color:"#dc2626" }}>*</span></label>
            <input value={form.system_name} onChange={e=>f("system_name",e.target.value)} placeholder="凤凰农业ERP管理系统" style={inp}/>
            <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:4 }}>显示在侧边栏、登录页、浏览器标签</div>
          </div>
          <div>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"var(--text-secondary)", marginBottom:6 }}>公司简称</label>
            <input value={form.company_name} onChange={e=>f("company_name",e.target.value)} placeholder="凤凰农业食品集团" style={inp}/>
            <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:4 }}>侧边栏折叠时显示</div>
          </div>
        </div>
        <div>
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:"var(--text-secondary)", marginBottom:6 }}>底部版权文字</label>
          <input value={form.footer_text} onChange={e=>f("footer_text",e.target.value)} placeholder="© 2026 Phoenix ERP · All rights reserved" style={inp}/>
        </div>
      </div>

      {/* Logo 上传 */}
      <div style={card}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:18, display:"flex", alignItems:"center", gap:8, color:"var(--text-primary)" }}><Image size={16}/> 公司 Logo</div>
        <div style={{ display:"flex", gap:20, alignItems:"flex-start" }}>
          <div style={{ width:100, height:100, border:"2px dashed var(--border)", borderRadius:"var(--radius-md)", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--bg-page)", flexShrink:0 }}>
            {form.logo_url
              ? <img src={form.logo_url} alt="preview" style={{ width:90, height:90, objectFit:"contain", borderRadius:6 }}/>
              : <div style={{ textAlign:"center", color:"var(--text-secondary)" }}><div style={{ fontSize:28, marginBottom:4 }}>🏢</div><div style={{ fontSize:10 }}>暂无 Logo</div></div>}
          </div>
          <div style={{ flex:1 }}>
            <div onClick={()=>fileRef.current?.click()}
              onMouseEnter={e=>(e.currentTarget.style.borderColor="var(--color-primary)")}
              onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border)")}
              style={{ border:"2px dashed var(--border)", borderRadius:"var(--radius-md)", padding:24, textAlign:"center", cursor:"pointer", background:"var(--bg-page)", transition:"border-color 0.2s" }}>
              <Upload size={24} style={{ color:"var(--text-secondary)", marginBottom:8 }}/>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:4, color:"var(--text-primary)" }}>点击上传 Logo</div>
              <div style={{ fontSize:11, color:"var(--text-secondary)" }}>支持 PNG · JPG · SVG · WebP，文件 ≤ 450KB</div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display:"none" }}/>
            {form.logo_url && (
              <button type="button" onClick={()=>f("logo_url","")} style={{ marginTop:8, fontSize:12, color:"#dc2626", background:"none", border:"none", cursor:"pointer", padding:0 }}>× 移除 Logo</button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display:"flex", gap:12 }}>
        <button type="button" onClick={handleSave} disabled={saving}
          style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 24px", background:"var(--color-primary)", color:"white", border:"none", borderRadius:"var(--radius-md)", cursor:saving?"not-allowed":"pointer", fontWeight:700, fontSize:14, opacity:saving?0.7:1 }}>
          <Save size={15}/>{saving?"保存中...":"保存品牌配置"}
        </button>
        <button type="button" onClick={()=>setForm(DEFAULT)}
          style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 16px", border:"1px solid var(--border)", background:"var(--bg-card)", borderRadius:"var(--radius-md)", cursor:"pointer", fontSize:13, color:"var(--text-primary)" }}>
          <RefreshCw size={13}/> 重置为默认
        </button>
      </div>
    </div>
  );
}
