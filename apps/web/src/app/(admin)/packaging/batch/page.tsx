'use client';
import { toast } from 'sonner';
/**
 * 成品批次生成 — V3 复刻 V2 phoenix-frontend BatchGeneration.jsx 三步向导
 */
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Package, Printer, RefreshCw } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { useLanguage } from '@/contexts/LanguageContext';
import s from '@/components/ui/admin-ui.module.css';
import { EmptyState, LoadingSkeleton } from '@/components/design-system';

const tok = () => (typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') || '' : '');
const hdr = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok() });

interface GradedTask {
  task_no: string;
  batch_no: string;
  source_item: string;
  plan_qty: number;
  grade_results: Record<string, number>;
  graded_at: string;
}
interface GradeRow { code: string; name: string; qty: number; batchNo: string | null; spec?: string }

export default function BatchGenerationRoute() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}>
      <BatchGenerationPage />
    </Suspense>
  );
}

function BatchGenerationPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tasks, setTasks] = useState<GradedTask[]>([]);
  const [selectedTaskNo, setSelectedTaskNo] = useState<string | null>(null);
  const [gradeNameMap, setGradeNameMap] = useState<Record<string, string>>({});
  const [gradeRows, setGradeRows] = useState<GradeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/crud/pkg_grading_records?limit=100&_t=${Date.now()}`, { headers: hdr() });
      if (r.ok) {
        const j = await r.json();
        const rows: GradedTask[] = ((j.data || []) as Record<string, unknown>[])
          .filter((d) => d.outputs_json)
          .map((d) => {
            let gr: Record<string, number> = {};
            try {
              gr = typeof d.outputs_json === 'string'
                ? JSON.parse(d.outputs_json as string)
                : (d.outputs_json as Record<string, number>);
            } catch {}
            return {
              task_no:    (d.code as string) || '',
              batch_no:   (d.code as string) || '',
              source_item:(d.source_batch_code as string) || '—',
              plan_qty:   Number(d.total_output) || 0,
              grade_results: gr,
              graded_at:  (d.created_at || '') as string,
            };
          });
        setTasks(rows);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTasks();
    fetch('/api/packaging/grade-config', { headers: hdr() })
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, string> = {};
        for (const g of (d.grades || [])) {
          if (g.code) map[String(g.code)] = g.nameZh || g.name || String(g.code);
        }
        setGradeNameMap(map);
      })
      .catch(() => {});
  }, [loadTasks]);

  const gradeName = (code: string) =>
    gradeNameMap[code] || (/[一-龥]/.test(code) ? code : `${code} ${t("ui.号蛋","号蛋")}`);

  const goToStep2 = async () => {
    if (!selectedTaskNo) { toast.error(t("ui.请先选择一个分级任务","请先选择一个分级任务")); return; }
    const task = tasks.find((tx) => tx.task_no === selectedTaskNo);
    if (!task) return;

    const rows: GradeRow[] = Object.entries(task.grade_results)
      .map(([code, qty]) => ({ code, name: gradeName(code), qty: Number(qty) || 0, batchNo: null }))
      .filter((r) => r.qty > 0);

    try {
      const r = await fetch(`/api/crud/inv_ledger?ref_no=${encodeURIComponent(task.batch_no)}&limit=20`, { headers: hdr() });
      if (r.ok) {
        const j = await r.json();
        const ledger: Array<{ batch_no: string; change_type: string }> = (j.data || j) as Array<{ batch_no: string; change_type: string }>;
        for (const led of ledger.filter((l) => l.change_type === 'EGG_GRADED')) {
          const bn = led.batch_no;
          const codeMatch = bn.match(/-G([^-]+)-/);
          if (codeMatch) {
            const code = codeMatch[1];
            const row = rows.find((x) => x.code === code);
            if (row) row.batchNo = bn;
          }
        }
      }
    } catch { /* 没 inv_ledger 也能走 */ }

    setGradeRows(rows);
    setStep(2);
  };

  const confirmAndShowResult = () => setStep(3);

  const printLabel = (row: GradeRow) => {
    const tx = tasks.find((x) => x.task_no === selectedTaskNo);
    if (!tx) return;
    const q = new URLSearchParams({
      task_no: tx.task_no,
      grade: row.code,
      batch_no: row.batchNo || tx.batch_no,
      qty: String(row.qty),
    });
    router.push(`/packaging/label-print?${q.toString()}`);
  };

  const reset = () => {
    setStep(1);
    setSelectedTaskNo(null);
    setGradeRows([]);
    loadTasks();
  };

  const STEP_LABELS = [
    t("ui.锁定分级任务","锁定分级任务"),
    t("ui.校准等级清单","校准等级清单"),
    t("ui.落账并下发标签","落账并下发标签"),
  ];

  return (
    <div>
      <PageHeader breadcrumb={[t("ui.包装中心","包装中心"), t("ui.批次生成","批次生成")]} title={t("ui.成品批次生成","成品批次生成")} subtitle={t("ui.成品批次生成副标题","分级完成的鸡蛋按等级生成成品批次并下发标签")} />

      {/* Step Wizard */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24 }}>
        {STEP_LABELS.map((label, i) => (
          <div key={label} style={{ display: 'contents' }}>
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', flexDirection: 'column', gap: 6 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: step > i + 1 ? 'var(--status-success)' : step === i + 1 ? 'var(--color-primary)' : 'var(--bg-muted)',
                color: step > i + 1 ? 'white' : step === i + 1 ? 'white' : 'var(--text-secondary)', fontWeight: 700, fontSize: 14,
                border: step <= i + 1 ? '2px solid var(--border)' : 'none',
              }}>
                {step > i + 1 ? <CheckCircle size={16} /> : i + 1}
              </div>
              <span style={{ fontSize: 12, fontWeight: step === i + 1 ? 700 : 400, color: step === i + 1 ? 'var(--color-primary)' : 'var(--text-secondary)' }}>
                {label}
              </span>
            </div>
            {i < 2 && <div style={{ height: 2, flex: 1, background: step > i + 1 ? 'var(--status-success)' : 'var(--border)', marginBottom: 18 }} />}
          </div>
        ))}
      </div>

      {/* Step 1: 选已完成的分级任务 */}
      {step === 1 && (
        <div className={s.card} style={{ maxWidth: 720 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary)' }}>{t("ui.选择已完成分级任务","选择已完成分级任务")}</h3>
            <button type="button" onClick={loadTasks}
              style={{ padding: '6px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={12} /> {t("common.refresh","刷新")}
            </button>
          </div>
          {loading ? (
            <div style={{ padding: '16px 0' }}><LoadingSkeleton variant="line" rows={3} /></div>
          ) : tasks.length === 0 ? (
            <div style={{ padding: '12px 0' }}>
              <EmptyState
                title={t("ui.暂无已完成的分级任务","暂无已完成的分级任务")}
                description={t("ui.请先在分级作业页面完成任务","请先在「分级作业」页面完成至少一个任务")}
                compact
              />
            </div>
          ) : tasks.map((tx) => {
              const totalGraded = Object.values(tx.grade_results).reduce((sum, v) => sum + Number(v || 0), 0);
              const sel = selectedTaskNo === tx.task_no;
              return (
                <div key={tx.task_no} onClick={() => setSelectedTaskNo(tx.task_no)}
                  style={{
                    padding: '14px 16px', borderRadius: 10, marginBottom: 10, cursor: 'pointer',
                    border: `2px solid ${sel ? 'var(--color-primary)' : 'var(--border)'}`,
                    background: sel ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'var(--bg-card)',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${sel ? 'var(--color-primary)' : 'var(--border)'}`, background: sel ? 'var(--color-primary)' : 'transparent', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{tx.source_item}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'monospace' }}>{tx.task_no}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {t("ui.已分级","已分级")} <strong>{totalGraded.toLocaleString()}</strong> {t("ui.枚","枚")}（{t("ui.计划","计划")} {tx.plan_qty.toLocaleString()}）·
                      {t("ui.共","共")} <strong>{Object.values(tx.grade_results).filter((v) => Number(v) > 0).length}</strong> {t("ui.个等级","个等级")}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', textAlign: 'right' }}>
                    {tx.graded_at ? String(tx.graded_at).slice(0, 16).replace('T', ' ') : '—'}
                  </div>
                </div>
              );
            })}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={goToStep2} disabled={!selectedTaskNo}
              style={{ padding: '10px 28px', border: 'none', borderRadius: 10,
                cursor: selectedTaskNo ? 'pointer' : 'not-allowed',
                background: selectedTaskNo ? 'var(--color-primary)' : 'var(--bg-muted)',
                color: selectedTaskNo ? 'white' : 'var(--text-disabled)',
                fontWeight: 700, fontSize: 14,
                transition: 'all 0.15s',
              }}>
              {t("ui.提取等级清单","提取等级清单")} →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: 等级清单 + 批次号 */}
      {step === 2 && (
        <div className={s.card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--color-primary)' }}>{t("ui.等级清单批次号","等级清单 & 批次号")}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 12, marginBottom: 20 }}>
            {gradeRows.map((g) => (
              <div key={g.code} style={{
                padding: 16, borderRadius: 10,
                background: 'var(--bg-muted)', border: '1px solid var(--border)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>{g.name}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-primary)' }}>{g.qty.toLocaleString()}</div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{t("ui.枚","枚")}</div>
                {g.batchNo && <div style={{ marginTop: 6, fontSize: 9, fontFamily: 'monospace', color: 'var(--status-success)', wordBreak: 'break-all' }}>{g.batchNo}</div>}
                {!g.batchNo && <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-secondary)' }}>{t("ui.批次号未找到","批次号未找到")}</div>}
              </div>
            ))}
            {gradeRows.length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>
                {t("ui.该任务暂无非零等级数据","该任务暂无非零等级数据")}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => setStep(1)}
              style={{ padding: '10px 24px', border: '1px solid var(--border)', background: 'var(--bg-card)', borderRadius: 10, cursor: 'pointer' }}>
              ← {t("common.back","返回")}
            </button>
            <button type="button" onClick={confirmAndShowResult}
              style={{ padding: '10px 24px', border: 'none', background: 'var(--color-primary)', color: 'white', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
              {t("ui.确认入账并进入打印环节","确认入账并进入打印环节")}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: 完成 + 标签打印入口 */}
      {step === 3 && (
        <div>
          <div style={{
            background: 'color-mix(in srgb, var(--status-success, var(--status-success)) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--status-success, var(--status-success)) 40%, transparent)',
            borderRadius: 10, padding: '14px 16px', marginBottom: 16,
            color: 'var(--status-success, var(--status-success))', fontWeight: 600, fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <CheckCircle size={18} /> {t("ui.成品入仓动作已完成","成品入仓动作已完成")}。{t("ui.共","共")} {gradeRows.length} {t("ui.个等级批次落账","个等级批次落账")}，{t("ui.可点击下方按钮下发标签打印","可点击下方按钮下发标签打印")}。
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {gradeRows.map((g) => (
              <div key={g.code} className={s.card} style={{ borderLeft: 'var(--card-accent-width) solid var(--color-primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', marginBottom: 2 }}>{g.name}</div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{g.qty.toLocaleString()} {t("ui.枚","枚")}</div>
                  </div>
                  <span className={`${s.badge} ${s.badgeSuccess}`}>{t("ui.已入仓","已入仓")}</span>
                </div>
                {g.batchNo && <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', wordBreak: 'break-all', marginBottom: 10 }}>{g.batchNo}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => printLabel(g)}
                    style={{ flex: 1, padding: 8, fontSize: 12, border: '1px solid var(--color-primary)', color: 'var(--color-primary)',
                      background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', borderRadius: 8, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontWeight: 700 }}>
                    <Printer size={12} /> {t("ui.下发打印","下发打印")}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button type="button" onClick={reset}
              style={{ padding: '10px 24px', border: '1px solid var(--color-primary)', background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)', borderRadius: 10, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Package size={14} /> {t("ui.处理下一批","处理下一批")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
