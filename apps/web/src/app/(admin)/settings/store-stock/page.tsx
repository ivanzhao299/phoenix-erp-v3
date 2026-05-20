"use client";
import { useState, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/contexts/ToastContext";
import { useDialog } from "@/contexts/DialogContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { ToggleRight, ToggleLeft, Store, ShieldCheck } from "lucide-react";

const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : ""}` });

type StoreRow = { id: string; name: string; type: "DIRECT" | "FRANCHISE"; split_stock_enabled: boolean; last_updated: string; operator: string };

export default function StoreStockConfigPage() {
  const toast = useToast();
  const { showConfirm } = useDialog();
  const { t } = useLanguage();
  const [data, setData] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/crud/mst_stores?limit=100", { headers: hdr() })
      .then(r => r.json())
      .then(d => {
        const list = (d.data || d || []).map((s: Record<string, unknown>) => ({
          id: s.store_code, name: s.store_name_zh || s.store_code,
          type: s.store_type === "FRANCHISE" ? "FRANCHISE" : "DIRECT",
          split_stock_enabled: !!s.split_stock_enabled,
          last_updated: s.updated_at || s.created_at || "—",
          operator: s.updated_by || "sys_auto",
        }));
        setData(list);
        setLoading(false);
      }).catch(() => setLoading(false));
  }, []);

  const toggle = async (id: string) => {
    const row = data.find(s => s.id === id);
    if (!row) return;
    if (row.type === "FRANCHISE") { toast.error(t('ui.加盟店暂不支持开启分账库存隔离管控', '加盟店暂不支持开启分账库存隔离管控')); return; }
    const action = row.split_stock_enabled ? t('ui.关闭', '关闭') : t('ui.开启', '开启');
    const ok = await showConfirm({ icon: "⚠️", type: row.split_stock_enabled ? "danger" : "warning", title: `${t('common.confirm', '确认')}${action}${t('ui.分账库存', '分账库存')}`, message: `${t('ui.确定要操作分账库存管控吗', '确定要')}${action}【${row.name}】${t('ui.的分账库存管控吗', '的分账库存管控吗？')}\n${t('ui.开启后该门店零售端和渠道批发端将分别使用独立库存池', '开启后，该门店零售端和渠道批发端将分别使用独立库存池。')}`, confirmLabel: `${t('common.confirm', '确认')}${action}` });
    if (!ok) return;
    try {
      await fetch(`/api/crud/mst_stores/store_code/${id}`, { method: "PUT", headers: hdr(), body: JSON.stringify({ split_stock_enabled: !row.split_stock_enabled }) });
      setData(prev => prev.map(s => s.id === id ? { ...s, split_stock_enabled: !s.split_stock_enabled, operator: "admin", last_updated: new Date().toISOString() } : s));
      toast.success(`${t('ui.已操作分账库存管控', '已')}${action}${t('ui.分账库存管控', '分账库存管控')}`);
    } catch { toast.error(t('ui.操作失败', '操作失败')); }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('ui.直营店分账库存配置', '直营店分账库存配置')} subtitle={t('ui.强制隔离直营店的门店零售库存与批发渠道库存防止套利冲货', '强制隔离直营店的「门店零售库存」与「批发渠道库存」，防止套利冲货')} breadcrumb={[t('ui.系统设置', '系统设置'), t('ui.分账库存配置', '分账库存配置')]}/>

      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderLeft: "4px solid #3b82f6", borderRadius: "var(--radius-lg)", padding: 16, display: "flex", gap: 12, marginBottom: 24 }}>
        <ShieldCheck color="#2563eb" size={24} style={{ flexShrink: 0, marginTop: 2 }}/>
        <div>
          <h4 style={{ margin: "0 0 4px", color: "#1e40af", fontSize: 15 }}>{t('ui.分账库存规则说明', '分账库存规则说明')}</h4>
          <p style={{ margin: 0, color: "#1e40af", fontSize: 13, lineHeight: 1.7 }}>
            {t('ui.系统默认所有门店共用统一物理库存', '系统默认所有门店共用统一物理库存。对具有批发职能的')}<strong>{t('ui.直营店', '直营店')}</strong>{t('ui.开启后系统将自动拆分逻辑库存', '开启后，系统将自动拆分逻辑库存：')}<br/>
            1. <strong>{t('ui.零售端POS', '零售端 (POS)')}</strong>：{t('ui.只能消耗RetailStock按零售价结算', '只能消耗 Retail_Stock，按零售价结算；')}<br/>
            2. <strong>{t('ui.渠道端B2B', '渠道端 (B2B)')}</strong>：{t('ui.只能消耗WholesaleStock按渠道价结算', '只能消耗 Wholesale_Stock，按渠道价结算。')}
          </p>
        </div>
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {[t('ui.门店编码', '门店编码'), t('ui.门店名称', '门店名称'), t('ui.属性', '属性'), t('ui.分账库存状态', '分账库存状态'), t('ui.最后操作人', '最后操作人'), t('ui.更新时间', '更新时间')].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>{t('common.loading', '加载中…')}</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>{t('common.no_data', '暂无门店数据')}</td></tr>
            ) : data.map(row => (
              <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "12px 16px", fontWeight: 700, fontFamily: "monospace" }}>{row.id}</td>
                <td style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 6 }}>
                  <Store size={14} color="var(--text-secondary)"/>{row.name}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontSize: 12, background: row.type === "DIRECT" ? "#dcfce7" : "#f3f4f6", color: row.type === "DIRECT" ? "#15803d" : "#4b5563", padding: "3px 8px", borderRadius: 4, fontWeight: 600 }}>
                    {row.type === "DIRECT" ? t('ui.直营店', '直营店') : t('ui.加盟店', '加盟店')}
                  </span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button type="button" onClick={() => toggle(row.id)} style={{ background: "none", border: "none", cursor: row.type === "DIRECT" ? "pointer" : "not-allowed", padding: 0, opacity: row.type === "DIRECT" ? 1 : 0.4 }}>
                      {row.split_stock_enabled
                        ? <ToggleRight size={26} color="#22c55e"/>
                        : <ToggleLeft size={26} color="#9ca3af"/>}
                    </button>
                    <span style={{ fontSize: 13, color: row.split_stock_enabled ? "#22c55e" : "var(--text-secondary)", fontWeight: row.split_stock_enabled ? 700 : 400 }}>
                      {row.split_stock_enabled ? t('ui.已开启双库存池', '已开启（双库存池）') : t('ui.未开启单库存池', '未开启（单库存池）')}
                    </span>
                  </div>
                </td>
                <td style={{ padding: "12px 16px", color: "var(--text-secondary)" }}>{row.operator}</td>
                <td style={{ padding: "12px 16px", color: "var(--text-secondary)", fontSize: 12 }}>
                  {row.last_updated !== "—" ? new Date(row.last_updated).toLocaleString("zh-CN") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
