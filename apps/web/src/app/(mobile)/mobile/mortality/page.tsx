'use client';

import { useState, useEffect, useCallback } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Save, ChevronLeft, ChevronRight, Plus, Minus, Sun, Moon } from 'lucide-react';
import { mobileApi, FarmLog } from '@/lib/mobile-api';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { useToast } from '@/contexts/ToastContext';
import { haptic } from '@/lib/haptic';
import { MobileEmptyState } from '@/components/mobile/MobileSkeleton';
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
function aggregateByHouse(logs: FarmLog[]) {
  const map = new Map<string, {
    eggs: number;
    mortality: number;
    elimination: number;
    reason: string;
  }>();
  for (const r of logs) {
    const key = r.house_code || r.flock_no || '未知';
    const cur = map.get(key) ?? {
      eggs: 0,
      mortality: 0,
      elimination: 0,
      reason: ''
    };
    cur.eggs += Number(r.eggs_produced || 0);
    cur.mortality += Number(r.mortality_qty || 0);
    cur.elimination += Number((r as any).elimination_qty || 0);
    if ((r as any).culling_reason) cur.reason = (r as any).culling_reason;
    map.set(key, cur);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}
function NumStepper({
  value,
  onChange
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const {
    t
  } = useMobileTheme();
  return <div className={u.flexRow}>
      <button onClick={() => onChange(Math.max(0, value - 1))} style={{
      width: 32,
      height: 32,
      borderRadius: 8,
      border: `1px solid ${t.inputBorder}`,
      background: t.sectionBg,
      color: t.text,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
        <Minus size={14} />
      </button>
      <input type="number" inputMode="numeric" min="0" value={value || ''} onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))} placeholder="0" style={{
      width: 64,
      height: 32,
      textAlign: 'center',
      background: t.inputBg,
      border: `1px solid ${t.inputBorder}`,
      borderRadius: 8,
      color: t.text,
      fontSize: 16,
      fontWeight: 700,
      outline: 'none',
      WebkitAppearance: 'none'
    }} />
      <button onClick={() => onChange(value + 1)} style={{
      width: 32,
      height: 32,
      borderRadius: 8,
      border: `1px solid ${t.inputBorder}`,
      background: t.sectionBg,
      color: t.text,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
        <Plus size={14} />
      </button>
    </div>;
}
export default function MortalityPage() {
  const router = useRouter();
  const {
    isDark,
    toggle,
    t
  } = useMobileTheme();
  const {
    allowed,
    loading: permLoading,
    readonly
  } = useMobilePermission('mortality');
  const toast = useToast();
  const today = fmtDate(new Date());
  const [date, setDate] = useState(today);
  const [logs, setLogs] = useState<FarmLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [permErr, setPermErr] = useState(false);
  const [mortEdits, setMortEdits] = useState<Record<string, number>>({});
  const [elimEdits, setElimEdits] = useState<Record<string, number>>({});
  const [reasonEdits, setReasonEdits] = useState<Record<string, string>>({});
  const [newHouse, setNewHouse] = useState('');
  // 全部鸡舍（按 DataScope 过滤的真实栋舍，供"添加栋舍"下拉，杜绝手填错码）
  const [allHouses, setAllHouses] = useState<{ house_code: string; house_name?: string | null }[]>([]);
  const isToday = date === today;
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
      const initMort: Record<string, number> = {};
      const initElim: Record<string, number> = {};
      const initReason: Record<string, string> = {};
      for (const [house, v] of aggregateByHouse(arr)) {
        initMort[house] = v.mortality;
        initElim[house] = v.elimination;
        initReason[house] = v.reason;
      }
      setMortEdits(initMort);
      setElimEdits(initElim);
      setReasonEdits(initReason);
    } catch (e: any) {
      if (e.message?.includes('403')) setPermErr(true);else setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    loadData(date);
  }, [date, loadData]);
  useEffect(() => {
    mobileApi.getFeedHousesDetail()
      .then((rows: any) => setAllHouses(Array.isArray(rows) ? rows : (rows?.data ?? [])))
      .catch(() => {});
  }, []);
  if (permLoading || !allowed) return null;
  const houseList = [...new Set([...Object.keys(mortEdits), ...Object.keys(elimEdits)])].sort();
  const totalMort = houseList.reduce((s, h) => s + (mortEdits[h] ?? 0), 0);
  const totalElim = houseList.reduce((s, h) => s + (elimEdits[h] ?? 0), 0);
  const totalLoss = totalMort + totalElim;
  const handleAddHouse = () => {
    const h = newHouse.trim();
    if (!h || mortEdits[h] !== undefined) return;
    setMortEdits(p => ({
      ...p,
      [h]: 0
    }));
    setElimEdits(p => ({
      ...p,
      [h]: 0
    }));
    setReasonEdits(p => ({
      ...p,
      [h]: ''
    }));
    setNewHouse('');
  };
  const handleSave = async () => {
    setSaving(true);
    setError('');
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') || '' : '';
    try {
      const results = await Promise.allSettled(houseList.map(house => {
        const existingEggs = logs.filter(l => (l.house_code || l.flock_no) === house).reduce((s, r) => s + Number(r.eggs_produced || 0), 0);
        return fetch(`${API_BASE}/api/v3/farm/daily-logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            flock_no: house,
            house_code: house,
            log_date: date,
            shift: 'ALL',
            eggs_produced: existingEggs,
            mortality_qty: mortEdits[house] ?? 0,
            mortality_reason: reasonEdits[house] || null,  // G22-4：与 PC G19-A 对齐
            elimination_qty: elimEdits[house] ?? 0,
            culling_reason: reasonEdits[house] || null,    // mobile 死淘共用一个 reason 字段
            operator: 'mobile'
          })
        }).then(r => r.json());
      }));
      const anyFail = results.some(r => r.status === 'rejected' || r.status === 'fulfilled' && r.value?.code && r.value.code !== 200);
      if (!anyFail) {
        haptic('success');
        toast.success('死淘记录保存成功');
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError('部分记录保存失败，请重试');
      }
    } catch (e: any) {
      haptic('error');
      toast.error(e.message || '保存失败');
      setError(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };
  return <div style={{
    minHeight: '100svh',
    background: t.pageBg,
    display: 'flex',
    flexDirection: 'column'
  }}>
      {/* 头部 */}
      <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: 'calc(env(safe-area-inset-top) + 14px) 16px 14px',
      background: t.appBarBg,
      backdropFilter: 'blur(20px)',
      borderBottom: `1px solid ${t.barBorder}`,
      position: 'sticky',
      top: 0,
      zIndex: 10
    }}>
        <button onClick={() => router.back()} style={{
        background: 'none',
        border: 'none',
        color: t.textSub,
        cursor: 'pointer',
        padding: 4
      }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{
        fontSize: 15,
        fontWeight: 700,
        color: t.text,
        flex: 1
      }}>💀 死淘快录</span>
        <button onClick={() => loadData(date)} style={{
        background: 'none',
        border: 'none',
        color: t.textMuted,
        cursor: 'pointer',
        padding: 4
      }}>
          <RefreshCw size={16} />
        </button>
        <button onClick={toggle} style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 6,
        color: t.textSub,
        display: 'flex',
        alignItems: 'center'
      }}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button onClick={handleSave} disabled={saving || loading || permErr} style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '8px 14px',
        borderRadius: 10,
        background: saved ? 'var(--status-success-bg-strong)' : 'var(--status-warning-bg-medium)',
        border: `1px solid ${saved ? 'var(--status-success)' : 'var(--status-warning-bg-strong)'}`,
        color: saved ? 'var(--status-success)' : 'var(--status-warning)',
        cursor: saving ? 'wait' : 'pointer',
        fontSize: 13,
        fontWeight: 700
      }}>
          <Save size={14} />
          {saving ? '提交中…' : saved ? '已保存' : '保存'}
        </button>
      </div>

      {/* 日期导航 */}
      <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 16px',
      background: 'var(--status-danger-bg-page)',
      borderBottom: '1px solid var(--status-danger-bg-light)'
    }}>
        <button onClick={() => setDate(d => fmtDate(addDays(toDate(d), -1)))} style={{
        background: 'none',
        border: 'none',
        color: t.textSub,
        cursor: 'pointer',
        padding: 6
      }}>
          <ChevronLeft size={20} />
        </button>
        <div className={u.tac}>
          <div style={{
          fontSize: 15,
          fontWeight: 700,
          color: t.text
        }}>{dateLabel}</div>
          {dateLabel !== date && <div style={{
          fontSize: 11,
          color: t.textMuted
        }}>{date}</div>}
        </div>
        <button onClick={() => {
        if (!isToday) setDate(d => fmtDate(addDays(toDate(d), 1)));
      }} disabled={isToday} style={{
        background: 'none',
        border: 'none',
        color: isToday ? t.textFaint : t.textSub,
        cursor: isToday ? 'default' : 'pointer',
        padding: 6
      }}>
          <ChevronRight size={20} />
        </button>
      </div>

      {/* 内容区 */}
      <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '12px 16px',
      paddingBottom: 'calc(24px + env(safe-area-inset-bottom))'
    }}>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>

        {/* 汇总统计 */}
        {!loading && !permErr && <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
        marginBottom: 12
      }}>
            <div style={{
          padding: '12px 14px',
          borderRadius: 14,
          background: totalMort > 0 ? 'var(--status-danger-bg-faint)' : 'var(--status-success-bg-faint)',
          border: `1px solid ${totalMort > 0 ? 'var(--status-danger-bg-medium)' : 'var(--status-success-bg-strong)'}`
        }}>
              <div style={{
            fontSize: 11,
            color: t.textMuted,
            marginBottom: 4
          }}>死亡合计</div>
              <div style={{
            fontSize: 22,
            fontWeight: 800,
            color: totalMort > 0 ? 'var(--status-danger)' : 'var(--status-success)'
          }}>{totalMort} 只</div>
            </div>
            <div style={{
          padding: '12px 14px',
          borderRadius: 14,
          background: totalElim > 0 ? 'var(--status-warning-bg-faint)' : 'var(--status-success-bg-faint)',
          border: `1px solid ${totalElim > 0 ? 'rgba(251,146,60,0.3)' : 'var(--status-success-bg-strong)'}`
        }}>
              <div style={{
            fontSize: 11,
            color: t.textMuted,
            marginBottom: 4
          }}>淘汰合计</div>
              <div style={{
            fontSize: 22,
            fontWeight: 800,
            color: totalElim > 0 ? 'var(--status-warning)' : 'var(--status-success)'
          }}>{totalElim} 只</div>
            </div>
            {totalLoss > 0 && <div style={{
          gridColumn: '1/-1',
          padding: '8px 14px',
          borderRadius: 10,
          background: 'var(--status-danger-bg-faint)',
          border: '1px solid var(--status-danger-bg-medium)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
                <span style={{
            fontSize: 12,
            color: t.textMuted
          }}>今日总损耗 · {houseList.length} 栋</span>
                <span style={{
            fontSize: 16,
            fontWeight: 800,
            color: 'var(--status-danger)'
          }}>{totalLoss} 只</span>
              </div>}
          </div>}

        {permErr && <div style={{
        padding: 20,
        textAlign: 'center',
        color: t.textMuted,
        fontSize: 13
      }}>
            权限不足（需要农场经理或管理员权限）
          </div>}

        {error && <div style={{
        marginBottom: 12,
        padding: 12,
        borderRadius: 10,
        background: 'var(--status-danger-bg-light)',
        border: '1px solid var(--status-danger-bg-strong)',
        color: 'var(--status-danger)',
        fontSize: 13
      }}>
            {error}
          </div>}

        {loading ? <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}>
            {[1, 2, 3, 4, 5].map(i => <div key={i} style={{
          height: 90,
          borderRadius: 14,
          background: t.cardBg,
          animation: 'pulse 1.5s infinite'
        }} />)}
          </div> : !permErr && <>
            {houseList.length === 0 && <MobileEmptyState icon="📊" title="暂无死淘记录" desc="今日还没有死淘数据" />}
            {houseList.map(house => {
          const mort = mortEdits[house] ?? 0;
          const elim = elimEdits[house] ?? 0;
          const hasLoss = mort > 0 || elim > 0;
          return <div key={house} style={{
            padding: '14px 16px',
            borderRadius: 14,
            marginBottom: 10,
            background: hasLoss ? 'var(--status-danger-bg-faint)' : t.sectionBg,
            border: `1px solid ${hasLoss ? 'var(--status-danger-bg-medium)' : t.cardBorder}`
          }}>
                  {/* 栋舍名 */}
                  <div style={{
              fontSize: 15,
              fontWeight: 700,
              color: t.text,
              marginBottom: 12
            }}>{house}</div>

                  {/* 死亡行 */}
                  <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8
            }}>
                    <div className={u.flexRow8}>
                      <span className={u.fs18}>💀</span>
                      <span style={{
                  fontSize: 13,
                  color: mort > 0 ? 'var(--status-danger)' : t.textSub
                }}>死亡</span>
                      {mort > 10 && <span style={{
                  fontSize: 10,
                  color: 'var(--status-danger)'
                }}>⚠ 数量较大</span>}
                    </div>
                    <NumStepper value={mort} onChange={v => {
                setMortEdits(p => ({
                  ...p,
                  [house]: v
                }));
                setSaved(false);
              }} />
                  </div>

                  {/* 淘汰行 */}
                  <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: elim > 0 ? 10 : 0
            }}>
                    <div className={u.flexRow8}>
                      <span className={u.fs18}>🔄</span>
                      <span style={{
                  fontSize: 13,
                  color: elim > 0 ? 'var(--status-warning)' : t.textSub
                }}>淘汰</span>
                    </div>
                    <NumStepper value={elim} onChange={v => {
                setElimEdits(p => ({
                  ...p,
                  [house]: v
                }));
                setSaved(false);
              }} />
                  </div>

                  {/* 淘汰原因（当淘汰 > 0 时展开） */}
                  {elim > 0 && <input type="text" value={reasonEdits[house] || ''} onChange={e => {
              setReasonEdits(p => ({
                ...p,
                [house]: e.target.value
              }));
              setSaved(false);
            }} placeholder="淘汰原因（如：产蛋率低、受伤等）" style={{
              width: '100%',
              height: 36,
              padding: '0 10px',
              boxSizing: 'border-box',
              background: 'var(--status-warning-bg-faint)',
              border: '1px solid rgba(251,146,60,0.25)',
              borderRadius: 8,
              color: t.text,
              fontSize: 12,
              outline: 'none'
            }} />}
                </div>;
        })}

            {/* 添加新栋舍 */}
            <div style={{
          display: 'flex',
          gap: 8,
          marginTop: 4,
          padding: '10px 14px',
          borderRadius: 14,
          background: t.sectionBg,
          border: `1px dashed ${t.btnBorder}`
        }}>
              <select value={newHouse} onChange={e => setNewHouse(e.target.value)} style={{
            flex: 1,
            height: 36,
            padding: '0 10px',
            background: t.inputBg,
            border: `1px solid ${t.btnBorder}`,
            borderRadius: 8,
            color: t.text,
            fontSize: 13,
            outline: 'none'
          }}>
                <option value="">+ 选择要添加的栋舍</option>
                {allHouses.filter(h => h.house_code && !houseList.includes(h.house_code)).map(h => (
                  <option key={h.house_code} value={h.house_code}>{h.house_name || h.house_code}</option>
                ))}
              </select>
              <button onClick={handleAddHouse} style={{
            padding: '0 14px',
            borderRadius: 8,
            background: 'var(--status-warning-bg-medium)',
            border: '1px solid var(--status-warning-bg-strong)',
            color: 'var(--status-warning)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 700
          }}>
                添加
              </button>
            </div>
          </>}
      </div>
    </div>;
}