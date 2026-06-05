"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import { RefreshCw, Activity, PackageCheck, PackageMinus, BarChart3, CheckSquare, AlertCircle } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";

// ✅ V3 日结对账页面 (对应 V2: DailyCloseWMS.jsx)
// 数据来源: /api/stocktake/daily-close (自定义聚合 API)
// 业务逻辑: 当日入出库汇总 → 库存平衡核查 → 执行日结（每日一次）
import u from "@/styles/uix-utils.module.css";
const pad = (n: number) => String(n).padStart(2, "0");
const today0 = new Date();
const todayStr = `${today0.getFullYear()}-${pad(today0.getMonth() + 1)}-${pad(today0.getDate())}`;
interface DailyData {
  inbound_qty: number;
  outbound_qty: number;
  current_stock: number;
  closed_today: null | {
    stocktake_no?: string;
    close_no?: string;
  };
  last_stocktake: null | {
    stocktake_no: string;
    date: string;
    act_qty: number;
    diff_qty: number;
  };
}
export default function DailyClosePage() {
  const {
    t
  } = useLanguage();
  const [date, setDate] = useState(todayStr);
  const [data, setData] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [toast, setToast] = useState<{
    type: "ok" | "err";
    msg: string;
  } | null>(null);
  const showToast = (type: "ok" | "err", msg: string) => {
    setToast({
      type,
      msg
    });
    setTimeout(() => setToast(null), 4000);
  };
  const token = () => typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") ?? "" : "";
  const authH = () => ({
    Authorization: `Bearer ${token()}`
  });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/stocktake/daily-close?date=${date}`, {
        headers: authH()
      });
      if (!r.ok) throw new Error();
      const j = await r.json();
      setData(j.data ?? null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date]);
  useEffect(() => {
    load();
  }, [load]);
  const handleClose = async () => {
    if (closing) return;
    if (data?.closed_today) {
      showToast("err", t("ui.今日已完成日结不可重复操作", "今日已完成日结，不可重复操作"));
      return;
    }
    setClosing(true);
    try {
      const user = typeof window !== "undefined" ? JSON.parse(sessionStorage.getItem("phoenix_user") ?? "{}") : {};
      const r = await fetch("/api/stocktake/daily-close", {
        method: "POST",
        headers: {
          ...authH(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          operator: user.username ?? user.name ?? "SYSTEM"
        })
      });
      const j = await r.json();
      if (j.code === 200) {
        showToast("ok", `✅ ${t("ui.日结完成", "日结完成")} · ${j.data?.close_no ?? ""}`);
        await load();
      } else {
        showToast("err", j.msg ?? t("ui.日结失败请联系管理员", "日结失败，请联系管理员"));
      }
    } catch {
      showToast("err", t("ui.网络错误请重试", "网络错误，请重试"));
    } finally {
      setClosing(false);
    }
  };
  const inQty = data ? Number(data.inbound_qty ?? 0) : 0;
  const outQty = data ? Number(data.outbound_qty ?? 0) : 0;
  const curQty = data ? Number(data.current_stock ?? 0) : 0;
  const balance = inQty - outQty;
  const isClosed = !!data?.closed_today;
  return <div>
      <PageHeader title={t("ui.日结对账", "日结对账")} subtitle={t("ui.当日入出库汇总库存核对日结确认", "当日入出库汇总 · 库存核对 · 日结确认")} breadcrumb={[t("ui.仓储管理", "仓储管理"), t("ui.日结对账", "日结对账")]} actions={<div className={u.flexRow8}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{
        padding: "7px 12px",
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg-card)",
        color: "var(--text-primary)",
        fontSize: 13
      }} />
            <button type="button" className={s.btnSecondary} onClick={load}>
              <RefreshCw size={13} style={{
          animation: loading ? "spin 1s linear infinite" : "none"
        }} />{t("common.refresh", "刷新")}
            </button>
          </div>} />

      {/* Toast 通知 — 用 alertLow/alertCritical */}
      {toast && <div className={`${s.alertCard} ${toast.type === "ok" ? s.alertLow : s.alertCritical}`} style={{
      marginBottom: 16,
      fontSize: 13,
      fontWeight: 600
    }}>
          {toast.msg}
        </div>}

      {/* 日期 + 状态标记 */}
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}>
        <div style={{
        fontSize: 14,
        color: "var(--text-secondary)"
      }}>
          {t("ui.核算日期", "核算日期")}：<strong style={{
          color: "var(--text-primary)"
        }}>{date}</strong>
        </div>
        {isClosed && <span className={`${s.badge} ${s.badgeSuccess}`} style={{
        display: "flex",
        alignItems: "center",
        gap: 4
      }}>
            <CheckSquare size={12} />{t("ui.已日结", "已日结")}
          </span>}
        {!isClosed && !loading && <span className={`${s.badge} ${s.badgeWarning}`} style={{
        display: "flex",
        alignItems: "center",
        gap: 4
      }}>
            <AlertCircle size={12} />{t("ui.待日结", "待日结")}
          </span>}
      </div>

      {/* 4 个 KPI 卡片 */}
      <div className={`${s.statsRow} ${u.mb24}`}>
        {[{
        label: t("ui.今日入库枚", "今日入库（枚）"),
        val: loading ? "…" : inQty.toLocaleString(),
        cardCls: s.statCardSuccess,
        valCls: s.textSuccess,
        iconCls: s.textSuccess,
        icon: <PackageCheck size={16} />
      }, {
        label: t("ui.今日出库枚", "今日出库（枚）"),
        val: loading ? "…" : outQty.toLocaleString(),
        cardCls: s.statCardDanger,
        valCls: s.textDanger,
        iconCls: s.textDanger,
        icon: <PackageMinus size={16} />
      }, {
        label: t("ui.净变化", "净变化"),
        val: loading ? "…" : (balance >= 0 ? "+" : "") + balance.toLocaleString(),
        cardCls: balance >= 0 ? s.statCardInfo : s.statCardWarning,
        valCls: balance >= 0 ? s.textInfo : s.textWarning,
        iconCls: balance >= 0 ? s.textInfo : s.textWarning,
        icon: <Activity size={16} />
      }, {
        label: t("ui.当前库存枚", "当前库存（枚）"),
        val: loading ? "…" : curQty.toLocaleString(),
        cardCls: s.statCardPrimary,
        valCls: "",
        iconCls: "",
        icon: <BarChart3 size={16} />
      }].map(k => <div key={k.label} className={`${s.statCard} ${k.cardCls}`}>
            <div className={k.iconCls} style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6
        }}>
              {k.icon}
              <span style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "var(--text-secondary)"
          }}>{k.label}</span>
            </div>
            <div className={`${s.statValue} ${k.valCls}`}>{k.val}</div>
          </div>)}
      </div>

      {/* 最近盘点 + 库存平衡 */}
      <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 16,
      marginBottom: 24
    }}>
        {/* 最近盘点记录 */}
        <div className={s.card} style={{
        padding: "20px 24px"
      }}>
          <div style={{
          fontSize: 13,
          fontWeight: 700,
          marginBottom: 14
        }}>📋 {t("ui.最近盘点记录", "最近盘点记录")}</div>
          {loading ? <div style={{
          color: "var(--text-secondary)",
          fontSize: 13
        }}>{t("common.loading", "加载中…")}</div> : data?.last_stocktake ? <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 10
        }}>
              {[{
            label: t("ui.盘点单号", "盘点单号"),
            value: data.last_stocktake.stocktake_no
          }, {
            label: t("common.date", "盘点日期"),
            value: data.last_stocktake.date
          }, {
            label: t("ui.实盘量", "实盘量"),
            value: `${Number(data.last_stocktake.act_qty ?? 0).toLocaleString()} ${t("ui.枚", "枚")}`
          }, {
            label: t("ui.差异量", "差异量"),
            value: `${Number(data.last_stocktake.diff_qty ?? 0).toLocaleString()} ${t("ui.枚", "枚")}`
          }].map(row => <div key={row.label} style={{
            display: "flex",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--border)",
            paddingBottom: 8
          }}>
                  <span className={u.muted12}>{row.label}</span>
                  <span style={{
              fontSize: 13,
              fontWeight: 600
            }}>{row.value}</span>
                </div>)}
            </div> : <div style={{
          color: "var(--text-secondary)",
          fontSize: 13
        }}>{t("ui.暂无盘点记录", "暂无盘点记录")}</div>}
        </div>

        {/* 库存平衡核查 */}
        <div className={s.card} style={{
        padding: "20px 24px"
      }}>
          <div style={{
          fontSize: 13,
          fontWeight: 700,
          marginBottom: 14
        }}>⚖️ {t("ui.库存平衡核查", "库存平衡核查")}</div>
          {loading ? <div style={{
          color: "var(--text-secondary)",
          fontSize: 13
        }}>{t("common.loading", "加载中…")}</div> : <>
              <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginBottom: 16
          }}>
                {[{
              label: t("ui.今日入库", "今日入库"),
              value: `+${inQty.toLocaleString()}`,
              cls: s.textSuccess
            }, {
              label: t("ui.今日出库", "今日出库"),
              value: `-${outQty.toLocaleString()}`,
              cls: s.textDanger
            }, {
              label: t("ui.净变化", "净变化"),
              value: (balance >= 0 ? "+" : "") + balance.toLocaleString(),
              cls: balance >= 0 ? s.textInfo : s.textWarning
            }, {
              label: t("ui.当前库存", "当前库存"),
              value: `${curQty.toLocaleString()} ${t("ui.枚", "枚")}`,
              cls: ""
            }].map(row => <div key={row.label} style={{
              display: "flex",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--border)",
              paddingBottom: 8
            }}>
                    <span className={u.muted12}>{row.label}</span>
                    <span className={row.cls} style={{
                fontSize: 14,
                fontWeight: 700
              }}>{row.value}</span>
                  </div>)}
              </div>
              {/* 平衡结枚 — alertLow(绿) / alertMedium(黄) */}
              <div className={`${s.alertCard} ${balance >= 0 ? s.alertLow : s.alertMedium}`} style={{
            fontSize: 12,
            fontWeight: 600
          }}>
                {balance >= 0 ? `✓ ${t("ui.今日入大于等于出库存净增", "今日入大于等于出，库存净增")} ${balance.toLocaleString()} ${t("ui.枚", "枚")}` : `⚠️ ${t("ui.今日出大于入库存净减", "今日出大于入，库存净减")} ${Math.abs(balance).toLocaleString()} ${t("ui.枚", "枚")}`}
              </div>
            </>}
        </div>
      </div>

      {/* 执行日结 */}
      <div className={s.card} style={{
      padding: "24px"
    }}>
        <div style={{
        fontSize: 14,
        fontWeight: 700,
        marginBottom: 8
      }}>🔒 {t("ui.执行日结", "执行日结")}</div>
        <div style={{
        fontSize: 13,
        color: "var(--text-secondary)",
        marginBottom: 16
      }}>
          {t("ui.日结将锁定当日入出库记录生成日结单确认库存期末快照每日只可执行一次", "日结将锁定当日入出库记录，生成日结单，确认库存期末快照。每日只可执行一次。")}
        </div>
        {isClosed ? <div className={`${s.alertCard} ${s.alertLow}`} style={{
        fontWeight: 700,
        fontSize: 14,
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
            <CheckSquare size={16} />
            {t("ui.日结已完成单号", "日结已完成 · 单号")} {(data?.closed_today as any)?.stocktake_no ?? (data?.closed_today as any)?.close_no ?? "—"}
          </div> : <button type="button" onClick={handleClose} disabled={closing || loading} className={s.btnPrimary} style={{
        padding: "12px 32px",
        fontSize: 14,
        opacity: closing || loading ? 0.7 : 1,
        cursor: closing || loading ? "not-allowed" : "pointer"
      }}>
            <CheckSquare size={15} />
            {closing ? t("ui.日结中", "日结中…") : `${t("ui.确认日结", "确认日结")} ${date}`}
          </button>}
      </div>
    </div>;
}