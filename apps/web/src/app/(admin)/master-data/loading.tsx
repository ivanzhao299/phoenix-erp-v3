/**
 * 段级骨架屏（表格型页面）——App Router 在本段 page chunk 加载期自动渲染，
 * 比 (admin) 根级"KPI 卡"骨架更贴合本段以数据表为主的形态，减少切页突兀感。
 */
import { LoadingSkeleton } from "@/components/design-system";

export default function SegmentTableLoading() {
  return (
    <div style={{ padding: "24px 32px" }} aria-busy="true" aria-label="加载中">
      {/* 页头 */}
      <div style={{ marginBottom: 18 }}>
        <LoadingSkeleton variant="line" rows={1} width={200} height={22} />
        <div style={{ height: 8 }} />
        <LoadingSkeleton variant="line" rows={1} width={320} height={13} />
      </div>
      {/* 工具条（筛选/按钮占位） */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <LoadingSkeleton variant="line" rows={1} width={160} height={32} />
        <LoadingSkeleton variant="line" rows={1} width={120} height={32} />
        <div style={{ flex: 1 }} />
        <LoadingSkeleton variant="line" rows={1} width={96} height={32} />
      </div>
      {/* 数据表 */}
      <LoadingSkeleton variant="table" rows={10} cols={6} />
    </div>
  );
}
