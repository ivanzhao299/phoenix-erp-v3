"use client";
import PageHeader from "@/components/PageHeader";
import { FileWarning } from "lucide-react";

export default function Page() {
  return (
    <div>
      <PageHeader
        title="错误日志"
        subtitle="系统异常记录 · 错误追踪 · 告警聚合"
      />
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-5">
          <FileWarning size={28} className="text-brand" />
        </div>
        <h2 className="text-lg font-bold text-text mb-2">错误日志</h2>
        <p className="text-sm text-text-muted mb-8 max-w-sm">系统异常记录 · 错误追踪 · 告警聚合</p>
        <div className="grid grid-cols-2 gap-3 max-w-sm w-full">
                    <div className="rounded-xl border border-border bg-bg-card px-4 py-3 text-sm text-text-muted text-left">错误日志查询</div>
          <div className="rounded-xl border border-border bg-bg-card px-4 py-3 text-sm text-text-muted text-left">异常堆栈查看</div>
          <div className="rounded-xl border border-border bg-bg-card px-4 py-3 text-sm text-text-muted text-left">告警聚合统计</div>
          <div className="rounded-xl border border-border bg-bg-card px-4 py-3 text-sm text-text-muted text-left">日志导出</div>
        </div>
        <div className="mt-8 px-4 py-2 rounded-full bg-bg-muted text-xs text-text-dim">
          功能开发中，敬请期待
        </div>
      </div>
    </div>
  );
}
