"use client";

// G149：编辑付款单——独立整页（仅草稿可编辑，入口在列表页操作列）。
import { use } from "react";
import PageHeader from "@/components/PageHeader";
import PaymentForm from "../../PaymentForm";

export default function EditPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="animate-fade-in">
      <PageHeader title="编辑付款单" subtitle="修改草稿付款单内容" breadcrumb={["采购管理", "付款管理", "编辑"]} />
      <PaymentForm paymentId={id} />
    </div>
  );
}
