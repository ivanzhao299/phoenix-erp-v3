"use client";

// G160：新建采购申请——独立整页（替代原列表页右侧抽屉，明细多时展示更清晰）。
import PageHeader from "@/components/PageHeader";
import RequestForm from "../RequestForm";

export default function NewRequestPage() {
  return (
    <div className="animate-fade-in">
      <PageHeader title="新建采购申请" subtitle="填写采购需求与物料明细 · 保存为草稿，再提交审批" breadcrumb={["采购管理", "采购申请", "新建"]} />
      <RequestForm />
    </div>
  );
}
