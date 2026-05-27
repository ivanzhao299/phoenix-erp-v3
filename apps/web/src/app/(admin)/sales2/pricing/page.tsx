"use client";
import { Tag } from "lucide-react";
import PageHeader from "@/components/PageHeader";

/**
 * Sales V2 Phase 0 — 价格管理占位页
 *
 * Phase 2 将实装：
 *   · sal_price_books + sal_price_items
 *   · 取代 ord_prices + prc_price_items（SalesEngine 幽灵引用废弃）
 *   · 支持：渠道价、客户专属价、品级价、数量阶梯价
 *   · 价格审批：Workflow 2.0 SALES_PRICE_APPROVAL
 *   · 底价保护：floor_price（低于此须走低价审批）
 *   · 有效期管理：effective_from / effective_to
 */
export default function SalesV2PricingPage() {
  return (
    <div style={{ padding: "24px 32px", maxWidth: 900 }}>
      <PageHeader
        title="价格管理 V2"
        subtitle="sal_price_books / sal_price_items · Phase 2 开发中"
      />
      <div style={{ padding: "60px 0", textAlign: "center", opacity: 0.4 }}>
        <Tag size={48} style={{ margin: "0 auto 16px" }} />
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          Price Runtime — Phase 2 开发中
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          统一 ord_prices + prc_price_items → sal_price_books / sal_price_items<br />
          支持：按渠道、客户、品级（0/1/2/3）、包装规格、数量阶梯定价<br />
          价格变更须走 Workflow 2.0 审批，有效期自动管控
        </div>
      </div>
      <div style={{ marginTop: 16, fontSize: 13, opacity: 0.5, textAlign: "center" }}>
        当前可前往旧模块只读查看：
        {" "}
        <a href="/order/prices" style={{ color: "#f59e0b" }}>/order/prices</a>
      </div>
    </div>
  );
}
