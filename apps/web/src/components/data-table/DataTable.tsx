"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Pencil, Trash2, Plus, RefreshCw } from "lucide-react";
import { crudApi } from "@/lib/api-client";
import { useLanguage } from "@/contexts/LanguageContext";
import type { PaginationParams } from "@/types";
import styles from "./data-table.module.css";

// ── Types ────────────────────────────────────────────────────
export interface Column<T = Record<string, unknown>> {
  key: string;
  title: string;
  width?: number;
  render?: (value: unknown, row: T) => React.ReactNode;
  align?: "left" | "center" | "right";
}

export interface DataTableProps<T = Record<string, unknown>> {
  table: string;
  columns: Column<T>[];
  params?: Record<string, unknown>;
  onRowClick?: (row: T) => void;
  onNew?: () => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  rowKey?: string;
  pageSize?: number;
  emptyText?: string;
  showActions?: boolean;
  newLabel?: string;
  refreshKey?: number;
}

// ── DataTable ────────────────────────────────────────────────
export function DataTable<T = Record<string, unknown>>({
  table,
  columns,
  params = {},
  onRowClick,
  onNew,
  onEdit,
  onDelete,
  rowKey = "id",
  pageSize = 20,
  emptyText: _emptyText,
  showActions = false,
  newLabel: _newLabel,
  refreshKey = 0,
}: DataTableProps<T>) {
  const { t } = useLanguage();
  const emptyText = _emptyText ?? t('common.no_data', '暂无数据');
  const newLabel  = _newLabel  ?? t('common.new',     '新增');
  const [data, setData]       = useState<T[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // ✅ 关键修复：用 useRef 稳定 params，避免每次渲染时 JSON.stringify 产生新字符串引用
  // JSON.stringify 在 deps 数组中每次都是新字符串 → useCallback 永远重新创建 → 无限请求
  const paramsKey = useMemo(() => JSON.stringify(params), [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const paramsRef = useRef(params);
  useEffect(() => { paramsRef.current = params; }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await crudApi.list<T>(table, {
        ...paramsRef.current,
        limit:  pageSize,
        offset: (page - 1) * pageSize,
      } as PaginationParams, { signal });
      if (signal.aborted) return;
      if (Array.isArray(res)) {
        setData(res as T[]);
        setTotal((res as T[]).length);
      } else {
        setData(res.data ?? []);
        setTotal(res.total ?? 0);
      }
    } catch (e: any) {
      if (signal.aborted || e?.name === 'AbortError') return; // cancelled — ignore
      const msg = e instanceof Error ? e.message : t('ui.加载失败', '加载失败');
      const isEmptyState = msg.includes("does not exist") ||
        msg.includes("relation") || msg.includes("404") ||
        msg.includes("403") || msg.includes("not found");
      if (isEmptyState) { setData([]); setTotal(0); }
      else setError(msg);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [table, page, pageSize, refreshKey, paramsKey]); // ✅ paramsKey 只在 params 真正变化时才变

  // AbortController cancels in-flight request on cleanup — prevents React Strict Mode
  // from firing two simultaneous requests to the server (cleanup aborts the first).
  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // ✅ 重置页码：只在 table 或 paramsKey 变化时触发，避免每次渲染都触发
  useEffect(() => { setPage(1); }, [table, paramsKey]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 操作列
  const allColumns: Column<T>[] = showActions
    ? [...columns, {
        key: "__actions__",
        title: t('common.operation', '操作'),
        width: 100,
        align: "center" as const,
        render: (_: unknown, row: T) => (
          <div className={styles.actionBtns}>
            {onEdit && (
              <button
type="button"                 className={styles.editBtn}
                title={t('common.edit', '编辑')}
                onClick={e => { e.stopPropagation(); onEdit(row); }}
              >
                <Pencil size={13} />
              </button>
            )}
            {onDelete && (
              <button
type="button"                 className={styles.deleteBtn}
                title={t('common.delete', '删除')}
                onClick={e => { e.stopPropagation(); onDelete(row); }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ),
      }]
    : columns;

  return (
    <div className={styles.wrap}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <span className={styles.totalInfo}>{t('ui.共', '共')} <b>{total}</b> {t('ui.条记录', '条记录')}</span>
        <div className={styles.toolbarRight}>
          <button type="button" className={styles.refreshBtn} onClick={() => { const ctrl = new AbortController(); load(ctrl.signal); }} title={t('common.refresh', '刷新')}>
            <RefreshCw size={14} />
          </button>
          {onNew && (
            <button type="button" className={styles.newBtn} onClick={onNew}>
              <Plus size={15} />
              {newLabel}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        {loading && <div className={styles.overlay}><span className={styles.spinner} /></div>}
        <table className={styles.table}>
          <thead>
            <tr>
              {allColumns.map(col => (
                <th
                  key={col.key}
                  className={styles.th}
                  style={{ width: col.width, textAlign: col.align ?? "left" }}
                >
                  {col.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr><td colSpan={allColumns.length} className={styles.empty}>
                <span className={styles.errorText}>⚠ {error}</span>
              </td></tr>
            ) : data.length === 0 && !loading ? (
              <tr><td colSpan={allColumns.length} className={styles.empty}>{emptyText}</td></tr>
            ) : data.map((row, i) => (
              <tr
                key={String((row as Record<string, unknown>)[rowKey] ?? i)}
                className={`${styles.tr} ${onRowClick ? styles.clickable : ""}`}
                onClick={() => onRowClick?.(row)}
              >
                {allColumns.map(col => (
                  <td
                    key={col.key}
                    className={styles.td}
                    style={{ textAlign: col.align ?? "left" }}
                  >
                    {col.render
                      ? col.render((row as Record<string, unknown>)[col.key], row)
                      : String((row as Record<string, unknown>)[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button type="button" className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('ui.上一页', '上一页')}</button>
          <span className={styles.pageCurrent}>{page} / {totalPages}</span>
          <button type="button" className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{t('ui.下一页', '下一页')}</button>
        </div>
      )}
    </div>
  );
}
