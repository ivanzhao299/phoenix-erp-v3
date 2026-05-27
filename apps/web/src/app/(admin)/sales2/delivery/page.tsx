"use client";
import { Truck } from "lucide-react";
import PageHeader from "@/components/PageHeader";

/**
 * Sales V2 Phase 0 — 配送管理占位页
 *
 * Phase 4 将实装：
 *   · sal_delivery_orders（取代 log_dispatch / generic-crud Demo）
 *   · 关联 sal_sales_orders.id
 *   · 字段：装车时间、发车时间、到达时间、签收时间
 *   · 司机、车辆档案关联
 *   · 超时预警（Phase 4 SLA）
 *   · 路线规划（Phase 9 算法优化）
 */
export default function SalesV2DeliveryPage() {
  return (
    <div style={{ padding: "24px 32px", maxWidth: 900 }}>
      <PageHeader
        title="配送管理 V2"
        subtitle="sal_delivery_orders · Phase 4 开发中"
      />
      <div style={{ padding: "60px 0", textAlign: "center", opacity: 0.4 }}>
        <Truck size={48} style={{ margin: "0 auto 16px" }} />
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          Delivery Runtime — Phase 4 开发中
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          配送单 + 装车/发车/到达/签收时间戳<br />
          司机档案 + 车辆档案 + 路线管理<br />
          关联销售订单，超时自动预警<br />
          取代 log_dispatch / log_receipts（已冻结）
        </div>
      </div>
      <div style={{ marginTop: 16, fontSize: 13, opacity: 0.5, textAlign: "center" }}>
        当前可前往旧模块只读查看：
        {" "}
        <a href="/transport" style={{ color: "#f59e0b" }}>/transport</a>
      </div>
    </div>
  );
}
