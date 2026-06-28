"use client";

// G149：新建付款单——独立整页（替代原列表页右侧抽屉，数据多时展示更清晰）。
import PageHeader from "@/components/PageHeader";
import PaymentForm from "../PaymentForm";
import { useLanguage } from "@/contexts/LanguageContext";

export default function NewPaymentPage() {
  const { t } = useLanguage();
  return (
    <div className="animate-fade-in">
      <PageHeader title={t('prc2.payment_new_title', '新建付款单')} subtitle={t('prc2.payment_new_subtitle', '采购资金付款 · 填写后保存为草稿，再提交审批')} breadcrumb={[t('prc2.bc_procurement', '采购管理'), t('prc2.bc_payments', '付款管理'), t('prc2.bc_new', '新建')]} />
      <PaymentForm />
    </div>
  );
}
