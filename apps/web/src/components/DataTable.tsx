'use client';
/**
 * @deprecated F3 说明：`@/components/data-table` 是后端 CRUD 表格（需要 table 名/server fetch），
 * 与本文件的前端展示表格（接 data + searchKeys + filters）API 不兼容，无法直接替换。
 * 建议 F4 阶段将本文件提升为 `PresentationalTable` 纳入 design-system，
 * 或将 data-table 抽离展示层 variant。4 处引用暂时保留。
 */
import React, { useState } from 'react';
import { Search, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export interface Column<T extends object = Record<string, unknown>> {
  key: string;
  title?: string;
  label?: string;
  width?: string | number;
  render?: (value: unknown, row: T) => React.ReactNode;
}

interface DataTableProps<T extends object = Record<string, unknown>> {
  columns?: Column<T>[];
  data?: T[];
  searchPlaceholder?: string;
  searchKeys?: string[];
  pageSize?: number;
  filters?: React.ReactNode;
  rowKey?: string;
  onRowClick?: (row: T) => void;
  emptyText?: string;
  exportFilename?: string;
}

const exportTableCsv = (columns: Column[], data: Record<string, unknown>[], filename: string) => {
  const headers = columns.map(c => c.title || c.label || c.key).join(',');
  const rows = data.map(row => columns.map(c => {
    const v = row[c.key] ?? '';
    return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
  }).join(','));
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename + '.csv'; a.click();
  URL.revokeObjectURL(url);
};

function DataTable<T extends object = Record<string, unknown>>({
  columns = [], data = [], searchPlaceholder = '搜索...', searchKeys = [],
  pageSize = 12, filters, rowKey = 'id', onRowClick, emptyText = '暂无数据', exportFilename,
}: DataTableProps<T>) {
  const { t } = useLanguage() || { t: (k: string, f: string) => f || k };
  const [query, setQuery] = useState('');
  const [page, setPage]   = useState(1);

  const asMap = (row: T) => row as Record<string, unknown>;

  const filtered = query && searchKeys.length > 0
    ? data.filter(row => searchKeys.some(k => String(asMap(row)[k] ?? '').toLowerCase().includes(query.toLowerCase())))
    : data;

  const totalPages  = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged       = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div style={{ backgroundColor:'var(--bg-card)', borderRadius:'var(--radius-lg)', boxShadow:'var(--shadow-sm)', border:'1px solid var(--border)', overflow:'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:'1', minWidth:'200px', maxWidth:'300px' }}>
          <Search size={15} style={{ position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', color:'var(--text-secondary)' }} />
          <input type="text" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }}
            placeholder={searchPlaceholder}
            style={{ width:'100%', paddingLeft:'32px', paddingRight:'10px', height:'34px', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', fontSize:'13px', outline:'none', transition:'border-color 0.18s', backgroundColor:'var(--bg-page)', color:'var(--text-primary)' }}
            onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        </div>
        {filters}
        <span style={{ fontSize:'12px', color:'var(--text-secondary)', marginLeft:'auto' }}>共 {filtered.length} 条</span>
        {exportFilename && (
          <button type="button" onClick={() => exportTableCsv(columns as Column[], data as Record<string, unknown>[], exportFilename)}
            style={{ display:'flex', alignItems:'center', gap:'5px', padding:'6px 12px', fontSize:'12px', fontWeight:'600',
              border:'1px solid var(--border)', borderRadius:'var(--radius-md)', backgroundColor:'var(--bg-page)', color:'var(--text-primary)', cursor:'pointer', whiteSpace:'nowrap', transition:'border-color 0.18s, color 0.18s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor='var(--color-primary)'; (e.currentTarget as HTMLElement).style.color='var(--color-primary)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor='var(--border)'; (e.currentTarget as HTMLElement).style.color='var(--text-primary)'; }}>
            <Download size={13} /> 导出 CSV
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
          <thead>
            <tr style={{ backgroundColor:'var(--bg-page)' }}>
              {columns.map(col => (
                <th key={col.key} style={{ textAlign:'left', padding:'10px 16px', fontWeight:'600', color:'var(--text-secondary)', fontSize:'12px', textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'1px solid var(--border)', width:col.width, whiteSpace:'nowrap' }}>
                  {col.title ? t('ui.' + col.title, col.title) : (col.label || col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={columns.length} style={{ textAlign:'center', padding:'48px 16px', color:'var(--text-secondary)' }}>{emptyText}</td></tr>
            ) : (
              paged.map((row, i) => (
                <tr key={String(asMap(row)[rowKey] ?? i)} onClick={() => onRowClick && onRowClick(row)}
                  style={{ borderBottom:'1px solid var(--border)', cursor: onRowClick ? 'pointer' : 'default', transition:'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-page)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
                  {columns.map(col => (
                    <td key={col.key} style={{ padding:'11px 16px', color:'var(--text-primary)', verticalAlign:'middle' }}>
                      {col.render ? col.render(asMap(row)[col.key], row) : (asMap(row)[col.key] != null ? String(asMap(row)[col.key]) : '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:'8px' }}>
          <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
            style={{ width:'30px', height:'30px', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)', backgroundColor:'var(--bg-card)', cursor: currentPage===1?'not-allowed':'pointer', opacity: currentPage===1?0.4:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-primary)' }}>
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
            .reduce((acc: (number|string)[], p, idx, arr) => {
              if (idx > 0 && p - (arr[idx-1] as number) > 1) acc.push('...');
              acc.push(p); return acc;
            }, [])
            .map((p, i) => typeof p === 'number' ? (
              <button type="button" key={i} onClick={() => setPage(p)} style={{ minWidth:'30px', height:'30px', borderRadius:'var(--radius-sm)', border:'1px solid', padding:'0 6px',
                borderColor: p===currentPage?'var(--color-primary)':'var(--border)', backgroundColor: p===currentPage?'var(--color-primary)':'var(--bg-card)',
                color: p===currentPage?'white':'var(--text-primary)', cursor:'pointer', fontSize:'13px', fontWeight: p===currentPage?'600':'400' }}>{p}</button>
            ) : <span key={i} style={{ color:'var(--text-secondary)', fontSize:'13px' }}>...</span>)
          }
          <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
            style={{ width:'30px', height:'30px', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)', backgroundColor:'var(--bg-card)', cursor: currentPage===totalPages?'not-allowed':'pointer', opacity: currentPage===totalPages?0.4:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-primary)' }}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default DataTable;
