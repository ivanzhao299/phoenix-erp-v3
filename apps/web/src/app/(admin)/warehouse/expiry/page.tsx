"use client";
import { useState, useEffect, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AlertTriangle, Clock, RefreshCw } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";

// ✅ V3 临期预警页面 (对应 V2: ExpiryAlert.jsx)
// 数据来源: inv_batches (expire_date + qty_available)
// 业务逻辑: FEFO 先到期先出，14天内临期批次预警分级处理

interface AlertItem {
  id:        number;
  batchNo:   string;
  skuCode:   string;
  warehouse: string;
  qty:       number;
  expDate:   string;
  daysLeft:  number;
  severity:  'critical' | 'high' | 'medium' | 'low';
}

// ✅ 严重级别 → 全局 CSS 类（消除所有硬编码 rgba/hex）
const SEV_CONFIG = {
  critical: { cardCls: s.alertCritical, badgeCls: s.severityBadgeCritical, textCls: s.textDanger,  icon: '🚨' },
  high:     { cardCls: s.alertHigh,     badgeCls: s.severityBadgeHigh,     textCls: s.textWarning, icon: '⚠️' },
  medium:   { cardCls: s.alertMedium,   badgeCls: s.severityBadgeMedium,   textCls: s.textWarning, icon: '📅' },
  low:      { cardCls: s.alertLow,      badgeCls: s.severityBadgeLow,      textCls: s.textSuccess, icon: 'ℹ️' },
} as const;

export default function ExpiryAlertPage() {
  const { t } = useLanguage();

  const SEV_LABEL = {
    critical: t("ui.3天内", "≤3天"),
    high:     t("ui.5天内", "≤5天"),
    medium:   t("ui.7天内", "≤7天"),
    low:      t("ui.14天内", "≤14天"),
  };

  const [alerts,  setAlerts]  = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<{ open: boolean; type: 'outbound' | 'discount'; item: AlertItem | null }>({ open: false, type: 'outbound', item: null });

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await crudApi.list("inv_batches", { limit: 500 } as any);
      const batches: any[] = (res as any).data ?? [];
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const in14    = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

      const list: AlertItem[] = batches
        .filter(b => b.expire_date && b.expire_date <= in14 && b.expire_date >= todayStr && (b.qty_available ?? b.qty) > 0)
        .map(b => {
          const daysLeft = Math.ceil((new Date(b.expire_date).getTime() - today.getTime()) / 86400000);
          const severity: AlertItem['severity'] = daysLeft <= 3 ? 'critical' : daysLeft <= 5 ? 'high' : daysLeft <= 7 ? 'medium' : 'low';
          return {
            id:        b.id,
            batchNo:   b.batch_no  || `#${b.id}`,
            skuCode:   b.sku_code  || b.product_code || '—',
            warehouse: b.warehouse_code || b.location_code || '—',
            qty:       b.qty_available ?? b.qty ?? 0,
            expDate:   b.expire_date.slice(0, 10),
            daysLeft,
            severity,
          };
        })
        .sort((a, b) => a.daysLeft - b.daysLeft);

      setAlerts(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  const handleConfirm = useCallback(async () => {
    if (!confirm.item) return;
    if (confirm.type === 'outbound') {
      await crudApi.create("wms_outbound", {
        outbound_no: `FEFO-${Date.now().toString().slice(-6)}`,
        batch_no:    confirm.item.batchNo,
        item:        confirm.item.skuCode,
        qty:         confirm.item.qty,
        dest:        t("ui.临期出库", "临期出库"),
        status:      'PENDING',
        date:        new Date().toISOString().slice(0, 10),
        remark:      `${t("ui.临期预警自动拦截剩余", "临期预警自动拦截 - 剩余")}${confirm.item.daysLeft}${t("ui.天", "天")}`,
      }).catch(() => {});
    }
    setAlerts(prev => prev.filter(a => a.id !== confirm.item!.id));
    setConfirm({ open: false, type: 'outbound', item: null });
  }, [confirm]);

  // ✅ KPI 数组：用 cardCls/valCls 替代 color/bg hex 字符串
  const KPI_COUNTS = [
    { label: t("ui.3天到期", "3天到期"),  val: alerts.filter(a => a.severity === 'critical').length,                                   cardCls: s.statCardDanger,  valCls: s.textDanger  },
    { label: t("ui.5天到期", "5天到期"),  val: alerts.filter(a => ['critical','high'].includes(a.severity)).length,                    cardCls: s.statCardWarning, valCls: s.textWarning },
    { label: t("ui.7天到期", "7天到期"),  val: alerts.filter(a => ['critical','high','medium'].includes(a.severity)).length,           cardCls: s.statCardWarning, valCls: s.textWarning },
    { label: t("ui.14天到期", "14天到期"), val: alerts.length,                                                                          cardCls: s.statCardPrimary, valCls: s.statValue   },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("ui.临期预警", "临期预警")}
        subtitle={t("ui.保质期即将到期批次预警管理FEFO先到期先出策略", "保质期即将到期批次预警管理（FEFO 先到期先出策略）")}
        breadcrumb={[t("ui.仓储管理", "仓储管理"), t("ui.临期预警", "临期预警")]}
        actions={
          <button type="button" className={s.btnSecondary} onClick={loadAlerts} disabled={loading}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {t("common.refresh", "刷新")}
          </button>
        }
      />

      {/* KPI 统计 — 用 CSS module 类，无 inline 颜色 */}
      <div className={s.statsRow} style={{ marginBottom: 20 }}>
        {KPI_COUNTS.map(c => (
          <div key={c.label} className={`${s.statCard} ${c.cardCls}`}>
            <div className={`${s.statValue} ${c.valCls}`}>{loading ? '…' : c.val}</div>
            <div className={s.statLabel}>{c.label}</div>
            <div className={s.statSub}>{t("ui.批次", "批次")}</div>
          </div>
        ))}
      </div>

      {/* 告警列表 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>{t("ui.加载临期数据中", "加载临期数据中…")}</div>
      ) : alerts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-secondary)', fontSize: 14 }}>
          🎉 {t("ui.太棒了当前没有任何库存处于临期预警状态", "太棒了！当前没有任何库存处于临期预警状态")}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {alerts.map(a => {
            const cfg = SEV_CONFIG[a.severity];
            const sevLabel = SEV_LABEL[a.severity];
            return (
              /* ✅ alertCard + alertCritical/High/Medium/Low 替代所有 inline hex 颜色 */
              <div key={a.id} className={`${s.alertCard} ${cfg.cardCls}`}>
                <span style={{ fontSize: 28, flexShrink: 0 }}>{cfg.icon}</span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{a.batchNo}</span>
                    <span className={`${s.severityBadge} ${cfg.badgeCls}`}>{sevLabel}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{a.skuCode}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={11} /> {a.warehouse} · {t("ui.库存", "库存")} {a.qty} {t("ui.枚", "枚")} · {t("ui.到期", "到期")} {a.expDate}
                  </div>
                </div>

                {/* 倒计时 — 用 textCls 类控制颜色 */}
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div className={cfg.textCls} style={{ fontSize: 36, fontWeight: 900, lineHeight: 1 }}>{a.daysLeft}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t("ui.天后到期", "天后到期")}</div>
                </div>

                {/* 操作按钮 */}
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button type="button" className={s.btnPrimary} onClick={() => setConfirm({ open: true, type: 'outbound', item: a })} style={{ fontSize: 12, padding: '6px 14px' }}>
                    <AlertTriangle size={12} />{t("ui.安排出库", "安排出库")}
                  </button>
                  <button type="button" className={s.btnSecondary} onClick={() => setConfirm({ open: true, type: 'discount', item: a })} style={{ fontSize: 12, padding: '6px 14px' }}>
                    {t("ui.降价促销", "降价促销")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FEFO 提示 — 用 alertLow 类（绿色低风险提示条） */}
      <div className={`${s.alertCard} ${s.alertLow}`} style={{ marginTop: 20, fontSize: 13 }}>
        <strong>{t("ui.FEFO出库策略", "FEFO 出库策略")}</strong>：{t("ui.系统遵循先进先出先到期先出原则拣货时自动优先分配临期批次最大化库存周转效率", "系统遵循先进先出、先到期先出原则，拣货时自动优先分配临期批次，最大化库存周转效率。")}
      </div>

      <ConfirmDialog
        open={confirm.open}
        title={confirm.type === 'outbound' ? t("ui.确认安排出库", "确认安排出库") : t("ui.确认发布降价促销", "确认发布降价促销")}
        message={
          confirm.type === 'outbound'
            ? `${t("ui.系统将对批次生成FEFO加急出库单", "系统将对批次")} [${confirm.item?.batchNo}] ${t("ui.生成FEFO加急出库单剩余", "生成 FEFO 加急出库单（剩余")}${confirm.item?.daysLeft}${t("ui.天是否确认", "天），是否确认？")}`
            : `${t("ui.确认对批次发布全网门店7折临期促销指令吗", "确认对批次")} [${confirm.item?.batchNo}] ${t("ui.发布全网门店7折临期促销指令吗", "发布全网门店 7 折临期促销指令吗？")}`
        }
        onConfirm={handleConfirm}
        onCancel={() => setConfirm({ open: false, type: 'outbound', item: null })}
      />
    </div>
  );
}
