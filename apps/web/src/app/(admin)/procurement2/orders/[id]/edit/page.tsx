"use client";

// G158：编辑采购订单——独立整页（仅草稿可编辑，入口在列表页操作列）。
import { use } from "react";
import PageHeader from "@/components/PageHeader";
import OrderForm from "../../OrderForm";
import { useLanguage } from "@/contexts/LanguageContext";

export default function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useLanguage();
  return (
    <div className="animate-fade-in">
      <PageHeader title={t('prc2.order_edit_title', '编辑采购订单')} subtitle={t('prc2.order_edit_subtitle', '修改草稿采购订单内容')} breadcrumb={[t('prc2.bc_procurement', '采购管理'), t('prc2.bc_orders', '采购订单'), t('prc2.bc_edit', '编辑')]} />
      <OrderForm orderId={id} />
    </div>
  );
}
