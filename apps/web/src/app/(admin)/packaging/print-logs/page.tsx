"use client";

import { useState, useCallback, useEffect } from "react";
import u from "@/styles/uix-utils.module.css";
import PageHeader from "@/components/PageHeader";
import { Printer, RefreshCw, History, AlertTriangle } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
import {
  primaryActionButton, inputField,
  kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
  detailInfoBox, actionGroupBox, inlineAlert,
} from "@/components/design-system/cockpit-styles";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "brand";
import { packagingApi, type PrintLogRow } from "@/lib/packaging-api";
const TYPE_OPTIONS = [{
  value: "ALL",
  label: "全部"
}, {
  value: "NORMAL",
  label: "正常打印"
}, {
  value: "REPRINT",
  label: "补打"
}];
const REPRINT_REASON_LABELS: Record<string, string> = {
  "label_print.reprint.damaged": "标签损坏",
  "label_print.reprint.unclear": "打印不清晰",
  "label_print.reprint.wrong_info": "信息有误",
  "label_print.reprint.customer_request": "客户要求",
  "label_print.reprint.other": "其他"
};
function fmtReason(raw: string | null) {
  if (!raw) return "—";
  return REPRINT_REASON_LABELS[raw] ?? raw;
}
function fmtTime(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    hour12: false
  }).replace(/\//g, "-");
}
export default function PrintLogsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [type, setType] = useState("ALL");
  const [rows, setRows] = useState<PrintLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await packagingApi.getPrintLogs({
        startDate,
        endDate,
        type
      });
      setRows(res.data ?? []);
    } catch (e: unknown) {
      setErr((e as Error).message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, type]);
  useEffect(() => {
    void load();
  }, [load]);
  const totalCount = rows.length;
  const reprintCount = rows.filter(r => r.print_type === "REPRINT").length;
  const normalCount = totalCount - reprintCount;
  return <div style={{
    padding: "24px",
    maxWidth: 1100
  }}>
      <PageHeader title="补打日志" subtitle="查看正常打印及补打记录，补打含操作人和原因" breadcrumb={["分级包装", "补打日志"]} />

      {/* g200f 筛选栏 — actionGroupBox(非 KPI 风格) */}
      <div style={{ ...actionGroupBox, background: "var(--bg-card)", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>开始日期</div>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...inputField, width: 150 }} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>结束日期</div>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...inputField, width: 150 }} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>打印类型</div>
            <select value={type} onChange={e => setType(e.target.value)} style={{ ...inputField, width: 130 }}>
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button onClick={load} disabled={loading} style={{ ...primaryActionButton, opacity: loading ? 0.5 : 1 }}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            {loading ? "查询中..." : "查询"}
          </button>
        </div>
      </div>

      {/* g200f KPI 3 卡 — kpiCardCompact(tone) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 20 }}>
        {([
          { label: "打印总次数", value: totalCount,   tone: "brand"   as Tone, Icon: Printer },
          { label: "正常打印",   value: normalCount,  tone: "success" as Tone, Icon: Printer },
          { label: "补打次数",   value: reprintCount, tone: "warning" as Tone, Icon: History },
        ]).map(c => {
          const Icon = c.Icon;
          return (
            <div key={c.label} style={kpiCardCompact(c.tone)}>
              <div style={kpiCardCompactLabel}><Icon size={13} /> {c.label}</div>
              <div style={kpiCardCompactValue(c.tone)}>{c.value}</div>
            </div>
          );
        })}
      </div>

      {/* g200f 表格容器 — detailInfoBox */}
      <div style={{ ...detailInfoBox, background: "var(--bg-card)", padding: 0 }}>
        <div className={s.cardHeader}>
          <span className={s.cardTitle}>打印记录</span>
          <span className={u.muted12}>
            {startDate === endDate ? startDate : `${startDate} — ${endDate}`}
          </span>
        </div>
        <div className={u.scrollX}>
          {err && <div style={{ ...inlineAlert("danger"), margin: "16px 20px" }}><AlertTriangle size={13} /> {err}</div>}
          {!err && rows.length === 0 && !loading && <div style={{
          padding: "40px 20px",
          textAlign: "center",
          color: "var(--text-secondary)",
          fontSize: 13
        }}>
              所选日期范围内暂无打印记录
            </div>}
          {rows.length > 0 && <table className={s.table}>
              <thead>
                <tr>
                  <th>打印时间</th>
                  <th>箱码</th>
                  <th>包装批次</th>
                  <th>类型</th>
                  <th>补打原因</th>
                  <th>操作人</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => <tr key={r.id}>
                    <td style={{
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap"
              }}>
                      {fmtTime(r.printed_at)}
                    </td>
                    <td>
                      <code style={{
                  fontSize: 12,
                  background: "var(--bg-muted)",
                  padding: "2px 6px",
                  borderRadius: 4,
                  letterSpacing: "0.3px"
                }}>
                        {r.box_code || "—"}
                      </code>
                    </td>
                    <td className={u.muted12}>
                      {r.packaging_batch_id || "—"}
                    </td>
                    <td>
                      {r.print_type === "REPRINT" ? <span style={{
                  background: "rgba(217,119,6,0.12)",
                  color: "var(--status-warning)",
                  padding: "2px 8px",
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 600
                }}>
                          补打
                        </span> : <span style={{
                  background: "rgba(22,163,74,0.10)",
                  color: "var(--status-success)",
                  padding: "2px 8px",
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 600
                }}>
                          正常
                        </span>}
                    </td>
                    <td style={{
                color: r.reprint_reason ? "var(--text-primary)" : "var(--text-secondary)"
              }}>
                      {fmtReason(r.reprint_reason)}
                    </td>
                    <td>{r.printed_by || "—"}</td>
                  </tr>)}
              </tbody>
            </table>}
        </div>
      </div>
    </div>;
}