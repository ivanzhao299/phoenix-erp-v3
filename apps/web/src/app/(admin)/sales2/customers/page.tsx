"use client";
import { Users } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { LegacyFreezeBanner } from "@/components/LegacyFreezeBanner";

/**
 * Sales V2 Phase 0 — 客户主档占位页
 *
 * Phase 1 将实装：
 *   · sal_customers CRUD（统一客户主档）
 *   · 取代 ord_customers + b2b_customers
 *   · DataScope: company_code
 *   · 客户类型：DIRECT_STORE / DISTRIBUTOR / AGENT / KEY_ACCOUNT / RETAIL
 *   · 信用额度 + 账期管理
 *   · 风险分级：NORMAL / WATCH / BLACKLIST
 */
export default function SalesV2CustomersPage() {
  return (
    <div style={{ padding: "24px 32px", maxWidth: 900 }}>
      <PageHeader
        title="客户主档 V2"
        subtitle="sal_customers · Phase 1 开发中"
      />
      <div style={{ padding: "60px 0", textAlign: "center", opacity: 0.4 }}>
        <Users size={48} style={{ margin: "0 auto 16px" }} />
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          客户主档 Runtime — Phase 1 开发中
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          统一 ord_customers + b2b_customers → sal_customers<br />
          支持：直营店 / 经销商 / 代理商 / 大客户 / 散客零售<br />
          含信用额度、账期、风险分级、归属销售员
        </div>
      </div>
      <LegacyFreezeBanner
        newPath="/sales2/customers"
        newModuleName="Sales V2 客户主档"
        migrationPhase="Phase 1"
      />
      <div style={{ marginTop: 16, fontSize: 13, opacity: 0.5, textAlign: "center" }}>
        当前可前往旧模块只读查看：
        {" "}
        <a href="/order/customers" style={{ color: "#f59e0b" }}>/order/customers</a>
        {" · "}
        <a href="/b2b/customers" style={{ color: "#f59e0b" }}>/b2b/customers</a>
      </div>
    </div>
  );
}
