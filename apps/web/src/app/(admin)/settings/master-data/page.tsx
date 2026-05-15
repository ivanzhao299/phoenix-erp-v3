"use client";
import PageHeader from "@/components/PageHeader";
import { Database, TrendingUp, ShieldCheck, Box } from "lucide-react";
import Link from "next/link";
import s from "@/components/ui/admin-ui.module.css";
const STATUS_CLS: Record<string,string> = {"active":s.badgeSuccess, "inactive":s.badgeNeutral};


const CARDS = [
  {
    icon: <Box size={22} color="var(--color-primary)"/>,
    title: "新品准入与批次追溯",
    code: "MDM-011/014",
    desc: "配置新品试销期天数及跨部门会签流程。设定蛋品批次生成规则（养殖场+入库日期+序号），启用全局先进先出 (FIFO) 及临期预警阈值。",
    link: "/settings/products",
    action: "进入商品主数据配置",
    color: "var(--color-primary)",
    tip: "",
  },
  {
    icon: <TrendingUp size={22} color="#f59e0b"/>,
    title: "提成方案模板配置",
    code: "MDM-012",
    desc: "维护业务员、店长、KA经理的提成底座。包括：基础提成率、新客开发奖阈值、以及订单四时点（下单/发货/回款/期满）的释放比例。",
    link: "/settings/dict",
    action: "管理提成测算模板",
    color: "#f59e0b",
    tip: "在数据字典中维护 BS_COMMISSION 相关字典类型",
  },
  {
    icon: <ShieldCheck size={22} color="#10b981"/>,
    title: "信用评级与额度体系",
    code: "MDM-013",
    desc: "设定 A/B/C/D 信用评级对应的基础额度上限。调整回款历史、合作年限在 CLV 评分引擎中的权重，配置逾期 7/15/30 天的自动预警动作。",
    link: "/order/credit",
    action: "进入信用台账管理",
    color: "#10b981",
    tip: "",
  },
  {
    icon: <Database size={22} color="#ef4444"/>,
    title: "反舞弊比对字典",
    code: "MDM-015",
    desc: "维护审计模块用于识别「关联交易」与「经销商串货套利」的比对维度权重（身份证号100%、银行账号100%、地址重合50%等）。",
    link: "/settings/security",
    action: "进入安全与合规策略",
    color: "#ef4444",
    tip: "",
  },
];

export default function MasterDataConfigPage() {
  return (
    <div className="animate-fade-in">
      <PageHeader title="主数据与基础参数配置 (MDM)" subtitle="集中管理新品准入、提成模板、信用评级体系及批次追溯等核心业务规则字典" breadcrumb={["系统设置", "主数据配置"]}/>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {CARDS.map(c => (
          <div key={c.code} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 24, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              {c.icon}
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{c.title}</h3>
                <span style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "monospace" }}>{c.code}</span>
              </div>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: c.tip ? 10 : 18, flex: 1 }}>{c.desc}</p>
            {c.tip && (
              <div style={{ fontSize: 11, color: c.color, background: `${c.color}12`, border: `1px solid ${c.color}30`, borderRadius: "var(--radius-sm)", padding: "6px 10px", marginBottom: 14 }}>
                💡 {c.tip}
              </div>
            )}
            <Link href={c.link} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "var(--bg-page)", border: `1px solid ${c.color}`, borderRadius: "var(--radius-md)", fontSize: 13, fontWeight: 600, color: c.color, textDecoration: "none", transition: "all 0.15s" }}
              onMouseEnter={(e: any) => { e.currentTarget.style.background = `${c.color}12`; }}
              onMouseLeave={(e: any) => { e.currentTarget.style.background = "var(--bg-page)"; }}>
              {c.action} →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
