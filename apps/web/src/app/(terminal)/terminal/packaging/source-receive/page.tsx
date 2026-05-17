'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { crudApi } from '@/lib/api-client';
import { packagingApi } from '@/lib/packaging-api';
import { T } from '@/styles/terminal-theme';


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

const NUM_INPUT_STYLE = {
  width: '100%', background: 'rgba(255,255,255,0.06)',
  border: `1px solid ${T.BOR}`, borderRadius: 10,
  padding: '14px 16px', color: T.TXT,
  fontSize: 24, fontWeight: 700 as const,
  textAlign: 'right' as const, boxSizing: 'border-box' as const,
};

export default function EggCollectionPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const totalRef = useRef<HTMLInputElement>(null);

  const [houses, setHouses] = useState<House[]>([]);
  const [selectedHouse, setSelectedHouse] = useState<House | null>(null);
  const [totalQty, setTotalQty] = useState('');
  const [dirtyQty, setDirtyQty] = useState('');
  const [crackedQty, setCrackedQty] = useState('');
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

  const selectHouse = (h: House) => {
    setSelectedHouse(h);
    setTotalQty('');
    setDirtyQty('');
    setCrackedQty('');
    setTimeout(() => totalRef.current?.focus(), 50);
  };

  const handleSubmit = async () => {
    if (!canSubmit || !selectedHouse) return;
    setSubmitting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await packagingApi.receiveBatch({
        houseCode:    selectedHouse.house_code,
        houseName:    selectedHouse.house_name,
        layDate:      today,
        totalQty:     total,
        dirtyQty:     dirty,
        crackedQty:   cracked,
        receivedQty:  available,
        // 无批次号——由后端自动生成流水记录
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
      // 清空，准备录下一个鸡舍
      setSelectedHouse(null);
      setTotalQty('');
      setDirtyQty('');
      setCrackedQty('');
    } catch (e) {
      console.error('集蛋录入失败', e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.BG, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: T.CARD, borderBottom: `1px solid ${T.BOR}`, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 24 }}>🥚</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.TXT }}>{t('terminal.source_receive', '集蛋录入')}</div>
          <div style={{ fontSize: 12, color: T.MUT }}>
            {t('ui.按鸡舍逐一录入今日集蛋数量', '按鸡舍逐一录入今日集蛋数量')}
          </div>
        </div>
        {records.length > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.GRN, fontVariantNumeric: 'tabular-nums' }}>
              {totalAvailable.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: T.MUT }}>{t('ui.今日可分级枚', '今日可分级（枚）')}</div>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 0 }}>

        {/* ── 左侧：今日已录入记录 ── */}
        <div style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${T.BOR}`, overflowY: 'auto', background: '#0a1628', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 16px', fontSize: 11, color: T.MUT, fontWeight: 600, letterSpacing: 1, borderBottom: `1px solid ${T.BOR}`, position: 'sticky', top: 0, background: '#0a1628', zIndex: 1 }}>
            {t('ui.今日已录', '今日已录')}（{records.length} {t('ui.栋', '栋')}）
          </div>

          {records.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 }}>
              <div style={{ fontSize: 32 }}>📋</div>
              <div style={{ color: T.MUT, fontSize: 12, textAlign: 'center' }}>
                {t('ui.尚未录入任何鸡舍', '尚未录入\n任何鸡舍')}
              </div>
            </div>
          ) : (
            <>
              {records.map(r => (
                <div key={r.houseCode} style={{ padding: '12px 16px', borderBottom: `1px solid ${T.BOR}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 14 }}>✅</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.GRN }}>{r.houseName}</span>
                  </div>
                  <div style={{ fontSize: 11, color: T.MUT }}>
                    {t('ui.总计', '总计')} {r.totalQty.toLocaleString()} {t('ui.枚', '枚')}
                  </div>
                  {(r.dirtyQty > 0 || r.crackedQty > 0) && (
                    <div style={{ fontSize: 11, color: '#f97316' }}>
                      {t('ui.脏蛋', '脏')} {r.dirtyQty} · {t('ui.裂纹', '裂')} {r.crackedQty}
                    </div>
                  )}
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.GRN, marginTop: 4 }}>
                    → {r.availableQty.toLocaleString()} {t('ui.枚可分级', '枚可分级')}
                  </div>
                  <div style={{ fontSize: 10, color: T.MUT, marginTop: 2 }}>{r.submittedAt}</div>
                </div>
              ))}

              {/* 合计 */}
              <div style={{ padding: '12px 16px', background: 'rgba(34,197,94,0.08)', borderTop: `1px solid rgba(34,197,94,0.2)`, marginTop: 'auto' }}>
                <div style={{ fontSize: 11, color: T.MUT, marginBottom: 4 }}>{t('ui.今日合计', '今日合计')}</div>
                <div style={{ fontSize: 12, color: T.MUT }}>{t('ui.总采集', '总采集')} {totalCollected.toLocaleString()} {t('ui.枚', '枚')}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.GRN }}>
                  {t('ui.可分级', '可分级')} {totalAvailable.toLocaleString()} {t('ui.枚', '枚')}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── 右侧：录入表单 ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {/* 选择鸡舍 */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, color: T.MUT, fontWeight: 600, marginBottom: 12 }}>
              {t('ui.第一步选择鸡舍', '① 选择鸡舍')}
            </div>
            {houses.length === 0 ? (
              <div style={{ color: T.MUT, fontSize: 13 }}>{t('common.loading', '加载鸡舍列表...')}</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {houses.map(h => {
                  const done = records.some(r => r.houseCode === h.house_code);
                  const isSelected = selectedHouse?.house_code === h.house_code;
                  return (
                    <button key={h.id} onClick={() => !done && selectHouse(h)}
                      style={{
                        padding: '14px 22px', borderRadius: 12, fontSize: 15, fontWeight: 600,
                        cursor: done ? 'default' : 'pointer',
                        border: `2px solid ${isSelected ? T.ACC : done ? T.GRN : T.BOR}`,
                        background: isSelected ? `rgba(245,158,11,0.15)` : done ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)',
                        color: isSelected ? T.ACC : done ? T.GRN : T.TXT,
                        opacity: done ? 0.7 : 1,
                        position: 'relative',
                      }}>
                      {done && <span style={{ position: 'absolute', top: -6, right: -6, fontSize: 14 }}>✅</span>}
                      {h.house_name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 数量录入 */}
          {selectedHouse && (
            <div>
              <div style={{ fontSize: 13, color: T.MUT, fontWeight: 600, marginBottom: 12 }}>
                {t('ui.第二步录入数量', '② 录入数量')}
                <span style={{ marginLeft: 8, color: T.ACC, fontWeight: 700 }}>{selectedHouse.house_name}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
                {/* 总蛋数 */}
                <div style={{ background: T.CARD, borderRadius: 12, padding: 20, border: `1px solid ${T.BOR}` }}>
                  <div style={{ fontSize: 12, color: T.MUT, marginBottom: 8 }}>
                    {t('ui.总采集数', '总采集数（枚）')}
                  </div>
                  <input ref={totalRef} type="number" value={totalQty}
                    onChange={e => setTotalQty(e.target.value)}
                    placeholder="0"
                    style={NUM_INPUT_STYLE} />
                </div>

                {/* 脏蛋 */}
                <div style={{ background: T.CARD, borderRadius: 12, padding: 20, border: `1px solid ${T.BOR}` }}>
                  <div style={{ fontSize: 12, color: '#f97316', marginBottom: 8 }}>
                    {t('ui.脏蛋数', '脏蛋数（枚）')}
                  </div>
                  <input type="number" value={dirtyQty}
                    onChange={e => setDirtyQty(e.target.value)}
                    placeholder="0"
                    style={{ ...NUM_INPUT_STYLE, borderColor: dirtyQty ? 'rgba(249,115,22,0.5)' : T.BOR }} />
                </div>

                {/* 裂纹蛋 */}
                <div style={{ background: T.CARD, borderRadius: 12, padding: 20, border: `1px solid ${T.BOR}` }}>
                  <div style={{ fontSize: 12, color: '#f97316', marginBottom: 8 }}>
                    {t('ui.裂纹蛋数', '裂纹蛋数（枚）')}
                  </div>
                  <input type="number" value={crackedQty}
                    onChange={e => setCrackedQty(e.target.value)}
                    placeholder="0"
                    style={{ ...NUM_INPUT_STYLE, borderColor: crackedQty ? 'rgba(249,115,22,0.5)' : T.BOR }} />
                </div>
              </div>

              {/* 可分级结果 */}
              <div style={{
                background: available > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
                border: `2px solid ${available > 0 ? 'rgba(34,197,94,0.4)' : T.BOR}`,
                borderRadius: 14, padding: '20px 24px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 13, color: T.MUT, marginBottom: 4 }}>
                    {t('ui.可进入分级的蛋', '可进入分级的蛋')} = 总采集 − 脏蛋 − 裂纹蛋
                  </div>
                  <div style={{ fontSize: 12, color: T.MUT }}>
                    {total.toLocaleString()} − {dirty} − {cracked} =
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 48, fontWeight: 900, color: available > 0 ? T.GRN : T.BOR, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                    {available.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 13, color: T.MUT }}>{t('ui.枚', '枚')}</div>
                </div>
              </div>

              {alreadyRecorded && (
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', border: `1px solid rgba(245,158,11,0.3)`, fontSize: 13, color: T.ACC }}>
                  ⚠️ {selectedHouse.house_name} {t('ui.今日已录入', '今日已录入')}
                </div>
              )}
            </div>
          )}

          {!selectedHouse && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10, color: T.MUT }}>
              <div style={{ fontSize: 40 }}>☝️</div>
              <div style={{ fontSize: 15 }}>{t('ui.请先选择鸡舍', '请先点击上方选择鸡舍')}</div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ background: T.CARD, borderTop: `1px solid ${T.BOR}`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={() => router.push('/terminal/packaging/dashboard')}
          style={{ padding: '14px 24px', borderRadius: 10, border: `1px solid ${T.BOR}`, background: 'transparent', color: T.MUT, fontSize: 15, cursor: 'pointer' }}>
          {t('common.back', '返回')}
        </button>

        <button onClick={handleSubmit} disabled={!canSubmit || submitting}
          style={{
            padding: '14px 40px', borderRadius: 10, border: 'none',
            background: canSubmit ? T.ACC : T.BOR,
            color: canSubmit ? '#0f172a' : T.MUT,
            fontSize: 16, fontWeight: 700,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: submitting ? 0.7 : 1,
          }}>
          {submitting ? t('ui.提交中', '提交中...') : `✓ ${t('ui.确认录入', '确认录入')} ${selectedHouse?.house_name ?? ''}`}
        </button>

        <div style={{ flex: 1 }} />

        {records.length > 0 && (
          <button onClick={() => router.push('/terminal/packaging/grading')}
            style={{
              padding: '14px 32px', borderRadius: 10, border: 'none',
              background: T.GRN, color: '#0f172a', fontSize: 16, fontWeight: 700, cursor: 'pointer',
            }}>
            {t('ui.进入分级作业', '进入分级作业')} ({totalAvailable.toLocaleString()} {t('ui.枚', '枚')}) →
          </button>
        )}
      </div>
    </div>
  );
}
