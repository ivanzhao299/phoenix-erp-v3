"use client";

// G149：新建付款单——独立整页（替代原列表页右侧抽屉，数据多时展示更清晰）。
import PageHeader from "@/components/PageHeader";
import PaymentForm from "../PaymentForm";

export default function NewPaymentPage() {
  return (
    <div className="animate-fade-in">
      <PageHeader title="新建付款单" subtitle="采购资金付款 · 填写后保存为草稿，再提交审批" breadcrumb={["采购管理", "付款管理", "新建"]} />
      <PaymentForm />
    </div>
  );
}
