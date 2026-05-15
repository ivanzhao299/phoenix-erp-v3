"use client";
import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import { History, User, Clock, RefreshCw, Search, Download, ChevronLeft, ChevronRight } from "lucide-react";

const tok = () => (typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "");
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

const PAGE_SIZE = 50;

const ACTION_META: Record<string, { label: string; color: string; bg: string }> = {
  APPROVED:  { label: "已审批", color: "#16a34a", bg: "#dcfce7" },
  REJECTED:  { label: "已驳回", color: "#dc2626", bg: "#fee2e2" },
  SUBMIT:    { label: "已提交", color: "#2563eb", bg: "#dbeafe" },
  CANCELLED: { label: "已撤回", color: "#d97706", bg: "#fef3c7" },
  CREATE:    { label: "新建",   color: "#7c3aed", bg: "#ede9fe" },
  UPDATE:    { label: "修改",   color: "#0891b2", bg: "#cffafe" },
  DELETE:    { label: "删除",   color: "#dc2626", bg: "#fee2e2" },
  LOGIN:     { label: "登录",   color: "#16a34a", bg: "#dcfce7" },
};

const DOC_TYPE_MAP: Record<string, string> = {
  ORDER:       "销售订单",   PURCHASE:    "采购单",
  INBOUND:     "入库单",     OUTBOUND:    "出库单",
  GRADING:     "分级任务",   BATCH:       "包装批次",
  USER:        "用户账号",   ROLE:        "角色权限",
  DICT:        "数据字典",   ORG:         "组织架构",
  PRODUCT:     "商品主数据", TRANSFER:    "调拨单",
  STOCKTAKE:   "盘点单",     CREDIT:      "信用台账",
  RECEIVABLE:  "应收账款",   PAYABLE:     "应付账款",
};

interface LogItem {
  id: number; doc_type: string; doc_id: number;
  approver_role: string; approver_id: number;
  action: string; comment: string; created_at: string;
  operator?: string;
}

export default function AuditLogPage() {
  const [logs,      setLogs]      = useState<LogItem[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [actionFilter, setActionFilter] = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [dateFrom,  setDateFrom]  = useState("");
  const [dateTo,    setDateTo]    = useState("");

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((pg - 1) * PAGE_SIZE),
        sort: "id", order: "desc",
      });
      if (actionFilter !== "ALL") params.set("action", actionFilter);
      if (search.trim())          params.set("q", search.trim());
      if (dateFrom)               params.set("date_from", dateFrom);
      if (dateTo)                 params.set("date_to", dateTo);

      const r    = await fetch(`/api/crud/sys_approval_logs?${params}`, { headers: hdr() });
      const data = await r.json();
      setLogs(data.data ?? []);
      setTotal(data.total ?? 0);
      setPage(pg);
    } finally { setLoading(false); }
  }, [actionFilter, search, dateFrom, dateTo]);

  useEffect(() => { load(1); }, [actionFilter]);

  const handleSearch = () => load(1);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="审计日志"
        subtitle="系统操作轨迹与审批行为全量记录，支持按操作类型、日期范围查询"
        breadcrumb={["系统设置", "审计日志"]}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => load(page)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-card)", cursor: "pointer", fontSize: 13, color: "var(--text-primary)" }}>
              <RefreshCw size={13}/> 刷新
            </button>
            <button type="button" onClick={() => alert("导出功能开发中")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-card)", cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}>
              <Download size={13}/> 导出
            </button>
          </div>
        }
      />

      {/* 搜索与筛选栏 */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "16px 20px", marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>关键词搜索</label>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }}/>
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="单据类型 / 操作人…"
              style={{ width: "100%", padding: "8px 10px 8px 30px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-page)", color: "var(--text-primary)", boxSizing: "border-box" }}/>
          </div>
        </div>
        <div style={{ minWidth: 140 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>开始日期</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-page)", color: "var(--text-primary)", width: "100%" }}/>
        </div>
        <div style={{ minWidth: 140 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>结束日期</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-page)", color: "var(--text-primary)", width: "100%" }}/>
        </div>
        <button onClick={handleSearch} style={{ padding: "8px 20px", background: "var(--color-primary)", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", height: 36 }}>
          查询
        </button>
        {(search || dateFrom || dateTo) && (
          <button onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); setTimeout(() => load(1), 0); }}
            style={{ padding: "8px 14px", border: "1px solid var(--border)", background: "var(--bg-page)", borderRadius: 8, fontSize: 13, cursor: "pointer", color: "var(--text-secondary)", height: 36 }}>
            重置
          </button>
        )}
      </div>

      {/* 操作类型 Tab */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setActionFilter("ALL")} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1.5px solid", background: actionFilter === "ALL" ? "var(--color-primary)" : "var(--bg-card)", color: actionFilter === "ALL" ? "white" : "var(--text-secondary)", borderColor: actionFilter === "ALL" ? "var(--color-primary)" : "var(--border)" }}>
          全部
        </button>
        {Object.entries(ACTION_META).map(([k, m]) => (
          <button key={k} onClick={() => setActionFilter(k)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${actionFilter === k ? m.color : "var(--border)"}`, background: actionFilter === k ? m.bg : "var(--bg-card)", color: actionFilter === k ? m.color : "var(--text-secondary)" }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* 日志表格 */}
      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)" }}>加载中...</div>
      ) : logs.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}>
          <History size={40} style={{ opacity: 0.2, display: "block", margin: "0 auto 12px" }}/>
          暂无符合条件的审计记录
        </div>
      ) : (
        <div style={{ background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-page)" }}>
                {["操作类型", "单据类型", "单据号", "操作者", "备注", "时间"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-secondary)", fontWeight: 600, borderBottom: "1px solid var(--border)", fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const m = ACTION_META[log.action] ?? { label: log.action, color: "#64748b", bg: "#f1f5f9" };
                const docLabel = DOC_TYPE_MAP[log.doc_type] || log.doc_type;
                return (
                  <tr key={log.id} style={{ borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-page)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: m.bg, color: m.color }}>{m.label}</span>
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-primary)" }}>
                      {docLabel}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--color-primary)" }}>#{log.doc_id}</span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)" }}>
                        <User size={13}/>
                        <span style={{ fontSize: 12 }}>{log.operator || log.approver_role}</span>
                        {log.approver_id && <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>(#{log.approver_id})</span>}
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--text-secondary)", fontSize: 12, maxWidth: 200 }}>
                      {log.comment || <span style={{ opacity: 0.4 }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-secondary)", fontSize: 12 }}>
                        <Clock size={12}/>{new Date(log.created_at).toLocaleString("zh-CN")}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 分页 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>共 {total} 条记录</span>
        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => load(Math.max(1, page - 1))} disabled={page <= 1}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.4 : 1, display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
              <ChevronLeft size={14}/> 上一页
            </button>
            <span style={{ fontSize: 13, color: "var(--text-secondary)", padding: "0 8px" }}>
              第 {page} / {totalPages} 页
            </span>
            <button onClick={() => load(page + 1)} disabled={page >= totalPages}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.4 : 1, display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
              下一页 <ChevronRight size={14}/>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
