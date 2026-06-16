"use client";

// G158：编辑采购订单——独立整页（仅草稿可编辑，入口在列表页操作列）。
import { use } from "react";
import PageHeader from "@/components/PageHeader";
import OrderForm from "../../OrderForm";

export default function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="animate-fade-in">
      <PageHeader title="编辑采购订单" subtitle="修改草稿采购订单内容" breadcrumb={["采购管理", "采购订单", "编辑"]} />
      <OrderForm orderId={id} />
    </div>
  );
}
