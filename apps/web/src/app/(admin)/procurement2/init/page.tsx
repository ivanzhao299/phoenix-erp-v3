"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";

// ── 类型 ──────────────────────────────────────────────────────────────────────
type BatchType = "HISTORICAL_PO" | "HISTORICAL_PAYMENT" | "HISTORICAL_SHAREHOLDER_FUND" | "HISTORICAL_RECEIPT";

interface InitBatch {
  id: string;
  batchNo: string;
  batchType: BatchType;
  fileName: string;
  status: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  createdByName: string;
  createdAt: string;
  remark: string;
}

interface BatchRow {
  id: string;
  rowNo: number;
  status: string;
  errorMessage: string;
  relatedPoNo: string;
  relatedPayNo: string;
  relatedFundNo: string;
  relatedReceiptNo: string;
}

// ── 常量 ──────────────────────────────────────────────────────────────────────
const BATCH_TYPE_LABELS: Record<BatchType, string> = {
  HISTORICAL_PO:               "历史采购订单",
  HISTORICAL_PAYMENT:          "历史付款",
  HISTORICAL_SHAREHOLDER_FUND: "历史股东资金",
  HISTORICAL_RECEIPT:          "历史收货",
};

const BATCH_TYPE_SLUG: Record<BatchType, string> = {
  HISTORICAL_PO:               "historical-po",
  HISTORICAL_PAYMENT:          "historical-payment",
  HISTORICAL_SHAREHOLDER_FUND: "historical-shareholder-fund",
  HISTORICAL_RECEIPT:          "historical-receipt",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     "var(--color-muted)",
  VALIDATED: "var(--color-info)",
  IMPORTED:  "var(--color-success)",
  FAILED:    "var(--color-danger)",
  CANCELLED: "var(--color-muted)",
};

const ROW_STATUS_COLORS: Record<string, string> = {
  PENDING:  "var(--color-muted)",
  VALID:    "var(--color-success)",
  INVALID:  "var(--color-danger)",
  IMPORTED: "var(--color-success)",
  SKIPPED:  "var(--color-warning)",
  FAILED:   "var(--color-danger)",
};

const BASE = "/api/v2/procurement/init";

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function InitPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "ROLE_ADMIN";

  const [batches, setBatches]         = useState<InitBatch[]>([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [filterType, setFilterType]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [keyword, setKeyword]         = useState("");
  const [loading, setLoading]         = useState(false);

  // 上传面板状态
  const [showUpload, setShowUpload]   = useState(false);
  const [uploadType, setUploadType]   = useState<BatchType>("HISTORICAL_PO");
  const [uploadFile, setUploadFile]   = useState<File | null>(null);
  const [uploadRemark, setUploadRemark] = useState("");
  const [uploading, setUploading]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 详情抽屉
  const [detailBatch, setDetailBatch]     = useState<(InitBatch & { rows: BatchRow[] }) | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [importing, setImporting]         = useState(false);
  const [showErrors, setShowErrors]       = useState(false);
  const [errorRows, setErrorRows]         = useState<BatchRow[]>([]);

  // ── 拉取列表 ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page), pageSize: "20",
        ...(filterType   ? { batchType: filterType }   : {}),
        ...(filterStatus ? { status:    filterStatus }  : {}),
        ...(keyword      ? { keyword }                  : {}),
      });
      const r = await fetch(`${BASE}/batches?${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setBatches(d.items ?? []);
      setTotal(d.total  ?? 0);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }, [page, filterType, filterStatus, keyword, toast]);

  useEffect(() => { void load(); }, [load]);

  // ── 下载模板 ────────────────────────────────────────────────────────────────
  const downloadTemplate = async (type: BatchType) => {
    try {
      const slug = BATCH_TYPE_SLUG[type];
      const r = await fetch(`${BASE}/templates/${slug}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `init_template_${slug}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(String(e));
    }
  };

  // ── 上传并校验 ──────────────────────────────────────────────────────────────
  const handleValidate = async () => {
    if (!uploadFile) { toast.error("请选择 Excel 文件"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file",      uploadFile);
      fd.append("batchType", uploadType);
      if (uploadRemark) fd.append("remark", uploadRemark);
      const r = await fetch(`${BASE}/validate`, { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      toast.success(`校验完成：有效 ${d.validRows} 行，无效 ${d.invalidRows} 行`);
      setShowUpload(false);
      setUploadFile(null);
      setUploadRemark("");
      if (fileRef.current) fileRef.current.value = "";
      void load();
      // 打开详情
      void openDetail(d.batchId);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setUploading(false);
    }
  };

  // ── 打开批次详情 ────────────────────────────────────────────────────────────
  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    setDetailBatch(null);
    setShowErrors(false);
    setErrorRows([]);
    try {
      const r = await fetch(`${BASE}/batches/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setDetailBatch(d);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoadingDetail(false);
    }
  };

  // ── 执行导入 ────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!detailBatch) return;
    if (!confirm("确认执行导入？此操作不可撤销，所有有效行将写入业务数据库。")) return;
    setImporting(true);
    try {
      const r = await fetch(`${BASE}/batches/${detailBatch.id}/import`, {
        method: "POST", credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      toast.success(`导入完成：成功 ${d.successRows} 行，失败 ${d.failedRows} 行`);
      void openDetail(detailBatch.id);
      void load();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setImporting(false);
    }
  };

  // ── 取消批次 ────────────────────────────────────────────────────────────────
  const handleCancel = async (id: string) => {
    if (!confirm("确认取消该批次？")) return;
    try {
      const r = await fetch(`${BASE}/batches/${id}/cancel`, {
        method: "POST", credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      toast.success("批次已取消");
      void load();
      if (detailBatch?.id === id) setDetailBatch(null);
    } catch (e) {
      toast.error(String(e));
    }
  };

  // ── 查看错误行 ──────────────────────────────────────────────────────────────
  const loadErrors = async (id: string) => {
    try {
      const r = await fetch(`${BASE}/batches/${id}/errors`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      const rows = await r.json();
      setErrorRows(rows);
      setShowErrors(true);
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {/* 页头 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>历史数据初始化</h2>
        {isAdmin && (
          <button
            onClick={() => setShowUpload(true)}
            style={{ padding: "7px 16px", background: "var(--color-primary)", color: "var(--bg-card)", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            + 上传初始化文件
          </button>
        )}
      </div>

      {/* 模板下载区 */}
      <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>下载 Excel 模板</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {(Object.entries(BATCH_TYPE_LABELS) as [BatchType, string][]).map(([type, label]) => (
            <button
              key={type}
              onClick={() => downloadTemplate(type)}
              style={{ padding: "5px 12px", border: "1px solid var(--border)", borderRadius: 5, background: "var(--bg-base)", cursor: "pointer", fontSize: 13 }}
            >
              ↓ {label}模板
            </button>
          ))}
        </div>
      </div>

      {/* 过滤栏 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}
          style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 5, fontSize: 13, background: "var(--bg-base)", color: "var(--text-primary)" }}>
          <option value="">全部类型</option>
          {(Object.entries(BATCH_TYPE_LABELS) as [BatchType, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 5, fontSize: 13, background: "var(--bg-base)", color: "var(--text-primary)" }}>
          <option value="">全部状态</option>
          <option value="DRAFT">草稿</option>
          <option value="VALIDATED">已校验</option>
          <option value="IMPORTED">已导入</option>
          <option value="FAILED">部分失败</option>
          <option value="CANCELLED">已取消</option>
        </select>
        <input value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }}
          placeholder="搜索批次号、文件名…"
          style={{ padding: "5px 10px", border: "1px solid var(--border)", borderRadius: 5, fontSize: 13, width: 200, background: "var(--bg-base)", color: "var(--text-primary)" }} />
        <button onClick={load}
          style={{ padding: "5px 14px", border: "1px solid var(--border)", borderRadius: 5, cursor: "pointer", fontSize: 13, background: "var(--bg-base)", color: "var(--text-primary)" }}>
          刷新
        </button>
      </div>

      {/* 批次列表 */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>批次号</th>
              <th>类型</th>
              <th>文件名</th>
              <th>状态</th>
              <th style={{ textAlign: "right" }}>总行数</th>
              <th style={{ textAlign: "right" }}>成功</th>
              <th style={{ textAlign: "right" }}>失败</th>
              <th>创建人</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--text-secondary)" }}>加载中…</td></tr>
            )}
            {!loading && batches.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--text-secondary)" }}>暂无数据</td></tr>
            )}
            {batches.map(b => (
              <tr key={b.id} style={{ cursor: "pointer" }} onClick={() => openDetail(b.id)}>
                <td>{b.batchNo}</td>
                <td>{BATCH_TYPE_LABELS[b.batchType] ?? b.batchType}</td>
                <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.fileName || "—"}</td>
                <td>
                  <span style={{ background: STATUS_COLORS[b.status] + "22", color: STATUS_COLORS[b.status], padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                    {b.status}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>{b.totalRows}</td>
                <td style={{ textAlign: "right", color: "var(--color-success)" }}>{b.successRows}</td>
                <td style={{ textAlign: "right", color: b.failedRows > 0 ? "var(--color-danger)" : "inherit" }}>{b.failedRows}</td>
                <td>{b.createdByName}</td>
                <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{b.createdAt?.slice(0, 16)}</td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 6 }}>
                    {isAdmin && ['VALIDATED','FAILED'].includes(b.status) && (
                      <button onClick={() => { void openDetail(b.id); }}
                        style={{ padding: "3px 8px", fontSize: 12, border: "1px solid var(--color-primary)", color: "var(--color-primary)", borderRadius: 4, cursor: "pointer", background: "transparent" }}>
                        导入
                      </button>
                    )}
                    {isAdmin && ['DRAFT','VALIDATED','FAILED'].includes(b.status) && (
                      <button onClick={() => handleCancel(b.id)}
                        style={{ padding: "3px 8px", fontSize: 12, border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 4, cursor: "pointer", background: "transparent" }}>
                        取消
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {total > 20 && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end", fontSize: 13 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: 4, cursor: page > 1 ? "pointer" : "default" }}>
            上一页
          </button>
          <span style={{ lineHeight: "28px" }}>第 {page} 页 / 共 {Math.ceil(total / 20)} 页</span>
          <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}
            style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: 4, cursor: page < Math.ceil(total / 20) ? "pointer" : "default" }}>
            下一页
          </button>
        </div>
      )}

      {/* ── 上传面板（Modal） ────────────────────────────────────────────────── */}
      {showUpload && (
        <div style={{ position: "fixed", inset: 0, background: "var(--overlay-black-50)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg-base)", borderRadius: 10, padding: 28, width: 460, boxShadow: "0 8px 32px var(--overlay-black-20)" }}>
            <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600 }}>上传初始化文件</h3>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>初始化类型 *</label>
              <select value={uploadType} onChange={e => setUploadType(e.target.value as BatchType)}
                style={{ width: "100%", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, background: "var(--bg-base)", color: "var(--text-primary)" }}>
                {(Object.entries(BATCH_TYPE_LABELS) as [BatchType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>Excel 文件 *</label>
              <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv"
                onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                style={{ fontSize: 13 }} />
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                请先下载对应模板，按格式填写后上传。仅支持 .xlsx / .xls / .csv
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>备注</label>
              <input value={uploadRemark} onChange={e => setUploadRemark(e.target.value)}
                placeholder="可选备注说明"
                style={{ width: "100%", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, boxSizing: "border-box", background: "var(--bg-base)", color: "var(--text-primary)" }} />
            </div>

            <div style={{ marginBottom: 10, padding: 10, background: "var(--bg-subtle)", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)" }}>
              上传后仅做格式校验，不写入业务数据。校验通过后可在详情中执行导入。
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => { setShowUpload(false); setUploadFile(null); setUploadRemark(""); }}
                style={{ padding: "7px 16px", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 13, background: "var(--bg-base)", color: "var(--text-primary)" }}>
                取消
              </button>
              <button onClick={handleValidate} disabled={uploading}
                style={{ padding: "7px 16px", background: "var(--color-primary)", color: "var(--bg-card)", border: "none", borderRadius: 6, cursor: uploading ? "wait" : "pointer", fontSize: 13, fontWeight: 600 }}>
                {uploading ? "校验中…" : "上传并校验"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 批次详情抽屉 ────────────────────────────────────────────────────── */}
      {(detailBatch || loadingDetail) && (
        <div style={{ position: "fixed", inset: 0, display: "flex", zIndex: 150 }}>
          <div style={{ flex: 1, background: "var(--overlay-black-30)" }} onClick={() => setDetailBatch(null)} />
          <div style={{ width: 720, background: "var(--bg-base)", overflowY: "auto", padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            {loadingDetail && <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>加载中…</div>}
            {detailBatch && !loadingDetail && (<>
              {/* 头信息 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{detailBatch.batchNo}</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                    {BATCH_TYPE_LABELS[detailBatch.batchType]} · {detailBatch.fileName}
                  </div>
                </div>
                <span style={{ background: STATUS_COLORS[detailBatch.status] + "22", color: STATUS_COLORS[detailBatch.status], padding: "3px 10px", borderRadius: 5, fontSize: 12, fontWeight: 600 }}>
                  {detailBatch.status}
                </span>
              </div>

              {/* 统计卡片 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {[
                  { label: "总行数",   value: detailBatch.totalRows,   color: "var(--text-primary)"   },
                  { label: "成功/跳过", value: detailBatch.successRows, color: "var(--color-success)"  },
                  { label: "失败/无效", value: detailBatch.failedRows,  color: "var(--color-danger)"   },
                ].map(c => (
                  <div key={c.label} style={{ background: "var(--bg-subtle)", borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{c.label}</div>
                  </div>
                ))}
              </div>

              {/* 操作按钮 */}
              {isAdmin && (
                <div style={{ display: "flex", gap: 10 }}>
                  {['VALIDATED','FAILED'].includes(detailBatch.status) && (
                    <button onClick={handleImport} disabled={importing}
                      style={{ padding: "7px 18px", background: "var(--color-primary)", color: "var(--bg-card)", border: "none", borderRadius: 6, cursor: importing ? "wait" : "pointer", fontSize: 13, fontWeight: 600 }}>
                      {importing ? "导入中…" : "执行导入"}
                    </button>
                  )}
                  {detailBatch.failedRows > 0 && (
                    <button onClick={() => loadErrors(detailBatch.id)}
                      style={{ padding: "7px 14px", border: "1px solid var(--color-danger)", color: "var(--color-danger)", background: "transparent", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
                      查看错误行 ({detailBatch.failedRows})
                    </button>
                  )}
                  {['VALIDATED','FAILED'].includes(detailBatch.status) && (
                    <button onClick={() => handleCancel(detailBatch.id)}
                      style={{ padding: "7px 14px", border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
                      取消批次
                    </button>
                  )}
                </div>
              )}

              {/* 错误行展开 */}
              {showErrors && errorRows.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>错误行列表</div>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
                    <table className={s.table}>
                      <thead>
                        <tr>
                          {["行号","状态","错误信息","关联单号"].map(h => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {errorRows.map(r => (
                          <tr key={r.id}>
                            <td>{r.rowNo}</td>
                            <td>
                              <span style={{ color: ROW_STATUS_COLORS[r.status] ?? "inherit", fontWeight: 600 }}>{r.status}</span>
                            </td>
                            <td style={{ color: "var(--color-danger)", maxWidth: 240, wordBreak: "break-word" }}>{r.errorMessage}</td>
                            <td style={{ fontSize: 11 }}>{r.relatedPoNo || r.relatedPayNo || r.relatedFundNo || r.relatedReceiptNo || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 所有行摘要 */}
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                  全部行（共 {detailBatch.rows?.length ?? 0} 行）
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", maxHeight: 360, overflowY: "auto" }}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        {["行号","状态","关联单号","错误信息"].map(h => (
                          <th key={h} style={{ position: "sticky", top: 0, zIndex: 1 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(detailBatch.rows ?? []).map(r => (
                        <tr key={r.id}>
                          <td>{r.rowNo}</td>
                          <td>
                            <span style={{ color: ROW_STATUS_COLORS[r.status] ?? "inherit", fontWeight: 600, fontSize: 11 }}>{r.status}</span>
                          </td>
                          <td style={{ fontSize: 11 }}>{r.relatedPoNo || r.relatedPayNo || r.relatedFundNo || r.relatedReceiptNo || "—"}</td>
                          <td style={{ color: "var(--color-danger)", fontSize: 11, maxWidth: 200, wordBreak: "break-word" }}>{r.errorMessage || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 备注 */}
              {detailBatch.remark && (
                <div style={{ padding: 10, background: "var(--bg-subtle)", borderRadius: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                  备注：{detailBatch.remark}
                </div>
              )}
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
