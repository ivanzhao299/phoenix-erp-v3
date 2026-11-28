'use client';

import { useState, useEffect, useRef } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { packingHistoryRequest } from '@/lib/packing-history-api';
import { packagingApi, validShiftId } from '@/lib/packaging-api';
import { T } from '@/styles/terminal-theme';
import styles from './shift-close.module.css';
import { useProductGrades } from '@/hooks/useProductGrades';
export default function ShiftClosePage() {
  const router = useRouter();
  const {
    t
  } = useLanguage();
  const {
    ctx, hydrated, identityKey, contextError,
    clearWorkflowState,
    setShift
  } = useTerminalContext();
  const shift = ctx.currentShift;
  const { grades: productGrades } = useProductGrades();
  const [varianceReason, setVarianceReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [summary, setSummary] = useState({
    receivedQty: 0,
    receivedWeight: 0,
    gradedQty: 0,
    gradingOutputs: {} as Record<string, number>,
    packedBoxes: 0,
    packedEggs: 0,
    warehousedBoxes: 0,
    legacyHandoverBoxes:0,
    warehousedPallets: 0,
    sourceReconciliation: [] as Array<{batchCode:string;receivedQty:number;dirtyQty:number;crackedQty:number;gradingInputQty:number;ungradedQty:number|null;allocationStatus:string;otherLossStatus:string;rawReceiptQty:number|null;rawReceiptGradableQty:number|null;rawReceiptStatus:string;rawOverAllocatedQty:number;overAllocatedQty:number;routeConflict:boolean}>,
    exactCrossShiftPackedEggs: 0,
    ambiguousCrossShiftPackedEggs: 0,
    handlingHandoverBoxes: 0,
    handlingHandoverEggs: 0,
    unassignedHandoverBoxes: 0,
    reconciliationConflict: false,
    ambiguousCrossShiftPackings: [] as Array<{code:string;quantity:number;grading_codes:string[]}>,
    openExceptions: 0,
    closedExceptions: 0,
    closePreviewVersion: undefined as string | undefined,
  });
  const generation = useRef(0);
  const [loadedKey, setLoadedKey] = useState('');
  const selectionKey = `${identityKey}:${shift?.id}:${shift?.productionDate}`;
  useEffect(() => {
    const current = ++generation.current;
    let alive = true;
    const active = () => alive && current === generation.current;
    setLoadedKey(''); setShowConfirm(false); setVarianceReason(''); setSubmitError(''); setDone(false);
    if (!hydrated || !validShiftId(shift?.id) || shift?.status !== 'OPEN') {
      setLoading(false);
      return () => { alive = false; ++generation.current; };
    }
    const shiftId = shift?.id ? String(shift.id) : undefined;
    const productionDate = shift?.productionDate;
    setLoading(true);
    setLoadError('');
    Promise.all([
      packagingApi.getShiftSummary(productionDate, shiftId),
      packingHistoryRequest(`reports/production-summary?${new URLSearchParams({dateFrom:productionDate!,dateTo:productionDate!,aggregation:'SHIFT',shiftId:shiftId!})}`),
    ]).then(([data, report]) => {
      if (!active()) return;
      if (String(data.shift?.id) !== shiftId || data.shift?.status !== 'OPEN'
        || data.shift?.date_text !== productionDate || String(report.shiftId)!==shiftId || report.dateFrom!==productionDate) throw new Error('班次已关闭或读取结果不匹配，请重新选择');
      const gradingOutputs = data.gradingOutputs as Record<string, number>;
      const gradedQty = Object.values(gradingOutputs).reduce((sum, qty) => sum + Number(qty || 0), 0);
      const totalPacked = report.totalBoxes;
      const totalEggs = report.totalEggs;
      const received = data.receivedQty || 0;
      const sourceFacts: typeof summary.sourceReconciliation = data.closePreview?.source_reconciliation || [];
      const reconciliationConflict = sourceFacts.some(source => source.overAllocatedQty > 0
        || source.rawOverAllocatedQty > 0 || source.routeConflict || source.rawReceiptStatus === 'SCHEMA_UNAVAILABLE');
      setSummary({
        receivedQty: received,
        receivedWeight: data.receivedWeight || 0,
        gradedQty,
        gradingOutputs,
        packedBoxes: totalPacked,
        packedEggs: totalEggs,
        warehousedBoxes: report.committedBoxes,
        legacyHandoverBoxes:data.shiftWarehousedBoxes,
        warehousedPallets: data.shiftWarehousedPallets,
        sourceReconciliation: sourceFacts,
        exactCrossShiftPackedEggs: data.exactCrossShiftPackedEggs || 0,
        ambiguousCrossShiftPackedEggs: data.ambiguousCrossShiftPackedEggs || 0,
        handlingHandoverBoxes: data.handlingHandoverBoxes || 0,
        handlingHandoverEggs: data.handlingHandoverEggs || 0,
        unassignedHandoverBoxes: data.unassignedHandoverBoxes || 0,
        reconciliationConflict,
        ambiguousCrossShiftPackings: data.closePreview?.ambiguous_cross_shift_packings || [],
        openExceptions: data.closeOpenExceptionCount ?? data.openExceptionCount ?? 0,
        closedExceptions: data.closedExceptionCount || 0,
        closePreviewVersion: data.closePreviewVersion,
      });
      setLoadedKey(selectionKey); setLoadError('');
    }).catch((error: unknown) => {
      if (!active()) return;
      setLoadError(error instanceof Error ? error.message : t('ui.交班数据加载失败', '交班数据加载失败'));
    }).finally(() => { if (active()) setLoading(false); });
    return () => { alive = false; ++generation.current; };
  }, [hydrated, identityKey, selectionKey, reloadKey, shift?.id, shift?.productionDate, shift?.status, t]);
  const hasOpenException = summary.openExceptions > 0;
  const canClose = hydrated && validShiftId(shift?.id) && shift?.status === 'OPEN' && loadedKey === selectionKey && !loading && !loadError && !hasOpenException && !summary.reconciliationConflict;
  const handleClose = async () => {
    if (!canClose || !shift) {
      setSubmitError(t('ui.当前无开放班次无法交班', '当前无开放班次，无法交班'));
      return;
    }
    const requestGeneration = generation.current;
    setSubmitting(true);
    setSubmitError('');
    try {
      await packagingApi.closeShift(String(shift.id), {
        varianceReason,
        previewVersion: summary.closePreviewVersion
      });
      if (requestGeneration !== generation.current) return;
      // 更新 context：清工作流数据 + 将班次状态置为 CLOSED
      clearWorkflowState();
      setShift({
        ...shift,
        status: 'CLOSED',
        closedAt: new Date().toISOString()
      });
      setDone(true);
      setTimeout(() => router.push('/terminal/packaging/dashboard'), 2500);
    } catch (e: unknown) {
      if (requestGeneration !== generation.current) return;
      setSubmitError(e instanceof Error ? e.message : t('ui.交班失败请重试', '交班失败，请重试'));
    } finally {
      if (requestGeneration === generation.current) setSubmitting(false);
    }
  };

  // 无班次或已交班 — 提前拦截
  if (hydrated && !loading && (!validShiftId(shift?.id) || !shift || shift.status === 'CLOSED')) return <div style={{
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: T.BG,
    gap: 16
  }}>
      <div style={{
      fontSize: 56
    }}>📋</div>
      <div style={{
      fontSize: 20,
      fontWeight: 700,
      color: T.MUT
    }}>
        {contextError || (shift?.status === 'CLOSED' ? t('ui.该班次已交班', '该班次已交班') : t('ui.当前无开放班次', '当前无开放班次'))}
      </div>
      <button type="button" onClick={() => router.push('/terminal/packaging/dashboard')} style={{
      padding: '12px 32px',
      borderRadius: 10,
      border: `1px solid ${T.BOR}`,
      background: 'transparent',
      color: T.MUT,
      fontSize: 15,
      cursor: 'pointer'
    }}>
        {t('ui.返回作业台', '返回作业台')}
      </button>
    </div>;
  if (!hydrated || loading) return <div style={{
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: T.BG
  }}>
      <div style={{
      fontSize: 16,
      color: T.MUT
    }}>{t('ui.加载交班数据', '加载交班数据...')}</div>
    </div>;
  if (loadError) return <div role="alert" style={{
    height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', background: T.BG, gap: 16, padding: 24, textAlign: 'center'
  }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: T.RED }}>⚠️ {t('ui.交班数据加载失败', '交班数据加载失败')}</div>
      <div style={{ color: T.MUT }}>{loadError}</div>
      <button type="button" onClick={() => setReloadKey(key => key + 1)} style={{
        padding: '12px 28px', borderRadius: 10, border: `1px solid ${T.BOR}`,
        background: T.CARD, color: T.TXT, cursor: 'pointer'
      }}>{t('common.retry', '重试')}</button>
    </div>;
  if (done) return <div style={{
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: T.BG,
    gap: 16
  }}>
      <div style={{
      fontSize: 64
    }}>📋</div>
      <div style={{
      fontSize: 24,
      fontWeight: 700,
      color: T.GRN
    }}>{t('ui.交班完成', '交班完成')}</div>
      <div style={{
      color: T.MUT
    }}>{t('ui.班次', '班次')} {shift?.code || 'SHIFT-本班'} {t('ui.已关闭返回作业台', '已关闭，返回作业台...')}</div>
    </div>;
  return <div style={{
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: T.BG,
    overflow: 'hidden'
  }}>
      <div style={{
      background: T.CARD,
      borderBottom: `1px solid ${T.BOR}`,
      padding: '14px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexShrink: 0
    }}>
        <span className={u.fs24}>📋</span>
        <div className={u.flex1}>
          <div style={{
          fontSize: 18,
          fontWeight: 700,
          color: T.TXT
        }}>{t('terminal.shift_close', '交班日报')}</div>
          <div style={{
          fontSize: 12,
          color: T.MUT
        }}>{t('ui.班次', '班次')} {shift?.code || '--'} · {shift?.productionDate || '--'} · {shift?.lineName || shift?.lineId || 'Line-01'}</div>
        </div>
      </div>

      <div style={{
      flex: 1,
      overflowY: 'auto',
      minHeight: 0,
      padding: 24
    }}>
        <p>旧交接记录 {summary.legacyHandoverBoxes} 箱；包装和核实入账数量使用原单统一口径。<Link href="/terminal/packaging/history">查看原单统一交接与库存证据</Link></p><div className={styles.summaryGrid}>
          {/* 接收 */}
          <div style={{
          background: T.CARD,
          borderRadius: 12,
          padding: 16,
          border: `1px solid ${T.BOR}`
        }}>
            <div style={{
            fontSize: 12,
            color: T.MUT,
            marginBottom: 10,
            fontWeight: 600
          }}>📥 {t('ui.接收', '接收')}</div>
            {[[t('ui.接收总量', '接收总量'), `${summary.receivedQty.toLocaleString()} ${t('ui.枚', '枚')}`], [t('ui.接收重量', '接收重量'), `${summary.receivedWeight} kg`]].map(([k, v]) => <div key={k} style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 0',
            borderBottom: `1px solid var(--overlay-white-05)`,
            fontSize: 13
          }}>
                <span style={{
              color: T.MUT
            }}>{k}</span>
                <span style={{
              color: T.TXT,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums'
            }}>{v}</span>
              </div>)}
          </div>

          {/* 分级 */}
          <div style={{
          background: T.CARD,
          borderRadius: 12,
          padding: 16,
          border: `1px solid ${T.BOR}`
        }}>
            <div style={{
            fontSize: 12,
            color: T.MUT,
            marginBottom: 10,
            fontWeight: 600
          }}>📊 {t('ui.分级产出', '分级产出')}</div>
            {productGrades.map(grade => [
              grade.grade_name,
              Number(summary.gradingOutputs[grade.grade_code] || 0).toLocaleString(),
            ]).map(([k, v]) => <div key={k} style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '4px 0',
            borderBottom: `1px solid var(--overlay-white-05)`,
            fontSize: 12
          }}>
                <span style={{
              color: T.MUT
            }}>{k}</span>
                <span style={{
              color: T.TXT
            }}>{v} {t('ui.枚', '枚')}</span>
              </div>)}
          </div>

          {/* 来源勾稽：保留批次级已知损耗，并显式标注历史分配与其他损耗未知。 */}
          {summary.sourceReconciliation.length > 0 && <div style={{ gridColumn: '1 / -1', background: T.CARD, borderRadius: 12, padding: 16, border: `1px solid ${T.BOR}` }}>
            <div style={{ fontSize: 12, color: T.MUT, marginBottom: 10, fontWeight: 600 }}>{t('ui.来源批次勾稽', '来源批次勾稽')}</div>
            <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr>{[t('ui.来源批次','来源批次'),t('ui.接收','接收'),t('ui.RAW回执','RAW回执'),t('ui.脏蛋','脏蛋'),t('ui.裂纹蛋','裂纹蛋'),t('ui.分级投入','分级投入'),t('ui.未分级余量','未分级余量'),t('ui.分配状态','分配状态'),t('ui.其他损耗','其他损耗')].map(label => <th key={label} style={{ textAlign: 'left', color: T.MUT, padding: '6px 8px' }}>{label}</th>)}</tr></thead>
              <tbody>{summary.sourceReconciliation.map(row => <tr key={row.batchCode}>
                <td style={{ padding: '6px 8px', color: T.TXT }}>{row.batchCode}</td>
                <td style={{ padding: '6px 8px', color: T.TXT }}>{row.receivedQty}</td>
                <td style={{ padding: '6px 8px', color: row.rawReceiptStatus === 'ROUTE_CONFLICT_WITH_GRADING' || row.rawReceiptStatus === 'RAW_OVER_ALLOCATED' || row.rawReceiptStatus === 'SCHEMA_UNAVAILABLE' ? '#E7A944' : T.TXT }}>{row.rawReceiptQty === null ? t('ui.不可用','不可用') : `${row.rawReceiptQty}${row.rawOverAllocatedQty > 0 ? `（${t('ui.超额','超额')}${row.rawOverAllocatedQty}）` : ''}${row.routeConflict ? t('ui.双路径','（双路径）') : ''}`}</td>
                <td style={{ padding: '6px 8px', color: T.TXT }}>{row.dirtyQty}</td>
                <td style={{ padding: '6px 8px', color: T.TXT }}>{row.crackedQty}</td>
                <td style={{ padding: '6px 8px', color: T.TXT }}>{row.gradingInputQty}</td>
                <td style={{ padding: '6px 8px', color: T.TXT }}>{row.ungradedQty === null ? t('ui.未知','未知') : row.ungradedQty}</td>
                <td style={{ padding: '6px 8px', color: row.allocationStatus === 'EXACT' ? T.TXT : '#E7A944' }}>{row.allocationStatus === 'EXACT' ? t('ui.精确','精确') : t('ui.历史分配未知','历史分配未知')}</td>
                <td style={{ padding: '6px 8px', color: '#E7A944' }}>{row.otherLossStatus === 'NOT_RECORDED' ? t('ui.未记录','未记录') : row.otherLossStatus}</td>
              </tr>)}</tbody>
            </table></div>
            <div style={{ marginTop: 10, fontSize: 12, color: T.MUT }}>
              {t('ui.跨班包装','跨班包装')} {summary.exactCrossShiftPackedEggs.toLocaleString()} {t('ui.枚','枚')}（{t('ui.单一分级来源','单一分级来源')}）；{t('ui.多来源无法准确拆分','多来源无法准确拆分')} {summary.ambiguousCrossShiftPackedEggs.toLocaleString()} {t('ui.枚','枚')}。{t('ui.该统计不回写已封存交班凭据','该统计不回写已封存交班凭据。')}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: T.MUT }}>{t('ui.本班实际交库','本班实际交库')} {summary.handlingHandoverBoxes} {t('ui.箱','箱')} / {summary.handlingHandoverEggs.toLocaleString()} {t('ui.枚','枚')}；{t('ui.未能唯一归属处理班次的原单','未能唯一归属处理班次的原单')} {summary.unassignedHandoverBoxes} {t('ui.箱单独列示','箱单独列示。')}</div>
            {summary.reconciliationConflict && <div role="alert" style={{ marginTop: 6, fontSize: 12, color: '#E7A944' }}>{t('ui.来源存在超额分配RAW双路径冲突或回执结构不可用核实前不能交班','来源存在超额分配、RAW 双路径冲突或回执结构不可用，核实前不能交班。')}</div>}
            {summary.ambiguousCrossShiftPackings.length > 0 && <div style={{ marginTop: 6, fontSize: 12, color: '#E7A944' }}>{t('ui.多来源记录仅提示不重复计入精确量','多来源记录（仅提示，不重复计入精确量）：')}{summary.ambiguousCrossShiftPackings.map(p => `${p.code} ${p.quantity}枚 [${(p.grading_codes || []).join(', ')}]`).join('；')}</div>}
          </div>}

          {/* 包装入库 */}
          <div style={{
          background: T.CARD,
          borderRadius: 12,
          padding: 16,
          border: `1px solid ${T.BOR}`
        }}>
            <div style={{
            fontSize: 12,
            color: T.MUT,
            marginBottom: 10,
            fontWeight: 600
          }}>📦 {t('ui.包装入库', '包装 & 入库')}</div>
            {[[t('ui.已包装', '已包装'), `${summary.packedBoxes} ${t('ui.箱', '箱')}`], [t('ui.包装枚数', '包装枚数'), `${summary.packedEggs.toLocaleString()} ${t('ui.枚', '枚')}`], ['核实入账', `${summary.warehousedBoxes} ${t('ui.箱', '箱')}`], [t('ui.托盘数', '托盘数'), `${summary.warehousedPallets} ${t('ui.托', '托')}`]].map(([k, v]) => <div key={k} style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 0',
            borderBottom: `1px solid var(--overlay-white-05)`,
            fontSize: 13
          }}>
                <span style={{
              color: T.MUT
            }}>{k}</span>
                <span style={{
              color: T.TXT,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums'
            }}>{v}</span>
              </div>)}
          </div>
        </div>

        <div className={styles.detailGrid}>
          <div style={{
          background: T.CARD,
          borderRadius: 12,
          padding: 16,
          border: `1px solid ${hasOpenException ? 'var(--status-danger)' : T.BOR}`
        }}>
            <div style={{
            fontSize: 12,
            color: T.MUT,
            marginBottom: 10,
            fontWeight: 600
          }}>⚠️ {t('ui.异常汇总', '异常汇总')}</div>
            <div style={{
            fontSize: 14,
            color: T.TXT,
            marginBottom: 8
          }}>
              {t('ui.未关闭', '未关闭')} <strong style={{
              color: hasOpenException ? T.RED : T.GRN
            }}>{summary.openExceptions}</strong> {t('ui.条', '条')} /
              {t('ui.已关闭', '已关闭')} <strong style={{
              color: T.GRN
            }}>{summary.closedExceptions}</strong> {t('ui.条', '条')}
            </div>
            <div style={{
            overflow: 'hidden',
            maxHeight: hasOpenException ? 120 : 0
          }}>
              <div style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: 'var(--status-danger-bg-light)',
              border: `1px solid var(--status-danger-bg-strong)`,
              fontSize: 13,
              color: T.RED
            }}>
                ⚠️ {t('ui.存在未关闭异常必须先处理', '存在未关闭异常，必须先处理后才能交班')}
                <br />
                <button type="button" onClick={() => router.push('/terminal/packaging/exceptions')} style={{
                marginTop: 8,
                padding: '6px 14px',
                borderRadius: 6,
                border: `1px solid ${T.RED}`,
                background: 'transparent',
                color: T.RED,
                fontSize: 12,
                cursor: 'pointer'
              }}>
                  → {t('ui.去处理异常', '去处理异常')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{
      background: T.CARD,
      borderTop: `1px solid ${T.BOR}`,
      padding: '16px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      flexShrink: 0
    }}>
        {submitError && <div style={{
        background: 'var(--status-danger-bg-light)',
        border: '1px solid var(--status-danger-bg-strong)',
        borderRadius: 8,
        padding: '10px 16px',
        fontSize: 14,
        color: T.RED
      }}>
            ⚠️ {submitError}
          </div>}
        <input
          type="text"
          aria-label={t('ui.备注', '备注')}
          placeholder={t('ui.备注', '备注')}
          value={varianceReason}
          onChange={event => setVarianceReason(event.target.value)}
        />
        <div className={u.flexRow12}>
        <button type="button" onClick={() => router.push('/terminal/packaging/dashboard')} style={{
          padding: '14px 28px',
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
          color: canClose ? T.MUT : T.RED
        }}>
          {!canClose && `⚠️ ${t('ui.有未关闭异常不可交班', '有未关闭异常，不可交班')}`}
        </div>
        <button type="button" onClick={() => setShowConfirm(true)} disabled={!canClose || submitting} style={{
          padding: '14px 40px',
          borderRadius: 10,
          border: 'none',
          background: canClose ? T.ACC : T.BOR,
          color: canClose ? 'var(--bg-page)' : T.MUT,
          fontSize: 16,
          fontWeight: 700,
          cursor: canClose ? 'pointer' : 'not-allowed'
        }}>
          📋 {t('ui.提交交班', '提交交班')}
        </button>
        </div>
      </div>

      {showConfirm && <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--overlay-black-30)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 200
    }}>
          <div style={{
        background: T.CARD,
        borderRadius: 16,
        padding: 32,
        width: 360,
        maxWidth: 'calc(100vw - 32px)',
        border: `1px solid ${T.BOR}`,
        textAlign: 'center'
      }}>
            <div style={{
          fontSize: 48,
          marginBottom: 12
        }}>📋</div>
            <div style={{
          fontSize: 18,
          fontWeight: 700,
          color: T.TXT,
          marginBottom: 8
        }}>{t('ui.确认交班', '确认交班？')}</div>
            <div style={{
          fontSize: 13,
          color: T.MUT,
          marginBottom: 24
        }}>
              {t('ui.班次', '班次')} {shift?.code || 'SHIFT-本班'}<br />
              {shift?.productionDate || '--'} · {shift?.lineName || shift?.lineId || 'Line-01'}<br />
              {t('ui.共接收', '共接收')} {summary.receivedQty.toLocaleString()} {t('ui.枚', '枚')}，{t('ui.入库', '入库')} {summary.warehousedBoxes} {t('ui.箱', '箱')}
            </div>
            <div style={{
          display: 'flex',
          gap: 10
        }}>
              <button type="button" onClick={() => setShowConfirm(false)} style={{
            flex: 1,
            padding: '14px',
            background: 'transparent',
            border: `1px solid ${T.BOR}`,
            borderRadius: 8,
            color: T.MUT,
            fontSize: 15,
            cursor: 'pointer'
          }}>{t('common.cancel', '取消')}</button>
              <button type="button" disabled={!canClose || submitting} onClick={() => {
            setShowConfirm(false);
            handleClose();
          }} style={{
            flex: 2,
            padding: '14px',
            background: T.ACC,
            border: 'none',
            borderRadius: 8,
            color: 'var(--bg-page)',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer'
          }}>
                {t('ui.确认交班', '确认交班')}
              </button>
            </div>
          </div>
        </div>}
    </div>;
}
