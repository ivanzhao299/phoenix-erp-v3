"use client";

import { useState, useEffect, useCallback } from "react";
import { Egg, Plus, Trash2, Save, RefreshCw, AlertTriangle, Package } from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";
import request from "@/lib/api-client";

/**
 * 日产蛋入库（库存来源模式治理 P1A · 临时生产入库）
 * 仅在 inventory_source_mode = TEMP_PRODUCTION_INBOUND 时可用；
 * 直接形成 Sales V2 销售库存（EGG-YYYYMMDD-*，change_type=TEMP_PRODUCTION_INBOUND）。
 * 包装入库模式（PACKAGING_INBOUND）下禁用，提示改走包装作业中心。
 */
import u from "@/styles/uix-utils.module.css";
const EGG_GRADES = [{
  code: "0",
  name: "0号蛋"
}, {
  code: "1",
  name: "1号蛋"
}, {
  code: "2",
  name: "2号蛋"
}, {
  code: "3",
  name: "3号蛋"
}, {
  code: "4",
  name: "4号蛋"
}, {
  code: "5",
  name: "5号蛋"
}];
interface Row {
  grade: string;
  qty: string;
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export default function DailyInboundPage() {
  const {
    canView,
    canCreate
  } = usePermission("MENU_PROD_INBOUND");
  const [mode, setMode] = useState<string>("");
  const [loadingMode, setLoadingMode] = useState(true);
  const [eggDate, setEggDate] = useState(today());
  const [houseCode, setHouseCode] = useState("");
  const [rows, setRows] = useState<Row[]>([{
    grade: "0",
    qty: ""
  }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    batches: {
      batchNo: string;
      grade: string;
      qty: number;
    }[];
    totalInbound: number;
  } | null>(null);
  const loadMode = useCallback(async () => {
    setLoadingMode(true);
    try {
      const r = await request<{
        mode: string;
      }>("/v2/inventory/source/mode");
      setMode(r.mode);
    } catch {
      setMode("");
    } finally {
      setLoadingMode(false);
    }
  }, []);
  useEffect(() => {
    if (canView) loadMode();
  }, [canView, loadMode]);
  const totalQty = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const isPackagingMode = mode === "PACKAGING_INBOUND";
  const submit = async () => {
    setError("");
    setResult(null);
    const items = rows.filter(r => Number(r.qty) > 0).map(r => ({
      grade: r.grade,
      qty: Number(r.qty)
    }));
    if (items.length === 0) {
      setError("请至少录入一条有效数量");
      return;
    }
    setSaving(true);
    try {
      const r = await request<{
        batches: {
          batchNo: string;
          grade: string;
          qty: number;
        }[];
        totalInbound: number;
      }>("/v2/inventory/production-inbound", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          eggDate,
          houseCode: houseCode || undefined,
          items
        })
      });
      setResult(r);
      setRows([{
        grade: "0",
        qty: ""
      }]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "入库失败");
    } finally {
      setSaving(false);
    }
  };
  if (!canView) return <div className={u.emptyPad40}>无权限访问日产蛋入库</div>;
  return <div className="animate-fade-in" style={{
    padding: "24px 32px"
  }}>
      <PageHeader title="日产蛋入库" subtitle="临时生产入库模式 · 日产蛋直接形成销售库存（统一进入 FIFO 库存体系）" breadcrumb={["生产管理", "日产蛋入库"]} />

      {/* 模式状态条 */}
      {loadingMode ? <div style={{
      padding: 14,
      color: "var(--text-secondary)"
    }}>加载库存来源模式...</div> : isPackagingMode ? <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "14px 18px",
      marginBottom: 18,
      borderRadius: 10,
      background: "var(--status-warning-bg-light)",
      border: "1px solid var(--status-warning)",
      color: "var(--status-warning)"
    }}>
          <Package size={18} />
          <div style={{
        flex: 1,
        fontSize: 13,
        lineHeight: 1.5
      }}>
            <strong>已启用包装入库模式（PACKAGING_INBOUND）</strong><br />
            不允许直接生成库存。请通过「包装作业中心」完成 集蛋 → 分级 → 包装 → 自动入库。
          </div>
          <Link href="/packaging" style={{
        padding: "7px 14px",
        borderRadius: 7,
        background: "var(--status-warning)",
        color: "var(--text-on-dark)",
        textDecoration: "none",
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: "nowrap"
      }}>前往包装作业</Link>
        </div> : <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 16px",
      marginBottom: 18,
      borderRadius: 8,
      background: "var(--status-success-bg-medium)",
      border: "1px solid var(--status-success-bg-strong)",
      color: "var(--status-success)",
      fontSize: 13
    }}>
          <Egg size={16} /> 当前为 <strong>临时生产入库模式</strong>，录入即直接形成可销售库存。
        </div>}

      {!isPackagingMode && <>
          {/* 表单头部 */}
          <div style={{
        display: "flex",
        gap: 14,
        alignItems: "flex-end",
        marginBottom: 16,
        flexWrap: "wrap"
      }}>
            <div>
              <label style={{
            display: "block",
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 6
          }}>生产日期</label>
              <input type="date" value={eggDate} onChange={e => setEggDate(e.target.value)} className="bg-bg-muted border border-border text-text" style={{
            padding: "7px 10px",
            borderRadius: 7,
            fontSize: 13,
            outline: "none"
          }} />
            </div>
            <div>
              <label style={{
            display: "block",
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 6
          }}>鸡舍（可选·追溯）</label>
              <input value={houseCode} onChange={e => setHouseCode(e.target.value)} placeholder="如 A001" className="bg-bg-muted border border-border text-text" style={{
            padding: "7px 10px",
            borderRadius: 7,
            fontSize: 13,
            outline: "none",
            width: 140
          }} />
            </div>
            <button onClick={loadMode} className="bg-bg-muted border border-border text-text-muted" style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 14px",
          borderRadius: 7,
          fontSize: 13,
          cursor: "pointer"
        }}>
              <RefreshCw size={13} /> 刷新模式
            </button>
          </div>

          {/* 汇总（明细表上方合计） */}
          <div style={{
        display: "flex",
        gap: 24,
        padding: "12px 18px",
        marginBottom: 12,
        borderRadius: 10,
        background: "var(--bg-muted)",
        border: "1px solid var(--border)"
      }}>
            <div><span className={u.muted12}>明细行</span><div style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text-primary)"
          }}>{rows.filter(r => Number(r.qty) > 0).length}</div></div>
            <div><span className={u.muted12}>合计入库（枚）</span><div style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--color-primary)"
          }}>{totalQty.toLocaleString()}</div></div>
            <div><span className={u.muted12}>合计（提·÷180）</span><div style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text-primary)"
          }}>{Math.floor(totalQty / 180).toLocaleString()}</div></div>
          </div>

          {/* 明细表 */}
          <div className="bg-bg-card border border-border" style={{
        borderRadius: 10,
        overflow: "hidden",
        marginBottom: 16
      }}>
            <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13
        }}>
              <thead>
                <tr style={{
              background: "var(--bg-muted)"
            }}>
                  <th style={{
                textAlign: "left",
                padding: "10px 14px",
                color: "var(--text-secondary)",
                fontWeight: 600
              }}>蛋品等级</th>
                  <th style={{
                textAlign: "left",
                padding: "10px 14px",
                color: "var(--text-secondary)",
                fontWeight: 600
              }}>数量（枚）</th>
                  <th style={{
                width: 60
              }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => <tr key={i} style={{
              borderTop: "1px solid var(--border)"
            }}>
                    <td style={{
                padding: "8px 14px"
              }}>
                      <select value={row.grade} onChange={e => setRows(rs => rs.map((r, j) => j === i ? {
                  ...r,
                  grade: e.target.value
                } : r))} className="bg-bg-muted border border-border text-text" style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  fontSize: 13,
                  outline: "none"
                }}>
                        {EGG_GRADES.map(g => <option key={g.code} value={g.code}>{g.name}</option>)}
                      </select>
                    </td>
                    <td style={{
                padding: "8px 14px"
              }}>
                      <input type="number" min={0} value={row.qty} onChange={e => setRows(rs => rs.map((r, j) => j === i ? {
                  ...r,
                  qty: e.target.value
                } : r))} placeholder="0" className="bg-bg-muted border border-border text-text" style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  fontSize: 13,
                  outline: "none",
                  width: 140
                }} />
                    </td>
                    <td style={{
                padding: "8px 14px",
                textAlign: "center"
              }}>
                      {rows.length > 1 && <button onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} style={{
                  background: "none",
                  border: "none",
                  color: "var(--status-danger)",
                  cursor: "pointer"
                }}><Trash2 size={15} /></button>}
                    </td>
                  </tr>)}
              </tbody>
            </table>
            <div style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--border)"
        }}>
              <button onClick={() => setRows(rs => [...rs, {
            grade: "0",
            qty: ""
          }])} className="text-text-muted" style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            fontSize: 13,
            cursor: "pointer",
            color: "var(--color-primary)"
          }}>
                <Plus size={14} /> 添加一行
              </button>
            </div>
          </div>

          {error && <div style={{
        marginBottom: 14,
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--status-danger-bg-faint)",
        color: "var(--status-danger)",
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        gap: 8
      }}><AlertTriangle size={15} />{error}</div>}

          <button onClick={submit} disabled={saving || !canCreate} style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 22px",
        borderRadius: 8,
        background: canCreate ? "var(--color-primary)" : "var(--text-disabled)",
        color: "var(--text-on-dark)",
        border: "none",
        fontSize: 14,
        fontWeight: 600,
        cursor: canCreate && !saving ? "pointer" : "not-allowed"
      }}>
            <Save size={16} /> {saving ? "入库中..." : "确认入库（形成销售库存）"}
          </button>
          {!canCreate && <div style={{
        marginTop: 8,
        fontSize: 12,
        color: "var(--text-secondary)"
      }}>当前账号无录入权限（需 MENU_PROD_INBOUND 的 C 权限）</div>}

          {/* 入库结果 */}
          {result && <div style={{
        marginTop: 20,
        padding: 18,
        borderRadius: 10,
        background: "var(--bg-card)",
        border: "1px solid var(--status-success)"
      }}>
              <div style={{
          fontSize: 14,
          fontWeight: 700,
          color: "var(--status-success)",
          marginBottom: 10
        }}>✓ 入库成功 · 合计 {result.totalInbound.toLocaleString()} 枚，生成 {result.batches.length} 个可售批次</div>
              <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12
        }}>
                <thead><tr className={u.muted}><th style={{
                textAlign: "left",
                padding: "4px 8px"
              }}>批次号</th><th style={{
                textAlign: "left",
                padding: "4px 8px"
              }}>等级</th><th style={{
                textAlign: "left",
                padding: "4px 8px"
              }}>数量</th></tr></thead>
                <tbody>
                  {result.batches.map(b => <tr key={b.batchNo} style={{
              borderTop: "1px solid var(--border)"
            }}>
                      <td style={{
                padding: "4px 8px",
                fontFamily: "monospace"
              }}>{b.batchNo}</td>
                      <td style={{
                padding: "4px 8px"
              }}>{b.grade}号蛋</td>
                      <td style={{
                padding: "4px 8px"
              }}>{b.qty.toLocaleString()}</td>
                    </tr>)}
                </tbody>
              </table>
            </div>}
        </>}
    </div>;
}