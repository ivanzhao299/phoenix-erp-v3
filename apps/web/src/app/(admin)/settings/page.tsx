"use client";
import { useRouter } from "next/navigation";
import {
  User, Shield, Globe, Database, Smartphone, Lock,
  Package, Activity, GitMerge, ClipboardList, FileText, Settings
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useLanguage();

  const SETTINGS_GROUPS = [
    {
      title: t('ui.基础管理', '基础管理'),
      color: "#3b82f6",
      items: [
        { path:"/settings/profile",      icon:<User size={20}/>,         title:t('ui.个人中心', '个人中心'),     desc:t('ui.修改个人资料与登录密码', '修改个人资料与登录密码') },
        { path:"/settings/users",        icon:<User size={20}/>,         title:t('ui.用户管理', '用户管理'),     desc:t('ui.新增冻结与调配系统账号', '新增、冻结与调配系统账号') },
        { path:"/settings/roles",        icon:<Shield size={20}/>,       title:t('ui.角色权限', '角色权限'),     desc:t('ui.配置角色及菜单访问权限', '配置角色及菜单访问权限') },
        { path:"/settings/organizations",icon:<Globe size={20}/>,        title:t('ui.组织架构', '组织架构'),     desc:t('ui.公司部门员工层级管理', '公司·部门·员工层级管理') },
      ],
    },
    {
      title: t('ui.主数据与业务配置', '主数据与业务配置'),
      color: "#10b981",
      items: [
        { path:"/settings/products",     icon:<Package size={20}/>,      title:t('ui.商品档案', '商品档案'),     desc:t('ui.鲜蛋品级规格SKU双语维护', '鲜蛋品级·规格·SKU双语维护') },
        { path:"/settings/dict",         icon:<Database size={20}/>,     title:t('ui.数据字典', '数据字典'),     desc:t('ui.枚举值单位税率基础参数', '枚举值·单位·税率基础参数') },
        { path:"/settings/master-data",  icon:<FileText size={20}/>,     title:t('ui.主数据配置', '主数据配置'),   desc:t('ui.物料供应商基础数据同步', '物料·供应商基础数据同步') },
        { path:"/settings/store-stock",  icon:<ClipboardList size={20}/>,title:t('ui.门店库存配置', '门店库存配置'), desc:t('ui.门店SKU分配与安全库存', '门店 SKU 分配与安全库存') },
      ],
    },
    {
      title: t('ui.系统与安全', '系统与安全'),
      color: "#8b5cf6",
      items: [
        { path:"/settings/security",     icon:<Lock size={20}/>,         title:t('ui.安全策略', '安全策略'),     desc:t('ui.登录限制会话超时日志', '登录限制·会话超时·日志') },
        { path:"/settings/audit-log",    icon:<Activity size={20}/>,     title:t('ui.审计日志', '审计日志'),     desc:t('ui.全量操作日志追踪查询', '全量操作日志追踪查询') },
        { path:"/settings/approval-flows",icon:<GitMerge size={20}/>,   title:t('ui.审批流配置', '审批流配置'),   desc:t('ui.单据金额阈值与审批角色链', '单据金额阈值与审批角色链') },
        { path:"/settings/permissions",  icon:<Shield size={20}/>,       title:t('ui.权限管理', '权限管理'),     desc:t('ui.细粒度功能权限控制', '细粒度功能权限控制') },
      ],
    },
    {
      title: t('ui.终端与初始化', '终端与初始化'),
      color: "#f59e0b",
      items: [
        { path:"/settings/pos-config",   icon:<Smartphone size={20}/>,   title:t('ui.POS终端', 'POS 终端'),     desc:t('ui.门店收银设备参数配置', '门店收银设备参数配置') },
        { path:"/settings/pda-terminals",icon:<Smartphone size={20}/>,   title:t('ui.PDA终端', 'PDA 终端'),     desc:t('ui.工业PDA设备注册管理', '工业 PDA 设备注册管理') },
        { path:"/settings/brand",        icon:<Settings size={20}/>,     title:t('ui.品牌设置', '品牌设置'),     desc:t('ui.系统名称Logo主题色', '系统名称·Logo·主题色') },
        { path:"/settings/system-init",  icon:<Database size={20}/>,     title:t('ui.系统初始化', '系统初始化'),   desc:t('ui.超管专用初始化基础数据', '⚠️ 超管专用：初始化基础数据') },
      ],
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('ui.系统设置', '系统设置')}
        subtitle={t('ui.用户角色数据字典安全策略终端管理', '用户·角色·数据字典·安全策略·终端管理')}
        breadcrumb={[t('ui.系统设置', '系统设置')]}
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
