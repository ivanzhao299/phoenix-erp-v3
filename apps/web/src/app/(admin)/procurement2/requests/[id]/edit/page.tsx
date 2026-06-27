"use client";

// G160：编辑采购申请——独立整页（仅草稿可编辑，入口在列表页操作列）。
import { use } from "react";
import PageHeader from "@/components/PageHeader";
import RequestForm from "../../RequestForm";

export default function EditRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="animate-fade-in">
      <PageHeader title="编辑采购申请" subtitle="修改草稿采购申请内容" breadcrumb={["采购管理", "采购申请", "编辑"]} />
      <RequestForm requestId={id} />
    </div>
  );
}
