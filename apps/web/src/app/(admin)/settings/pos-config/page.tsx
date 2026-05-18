"use client";
import { useState, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Smartphone, Store, Save, CheckCircle } from "lucide-react";

const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : ""}` });
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", fontSize: 13, background: "var(--bg-page)", color: "var(--text-primary)", boxSizing: "border-box" };

const DEFAULT_CFG = { printMode: "THERMAL", taxRate: "7", receiptFooter: "感谢您的惠顾，凤凰鲜蛋祝您生活美满！", autoClose: true, dailyCloseTime: "23:00", currency: "LAK" };

export default function PosConfigPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const [stores, setStores] = useState<any[]>([]);
  const [configs, setConfigs] = useState<Record<string, typeof DEFAULT_CFG>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/crud/mst_stores?limit=100", { headers: hdr() })
      .then(r => r.json())
      .then(d => {
        const list: any[] = d.data || d || [];
        setStores(list);
        const init: Record<string, typeof DEFAULT_CFG> = {};
        list.forEach(s => {
          let cfg = DEFAULT_CFG;
          try { if (s.pos_config) cfg = { ...DEFAULT_CFG, ...JSON.parse(s.pos_config) }; } catch {}
          init[s.store_code] = cfg;
        });
        setConfigs(init);
      }).catch(() => {});
  }, []);

  const handleSave = async (code: string) => {
    try {
      await fetch(`/api/crud/mst_stores/store_code/${code}`, { method: "PUT", headers: hdr(), body: JSON.stringify({ pos_config: JSON.stringify(configs[code]) }) });
      setSaved(s => ({ ...s, [code]: true }));
      setTimeout(() => setSaved(s => ({ ...s, [code]: false })), 3000);
      toast.success(t('ui.POS配置已保存', 'POS 配置已保存'));
    } catch { toast.error(t('ui.保存失败请重试', '保存失败，请重试')); }
  };

  const upd = (code: string, key: string, value: any) => setConfigs(c => ({ ...c, [code]: { ...c[code], [key]: value } }));

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('ui.POS终端管理', 'POS 终端管理')} subtitle={t('ui.按门店配置收银机打印税率货币与日结参数', '按门店配置收银机打印、税率、货币与日结参数')} breadcrumb={[t('ui.系统设置', '系统设置'), t('ui.POS终端管理', 'POS终端管理')]}/>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 20, marginBottom: 20, display: "flex", gap: 16, alignItems: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: "var(--radius-md)", background: "linear-gradient(135deg,var(--color-primary),#1e3a8a)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Smartphone size={24} color="#fff"/>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{t('ui.当前连接终端数', '当前连接终端数')}：{stores.length} {t('ui.台', '台')}</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t('ui.以下配置变更将在终端下次同步时生效', '以下配置变更将在终端下次同步时生效。日结时间修改需提前通知门店收银员。')}</div>
        </div>
      </div>

      {stores.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>
          <Smartphone size={40} style={{ opacity: 0.2, display: "block", margin: "0 auto 12px" }}/>
          {t('ui.暂无门店终端请先在组织架构中配置门店', '暂无门店终端，请先在组织架构中配置门店')}
        </div>
      ) : stores.map(store => {
        const cfg = configs[store.store_code] || DEFAULT_CFG;
        return (
          <div key={store.store_code} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "14px 20px", background: "var(--bg-page)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Store size={18} color="var(--color-primary)"/>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{store.store_name_zh || store.store_code}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "monospace" }}>{store.store_code}</div>
                </div>
              </div>
              <button type="button" onClick={() => handleSave(store.store_code)} style={{ padding: "8px 16px", background: saved[store.store_code] ? "#22c55e" : "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, transition: "background 0.3s" }}>
                {saved[store.store_code] ? <><CheckCircle size={14}/>{t('ui.已保存', '已保存')}</> : <><Save size={14}/>{t('ui.保存配置', '保存配置')}</>}
              </button>
            </div>
            <div style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
              <Field label={t('ui.打印模式', '打印模式')}>
                <select style={inp} value={cfg.printMode} onChange={e => upd(store.store_code, "printMode", e.target.value)}>
                  <option value="THERMAL">🖨️ 80mm {t('ui.热敏小票', '热敏小票')}</option>
                  <option value="A4">📄 A4 {t('ui.标准收据', '标准收据')}</option>
                  <option value="NONE">🚫 {t('ui.不打印', '不打印')}</option>
                </select>
              </Field>
              <Field label={t('ui.税率percent', '税率 (%)')}>
                <select style={inp} value={cfg.taxRate} onChange={e => upd(store.store_code, "taxRate", e.target.value)}>
                  <option value="0">0% ({t('ui.免税', '免税')})</option>
                  <option value="7">7%</option>
                  <option value="10">10%</option>
                  <option value="13">13%</option>
                </select>
              </Field>
              <Field label={t('ui.结算货币', '结算货币')}>
                <select style={inp} value={cfg.currency} onChange={e => upd(store.store_code, "currency", e.target.value)}>
                  <option value="LAK">LAK {t('ui.老挝基普', '老挝基普')}</option>
                  <option value="THB">THB {t('ui.泰铢', '泰铢')}</option>
                  <option value="CNY">CNY {t('ui.人民币', '人民币')}</option>
                  <option value="USD">USD {t('ui.美元', '美元')}</option>
                </select>
              </Field>
              <Field label={t('ui.自动日结时间', '自动日结时间')}>
                <input type="time" style={inp} value={cfg.dailyCloseTime} onChange={e => upd(store.store_code, "dailyCloseTime", e.target.value)}/>
              </Field>
              <Field label={t('ui.小票底部文字', '小票底部文字')}>
                <input style={inp} value={cfg.receiptFooter} onChange={e => upd(store.store_code, "receiptFooter", e.target.value)} placeholder={t('ui.收据底部祝福语', '收据底部祝福语')}/>
              </Field>
              <Field label={t('ui.日结后自动锁屏', '日结后自动锁屏')}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 8 }}>
                  <input type="checkbox" id={`auto_${store.store_code}`} checked={cfg.autoClose} onChange={e => upd(store.store_code, "autoClose", e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--color-primary)" }}/>
                  <label htmlFor={`auto_${store.store_code}`} style={{ fontSize: 13, cursor: "pointer" }}>{t('ui.日结后自动返回登录页', '日结后自动返回登录页')}</label>
                </div>
              </Field>
            </div>
          </div>
        );
      })}
    </div>
  );
}
