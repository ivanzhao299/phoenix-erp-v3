"use client";
import PageHeader from "@/components/PageHeader";
import { Database } from "lucide-react";

export default function Page() {
  return (
    <div>
      <PageHeader
        title="备份策略"
        subtitle="数据库备份 · 定时备份 · 备份记录"
      />
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-5">
          <Database size={28} className="text-brand" />
        </div>
        <h2 className="text-lg font-bold text-text mb-2">备份策略</h2>
        <p className="text-sm text-text-muted mb-8 max-w-sm">数据库备份 · 定时备份 · 备份记录</p>
        <div className="grid grid-cols-2 gap-3 max-w-sm w-full">
                    <div className="rounded-xl border border-border bg-bg-card px-4 py-3 text-sm text-text-muted text-left">定时备份配置</div>
          <div className="rounded-xl border border-border bg-bg-card px-4 py-3 text-sm text-text-muted text-left">手动备份触发</div>
          <div className="rounded-xl border border-border bg-bg-card px-4 py-3 text-sm text-text-muted text-left">备份文件管理</div>
          <div className="rounded-xl border border-border bg-bg-card px-4 py-3 text-sm text-text-muted text-left">恢复点管理</div>
        </div>
        <div className="mt-8 px-4 py-2 rounded-full bg-bg-muted text-xs text-text-dim">
          功能开发中，敬请期待
        </div>
      </div>
    </div>
  );
}
