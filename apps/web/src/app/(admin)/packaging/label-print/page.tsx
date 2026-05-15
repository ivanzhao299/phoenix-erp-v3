'use client';
/**
 * 独立标签打印页
 * 移植自 V2 phoenix-frontend/src/pages/packaging/LabelPrint.jsx
 * URL 参数：?task_no=&grade=&batch_no=&qty=&pack_spec=&autoprint=1
 * 复用 V3 抽象：barcode.ts / printLabel / buildLabelCss
 */
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronDown, ChevronUp, Printer } from 'lucide-react';
import { useBrand } from '@/contexts/BrandContext';
import { generateCode128SVG } from '@/lib/barcode';
import { generateQrSVG } from '@/lib/qrcode';
import { buildLabelCss, printLabel } from '@/components/packaging/printLabel';

const BG = '#0f172a', CARD = '#1e293b', BOR = '#334155';
const ACC = '#f59e0b', TXT = '#f1f5f9', MUT = '#94a3b8';
const STORAGE_KEY = 'phoenix_label_template';
const tok = () => (typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') || '' : '');
const hdr = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok() });

type Lang = 'zh' | 'en' | 'lo';
const LD: Record<Lang, Record<string, string>> = {
  zh: { product: '品名', grade: '等级', spec: '规格', date: '生产日期', expiry: '食用期', price: '零售价', batch: '批次', productName: '凤凰鲜鸡蛋', pcs: '枚' },
  en: { product: 'Product', grade: 'Grade', spec: 'Spec', date: 'Prod.Date', expiry: 'Best By', price: 'Price', batch: 'Batch', productName: 'Phoenix Fresh Eggs', pcs: 'pcs' },
  lo: { product: 'ຊື່ສິນຄ້າ', grade: 'ຄຸນນະພາບ', spec: 'ຂະໜາດ', date: 'ວັນຜະລິດ', expiry: 'ໝົດອາຍຸ', price: 'ລາຄາ', batch: 'ລ໋ອດ', productName: 'ໄຂ່ສົດຟີນິກ', pcs: 'ໜ່ວຍ' },
};

interface GradeDef { code: string; nameZh?: string; nameEn?: string; nameLo?: string; weightRange?: string; shelfDays?: number }
interface PackSpec { name: string; qty: number; unit?: string }
interface TplState {
  brandName: string;
  logoBase64: string;
  lang: Lang;
  showBatchNo: boolean;
  showMfgDate: boolean;
  showExpiry: boolean;
  showPrice: boolean;
  showQr: boolean;
}
interface LabelVals { date: string; expiry: string; batchNo: string; price: string }

// C4: FALLBACK 仅用于字典加载失败时给出最小可用集合，应该尽量贴近 sys_dict.PKG_EGG_GRADE
// 真实运行时这些值会被 /api/packaging/grade-config 返回的字典覆盖
const FALLBACK_GRADES: GradeDef[] = [
  { code: 'XL', nameZh: '特大号', nameEn: 'Extra Large', nameLo: 'ໃຫຍ່ພິເສດ', weightRange: '≥66g',  shelfDays: 7 },
  { code: 'L',  nameZh: '大号',   nameEn: 'Large',       nameLo: 'ໃຫຍ່',       weightRange: '60-65g', shelfDays: 7 },
  { code: 'M',  nameZh: '中号',   nameEn: 'Medium',      nameLo: 'ກາງ',        weightRange: '53-59g', shelfDays: 7 },
  { code: 'S',  nameZh: '小号',   nameEn: 'Small',       nameLo: 'ນ້ອຍ',       weightRange: '<53g',  shelfDays: 7 },
];

const DEFAULT_TPL: TplState = {
  brandName: '金凤凰鲜蛋', logoBase64: '', lang: 'zh',
  showBatchNo: true, showMfgDate: true, showExpiry: true, showPrice: false, showQr: true,
};

const addDays = (s: string, n: number): string => {
  const d = new Date(s || Date.now());
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const gradeLabelOf = (g: GradeDef | null, l: Lang): string =>
  !g ? '—' : l === 'en' ? (g.nameEn || g.code) : l === 'lo' ? (g.nameLo || g.code) : (g.nameZh || g.code);
const specLabelOf = (s: PackSpec | null): string => !s ? '—' : s.name;

export default function LabelPrintRoute() {
  return (
    <Suspense fallback={<div style={{ background: BG, color: TXT, height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</div>}>
      <LabelPrintPage />
    </Suspense>
  );
}

function LabelPrintPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const { brand } = useBrand();
  const companyName = brand.company_name || '凤凰农业';
  const logoUrl = brand.logo_url || '';

  const [labelW, setLabelW] = useState<number>(() => Number((typeof window !== 'undefined' && localStorage.getItem('lbl_w')) || 60));
  const [labelH, setLabelH] = useState<number>(() => Number((typeof window !== 'undefined' && localStorage.getItem('lbl_h')) || 40));
  const saveSize = (w: number, h: number) => {
    setLabelW(w); setLabelH(h);
    try { localStorage.setItem('lbl_w', String(w)); localStorage.setItem('lbl_h', String(h)); } catch {}
  };

  const [tpl, setTpl] = useState<TplState>(() => {
    if (typeof window === 'undefined') return DEFAULT_TPL;
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<TplState>;
      return { ...DEFAULT_TPL, ...raw };
    } catch { return DEFAULT_TPL; }
  });
  const updateTpl = (patch: Partial<TplState>) => {
    const next = { ...tpl, ...patch };
    setTpl(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  };

  const [grade, setGrade] = useState<GradeDef>(FALLBACK_GRADES[1]);
  const [gradeDefs, setGradeDefs] = useState<GradeDef[]>(FALLBACK_GRADES);
  const [pack, setPack] = useState<PackSpec | null>(null);
  const [packSpecs, setPackSpecs] = useState<PackSpec[]>([]);
  const [vals, setVals] = useState<LabelVals>({ date: '', expiry: '', batchNo: '', price: '' });
  const [printQty, setPrintQty] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [printCount, setPrintCount] = useState(0);
  const [showReprintModal, setShowReprintModal] = useState(false);
  const [reprintReason, setReprintReason] = useState('');
  const autoFiredRef = useRef(false);
  const taskNo = sp.get('task_no') || '';

  useEffect(() => {
    fetch('/api/packaging/grade-config', { headers: hdr() })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.grades) && d.grades.length) {
          const mapped: GradeDef[] = d.grades.map((g: { code: string; name?: string; nameZh?: string; nameEn?: string; nameLo?: string; weightRange?: string; shelf_life_days?: number; shelfDays?: number }) => ({
            code: g.code,
            nameZh: g.nameZh || g.name || g.code,
            nameEn: g.nameEn || g.code,
            nameLo: g.nameLo || g.nameZh || g.code,
            weightRange: g.weightRange,
            shelfDays: g.shelf_life_days || g.shelfDays || 7,
          }));
          setGradeDefs(mapped);
          const urlG = sp.get('grade');
          if (urlG) {
            const gm = mapped.find((g) => g.code === urlG);
            if (gm) setGrade(gm);
          }
        }
      })
      .catch(() => {});
    fetch('/api/packaging/pack-spec-config', { headers: hdr() })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.specs) && d.specs.length) {
          setPackSpecs(d.specs);
          setPack((prev) => prev || d.specs[0]);
        }
      })
      .catch(() => {});
  }, [sp]);

  useEffect(() => {
    const urlG = sp.get('grade');
    const rawBatch = sp.get('batch_no');
    const urlBatch = (rawBatch && rawBatch !== '—') ? rawBatch : '';
    const urlQty = Number(sp.get('qty') || 0);
    const tn = sp.get('task_no');
    const gMatch = gradeDefs.find((g) => g.code === urlG) || gradeDefs[0];
    setGrade(gMatch);
    if (urlQty > 0) {
      const specQty = packSpecs.find((s) => s.name === sp.get('pack_spec'))?.qty || 1;
      if (specQty > 0) setPrintQty(Math.max(1, Math.ceil(urlQty / specQty)));
    }
    if (tn) {
      fetch(`/api/packaging/tasks/${tn}/label-info`, { headers: hdr() })
        .then((r) => r.json())
        .then((d) => {
          const info = d.data || {};
          const date = info.produce_date || new Date().toISOString().slice(0, 10);
          const expiry = info.expire_date || addDays(date, gMatch.shelfDays || 7);
          setVals((p) => ({ ...p, date, expiry, batchNo: urlBatch || info.batch_no || '' }));
        })
        .catch(() => {});
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setVals((p) => ({ ...p, date: today, expiry: addDays(today, gMatch.shelfDays || 7), batchNo: urlBatch }));
    }
    if (packSpecs.length > 0) {
      const urlSpec = sp.get('pack_spec');
      const matched =
        packSpecs.find((s) => s.name === urlSpec)
        || packSpecs.find((s) => urlSpec && urlSpec.includes(s.name))
        || packSpecs[0];
      setPack(matched);
    }
  }, [gradeDefs, packSpecs, sp]);

  const doPrint = useCallback(async () => {
    const lang = tpl.lang;
    const LL = LD[lang];
    const W = labelW, H = labelH;
    const gd = gradeLabelOf(grade, lang);
    const sd = specLabelOf(pack);
    const pu = pack?.qty ? `${pack.qty}${LL.pcs}/${pack.unit?.split('/')[1] || '件'}` : '';
    const code = vals.batchNo || 'LABEL';
    const barcodeData = code.replace(/^[A-Z]+-/, '').replace(/-/g, '');
    const bar = generateCode128SVG(barcodeData, { height: 26, moduleWidth: 1.0, showText: false, physicalDpi: 203 });
    const traceUrl = typeof window !== 'undefined' ? `${window.location.origin}/trace/${encodeURIComponent(code)}` : `/trace/${code}`;
    const qr = tpl.showQr ? generateQrSVG(traceUrl, { ecc: 'M', scale: 2, margin: 1 }) : '';
    const logoSrc = tpl.logoBase64 || logoUrl;
    const logoHtml = logoSrc
      ? `<img src="${logoSrc}" style="height:3.2mm;width:auto;max-width:7mm;object-fit:contain"/>`
      : '🥚';
    const rows: string[] = [
      `<div class="row2"><span class="l">${LL.grade}:</span><span class="v">${gd}</span><span class="l gap">${LL.spec}:</span><span class="v ell">${sd} ${pu}</span></div>`,
    ];
    if (tpl.showMfgDate) rows.push(`<div class="row"><span class="l">${LL.date}:</span><span class="v">${vals.date || '—'}</span></div>`);
    if (tpl.showExpiry) rows.push(`<div class="row"><span class="l">${LL.expiry}:</span><span class="v">${vals.expiry || '—'}</span></div>`);
    if (tpl.showBatchNo && vals.batchNo) rows.push(`<div class="row"><span class="l">${LL.batch}:</span><span class="v ell">${code}</span></div>`);
    if (tpl.showPrice && vals.price) rows.push(`<div class="row"><span class="l">${LL.price}:</span><span class="v">¥${vals.price}</span></div>`);
    const qrBlock = qr ? `<div class="qr">${qr}</div>` : '';
    const singleLabelHtml = `<div class="label"><div class="hdr"><div class="brand">${logoHtml}<span>${tpl.brandName || companyName}</span></div><span class="badge">${gd}</span></div><div class="bar">${bar}</div><div class="bar-text">${code}</div><div class="info">${rows.join('')}</div>${qrBlock}</div>`;
    const css = buildLabelCss(W, H);
    const copies = Math.max(1, printQty);
    await printLabel({ singleLabelHtml, css, copies, title: 'Label Print' });

    fetch('/api/labels/record', {
      method: 'POST', headers: hdr(),
      body: JSON.stringify({
        code: barcodeData,
        label_type: 'pkg',
        grade_code: grade.code,
        grade_name: gd,
        pack_name: sd,
        batch_no: code,
        produce_date: vals.date,
        expiry_date: vals.expiry,
        price: vals.price ? Number(vals.price) : null,
        show_price: tpl.showPrice ? 1 : 0,
        show_expiry: tpl.showExpiry ? 1 : 0,
        qty_printed: copies,
        label_w: W,
        label_h: H,
        desc_text: printCount >= 1 ? '补打(Reprint)' : '正常打印',
      }),
    }).catch(() => {});

    const newCount = printCount + 1;
    setPrintCount(newCount);
    if (newCount >= 2 && taskNo) {
      setReprintReason('');
      setShowReprintModal(true);
    }
  }, [tpl, labelW, labelH, grade, pack, vals, companyName, logoUrl, printQty, printCount, taskNo]);

  const doPrintRef = useRef(doPrint);
  doPrintRef.current = doPrint;

  useEffect(() => {
    if (sp.get('autoprint') !== '1') return;
    if (autoFiredRef.current) return;
    if (!pack || !vals.batchNo) return;
    autoFiredRef.current = true;
    const t = setTimeout(() => doPrintRef.current(), 600);
    return () => clearTimeout(t);
  }, [pack, vals.batchNo, sp]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'Enter') { e.preventDefault(); doPrintRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submitReprintLog = async () => {
    if (!reprintReason.trim()) { window.alert('请填写补打原因'); return; }
    try {
      await fetch(`/api/packaging/tasks/${taskNo}/reprint-log`, {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({
          operator: (() => {
            try { return JSON.parse(sessionStorage.getItem('phoenix_user') || '{}').username || 'TERMINAL'; }
            catch { return 'TERMINAL'; }
          })(),
          reason: reprintReason.trim(),
          label_count: printQty,
        }),
      });
    } catch { /* ignore */ }
    setShowReprintModal(false);
  };

  const taskGrade = sp.get('grade') || grade.code;
  const taskBatch = vals.batchNo || sp.get('batch_no') || '';
  const taskGradeName = gradeLabelOf(gradeDefs.find((g) => g.code === taskGrade) || grade, tpl.lang);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: BG, color: TXT, fontFamily: "'Inter','Noto Sans SC',sans-serif", overflow: 'hidden' }}>
      <div style={{ height: 50, background: '#070d1a', borderBottom: '1px solid ' + BOR, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12 }}>
        <button type="button" onClick={() => router.push('/packaging/terminal')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px', background: CARD, border: '1px solid ' + BOR, borderRadius: 8, color: MUT, fontSize: 12, cursor: 'pointer' }}>
          <ArrowLeft size={13} /> 返回终端
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="logo" style={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 5 }} />
          ) : (
            <div style={{ width: 24, height: 24, borderRadius: 6, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🏢</div>
          )}
          <span style={{ fontSize: 13, fontWeight: 800, color: ACC }}>{companyName}</span>
          <span style={{ fontSize: 12, color: BOR }}>·</span>
          <span style={{ fontSize: 13, color: MUT }}>标签打印</span>
        </div>
        {taskGrade && (
          <>
            <span style={{ fontSize: 11, background: '#1e3a5f', color: '#93c5fd', padding: '2px 8px', borderRadius: 20 }}>{taskGradeName}</span>
            <span style={{ fontSize: 12, color: MUT, fontFamily: 'monospace' }}>{taskBatch}</span>
          </>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace' }}>
          {new Date().toLocaleTimeString('zh', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 28 }}>
          <div style={{ background: 'linear-gradient(135deg,#1e293b,#0f172a)', borderRadius: 16, padding: '32px 24px', border: '1px solid ' + BOR, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
            <LabelPreviewCard grade={grade} pack={pack} vals={vals} tpl={tpl} logoUrl={logoUrl} companyName={companyName} w={labelW} h={labelH} />
          </div>

          <div style={{ background: CARD, borderRadius: 12, border: '1px solid ' + BOR, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid ' + BOR, gap: 8 }}>
              <span style={{ fontSize: 11, color: MUT, fontWeight: 700, width: 40 }}>尺寸</span>
              <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                {([[60, 40, '小'], [80, 50, '中'], [100, 60, '大']] as const).map(([w, h, lbl]) => {
                  const on = labelW === w && labelH === h;
                  return (
                    <button type="button" key={String(w)} onClick={() => saveSize(w, h)}
                      style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: on ? ACC : BG, color: on ? '#000' : MUT, border: '1px solid ' + (on ? ACC : BOR) }}>
                      {lbl} {w}×{h}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="number" value={labelW} onChange={(e) => saveSize(Number(e.target.value), labelH)}
                  style={{ width: 46, padding: '4px 6px', background: BG, border: '1px solid ' + BOR, borderRadius: 6, fontSize: 12, color: TXT, textAlign: 'center' }} />
                <span style={{ color: BOR, fontSize: 11 }}>×</span>
                <input type="number" value={labelH} onChange={(e) => saveSize(labelW, Number(e.target.value))}
                  style={{ width: 46, padding: '4px 6px', background: BG, border: '1px solid ' + BOR, borderRadius: 6, fontSize: 12, color: TXT, textAlign: 'center' }} />
                <span style={{ fontSize: 11, color: MUT }}>mm</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 8 }}>
              <span style={{ fontSize: 11, color: MUT, fontWeight: 700, width: 40 }}>语言</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['zh', 'lo', 'en'] as const).map((v) => {
                  const labels: Record<Lang, string> = { zh: '🇨🇳 中文', lo: '🇱🇦 ລາວ', en: '🇬🇧 EN' };
                  const on = tpl.lang === v;
                  return (
                    <button type="button" key={v} onClick={() => updateTpl({ lang: v })}
                      style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (on ? '#3b82f6' : BOR), background: on ? '#1e3a5f' : BG, color: on ? '#93c5fd' : MUT }}>
                      {labels[v]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button type="button" onClick={() => setSettingsOpen((o) => !o)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '12px 16px', borderRadius: 10, cursor: 'pointer', background: CARD, border: '1px solid ' + BOR, color: TXT, fontSize: 13, fontWeight: 700, marginBottom: settingsOpen ? 12 : 0 }}>
            <span>标签设置</span>
            {settingsOpen ? <ChevronUp size={16} color={MUT} /> : <ChevronDown size={16} color={MUT} />}
          </button>
          {settingsOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                ['showMfgDate', '显示生产日期'],
                ['showExpiry', '显示食用期'],
                ['showBatchNo', '显示批次号'],
                ['showPrice', '显示零售价'],
                ['showQr', '显示追溯二维码'],
              ] as const).map(([k, l]) => (
                <div key={k} onClick={() => updateTpl({ [k]: !tpl[k] } as Partial<TplState>)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: CARD, border: '1px solid ' + BOR }}>
                  <span style={{ fontSize: 13, color: TXT }}>{l}</span>
                  <div style={{ width: 36, height: 20, borderRadius: 10, background: tpl[k] ? ACC : BOR, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 2, left: tpl[k] ? 17 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ width: 340, background: CARD, borderLeft: '1px solid ' + BOR, display: 'flex', flexDirection: 'column', padding: 20, gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: MUT, fontWeight: 700, marginBottom: 6 }}>打印份数</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', background: BG, border: '1px solid ' + BOR, borderRadius: 10, padding: '10px 14px' }}>
              <button type="button" onClick={() => setPrintQty((n) => Math.max(1, n - 1))}
                style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid ' + BOR, background: CARD, color: MUT, fontSize: 20, cursor: 'pointer', fontWeight: 700 }}>−</button>
              <span style={{ fontSize: 28, fontWeight: 900, color: TXT, minWidth: 50, textAlign: 'center' }}>{printQty}</span>
              <button type="button" onClick={() => setPrintQty((n) => n + 1)}
                style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid ' + BOR, background: CARD, color: MUT, fontSize: 20, cursor: 'pointer', fontWeight: 700 }}>＋</button>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: MUT, fontWeight: 700, marginBottom: 6 }}>批次号</div>
            <input value={vals.batchNo} onChange={(e) => setVals({ ...vals, batchNo: e.target.value })}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: BG, border: '1px solid ' + BOR, borderRadius: 8, fontSize: 13, color: TXT, fontFamily: 'monospace' }} />
          </div>

          <div>
            <div style={{ fontSize: 11, color: MUT, fontWeight: 700, marginBottom: 6 }}>生产日期</div>
            <input type="date" value={vals.date} onChange={(e) => setVals({ ...vals, date: e.target.value })}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: BG, border: '1px solid ' + BOR, borderRadius: 8, fontSize: 13, color: TXT }} />
          </div>

          <div>
            <div style={{ fontSize: 11, color: MUT, fontWeight: 700, marginBottom: 6 }}>食用期</div>
            <input type="date" value={vals.expiry} onChange={(e) => setVals({ ...vals, expiry: e.target.value })}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: BG, border: '1px solid ' + BOR, borderRadius: 8, fontSize: 13, color: TXT }} />
          </div>

          {tpl.showPrice && (
            <div>
              <div style={{ fontSize: 11, color: MUT, fontWeight: 700, marginBottom: 6 }}>零售价</div>
              <input type="number" step="0.01" value={vals.price} onChange={(e) => setVals({ ...vals, price: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: BG, border: '1px solid ' + BOR, borderRadius: 8, fontSize: 13, color: TXT }} />
            </div>
          )}

          <div style={{ flex: 1 }} />

          <button type="button" onClick={() => doPrintRef.current()}
            style={{ height: 56, fontSize: 16, fontWeight: 800, borderRadius: 12, border: 'none', cursor: 'pointer', background: printCount >= 1 ? 'linear-gradient(135deg,#d97706,#f59e0b)' : 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 16px rgba(22,163,74,.35)' }}>
            <Printer size={18} />
            {printCount >= 1 ? `⚠️ 补打 ${printQty} 张` : `打印 ${printQty} 张`}
          </button>
          {printCount >= 1 && (
            <div style={{ fontSize: 11, color: '#fbbf24', textAlign: 'center' }}>
              本次会话已打印 {printCount} 次
            </div>
          )}
        </div>
      </div>

      {showReprintModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: CARD, borderRadius: 16, padding: 24, width: 420, border: '1px solid ' + BOR }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>⚠️ 补打/重打审计</div>
            <div style={{ fontSize: 12, color: MUT, marginBottom: 12 }}>
              本次会话已打印 {printCount} 次。请填写补打原因（必填，写入审计日志）：
            </div>
            <textarea value={reprintReason} onChange={(e) => setReprintReason(e.target.value)}
              rows={3} placeholder="例：标签条码模糊重打 / 打印机卡纸 / 数量错误重打 …"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: BG, border: '1px solid ' + BOR, borderRadius: 8, fontSize: 13, color: TXT, fontFamily: 'inherit', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setShowReprintModal(false)} style={{ flex: 1, height: 40, borderRadius: 10, border: '1px solid ' + BOR, background: 'transparent', color: TXT, cursor: 'pointer' }}>
                取消
              </button>
              <button type="button" onClick={submitReprintLog} style={{ flex: 2, height: 40, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#d97706,#f59e0b)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                提交补打记录
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface PreviewProps {
  grade: GradeDef;
  pack: PackSpec | null;
  vals: LabelVals;
  tpl: TplState;
  logoUrl: string;
  companyName: string;
  w: number;
  h: number;
}
function LabelPreviewCard(p: PreviewProps) {
  const lang = p.tpl.lang;
  const LL = LD[lang];
  const gd = gradeLabelOf(p.grade, lang);
  const sd = specLabelOf(p.pack);
  const code = p.vals.batchNo || 'LABEL-PREVIEW';
  const bar = generateCode128SVG(code, { height: 28, moduleWidth: 1.0, showText: true, fontSize: 6 });
  const traceUrl = typeof window !== 'undefined' ? `${window.location.origin}/trace/${encodeURIComponent(code)}` : `/trace/${code}`;
  const qr = p.tpl.showQr ? generateQrSVG(traceUrl, { ecc: 'M', scale: 2, margin: 1 }) : '';
  const ff = lang === 'lo' ? '"Noto Sans Lao","Noto Sans SC",serif' : '"Noto Sans SC",serif';
  const showLogo = p.tpl.logoBase64 || p.logoUrl;
  return (
    <div style={{ fontFamily: ff, background: '#fff', color: '#111', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,.5)', overflow: 'hidden', aspectRatio: `${p.w}/${p.h}`, display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 520 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3% 4%', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {showLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.tpl.logoBase64 || p.logoUrl} alt="" style={{ height: '1.4em', objectFit: 'contain' }} />
          ) : (
            <span>🐔</span>
          )}
          <span style={{ fontSize: '0.65em', fontWeight: 800 }}>{p.tpl.brandName || p.companyName}</span>
        </div>
        <span style={{ fontSize: '0.55em', background: '#1d4ed8', color: '#fff', padding: '2px 6px', borderRadius: 3, fontWeight: 700, maxWidth: '56%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gd}·{sd}</span>
      </div>
      <div style={{ flex: '0 0 40%', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2% 4%' }}>
        <div style={{ width: '100%' }} dangerouslySetInnerHTML={{ __html: bar }} />
      </div>
      <div style={{ flex: 1, padding: '2% 4%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px 6px' }}>
          <Row label={LL.product} val={LL.productName} bold />
          <Row label={LL.grade} val={gd} bold />
          <Row label={LL.spec} val={sd} />
          {p.tpl.showMfgDate && <Row label={LL.date} val={p.vals.date || '—'} />}
          {p.tpl.showExpiry && <Row label={LL.expiry} val={p.vals.expiry || '—'} />}
          {p.tpl.showBatchNo && p.vals.batchNo && <Row label={LL.batch} val={p.vals.batchNo} full />}
          {p.tpl.showPrice && p.vals.price && <Row label={LL.price} val={`¥${p.vals.price}`} />}
        </div>
      </div>
      <div style={{ padding: '1.5% 4%', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: '0.45em', color: '#bbb', fontFamily: 'monospace' }}>{code}</span>
        {qr && (
          <div title="扫码查看追溯链路" style={{ width: '14%', flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: qr }} />
        )}
        <span style={{ fontSize: '0.42em', color: '#ddd' }}>Phoenix ERP</span>
      </div>
    </div>
  );
}

function Row({ label, val, bold, full }: { label: string; val: string; bold?: boolean; full?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'baseline', overflow: 'hidden', ...(full ? { gridColumn: '1/-1' } : {}) }}>
      <span style={{ fontSize: '0.78em', color: '#888', whiteSpace: 'nowrap', flexShrink: 0 }}>{label}:</span>
      <span style={{ fontSize: bold ? '1em' : '0.9em', fontWeight: bold ? 800 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
    </div>
  );
}
