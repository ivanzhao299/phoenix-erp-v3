"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Egg, Save, RefreshCw, AlertTriangle, Package, FileDown } from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import { useProductGrades } from "@/hooks/useProductGrades";
import PageHeader from "@/components/PageHeader";
import request from "@/lib/api-client";
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * 日产蛋入库（库存来源模式治理 P1A · 临时生产入库）
 * 仅在 inventory_source_mode = TEMP_PRODUCTION_INBOUND 时可用；
 * 直接形成 Sales V2 销售库存（EGG-YYYYMMDD-*，change_type=TEMP_PRODUCTION_INBOUND）。
 * 包装入库模式（PACKAGING_INBOUND）下禁用，提示改走包装作业中心。
 *
 * 等级来源：product_grades 主数据表（AA/A/B/C/DIRTY/CRACKED/BROKEN/DAMAGED）—
 * 与 inv_batches.grade_code_std / packaging.service 同源，杜绝多源漂移。
 */
import u from "@/styles/uix-utils.module.css";
import s from '@/components/ui/admin-ui.module.css'; // G29-B 全局表格

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export default function DailyInboundPage() {
  const { t } = useLanguage();
  const {
    canView,
    canCreate
  } = usePermission("MENU_PROD_INBOUND");
  // 日产蛋入库默认仅展示可销售等级（脏/裂/破/损走另外的次品/废损通道）
  const { grades: productGrades, loading: gradesLoading } = useProductGrades({ onlySaleable: true });
  const labelMap = useMemo(
    () => Object.fromEntries(productGrades.map(g => [g.grade_code, g.grade_name])),
    [productGrades]
  );
  const [mode, setMode] = useState<string>("");
  const [loadingMode, setLoadingMode] = useState(true);
  const [eggDate, setEggDate] = useState(today());
  const [houseCode, setHouseCode] = useState("");
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    batches: {
      batchNo: string;
      grade: string;
      qty: number;
    }[];
    totalInbound: number;
  } | null>(null);
  const prefillFromDaily = useCallback(async () => {
    setError("");
    setPrefilling(true);
    try {
      const qs = new URLSearchParams({ date: eggDate });
      if (houseCode) qs.set('houseCode', houseCode);
      const r = await request<{
        eggsByGrade: Record<string, number>;
        total: number;
        logs: number;
        missingBreakdownLogs: number;
        reportedEggs: number;
      }>(`/v3/farm/daily-logs/eggs-breakdown?${qs.toString()}`);
      if (r.missingBreakdownLogs > 0) {
        setError(
          `${eggDate}${houseCode ? ` · ${houseCode}` : ''} `
          + t(
            'breeding.dailyBreakdownMissing',
            `日报已存在（产蛋 ${r.reportedEggs} 枚），但有 ${r.missingBreakdownLogs} 个班次未录九档分级，请先返回日报补齐`,
          ),
        );
        return;
      }
      if (!r.logs || r.total === 0) {
        setError(`${eggDate}${houseCode ? ` · ${houseCode}` : ''} ${t('breeding.noDailyOr9Grade', '暂无日报或未按 9 档录入')}`);
        return;
      }
      // 用 eggsByGrade 覆盖现有 qtyMap（仅 productGrades 中已知 grade）
      const next: Record<string, string> = {};
      for (const g of productGrades) {
        const q = r.eggsByGrade[g.grade_code];
        if (q != null && q > 0) next[g.grade_code] = String(q);
      }
      setQtyMap(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('breeding.fetchDailyFailed', '拉取日报数据失败'));
    } finally {
      setPrefilling(false);
    }
  }, [eggDate, houseCode, productGrades]);

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
  const totalQty = productGrades.reduce((s, g) => s + (Number(qtyMap[g.grade_code]) || 0), 0);
  const filledRows = productGrades.filter(g => Number(qtyMap[g.grade_code]) > 0).length;
  const isPackagingMode = mode === "PACKAGING_INBOUND";
  const submit = async () => {
    setError("");
    setResult(null);
    const items = productGrades
      .filter(g => Number(qtyMap[g.grade_code]) > 0)
      .map(g => ({ grade: g.grade_code, qty: Number(qtyMap[g.grade_code]) }));
    if (items.length === 0) {
      setError(t('breeding.enterAtLeastOne', '请至少录入一档数量'));
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
      setQtyMap({});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('breeding.inboundFailed', '入库失败'));
    } finally {
      setSaving(false);
    }
  };
  if (!canView) return <div className={u.emptyPad40}>{t('breeding.noPermInbound', '无权限访问日产蛋入库')}</div>;
  return <div className="animate-fade-in" style={{
    padding: "24px 32px"
  }}>
      <PageHeader title={t('breeding.inboundTitle', '日产蛋入库')} subtitle={t('breeding.inboundSubtitle', '临时生产入库模式 · 日产蛋直接形成销售库存（统一进入 FIFO 库存体系）')} breadcrumb={[t('breeding.prodMgmt', '生产管理'), t('breeding.inboundTitle', '日产蛋入库')]} />

      {/* 模式状态条 */}
      {loadingMode ? <div style={{
      padding: 14,
      color: "var(--text-secondary)"
    }}>{t('breeding.loadingSourceMode', '加载库存来源模式...')}</div> : isPackagingMode ? <div style={{
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
            <strong>{t('breeding.packagingModeOn', '已启用包装入库模式（PACKAGING_INBOUND）')}</strong><br />
            {t('breeding.packagingModeDesc', '不允许直接生成库存。请通过「包装作业中心」完成 集蛋 → 分级 → 包装 → 自动入库。')}
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
      }}>{t('breeding.goPackaging', '前往包装作业')}</Link>
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
          <Egg size={16} /> {t('breeding.currentMode', '当前为')} <strong>{t('breeding.tempProdMode', '临时生产入库模式')}</strong>{t('breeding.tempProdModeDesc', '，录入即直接形成可销售库存。')}
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
          }}>{t('breeding.prodDate', '生产日期')}</label>
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
          }}>{t('breeding.houseOptional', '鸡舍（可选·追溯）')}</label>
              <input value={houseCode} onChange={e => setHouseCode(e.target.value)} placeholder={t('breeding.houseExample', '如 A001')} className="bg-bg-muted border border-border text-text" style={{
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
              <RefreshCw size={13} /> {t('breeding.refreshMode', '刷新模式')}
            </button>
            <button onClick={prefillFromDaily} disabled={prefilling} className="bg-bg-muted border border-border text-text-muted" style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 14px",
          borderRadius: 7,
          fontSize: 13,
          cursor: prefilling ? "not-allowed" : "pointer",
          opacity: prefilling ? 0.6 : 1,
        }} title={t('breeding.prefillTitle', '从所选日期+鸡舍的当日生产日报拉取按 9 档分解的产蛋数量，预填到下方表格')}>
              <FileDown size={13} /> {prefilling ? t('breeding.fetching', '拉取中...') : t('breeding.prefillFromDaily', '从日报预填')}
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
            <div><span className={u.muted12}>{t('breeding.gradesEntered', '已录等级')}</span><div style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text-primary)"
          }}>{filledRows} / {productGrades.length}</div></div>
            <div><span className={u.muted12}>{t('breeding.totalInboundEa', '合计入库（枚）')}</span><div style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--color-primary)"
          }}>{totalQty.toLocaleString()}</div></div>
            <div><span className={u.muted12}>{t('breeding.totalCrates', '合计（提·÷180）')}</span><div style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text-primary)"
          }}>{Math.floor(totalQty / 180).toLocaleString()}</div></div>
          </div>

          {/* 明细表 — product_grades 主数据全档可售等级预渲染 */}
          <div className="bg-bg-card border border-border" style={{
        borderRadius: 10,
        overflow: "hidden",
        marginBottom: 16
      }}>
            <table className={s.table}>
              <thead>
                <tr style={{
              background: "var(--bg-muted)"
            }}>
                  <th style={{
                textAlign: "left",
                padding: "10px 14px",
                color: "var(--text-secondary)",
                fontWeight: 600
              }}>{t('breeding.eggGrade', '蛋品等级')}</th>
                  <th style={{
                textAlign: "left",
                padding: "10px 14px",
                color: "var(--text-secondary)",
                fontWeight: 600,
                width: 110
              }}>{t('breeding.code', '编码')}</th>
                  <th style={{
                textAlign: "left",
                padding: "10px 14px",
                color: "var(--text-secondary)",
                fontWeight: 600
              }}>{t('breeding.qtyEa', '数量（枚）')}</th>
                </tr>
              </thead>
              <tbody>
                {gradesLoading && productGrades.length === 0 ? (
                  <tr><td colSpan={3} style={{
                    padding: "16px 14px",
                    color: "var(--text-secondary)",
                    fontSize: 13
                  }}>{t('breeding.loadingGrades', '加载等级主数据中…')}</td></tr>
                ) : productGrades.map(g => (
                  <tr key={g.grade_code} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{
                      padding: "8px 14px",
                      fontWeight: 500,
                      color: "var(--text-primary)"
                    }}>{g.grade_name}</td>
                    <td style={{
                      padding: "8px 14px",
                      fontFamily: "monospace",
                      color: "var(--text-secondary)",
                      fontSize: 12
                    }}>{g.grade_code}</td>
                    <td style={{ padding: "8px 14px" }}>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={qtyMap[g.grade_code] ?? ""}
                        onChange={e => setQtyMap(m => ({ ...m, [g.grade_code]: e.target.value }))}
                        placeholder="0"
                        className="bg-bg-muted border border-border text-text"
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          fontSize: 13,
                          outline: "none",
                          width: 180,
                          textAlign: "right"
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            <Save size={16} /> {saving ? t('breeding.inbounding', '入库中...') : t('breeding.confirmInbound', '确认入库（形成销售库存）')}
          </button>
          {!canCreate && <div style={{
        marginTop: 8,
        fontSize: 12,
        color: "var(--text-secondary)"
      }}>{t('breeding.noCreatePerm', '当前账号无录入权限（需 MENU_PROD_INBOUND 的 C 权限）')}</div>}

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
        }}>{t('breeding.inboundSuccess', '✓ 入库成功 · 合计')} {result.totalInbound.toLocaleString()} {t('breeding.eaGenerated', '枚，生成')} {result.batches.length} {t('breeding.saleableBatches', '个可售批次')}</div>
              <table className={s.table} style={{ fontSize: 12 }}>
                <thead><tr className={u.muted}><th style={{
                textAlign: "left",
                padding: "4px 8px"
              }}>{t('breeding.batchNo', '批次号')}</th><th style={{
                textAlign: "left",
                padding: "4px 8px"
              }}>{t('breeding.grade', '等级')}</th><th style={{
                textAlign: "left",
                padding: "4px 8px"
              }}>{t('breeding.qty', '数量')}</th></tr></thead>
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
              }}>{labelMap[b.grade] || b.grade}</td>
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
