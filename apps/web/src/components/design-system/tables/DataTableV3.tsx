'use client';
import React, { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { EmptyState } from '../feedback/EmptyState';
import { LoadingSkeleton } from '../feedback/LoadingSkeleton';
import { StatusBadge } from '../status/StatusBadge';
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * DataTableV3 — 统一表格（Design System V2）。
 * 内置：排序 / 客户端分页 / 空状态 / 加载态 / 金额·日期·状态列格式化 / CSV 导出。
 * 暗色经 CSS 变量适配。取代手写 <table>/<thead>/<tbody> 与各页自做分页。
 *
 * 用法：
 *   <DataTableV3 rows={data} columns={[
 *     { key:'no', title:'编号' },
 *     { key:'amount', title:'金额', type:'money' },
 *     { key:'date', title:'日期', type:'date' },
 *     { key:'status', title:'状态', type:'status' },
 *     { key:'op', title:'操作', render:(r)=><a>查看</a> },
 *   ]} pageSize={20} />
 */
export interface ColumnV3<T = any> {
  key: string;
  title: string;
  type?: 'text' | 'money' | 'date' | 'status' | 'number';
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  /** 金额列币种取值字段（可选） */
  currencyKey?: string;
}

export interface DataTableV3Props<T = any> {
  rows: T[];
  columns: ColumnV3<T>[];
  loading?: boolean;
  rowKey?: (row: T, i: number) => string | number;
  pageSize?: number;
  emptyText?: string;
  exportName?: string;        // 传则显示导出按钮
}

const money = (v: any) => v == null || v === '' ? '—' : Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (v: any) => v == null || v === '' ? '—' : String(v).slice(0, 10);

export function DataTableV3<T = any>({ rows, columns, loading, rowKey, pageSize = 20, emptyText = '暂无数据', exportName }: DataTableV3Props<T>) {
  const { t } = useLanguage();
  const [sortKey, setSortKey] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    const arr = [...rows];
    arr.sort((a: any, b: any) => {
      let av = a[sortKey], bv = b[sortKey];
      if (col?.type === 'money' || col?.type === 'number') { av = Number(av) || 0; bv = Number(bv) || 0; return sortDir === 'asc' ? av - bv : bv - av; }
      av = String(av ?? ''); bv = String(bv ?? '');
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return arr;
  }, [rows, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const cur = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(cur * pageSize, cur * pageSize + pageSize);

  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };

  const exportCsv = () => {
    const head = columns.filter((c) => !c.render || c.type).map((c) => c.title).join(',');
    const body = sorted.map((r: any) =>
      columns.filter((c) => !c.render || c.type).map((c) => {
        let v = r[c.key];
        if (c.type === 'money') v = money(v); else if (c.type === 'date') v = fmtDate(v);
        return `"${String(v ?? '').replace(/"/g, '""')}"`;
      }).join(',')
    ).join('\n');
    const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${exportName || 'export'}.csv`; a.click();
  };

  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', background: 'var(--bg-muted)', color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 700, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-primary)' };

  const renderCell = (col: ColumnV3<T>, row: any) => {
    if (col.render) return col.render(row);
    const v = row[col.key];
    if (col.type === 'money') return money(v);
    if (col.type === 'date') return fmtDate(v);
    if (col.type === 'status') return v ? <StatusBadge status={String(v)} /> : '—';
    return v ?? '—';
  };

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      {exportName && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
          <button onClick={exportCsv} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12.5 }}>
            <Download size={13} />{t('ui.导出 CSV','导出 CSV')}
          </button>
        </div>
      )}
      {loading ? (
        <div style={{ padding: 16 }}><LoadingSkeleton variant="table" rows={6} cols={columns.length} /></div>
      ) : sorted.length === 0 ? (
        <EmptyState title={emptyText} />
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} style={{ ...th, width: c.width, textAlign: c.align || 'left', cursor: c.sortable ? 'pointer' : 'default' }}
                      onClick={() => c.sortable && toggleSort(c.key)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        {c.title}
                        {c.sortable && sortKey === c.key && (sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row: any, i) => (
                  <tr key={rowKey ? rowKey(row, i) : i} style={{ transition: 'background .12s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-muted)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    {columns.map((c) => (
                      <td key={c.key} style={{ ...td, textAlign: c.align || (c.type === 'money' || c.type === 'number' ? 'right' : 'left'), fontWeight: c.type === 'money' ? 600 : 400 }}>
                        {renderCell(c, row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, padding: '10px 12px', borderTop: '1px solid var(--border)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
              <span>{t('ui.共','共')} {sorted.length} {t('ui.条','条')} · {t('ui.第','第')} {cur + 1}/{totalPages} {t('ui.页','页')}</span>
              <button onClick={() => setPage(Math.max(0, cur - 1))} disabled={cur === 0} style={pgBtn(cur === 0)}><ChevronLeft size={14} /></button>
              <button onClick={() => setPage(Math.min(totalPages - 1, cur + 1))} disabled={cur >= totalPages - 1} style={pgBtn(cur >= totalPages - 1)}><ChevronRight size={14} /></button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function pgBtn(disabled: boolean): React.CSSProperties {
  return { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: disabled ? 'var(--text-disabled)' : 'var(--text-primary)', cursor: disabled ? 'not-allowed' : 'pointer' };
}
