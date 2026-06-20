"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  AlertTriangle, Clock, RefreshCw, AlertOctagon, CalendarClock, Info, PartyPopper,
} from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";
// g200e 模板 token(2026-06-20)
import {
  primaryActionButton, secondaryActionButton,
  kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
  inlineAlert, MONO_FONT, actionPill,
} from "@/components/design-system/cockpit-styles";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "brand";

// ✅ V3 临期预警页面 (对应 V2: ExpiryAlert.jsx)
// 数据来源: inv_batches (expire_date + qty_available)
// 业务逻辑: FEFO 先到期先出，14天内临期批次预警分级处理
import u from "@/styles/uix-utils.module.css";
interface AlertItem {
  id: number;
  batchNo: string;
  skuCode: string;
  warehouse: string;
  qty: number;
  expDate: string;
  daysLeft: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

// g200e:严重级别 tone + lucide 图标(替代 emoji)
const SEV_CONFIG: Record<"critical" | "high" | "medium" | "low", { tone: Tone; Icon: typeof AlertOctagon }> = {
  critical: { tone: "danger",  Icon: AlertOctagon   },
  high:     { tone: "warning", Icon: AlertTriangle  },
  medium:   { tone: "warning", Icon: CalendarClock  },
  low:      { tone: "success", Icon: Info           },
};
export default function ExpiryAlertPage() {
  const {
    t
  } = useLanguage();
  const SEV_LABEL = {
    critical: t("ui.3天内", "≤3天"),
    high: t("ui.5天内", "≤5天"),
    medium: t("ui.7天内", "≤7天"),
    low: t("ui.14天内", "≤14天")
  };
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<{
    open: boolean;
    type: 'outbound' | 'discount';
    item: AlertItem | null;
  }>({
    open: false,
    type: 'outbound',
    item: null
  });
  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await crudApi.list("inv_batches", {
        limit: 500
      } as any);
      const batches: Record<string, unknown>[] = (res as {
        data?: Record<string, unknown>[];
      }).data ?? [];
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      const list: AlertItem[] = batches.filter(b => b.expire_date && String(b.expire_date) <= in14 && String(b.expire_date) >= todayStr && Number(b.qty_available ?? b.qty ?? 0) > 0).map(b => {
        const daysLeft = Math.ceil((new Date(String(b.expire_date)).getTime() - today.getTime()) / 86400000);
        const severity: AlertItem['severity'] = daysLeft <= 3 ? 'critical' : daysLeft <= 5 ? 'high' : daysLeft <= 7 ? 'medium' : 'low';
        return {
          id: Number(b.id),
          batchNo: String(b.batch_no || `#${b.id}`),
          skuCode: String(b.sku_code || b.product_code || '—'),
          warehouse: String(b.warehouse_code || b.location_code || '—'),
          qty: Number(b.qty_available ?? b.qty ?? 0),
          expDate: String(b.expire_date).slice(0, 10),
          daysLeft,
          severity
        };
      }).sort((a, b) => a.daysLeft - b.daysLeft);
      setAlerts(list);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);
  const handleConfirm = useCallback(async () => {
    if (!confirm.item) return;
    if (confirm.type === 'discount') {
      // 降价促销：功能未实现，关闭弹窗
      setConfirm({
        open: false,
        type: 'outbound',
        item: null
      });
      return;
    }
    if (confirm.type === 'outbound') {
      await crudApi.create("wms_outbound", {
        outbound_no: `FEFO-${Date.now().toString().slice(-6)}`,
        batch_no: confirm.item.batchNo,
        item: confirm.item.skuCode,
        qty: confirm.item.qty,
        dest: t("ui.临期出库", "临期出库"),
        status: 'PENDING',
        date: new Date().toISOString().slice(0, 10),
        remark: `${t("ui.临期预警自动拦截剩余", "临期预警自动拦截 - 剩余")}${confirm.item.daysLeft}${t("ui.天", "天")}`
      }).catch(() => {});
    }
    setAlerts(prev => prev.filter(a => a.id !== confirm.item!.id));
    setConfirm({
      open: false,
      type: 'outbound',
      item: null
    });
  }, [confirm]);

  // g200e:KPI 4 卡 tone → kpiCardCompact(tone)
  const KPI_COUNTS = useMemo<{ label: string; val: number; tone: Tone }[]>(() => [
    { label: t("ui.3天到期",  "3天到期"),  val: alerts.filter(a => a.severity === "critical").length,                          tone: "danger"  },
    { label: t("ui.5天到期",  "5天到期"),  val: alerts.filter(a => ["critical","high"].includes(a.severity)).length,            tone: "warning" },
    { label: t("ui.7天到期",  "7天到期"),  val: alerts.filter(a => ["critical","high","medium"].includes(a.severity)).length, tone: "warning" },
    { label: t("ui.14天到期", "14天到期"), val: alerts.length,                                                                  tone: "info"    },
  ], [alerts, t]);
  return <div className="animate-fade-in">
      <PageHeader
        title={t("ui.临期预警", "临期预警")}
        subtitle={t("ui.保质期即将到期批次预警管理FEFO先到期先出策略", "保质期即将到期批次预警管理（FEFO 先到期先出策略）")}
        breadcrumb={[t("ui.仓储管理", "仓储管理"), t("ui.临期预警", "临期预警")]}
        actions={
          <button type="button" style={{ ...secondaryActionButton, opacity: loading ? 0.5 : 1 }} onClick={loadAlerts} disabled={loading}>
            <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            {t("common.refresh", "刷新")}
          </button>
        }
      />

      {/* g200e:KPI 4 卡 — kpiCardCompact(tone) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
        gap: 12,
        marginBottom: 20,
      }}>
        {KPI_COUNTS.map(c => (
          <div key={c.label} style={kpiCardCompact(c.tone)}>
            <div style={kpiCardCompactLabel}>{c.label}</div>
            <div style={{ ...kpiCardCompactValue(c.tone), display: "flex", alignItems: "baseline", gap: 4 }}>
              {loading ? "…" : c.val}
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 400 }}>{t("ui.批次", "批次")}</span>
            </div>
          </div>
        ))}
      </div>

      {/* g200e 告警列表 — 业务列表卡(白底 + 左 tone 色条),非 KPI 卡风格,避免与顶部重复 */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>
          {t("ui.加载临期数据中", "加载临期数据中…")}
        </div>
      ) : alerts.length === 0 ? (
        <div style={{ ...inlineAlert("success"), justifyContent: "center", padding: "16px 20px", fontSize: 14 }}>
          <PartyPopper size={16} /> {t("ui.太棒了当前没有任何库存处于临期预警状态", "太棒了！当前没有任何库存处于临期预警状态")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {alerts.map(a => {
            const cfg = SEV_CONFIG[a.severity];
            const sevLabel = SEV_LABEL[a.severity];
            const SevIcon = cfg.Icon;
            const sevColor =
              cfg.tone === "danger"  ? "var(--status-danger)"  :
              cfg.tone === "warning" ? "var(--status-warning)" :
              cfg.tone === "success" ? "var(--status-success)" : "var(--status-info)";
            return (
              <div key={a.id} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 16px",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderLeft: `4px solid ${sevColor}`,
                borderRadius: 10,
              }}>
                <SevIcon size={28} color={sevColor} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>{a.batchNo}</span>
                    <span style={actionPill(cfg.tone)}>{sevLabel}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{a.skuCode}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                    <Clock size={11} /> {a.warehouse} · {t("ui.库存", "库存")} {a.qty} {t("ui.枚", "枚")} · {t("ui.到期", "到期")} {a.expDate}
                  </div>
                </div>
                <div style={{ textAlign: "center", flexShrink: 0, minWidth: 64 }}>
                  <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 1, color: sevColor, fontFamily: MONO_FONT }}>{a.daysLeft}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t("ui.天后到期", "天后到期")}</div>
                </div>
                <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  <button type="button" style={{ ...primaryActionButton, fontSize: 12, padding: "6px 14px" }}
                    onClick={() => setConfirm({ open: true, type: "outbound", item: a })}>
                    <AlertTriangle size={12} />{t("ui.安排出库", "安排出库")}
                  </button>
                  <button type="button" style={{ ...secondaryActionButton, fontSize: 12, padding: "6px 14px", opacity: 0.5, cursor: "not-allowed" }}
                    disabled title={t("ui.降价促销功能待接入促销系统", "降价促销功能待接入促销系统")}>
                    {t("ui.降价促销", "降价促销")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* g200e FEFO 提示 → inlineAlert('success') */}
      <div style={{ ...inlineAlert("success"), marginTop: 20, fontSize: 13, lineHeight: 1.6 }}>
        <Info size={14} />
        <span>
          <strong>{t("ui.FEFO出库策略", "FEFO 出库策略")}</strong>：
          {t("ui.系统遵循先进先出先到期先出原则拣货时自动优先分配临期批次最大化库存周转效率", "系统遵循先进先出、先到期先出原则，拣货时自动优先分配临期批次，最大化库存周转效率。")}
        </span>
      </div>

      <ConfirmDialog open={confirm.open} title={confirm.type === 'outbound' ? t("ui.确认安排出库", "确认安排出库") : t("ui.确认发布降价促销", "确认发布降价促销")} message={confirm.type === 'outbound' ? `${t("ui.系统将对批次生成FEFO加急出库单", "系统将对批次")} [${confirm.item?.batchNo}] ${t("ui.生成FEFO加急出库单剩余", "生成 FEFO 加急出库单（剩余")}${confirm.item?.daysLeft}${t("ui.天是否确认", "天），是否确认？")}` : `${t("ui.确认对批次发布全网门店7折临期促销指令吗", "确认对批次")} [${confirm.item?.batchNo}] ${t("ui.发布全网门店7折临期促销指令吗", "发布全网门店 7 折临期促销指令吗？")}`} onConfirm={handleConfirm} onCancel={() => setConfirm({
      open: false,
      type: 'outbound',
      item: null
    })} />
    </div>;
}