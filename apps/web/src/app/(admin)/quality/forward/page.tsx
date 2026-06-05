"use client";

import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import { Search, Package, ClipboardList, ShoppingCart, AlertCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { EmptyState } from "@/components/design-system";

// 正向追溯：从批次 → 质检 → 订单
import u from "@/styles/uix-utils.module.css";
interface TraceResult {
  batch: Record<string, unknown> | null;
  inspections: Record<string, unknown>[];
  orders: Record<string, unknown>[];
}
const BATCH_KEYS = ["batch_no", "product_code", "qty", "qty_available", "warehouse_code", "expire_date", "status"];
const INSPECT_KEYS = ["inspect_no", "inspector", "status", "created_at"];
const ORDER_KEYS = ["order_no", "customer_code", "total_amount", "status"];

/** 通用键值展示行 */
function KVRow({
  item,
  keys
}: {
  item: Record<string, unknown>;
  keys: string[];
}) {
  return <div style={{
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px 20px',
    padding: '10px 14px',
    borderRadius: 8,
    background: 'var(--bg-muted)',
    border: '1px solid var(--border)',
    fontSize: 12
  }}>
      {keys.map(k => item[k] != null ? <span key={k}>
            <span style={{
        color: 'var(--text-secondary)',
        fontWeight: 500
      }}>{k}: </span>
            <span style={{
        color: 'var(--text-primary)',
        fontFamily: 'monospace'
      }}>{String(item[k])}</span>
          </span> : null)}
    </div>;
}

/** 分组展示块 */
function ResultSection({
  icon,
  title,
  count,
  children
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return <div className={u.mb20}>
      <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--text-primary)',
      marginBottom: 10
    }}>
        <span style={{
        color: 'var(--color-primary)'
      }}>{icon}</span>
        {title}
        <span style={{
        fontSize: 11,
        fontWeight: 400,
        color: 'var(--text-secondary)',
        background: 'var(--bg-muted)',
        padding: '1px 8px',
        borderRadius: 10
      }}>{count} 条</span>
      </div>
      {children}
    </div>;
}
export default function ForwardTracePage() {
  const {
    t
  } = useLanguage();
  const [batchNo, setBatchNo] = useState("");
  const [result, setResult] = useState<TraceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trace = useCallback(async () => {
    const q = batchNo.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const [bRes, iRes, oRes] = await Promise.all([crudApi.list<Record<string, unknown>>("inv_batches", {
        batch_no: q,
        limit: 1
      }), crudApi.list<Record<string, unknown>>("qa_inspections", {
        batch_no: q,
        limit: 50
      }), crudApi.list<Record<string, unknown>>("ord_orders", {
        batch_no: q,
        limit: 20
      })]);
      setResult({
        batch: (bRes.data ?? [])[0] ?? null,
        inspections: iRes.data ?? [],
        orders: oRes.data ?? []
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [batchNo]);
  return <div>
      <PageHeader title={t("ui.正向追溯", "正向追溯")} subtitle={t("ui.正向追溯副标题", "从批次号正向追溯质检记录和关联订单")} />

      {/* 搜索栏 */}
      <div style={{
      display: 'flex',
      gap: 10,
      marginBottom: 24,
      alignItems: 'center'
    }}>
        <div style={{
        position: 'relative',
        flex: 1
      }}>
          <Search size={15} style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-secondary)'
        }} />
          <input value={batchNo} onChange={e => setBatchNo(e.target.value)} onKeyDown={e => e.key === "Enter" && void trace()} placeholder={t("ui.输入批次号", "输入批次号，如：EGG-20260601-00001")} style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '10px 14px 10px 36px',
          borderRadius: 9,
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          fontSize: 13,
          outline: 'none'
        }} />
        </div>
        <button type="button" onClick={() => void trace()} disabled={loading || !batchNo.trim()} style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
        padding: '10px 22px',
        borderRadius: 9,
        border: 'none',
        background: !loading && batchNo.trim() ? 'var(--color-primary)' : 'var(--bg-muted)',
        color: !loading && batchNo.trim() ? 'white' : 'var(--text-disabled)',
        fontSize: 13,
        fontWeight: 600,
        cursor: !loading && batchNo.trim() ? 'pointer' : 'not-allowed',
        transition: 'all 0.15s'
      }}>
          <Search size={14} />
          {loading ? t("ui.查询中", "查询中…") : t("ui.追溯", "追溯")}
        </button>
      </div>

      {/* 错误提示 */}
      {error && <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
      padding: '10px 14px',
      borderRadius: 9,
      background: 'var(--status-danger-bg)',
      border: '1px solid var(--status-danger-border)',
      color: 'var(--status-danger)',
      fontSize: 13
    }}>
          <AlertCircle size={15} />
          {t("ui.查询失败", "查询失败")}：{error}
        </div>}

      {/* 空态引导（未搜索时） */}
      {!result && !loading && !error && <div style={{
      paddingTop: 32
    }}>
          <EmptyState title="输入批次号开始追溯" description="输入库存批次号（EGG-YYYYMMDD-*）或包装批次号（PKG-*），回车或点击追溯按钮" />
        </div>}

      {/* 追溯结果 */}
      {result && <div style={{
      borderRadius: 12,
      border: '1px solid var(--border)',
      background: 'var(--bg-card)',
      padding: '20px 20px 4px'
    }}>
          {/* 批次信息 */}
          <ResultSection icon={<Package size={14} />} title="批次信息" count={result.batch ? 1 : 0}>
            {result.batch ? <KVRow item={result.batch} keys={BATCH_KEYS} /> : <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: 'var(--status-danger-bg)',
          border: '1px solid var(--status-danger-border)',
          color: 'var(--status-danger)',
          fontSize: 13
        }}>
                未找到批次「{batchNo}」
              </div>}
          </ResultSection>

          {/* 质检记录 */}
          <ResultSection icon={<ClipboardList size={14} />} title={t("ui.质检记录", "质检记录")} count={result.inspections.length}>
            {result.inspections.length === 0 ? <div style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          padding: '8px 0'
        }}>暂无质检记录</div> : <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
                {result.inspections.map((item, i) => <KVRow key={i} item={item} keys={INSPECT_KEYS} />)}
              </div>}
          </ResultSection>

          {/* 关联订单 */}
          <ResultSection icon={<ShoppingCart size={14} />} title={t("ui.关联订单", "关联订单")} count={result.orders.length}>
            {result.orders.length === 0 ? <div style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          padding: '8px 0'
        }}>暂无关联订单</div> : <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
                {result.orders.map((item, i) => <KVRow key={i} item={item} keys={ORDER_KEYS} />)}
              </div>}
          </ResultSection>
        </div>}
    </div>;
}