"use client";

// G158：新建采购订单——独立整页（替代原列表页右侧抽屉，数据多时展示更清晰）。
import PageHeader from "@/components/PageHeader";
import OrderForm from "../OrderForm";

export default function NewOrderPage() {
  return (
    <div className="animate-fade-in">
      <PageHeader title="新建采购订单" subtitle="采购订单 · 填写后保存为草稿，再提交审批" breadcrumb={["采购管理", "采购订单", "新建"]} />
      <OrderForm />
    </div>
  );
}
