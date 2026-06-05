"use client";

import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { usePermission } from "@/hooks/usePermission";
import { EmptyState, LoadingSkeleton } from "@/components/design-system";
import request from "@/lib/api-client";

/**
 * 数据质量中心（G1 主数据中心）
 * 检查重复客户/供应商、缺联系人/账户、未绑定账号股东等数据质量问题。
 */
import u from "@/styles/uix-utils.module.css";
interface QualityCheck {
  key: string;
  label: string;
  count: number;
}
interface QualityResult {
  score: number;
  totalIssues: number;
  checks: QualityCheck[];
}
export default function MasterDataQualityPage() {
  const {
    canView
  } = usePermission("MENU_MD_QUALITY");
  const [data, setData] = useState<QualityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await request<QualityResult>("/master-data/quality"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (canView) load();
  }, [canView, load]);
  if (!canView) return <div className={u.emptyPad40}>无权限访问数据质量中心</div>;
  const scoreColor = (s: number) => s >= 90 ? "var(--status-success)" : s >= 70 ? "var(--status-warning)" : "var(--status-danger)";
  return <div className="animate-fade-in" style={{
    padding: "24px 32px",
    maxWidth: 980
  }}>
      <PageHeader title="数据质量中心" subtitle="主数据完整性与一致性检查 · 重复/缺漏/未绑定问题清单" breadcrumb={["主数据中心", "数据质量中心"]} />

      <div style={{
      display: "flex",
      gap: 10,
      marginBottom: 18
    }}>
        <button onClick={load} disabled={loading} className="bg-bg-muted border border-border text-text-muted" style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 16px",
        borderRadius: 8,
        fontSize: 13,
        cursor: "pointer"
      }}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> 刷新
        </button>
      </div>

      {error && <div style={{
      padding: "10px 14px",
      borderRadius: 8,
      marginBottom: 16,
      background: "var(--status-danger-bg)",
      border: "1px solid var(--status-danger-border)",
      color: "var(--status-danger)",
      fontSize: 13
    }}>{error}</div>}

      {loading ? <div style={{
      padding: 16
    }}><LoadingSkeleton variant="card" rows={3} /></div> : !data ? <EmptyState title="暂无数据质量信息" /> : <>
          {/* 质量评分 */}
          <div style={{
        display: "flex",
        gap: 16,
        marginBottom: 20
      }}>
            <div style={{
          flex: 1,
          padding: "20px 24px",
          borderRadius: 12,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 16
        }}>
              <ShieldCheck size={36} style={{
            color: scoreColor(data.score)
          }} />
              <div>
                <div className={u.muted12}>数据质量评分</div>
                <div style={{
              fontSize: 32,
              fontWeight: 800,
              color: scoreColor(data.score)
            }}>{data.score}<span style={{
                fontSize: 16,
                color: "var(--text-secondary)"
              }}> / 100</span></div>
              </div>
            </div>
            <div style={{
          flex: 1,
          padding: "20px 24px",
          borderRadius: 12,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 16
        }}>
              <AlertTriangle size={36} style={{
            color: data.totalIssues > 0 ? "var(--status-warning)" : "var(--status-success)"
          }} />
              <div>
                <div className={u.muted12}>待处理问题总数</div>
                <div style={{
              fontSize: 32,
              fontWeight: 800,
              color: "var(--text-primary)"
            }}>{data.totalIssues}</div>
              </div>
            </div>
          </div>

          {/* 检查项清单 */}
          <div style={{
        borderRadius: 12,
        border: "1px solid var(--border)",
        overflow: "hidden",
        background: "var(--bg-card)"
      }}>
            <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13.5
        }}>
              <thead>
                <tr style={{
              background: "var(--bg-muted)",
              color: "var(--text-secondary)"
            }}>
                  <th style={{
                textAlign: "left",
                padding: "10px 16px"
              }}>检查项</th>
                  <th style={{
                textAlign: "right",
                padding: "10px 16px",
                width: 120
              }}>问题数量</th>
                  <th style={{
                textAlign: "center",
                padding: "10px 16px",
                width: 100
              }}>状态</th>
                </tr>
              </thead>
              <tbody>
                {data.checks.map(c => <tr key={c.key} style={{
              borderTop: "1px solid var(--border)"
            }}>
                    <td style={{
                padding: "11px 16px",
                color: "var(--text-primary)"
              }}>{c.label}</td>
                    <td style={{
                padding: "11px 16px",
                textAlign: "right",
                fontWeight: 600,
                color: c.count < 0 ? "var(--text-disabled)" : c.count > 0 ? "var(--status-danger)" : "var(--status-success)"
              }}>
                      {c.count < 0 ? "—" : c.count}
                    </td>
                    <td style={{
                padding: "11px 16px",
                textAlign: "center"
              }}>
                      {c.count < 0 ? <span style={{
                  fontSize: 12,
                  color: "var(--text-disabled)"
                }}>不可用</span> : c.count > 0 ? <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  color: "var(--status-danger)"
                }}>
                          <AlertTriangle size={13} /> 需处理
                        </span> : <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  color: "var(--status-success)"
                }}>
                          <CheckCircle2 size={13} /> 正常
                        </span>}
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
        </>}
    </div>;
}