"use client";

// G158：新建采购订单——独立整页（替代原列表页右侧抽屉，数据多时展示更清晰）。
import PageHeader from "@/components/PageHeader";
import OrderForm from "../OrderForm";
import { useLanguage } from "@/contexts/LanguageContext";

export default function NewOrderPage() {
  const { t } = useLanguage();
  return (
    <div className="animate-fade-in">
      <PageHeader title={t('prc2.order_new_title', '新建采购订单')} subtitle={t('prc2.order_new_subtitle', '采购订单 · 填写后保存为草稿，再提交审批')} breadcrumb={[t('prc2.bc_procurement', '采购管理'), t('prc2.bc_orders', '采购订单'), t('prc2.bc_new', '新建')]} />
      <OrderForm />
    </div>
  );
}
