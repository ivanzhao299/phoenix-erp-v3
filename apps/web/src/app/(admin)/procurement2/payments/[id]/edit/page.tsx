"use client";

// G149：编辑付款单——独立整页（仅草稿可编辑，入口在列表页操作列）。
import { use } from "react";
import PageHeader from "@/components/PageHeader";
import PaymentForm from "../../PaymentForm";
import { useLanguage } from "@/contexts/LanguageContext";

export default function EditPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useLanguage();
  return (
    <div className="animate-fade-in">
      <PageHeader title={t('prc2.payment_edit_title', '编辑付款单')} subtitle={t('prc2.payment_edit_subtitle', '修改草稿付款单内容')} breadcrumb={[t('prc2.bc_procurement', '采购管理'), t('prc2.bc_payments', '付款管理'), t('prc2.bc_edit', '编辑')]} />
      <PaymentForm paymentId={id} />
    </div>
  );
}
