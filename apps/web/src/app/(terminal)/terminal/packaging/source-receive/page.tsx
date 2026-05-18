'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { crudApi } from '@/lib/api-client';
import { packagingApi } from '@/lib/packaging-api';
import { T } from '@/styles/terminal-theme';
import NumPad from '@/components/terminal/NumPad';


interface House { id: number; house_code: string; house_name: string; capacity?: number; }

interface CollectionRecord {
  houseCode: string;
  houseName: string;
  totalQty: number;
  dirtyQty: number;
  crackedQty: number;
  availableQty: number;
  submittedAt: string;
}

type NumField = 'total' | 'dirty' | 'cracked';

const FIELDS: { key: NumField; labelKey: string; labelFb: string; accent: string }[] = [
  { key: 'total',   labelKey: 'ui.总采集数',  labelFb: '总采集数（枚）', accent: T.GRN },
  { key: 'dirty',   labelKey: 'ui.脏蛋数',    labelFb: '脏蛋数（枚）',   accent: '#f97316' },
  { key: 'cracked', labelKey: 'ui.裂纹蛋数',  labelFb: '裂纹蛋数（枚）', accent: '#f97316' },
];

export default function EggCollectionPage() {
  const router = useRouter();
  const { t } = useLanguage();

  const [houses, setHouses] = useState<House[]>([]);
  const [selectedHouse, setSelectedHouse] = useState<House | null>(null);
  const [totalQty, setTotalQty]     = useState('');
  const [dirtyQty, setDirtyQty]     = useState('');
  const [crackedQty, setCrackedQty] = useState('');
  const [numPadField, setNumPadField] = useState<NumField>('total');
  const [records, setRecords] = useState<CollectionRecord[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    crudApi.list<House>('brd_houses', { limit: 50 } as never)
      .then(res => setHouses(res.data || []))
      .catch(() => {});
  }, []);

  const total     = parseInt(totalQty)   || 0;
  const dirty     = parseInt(dirtyQty)   || 0;
  const cracked   = parseInt(crackedQty) || 0;
  const available = Math.max(0, total - dirty - cracked);

  const totalAvailable = records.reduce((s, r) => s + r.availableQty, 0);
  const totalCollected = records.reduce((s, r) => s + r.totalQty, 0);

  const alreadyRecorded = selectedHouse
    ? records.some(r => r.houseCode === selectedHouse.house_code)
    : false;
  const canSubmit = !!selectedHouse && total > 0 && !alreadyRecorded;

  const fieldValues: Record<NumField, string> = {
    total: totalQty, dirty: dirtyQty, cracked: crackedQty,
  };

  const selectHouse = (h: House) => {
    setSelectedHouse(h);
    setTotalQty('');
    setDirtyQty('');
    setCrackedQty('');
    setNumPadField('total');
  };

  const handleNumPadChange = (val: string) => {
    if (numPadField === 'total')   setTotalQty(val);
    if (numPadField === 'dirty')   setDirtyQty(val);
    if (numPadField === 'cracked') setCrackedQty(val);
  };

  const handleSubmit = async () => {
    if (!canSubmit || !selectedHouse) return;
    setSubmitting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await packagingApi.receiveBatch({
        houseCode:   selectedHouse.house_code,
        houseName:   selectedHouse.house_name,
        layDate:     today,
        totalQty:    total,
        dirtyQty:    dirty,
        crackedQty:  cracked,
        receivedQty: available,
      });
      setRecords(prev => [...prev, {
        houseCode:    selectedHouse.house_code,
        houseName:    selectedHouse.house_name,
        totalQty:     total,
        dirtyQty:     dirty,
        crackedQty:   cracked,
        availableQty: available,
        submittedAt:  new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      }]);
      setSelectedHouse(null);
      setTotalQty('');
      setDirtyQty('');
      setCrackedQty('');
      setNumPadField('total');
    } catch (e) {
      console.error('集蛋录入失败', e);
    } finally {
      setSubmitting(false);
    }
  };

  const activeField = FIELDS.find(f => f.key === numPadField)!;
  const activeAccent = activeField.accent;
  const numpadInitial = fieldValues[numPadField] || '';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.BG, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: T.CARD, borderBottom: `1px solid ${T.BOR}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 22 }}>🥚</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.TXT }}>{t('terminal.source_receive', '集蛋录入')}</div>
          <div style={{ fontSize: 11, color: T.MUT }}>{t('ui.按鸡舍逐一录入今日集蛋数量', '按鸡舍逐一录入今日集蛋数量')}</div>
        </div>
        {records.length > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.GRN, fontVariantNumeric: 'tabular-nums' }}>
              {totalAvailable.toLocaleString()}
            </div>
            <div style={{ fontSize: 10, color: T.MUT }}>{t('ui.今日可分级枚', '今日可分级（枚）')}</div>
          </div>
        )}
      </div>

      {/* Body: records | form | numpad */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* ── Left: today's records ── */}
        <div style={{ width: 200, flexShrink: 0, borderRight: `1px solid ${T.BOR}`, overflowY: 'auto', background: '#0a1628', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 14px', fontSize: 10, color: T.MUT, fontWeight: 700, letterSpacing: 1.5, borderBottom: `1px solid ${T.BOR}`, position: 'sticky', top: 0, background: '#0a1628', zIndex: 1, textTransform: 'uppercase' }}>
            {t('ui.今日已录', '今日已录')}（{records.length} {t('ui.栋', '栋')}）
          </div>

          {records.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 6 }}>
              <div style={{ fontSize: 28 }}>📋</div>
              <div style={{ color: T.MUT, fontSize: 11, textAlign: 'center' }}>
                {t('ui.尚未录入任何鸡舍', '尚未录入\n任何鸡舍')}
              </div>
            </div>
          ) : (
            <>
              {records.map(r => (
                <div key={r.houseCode} style={{ padding: '10px 14px', borderBottom: `1px solid ${T.BOR}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                    <span style={{ fontSize: 12 }}>✅</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.GRN }}>{r.houseName}</span>
                  </div>
                  <div style={{ fontSize: 10, color: T.MUT }}>
                    {t('ui.总计', '总计')} {r.totalQty.toLocaleString()} {t('ui.枚', '枚')}
                  </div>
                  {(r.dirtyQty > 0 || r.crackedQty > 0) && (
                    <div style={{ fontSize: 10, color: '#f97316' }}>
                      {t('ui.脏蛋', '脏')} {r.dirtyQty} · {t('ui.裂纹', '裂')} {r.crackedQty}
                    </div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.GRN, marginTop: 3 }}>
                    → {r.availableQty.toLocaleString()} {t('ui.枚可分级', '枚可分级')}
                  </div>
                  <div style={{ fontSize: 9, color: T.MUT, marginTop: 1 }}>{r.submittedAt}</div>
                </div>
              ))}
              <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', borderTop: `1px solid rgba(34,197,94,0.2)`, marginTop: 'auto' }}>
                <div style={{ fontSize: 10, color: T.MUT, marginBottom: 2 }}>{t('ui.今日合计', '今日合计')}</div>
                <div style={{ fontSize: 10, color: T.MUT }}>{t('ui.总采集', '总采集')} {totalCollected.toLocaleString()} {t('ui.枚', '枚')}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.GRN }}>
                  {t('ui.可分级', '可分级')} {totalAvailable.toLocaleString()} {t('ui.枚', '枚')}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Center: house selection + field cards ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>

          {/* 选择鸡舍 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: T.MUT, fontWeight: 700, marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
              ① {t('ui.第一步选择鸡舍', '选择鸡舍')}
            </div>
            {houses.length === 0 ? (
              <div style={{ color: T.MUT, fontSize: 12 }}>{t('common.loading', '加载鸡舍列表...')}</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {houses.map(h => {
                  const done = records.some(r => r.houseCode === h.house_code);
                  const isSelected = selectedHouse?.house_code === h.house_code;
                  return (
                    <button type="button" key={h.id}
                      onPointerDown={() => !done && selectHouse(h)}
                      style={{
                        padding: '12px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                        cursor: done ? 'default' : 'pointer',
                        border: `2px solid ${isSelected ? T.ACC : done ? T.GRN : T.BOR}`,
                        background: isSelected ? `rgba(245,158,11,0.15)` : done ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)',
                        color: isSelected ? T.ACC : done ? T.GRN : T.TXT,
                        opacity: done ? 0.8 : 1,
                        position: 'relative',
                        WebkitTapHighlightColor: 'transparent',
                      }}>
                      {done && <span style={{ position: 'absolute', top: -5, right: -5, fontSize: 12 }}>✅</span>}
                      {h.house_name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 数量录入字段卡片 */}
          {selectedHouse && (
            <div>
              <div style={{ fontSize: 11, color: T.MUT, fontWeight: 700, marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
                ② {t('ui.第二步录入数量', '录入数量')}
                <span style={{ marginLeft: 8, color: T.ACC, fontWeight: 700, textTransform: 'none' }}>{selectedHouse.house_name}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {FIELDS.map(({ key, labelKey, labelFb, accent }) => {
                  const val = fieldValues[key];
                  const isActive = numPadField === key;
                  return (
                    <button type="button" key={key}
                      onPointerDown={() => setNumPadField(key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 16,
                        background: isActive ? `${accent}12` : T.CARD,
                        borderRadius: 12, padding: '14px 18px',
                        border: `2px solid ${isActive ? accent : val ? accent + '50' : T.BOR}`,
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'all 0.12s',
                        WebkitTapHighlightColor: 'transparent',
                      }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: isActive ? accent : T.BOR, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: isActive ? accent : T.MUT, fontWeight: 600 }}>
                          {t(labelKey, labelFb)}
                        </div>
                      </div>
                      <div style={{
                        fontSize: 36, fontWeight: 900, lineHeight: 1,
                        color: val ? accent : isActive ? `${accent}50` : T.BOR,
                        fontVariantNumeric: 'tabular-nums',
                        minWidth: 80, textAlign: 'right',
                      }}>
                        {val || '0'}
                      </div>
                      <div style={{ fontSize: 10, color: T.MUT }}>{t('ui.枚', '枚')}</div>
                    </button>
                  );
                })}
              </div>

              {/* 可分级结果 */}
              <div style={{
                background: available > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
                border: `2px solid ${available > 0 ? 'rgba(34,197,94,0.4)' : T.BOR}`,
                borderRadius: 12, padding: '14px 18px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 12, color: T.MUT, marginBottom: 3 }}>
                    {t('ui.可进入分级的蛋', '可进入分级的蛋')} = 总 − 脏 − 裂纹
                  </div>
                  <div style={{ fontSize: 11, color: T.MUT }}>
                    {total.toLocaleString()} − {dirty} − {cracked} =
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 44, fontWeight: 900, color: available > 0 ? T.GRN : T.BOR, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                    {available.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: T.MUT }}>{t('ui.枚', '枚')}</div>
                </div>
              </div>

              {alreadyRecorded && (
                <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', border: `1px solid rgba(245,158,11,0.3)`, fontSize: 12, color: T.ACC }}>
                  ⚠️ {selectedHouse.house_name} {t('ui.今日已录入', '今日已录入')}
                </div>
              )}
            </div>
          )}

          {!selectedHouse && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, gap: 8, color: T.MUT }}>
              <div style={{ fontSize: 36 }}>☝️</div>
              <div style={{ fontSize: 13 }}>{t('ui.请先选择鸡舍', '请先点击上方选择鸡舍')}</div>
            </div>
          )}
        </div>

        {/* ── Right: fixed NumPad ── */}
        <div style={{
          width: 310, flexShrink: 0, borderLeft: `1px solid ${T.BOR}`,
          padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
          background: '#0a1628',
        }}>
          {/* Active field indicator */}
          <div style={{
            background: `${activeAccent}12`,
            border: `1px solid ${activeAccent}40`,
            borderRadius: 10, padding: '9px 12px',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: T.MUT, marginBottom: 1 }}>{t('ui.当前录入', '当前录入')}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: activeAccent }}>
                {t(activeField.labelKey, activeField.labelFb)}
              </div>
            </div>
            {!selectedHouse && (
              <div style={{ fontSize: 10, color: T.MUT }}>{t('ui.请先选鸡舍', '请先选鸡舍')}</div>
            )}
          </div>

          <NumPad
            key={numPadField}
            initialValue={numpadInitial}
            accentColor={activeAccent}
            disabled={!selectedHouse}
            onChange={handleNumPadChange}
          />
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ background: T.CARD, borderTop: `1px solid ${T.BOR}`, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button type="button" onClick={() => router.push('/terminal/packaging/dashboard')}
          style={{ padding: '12px 20px', borderRadius: 10, border: `1px solid ${T.BOR}`, background: 'transparent', color: T.MUT, fontSize: 14, cursor: 'pointer' }}>
          {t('common.back', '返回')}
        </button>

        <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting}
          style={{
            padding: '12px 36px', borderRadius: 10, border: 'none',
            background: canSubmit ? T.ACC : T.BOR,
            color: canSubmit ? '#0f172a' : T.MUT,
            fontSize: 15, fontWeight: 700,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: submitting ? 0.7 : 1,
          }}>
          {submitting ? t('ui.提交中', '提交中...') : `✓ ${t('ui.确认录入', '确认录入')} ${selectedHouse?.house_name ?? ''}`}
        </button>

        <div style={{ flex: 1 }} />

        {records.length > 0 && (
          <button type="button" onClick={() => router.push('/terminal/packaging/grading')}
            style={{
              padding: '12px 28px', borderRadius: 10, border: 'none',
              background: T.GRN, color: '#0f172a', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}>
            {t('ui.进入分级作业', '进入分级作业')} ({totalAvailable.toLocaleString()} {t('ui.枚', '枚')}) →
          </button>
        )}
      </div>
    </div>
  );
}
