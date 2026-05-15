'use client';
/**
 * 包装终端（KIOSK 模式）
 * 移植自 V2 phoenix-frontend/src/pages/packaging/PackagingTerminal.jsx (1646 行)
 * 使用 V3 抽象：KioskGuard / printLabel / barcode.ts
 *
 * 业务流：
 *   加载等级映射 + 规格 + 任务(10s 轮询) → 选任务 → 同等级尾数合拼提示
 *   → 数字键盘录入托数 → eggs = trays × specQty 自动算
 *   → 确认入账(累计 batches) → 完成 → 取 label-info → 打开标签抽屉
 *   → 点打印 → /pack-complete 扣减 → iframe 静默打印 → /labels/record 审计
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle, LogOut, Printer, RefreshCw, Tag, X,
} from 'lucide-react';
import { useBrand } from '@/contexts/BrandContext';
import { useKioskGuard } from '@/components/packaging/KioskGuard';
import { generateCode128SVG } from '@/lib/barcode';
import { buildLabelCss, printLabel } from '@/components/packaging/printLabel';

// ─── 主题色（与 V2 对齐）───────────────────────────────────────
const BG = '#0f172a', CARD = '#1e293b', BOR = '#334155';
const ACC = '#f59e0b', TXT = '#f1f5f9', MUT = '#94a3b8', GRN = '#22c55e';
const LS_KEY = 'phoenix_label_settings';

// ─── 类型 ─────────────────────────────────────────────────────
interface PackSpec { name: string; qty: number; unit?: string }
interface GradeName { zh: string; lo: string; en: string }
interface RawTask {
  task_no: string;
  batch_no?: string;
  grade_results?: string;
  pack_spec?: string;
  plan_qty?: number | string;
  packed_qty?: number | string;
  output_qty?: number | string;
  remainder_qty?: number | string;
  status?: string;
}
interface Task {
  taskNo: string;
  batchNo: string;
  grade: string;
  spec: string;
  planQty: number;
  packedQty: number;
  boxes: number;
}
interface RemainderTask {
  taskNo: string;
  grade: string;
  remainderQty: number;
  batchNo: string;
}
interface Batch { boxes: number; eggs: number; spec: string; ts: number }
interface LabelDates { produceDate: string; expireDate: string; priceRetail: number | null }
interface CfgState {
  size: string;
  showBatch: boolean;
  showDate: boolean;
  showExpiry: boolean;
  showPrice: boolean;
  lang: 'zh' | 'lo' | 'en';
  printerName: string;
  printSetupDone: boolean;
}

// ─── 工具 ─────────────────────────────────────────────────────
const SPEC_QTY = (spec: string): number => {
  const m = (spec || '').match(/(\d+)枚/);
  return m ? Number(m[1]) : 30;
};
const parseDominantGrade = (raw?: string): string => {
  if (!raw) return 'AA';
  try {
    const obj = JSON.parse(raw) as Record<string, number | string>;
    const entries = Object.entries(obj).filter(([, v]) => Number(v) > 0);
    if (!entries.length) return 'AA';
    return entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0][0];
  } catch {
    return raw || 'AA';
  }
};
const resolveSpec = (opts: string[], cand: string): string => {
  if (!opts || opts.length === 0) return cand || '';
  return opts.find((s) => s === cand)
    || opts.find((s) => s.includes('180'))
    || opts[0];
};

const tok = () => (typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') || '' : '');
const hdr = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok() });
const getRole = () => {
  try {
    return JSON.parse(sessionStorage.getItem('phoenix_user') || '{}').role || '';
  } catch { return ''; }
};
const getUser = () => {
  try {
    return JSON.parse(sessionStorage.getItem('phoenix_user') || '{}');
  } catch { return {}; }
};

// ─── 主组件 ───────────────────────────────────────────────────
export default function PackagingTerminalPage() {
  const router = useRouter();
  const { brand } = useBrand();
  const companyName = brand.company_name || '凤凰农业';
  const logoUrl = brand.logo_url || '';
  const role = useMemo(() => getRole(), []);
  const user = useMemo(() => getUser(), []);
  const isAdmin = role === 'ROLE_ADMIN';

  // ─── 状态 ──────────────────────────────────────────────────
  const [tasks, setTasks] = useState<Task[]>([]);
  const [remainderTasks, setRemainderTasks] = useState<RemainderTask[]>([]);
  const [activeNo, setActiveNo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [packSpecs, setPackSpecs] = useState<PackSpec[]>([]);
  const [gradeNameMap, setGradeNameMap] = useState<Record<string, GradeName>>({});
  const [spec, setSpec] = useState('');
  const [trays, setTrays] = useState('');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [preQty, setPreQty] = useState(0);
  const [mergeNotice, setMergeNotice] = useState<{ grade: string; totalQty: number; count: number } | null>(null);
  const [labelCopies, setLabelCopies] = useState(1);
  const [printedLabelsCount, setPrintedLabelsCount] = useState(0);
  const [pressedKey, setPressedKey] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [labelDates, setLabelDates] = useState<LabelDates>({ produceDate: '', expireDate: '', priceRetail: null });
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // 标签配置（持久化到 localStorage）
  const [cfg, setCfg] = useState<CfgState>(() => {
    if (typeof window === 'undefined') {
      return {
        size: '40×30mm', showBatch: true, showDate: true, showExpiry: true,
        showPrice: false, lang: 'lo', printerName: '', printSetupDone: false,
      };
    }
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}') as Partial<CfgState>;
      return {
        size: raw.size || '40×30mm',
        showBatch: raw.showBatch !== false,
        showDate: raw.showDate !== false,
        showExpiry: raw.showExpiry !== false,
        showPrice: !!raw.showPrice,
        lang: (raw.lang === 'zh' || raw.lang === 'en' || raw.lang === 'lo') ? raw.lang : 'lo',
        printerName: raw.printerName || '',
        printSetupDone: !!raw.printSetupDone,
      };
    } catch {
      return {
        size: '40×30mm', showBatch: true, showDate: true, showExpiry: true,
        showPrice: false, lang: 'lo', printerName: '', printSetupDone: false,
      };
    }
  });
  const saveCfg = (next: CfgState) => {
    setCfg(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
  };

  // KIOSK 守卫（非管理员才生效）
  const { isFullscreen, requestFullscreen } = useKioskGuard({
    isAdmin,
    manifestHref: '/packaging-manifest.json',
    trapPath: '/packaging/terminal',
    isPrinting,
  });

  // ─── 数据加载 ──────────────────────────────────────────────
  const mapTask = (t: RawTask): Task => ({
    taskNo: t.task_no,
    batchNo: t.batch_no || '—',
    grade: parseDominantGrade(t.grade_results),
    spec: t.pack_spec || '',
    planQty: Number(t.plan_qty) || 0,
    packedQty: Number(t.packed_qty) || 0,
    boxes: Number(t.output_qty) || 0,
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    // 等级三语映射
    try {
      const r = await fetch('/api/packaging/grade-config', { headers: hdr() });
      const d = await r.json();
      if (Array.isArray(d.grades) && d.grades.length) {
        const map: Record<string, GradeName> = {};
        for (const g of d.grades) {
          map[g.code] = {
            zh: g.nameZh || g.name || g.code,
            lo: g.nameLo || g.nameZh || g.code,
            en: g.nameEn || g.name || g.code,
          };
        }
        setGradeNameMap(map);
      }
    } catch { /* ignore */ }
    // 规格
    let specs: PackSpec[] = [];
    try {
      const r = await fetch('/api/packaging/pack-spec-config', { headers: hdr() });
      const d = await r.json();
      if (Array.isArray(d.specs) && d.specs.length) specs = d.specs;
    } catch { /* ignore */ }
    setPackSpecs(specs);
    // 任务
    try {
      const r = await fetch('/api/packaging/tasks?_t=' + Date.now(), { headers: hdr() });
      const d = await r.json();
      if (d.code === 200) {
        const list: Task[] = (d.data || [])
          .filter((t: RawTask) => ['pending', 'PENDING', 'IN_PROGRESS'].includes(String(t.status || '')))
          .map(mapTask);
        setTasks(list);
        const rems: RemainderTask[] = (d.remainderTasks || []).map((t: RawTask) => ({
          taskNo: t.task_no,
          grade: parseDominantGrade(t.grade_results),
          remainderQty: Number(t.remainder_qty) || 0,
          batchNo: t.batch_no || '—',
        }));
        setRemainderTasks(rems);
        if (list.length) {
          setActiveNo((prev) => {
            if (!prev || !list.some((t) => t.taskNo === prev)) {
              setTimeout(() => setSpec(resolveSpec(specs.map((s) => s.name), list[0].spec)), 0);
              return list[0].taskNo;
            }
            return prev;
          });
        } else {
          setActiveNo(null);
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // 10 秒后台轮询（多终端并发同步）
  useEffect(() => {
    if (!tok()) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch('/api/packaging/tasks?_t=' + Date.now(), { headers: hdr() });
        const d = await r.json();
        if (d.code === 200) {
          const list: Task[] = (d.data || [])
            .filter((tt: RawTask) => ['pending', 'PENDING', 'IN_PROGRESS'].includes(String(tt.status || '')))
            .map(mapTask);
          setTasks(list);
          const rems: RemainderTask[] = (d.remainderTasks || []).map((tt: RawTask) => ({
            taskNo: tt.task_no,
            grade: parseDominantGrade(tt.grade_results),
            remainderQty: Number(tt.remainder_qty) || 0,
            batchNo: tt.batch_no || '—',
          }));
          setRemainderTasks(rems);
        }
      } catch { /* ignore */ }
    }, 10000);
    return () => clearInterval(t);
  }, []);

  // 打印事件 → 暂停 KIOSK Re-Lock
  useEffect(() => {
    const onBefore = () => setIsPrinting(true);
    const onAfter = () => setIsPrinting(false);
    window.addEventListener('beforeprint', onBefore);
    window.addEventListener('afterprint', onAfter);
    return () => {
      window.removeEventListener('beforeprint', onBefore);
      window.removeEventListener('afterprint', onAfter);
    };
  }, []);

  // ─── 派生量 ────────────────────────────────────────────────
  const cur = tasks.find((t) => t.taskNo === activeNo) || null;
  const specObj = packSpecs.find((s) => s.name === spec) || null;
  const qty = specObj?.qty ?? SPEC_QTY(spec);
  const boxes = parseInt(trays, 10) || 0;
  const eggs = boxes * qty;
  const alreadyPacked = cur?.packedQty ?? 0;
  const sessionPacked = batches.reduce((s, b) => s + b.eggs, 0);
  const sessionBoxes = batches.reduce((s, b) => s + b.boxes, 0);
  const totalBoxes = sessionBoxes + (cur?.boxes || 0);
  const pendingLabels = totalBoxes - printedLabelsCount;
  const effectivePlan = (cur?.planQty ?? 0) + preQty;
  const totalPacked = alreadyPacked + sessionPacked;
  const remaining = cur ? Math.max(0, effectivePlan - totalPacked) : 0;
  const pct = effectivePlan > 0 ? Math.round((totalPacked / effectivePlan) * 100) : 0;
  const wouldExceed = eggs > 0 && totalPacked + eggs > effectivePlan;
  const planFull = cur ? totalPacked >= effectivePlan : false;
  const belowUnit = eggs > 0 && qty > 0 && eggs < qty && !wouldExceed && !planFull;
  const canConfirm = boxes > 0 && qty > 0 && eggs >= qty && !wouldExceed && !planFull;

  // ─── 多语言 ────────────────────────────────────────────────
  const uiLang = cfg.lang;
  const tr = (z: string, e: string, l: string) => uiLang === 'zh' ? z : uiLang === 'en' ? e : l;
  const eggUnit = tr('枚', 'pcs', 'ໜ່ວຍ');
  const trayUnit = tr('托/箱', 'tray', 'ຖາດ');
  const gradeLabel = (code: string): string => {
    const m = gradeNameMap[code];
    const hasChinese = /[一-龥]/.test(code);
    const raw = m
      ? (uiLang === 'en' ? m.en : uiLang === 'lo' ? m.lo : m.zh)
      : hasChinese ? code
      : uiLang === 'zh' ? `${code}级` : uiLang === 'en' ? `Grade ${code}` : `ຊັ້ນ ${code}`;
    return raw.replace(/\s*[（(][^）)]*[）)]/g, '').trim() || raw;
  };

  // ─── 交互 ──────────────────────────────────────────────────
  const press = (k: string) => {
    if (k === '⌫') { setTrays((t) => (t.length > 1 ? t.slice(0, -1) : '')); return; }
    if (k === 'C') { setTrays(''); return; }
    const next = (trays === '' || trays === '0') ? k : trays + k;
    if (next.length > 6) return;
    setTrays(next);
  };
  const pressRef = useRef(press);
  pressRef.current = press;

  const confirmBatch = () => {
    if (!canConfirm) return;
    setBatches((p) => [...p, { boxes, eggs, spec, ts: Date.now() }]);
    setTrays('');
  };
  const confirmRef = useRef(confirmBatch);
  confirmRef.current = confirmBatch;

  // 键盘
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key >= '0' && e.key <= '9') { e.preventDefault(); pressRef.current(e.key); }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); pressRef.current('⌫'); }
      else if (e.key === 'Escape') { e.preventDefault(); pressRef.current('C'); }
      else if (e.key === 'Enter') { e.preventDefault(); confirmRef.current(); }
      else if (e.key === 'Tab') { e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 选任务
  const pickTask = (t: Task) => {
    if (t.taskNo === activeNo) return;
    setActiveNo(t.taskNo);
    setSpec(resolveSpec(packSpecs.map((s) => s.name), t.spec));
    setTrays(''); setBatches([]); setPreQty(0); setMergeNotice(null);
    setPrintedLabelsCount(0);
    // 同等级尾数检测
    const same = remainderTasks.filter((r) => r.grade === t.grade && r.remainderQty > 0);
    if (same.length > 0) {
      const totalQty = same.reduce((s, r) => s + r.remainderQty, 0);
      setMergeNotice({ grade: t.grade, totalQty, count: same.length });
    }
  };

  // 合拼
  const doMerge = async () => {
    if (!mergeNotice) return;
    const g = mergeNotice.grade;
    try {
      const r = await fetch('/api/packaging/tasks/merge-remainder', {
        method: 'POST', headers: hdr(), body: JSON.stringify({ grade: g }),
      });
      const d = await r.json();
      if (d.code === 200 && d.merged_qty > 0) {
        setPreQty((p) => p + d.merged_qty);
        setMergeNotice(null);
        setRemainderTasks((prev) => prev.filter((rem) => !(rem.grade === g && rem.remainderQty > 0)));
      }
    } catch { /* ignore */ }
  };

  // 完成 → 拉 label-info → 打开抽屉
  const complete = async () => {
    if (!cur || totalPacked <= 0) return;
    // A4 修正：移除 PKG- 前缀硬校验。后端 task_no 实际格式为 PACK-... / B-... 不一定 PKG- 开头，
    //         旧 startsWith('PKG-') 会把真实包装任务全拦下来，操作员怎么点都"成功"不了。
    //         任务类型由后端 task_type='PACKING' 决定，不应靠前端字符串前缀判定。
    if (!activeNo) {
      window.alert('请先选择一个包装任务');
      return;
    }
    try {
      const r = await fetch(`/api/packaging/tasks/${activeNo}/label-info?_t=${Date.now()}`, { headers: hdr() });
      const d = await r.json();
      if (d.code === 200 && d.data) {
        setLabelDates({
          produceDate: d.data.produce_date || '',
          expireDate: d.data.expire_date || '',
          priceRetail: d.data.price_retail ?? null,
        });
      }
    } catch { /* ignore */ }
    setLabelCopies(Math.max(1, pendingLabels));
    setDrawer(true);
  };

  // 关闭抽屉
  const closeDrawerAndReset = useCallback(() => {
    setDrawer(false);
    setBatches([]); setTrays(''); setPreQty(0); setMergeNotice(null);
    setPrintedLabelsCount(0);
    loadAll();
    if (!isAdmin && !document.fullscreenElement) {
      requestFullscreen();
    }
  }, [loadAll, isAdmin, requestFullscreen]);

  // 打印
  const doPrint = async () => {
    if (!activeNo) return;
    const today = labelDates.produceDate || new Date().toISOString().slice(0, 10);
    const expiry = labelDates.expireDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const grade = cur?.grade || 'AA';
    const gradeVal = uiLang === 'zh' ? `${grade}级` : uiLang === 'en' ? `Grade ${grade}` : `ຊັ້ນ ${grade}`;
    const specName = spec || '散装整提';
    const batchNo = cur?.batchNo && cur.batchNo !== '—' ? cur.batchNo : 'EGG-PREVIEW';
    // 条码清洗：去前缀 EGG- 和横线，最大化 Code128 数字压缩
    const barcodeData = batchNo.replace(/^[A-Z]+-/, '').replace(/-/g, '');
    const unitQty = specObj?.qty ?? SPEC_QTY(specName);
    const [sw, sh] = (cfg.size || '40×30mm').split('×').map((s) => parseInt(s, 10));
    const W = sw || 40, H = sh || 30;

    // ① 先扣减结单（pack-complete）
    if (sessionPacked > 0) {
      setIsFinalizing(true);
      try {
        const r = await fetch(`/api/packaging/tasks/${activeNo}/pack-complete`, {
          method: 'POST', headers: hdr(),
          body: JSON.stringify({
            packed_qty: sessionPacked,
            output_qty: sessionBoxes,
            pack_spec: spec,
            spec_unit_qty: qty,
          }),
        });
        const d = await r.json();
        if (d.code !== 200) {
          window.alert(d.msg || '结单失败，无法打印');
          setIsFinalizing(false);
          return;
        }
      } catch {
        window.alert('网络错误，结单失败');
        setIsFinalizing(false);
        return;
      }
      setIsFinalizing(false);
    }

    // ② 构造标签 HTML
    const LBL = {
      grade: uiLang === 'zh' ? '等级' : uiLang === 'en' ? 'Grade' : 'ຊັ້ນ',
      spec: uiLang === 'zh' ? '规格' : uiLang === 'en' ? 'Spec' : 'ຂະໜາດ',
      qty: uiLang === 'zh' ? '数量' : uiLang === 'en' ? 'Qty' : 'ຈຳນວນ',
      produced: uiLang === 'zh' ? '生产' : uiLang === 'en' ? 'Prod.' : 'ຜະລິດ',
      consume: uiLang === 'zh' ? '食用' : uiLang === 'en' ? 'Use by' : 'ໃຊ້ໄດ້',
      price: uiLang === 'zh' ? '价格' : uiLang === 'en' ? 'Price' : 'ລາຄາ',
    };
    const unitLabel = eggUnit;
    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" style="height:3.2mm;width:auto;max-width:7mm;object-fit:contain;"/>`
      : '🥚';
    const printBarSVG = generateCode128SVG(barcodeData, { height: 26, moduleWidth: 1.0, showText: false, physicalDpi: 203 });
    const infoRows: string[] = [
      `<div class="row2"><span class="l">${LBL.grade}:</span><span class="v">${gradeVal}</span><span class="l gap">${LBL.qty}:</span><span class="v">${unitQty > 0 ? unitQty + unitLabel : '—'}</span></div>`,
      `<div class="row"><span class="l">${LBL.spec}:</span><span class="v ell">${specName}</span></div>`,
    ];
    if (cfg.showDate || cfg.showExpiry) {
      const cells: string[] = [];
      if (cfg.showDate) cells.push(`<span class="l">${LBL.produced}:</span><span class="v">${today}</span>`);
      if (cfg.showExpiry) cells.push(`<span class="l gap">${LBL.consume}:</span><span class="v">${expiry}</span>`);
      infoRows.push(`<div class="row2">${cells.join('')}</div>`);
    }
    if (cfg.showPrice) {
      infoRows.push(`<div class="row"><span class="l">${LBL.price}:</span><span class="v">¥${labelDates.priceRetail ?? '—'}</span></div>`);
    }
    const singleLabelHtml = `<div class="label"><div class="hdr"><div class="brand">${logoHtml}<span>${companyName}</span></div><span class="badge">${gradeVal}</span></div><div class="bar">${printBarSVG}</div><div class="bar-text">${batchNo}</div><div class="info">${infoRows.join('')}</div></div>`;
    const css = buildLabelCss(W, H);
    const copies = Math.max(1, labelCopies);
    await printLabel({ singleLabelHtml, css, copies, title: '标签打印' });

    // ③ 写审计
    setPrintedLabelsCount((prev) => prev + copies);
    fetch('/api/labels/record', {
      method: 'POST', headers: hdr(),
      body: JSON.stringify({
        code: barcodeData,
        label_type: 'pkg',
        grade_code: grade,
        grade_name: gradeVal,
        pack_name: specName,
        batch_no: batchNo,
        produce_date: today,
        expiry_date: expiry,
        price: labelDates.priceRetail,
        show_price: cfg.showPrice ? 1 : 0,
        show_expiry: cfg.showExpiry ? 1 : 0,
        qty_printed: copies,
        label_w: W,
        label_h: H,
        desc_text: copies > pendingLabels ? '补打/重打(Reprint)' : '正常打印',
      }),
    }).catch(() => {});

    closeDrawerAndReset();
  };

  // 退出登录
  const doLogout = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    try {
      sessionStorage.removeItem('phoenix_token');
      sessionStorage.removeItem('phoenix_user');
    } catch {}
    router.push('/login');
  };

  // ─── 渲染 ──────────────────────────────────────────────────
  const KEYS: string[][] = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['C', '0', '⌫']];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: BG, color: TXT, fontFamily: "'Inter','Noto Sans SC',sans-serif", overflow: 'hidden' }}>
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}.pkg-caret{animation:blink 1s step-end infinite;font-weight:300;margin-left:1px}@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

      {/* HEADER */}
      <div style={{ height: 56, background: '#060c19', borderBottom: '2px solid ' + BOR, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="logo" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 8 }} />
          ) : (
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,rgba(245,158,11,0.2),rgba(245,158,11,0.06))', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🏢</div>
          )}
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: ACC }}>{companyName}</div>
            <div style={{ fontSize: 10, color: MUT }}>{tr('包装终端', 'Packing Terminal', 'ສະຖານີຫຸ້ມຫໍ່')}</div>
          </div>
        </div>

        {isAdmin && (
          <button type="button" onClick={() => router.push('/packaging')}
            style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid #334155', background: CARD, color: MUT, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            <ArrowLeft size={13} /> {tr('返回', 'Back', 'ກັບ')}
          </button>
        )}

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          {cur && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#0c1e38', border: '1px solid #1e3a5f', borderRadius: 28, padding: '6px 18px' }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: ACC }}>{gradeLabel(cur.grade)}</span>
              <span style={{ width: 1, height: 14, background: BOR }} />
              <span style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>{cur.taskNo}</span>
              <span style={{ width: 1, height: 14, background: BOR }} />
              <span style={{ fontSize: 12, color: MUT }}>
                {tr('计划', 'Plan', 'ແຜນ')}{' '}
                <strong style={{ color: preQty > 0 ? '#fbbf24' : TXT, fontWeight: 800 }}>{effectivePlan.toLocaleString()}</strong> {eggUnit}
                {preQty > 0 && <span style={{ fontSize: 9, color: '#92400e', marginLeft: 4 }}>({cur.planQty}+{preQty})</span>}
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* 操作员 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 10px 4px 4px', borderRadius: 20, background: 'rgba(51,65,85,0.4)', border: '1px solid #334155' }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff' }}>
              {(user.realNameZh || user.username || '?').charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>{user.realNameZh || user.username || '—'}</span>
          </div>
          {/* 语言切换 */}
          <div style={{ display: 'flex', gap: 3, background: 'rgba(15,23,42,0.6)', border: '1px solid ' + BOR, borderRadius: 12, padding: 3 }}>
            {(['zh', 'lo', 'en'] as const).map((k) => {
              const labels = { zh: '中', lo: 'ລາວ', en: 'EN' };
              const active = cfg.lang === k;
              return (
                <button type="button" key={k} onClick={() => saveCfg({ ...cfg, lang: k })}
                  style={{ height: 30, minWidth: 44, padding: '0 6px', borderRadius: 9, border: 'none', cursor: 'pointer', background: active ? 'linear-gradient(135deg,rgba(245,158,11,0.25),rgba(245,158,11,0.1))' : 'transparent', color: active ? ACC : MUT, fontSize: 12, fontWeight: active ? 800 : 500, outline: active ? '1px solid rgba(245,158,11,0.4)' : 'none' }}>
                  {labels[k]}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={loadAll} title="刷新"
            style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid ' + BOR, background: CARD, color: MUT, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <RefreshCw size={15} />
          </button>
          <button type="button" onClick={() => { setLabelCopies(Math.max(1, pendingLabels)); setDrawer(true); }} title="标签设置"
            style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid ' + BOR, background: CARD, color: MUT, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Tag size={15} />
          </button>
          {!isAdmin && (
            <button type="button" onClick={() => setShowLogoutConfirm(true)}
              style={{ height: 36, padding: '0 14px', borderRadius: 10, border: '1px solid #991b1b', background: 'linear-gradient(135deg,#7f1d1d,#991b1b)', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              <LogOut size={14} /> {tr('退出', 'Logout', 'ອອກ')}
            </button>
          )}
        </div>
      </div>

      {/* BODY */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* LEFT: 任务队列 */}
        <div style={{ width: 192, background: '#060b18', borderRight: '2px solid ' + BOR, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid ' + BOR, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: MUT, letterSpacing: 1 }}>{loading ? tr('加载中…', 'Loading…', 'ກຳລັງໂຫຼດ...') : tr('任务队列', 'Task Queue', 'ລາຍການວຽກ')}</span>
            {!loading && <span style={{ fontSize: 11, fontWeight: 800, color: ACC, background: '#fef3c7', padding: '2px 8px', borderRadius: 10 }}>{tasks.length}</span>}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
            {tasks.map((t) => {
              const a = t.taskNo === activeNo;
              const livePacked = a ? totalPacked : t.packedQty;
              const ePlan = a ? effectivePlan : t.planQty;
              const tPct = ePlan > 0 ? Math.round((livePacked / ePlan) * 100) : 0;
              const dispQty = a ? Math.max(0, ePlan - totalPacked) : t.planQty;
              return (
                <div key={t.taskNo} onClick={() => pickTask(t)}
                  style={{ position: 'relative', padding: '12px 12px 10px 16px', marginBottom: 6, borderRadius: 12, cursor: 'pointer', background: a ? 'rgba(30,58,95,0.8)' : CARD, border: '1.5px solid ' + (a ? ACC : BOR) }}>
                  {a && <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2, background: ACC }} />}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: a ? ACC : TXT }}>{gradeLabel(t.grade)}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: a ? (tPct >= 100 ? GRN : ACC) : TXT }}>
                      {dispQty.toLocaleString()}
                      <span style={{ fontSize: 11, fontWeight: 400, color: MUT, marginLeft: 2 }}>{eggUnit}</span>
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(51,65,85,0.6)', borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, width: Math.min(tPct, 100) + '%', background: tPct >= 100 ? GRN : `linear-gradient(90deg,${ACC},${GRN})` }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>{t.taskNo}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: tPct >= 100 ? GRN : a ? ACC : MUT }}>{tPct}%</span>
                  </div>
                </div>
              );
            })}
            {tasks.length === 0 && !loading && (
              <div style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 28, opacity: 0.3 }}>📋</div>
                <div style={{ fontSize: 11, color: '#334155', marginTop: 6 }}>{tr('暂无任务', 'No tasks', 'ບໍ່ມີວຽກ')}</div>
              </div>
            )}
            {/* 尾数待合拼 */}
            {remainderTasks.length > 0 && (
              <>
                <div style={{ height: 1, background: 'rgba(245,158,11,0.25)', margin: '6px 8px' }} />
                <div style={{ fontSize: 9, color: '#92400e', fontWeight: 800, letterSpacing: 0.8, padding: '0 12px 4px' }}>
                  {tr('⏳ 尾数·待合拼', '⏳ Tail Pending', '⏳ ລໍຖ້າລວມ')}
                </div>
                {remainderTasks.map((r) => (
                  <div key={r.taskNo} style={{ padding: '8px 12px', marginBottom: 4, borderRadius: 10, background: 'rgba(146,64,14,0.18)', border: '1.5px solid rgba(245,158,11,0.35)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b' }}>{gradeLabel(r.grade)}</span>
                      <span style={{ fontSize: 13, fontWeight: 900, color: '#fbbf24' }}>{r.remainderQty.toLocaleString()}<span style={{ fontSize: 10, color: '#92400e', marginLeft: 2 }}>{eggUnit}</span></span>
                    </div>
                    <div style={{ fontSize: 9, color: '#a16207' }}>
                      {tr('▸ 选中同等级新任务时自动提示合拼', '▸ Auto-merge on next same-grade task', '▸ ຈະລວມໃນວຽກເກຣດດຽວກັນ')}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* RIGHT: 主区 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!cur ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
              <div style={{ width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg,rgba(30,58,95,0.6),rgba(15,23,42,0.8))', border: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>📦</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#475569', marginBottom: 8 }}>
                  {loading ? tr('加载中…', 'Loading…', 'ກຳລັງໂຫຼດ...') : tasks.length === 0 ? tr('暂无包装任务', 'No packaging tasks', 'ບໍ່ມີວຽກຫຸ້ມຫໍ່') : tr('← 选择一个任务开始', '← Select a task', '← ເລືອກວຽກ')}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* 合拼横幅 */}
              {mergeNotice && (
                <div style={{ padding: '0 16px', paddingTop: 8 }}>
                  <div style={{ background: 'rgba(120,53,15,0.35)', border: '1.5px solid #d97706', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 20 }}>🔀</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24', marginBottom: 2 }}>
                        {tr(`发现 ${mergeNotice.totalQty.toLocaleString()} 枚同等级尾数（${mergeNotice.count} 条），是否立即合拼？`, `Found ${mergeNotice.totalQty} pcs tail — merge now?`, `ພົບ ${mergeNotice.totalQty.toLocaleString()} ໜ່ວຍສ່ວນໄວ້ — ລວມເລົຍ?`)}
                      </div>
                    </div>
                    <button type="button" onClick={() => setMergeNotice(null)} style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #78350f', background: 'rgba(120,53,15,0.3)', color: '#a16207', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      {tr('忽略', 'Skip', 'ຂ້າມ')}
                    </button>
                    <button type="button" onClick={doMerge} style={{ height: 34, padding: '0 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#d97706,#b45309)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                      {tr(`⊕ 立即合拼 ${mergeNotice.totalQty.toLocaleString()} 枚`, `⊕ Merge ${mergeNotice.totalQty} pcs`, `⊕ ລວມ ${mergeNotice.totalQty.toLocaleString()} ໜ່ວຍ`)}
                    </button>
                  </div>
                </div>
              )}
              {preQty > 0 && !mergeNotice && (
                <div style={{ padding: '6px 16px 0' }}>
                  <div style={{ background: 'rgba(21,128,61,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: '5px 12px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>
                      {tr(`已合拼尾数 +${preQty.toLocaleString()} 枚`, `Merged +${preQty} pcs tail`, `ລວມແລ້ວ +${preQty.toLocaleString()} ໜ່ວຍ`)}
                    </span>
                  </div>
                </div>
              )}

              {/* SPEC STRIP */}
              <div style={{ padding: '8px 16px', borderBottom: '2px solid ' + BOR, background: '#080e1e', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 52 }}>
                <span style={{ fontSize: 11, color: '#475569', fontWeight: 700 }}>{tr('规格', 'Spec', 'ຂະໜາດ')}</span>
                {packSpecs.map((s) => {
                  const active = s.name === spec;
                  return (
                    <button type="button" key={s.name} onClick={() => setSpec(s.name)}
                      style={{ border: '2px solid ' + (active ? ACC : BOR), fontSize: 13, padding: '0 18px', height: 40, borderRadius: 20, fontWeight: active ? 800 : 500, cursor: 'pointer', background: active ? 'rgba(245,158,11,0.15)' : CARD, color: active ? ACC : MUT }}>
                      {s.name}
                    </button>
                  );
                })}
              </div>

              {/* CENTER */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 24px', gap: 40 }}>
                {/* 输入区 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 460 }}>
                  {/* 托数（编辑） */}
                  <div style={{ height: 130, background: CARD, borderRadius: 18, border: '3px solid ' + ACC, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 12, left: 16, fontSize: 11, color: ACC, fontWeight: 700 }}>{tr('托 / 箱数', 'Tray / Box', 'ຖາດ / ກ່ອງ')}</div>
                    <div style={{ fontSize: (trays || '').length > 6 ? 44 : (trays || '').length > 4 ? 60 : 80, fontWeight: 900, fontFamily: 'monospace', color: ACC, display: 'flex' }}>
                      <span style={{ opacity: trays ? 1 : 0.3 }}>{trays || '0'}</span>
                      <span className="pkg-caret" style={{ color: ACC, fontSize: '0.85em' }}>|</span>
                    </div>
                    <div style={{ position: 'absolute', bottom: 10, right: 16, fontSize: 12, color: MUT, fontWeight: 600 }}>{trayUnit}</div>
                  </div>
                  {/* 公式 */}
                  <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    <span style={{ fontSize: 18, color: '#475569' }}>×</span>
                    <span style={{ fontSize: 26, fontWeight: 900, color: '#60a5fa' }}>{qty || '—'}</span>
                    <span style={{ fontSize: 18, color: '#475569' }}>=</span>
                    <span style={{ fontSize: 22, fontWeight: 900, color: eggs > 0 ? '#818cf8' : MUT, minWidth: 80 }}>
                      {eggs > 0 ? eggs.toLocaleString() : '—'}
                      {eggs > 0 && <span style={{ fontSize: 13, color: MUT, marginLeft: 4 }}>{eggUnit}</span>}
                    </span>
                  </div>
                  {/* 鸡蛋数量（只读） */}
                  <div style={{ height: 110, background: wouldExceed ? 'rgba(127,29,29,0.2)' : CARD, borderRadius: 18, border: '2px solid ' + (wouldExceed ? '#ef4444' : 'rgba(51,65,85,0.5)'), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 10, left: 16, fontSize: 11, color: wouldExceed ? '#f87171' : MUT, fontWeight: 700 }}>{tr('鸡蛋数量', 'Egg Count', 'ຈຳນວນໄຂ່')}</div>
                    <div style={{ position: 'absolute', top: 10, right: 16, fontSize: 9, color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>= AUTO</div>
                    <div style={{ fontSize: String(eggs || '').length > 6 ? 44 : String(eggs || '').length > 4 ? 60 : 80, fontWeight: 900, fontFamily: 'monospace', color: wouldExceed ? '#ef4444' : eggs > 0 ? '#818cf8' : MUT }}>
                      <span style={{ opacity: eggs > 0 ? 1 : 0.3 }}>{eggs > 0 ? eggs : '—'}</span>
                    </div>
                    <div style={{ position: 'absolute', bottom: 8, right: 16, fontSize: 12, color: MUT, fontWeight: 600 }}>{eggUnit}</div>
                  </div>
                  {/* 状态提示 */}
                  <div style={{ height: 40, display: 'flex', alignItems: 'center' }}>
                    {wouldExceed ? (
                      <div style={{ width: '100%', background: 'rgba(127,29,29,0.25)', border: '1.5px solid #b91c1c', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#fca5a5' }}>
                        {tr(`⚠ 超出！剩余 ${remaining} 枚，超 ${eggs - remaining} 枚`, `⚠ Exceeds! Rem. ${remaining}, over ${eggs - remaining}`, `⚠ ເກີນ! ຍັງ ${remaining}, ເກີນ ${eggs - remaining}`)}
                      </div>
                    ) : planFull ? (
                      <div style={{ width: '100%', background: 'rgba(21,128,61,0.2)', border: '1.5px solid #16a34a', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#4ade80' }}>
                        {tr('✓ 已装满，请结单', '✓ Full! Please close', '✓ ເຕັມ!')}
                      </div>
                    ) : belowUnit ? (
                      <div style={{ width: '100%', background: 'rgba(146,64,14,0.25)', border: '1.5px solid #d97706', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>
                        {tr(`⚠ 不满一${trayUnit}，还差 ${qty - eggs} 枚`, `⚠ Short, need ${qty - eggs} more`, `⚠ ຂາດ ${qty - eggs} ໜ່ວຍ`)}
                      </div>
                    ) : canConfirm ? (
                      <div style={{ width: '100%', background: 'rgba(21,128,61,0.15)', border: '1.5px solid rgba(34,197,94,0.4)', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#86efac' }}>
                        {tr(`✓ ${boxes}托 × ${qty} = ${eggs.toLocaleString()}枚，剩 ${remaining - eggs}`, `✓ ${boxes}×${qty}=${eggs}, left ${remaining - eggs}`, `✓ ${boxes}×${qty}=${eggs}`)}
                      </div>
                    ) : (
                      <div style={{ width: '100%', textAlign: 'center', fontSize: 12, color: '#475569' }}>{tr('请输入托数或枚数', 'Enter tray count', 'ກະລຸນາໃສ່ຈຳນວນ')}</div>
                    )}
                  </div>
                  {/* 确认入账 */}
                  <button type="button" onClick={confirmBatch} disabled={!canConfirm}
                    style={{ height: 62, fontSize: 17, fontWeight: 800, borderRadius: 16, border: canConfirm ? 'none' : '1px solid #334155', cursor: canConfirm ? 'pointer' : 'not-allowed', background: canConfirm ? 'linear-gradient(135deg,#3b82f6,#1d4ed8)' : 'rgba(30,41,59,0.6)', color: canConfirm ? TXT : '#475569', boxShadow: canConfirm ? '0 8px 24px rgba(59,130,246,.4)' : 'none', opacity: canConfirm ? 1 : 0.6 }}>
                    {canConfirm ? tr(`＋ 确认入账 ${eggs.toLocaleString()} 枚`, `＋ Confirm ${eggs} pcs`, `＋ ຢືນຢັນ ${eggs}`) : tr('输入有效数量后可确认', 'Enter valid quantity', 'ໃສ່ຈຳນວນກ່ອນ')}
                  </button>
                  {/* 已确认批次 */}
                  {batches.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {[...batches].reverse().slice(0, 4).map((b) => (
                        <div key={b.ts} style={{ background: 'rgba(30,41,59,0.8)', borderRadius: 8, padding: '4px 10px', fontSize: 11, border: '1px solid #334155' }}>
                          <span style={{ color: '#94a3b8' }}>{b.boxes}{tr('托', 'tray', 'ຖາດ')}</span>{' '}
                          <span style={{ color: GRN, fontWeight: 700 }}>+{b.eggs.toLocaleString()}{eggUnit}</span>
                        </div>
                      ))}
                      {batches.length > 4 && <span style={{ fontSize: 11, color: MUT, alignSelf: 'center' }}>…共{batches.length}批</span>}
                    </div>
                  )}
                </div>

                {/* NUMPAD */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,130px)', gridTemplateRows: 'repeat(4,130px)', gap: 10 }}>
                  {KEYS.flatMap((row, ri) => row.map((k) => {
                    const isC = k === 'C', isDel = k === '⌫';
                    const id = ri + '-' + k;
                    const pressed = pressedKey === id;
                    const normalBg = isC ? 'linear-gradient(145deg,#7f1d1d,#6b1919)' : isDel ? 'linear-gradient(145deg,#1e3a5f,#162d4a)' : 'linear-gradient(145deg,#1e2d3d,#172333)';
                    const pressedBg = isC ? '#dc2626' : isDel ? '#2563eb' : '#3b82f6';
                    const normalFg = isC ? '#fca5a5' : isDel ? '#93c5fd' : TXT;
                    return (
                      <button type="button" key={id}
                        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setPressedKey(id); press(k); }}
                        onPointerUp={() => setPressedKey('')} onPointerCancel={() => setPressedKey('')} onPointerLeave={() => setPressedKey('')}
                        style={{ border: 'none', cursor: 'pointer', fontWeight: 900, borderRadius: 20, background: pressed ? pressedBg : normalBg, color: pressed ? '#fff' : normalFg, fontSize: 40, boxShadow: pressed ? `0 0 24px ${pressedBg}88` : '0 6px 16px rgba(0,0,0,.5)', transform: pressed ? 'scale(0.88)' : 'scale(1)', transition: pressed ? 'none' : 'transform .14s cubic-bezier(.34,1.56,.64,1)' }}>
                        {k}
                      </button>
                    );
                  }))}
                </div>
              </div>

              {/* STATUS BAR */}
              <div style={{ height: 60, background: '#060c19', borderTop: '2px solid ' + BOR, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 28 }}>
                {[
                  [tr('总托数', 'Trays', 'ຖາດທັງໝົດ'), sessionBoxes + tr('托', 'tray', 'ຖາດ'), TXT],
                  [tr('总蛋数', 'Total Eggs', 'ໄຂ່ທັງໝົດ'), totalPacked.toLocaleString() + eggUnit, TXT],
                  [tr('剩余', 'Remaining', 'ຍັງເຫຼືອ'), remaining.toLocaleString() + eggUnit, remaining > 0 ? '#fb923c' : GRN],
                  [tr('完成率', 'Progress', 'ຄວາມຄືບໜ້າ'), pct + '%', pct >= 100 ? GRN : ACC],
                ].map(([l, v, c]) => (
                  <div key={l as string} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>{l}</span>
                    <span style={{ fontSize: 22, fontWeight: 900, color: c as string, lineHeight: 1 }}>{v}</span>
                  </div>
                ))}
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 160, height: 8, background: 'rgba(30,41,59,0.8)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: Math.min(100, pct) + '%', background: pct >= 100 ? GRN : `linear-gradient(90deg,${ACC},${GRN})` }} />
                  </div>
                  <span style={{ fontSize: 12, color: MUT, fontWeight: 600, minWidth: 30 }}>{pct}%</span>
                </div>
                <button type="button" onClick={complete} disabled={totalPacked <= 0}
                  style={{ height: 48, padding: '0 28px', fontSize: 16, fontWeight: 800, borderRadius: 16, border: totalPacked > 0 ? 'none' : '1px solid #334155', cursor: totalPacked > 0 ? 'pointer' : 'not-allowed', background: totalPacked > 0 ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'rgba(30,41,59,0.6)', color: totalPacked > 0 ? TXT : '#475569', boxShadow: totalPacked > 0 ? '0 4px 20px rgba(22,163,74,.4)' : 'none', opacity: totalPacked > 0 ? 1 : 0.6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle size={18} /> {tr('预览与打印标签', 'Preview & Print', 'ຕົວຢ່າງ & ພິມ')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* KIOSK 全屏遮罩 */}
      {!isAdmin && !isFullscreen && !isPrinting && (
        <div onClick={requestFullscreen}
          style={{ position: 'fixed', inset: 0, background: 'rgba(7,13,26,0.98)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 20 }}>
          <div style={{ fontSize: 72 }}>⛶</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: TXT }}>{tr('点击屏幕进入全屏工作模式', 'Touch to Enter Fullscreen', 'ກົດເພື່ອເຕັມຈໍ')}</div>
          <div style={{ marginTop: 12, padding: '10px 28px', background: '#fef3c7', border: '1.5px solid rgba(245,158,11,0.4)', borderRadius: 24, fontSize: 13, fontWeight: 700, color: ACC }}>
            {tr('触摸或点击任意位置继续', 'Tap anywhere to continue', 'ກົດເພື່ອສືບຕໍ່')}
          </div>
        </div>
      )}

      {/* LABEL DRAWER */}
      {drawer && (
        <>
          <div onClick={closeDrawerAndReset} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, background: '#0f172a', borderLeft: '1px solid ' + BOR, zIndex: 201, display: 'flex', flexDirection: 'column', animation: 'slideIn .25s ease' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid ' + BOR, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}><Tag size={14} style={{ marginRight: 6, color: ACC }} /> {tr('标签 & 打印', 'Label & Print', 'ປ້າຍ & ພິມ')}</span>
              <button type="button" onClick={closeDrawerAndReset} style={{ background: 'none', border: 'none', color: MUT, cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* 预览 */}
              <section>
                <div style={{ fontSize: 11, fontWeight: 700, color: MUT, marginBottom: 10 }}>{tr('标签预览', 'Label Preview', 'ຕົວຢ່າງປ້າຍ')}</div>
                <div style={{ background: '#1e293b', borderRadius: 12, padding: 12, border: '1px solid #334155' }}>
                  <LabelPreview
                    width={280} height={210}
                    grade={cur?.grade || 'AA'}
                    gradeLabel={(cur?.grade && uiLang === 'zh' ? cur.grade + '级' : cur?.grade && uiLang === 'en' ? `Grade ${cur.grade}` : `ຊັ້ນ ${cur?.grade || 'AA'}`)}
                    specName={spec || '散装整提'}
                    unitQty={specObj?.qty ?? SPEC_QTY(spec)}
                    batchNo={cur?.batchNo && cur.batchNo !== '—' ? cur.batchNo : 'EGG-PREVIEW'}
                    today={labelDates.produceDate || new Date().toISOString().slice(0, 10)}
                    expiry={labelDates.expireDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}
                    price={labelDates.priceRetail}
                    showDate={cfg.showDate} showExpiry={cfg.showExpiry} showPrice={cfg.showPrice}
                    lang={uiLang}
                    logoUrl={logoUrl} companyName={companyName}
                  />
                </div>
                <div style={{ textAlign: 'center', fontSize: 10, color: MUT, marginTop: 6 }}>{cfg.size}</div>
              </section>
              {/* 份数 */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f172a', border: '1.5px solid #334155', borderRadius: 10, padding: '8px 14px' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>{tr('打印标签数', 'Labels to Print', 'ຈຳນວນປ້າຍ')}</div>
                    <div style={{ fontSize: 10, color: '#475569' }}>{tr('自动 = 总托数', '(auto = total trays)', '(ອັດຕະໂນມັດ)')}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" onClick={() => setLabelCopies((n) => Math.max(1, n - 1))} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', fontSize: 18, cursor: 'pointer', fontWeight: 700 }}>−</button>
                    <span style={{ fontSize: 20, fontWeight: 900, color: '#f8fafc', minWidth: 36, textAlign: 'center' }}>{labelCopies}</span>
                    <button type="button" onClick={() => setLabelCopies((n) => n + 1)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', fontSize: 18, cursor: 'pointer', fontWeight: 700 }}>＋</button>
                  </div>
                </div>
              </section>
              {/* 字段开关 */}
              <section>
                <div style={{ fontSize: 11, fontWeight: 700, color: MUT, marginBottom: 10 }}>{tr('标签字段', 'Label Fields', 'ຂໍ້ມູນໃນປ້າຍ')}</div>
                {([
                  ['showDate', tr('显示生产日期', 'Show Prod. Date', 'ສະແດງວັນຜະລິດ')],
                  ['showExpiry', tr('显示食用期', 'Show Exp. Date', 'ສະແດງໃຊ້ໄດ້ຮອດ')],
                  ['showPrice', tr('显示零售价', 'Show Price', 'ສະແດງລາຄາ')],
                ] as const).map(([k, l]) => (
                  <div key={k} onClick={() => saveCfg({ ...cfg, [k]: !cfg[k as keyof CfgState] } as CfgState)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', marginBottom: 5, borderRadius: 8, cursor: 'pointer', background: CARD, border: '1px solid ' + BOR }}>
                    <span style={{ fontSize: 13 }}>{l}</span>
                    <div style={{ width: 38, height: 20, borderRadius: 10, background: cfg[k as keyof CfgState] ? ACC : BOR, position: 'relative' }}>
                      <div style={{ position: 'absolute', top: 2, left: cfg[k as keyof CfgState] ? 19 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                    </div>
                  </div>
                ))}
              </section>
              {/* 打印按钮 */}
              <button type="button" onClick={doPrint} disabled={isFinalizing}
                style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 10, cursor: isFinalizing ? 'not-allowed' : 'pointer', background: isFinalizing ? '#9ca3af' : (labelCopies > pendingLabels ? 'linear-gradient(135deg,#d97706,#f59e0b)' : 'linear-gradient(135deg,#16a34a,#15803d)'), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: isFinalizing ? 'none' : '0 3px 12px rgba(22,163,74,.35)' }}>
                <Printer size={14} />
                {isFinalizing
                  ? tr('正在入账扣减...', 'Saving...', 'ກຳລັງບັນທຶກ...')
                  : labelCopies > pendingLabels
                    ? tr(`⚠️ 补打 ${labelCopies} 张`, `⚠️ Reprint ${labelCopies}`, `⚠️ ພິມຄືນ ${labelCopies}`)
                    : tr(`打印并入账结单 · ${labelCopies} 张`, `Print & Finalize · ${labelCopies}`, `ພິມ ແລະ ສຳເລັດ · ${labelCopies}`)}
              </button>
            </div>
          </div>
        </>
      )}

      {/* 退出登录确认 */}
      {showLogoutConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: CARD, borderRadius: 16, padding: 24, width: 360, border: '1px solid ' + BOR }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: TXT, marginBottom: 8 }}>🚪 {tr('确认退出登录？', 'Confirm Logout?', 'ຢືນຢັນອອກ?')}</div>
            <div style={{ fontSize: 13, color: MUT, marginBottom: 20 }}>{tr('退出后需重新登录', 'You need to login again', 'ຕ້ອງເຂົ້າລະບົບໃໝ່')}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setShowLogoutConfirm(false)} style={{ flex: 1, height: 40, borderRadius: 10, border: '1px solid ' + BOR, background: 'transparent', color: TXT, cursor: 'pointer', fontWeight: 600 }}>
                {tr('取消', 'Cancel', 'ຍົກເລີກ')}
              </button>
              <button type="button" onClick={doLogout} style={{ flex: 1, height: 40, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7f1d1d,#991b1b)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                {tr('确认退出', 'Confirm', 'ຢືນຢັນ')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 标签预览组件（内嵌）───────────────────────────────────────
interface LabelPreviewProps {
  width: number; height: number;
  grade: string; gradeLabel: string;
  specName: string; unitQty: number;
  batchNo: string; today: string; expiry: string; price: number | null;
  showDate: boolean; showExpiry: boolean; showPrice: boolean;
  lang: 'zh' | 'lo' | 'en';
  logoUrl: string; companyName: string;
}
function LabelPreview(p: LabelPreviewProps) {
  const barcodeData = p.batchNo.replace(/^[A-Z]+-/, '').replace(/-/g, '');
  const barSVG = generateCode128SVG(barcodeData, { height: 44, moduleWidth: 1.2, showText: false, responsive: true });
  const unitLabel = p.lang === 'zh' ? '枚' : p.lang === 'en' ? 'pcs' : 'ໜ່ວຍ';
  const LBL = {
    grade: p.lang === 'zh' ? '等级' : p.lang === 'en' ? 'Grade' : 'ຊັ້ນ',
    spec: p.lang === 'zh' ? '规格' : p.lang === 'en' ? 'Spec' : 'ຂະໜາດ',
    qty: p.lang === 'zh' ? '数量' : p.lang === 'en' ? 'Qty' : 'ຈຳນວນ',
    produced: p.lang === 'zh' ? '生产' : p.lang === 'en' ? 'Prod.' : 'ຜະລິດ',
    consume: p.lang === 'zh' ? '食用' : p.lang === 'en' ? 'Use by' : 'ໃຊ້ໄດ້',
    price: p.lang === 'zh' ? '价格' : p.lang === 'en' ? 'Price' : 'ລາຄາ',
  };
  return (
    <div style={{ width: p.width, height: p.height, background: '#fff', color: '#000', borderRadius: 6, overflow: 'hidden', fontFamily: '"Noto Sans SC","Noto Sans Lao",Arial,sans-serif', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 12px rgba(0,0,0,.35)' }}>
      <div style={{ height: 45, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', borderBottom: '1px solid #000', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {p.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.logoUrl} alt="" style={{ height: 22, width: 'auto', maxWidth: 50, objectFit: 'contain' }} />
            : <span style={{ fontSize: 18 }}>🥚</span>}
          <span style={{ fontWeight: 800, fontSize: 13 }}>{p.companyName}</span>
        </div>
        <span style={{ background: '#000', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>{p.gradeLabel}</span>
      </div>
      <div style={{ height: 75, padding: '6px 0 0', display: 'flex', justifyContent: 'center' }}>
        <div style={{ height: '100%' }} dangerouslySetInnerHTML={{ __html: barSVG }} />
      </div>
      <div style={{ textAlign: 'center', fontFamily: 'Arial,sans-serif', fontSize: 10, fontWeight: 700, borderBottom: '1px solid #000', paddingBottom: 2 }}>{p.batchNo}</div>
      <div style={{ flex: 1, padding: '5px 10px', display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ color: '#000', fontWeight: 700, fontSize: 10 }}>{LBL.grade}:</span><strong>{p.gradeLabel}</strong>
          <span style={{ color: '#000', fontWeight: 700, fontSize: 10, marginLeft: 4 }}>{LBL.qty}:</span><strong>{p.unitQty > 0 ? `${p.unitQty}${unitLabel}` : '—'}</strong>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
          <span style={{ color: '#000', fontWeight: 700, fontSize: 10 }}>{LBL.spec}:</span>
          <span style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.specName}</span>
        </div>
        {(p.showDate || p.showExpiry) && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
            {p.showDate && <><span style={{ color: '#000', fontWeight: 700, fontSize: 10 }}>{LBL.produced}:</span><strong>{p.today}</strong></>}
            {p.showExpiry && <><span style={{ color: '#000', fontWeight: 700, fontSize: 10, marginLeft: 4 }}>{LBL.consume}:</span><strong>{p.expiry}</strong></>}
          </div>
        )}
        {p.showPrice && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
            <span style={{ color: '#000', fontWeight: 700, fontSize: 10 }}>{LBL.price}:</span>
            <strong>¥{p.price ?? '—'}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
