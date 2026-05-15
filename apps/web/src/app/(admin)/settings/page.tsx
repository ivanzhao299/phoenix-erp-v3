"use client";
import { useRouter } from "next/navigation";
import {
  User, Shield, Globe, Database, Smartphone, Lock,
  Package, Activity, GitMerge, ClipboardList, FileText, Settings
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";

const SETTINGS_GROUPS = [
  {
    title: "基础管理",
    color: "#3b82f6",
    items: [
      { path:"/settings/profile",      icon:<User size={20}/>,         title:"个人中心",     desc:"修改个人资料与登录密码" },
      { path:"/settings/users",        icon:<User size={20}/>,         title:"用户管理",     desc:"新增、冻结与调配系统账号" },
      { path:"/settings/roles",        icon:<Shield size={20}/>,       title:"角色权限",     desc:"配置角色及菜单访问权限" },
      { path:"/settings/organizations",icon:<Globe size={20}/>,        title:"组织架构",     desc:"公司·部门·员工层级管理" },
    ],
  },
  {
    title: "主数据与业务配置",
    color: "#10b981",
    items: [
      { path:"/settings/products",     icon:<Package size={20}/>,      title:"商品档案",     desc:"鲜蛋品级·规格·SKU双语维护" },
      { path:"/settings/dict",         icon:<Database size={20}/>,     title:"数据字典",     desc:"枚举值·单位·税率基础参数" },
      { path:"/settings/master-data",  icon:<FileText size={20}/>,     title:"主数据配置",   desc:"物料·供应商基础数据同步" },
      { path:"/settings/store-stock",  icon:<ClipboardList size={20}/>,title:"门店库存配置", desc:"门店 SKU 分配与安全库存" },
    ],
  },
  {
    title: "系统与安全",
    color: "#8b5cf6",
    items: [
      { path:"/settings/security",     icon:<Lock size={20}/>,         title:"安全策略",     desc:"登录限制·会话超时·日志" },
      { path:"/settings/audit-log",    icon:<Activity size={20}/>,     title:"审计日志",     desc:"全量操作日志追踪查询" },
      { path:"/settings/approval-flows",icon:<GitMerge size={20}/>,   title:"审批流配置",   desc:"单据金额阈值与审批角色链" },
      { path:"/settings/permissions",  icon:<Shield size={20}/>,       title:"权限管理",     desc:"细粒度功能权限控制" },
    ],
  },
  {
    title: "终端与初始化",
    color: "#f59e0b",
    items: [
      { path:"/settings/pos-config",   icon:<Smartphone size={20}/>,   title:"POS 终端",     desc:"门店收银设备参数配置" },
      { path:"/settings/pda-terminals",icon:<Smartphone size={20}/>,   title:"PDA 终端",     desc:"工业 PDA 设备注册管理" },
      { path:"/settings/brand",        icon:<Settings size={20}/>,     title:"品牌设置",     desc:"系统名称·Logo·主题色" },
      { path:"/settings/system-init",  icon:<Database size={20}/>,     title:"系统初始化",   desc:"⚠️ 超管专用：初始化基础数据" },
    ],
  },
];

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="系统设置"
        subtitle="用户·角色·数据字典·安全策略·终端管理"
        breadcrumb={["系统设置"]}
      />

      <div style={{ display:"flex", flexDirection:"column", gap:28 }}>
        {SETTINGS_GROUPS.map(group => (
          <div key={group.title}>
            {/* 分组标题 */}
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
              <div style={{ width:4, height:18, background:group.color, borderRadius:2 }}/>
              <h3 style={{ fontSize:14, fontWeight:700, color:"var(--text-primary)" }}>{group.title}</h3>
            </div>

            {/* 设置卡片网格 */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:12 }}>
              {group.items.map(item => (
                <button key={item.path} type="button" onClick={() => router.push(item.path)}
                  style={{
                    background:"var(--bg-card)", border:"1px solid var(--border)",
                    borderRadius:"var(--radius-lg)", padding:"16px 18px",
                    display:"flex", alignItems:"center", gap:14, cursor:"pointer",
                    textAlign:"left", transition:"border-color 0.15s,box-shadow 0.15s,transform 0.12s",
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = group.color;
                    el.style.boxShadow   = "var(--shadow-md)";
                    el.style.transform   = "translateY(-1px)";
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = "var(--border)";
                    el.style.boxShadow   = "none";
                    el.style.transform   = "none";
                  }}>
                  {/* 图标 */}
                  <div style={{
                    color: group.color,
                    background: `color-mix(in srgb,${group.color} 12%,transparent)`,
                    borderRadius:"var(--radius-md)", padding:10, flexShrink:0,
                  }}>
                    {item.icon}
                  </div>
                  {/* 文字 */}
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color:"var(--text-primary)", marginBottom:3 }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize:12, color:"var(--text-secondary)", lineHeight:1.4 }}>
                      {item.desc}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
