"use client";

// G160：新建采购申请——独立整页（替代原列表页右侧抽屉，明细多时展示更清晰）。
import PageHeader from "@/components/PageHeader";
import RequestForm from "../RequestForm";
import { useLanguage } from "@/contexts/LanguageContext";

export default function NewRequestPage() {
  const { t } = useLanguage();
  return (
    <div className="animate-fade-in">
      <PageHeader title={t('prc2.request_new_title', '新建采购申请')} subtitle={t('prc2.request_new_subtitle', '填写采购需求与物料明细 · 保存为草稿，再提交审批')} breadcrumb={[t('prc2.bc_procurement', '采购管理'), t('prc2.bc_requests', '采购申请'), t('prc2.bc_new', '新建')]} />
      <RequestForm />
    </div>
  );
}
