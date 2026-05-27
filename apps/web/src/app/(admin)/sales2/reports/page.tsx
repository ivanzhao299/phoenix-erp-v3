"use client";
import { BarChart2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";

/**
 * Sales V2 Phase 0 — 销售报表占位页
 *
 * Phase 8 将实装：
 *   · 销售日报（按公司/渠道/客户）
 *   · 客户欠款账龄（读 fin_ar_invoices）
 *   · 渠道销量趋势
 *   · 区域销量分布
 *   · 价格异常报表（低于底价销售）
 *   · 所有报表读取 sal_* + fin_ar_invoices，不读旧表
 */
export default function SalesV2ReportsPage() {
  return (
    <div style={{ padding: "24px 32px", maxWidth: 900 }}>
      <PageHeader
        title="销售报表 V2"
        subtitle="Sales Reports Runtime · Phase 8 开发中"
      />
      <div style={{ padding: "60px 0", textAlign: "center", opacity: 0.4 }}>
        <BarChart2 size={48} style={{ margin: "0 auto 16px" }} />
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          Sales Reports Runtime — Phase 8 开发中
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          销售日报 / 客户欠款账龄 / 渠道销量<br />
          区域销量分布 / 价格异常分析<br />
          数据源：sal_* + fin_ar_invoices（Finance V2 AR Runtime）
        </div>
      </div>
    </div>
  );
}
