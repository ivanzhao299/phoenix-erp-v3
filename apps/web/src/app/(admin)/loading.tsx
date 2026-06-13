/**
 * G89 全局路由切换骨架屏 — App Router 在该 segment 的 page 加载期间自动渲染，
 * 留在 (admin)/layout.tsx 的 children 槽位（侧边栏保留），消除"切页白屏无反馈"。
 * 通用形态：页头一行 + 一排 KPI 卡 + 一块表格，覆盖绝大多数管理页。
 */
import { LoadingSkeleton } from "@/components/design-system";

export default function AdminLoading() {
  return (
    <div style={{ padding: "24px 32px" }} aria-busy="true" aria-label="加载中">
      {/* 页头 */}
      <div style={{ marginBottom: 20 }}>
        <LoadingSkeleton variant="line" rows={1} width={220} height={22} />
        <div style={{ height: 8 }} />
        <LoadingSkeleton variant="line" rows={1} width={340} height={13} />
      </div>
      {/* KPI 卡片排 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 20 }}>
        <LoadingSkeleton variant="card" />
        <LoadingSkeleton variant="card" />
        <LoadingSkeleton variant="card" />
        <LoadingSkeleton variant="card" />
      </div>
      {/* 表格 */}
      <LoadingSkeleton variant="table" rows={8} cols={5} />
    </div>
  );
}
