'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Save, ChevronLeft, ChevronRight, Plus, Minus } from 'lucide-react';
import { mobileApi, FarmLog } from '@/lib/mobile-api';

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function toDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 聚合日志按栋舍
function aggregateByHouse(logs: FarmLog[]) {
  const map = new Map<string, { eggs: number; mortality: number; logIds: number[] }>();
  for (const r of logs) {
    const key = r.house_code || r.flock_no || '未知';
    const cur = map.get(key) ?? { eggs: 0, mortality: 0, logIds: [] };
    cur.eggs     += Number(r.eggs_produced  || 0);
    cur.mortality += Number(r.mortality_qty || 0);
    cur.logIds.push(r.id);
    map.set(key, cur);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

// 快速数字输入，带 +/- 步进按钮
function NumStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'white', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Minus size={14} />
      </button>
      <input
        type="number" inputMode="numeric" min="0"
        value={value || ''}
        onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
        placeholder="0"
        style={{
          width: 64, height: 32, textAlign: 'center',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, color: 'white', fontSize: 16, fontWeight: 700,
          outline: 'none', WebkitAppearance: 'none',
        }}
      />
      <button
        onClick={() => onChange(value + 1)}
        style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'white', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

export default function MortalityPage() {
  const router = useRouter();
  const today  = fmtDate(new Date());

  const [date, setDate]       = useState(today);
  const [logs, setLogs]       = useState<FarmLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');
  const [permErr, setPermErr] = useState(false);

  // 简单的编辑状态：栋舍 → 死淘数
  const [mortEdits, setMortEdits] = useState<Record<string, number>>({});
  // 新增一栋
  const [newHouse, setNewHouse]   = useState('');

  const isToday  = date === today;
  const dateLabel = isToday ? '今天' : date === fmtDate(addDays(toDate(today), -1)) ? '昨天' : date;

  const loadData = useCallback(async (d: string) => {
    setLoading(true);
    setError('');
    setPermErr(false);
    setSaved(false);
    try {
      const res = await mobileApi.getFarmLogs(d);
      const arr: FarmLog[] = Array.isArray(res) ? res : (res as any)?.data ?? [];
      setLogs(arr);
      // 初始化编辑态
      const init: Record<string, number> = {};
      const agg = aggregateByHouse(arr);
      for (const [house, v] of agg) init[house] = v.mortality;
      setMortEdits(init);
    } catch (e: any) {
      if (e.message?.includes('403')) setPermErr(true);
      else setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(date); }, [date, loadData]);

  const houseList = Object.keys(mortEdits).sort();
  const totalMort = houseList.reduce((s, h) => s + (mortEdits[h] ?? 0), 0);

  const handleAddHouse = () => {
    const h = newHouse.trim();
    if (!h || mortEdits[h] !== undefined) return;
    setMortEdits(p => ({ ...p, [h]: 0 }));
    setNewHouse('');
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') || '' : '';

    try {
      // 对每个栋舍提交/更新日志（尝试 POST，冲突时找到现有记录 PUT）
      const results = await Promise.allSettled(
        houseList.map(house =>
          fetch(`${API_BASE}/api/v3/farm/daily-logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              flock_no:     house,
              house_code:   house,
              log_date:     date,
              shift:        'ALL',
              eggs_produced: logs.find(l => (l.house_code || l.flock_no) === house)
                ? logs.filter(l => (l.house_code || l.flock_no) === house).reduce((s, r) => s + Number(r.eggs_produced || 0), 0)
                : 0,
              mortality_qty: mortEdits[house] ?? 0,
              operator: 'mobile',
            }),
          }).then(r => r.json())
        )
      );

      const anyFail = results.some(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value?.code && r.value.code !== 200));
      if (!anyFail) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError('部分记录保存失败，请重试');
      }
    } catch (e: any) {
      setError(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      minHeight: '100svh',
      background: 'linear-gradient(160deg,#070b14 0%,#0f1929 100%)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* 头部 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'calc(env(safe-area-inset-top) + 14px) 16px 14px',
        background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 4 }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'white', flex: 1 }}>💀 死淘快录</span>
        <button onClick={() => loadData(date)}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 4 }}>
          <RefreshCw size={16} />
        </button>
        <button
          onClick={handleSave}
          disabled={saving || loading || permErr}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '8px 14px', borderRadius: 10,
            background: saved ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.15)',
            border: `1px solid ${saved ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.35)'}`,
            color: saved ? '#10b981' : '#f59e0b',
            cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 700,
          }}
        >
          <Save size={14} />
          {saving ? '提交中…' : saved ? '已保存' : '保存'}
        </button>
      </div>

      {/* 日期 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'rgba(239,68,68,0.04)',
        borderBottom: '1px solid rgba(239,68,68,0.1)',
      }}>
        <button onClick={() => setDate(d => fmtDate(addDays(toDate(d), -1)))}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 6 }}>
          <ChevronLeft size={20} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{dateLabel}</div>
          {dateLabel !== date && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{date}</div>}
        </div>
        <button onClick={() => { if (!isToday) setDate(d => fmtDate(addDays(toDate(d), 1))); }} disabled={isToday}
          style={{ background: 'none', border: 'none', color: isToday ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.6)', cursor: isToday ? 'default' : 'pointer', padding: 6 }}>
          <ChevronRight size={20} />
        </button>
      </div>

      {/* 内容 */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 16px',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
      }}>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>

        {/* 汇总统计 */}
        {!loading && !permErr && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderRadius: 14, marginBottom: 12,
            background: totalMort > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.06)',
            border: `1px solid ${totalMort > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.2)'}`,
          }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
              今日合计 · {houseList.length} 栋上报
            </span>
            <span style={{ fontSize: 22, fontWeight: 800, color: totalMort > 0 ? '#f87171' : '#10b981' }}>
              {totalMort} 只
            </span>
          </div>
        )}

        {permErr && (
          <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
            权限不足（需要农场经理或管理员权限）
          </div>
        )}

        {error && (
          <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ height: 60, borderRadius: 14, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>
        ) : !permErr && (
          <>
            {/* 各栋死淘输入 */}
            {houseList.map(house => (
              <div key={house} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: 14, marginBottom: 8,
                background: (mortEdits[house] ?? 0) > 0 ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${(mortEdits[house] ?? 0) > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.07)'}`,
              }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{house}</div>
                  {(mortEdits[house] ?? 0) > 10 && (
                    <div style={{ fontSize: 11, color: '#f87171', marginTop: 2 }}>⚠ 数量较大，请确认</div>
                  )}
                </div>
                <NumStepper
                  value={mortEdits[house] ?? 0}
                  onChange={v => { setMortEdits(p => ({ ...p, [house]: v })); setSaved(false); }}
                />
              </div>
            ))}

            {/* 添加新栋舍 */}
            <div style={{
              display: 'flex', gap: 8, marginTop: 4, padding: '10px 14px',
              borderRadius: 14, background: 'rgba(255,255,255,0.02)',
              border: '1px dashed rgba(255,255,255,0.1)',
            }}>
              <input
                type="text"
                value={newHouse}
                onChange={e => setNewHouse(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddHouse()}
                placeholder="添加栋舍（如：7号舍）"
                style={{
                  flex: 1, height: 36, padding: '0 10px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, color: 'white', fontSize: 13, outline: 'none',
                }}
              />
              <button
                onClick={handleAddHouse}
                style={{
                  padding: '0 14px', borderRadius: 8,
                  background: 'rgba(245,158,11,0.15)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  color: '#f59e0b', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                }}
              >
                添加
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
