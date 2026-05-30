"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import { Search } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

// 正向追溯：从批次 → 质检 → 订单
interface TraceResult {
  batch: Record<string, unknown> | null;
  inspections: Record<string, unknown>[];
  orders: Record<string, unknown>[];
}

// 批次实际字段（inv_batches）
const BATCH_KEYS = ["batch_no", "product_code", "qty", "qty_available", "warehouse_code", "location_code", "expire_date", "status"];
const INSPECT_KEYS = ["inspect_no", "inspector", "status", "created_at"];
const ORDER_KEYS   = ["order_no", "customer_code", "total_amount", "status"];

function KVSection({
  title,
  items,
  keys,
}: {
  title: string;
  items: Record<string, unknown>[];
  keys: string[];
}) {
  const { t } = useLanguage();
  return (
    <div className="mb-5">
      <div className="font-semibold text-sm text-slate-700 dark:text-slate-200 mb-2">
        {title}
        <span className="ml-1 text-xs text-slate-400 font-normal">({items.length} {t("ui.条", "条")})</span>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-slate-400 py-2">{t("common.no_data", "暂无数据")}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item, i) => (
            <div
              key={i}
              className="bg-slate-50 dark:bg-slate-700/50 rounded-lg px-4 py-2.5 text-xs flex flex-wrap gap-x-5 gap-y-1"
            >
              {keys.map(
                (k) =>
                  item[k] != null && (
                    <span key={k}>
                      <b className="text-slate-500 dark:text-slate-400">{k}: </b>
                      <span className="text-slate-700 dark:text-slate-200">{String(item[k])}</span>
                    </span>
                  )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ForwardTracePage() {
  const { t } = useLanguage();
  const [batchNo, setBatchNo] = useState("");
  const [result, setResult]   = useState<TraceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const trace = useCallback(async () => {
    if (!batchNo.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const [bRes, iRes, oRes] = await Promise.all([
        crudApi.list<Record<string, unknown>>("inv_batches",    { batch_no: batchNo, limit: 1 }),
        crudApi.list<Record<string, unknown>>("qa_inspections", { batch_no: batchNo, limit: 50 }),
        crudApi.list<Record<string, unknown>>("ord_orders",     { batch_no: batchNo, limit: 20 }),
      ]);
      setResult({
        batch:       (bRes.data ?? [])[0] ?? null,
        inspections: iRes.data ?? [],
        orders:      oRes.data ?? [],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [batchNo]);

  return (
    <div>
      <PageHeader
        title={t("ui.正向追溯", "正向追溯")}
        subtitle={t("ui.正向追溯副标题", "从批次号正向追溯质检记录和关联订单")}
      />

      {/* 搜索框 */}
      <div className="flex gap-3 mb-6">
        <input
          value={batchNo}
          onChange={(e) => setBatchNo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void trace()}
          placeholder={t("ui.输入批次号", "输入批次号，如：B-20260510-001")}
          className="flex-1 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none focus:border-indigo-400 dark:focus:border-indigo-500 transition-colors"
        />
        <button
          type="button"
          onClick={() => void trace()}
          disabled={loading || !batchNo.trim()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          <Search size={15} />
          {loading ? t("ui.查询中", "查询中…") : t("ui.追溯", "追溯")}
        </button>
      </div>

      {/* 错误 */}
      {error && (
        <div className="mb-4 text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
          {t("ui.查询失败", "查询失败")}：{error}
        </div>
      )}

      {/* 结果 */}
      {result && (
        <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-5">
          {/* 批次信息 */}
          <div className="mb-5">
            <div className="font-semibold text-sm text-indigo-600 dark:text-indigo-400 mb-2">
              📦 {t("ui.批次信息", "批次信息")}
            </div>
            {result.batch ? (
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg px-4 py-2.5 text-xs flex flex-wrap gap-x-5 gap-y-1">
                {BATCH_KEYS.map(
                  (k) =>
                    result.batch![k] != null && (
                      <span key={k}>
                        <b className="text-slate-500 dark:text-slate-400">{k}: </b>
                        <span className="text-slate-700 dark:text-slate-200">{String(result.batch![k])}</span>
                      </span>
                    )
                )}
              </div>
            ) : (
              <div className="text-sm text-red-500">
                {t("ui.未找到批次", "未找到批次")}「{batchNo}」
              </div>
            )}
          </div>

          <KVSection
            title={`🔬 ${t("ui.质检记录", "质检记录")}`}
            items={result.inspections}
            keys={INSPECT_KEYS}
          />
          <KVSection
            title={`📋 ${t("ui.关联订单", "关联订单")}`}
            items={result.orders}
            keys={ORDER_KEYS}
          />
        </div>
      )}
    </div>
  );
}
