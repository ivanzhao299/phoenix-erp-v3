"use client";
import PageHeader from "@/components/PageHeader";
import { Store } from "lucide-react";

export default function Page() {
  return (
    <div>
      <PageHeader
        title="门店档案"
        subtitle="直营门店主档 · 门店编码 · 地址 · 负责人"
      />
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-5">
          <Store size={28} className="text-brand" />
        </div>
        <h2 className="text-lg font-bold text-text mb-2">门店档案</h2>
        <p className="text-sm text-text-muted mb-8 max-w-sm">直营门店主档 · 门店编码 · 地址 · 负责人</p>
        <div className="grid grid-cols-2 gap-3 max-w-sm w-full">
                    <div className="rounded-xl border border-border bg-bg-card px-4 py-3 text-sm text-text-muted text-left">门店基础信息</div>
          <div className="rounded-xl border border-border bg-bg-card px-4 py-3 text-sm text-text-muted text-left">门店区域划分</div>
          <div className="rounded-xl border border-border bg-bg-card px-4 py-3 text-sm text-text-muted text-left">负责人配置</div>
          <div className="rounded-xl border border-border bg-bg-card px-4 py-3 text-sm text-text-muted text-left">门店状态管理</div>
        </div>
        <div className="mt-8 px-4 py-2 rounded-full bg-bg-muted text-xs text-text-dim">
          功能开发中，敬请期待
        </div>
      </div>
    </div>
  );
}
