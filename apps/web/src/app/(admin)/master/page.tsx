"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Building2, Package, Users, Store, Database } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";

// ── Auth helper ───────────────────────────────────────────────────────────────
function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || '';
}
function authHdr(extra?: Record<string, string>) {
  return { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...extra };
}



export default function MasterPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [counts, setCounts] = useState<Record<string,number>>({});

  const MODULES = useMemo(() => [
    { path:"/master/farms",    icon:<Building2 size={22}/>, label: t("ui.养殖场档案", "养殖场档案"),  desc: t("ui.农场基础信息及鸡舍配置", "农场基础信息及鸡舍配置"),   table:"brd_farms",    color:"#10b981" },
    { path:"/master/products", icon:<Package size={22}/>,   label: t("ui.产品档案", "产品档案"),      desc: t("ui.蛋品规格品级SKU管理", "蛋品规格·品级·SKU管理"),   table:"mst_products",  color:"#f59e0b" },
    { path:"/master/orgs",     icon:<Users size={22}/>,     label: t("ui.组织架构", "组织架构"),      desc: t("ui.公司部门员工层级管理", "公司·部门·员工层级管理"),   table:"sys_organizations",      color:"#3b82f6" },
    { path:"/master/stores",   icon:<Store size={22}/>,     label: t("ui.门店档案", "门店档案"),      desc: t("ui.销售门店基础信息维护", "销售门店基础信息维护"),     table:"mst_stores",    color:"#8b5cf6" },
  ], [t]);

  useEffect(() => {
    Promise.all(
      MODULES.map(m =>
        fetch(`/api/crud/${m.table}?limit=1`, { headers: authHdr() })
          .then(r=>r.json())
          .then(d=>({ table: m.table, count: d.total ?? (d.data?.length ?? 0) }))
          .catch(()=>({ table: m.table, count: 0 }))
      )
    ).then(results => {
      const c: Record<string,number> = {};
      results.forEach(r => { c[r.table] = r.count; });
      setCounts(c);
    }).catch(() => {});
  }, [MODULES]);

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("ui.主数据管理", "主数据管理")} subtitle={t("ui.养殖场产品组织门店档案统一管理入口", "养殖场·产品·组织·门店档案的统一管理入口")}
        breadcrumb={[t("ui.系统管理", "系统管理"), t("ui.主数据", "主数据")]}/>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:16, marginTop:8 }}>
        {MODULES.map(m => (
          <button key={m.path} type="button" onClick={() => router.push(m.path)}
            style={{ background:"var(--bg-card)", border:"1px solid var(--border)",
              borderRadius:"var(--radius-lg)", padding:24, cursor:"pointer", textAlign:"left",
              display:"flex", alignItems:"flex-start", gap:16,
              transition:"border-color 0.15s,box-shadow 0.15s,transform 0.15s" }}
            onMouseEnter={e=>{
              (e.currentTarget as HTMLElement).style.borderColor=m.color;
              (e.currentTarget as HTMLElement).style.boxShadow="var(--shadow-md)";
              (e.currentTarget as HTMLElement).style.transform="translateY(-2px)";
            }}
            onMouseLeave={e=>{
              (e.currentTarget as HTMLElement).style.borderColor="var(--border)";
              (e.currentTarget as HTMLElement).style.boxShadow="none";
              (e.currentTarget as HTMLElement).style.transform="none";
            }}>
            <div style={{ color:m.color, background:`color-mix(in srgb,${m.color} 14%,transparent)`,
              borderRadius:"var(--radius-md)", padding:12, flexShrink:0 }}>{m.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:15, color:"var(--text-primary)", marginBottom:4 }}>{m.label}</div>
              <div style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:10 }}>{m.desc}</div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <Database size={12} color="var(--text-secondary)"/>
                <span style={{ fontSize:11, color:"var(--text-secondary)", fontFamily:"monospace" }}>{m.table}</span>
                <span style={{ marginLeft:"auto", fontSize:13, fontWeight:700, color:m.color }}>
                  {counts[m.table] ?? "—"} {t("ui.条", "条")}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
