"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { AlertTriangle, CheckCircle, Clock, RefreshCw, Plus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { crudApi } from "@/lib/api-client";
import { UserSelector, BatchSelector } from "@/components/shared-selectors/MasterDataSelectors";
import s from "@/components/ui/admin-ui.module.css";
import u from "@/styles/uix-utils.module.css";
const STATUS_CLS: Record<string, string> = {
  OPEN: "badgeDanger",
  CLOSED: "badgeSuccess",
  PENDING: "badgeWarning"
};
const SEVERITY_CLS: Record<string, string> = {
  HIGH: "badgeDanger",
  CRITICAL: "badgeDanger",
  MEDIUM: "badgeWarning",
  LOW: "badgeNeutral"
};
interface NCRow {
  id: number;
  nc_no?: string;
  source?: string;
  issue_desc?: string;
  qty?: number;
  handler?: string;
  action_taken?: string;
  severity?: string;
  batch_no?: string;
  status?: string;
  created_at?: string;
}
interface Form {
  source: string;
  issue_desc: string;
  qty: string;
  handler: string;
  action_taken: string;
  severity: string;
  batch_no: string;
}
const DEF: Form = {
  source: "",
  issue_desc: "",
  qty: "",
  handler: "",
  action_taken: "评估封存",
  severity: "MEDIUM",
  batch_no: ""
};
export default function NonconformancePage() {
  const toast = useToast();
  const {
    t
  } = useLanguage();
  const [data, setData] = useState<NCRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<NCRow | null>(null);
  const [form, setForm] = useState<Form>(DEF);
  const [saving, setSaving] = useState(false);
  const STATUS_LABEL: Record<string, string> = {
    OPEN: t("status.pending", "待处置"),
    CLOSED: t("ui.已关闭", "已关闭"),
    PENDING: t("status.pending", "待处置")
  };
  const token = typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "" : "";
  const hdr = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
  const load = useCallback(() => {
    setLoading(true);
    crudApi.list<NCRow>("qa_non_conformance", {
      limit: 200
    }).then(res => setData(res.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const open = data.filter(r => (r.status || "").toUpperCase() !== "CLOSED").length;
  const closed = data.filter(r => (r.status || "").toUpperCase() === "CLOSED").length;
  const high = data.filter(r => r.severity === "HIGH" || r.severity === "CRITICAL").length;
  const today = new Date().toISOString().slice(0, 10);
  const todayNcr = data.filter(r => (r.created_at || "").slice(0, 10) === today).length;
  const close_ncr = async (id: number) => {
    await fetch(`/api/crud/qa_non_conformance/${id}`, {
      method: "PUT",
      headers: hdr,
      body: JSON.stringify({
        status: "CLOSED",
        updated_at: new Date().toISOString()
      })
    });
    toast.success(t("ui.已关闭", "已关闭"));
    load();
  };
  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        qty: Number(form.qty) || 0,
        status: "OPEN"
      };
      if (editing?.id) {
        await fetch(`/api/crud/qa_non_conformance/${editing.id}`, {
          method: "PUT",
          headers: hdr,
          body: JSON.stringify(payload)
        });
      } else {
        const nc_no = `NCR-${Date.now().toString().slice(-8)}`;
        await fetch("/api/crud/qa_non_conformance", {
          method: "POST",
          headers: hdr,
          body: JSON.stringify({
            ...payload,
            nc_no
          })
        });
      }
      toast.success(t("ui.保存成功", "保存成功"));
      setDrawerOpen(false);
      setEditing(null);
      setForm(DEF);
      load();
    } catch {
      toast.error(t("ui.操作失败", "操作失败"));
    } finally {
      setSaving(false);
    }
  };
  return <div className="animate-fade-in">
      <PageHeader title={t("ui.不合格品处置", "不合格品处置")} subtitle={t("ui.不合格品追踪评估与关闭", "不合格品追踪、评估与关闭")} breadcrumb={[t("ui.品质追溯", "品质追溯"), t("ui.不合格品", "不合格品")]} actions={<div style={{
      display: "flex",
      gap: 8
    }}>
            <button type="button" className={`${s.btnSecondary} ${u.flexRow}`} onClick={load} disabled={loading}>
              <RefreshCw size={14} style={{
          animation: loading ? "spin 1s linear infinite" : "none"
        }} /> {t("common.refresh", "刷新")}
            </button>
            <button type="button" className={`${s.btnDanger} ${u.flexRow}`} onClick={() => {
        setEditing(null);
        setForm(DEF);
        setDrawerOpen(true);
      }}>
              <Plus size={14} /> {t("ui.新增NCR", "新增 NCR")}
            </button>
          </div>} />

      {/* KPI */}
      <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))",
      gap: 12,
      marginBottom: 20
    }}>
        {[{
        label: t("status.pending", "待处置"),
        value: String(open),
        accent: "var(--status-danger)",
        icon: <AlertTriangle size={18} />
      }, {
        label: t("ui.已关闭", "已关闭"),
        value: String(closed),
        accent: "var(--status-success)",
        icon: <CheckCircle size={18} />
      }, {
        label: t("ui.高严重性", "高严重性"),
        value: String(high),
        accent: "var(--status-danger)",
        icon: <AlertTriangle size={18} />
      }, {
        label: t("ui.今日新增", "今日新增"),
        value: String(todayNcr),
        accent: "var(--status-warning)",
        icon: <Clock size={18} />
      }].map(k => <div key={k.label} style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderLeft: `var(--card-accent-width) solid ${k.accent}`,
        borderRadius: "var(--radius-lg)",
        padding: "14px 18px"
      }}>
            <div style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          marginBottom: 8,
          color: k.accent,
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase"
        }}>{k.icon}{k.label}</div>
            <div style={{
          fontSize: 26,
          fontWeight: 800,
          color: k.accent
        }}>{k.value}</div>
          </div>)}
      </div>

      <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden"
    }}>
        <table className={s.table}>
          <thead>
            <tr>
              {[t("ui.NCR单号", "NCR单号"), t("ui.来源", "来源"), t("ui.问题描述", "问题描述"), t("ui.数量", "数量"), t("ui.严重性", "严重性"), t("ui.处置", "处置"), t("common.status", "状态"), t("common.operation", "操作")].map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} style={{
              padding: 28,
              textAlign: "center",
              color: "var(--text-secondary)"
            }}>{t("common.loading", "加载中…")}</td></tr>}
            {!loading && data.length === 0 && <tr><td colSpan={8} style={{
              padding: 28,
              textAlign: "center",
              color: "var(--text-secondary)"
            }}>{t("ui.暂无不合格品记录", "暂无不合格品记录")}</td></tr>}
            {!loading && data.map((r, i) => {
            const st = r.status || "OPEN";
            const isClosed = st.toLowerCase() === "closed";
            return <tr key={r.id}>
                  <td style={{
                fontFamily: "monospace",
                fontSize: 12,
                color: "var(--color-primary)"
              }}>{r.nc_no || `NCR-${r.id}`}</td>
                  <td className={u.muted}>{r.source || "—"}</td>
                  <td style={{
                maxWidth: 160,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}>{r.issue_desc || "—"}</td>
                  <td>{r.qty || 0}</td>
                  <td>
                    <span className={`${s.badge} ${s[SEVERITY_CLS[r.severity || ""] ?? 'badgeNeutral']}`}>{r.severity || "—"}</span>
                  </td>
                  <td className={u.muted12}>{r.action_taken || "—"}</td>
                  <td>
                    <span className={`${s.badge} ${s[STATUS_CLS[st] ?? 'badgeNeutral']}`}>{STATUS_LABEL[st] || st}</span>
                  </td>
                  <td style={{
                display: "flex",
                gap: 6
              }}>
                    <button type="button" className={s.btnSecondary} style={{
                  padding: "4px 8px",
                  fontSize: 12
                }} onClick={() => {
                  setEditing(r);
                  setForm({
                    source: r.source || "",
                    issue_desc: r.issue_desc || "",
                    qty: String(r.qty || ""),
                    handler: r.handler || "",
                    action_taken: r.action_taken || "评估封存",
                    severity: r.severity || "MEDIUM",
                    batch_no: r.batch_no || ""
                  });
                  setDrawerOpen(true);
                }}>
                      {t("common.edit", "编辑")}
                    </button>
                    {!isClosed && <button type="button" className={s.btnSuccess} style={{
                  padding: "4px 8px",
                  fontSize: 12
                }} onClick={() => close_ncr(r.id)}>{t("common.close", "关闭")}</button>}
                  </td>
                </tr>;
          })}
          </tbody>
        </table>
      </div>

      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑NCR", "编辑NCR") : t("ui.新增不合格品", "新增不合格品")} onClose={() => {
      setDrawerOpen(false);
      setEditing(null);
      setForm(DEF);
    }}>
        <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 14
      }}>
          {([{
          key: "batch_no",
          label: t("ui.关联批次号", "关联批次号"),
          type: "batch",
          ph: t("ui.批次号示例", "如 BT-123456-A")
        }, {
          key: "source",
          label: t("ui.问题来源", "问题来源"),
          type: "text",
          ph: t("ui.问题来源示例", "如：客诉、巡检")
        }, {
          key: "issue_desc",
          label: t("ui.问题描述", "问题描述"),
          type: "textarea",
          ph: t("ui.问题描述详细", "详细描述不合格情况")
        }, {
          key: "qty",
          label: t("ui.不合格数量", "不合格数量"),
          type: "number",
          ph: ""
        }] as {
          key: string;
          label: string;
          type: string;
          ph: string;
        }[]).map(f => <div key={f.key}>
              <label style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            display: "block",
            marginBottom: 6
          }}>{f.label}</label>
              {f.type === "batch" ? <BatchSelector value={form[f.key as keyof Form]} onChange={v => setForm(p => ({
            ...p,
            [f.key]: v
          }))} /> : f.type === "textarea" ? <textarea value={form[f.key as keyof Form]} onChange={e => setForm(p => ({
            ...p,
            [f.key]: e.target.value
          }))} rows={3} placeholder={f.ph} style={{
            width: "100%",
            padding: "10px 12px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-primary)",
            fontSize: 14,
            outline: "none",
            resize: "vertical",
            boxSizing: "border-box"
          }} /> : <input type={f.type} value={form[f.key as keyof Form]} onChange={e => setForm(p => ({
            ...p,
            [f.key]: e.target.value
          }))} placeholder={f.ph} style={{
            width: "100%",
            padding: "10px 12px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-primary)",
            fontSize: 14,
            outline: "none",
            boxSizing: "border-box"
          }} />}
            </div>)}
          <div>
            <label style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            display: "block",
            marginBottom: 6
          }}>{t("ui.责任人", "责任人")}</label>
            <UserSelector value={form.handler} onChange={v => setForm(p => ({
            ...p,
            handler: v
          }))} />
          </div>
          <div>
            <label style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            display: "block",
            marginBottom: 6
          }}>{t("ui.严重性", "严重性")}</label>
            <select value={form.severity} onChange={e => setForm(p => ({
            ...p,
            severity: e.target.value
          }))} style={{
            width: "100%",
            padding: "10px 12px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-primary)",
            fontSize: 14,
            outline: "none"
          }}>
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            display: "block",
            marginBottom: 6
          }}>{t("ui.处置方式", "处置方式")}</label>
            <select value={form.action_taken} onChange={e => setForm(p => ({
            ...p,
            action_taken: e.target.value
          }))} style={{
            width: "100%",
            padding: "10px 12px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-primary)",
            fontSize: 14,
            outline: "none"
          }}>
              {[{
              v: "评估封存",
              l: t("ui.评估封存", "评估封存")
            }, {
              v: "降级使用",
              l: t("ui.降级使用", "降级使用")
            }, {
              v: "销毁处理",
              l: t("ui.销毁处理", "销毁处理")
            }, {
              v: "退货供应商",
              l: t("ui.退货供应商", "退货供应商")
            }, {
              v: "其他",
              l: t("ui.其他", "其他")
            }].map(({
              v,
              l
            }) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div style={{
          display: "flex",
          gap: 10,
          paddingTop: 8
        }}>
            <button type="button" className={`${s.btnSecondary} ${u.flex1}`} onClick={() => {
            setDrawerOpen(false);
            setEditing(null);
            setForm(DEF);
          }}>{t("common.cancel", "取消")}</button>
            <button type="button" className={s.btnDanger} style={{
            flex: 2
          }} disabled={saving} onClick={save}>{saving ? t("ui.保存中", "保存中…") : t("common.save", "保存")}</button>
          </div>
        </div>
      </RightDrawer>
    </div>;
}