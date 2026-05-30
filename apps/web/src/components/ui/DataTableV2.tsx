'use client';
/**
 * DataTableV2 — 标准数据表格 · Design System V2
 * ================================================
 * 统一布局：工具栏 → 统计条 → 表格 → 分页 → 空状态/加载态。
 * 全部颜色来自 @theme inline token，无 dark:slate-* 硬编码。
 *
 * 用法：
 *   <DataTableV2
 *     title="订单列表"
 *     columns={columns}
 *     data={rows}
 *     loading={loading}
 *     total={total}
 *     page={page}
 *     pageSize={20}
 *     onPageChange={setPage}
 *     onRefresh={load}
 *     stats={[{ label: "总计", value: total }]}
 *     actions={<button>新建</button>}
 *   />
 */
import React from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── 列定义 ────────────────────────────────────────────────────────────────
export interface TableColumn<T = Record<string, unknown>> {
  key: string;
  title: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  /** 自定义渲染，不提供则直接展示 row[key] */
  render?: (value: unknown, row: T, index: number) => React.ReactNode;
  /** 是否固定列宽（截断超长文字） */
  ellipsis?: boolean;
}

// ── Props ────────────────────────────────────────────────────────────────
export interface DataTableV2Props<T = Record<string, unknown>> {
  /** 表格标题（显示在工具栏左侧） */
  title?: string;
  /** 工具栏右侧自定义操作（如新建按钮、导出按钮） */
  actions?: React.ReactNode;
  /** 表格上方的统计徽章 */
  stats?: { label: string; value: string | number; highlight?: boolean }[];
  /** 过滤区域（工具栏下方） */
  filterBar?: React.ReactNode;
  /** 列定义 */
  columns: TableColumn<T>[];
  /** 数据行 */
  data: T[];
  /** 行唯一 key，默认取 row.id */
  rowKey?: keyof T | ((row: T) => string | number);
  /** 加载中 */
  loading?: boolean;
  /** 空状态提示文字 */
  emptyText?: string;
  /** 当前页（1-based） */
  page?: number;
  /** 每页条数 */
  pageSize?: number;
  /** 总条数（用于分页计算） */
  total?: number;
  /** 翻页回调 */
  onPageChange?: (page: number) => void;
  /** 刷新回调（显示刷新按钮） */
  onRefresh?: () => void;
  /** 附加 className */
  className?: string;
}

// ── 骨架屏 ─────────────────────────────────────────────────────────────────
function SkeletonRows({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-border">
          {Array.from({ length: columns }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-3.5 bg-bg-muted rounded animate-pulse" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── 主组件 ─────────────────────────────────────────────────────────────────
export function DataTableV2<T = Record<string, unknown>>({
  title,
  actions,
  stats,
  filterBar,
  columns,
  data,
  rowKey,
  loading = false,
  emptyText = '暂无数据',
  page = 1,
  pageSize = 20,
  total,
  onPageChange,
  onRefresh,
  className = '',
}: DataTableV2Props<T>) {
  const totalPages = total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : undefined;

  const getRowKey = (row: T, index: number): string | number => {
    if (!rowKey) return (row as Record<string, unknown>).id as string | number ?? index;
    if (typeof rowKey === 'function') return rowKey(row);
    return (row as Record<string, unknown>)[rowKey as string] as string | number ?? index;
  };

  const alignClass = (align?: 'left' | 'center' | 'right') =>
    align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';

  return (
    <div className={cn(
      'rounded-2xl border border-border bg-bg-card shadow-card overflow-hidden',
      className,
    )}>

      {/* ── 工具栏 ─────────────────────────────────────────────────────────── */}
      {(title || actions || onRefresh) && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-3">
            {title && (
              <span className="text-sm font-semibold text-text">{title}</span>
            )}
            {total !== undefined && (
              <span className="text-xs text-text-dim">共 {total} 条</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs',
                  'border border-border bg-bg-page text-text-muted',
                  'hover:bg-bg-muted disabled:opacity-50 transition-colors cursor-pointer',
                )}
              >
                <RefreshCw
                  size={12}
                  className={loading ? 'animate-spin' : ''}
                />
                刷新
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 统计条 ─────────────────────────────────────────────────────────── */}
      {stats && stats.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 bg-bg-muted/50 border-b border-border">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-xs">
              <span className="text-text-dim">{s.label}</span>
              <span className={cn('font-semibold', s.highlight ? 'text-danger' : 'text-text-muted')}>
                {s.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── 过滤区 ─────────────────────────────────────────────────────────── */}
      {filterBar && (
        <div className="px-5 py-3 border-b border-border bg-bg-card">
          {filterBar}
        </div>
      )}

      {/* ── 表格 ───────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-muted/40">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={cn(
                    'px-4 py-2.5 text-xs font-semibold text-text-muted whitespace-nowrap',
                    alignClass(col.align),
                  )}
                >
                  {col.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows columns={columns.length} />
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-text-dim">
                    <Inbox size={32} className="opacity-40" />
                    <span className="text-sm">{emptyText}</span>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, index) => (
                <tr
                  key={getRowKey(row, index)}
                  className={cn(
                    'border-b border-border/30 hover:bg-bg-muted/30 transition-colors',
                    index === data.length - 1 ? 'border-b-0' : '',
                    index % 2 !== 0 ? 'bg-bg-muted/15' : '',
                  )}
                >
                  {columns.map((col) => {
                    const raw = (row as Record<string, unknown>)[col.key];
                    const cell = col.render ? col.render(raw, row, index) : String(raw ?? '—');
                    return (
                      <td
                        key={col.key}
                        className={cn(
                          'px-4 py-3 text-text-muted',
                          alignClass(col.align),
                          col.ellipsis ? 'max-w-[180px] truncate' : '',
                        )}
                      >
                        {cell}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── 分页 ───────────────────────────────────────────────────────────── */}
      {totalPages !== undefined && totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-bg-card">
          <span className="text-xs text-text-dim">
            第 {page} / {totalPages} 页
            {total !== undefined && `，共 ${total} 条`}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1 || loading}
              onClick={() => onPageChange(page - 1)}
              className={cn(
                'p-1.5 rounded-lg border border-border text-text-muted',
                'hover:bg-bg-muted disabled:opacity-40 disabled:cursor-not-allowed',
                'transition-colors cursor-pointer',
              )}
            >
              <ChevronLeft size={14} />
            </button>

            {/* 页码按钮（最多显示 5 个） */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p = i + 1;
              if (totalPages > 5) {
                if (page <= 3) p = i + 1;
                else if (page >= totalPages - 2) p = totalPages - 4 + i;
                else p = page - 2 + i;
              }
              return (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  className={cn(
                    'min-w-[28px] h-7 px-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                    p === page
                      ? 'bg-brand text-white'
                      : 'border border-border text-text-muted hover:bg-bg-muted',
                  )}
                >
                  {p}
                </button>
              );
            })}

            <button
              disabled={page >= totalPages || loading}
              onClick={() => onPageChange(page + 1)}
              className={cn(
                'p-1.5 rounded-lg border border-border text-text-muted',
                'hover:bg-bg-muted disabled:opacity-40 disabled:cursor-not-allowed',
                'transition-colors cursor-pointer',
              )}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataTableV2;
