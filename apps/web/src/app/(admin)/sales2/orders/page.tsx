"use client";
import { ShoppingCart } from "lucide-react";
import PageHeader from "@/components/PageHeader";

/**
 * Sales V2 Phase 0 — 销售订单占位页
 *
 * Phase 3 将实装：
 *   · sal_sales_orders + sal_order_items
 *   · 完整状态机：DRAFT→APPROVED→ALLOCATED→PICKED→LOADED→SHIPPED→DELIVERED→RECEIVED→RECONCILED
 *   · 价格审批：Workflow 2.0 SALES_PRICE_APPROVAL
 *   · 赊销审批：Workflow 2.0 SALES_CREDIT_APPROVAL
 *   · 签收后自动生成 fin_ar_invoices（Finance V2 AR Runtime）
 *   · 禁止继续写 fin_transactions（已废弃）
 */
export default function SalesV2OrdersPage() {
  return (
    <div style={{ padding: "24px 32px", maxWidth: 900 }}>
      <PageHeader
        title="销售订单 V2"
        subtitle="sal_sales_orders · Phase 3 开发中"
      />
      <div style={{ padding: "60px 0", textAlign: "center", opacity: 0.4 }}>
        <ShoppingCart size={48} style={{ margin: "0 auto 16px" }} />
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          Sales Order Runtime — Phase 3 开发中
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          标准状态机 12 状态 + Workflow 2.0 价格/赊销审批<br />
          签收后自动生成 fin_ar_invoices（Finance V2 AR Runtime）<br />
          信用额度联动：credit_used 实时扣减与释放
        </div>
      </div>
      <div style={{ marginTop: 16, fontSize: 13, opacity: 0.5, textAlign: "center" }}>
        当前可前往旧模块只读查看：
        {" "}
        <a href="/order" style={{ color: "#f59e0b" }}>/order</a>
      </div>
    </div>
  );
}
