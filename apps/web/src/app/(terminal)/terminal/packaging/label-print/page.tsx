'use client';

import { useState, useEffect } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLabelConfig, LABEL_SIZE_PRESETS } from '@/hooks/useLabelConfig';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { useBrand } from '@/contexts/BrandContext';
import { packagingApi } from '@/lib/packaging-api';
import { printLabel, buildLabelCss } from '@/components/packaging/printLabel';
import { generateCode128SVG } from '@/lib/barcode';
import { GRADE_LABEL } from '@/types/packaging-terminal';
import { FALLBACK_DICTS } from '@/hooks/usePackagingDicts';
import { T } from '@/styles/terminal-theme';
type TraceData = Awaited<ReturnType<typeof packagingApi.getPackingTrace>>;
const SETUP_DONE_KEY = 'phoenix_label_setup_done';
const REPRINT_REASON_KEYS = ['label_print.reprint.damaged', 'label_print.reprint.unclear', 'label_print.reprint.wrong_info', 'label_print.reprint.customer_request', 'label_print.reprint.other'] as const;

// 综合 code + terminalCode 两种形式的等级显示映射
const GRADE_MAP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const item of [...(FALLBACK_DICTS.PKG_EGG_GRADE ?? []), ...(FALLBACK_DICTS.PKG_EGG_DEFECT ?? [])]) {
    m[item.code] = item.label;
    if (item.terminalCode) m[item.terminalCode] = item.label;
  }
  for (const [k, v] of Object.entries(GRADE_LABEL)) {
    if (!m[k]) m[k] = v as string;
  }
  return m;
})();
function gradeDisplay(grade: string): string {
  return GRADE_MAP[grade] ?? grade;
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('zh-CN');
}

// 等级 → 2-3位英文码，用于企业条码标识
const GRADE_CODE_MAP: Record<string, string> = {
  GRADE_1: 'G1',
  GRADE_2: 'G2',
  GRADE_3: 'G3',
  PKG_DEFECT_DIRTY: 'DD',
  DIRTY: 'DD',
  PKG_DEFECT_BROKEN: 'DB',
  BROKEN: 'DB',
  PKG_DEFECT_CRACK: 'DC',
  CRACK: 'DC',
  PKG_DEFECT_SMALL: 'DS',
  SMALL: 'DS',
  PKG_DEFECT_DEFORMED: 'DF',
  DEFORMED: 'DF'
};
function toGradeCode(grade: string): string {
  return GRADE_CODE_MAP[grade] ?? grade.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase();
}

// ─── 区块标题 ──────────────────────────────────────────────────────
const SecLabel = ({
  children
}: {
  children: React.ReactNode;
}) => <div style={{
  fontSize: 10,
  fontWeight: 700,
  color: T.ACC,
  letterSpacing: 1,
  textTransform: 'uppercase',
  marginBottom: 6
}}>
    {children}
  </div>;
export default function LabelPrintPage() {
  const router = useRouter();
  const {
    t
  } = useLanguage();
  const {
    hasRole
  } = useAuth();
  const {
    brand
  } = useBrand();
  const {
    cfg,
    setCfg
  } = useLabelConfig();
  const {
    ctx
  } = useTerminalContext();
  const isAdmin = hasRole('ROLE_ADMIN', 'ROLE_PKG_MANAGER');
  const sourceSummary = (sources: {
    houseName: string;
  }[]): string => {
    if (!sources.length) return '';
    if (sources.length <= 2) return sources.map(s => s.houseName).join(t('ui.、', '、'));
    return `${sources[0].houseName}${t('ui.等', '等')}${sources.length}${t('ui.栋', '栋')}`;
  };

  // 首次自动打开设置抽屉
  const [showSettings, setShowSettings] = useState(false);
  const [isFirstSetup, setIsFirstSetup] = useState(false);
  const [showPreviewLarge, setShowPreviewLarge] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem(SETUP_DONE_KEY)) {
      setShowSettings(true);
      setIsFirstSetup(true);
    }
  }, []);
  function closeSettings() {
    localStorage.setItem(SETUP_DONE_KEY, '1');
    setIsFirstSetup(false);
    setShowSettings(false);
  }
  type BoxItem = {
    code: string;
    grade: string;
    spec: string;
    printed: boolean;
    verified: boolean;
  };
  function buildBoxes(batches: typeof ctx.packingBatches): BoxItem[] {
    if (!batches) return [];
    // 批次尾号 6 位，例 PKG-20260519-887208 → 887208
    const batchNum = (ctx.packingCode ?? '').replace(/\D/g, '').slice(-6).padStart(6, '0');
    return batches.flatMap((batch, bi) => {
      const startIdx = batches.slice(0, bi).reduce((s, b) => s + (b.boxes || 0), 0);
      const gc = toGradeCode(batch.grade);
      return Array.from({
        length: batch.boxes
      }, (_, j) => ({
        code: `PH-${batchNum}-${gc}-${String(startIdx + j + 1).padStart(3, '0')}`,
        grade: batch.grade,
        spec: batch.spec,
        printed: false,
        verified: false
      }));
    });
  }
  const [boxes, setBoxes] = useState<BoxItem[]>(() => buildBoxes(ctx.packingBatches));
  useEffect(() => {
    if (ctx.packingBatches && boxes.length === 0) setBoxes(buildBoxes(ctx.packingBatches));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.packingBatches]);
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const [reprintTarget, setReprintTarget] = useState<string | null>(null);
  const [reprintReason, setReprintReason] = useState('');
  const [verifyInput, setVerifyInput] = useState('');
  useEffect(() => {
    if (ctx.packingCode) packagingApi.getPackingTrace(ctx.packingCode).then(setTrace).catch(() => {});
  }, [ctx.packingCode]);
  const buildLabelHtml = (code: string, grade: string, spec: string) => {
    const batchNo = ctx.packingCode ?? '';
    const prodDate = trace?.productionDate ? new Date(trace.productionDate).toLocaleDateString('zh-CN') : new Date().toLocaleDateString('zh-CN');
    const prodDateRaw = trace?.productionDate ?? new Date().toISOString().slice(0, 10);
    const expiryDate = addDays(prodDateRaw, cfg.expiryDays);
    const gradeLabel = gradeDisplay(grade);
    const barcodeSvgRaw = generateCode128SVG(code, {
      height: 40,
      showText: false,
      color: 'var(--text-primary)',
      background: 'var(--bg-card)'
    });
    const barcodeSvg = barcodeSvgRaw.replace(/(<svg[^>]*)\bwidth="[^"]*"/, '$1width="100%"');
    const shiftLine = cfg.showShift && trace?.shift ? `<div class="row"><span class="l">${t('label.班次', '班次')}</span><span class="v">${trace.shift.shiftLabel}${trace.shift.operatorName ? '·' + trace.shift.operatorName : ''}</span></div>` : '';
    const expiryLine = cfg.showExpiry ? `<div class="row"><span class="l">${t('label.食用期', '食用期')}</span><span class="v">${expiryDate}</span></div>` : '';
    const logoTag = brand.logo_url ? `<img src="${brand.logo_url}" class="logo" alt="" />` : '';
    const companyName = brand.company_name || t('ui.brand_name', '凤凰农业');
    return `<div class="label">` + `<div class="hdr">` + `<span class="brand">${logoTag}<span>${companyName}</span></span>` + `<span class="badge">${gradeLabel}</span>` + `</div>` + `<div class="bar">${barcodeSvg}</div>` + `<div class="bar-text">${code}</div>` + `<div class="info">` + `<div class="row"><span class="l">${t('label.规格', '规格')}</span><span class="v">${spec}</span></div>` + (cfg.showBatch ? `<div class="row"><span class="l">${t('label.批次', '批次')}</span><span class="v">${batchNo}</span></div>` : '') + (cfg.showDate ? `<div class="row"><span class="l">${t('label.生产', '生产')}</span><span class="v">${prodDate}</span></div>` : '') + expiryLine + shiftLine + `</div>` + `</div>`;
  };
  const handlePrint = async (code: string) => {
    const box = boxes.find(b => b.code === code);
    if (!box) return;
    setPrinting(code);
    try {
      await printLabel({
        singleLabelHtml: buildLabelHtml(code, box.grade, box.spec),
        css: buildLabelCss(cfg.labelW, cfg.labelH),
        copies: 1,
        title: code
      });
      setBoxes(prev => prev.map(b => b.code === code ? {
        ...b,
        printed: true
      } : b));
      await packagingApi.recordPrintLog({
        boxCode: code,
        packingCode: ctx.packingCode,
        printType: 'NORMAL'
      }).catch(console.error);
    } finally {
      setPrinting(null);
    }
  };
  const handleVerify = (code: string) => {
    if (verifyInput.trim() === code) {
      setBoxes(prev => prev.map(b => b.code === code ? {
        ...b,
        verified: true
      } : b));
      setVerifyInput('');
    }
  };
  const handleReprint = async () => {
    if (!reprintTarget || !reprintReason) return;
    const box = boxes.find(b => b.code === reprintTarget);
    if (!box) return;
    setPrinting(reprintTarget);
    try {
      await printLabel({
        singleLabelHtml: buildLabelHtml(reprintTarget, box.grade, box.spec),
        css: buildLabelCss(cfg.labelW, cfg.labelH),
        copies: 1,
        title: `${reprintTarget}-REPRINT`
      });
      await packagingApi.recordPrintLog({
        boxCode: reprintTarget,
        packingCode: ctx.packingCode,
        printType: 'REPRINT',
        reprintReason
      }).catch(console.error);
    } finally {
      setPrinting(null);
    }
    setReprintTarget(null);
    setReprintReason('');
  };
  const allDone = boxes.length > 0 && boxes.every(b => b.printed && b.verified);

  // ─── 标签预览组件 ─────────────────────────────────────────────────
  // ppm = pixels per mm（预览精度）
  const LabelPreview = ({
    ppm
  }: {
    ppm: number;
  }) => {
    const W = cfg.labelW * ppm;
    const H = cfg.labelH * ppm;
    const fs = ppm * 1.05;
    const sampleGrade = boxes[0]?.grade ?? 'GRADE_1';
    const sampleSpec = boxes[0]?.spec ?? t('ui.标准装样例', '标准装 59-66g');
    const sampleBatch = ctx.packingCode ?? 'PKG-20260519-887208';
    const batchNum = sampleBatch.replace(/\D/g, '').slice(-6).padStart(6, '0');
    const sampleCode = `PH-${batchNum}-${toGradeCode(sampleGrade)}-001`;
    const today = new Date().toLocaleDateString('zh-CN');
    const expiryStr = addDays(new Date().toISOString().slice(0, 10), cfg.expiryDays);

    // 生成条码后将 width 替换为 100%，使其撑满容器宽度
    const barSvgRaw = generateCode128SVG(sampleCode, {
      height: Math.round(H * 0.32),
      showText: false,
      color: 'var(--text-primary)',
      background: 'var(--bg-card)'
    });
    const barSvg = barSvgRaw.replace(/(<svg[^>]*)\bwidth="[^"]*"/, '$1width="100%"');
    const row: React.CSSProperties = {
      display: 'flex',
      gap: 2,
      alignItems: 'baseline',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      lineHeight: 1.4
    };
    const lbl: React.CSSProperties = {
      fontWeight: 700,
      flexShrink: 0,
      fontSize: fs * 1.0,
      color: 'var(--text-secondary)',
      minWidth: ppm * 4
    };
    const val: React.CSSProperties = {
      fontWeight: 900,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      fontSize: fs * 1.1
    };
    const infoRows = [<div key="spec" style={row}><span style={lbl}>{t('label.规格', '规格')}</span><span style={val}>{sampleSpec}</span></div>, cfg.showBatch && <div key="batch" style={row}><span style={lbl}>{t('label.批次', '批次')}</span><span style={val}>{sampleBatch}</span></div>, cfg.showDate && <div key="date" style={row}><span style={lbl}>{t('label.生产', '生产')}</span><span style={val}>{today}</span></div>, cfg.showExpiry && <div key="expiry" style={row}><span style={lbl}>{t('label.食用期', '食用期')}</span><span style={val}>{expiryStr}</span></div>, cfg.showShift && <div key="shift" style={row}><span style={lbl}>{t('label.班次', '班次')}</span><span style={val}>{t('ui.早班', '早班')}·张三</span></div>].filter(Boolean);
    return <div style={{
      width: W,
      height: H,
      background: 'var(--bg-card)',
      color: 'var(--text-primary)',
      fontFamily: '"Noto Sans SC",Arial,sans-serif',
      fontSize: fs,
      overflow: 'hidden',
      position: 'relative',
      border: '0.5px solid var(--text-disabled)'
    }}>
        {/* 顶部品牌栏 */}
        <div style={{
        height: H * 0.20,
        padding: `0 ${ppm * 1.5}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: fs * 1.0,
        fontWeight: 800
      }}>
          <span style={{
          display: 'flex',
          alignItems: 'center',
          gap: ppm * 0.7,
          overflow: 'hidden',
          minWidth: 0
        }}>
            {brand.logo_url ? <img src={brand.logo_url} alt="logo" style={{
            height: H * 0.16,
            width: 'auto',
            objectFit: 'contain',
            flexShrink: 0
          }} /> : <span style={{
            fontSize: H * 0.13,
            lineHeight: 1,
            flexShrink: 0
          }}>🥚</span>}
            <span style={{
            fontWeight: 800,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: fs * 1.0
          }}>
              {brand.company_name || t('ui.brand_name', '凤凰农业')}
            </span>
          </span>
          <span style={{
          background: 'var(--text-primary)',
          color: 'var(--text-on-dark)',
          padding: `${ppm * 0.3}px ${ppm * 1.0}px`,
          borderRadius: ppm * 0.5,
          fontSize: fs * 0.9,
          fontWeight: 700,
          flexShrink: 0
        }}>
            {gradeDisplay(sampleGrade)}
          </span>
        </div>
        {/* 条形码 */}
        <div style={{
        height: H * 0.33,
        overflow: 'hidden',
        width: '100%'
      }} dangerouslySetInnerHTML={{
        __html: barSvg
      }} />
        {/* 箱码编号（放大） */}
        <div style={{
        textAlign: 'center',
        fontFamily: '"Courier New",Arial,sans-serif',
        fontSize: fs * 1.1,
        fontWeight: 700,
        letterSpacing: '0.5px',
        padding: `${ppm * 0.2}px 0 ${ppm * 0.3}px`
      }}>
          {sampleCode}
        </div>
        {/* 信息行 — 两列网格 */}
        <div style={{
        padding: `${ppm * 0.4}px ${ppm * 1.5}px`,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        alignContent: 'space-evenly',
        gap: `0 ${ppm}px`,
        overflow: 'hidden',
        position: 'absolute',
        left: 0,
        right: 0,
        top: H * 0.57,
        bottom: 0
      }}>
          {infoRows}
        </div>
      </div>;
  };

  // ─── 右侧设置抽屉 ─────────────────────────────────────────────────
  const DRAWER_W = 400;
  const SettingsDrawer = () => {
    const TOGGLE_FIELDS: {
      key: 'showBatch' | 'showDate' | 'showExpiry' | 'showShift' | 'showPrice';
      label: string;
      sub: string;
    }[] = [{
      key: 'showBatch',
      label: t('ui.批次号', '批次号'),
      sub: t('ui.生产流水批次', '生产流水批次')
    }, {
      key: 'showDate',
      label: t('ui.生产日期', '生产日期'),
      sub: t('ui.出厂日期', '出厂日期')
    }, {
      key: 'showExpiry',
      label: t('ui.食用期限', '食用期限'),
      sub: t('ui.建议食用截止日', '建议食用截止日')
    }, {
      key: 'showShift',
      label: t('ui.班次信息', '班次信息'),
      sub: t('ui.操作员班次', '操作员 / 班次')
    }, {
      key: 'showPrice',
      label: t('ui.零售价', '零售价'),
      sub: t('ui.建议零售价', '建议零售价')
    }];
    const SIZE_INFO: Record<string, string> = {
      '50x25': t('ui.标签尺寸标准', '标准'),
      '40x30': t('ui.标签尺寸通用', '通用'),
      '60x40': t('ui.标签尺寸零售箱贴', '零售箱贴'),
      '80x50': t('ui.标签尺寸外箱大标', '外箱大标')
    };
    return <>
        {/* 遮罩 */}
        <div onClick={closeSettings} style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay-black-50)',
        zIndex: 400
      }} />

        {/* 抽屉面板 */}
        <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: DRAWER_W,
        height: '100vh',
        background: 'var(--bg-page)',
        borderLeft: `1px solid ${T.BOR}`,
        zIndex: 401,
        display: 'flex',
        flexDirection: 'column'
      }}>

          {/* ── 标题栏 ── */}
          <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${T.BOR}`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
            <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            flexShrink: 0,
            background: 'var(--status-warning-bg-medium)',
            border: `1px solid var(--status-warning-bg-strong)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18
          }}>
              🏷️
            </div>
            <div className={u.flex1}>
              <div style={{
              fontSize: 15,
              fontWeight: 800,
              color: T.TXT
            }}>{t('ui.标签打印设置', '标签打印设置')}</div>
              <div style={{
              fontSize: 10,
              color: T.MUT,
              marginTop: 1
            }}>
                {isFirstSetup ? t('ui.初次设置保存提示', '初次设置后自动保存，后续可点⚙️修改') : t('ui.修改后点保存立即生效', '修改后点保存立即生效')}
              </div>
            </div>
            <button type="button" onClick={closeSettings} style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            border: `1px solid ${T.BOR}`,
            background: 'var(--overlay-white-06)',
            color: T.MUT,
            fontSize: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
              ✕
            </button>
          </div>

          {/* ── 内容区 ── */}
          <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14
        }}>

            {/* ── 标签预览（实际物理尺寸） ── */}
            {(() => {
            // CSS 参考像素：1in = 96px，1mm = 96/25.4 ≈ 3.78px；抽屉预览放大 1.3×
            const MM_TO_PX = 1.3 * 96 / 25.4;
            const displayW = Math.round(cfg.labelW * MM_TO_PX);
            const displayH = Math.round(cfg.labelH * MM_TO_PX);
            return <section>
                  <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: T.ACC,
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                    {t('ui.标签预览', '标签预览')}
                    <span style={{
                  fontSize: 10,
                  color: T.MUT,
                  fontWeight: 400
                }}>
                      {t('ui.实际尺寸点击放大', '实际尺寸 · 点击放大5倍')}
                    </span>
                  </div>
                  {/* 居中显示，虚线框给出尺寸感 */}
                  <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '14px 0',
                background: 'var(--overlay-white-02)',
                borderRadius: 8,
                border: `1px dashed ${T.BOR}`
              }}>
                    <button type="button" onClick={() => setShowPreviewLarge(true)} style={{
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'zoom-in',
                  display: 'block',
                  width: displayW,
                  height: displayH,
                  overflow: 'hidden',
                  borderRadius: 2,
                  flexShrink: 0,
                  boxShadow: '0 2px 16px var(--overlay-black-50), 0 0 0 1px var(--overlay-white-08)'
                }}>
                      <LabelPreview ppm={MM_TO_PX} />
                    </button>
                  </div>
                  <div style={{
                fontSize: 10,
                color: T.MUT,
                textAlign: 'center',
                marginTop: 5
              }}>
                    {cfg.labelW}×{cfg.labelH} mm
                  </div>
                </section>;
          })()}

            {/* ① 标签尺寸 */}
            <section>
              <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: T.ACC,
              marginBottom: 8
            }}>
                {t('ui.标签尺寸', '标签尺寸')}
              </div>
              <div style={{
              position: 'relative'
            }}>
                <select value={`${cfg.labelW}x${cfg.labelH}`} onChange={e => {
                const p = LABEL_SIZE_PRESETS.find(p => `${p.w}x${p.h}` === e.target.value);
                if (p) setCfg({
                  labelW: p.w,
                  labelH: p.h
                });
              }} style={{
                width: '100%',
                background: 'var(--bg-page)',
                border: `1px solid ${T.BOR}`,
                borderRadius: 10,
                padding: '11px 36px 11px 14px',
                color: T.TXT,
                fontSize: 14,
                fontWeight: 600,
                appearance: 'none',
                WebkitAppearance: 'none',
                cursor: 'pointer',
                outline: 'none'
              }}>
                  {LABEL_SIZE_PRESETS.map(p => <option key={p.label} value={`${p.w}x${p.h}`} style={{
                  background: 'var(--bg-page)'
                }}>
                      {p.w}×{p.h} mm — {SIZE_INFO[`${p.w}x${p.h}`] ?? p.label}
                    </option>)}
                </select>
                <span style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: T.MUT,
                fontSize: 12
              }}>▾</span>
              </div>
            </section>

            {/* ② 打印内容 */}
            <section>
              <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: T.ACC,
              marginBottom: 8
            }}>
                {t('ui.打印内容', '打印内容')}
              </div>
              <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6
            }}>
                {TOGGLE_FIELDS.map(({
                key,
                label,
                sub
              }) => {
                const on = cfg[key];
                return <button type="button" key={key} onClick={() => setCfg({
                  [key]: !on
                })} style={{
                  padding: '8px 10px',
                  borderRadius: 9,
                  cursor: 'pointer',
                  textAlign: 'left',
                  border: `1.5px solid ${on ? T.ACC + '70' : T.BOR}`,
                  background: on ? 'var(--status-warning-bg-faint)' : 'var(--overlay-white-02)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                      <div style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    flexShrink: 0,
                    border: `2px solid ${on ? T.ACC : T.BOR}`,
                    background: on ? T.ACC : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                        {on && <span style={{
                      fontSize: 10,
                      color: 'var(--text-primary)',
                      fontWeight: 900,
                      lineHeight: 1
                    }}>✓</span>}
                      </div>
                      <div>
                        <div style={{
                      fontSize: 12,
                      fontWeight: on ? 600 : 400,
                      color: on ? T.TXT : T.MUT
                    }}>
                          {label}
                        </div>
                        <div style={{
                      fontSize: 9,
                      color: T.MUT + '80',
                      marginTop: 1
                    }}>{sub}</div>
                      </div>
                    </button>;
              })}
              </div>
            </section>

            {/* ③ 食用期天数（仅当开启食用期时） */}
            {cfg.showExpiry && <section>
                <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: T.ACC,
              marginBottom: 8
            }}>
                  {t('ui.食用期天数', '食用期天数')}
                </div>
                <div className={u.flexRow}>
                  {[7, 14, 21, 28, 45].map(d => <button type="button" key={d} onClick={() => setCfg({
                expiryDays: d
              })} style={{
                flex: 1,
                padding: '9px 0',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: cfg.expiryDays === d ? 700 : 400,
                cursor: 'pointer',
                border: `1.5px solid ${cfg.expiryDays === d ? T.ACC : T.BOR}`,
                background: cfg.expiryDays === d ? 'var(--status-warning-bg-light)' : 'var(--overlay-white-03)',
                color: cfg.expiryDays === d ? T.ACC : T.MUT
              }}>
                      {d}{t('ui.天', '天')}
                    </button>)}
                  <input type="number" min={1} max={365} value={cfg.expiryDays} onChange={e => setCfg({
                expiryDays: Math.max(1, parseInt(e.target.value) || 28)
              })} style={{
                width: 52,
                background: 'var(--overlay-white-05)',
                border: `1px solid ${T.BOR}`,
                borderRadius: 8,
                padding: '8px 6px',
                color: T.TXT,
                fontSize: 12,
                textAlign: 'center'
              }} />
                </div>
              </section>}

            {/* ④ 打印机 */}
            <section>
              <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: T.ACC,
              marginBottom: 8
            }}>
                {t('ui.打印机', '打印机')}
              </div>
              <div style={{
              position: 'relative'
            }}>
                <span style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 14,
                lineHeight: 1,
                pointerEvents: 'none',
                userSelect: 'none'
              }}>🖨️</span>
                <input value={cfg.printerName} onChange={e => setCfg({
                printerName: e.target.value
              })} placeholder={t('ui.留空使用系统默认打印机', '留空使用系统默认打印机')} style={{
                width: '100%',
                background: 'var(--overlay-white-05)',
                border: `1px solid ${T.BOR}`,
                borderRadius: 10,
                padding: '10px 14px 10px 36px',
                color: T.TXT,
                fontSize: 13,
                boxSizing: 'border-box'
              }} />
              </div>
            </section>

            {/* 管理员：驱动下载 */}
            {isAdmin && <section style={{
            background: 'var(--status-warning-bg-faint)',
            border: `1px solid var(--status-warning-border)`,
            borderRadius: 12,
            padding: '16px'
          }}>
                <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8
            }}>
                  <span className={u.fs16}>🔧</span>
                  <div style={{
                fontSize: 13,
                fontWeight: 700,
                color: T.ACC
              }}>{t('ui.打印机驱动', '打印机驱动')}</div>
                  <div style={{
                fontSize: 10,
                color: T.MUT,
                padding: '2px 7px',
                borderRadius: 20,
                background: 'var(--overlay-white-06)',
                border: `1px solid ${T.BOR}`
              }}>{t('ui.仅管理员', '仅管理员')}</div>
                </div>
                <div style={{
              fontSize: 12,
              color: T.MUT,
              marginBottom: 12,
              lineHeight: 1.6
            }}>
                  {t('ui.斑马打印机驱动描述', '斑马 ZD420 / ZD621 热敏打印机驱动，安装后设为系统默认打印机，可实现静默直打无弹窗。')}
                </div>
                <div style={{
              display: 'flex',
              gap: 8
            }}>
                  <a href="/downloads/zebra-driver-windows.exe" download style={{
                flex: 1,
                padding: '9px',
                borderRadius: 8,
                background: T.ACC,
                color: 'var(--bg-page)',
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
                textAlign: 'center'
              }}>
                    ⬇ Windows
                  </a>
                  <a href="/downloads/zebra-driver-macos.pkg" download style={{
                flex: 1,
                padding: '9px',
                borderRadius: 8,
                border: `1px solid ${T.BOR}`,
                background: 'var(--overlay-white-06)',
                color: T.TXT,
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
                textAlign: 'center'
              }}>
                    ⬇ macOS
                  </a>
                </div>
              </section>}
          </div>

          {/* ── 保存按钮 ── */}
          <div style={{
          padding: '10px 16px',
          borderTop: `1px solid ${T.BOR}`,
          flexShrink: 0
        }}>
            <button type="button" onClick={closeSettings} style={{
            width: '100%',
            padding: '13px',
            background: T.ACC,
            border: 'none',
            borderRadius: 10,
            color: 'var(--bg-page)',
            fontSize: 15,
            fontWeight: 800,
            cursor: 'pointer'
          }}>
              ✓ {isFirstSetup ? t('ui.保存并开始打印', '保存并开始打印') : t('ui.保存', '保存')}
            </button>
          </div>
        </div>

        {/* ── 放大预览灯箱 ── */}
        {showPreviewLarge && <div onClick={() => setShowPreviewLarge(false)} style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 600,
        cursor: 'zoom-out'
      }}>
            {/* 说明文字 */}
            <div style={{
          color: 'var(--overlay-white-50)',
          fontSize: 12,
          marginBottom: 16
        }}>
              {t('ui.点击任意处关闭', '点击任意处关闭')}
            </div>
            {/* 5× 实际尺寸预览 */}
            {(() => {
          const MM_TO_PX = 96 / 25.4;
          // 目标 5×，但不超过屏幕 92%/88%
          const ppm = Math.min(5 * MM_TO_PX, window.innerWidth * 0.92 / cfg.labelW, window.innerHeight * 0.88 / cfg.labelH);
          const dW = Math.round(cfg.labelW * ppm);
          const dH = Math.round(cfg.labelH * ppm);
          const scale = ppm / MM_TO_PX;
          return <div onClick={e => e.stopPropagation()} style={{
            width: dW,
            height: dH,
            cursor: 'default',
            boxShadow: '0 8px 64px var(--overlay-black-30)',
            borderRadius: 4,
            overflow: 'hidden'
          }}>
                  <LabelPreview ppm={ppm} />
                </div>;
        })()}
            <div style={{
          marginTop: 14,
          color: 'var(--overlay-white-15)',
          fontSize: 11
        }}>
              {cfg.labelW}×{cfg.labelH} mm · {t('ui.放大预览标注', '5× 放大 · 点击关闭')}
            </div>
          </div>}
      </>;
  };
  return <div style={{
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: T.BG,
    overflow: 'hidden'
  }}>
      {showSettings && <SettingsDrawer />}

      <div style={{
      background: T.CARD,
      borderBottom: `1px solid ${T.BOR}`,
      padding: '12px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0
    }}>
        <span className={u.fs22}>🏷️</span>
        <div className={u.flex1}>
          <div style={{
          fontSize: 17,
          fontWeight: 700,
          color: T.TXT
        }}>{t('terminal.label_print', '标签打印')}</div>
          <div style={{
          fontSize: 12,
          color: T.MUT
        }}>{t('ui.打印后扫码校验全部校验通过后可入库', '打印后扫码校验，全部校验通过后可入库')}</div>
        </div>
        <button type="button" onClick={() => setShowSettings(v => !v)} style={{
        padding: '8px 16px',
        borderRadius: 8,
        border: `1px solid ${showSettings ? T.ACC : T.BOR}`,
        background: showSettings ? 'var(--status-warning-bg-light)' : 'var(--overlay-white-05)',
        color: showSettings ? T.ACC : T.MUT,
        fontSize: 13,
        cursor: 'pointer',
        flexShrink: 0
      }}>
          ⚙️ {t('ui.标签设置', '标签设置')}
        </button>
        <div style={{
        textAlign: 'right',
        flexShrink: 0
      }}>
          <div style={{
          fontSize: 22,
          fontWeight: 800,
          color: T.ACC,
          fontVariantNumeric: 'tabular-nums'
        }}>
            {boxes.filter(b => b.verified).length}<span style={{
            fontSize: 13,
            fontWeight: 400,
            color: T.MUT
          }}>/{boxes.length}</span>
          </div>
          <div style={{
          fontSize: 11,
          color: T.MUT
        }}>{t('ui.已校验总箱数', '已校验/总箱数')}</div>
        </div>
      </div>

      <div style={{
      flex: 1,
      overflow: 'hidden',
      minHeight: 0,
      padding: 16
    }}>
        {boxes.length === 0 ? <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
        color: T.MUT
      }}>
            <div style={{
          fontSize: 48
        }}>📦</div>
            <div style={{
          fontSize: 16,
          fontWeight: 600
        }}>{t('ui.暂无待打印标签', '暂无待打印标签')}</div>
            <div className={u.fs13}>{t('ui.请先完成包装作业', '请先完成包装作业，再返回此页打印标签')}</div>
            <button type="button" onClick={() => router.push('/terminal/packaging/packing')} style={{
          marginTop: 8,
          padding: '10px 24px',
          borderRadius: 8,
          border: `1px solid ${T.BOR}`,
          background: 'var(--overlay-white-05)',
          color: T.MUT,
          fontSize: 14,
          cursor: 'pointer'
        }}>
              ← {t('ui.前往包装', '前往包装')}
            </button>
          </div> : <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}>
            {boxes.map(box => <div key={box.code} style={{
          background: T.CARD,
          borderRadius: 12,
          padding: 16,
          border: `1px solid ${box.verified ? 'var(--status-success-bg-strong)' : T.BOR}`,
          display: 'flex',
          alignItems: 'center',
          gap: 16
        }}>
                <div style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            flexShrink: 0,
            background: box.verified ? 'var(--status-success-bg-medium)' : box.printed ? 'var(--status-warning-bg-medium)' : 'var(--overlay-white-05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22
          }}>
                  {box.verified ? '✅' : box.printed ? '🏷️' : '⬜'}
                </div>
                <div className={u.flex1}>
                  <div style={{
              fontSize: 15,
              fontWeight: 700,
              color: T.TXT,
              fontFamily: 'monospace'
            }}>{box.code}</div>
                  <div style={{
              fontSize: 12,
              color: T.MUT
            }}>{gradeDisplay(box.grade)} · {box.spec}</div>
                  {trace && <div style={{
              fontSize: 11,
              color: T.MUT,
              marginTop: 2,
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap'
            }}>
                      {trace.shift && <span>🕐 {trace.shift.shiftLabel}</span>}
                      {trace.sources.length > 0 && <span>🏠 {sourceSummary(trace.sources)}</span>}
                      {trace.productionDate && <span>📅 {trace.productionDate}</span>}
                    </div>}
                  <div style={{
              fontSize: 11,
              marginTop: 2,
              color: box.verified ? T.GRN : box.printed ? T.ACC : T.MUT
            }}>
                    {box.verified ? t('ui.已打印已校验', '已打印 · 已校验') : box.printed ? t('ui.已打印待扫码校验', '已打印 · 待扫码校验') : t('ui.待打印', '待打印')}
                  </div>
                </div>
                <div className={u.flexRow8}>
                  {box.printed && !box.verified && <div style={{
              display: 'flex',
              gap: 6
            }}>
                      <input value={verifyInput} onChange={e => setVerifyInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleVerify(box.code)} placeholder={t('ui.扫码校验', '扫码校验...')} style={{
                width: 180,
                background: 'var(--overlay-white-05)',
                border: `1px solid ${T.BOR}`,
                borderRadius: 6,
                padding: '8px 12px',
                color: T.TXT,
                fontSize: 13
              }} />
                      <button type="button" onClick={() => handleVerify(box.code)} style={{
                padding: '8px 14px',
                borderRadius: 6,
                border: 'none',
                background: T.GRN,
                color: 'var(--bg-page)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}>
                        {t('ui.校验', '校验')}
                      </button>
                    </div>}
                  {!box.printed && <button type="button" onClick={() => handlePrint(box.code)} disabled={printing === box.code} style={{
              padding: '12px 24px',
              borderRadius: 8,
              border: 'none',
              background: T.ACC,
              color: 'var(--bg-page)',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              opacity: printing === box.code ? 0.7 : 1
            }}>
                      {printing === box.code ? t('ui.打印中', '打印中...') : `🖨️ ${t('common.print', '打印')}`}
                    </button>}
                  {box.printed && <button type="button" onClick={() => setReprintTarget(box.code)} style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: `1px solid ${T.BOR}`,
              background: 'transparent',
              color: T.MUT,
              fontSize: 12,
              cursor: 'pointer'
            }}>
                      {t('ui.补打', '补打')}
                    </button>}
                </div>
              </div>)}
          </div>}
      </div>

      {/* 补打原因弹窗 */}
      {reprintTarget && <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--overlay-black-50)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 200
    }}>
          <div style={{
        background: T.CARD,
        borderRadius: 16,
        padding: 32,
        width: 400,
        border: `1px solid ${T.BOR}`
      }}>
            <div style={{
          fontSize: 16,
          fontWeight: 700,
          color: T.TXT,
          marginBottom: 4
        }}>{t('ui.补打原因', '补打原因')}</div>
            <div style={{
          fontSize: 12,
          color: T.MUT,
          marginBottom: 20
        }}>{reprintTarget} · {t('ui.必须选择原因', '必须选择原因')}</div>
            <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginBottom: 20
        }}>
              {REPRINT_REASON_KEYS.map(key => {
            const label = t(key, key.split('.').pop() ?? key);
            return <button type="button" key={key} onClick={() => setReprintReason(label)} style={{
              padding: '12px 16px',
              borderRadius: 8,
              cursor: 'pointer',
              textAlign: 'left',
              border: `2px solid ${reprintReason === label ? T.ACC : T.BOR}`,
              background: reprintReason === label ? 'var(--status-warning-bg-medium)' : 'var(--overlay-white-03)',
              color: reprintReason === label ? T.ACC : T.TXT,
              fontSize: 14
            }}>
                    {label}
                  </button>;
          })}
            </div>
            <div style={{
          display: 'flex',
          gap: 10
        }}>
              <button type="button" onClick={() => {
            setReprintTarget(null);
            setReprintReason('');
          }} style={{
            flex: 1,
            padding: '14px',
            background: 'transparent',
            border: `1px solid ${T.BOR}`,
            borderRadius: 8,
            color: T.MUT,
            fontSize: 15,
            cursor: 'pointer'
          }}>{t('common.cancel', '取消')}</button>
              <button type="button" onClick={handleReprint} disabled={!reprintReason || !!printing} style={{
            flex: 2,
            padding: '14px',
            background: reprintReason ? T.ACC : T.BOR,
            border: 'none',
            borderRadius: 8,
            color: reprintReason ? 'var(--bg-page)' : T.MUT,
            fontSize: 15,
            fontWeight: 700,
            cursor: reprintReason ? 'pointer' : 'not-allowed'
          }}>
                {printing ? t('ui.打印中', '打印中...') : t('ui.确认补打', '确认补打')}
              </button>
            </div>
          </div>
        </div>}

      <div style={{
      background: T.CARD,
      borderTop: `1px solid ${T.BOR}`,
      padding: '17px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexShrink: 0
    }}>
        <button type="button" onClick={() => router.push('/terminal/packaging/packing')} style={{
        padding: '9px 20px',
        borderRadius: 10,
        border: `1px solid ${T.BOR}`,
        background: 'transparent',
        color: T.MUT,
        fontSize: 15,
        cursor: 'pointer'
      }}>{t('common.back', '返回')}</button>
        <div style={{
        flex: 1,
        fontSize: 13,
        color: T.MUT
      }}>
          {allDone ? `✅ ${t('ui.全部标签已打印并校验', '全部标签已打印并校验')}` : boxes.length > 0 ? `${t('ui.还剩', '还剩')} ${boxes.filter(b => !b.verified).length} ${t('ui.个箱码待校验', '个箱码待校验')}` : ''}
        </div>
        <button type="button" onClick={() => router.push('/terminal/packaging/warehouse-handover')} disabled={!allDone} style={{
        padding: '9px 40px',
        borderRadius: 10,
        border: 'none',
        background: allDone ? T.GRN : T.BOR,
        color: allDone ? 'var(--bg-page)' : T.MUT,
        fontSize: 16,
        fontWeight: 700,
        cursor: allDone ? 'pointer' : 'not-allowed'
      }}>
          → {t('ui.前往入库', '前往入库')}
        </button>
      </div>
    </div>;
}