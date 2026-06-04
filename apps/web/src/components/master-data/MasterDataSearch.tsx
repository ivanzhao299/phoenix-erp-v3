"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { Search, X, ExternalLink } from "lucide-react";
import request from "@/lib/api-client";

/**
 * G5.5-E — 全局主数据搜索
 *
 * 跨 12 类主数据按 code/name 搜索；防抖 300ms；结果按 type 分组展示
 */

interface SearchResult {
  type: string;
  code: string;
  name: string;
  status: string;
  refLink: string;
}

const TYPE_LABEL: Record<string, string> = {
  customer: '客户', supplier: '供应商', product: '产品', sku: 'SKU',
  warehouse: '仓库', store: '门店', 'cash-account': '资金账户',
  'bank-account': '银行账户', driver: '司机', vehicle: '车辆',
  project: '项目', organization: '组织',
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#16a34a', DRAFT: '#94a3b8', PENDING_APPROVAL: '#d97706',
  FROZEN: '#3b82f6', ARCHIVED: '#94a3b8', REJECTED: '#dc2626',
};

export function MasterDataSearch({ placeholder = '搜索客户 / 供应商 / SKU / 仓库 / 账户…', autoFocus = false }:
  { placeholder?: string; autoFocus?: boolean }) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (kw: string) => {
    if (!kw.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await request<SearchResult[]>(`/master-data/operations/search?keyword=${encodeURIComponent(kw)}`);
      setResults(r ?? []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(keyword), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [keyword, doSearch]);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 按 type 分组
  const grouped: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!grouped[r.type]) grouped[r.type] = [];
    grouped[r.type].push(r);
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', maxWidth: 600 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 14px', borderRadius: 10,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
      }}>
        <Search size={15} style={{ color: 'var(--text-secondary)' }} />
        <input
          autoFocus={autoFocus}
          value={keyword}
          onChange={e => { setKeyword(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          style={{
            flex: 1, border: 'none', background: 'transparent', outline: 'none',
            fontSize: 13, color: 'var(--text-primary)',
          }}
        />
        {keyword && (
          <button onClick={() => { setKeyword(''); setResults([]); }}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-disabled)' }}>
            <X size={14} />
          </button>
        )}
        {loading && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>搜索中…</span>}
      </div>

      {/* 结果下拉 */}
      {open && keyword && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          maxHeight: 480, overflowY: 'auto',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100,
        }}>
          {results.length === 0 && !loading && (
            <div style={{ padding: 20, color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center' }}>
              {keyword.trim() ? '未找到匹配的主数据' : '请输入关键词'}
            </div>
          )}
          {Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <div style={{
                padding: '6px 14px', background: 'var(--bg-muted)',
                fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                {TYPE_LABEL[type] ?? type} · {items.length}
              </div>
              {items.map((r, i) => (
                <a key={i} href={r.refLink}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', textDecoration: 'none',
                    color: 'var(--text-primary)', borderBottom: '1px solid var(--border)',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-muted)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--color-primary)', fontWeight: 600 }}>{r.code}</span>
                      <span style={{ color: 'var(--text-primary)' }}>{r.name}</span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 3,
                    background: `${STATUS_COLOR[r.status] ?? '#94a3b8'}1a`,
                    color: STATUS_COLOR[r.status] ?? '#94a3b8',
                    fontWeight: 600,
                  }}>{r.status}</span>
                  <ExternalLink size={12} style={{ color: 'var(--text-disabled)' }} />
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MasterDataSearch;
