"use client";
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, CheckCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";

const tok = () => typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

const SPEC_QTY = (spec: string) => { const m = (spec || "").match(/(\d+)枚/); return m ? Number(m[1]) : 30; };
const parseDominantGrade = (raw: string | null) => {
  if (!raw) return "AA";
  try { const obj = JSON.parse(raw); const e = Object.entries(obj).filter(([, v]) => Number(v) > 0); if (!e.length) return "AA"; return e.sort((a, b) => Number(b[1]) - Number(a[1]))[0][0]; }
  catch { return raw || "AA"; }
};
const resolveSpec = (opts: string[], candidate: string) => opts.find(s => s === candidate) || opts.find(s => s.includes("180")) || opts[0] || candidate;

interface Task { taskNo: string; batchNo: string; grade: string; spec: string; planQty: number; packedQty: number; boxes: number; }
interface RemTask { taskNo: string; grade: string; remainderQty: number; batchNo: string; }

export default function PackingPage() {
  const { t } = useLanguage();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeNo, setActiveNo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [packSpecs, setPackSpecs] = useState<{ name: string; qty: number; unit?: string }[]>([]);
  const [spec, setSpec] = useState("");
  const [trays, setTrays] = useState("");
  const [batches, setBatches] = useState<{ boxes: number; eggs: number; ts: number }[]>([]);
  const [remainderTasks, setRemainderTasks] = useState<RemTask[]>([]);
  const [preQty, setPreQty] = useState(0);
  const [mergeNotice, setMergeNotice] = useState<{ grade: string; totalQty: number; count: number } | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [gradeNameMap, setGradeNameMap] = useState<Record<string, string>>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [gcR, psR, tkR] = await Promise.all([
        fetch("/api/packaging/grade-config", { headers: hdr() }).then(r => r.json()).catch(() => ({})),
        fetch("/api/packaging/pack-spec-config", { headers: hdr() }).then(r => r.json()).catch(() => ({})),
        fetch(`/api/packaging/tasks?_t=${Date.now()}`, { headers: hdr() }).then(r => r.json()).catch(() => ({ code: 0 })),
      ]);
      if ((gcR.grades || []).length) {
        const map: Record<string, string> = {};
        gcR.grades.forEach((g: any) => { map[g.code] = g.nameZh || g.name || g.code; });
        setGradeNameMap(map);
      }
      const DEFAULT_SPECS = [
        { name: "30枚/托", qty: 30 }, { name: "20枚/托", qty: 20 },
        { name: "6枚/盒",  qty: 6  }, { name: "10枚/盒", qty: 10 },
      ];
      const specs = (psR.specs && psR.specs.length > 0)
        ? (psR.specs as { name: string; qty: number; unit?: string }[])
        : DEFAULT_SPECS;
      setPackSpecs(specs);
      if (tkR.code === 200) {
        const list: Task[] = (tkR.data || []).filter((t: any) => ["pending", "IN_PROGRESS", "PENDING"].includes(t.status)).map((t: any) => ({
          taskNo: t.task_no, batchNo: t.batch_no || "—",
          grade: parseDominantGrade(t.grade_results),
          spec: t.pack_spec || "", planQty: Number(t.plan_qty) || 0,
          packedQty: Number(t.packed_qty) || 0, boxes: Number(t.output_qty) || 0,
        }));
        setTasks(list);
        const rems: RemTask[] = (tkR.remainderTasks || []).map((t: any) => ({
          taskNo: t.task_no, grade: parseDominantGrade(t.grade_results),
          remainderQty: Number(t.remainder_qty) || 0, batchNo: t.batch_no || "—",
        }));
        setRemainderTasks(rems);
        if (list.length) {
          setActiveNo(prev => {
            if (!prev || !list.some(t => t.taskNo === prev)) {
              const s0 = resolveSpec(specs.map(s => s.name), list[0].spec);
              setTimeout(() => setSpec(s0), 0);
              return list[0].taskNo;
            }
            return prev;
          });
        } else { setActiveNo(""); }
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    const t = setInterval(async () => {
      const r = await fetch(`/api/packaging/tasks?_t=${Date.now()}`, { headers: hdr() }).then(r => r.json()).catch(() => ({ code: 0 }));
      if (r.code === 200) {
        const list: Task[] = (r.data || []).filter((t: any) => ["pending", "IN_PROGRESS", "PENDING"].includes(t.status)).map((t: any) => ({ taskNo: t.task_no, batchNo: t.batch_no || "—", grade: parseDominantGrade(t.grade_results), spec: t.pack_spec || "", planQty: Number(t.plan_qty) || 0, packedQty: Number(t.packed_qty) || 0, boxes: Number(t.output_qty) || 0 }));
        setTasks(list);
        setRemainderTasks((r.remainderTasks || []).map((t: any) => ({ taskNo: t.task_no, grade: parseDominantGrade(t.grade_results), remainderQty: Number(t.remainder_qty) || 0, batchNo: t.batch_no || "—" })));
      }
    }, 10000);
    return () => clearInterval(t);
  }, []);

  const cur = tasks.find(t => t.taskNo === activeNo) || null;
  const specObj = packSpecs.find(s => s.name === spec);
  const qty = specObj?.qty ?? SPEC_QTY(spec);
  const boxes = parseInt(trays, 10) || 0;
  const eggs = boxes * qty;
  const alreadyPacked = cur?.packedQty ?? 0;
  const sessionPacked = batches.reduce((s, b) => s + b.eggs, 0);
  const effectivePlan = (cur?.planQty ?? 0) + preQty;
  const totalPacked = alreadyPacked + sessionPacked;
  const remaining = cur ? Math.max(0, effectivePlan - totalPacked) : 0;
  const pct = effectivePlan > 0 ? Math.round(totalPacked / effectivePlan * 100) : 0;
  const wouldExceed = eggs > 0 && (totalPacked + eggs) > effectivePlan;
  const planFull = cur ? totalPacked >= effectivePlan : false;
  const canConfirm = boxes > 0 && qty > 0 && eggs >= qty && !wouldExceed && !planFull;

  const pick = (t: Task) => {
    if (t.taskNo === activeNo) return;
    setActiveNo(t.taskNo); setSpec(resolveSpec(packSpecs.map(s => s.name), t.spec));
    setTrays(""); setBatches([]); setPreQty(0); setMergeNotice(null);
    const sameRems = remainderTasks.filter(r => r.grade === t.grade && r.remainderQty > 0);
    if (sameRems.length > 0) setMergeNotice({ grade: t.grade, totalQty: sameRems.reduce((s, r) => s + r.remainderQty, 0), count: sameRems.length });
  };

  const doMerge = async () => {
    if (!mergeNotice) return;
    const r = await fetch("/api/packaging/tasks/merge-remainder", { method: "POST", headers: hdr(), body: JSON.stringify({ grade: mergeNotice.grade }) }).then(r => r.json()).catch(() => ({ code: 0 }));
    if (r.code === 200 && r.merged_qty > 0) {
      setPreQty(p => p + r.merged_qty); setMergeNotice(null);
      setRemainderTasks(p => p.filter(rem => !(rem.grade === mergeNotice.grade && rem.remainderQty > 0)));
    }
  };

  const confirm = () => { if (!canConfirm) return; setBatches(p => [...p, { boxes, eggs, ts: Date.now() }]); setTrays(""); };

  const complete = async () => {
    if (!cur || totalPacked <= 0) return;
    setFinalizing(true);
    try {
      const resp = await fetch(`/api/packaging/tasks/${activeNo}/pack-complete`, {
        method: "POST", headers: hdr(),
        body: JSON.stringify({ packed_qty: totalPacked, output_qty: batches.reduce((s, b) => s + b.boxes, 0) + (cur.boxes || 0), pack_spec: spec }),
      });
      const json = await resp.json();
      if (!resp.ok) { alert(json.msg || `结单失败 (${resp.status})`); return; }
      setShowSuccess(true);
      setBatches([]); setTrays(""); setPreQty(0); setMergeNotice(null);
      setTimeout(() => { setShowSuccess(false); loadAll(); }, 2500);
    } catch { alert("结单失败，请检查网络"); }
    finally { setFinalizing(false); }
  };

  const gradeLabel = (code: string) => gradeNameMap[code] || code;

  const KEYS = [["7","8","9"],["4","5","6"],["1","2","3"],["C","0","⌫"]];
  const pressKey = (k: string) => {
    if (k === "⌫") { setTrays(t => t.length > 1 ? t.slice(0, -1) : ""); return; }
    if (k === "C") { setTrays(""); return; }
    const next = (trays === "" || trays === "0") ? k : trays + k;
    if (next.length <= 6) setTrays(next);
  };

  const sessionBoxes = batches.reduce((s, b) => s + b.boxes, 0);

  return (
    <div>
      <PageHeader title={t("packaging.packing", "包装作业")} subtitle="按托/箱数录入，自动计算鸡蛋数量" breadcrumb={["分级包装", "包装作业"]}
        actions={<button className={s.btnIcon} onClick={loadAll} title="刷新"><RefreshCw size={14}/></button>} />

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20, minHeight: 600 }}>
        {/* Left: task list */}
        <div className={s.card} style={{ padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>任务队列 {!loading && <span style={{ background: "var(--color-primary)", color: "#fff", padding: "1px 6px", borderRadius: 10, fontSize: 10 }}>{tasks.length}</span>}</div>
          {loading && <div className={s.emptyStateText}>加载中…</div>}
          {tasks.map(t => {
            const a = t.taskNo === activeNo;
            const livePacked = a ? totalPacked : t.packedQty;
            const ePlan = a ? effectivePlan : t.planQty;
            const tPct = ePlan > 0 ? Math.round(livePacked / ePlan * 100) : 0;
            return (
              <div key={t.taskNo} onClick={() => pick(t)} className={s.listCard}
                style={{ marginBottom: 6, cursor: "pointer", borderLeftColor: a ? "var(--color-primary)" : "var(--border)", background: a ? "var(--bg-muted)" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span style={{ fontSize: 18, fontWeight: 900 }}>{gradeLabel(t.grade)}</span>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>{a ? Math.max(0, ePlan - totalPacked).toLocaleString() : t.planQty.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 400 }}>枚</span></span>
                </div>
                <div className={s.progressWrap} style={{ marginBottom: 4 }}><div className={s.progressBar} style={{ width: `${Math.min(100, tPct)}%` }}/></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-secondary)" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>{t.taskNo}</span>
                  <span style={{ fontWeight: 700 }}>{tPct}%</span>
                </div>
              </div>
            );
          })}
          {tasks.length === 0 && !loading && <div className={s.emptyStateText} style={{ textAlign: "center", padding: "30px 0" }}>暂无包装任务</div>}
          {remainderTasks.length > 0 && (
            <>
              <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }}/>
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>⏳ 尾数·待合拼</div>
              {remainderTasks.map(r => (
                <div key={r.taskNo} style={{ padding: "7px 10px", borderRadius: 8, background: "var(--bg-muted)", border: "1px solid var(--border)", marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{gradeLabel(r.grade)}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--status-warning,#f59e0b)" }}>{r.remainderQty.toLocaleString()} 枚</div>
                  <div style={{ fontSize: 9, color: "var(--text-secondary)" }}>▸ 选中同等级任务时提示合拼</div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Right: main area */}
        <div>
          {!cur ? (
            <div className={s.card} style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 500 }}>
              <div className={s.emptyState}><div style={{ fontSize: 36, marginBottom: 12 }}>📦</div><div className={s.emptyStateText}>{loading ? "加载中…" : tasks.length === 0 ? "暂无包装任务" : "← 从左侧选择一个任务"}</div></div>
            </div>
          ) : showSuccess ? (
            <div className={s.card} style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 500 }}>
              <div className={s.emptyState}><div style={{ fontSize: 48 }}>✅</div><div style={{ fontSize: 18, fontWeight: 700, color: "var(--status-success)" }}>结单成功！</div></div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Merge notice */}
              {mergeNotice && (
                <div className={s.warnBanner}>
                  <span style={{ fontSize: 20 }}>🔀</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, marginBottom: 2 }}>发现 {mergeNotice.totalQty.toLocaleString()} 枚同等级（{mergeNotice.grade}）尾数，是否立即合拼？</div>
                    <div style={{ fontSize: 11 }}>合拼后计入本次包装总量，结单时一并入账。</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button className={s.btnGhost} style={{ fontSize: 12 }} onClick={() => setMergeNotice(null)}>忽略</button>
                    <button className={s.btnWarning} style={{ fontSize: 12 }} onClick={doMerge}>⊕ 合拼 {mergeNotice.totalQty.toLocaleString()} 枚</button>
                  </div>
                </div>
              )}
              {preQty > 0 && !mergeNotice && (
                <div className={s.successBanner}>✅ 已合拼尾数 +{preQty.toLocaleString()} 枚 · 已计入本次包装总量</div>
              )}

              {/* Spec strip */}
              <div className={s.card} style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>规格：</span>
                {packSpecs.map(sp => (
                  <button key={sp.name} onClick={() => setSpec(sp.name)}
                    className={spec === sp.name ? s.btnPrimary : s.btnSecondary}
                    style={{ fontSize: 12, padding: "4px 14px", borderRadius: 20 }}>{sp.name}</button>
                ))}
              </div>

              {/* Task info bar */}
              <div className={s.card} style={{ padding: "10px 16px" }}>
                <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                  <div><span style={{ fontSize: 11, color: "var(--text-secondary)" }}>等级</span><div style={{ fontSize: 18, fontWeight: 900 }}>{gradeLabel(cur.grade)}</div></div>
                  <div><span style={{ fontSize: 11, color: "var(--text-secondary)" }}>任务号</span><div style={{ fontSize: 12, fontFamily: "monospace" }}>{cur.taskNo}</div></div>
                  <div><span style={{ fontSize: 11, color: "var(--text-secondary)" }}>有效计划</span><div style={{ fontSize: 16, fontWeight: 800 }}>{effectivePlan.toLocaleString()} 枚{preQty > 0 && <span style={{ fontSize: 10, color: "var(--text-secondary)" }}> ({cur.planQty}+{preQty})</span>}</div></div>
                  <div><span style={{ fontSize: 11, color: "var(--text-secondary)" }}>已入账</span><div style={{ fontSize: 16, fontWeight: 800, color: "var(--status-success)" }}>{totalPacked.toLocaleString()} 枚</div></div>
                  <div><span style={{ fontSize: 11, color: "var(--text-secondary)" }}>剩余</span><div style={{ fontSize: 16, fontWeight: 800, color: remaining > 0 ? "var(--status-warning)" : "var(--status-success)" }}>{remaining.toLocaleString()} 枚</div></div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}><span>完成率</span><span style={{ fontWeight: 700 }}>{pct}%</span></div>
                    <div className={s.progressWrap} style={{ height: 8 }}><div className={s.progressBar} style={{ width: `${Math.min(100, pct)}%` }}/></div>
                  </div>
                </div>
              </div>

              {/* Input area + numpad */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 20 }}>
                <div className={s.card} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Tray input */}
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, marginBottom: 6 }}>托 / 箱数</div>
                    <div style={{ height: 100, background: "var(--bg-muted)", border: "3px solid var(--color-primary)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                      <span style={{ fontSize: 64, fontWeight: 900, fontFamily: "monospace", color: "var(--color-primary)", opacity: trays ? 1 : 0.3 }}>{trays || "0"}</span>
                      <span style={{ position: "absolute", bottom: 10, right: 14, fontSize: 12, color: "var(--text-secondary)" }}>托/箱</span>
                    </div>
                  </div>
                  {/* Formula */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", fontSize: 16 }}>
                    <span style={{ color: "var(--text-secondary)" }}>×</span>
                    <span style={{ fontSize: 22, fontWeight: 900, color: "var(--color-primary)" }}>{qty || "—"}</span>
                    <span style={{ color: "var(--text-secondary)" }}>=</span>
                    <span style={{ fontSize: 20, fontWeight: 900, color: eggs > 0 ? (wouldExceed ? "var(--status-danger)" : "var(--text-primary)") : "var(--text-secondary)" }}>{eggs > 0 ? eggs.toLocaleString() : "—"} <span style={{ fontSize: 12, fontWeight: 400 }}>枚</span></span>
                  </div>
                  {/* Status hint */}
                  {wouldExceed ? <div className={s.errorBanner}>⚠ 超出！剩余 {remaining.toLocaleString()} 枚，超 {(eggs - remaining).toLocaleString()} 枚</div>
                    : planFull ? <div className={s.successBanner}>✓ 已装满，请结单</div>
                    : canConfirm ? <div className={s.successBanner}>✓ {boxes}托 × {qty} = {eggs.toLocaleString()} 枚，剩 {(remaining - eggs).toLocaleString()} 枚</div>
                    : <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-secondary)" }}>请输入托数或箱数</div>}
                  {/* Confirm button */}
                  <button className={canConfirm ? s.btnPrimaryGrad : s.btnSecondary} onClick={confirm} disabled={!canConfirm} style={{ padding: "14px", fontSize: 16, width: "100%" }}>
                    {canConfirm ? `＋ 确认入账 ${eggs.toLocaleString()} 枚` : "输入有效数量后可确认"}
                  </button>
                  {/* Batch history */}
                  {batches.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[...batches].reverse().slice(0, 4).map(b => (
                        <div key={b.ts} style={{ background: "var(--bg-muted)", borderRadius: 6, padding: "3px 10px", fontSize: 11, border: "1px solid var(--border)" }}>
                          {b.boxes}托 <span style={{ color: "var(--status-success)", fontWeight: 700 }}>+{b.eggs.toLocaleString()}枚</span>
                        </div>
                      ))}
                      {batches.length > 4 && <span style={{ fontSize: 11, color: "var(--text-secondary)", alignSelf: "center" }}>…共{batches.length}批</span>}
                    </div>
                  )}
                  {/* Complete button */}
                  <button className={totalPacked > 0 ? s.btnSuccess : s.btnSecondary} onClick={complete} disabled={finalizing || totalPacked <= 0} style={{ padding: 13, fontSize: 15, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <CheckCircle size={18}/>{finalizing ? "结单中…" : "预览并结单入库"}
                  </button>
                </div>

                {/* Numpad */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 90px)", gridTemplateRows: "repeat(4, 90px)", gap: 8 }}>
                  {KEYS.map((row, ri) => row.map(k => (
                    <button key={`${ri}-${k}`} onClick={() => pressKey(k)}
                      style={{ border: "1px solid var(--border)", borderRadius: 12, cursor: "pointer", fontWeight: 900, fontSize: 28, fontFamily: "monospace",
                        background: k === "C" ? "var(--status-danger)" : k === "⌫" ? "var(--bg-muted)" : "var(--bg-card)",
                        color: k === "C" ? "#fff" : "var(--text-primary)", transition: "transform 0.1s" }}
                      onMouseDown={e => (e.currentTarget.style.transform = "scale(0.93)")}
                      onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
                      onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}>
                      {k}
                    </button>
                  )))}
                </div>
              </div>

              {/* Bottom stats bar */}
              <div className={s.card} style={{ padding: "12px 20px", display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
                {[["总托数", `${sessionBoxes}托`], ["总蛋数", `${totalPacked.toLocaleString()}枚`], ["剩余", `${remaining.toLocaleString()}枚`], ["完成率", `${pct}%`]].map(([l, v]) => (
                  <div key={l}><div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 600 }}>{l}</div><div style={{ fontSize: 20, fontWeight: 900 }}>{v}</div></div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}