"use client";

import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import { Settings2, RefreshCw, AlertTriangle, ArrowRightLeft, ShieldCheck, History } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";
import request from "@/lib/api-client";
import { useLanguage } from "@/contexts/LanguageContext";
import { LoadingSkeleton } from "@/components/design-system";

/**
 * 库存来源模式（库存来源模式治理 P1A）
 * TEMP_PRODUCTION_INBOUND（临时生产入库） vs PACKAGING_INBOUND（包装入库）二选一，互斥。
 * 切换需 ADMIN/CEO/FACTORY_MGR（MENU_INV_SOURCE_MODE 的 A 权限），切换前强制风险评估。
 */

const MODE_LABEL: Record<string, string> = {
  TEMP_PRODUCTION_INBOUND: "临时生产入库",
  PACKAGING_INBOUND: "包装入库"
};
const MODE_COLOR: Record<string, string> = {
  TEMP_PRODUCTION_INBOUND: "var(--status-info)",
  PACKAGING_INBOUND: "var(--status-success)"
};
interface ModeConfig {
  scope_level: string;
  scope_code: string;
  mode: string;
  remark?: string;
  updated_by?: string;
  updated_at?: string;
}
interface AuditRow {
  scope_level: string;
  scope_code: string;
  old_mode?: string;
  new_mode: string;
  operator?: string;
  remark?: string;
  created_at: string;
}
interface Risk {
  currentMode: string;
  newMode: string;
  balance: number;
  lastInboundDate: string | null;
  lastPackagingDate: string | null;
  unfinishedPackagingBatches: number;
  unconfirmedInventory: number;
  warnings: string[];
  canSwitch: boolean;
}
export default function SourceModePage() {
  const { t } = useLanguage();
  const {
    canView,
    canApprove
  } = usePermission("MENU_INV_SOURCE_MODE");
  const [configs, setConfigs] = useState<ModeConfig[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  // 切换表单
  const [scopeLevel, setScopeLevel] = useState("GROUP");
  const [scopeCode, setScopeCode] = useState("ALL");
  const [newMode, setNewMode] = useState("PACKAGING_INBOUND");
  const [risk, setRisk] = useState<Risk | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [remark, setRemark] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, a] = await Promise.all([request<ModeConfig[]>("/v2/inventory/source/configs"), request<AuditRow[]>("/v2/inventory/source/audit?limit=30")]);
      setConfigs(Array.isArray(c) ? c : []);
      setAudit(Array.isArray(a) ? a : []);
    } catch {/* ignore */} finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (canView) load();
  }, [canView, load]);
  const assess = async () => {
    setError("");
    setMsg("");
    setRisk(null);
    setAssessing(true);
    try {
      const r = await request<Risk>("/v2/inventory/source/assess-risk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          scopeLevel,
          scopeCode,
          newMode
        })
      });
      setRisk(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('ui.风险评估失败','风险评估失败'));
    } finally {
      setAssessing(false);
    }
  };
  const doSwitch = async () => {
    setError("");
    setMsg("");
    setSwitching(true);
    try {
      await request("/v2/inventory/source/switch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          scopeLevel,
          scopeCode,
          newMode,
          remark: remark || undefined,
          confirmRisk: true
        })
      });
      setMsg(`已切换 ${scopeLevel}/${scopeCode} → ${MODE_LABEL[newMode]}`);
      setRisk(null);
      setRemark("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('ui.切换失败','切换失败'));
    } finally {
      setSwitching(false);
    }
  };
  if (!canView) return <div className={u.emptyPad40}>{t('ui.无权限查看库存来源模式','无权限查看库存来源模式')}</div>;
  return <div className="animate-fade-in" style={{
    padding: "24px 32px"
  }}>
      <PageHeader title={t('ui.库存来源模式','库存来源模式')} subtitle={t('ui.临时生产入库 / 包装入库 二选一（互斥），统一进入库存体系','临时生产入库 / 包装入库 二选一（互斥），统一进入库存体系')} breadcrumb={[t('ui.库存管理','库存管理'), t('ui.库存来源模式','库存来源模式')]} />

      <div style={{
      display: "flex",
      gap: 10,
      marginBottom: 18
    }}>
        <button onClick={load} className="bg-bg-muted border border-border text-text-muted" style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 14px",
        borderRadius: 7,
        fontSize: 13,
        cursor: "pointer"
      }}>
          <RefreshCw size={13} /> {t('ui.刷新','刷新')}
        </button>
      </div>

      {/* 当前模式配置 */}
      <div className={u.mb24}>
        <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 10,
        fontSize: 14,
        fontWeight: 600,
        color: "var(--text-primary)"
      }}>
          <Settings2 size={16} /> {t('ui.当前模式配置','当前模式配置')}
        </div>
        {loading ? <div style={{ padding: 16 }}><LoadingSkeleton variant="table" rows={6} cols={5} /></div> : <div className="bg-bg-card border border-border" style={{
        borderRadius: 10,
        overflow: "hidden"
      }}>
            <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13
        }}>
              <thead><tr style={{
              background: "var(--bg-muted)",
              color: "var(--text-secondary)"
            }}>
                <th style={{
                textAlign: "left",
                padding: "10px 14px"
              }}>{t('ui.作用范围','作用范围')}</th>
                <th style={{
                textAlign: "left",
                padding: "10px 14px"
              }}>{t('ui.范围编码','范围编码')}</th>
                <th style={{
                textAlign: "left",
                padding: "10px 14px"
              }}>{t('ui.模式','模式')}</th>
                <th style={{
                textAlign: "left",
                padding: "10px 14px"
              }}>{t('ui.更新人','更新人')}</th>
                <th style={{
                textAlign: "left",
                padding: "10px 14px"
              }}>{t('ui.备注','备注')}</th>
              </tr></thead>
              <tbody>
                {configs.length === 0 ? <tr><td colSpan={5} style={{
                padding: 30,
                textAlign: "center",
                color: "var(--text-secondary)"
              }}>{t('ui.暂无配置（默认 临时生产入库）','暂无配置（默认 临时生产入库）')}</td></tr> : configs.map((c, i) => <tr key={i} style={{
              borderTop: "1px solid var(--border)"
            }}>
                    <td style={{
                padding: "8px 14px"
              }}>{c.scope_level}</td>
                    <td style={{
                padding: "8px 14px",
                fontFamily: "monospace"
              }}>{c.scope_code}</td>
                    <td style={{
                padding: "8px 14px"
              }}>
                      <span style={{
                  padding: "2px 10px",
                  borderRadius: 5,
                  fontSize: 12,
                  fontWeight: 600,
                  background: `${MODE_COLOR[c.mode] ?? "var(--text-secondary)"}22`,
                  color: MODE_COLOR[c.mode] ?? "var(--text-secondary)"
                }}>{MODE_LABEL[c.mode] ?? c.mode}</span>
                    </td>
                    <td style={{
                padding: "8px 14px",
                color: "var(--text-secondary)"
              }}>{c.updated_by ?? "-"}</td>
                    <td style={{
                padding: "8px 14px",
                color: "var(--text-secondary)",
                fontSize: 12,
                maxWidth: 320
              }}>{c.remark ?? "-"}</td>
                  </tr>)}
              </tbody>
            </table>
          </div>}
      </div>

      {/* 切换（仅 A 权限） */}
      {canApprove && <div style={{
      marginBottom: 24,
      padding: 18,
      borderRadius: 12,
      background: "var(--bg-card)",
      border: "1px solid var(--border)"
    }}>
          <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 14,
        fontSize: 14,
        fontWeight: 600,
        color: "var(--text-primary)"
      }}>
            <ArrowRightLeft size={16} /> {t('ui.切换库存来源模式','切换库存来源模式')}
          </div>
          <div style={{
        display: "flex",
        gap: 14,
        alignItems: "flex-end",
        marginBottom: 14,
        flexWrap: "wrap"
      }}>
            <div>
              <label style={{
            display: "block",
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 6
          }}>{t('ui.作用范围','作用范围')}</label>
              <select value={scopeLevel} onChange={e => setScopeLevel(e.target.value)} className="bg-bg-muted border border-border text-text" style={{
            padding: "7px 10px",
            borderRadius: 7,
            fontSize: 13
          }}>
                <option value="GROUP">{t('ui.GROUP（集团）','GROUP（集团）')}</option>
                <option value="COMPANY">{t('ui.COMPANY（公司）','COMPANY（公司）')}</option>
                <option value="SITE">{t('ui.SITE（场站·推荐）','SITE（场站·推荐）')}</option>
              </select>
            </div>
            <div>
              <label style={{
            display: "block",
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 6
          }}>{t('ui.范围编码','范围编码')}</label>
              <input value={scopeCode} onChange={e => setScopeCode(e.target.value)} placeholder={t('ui.ALL / 公司码 / 场站码','ALL / 公司码 / 场站码')} className="bg-bg-muted border border-border text-text" style={{
            padding: "7px 10px",
            borderRadius: 7,
            fontSize: 13,
            width: 200
          }} />
            </div>
            <div>
              <label style={{
            display: "block",
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 6
          }}>{t('ui.目标模式','目标模式')}</label>
              <select value={newMode} onChange={e => {
            setNewMode(e.target.value);
            setRisk(null);
          }} className="bg-bg-muted border border-border text-text" style={{
            padding: "7px 10px",
            borderRadius: 7,
            fontSize: 13
          }}>
                <option value="TEMP_PRODUCTION_INBOUND">{t('ui.临时生产入库','临时生产入库')}</option>
                <option value="PACKAGING_INBOUND">{t('ui.包装入库','包装入库')}</option>
              </select>
            </div>
            <button onClick={assess} disabled={assessing} style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 16px",
          borderRadius: 7,
          background: "var(--bg-muted)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          fontSize: 13,
          cursor: "pointer",
          fontWeight: 600
        }}>
              <ShieldCheck size={14} /> {assessing ? t('ui.评估中...','评估中...') : t('ui.切换前风险评估','切换前风险评估')}
            </button>
          </div>

          {/* 风险评估结果 */}
          {risk && <div style={{
        padding: 16,
        borderRadius: 10,
        background: "var(--bg-muted)",
        border: "1px solid var(--border)",
        marginBottom: 14
      }}>
              <div style={{
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          marginBottom: 12
        }}>
                <div><span className={u.muted12}>{t('ui.当前模式','当前模式')}</span><div className={u.fw600}>{MODE_LABEL[risk.currentMode] ?? risk.currentMode}</div></div>
                <div><span className={u.muted12}>{t('ui.可售余额','可售余额')}</span><div className={u.fw600}>{risk.balance.toLocaleString()} {t('ui.枚','枚')}</div></div>
                <div><span className={u.muted12}>{t('ui.最后入库','最后入库')}</span><div className={u.fw600}>{risk.lastInboundDate ?? "-"}</div></div>
                <div><span className={u.muted12}>{t('ui.最后包装','最后包装')}</span><div className={u.fw600}>{risk.lastPackagingDate ?? "-"}</div></div>
                <div><span className={u.muted12}>{t('ui.未完成包装','未完成包装')}</span><div className={u.fw600}>{risk.unfinishedPackagingBatches}</div></div>
                <div><span className={u.muted12}>{t('ui.未确认库存','未确认库存')}</span><div className={u.fw600}>{risk.unconfirmedInventory}</div></div>
              </div>
              {risk.warnings.length > 0 && <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 6
        }}>
                  {risk.warnings.map((w, i) => <div key={i} style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "var(--status-warning)"
          }}><AlertTriangle size={13} />{w}</div>)}
                </div>}
              {risk.canSwitch ? <div style={{
          marginTop: 14,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap"
        }}>
                  <input value={remark} onChange={e => setRemark(e.target.value)} placeholder={t('ui.切换备注（建议填写原因）','切换备注（建议填写原因）')} className="bg-bg-card border border-border text-text" style={{
            padding: "7px 10px",
            borderRadius: 7,
            fontSize: 13,
            flex: "0 0 280px"
          }} />
                  <button onClick={doSwitch} disabled={switching} style={{
            padding: "8px 20px",
            borderRadius: 7,
            background: "var(--status-warning)",
            color: "var(--text-on-dark)",
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer"
          }}>
                    {switching ? t('ui.切换中...','切换中...') : `确认切换为 ${MODE_LABEL[risk.newMode]}`}
                  </button>
                </div> : <div style={{
          marginTop: 12,
          fontSize: 12,
          color: "var(--text-secondary)"
        }}>{t('ui.当前已是该模式，无需切换。','当前已是该模式，无需切换。')}</div>}
            </div>}

          {msg && <div style={{
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--status-success-bg-medium)",
        color: "var(--status-success)",
        fontSize: 13
      }}>{msg}</div>}
          {error && <div style={{
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--status-danger-bg-faint)",
        color: "var(--status-danger)",
        fontSize: 13
      }}>{error}</div>}
        </div>}

      {/* 审计日志 */}
      <div>
        <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 10,
        fontSize: 14,
        fontWeight: 600,
        color: "var(--text-primary)"
      }}>
          <History size={16} /> {t('ui.切换审计日志','切换审计日志')}
        </div>
        <div className="bg-bg-card border border-border" style={{
        borderRadius: 10,
        overflow: "auto"
      }}>
          <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12
        }}>
            <thead><tr style={{
              background: "var(--bg-muted)",
              color: "var(--text-secondary)"
            }}>
              <th style={{
                textAlign: "left",
                padding: "10px 14px"
              }}>{t('ui.时间','时间')}</th>
              <th style={{
                textAlign: "left",
                padding: "10px 14px"
              }}>{t('ui.范围','范围')}</th>
              <th style={{
                textAlign: "left",
                padding: "10px 14px"
              }}>{t('ui.原模式','原模式')}</th>
              <th style={{
                textAlign: "left",
                padding: "10px 14px"
              }}>{t('ui.新模式','新模式')}</th>
              <th style={{
                textAlign: "left",
                padding: "10px 14px"
              }}>{t('ui.操作人','操作人')}</th>
              <th style={{
                textAlign: "left",
                padding: "10px 14px"
              }}>{t('ui.备注','备注')}</th>
            </tr></thead>
            <tbody>
              {audit.length === 0 ? <tr><td colSpan={6} style={{
                padding: 30,
                textAlign: "center",
                color: "var(--text-secondary)"
              }}>{t('ui.暂无切换记录','暂无切换记录')}</td></tr> : audit.map((a, i) => <tr key={i} style={{
              borderTop: "1px solid var(--border)"
            }}>
                  <td style={{
                padding: "8px 14px",
                whiteSpace: "nowrap"
              }}>{a.created_at?.slice(0, 19).replace("T", " ")}</td>
                  <td style={{
                padding: "8px 14px",
                fontFamily: "monospace"
              }}>{a.scope_level}/{a.scope_code}</td>
                  <td style={{
                padding: "8px 14px"
              }}>{a.old_mode ? MODE_LABEL[a.old_mode] ?? a.old_mode : "-"}</td>
                  <td style={{
                padding: "8px 14px"
              }}>{MODE_LABEL[a.new_mode] ?? a.new_mode}</td>
                  <td style={{
                padding: "8px 14px"
              }}>{a.operator ?? "-"}</td>
                  <td style={{
                padding: "8px 14px",
                color: "var(--text-secondary)"
              }}>{a.remark ?? "-"}</td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>;
}