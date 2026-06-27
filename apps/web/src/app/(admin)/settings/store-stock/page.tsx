"use client";

import { useState, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/contexts/ToastContext";
import { useDialog } from "@/contexts/DialogContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { ToggleRight, ToggleLeft, Store, ShieldCheck } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
import { primaryActionButton, secondaryActionButton, actionPill, toolbarFilterPill } from "@/components/design-system/cockpit-styles";
import u from "@/styles/uix-utils.module.css";
const hdr = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : ""}`
});
type StoreRow = {
  id: string;
  name: string;
  type: "DIRECT" | "FRANCHISE";
  split_stock_enabled: boolean;
  last_updated: string;
  operator: string;
};
export default function StoreStockConfigPage() {
  const toast = useToast();
  const {
    showConfirm
  } = useDialog();
  const {
    t
  } = useLanguage();
  const [data, setData] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/crud/mst_stores?limit=100", {
      headers: hdr()
    }).then(r => r.json()).then(d => {
      const list = (d.data || d || []).map((s: Record<string, unknown>) => ({
        id: s.store_code,
        name: s.store_name_zh || s.store_code,
        type: s.store_type === "FRANCHISE" ? "FRANCHISE" : "DIRECT",
        split_stock_enabled: !!s.split_stock_enabled,
        last_updated: s.updated_at || s.created_at || "—",
        operator: s.updated_by || "sys_auto"
      }));
      setData(list);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);
  const toggle = async (id: string) => {
    const row = data.find(s => s.id === id);
    if (!row) return;
    if (row.type === "FRANCHISE") {
      toast.error(t('ui.加盟店暂不支持开启分账库存隔离管控', '加盟店暂不支持开启分账库存隔离管控'));
      return;
    }
    const action = row.split_stock_enabled ? t('ui.关闭', '关闭') : t('ui.开启', '开启');
    const ok = await showConfirm({
      icon: "⚠️",
      type: row.split_stock_enabled ? "danger" : "warning",
      title: `${t('common.confirm', '确认')}${action}${t('ui.分账库存', '分账库存')}`,
      message: `${t('ui.确定要操作分账库存管控吗', '确定要')}${action}【${row.name}】${t('ui.的分账库存管控吗', '的分账库存管控吗？')}\n${t('ui.开启后该门店零售端和渠道批发端将分别使用独立库存池', '开启后，该门店零售端和渠道批发端将分别使用独立库存池。')}`,
      confirmLabel: `${t('common.confirm', '确认')}${action}`
    });
    if (!ok) return;
    try {
      await fetch(`/api/crud/mst_stores/store_code/${id}`, {
        method: "PUT",
        headers: hdr(),
        body: JSON.stringify({
          split_stock_enabled: !row.split_stock_enabled
        })
      });
      setData(prev => prev.map(s => s.id === id ? {
        ...s,
        split_stock_enabled: !s.split_stock_enabled,
        operator: "admin",
        last_updated: new Date().toISOString()
      } : s));
      toast.success(`${t('ui.已操作分账库存管控', '已')}${action}${t('ui.分账库存管控', '分账库存管控')}`);
    } catch {
      toast.error(t('ui.操作失败', '操作失败'));
    }
  };
  return <div className="animate-fade-in">
      <PageHeader title={t('ui.直营店分账库存配置', '直营店分账库存配置')} subtitle={t('ui.强制隔离直营店的门店零售库存与批发渠道库存防止套利冲货', '强制隔离直营店的「门店零售库存」与「批发渠道库存」，防止套利冲货')} breadcrumb={[t('ui.系统设置', '系统设置'), t('ui.分账库存配置', '分账库存配置')]} />

      <div style={{
      background: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
      border: "1px solid color-mix(in srgb, var(--color-accent) 16%, transparent)",
      borderLeft: "var(--card-accent-width) solid var(--color-accent)",
      borderRadius: "var(--radius-lg)",
      padding: 16,
      display: "flex",
      gap: 12,
      marginBottom: 24
    }}>
        <ShieldCheck color="var(--color-accent)" size={24} style={{
        flexShrink: 0,
        marginTop: 2
      }} />
        <div>
          <h4 style={{
          margin: "0 0 4px",
          color: "var(--color-accent)",
          fontSize: 15
        }}>{t('ui.分账库存规则说明', '分账库存规则说明')}</h4>
          <p style={{
          margin: 0,
          color: "var(--color-accent)",
          fontSize: 13,
          lineHeight: 1.7
        }}>
            {t('ui.系统默认所有门店共用统一物理库存', '系统默认所有门店共用统一物理库存。对具有批发职能的')}<strong>{t('ui.直营店', '直营店')}</strong>{t('ui.开启后系统将自动拆分逻辑库存', '开启后，系统将自动拆分逻辑库存：')}<br />
            1. <strong>{t('ui.零售端POS', '零售端 (POS)')}</strong>：{t('ui.只能消耗RetailStock按零售价结算', '只能消耗 Retail_Stock，按零售价结算；')}<br />
            2. <strong>{t('ui.渠道端B2B', '渠道端 (B2B)')}</strong>：{t('ui.只能消耗WholesaleStock按渠道价结算', '只能消耗 Wholesale_Stock，按渠道价结算。')}
          </p>
        </div>
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
              {[t('ui.门店编码', '门店编码'), t('ui.门店名称', '门店名称'), t('ui.属性', '属性'), t('ui.分账库存状态', '分账库存状态'), t('ui.最后操作人', '最后操作人'), t('ui.更新时间', '更新时间')].map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className={u.emptyPad40}>{t('common.loading', '加载中…')}</td></tr> : data.length === 0 ? <tr><td colSpan={6} className={u.emptyPad40}>{t('common.no_data', '暂无门店数据')}</td></tr> : data.map(row => <tr key={row.id}>
                <td style={{
              fontFamily: "monospace"
            }}>{row.id}</td>
                <td className={u.flexRow}>
                  <Store size={14} color="var(--text-secondary)" />{row.name}
                </td>
                <td>
                  <span style={{
                fontSize: 12,
                background: row.type === "DIRECT" ? "color-mix(in srgb, var(--status-success) 14%, transparent)" : "var(--bg-muted)",
                color: row.type === "DIRECT" ? "var(--status-success)" : "var(--text-secondary)",
                padding: "3px 8px",
                borderRadius: 4,
                fontWeight: 600
              }}>
                    {row.type === "DIRECT" ? t('ui.直营店', '直营店') : t('ui.加盟店', '加盟店')}
                  </span>
                </td>
                <td>
                  <div className={u.flexRow8}>
                    <button type="button" onClick={() => toggle(row.id)} style={{
                  background: "none",
                  border: "none",
                  cursor: row.type === "DIRECT" ? "pointer" : "not-allowed",
                  padding: 0,
                  opacity: row.type === "DIRECT" ? 1 : 0.4
                }}>
                      {row.split_stock_enabled ? <ToggleRight size={26} color="var(--status-success)" /> : <ToggleLeft size={26} color="var(--text-disabled)" />}
                    </button>
                    <span style={{
                  fontSize: 13,
                  color: row.split_stock_enabled ? "var(--status-success)" : "var(--text-secondary)",
                  fontWeight: row.split_stock_enabled ? 700 : 400
                }}>
                      {row.split_stock_enabled ? t('ui.已开启双库存池', '已开启（双库存池）') : t('ui.未开启单库存池', '未开启（单库存池）')}
                    </span>
                  </div>
                </td>
                <td className={u.muted}>{row.operator}</td>
                <td className={u.muted12}>
                  {row.last_updated !== "—" ? new Date(row.last_updated).toLocaleString("zh-CN") : "—"}
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </div>;
}