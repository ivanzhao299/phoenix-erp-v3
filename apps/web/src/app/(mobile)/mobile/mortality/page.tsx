'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Save, ChevronLeft, ChevronRight, Plus, Minus, Sun, Moon } from 'lucide-react';
import { mobileApi } from '@/lib/mobile-api';
import { buildMortalityRequest } from '@/lib/mortality-payload';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { usePermission } from '@/hooks/usePermission';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { useLanguage } from '@/contexts/LanguageContext';
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
function NumStepper({
  value,
  onChange,disabled=false
}: {
  disabled?: boolean;
  value: number;
  onChange: (v: number) => void;
}) {
  const {
    t
  } = useMobileTheme();
  return <div className={u.flexRow}>
      <button disabled={disabled} onClick={() => onChange(Math.max(0, value - 1))} style={{
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
      <input disabled={disabled} type="number" inputMode="numeric" min="0" value={value || ''} onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))} placeholder="0" style={{
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
      <button disabled={disabled} onClick={() => onChange(value + 1)} style={{
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
  const { t: tr } = useLanguage();
  const {
    allowed,
    loading: permLoading,
    readonly
  } = useMobilePermission('mortality');
  const toast = useToast();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
  const [date, setDate] = useState(today);
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [managedHouses, setManagedHouses] = useState<Set<string>>(new Set());
  const [changedHouses, setChangedHouses] = useState<Set<string>>(new Set());
  const request = useRef(0);
  const loadedLosses = useRef<Record<string, { mortality: number; elimination: number; reason: string }>>({});
  const lifecycle = usePermission('MENU_FARM_DATA');
  const lifecycleCreate = usePermission('MENU_FLOCK_CREATE');
  const canRecord = lifecycle.canView && lifecycleCreate.canEdit;
  const locked = (house: string) => readonly || loadedDate !== date || managedHouses.has(house);
  const changeHouse = (house: string) => {
    setChangedHouses(previous => new Set([...previous, house]));
    setSaved(false);
  };
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
  const dateLabel = isToday ? tr('mob.brd.today', '今天') : date === fmtDate(addDays(toDate(today), -1)) ? tr('mob.brd.yesterday', '昨天') : date;
  const loadData = useCallback(async (d: string) => {
    const requestId = ++request.current;
    setLoading(true);
    setLoadedDate(null);
    setError('');
    setPermErr(false);
    setSaved(false);
    try {
      const { rows } = await mobileApi.getDailyHenReport(d);
      if (request.current !== requestId) return;
      const initMort: Record<string, number> = {};
      const initElim: Record<string, number> = {};
      const initReason: Record<string, string> = {};
      const managed = new Set<string>();
      for (const row of rows) {
        const house = row.house_code;
        initMort[house] = (initMort[house] ?? 0) + row.mortality;
        initElim[house] = (initElim[house] ?? 0) + row.elimination;
        if (row.culling_reason) initReason[house] = row.culling_reason;
        if (row.occupancy_id) managed.add(house);
      }
      loadedLosses.current = Object.fromEntries(Object.keys(initMort).map(house => [house, {
        mortality: initMort[house], elimination: initElim[house], reason: initReason[house] ?? '',
      }]));
      setLoadedDate(d);
      setNewHouse('');
      setManagedHouses(managed);
      setChangedHouses(new Set());
      setMortEdits(initMort);
      setElimEdits(initElim);
      setReasonEdits(initReason);
    } catch (error) {
      if (request.current !== requestId) return;
      const message = error instanceof Error ? error.message : '';
      if (message.includes('403')) setPermErr(true);
      else setError(message || tr('mob.brd.load_fail', '加载失败'));
    } finally {
      if (request.current === requestId) setLoading(false);
    }
  }, [tr, setSaved, setLoading]);
  useEffect(() => {
    let active = true;
    if (allowed) queueMicrotask(() => { if (active) void loadData(date); });
    return () => {
      active = false;
      request.current += 1;
    };
  }, [allowed, date, loadData]);
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    mobileApi.getFeedHousesDetail()
      .then(rows => { if (active) setAllHouses(rows); })
      .catch(() => {});
    return () => { active = false; };
  }, [allowed]);
  if (permLoading || !allowed) return null;
  const houseList = [...new Set([...Object.keys(mortEdits), ...Object.keys(elimEdits)])].sort();
  const totalMort = houseList.reduce((s, h) => s + (mortEdits[h] ?? 0), 0);
  const totalElim = houseList.reduce((s, h) => s + (elimEdits[h] ?? 0), 0);
  const totalLoss = totalMort + totalElim;
  const handleAddHouse = () => {
    const h = newHouse.trim();
    if (!h || mortEdits[h] !== undefined || locked(h)) return;
    changeHouse(h);
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
    const editable = [...changedHouses].filter(house => !locked(house));
    if (saving || !editable.length) return;
    setSaving(true);
    setError('');
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') || '' : '';
    try {
      // Validate the whole selection before issuing any request: a daily total
      // cannot safely be redistributed across historical shifts here.
      const requests = await Promise.all(editable.map(async house => {
        const logs = await mobileApi.getFarmLogsForHouse(date, house);
        if (logs.some(row => row.occupancy_id)) throw new Error(tr('mob.brd.mortality_managed', '已接续事件账，请办理死淘单。'));
        if (logs.length > 1) throw new Error(tr('mob.brd.mortality_multi_shift').replace('{house}', house));
        const original = loadedLosses.current[house];
        const [current] = logs;
        if (Number(current?.mortality_qty ?? 0) !== (original?.mortality ?? 0)
          || Number(current?.elimination_qty ?? 0) !== (original?.elimination ?? 0)
          || (current?.culling_reason ?? '') !== (original?.reason ?? '')) {
          throw new Error(tr('mob.brd.mortality_source_changed').replace('{house}', house));
        }
        return buildMortalityRequest(logs, house, date, {
          mortality_qty: mortEdits[house] ?? 0,
          elimination_qty: elimEdits[house] ?? 0,
          reason: reasonEdits[house] || null,
        });
      }));
      const results = await Promise.allSettled(requests.map(async request => {
        const response = await fetch(`${API_BASE}${request.path}`, {
          method: request.method,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(request.body),
        });
        const result = await response.json();
        if (!response.ok || result.code !== 200) throw new Error(result.message || result.msg || tr('mob.brd.save_fail', '保存失败'));
        return result;
      }));
      const failure = results.find(result => result.status === 'rejected');
      if (!failure) {
        haptic('success');
        toast.success(tr('mob.brd.mortality_save_ok', '死淘记录保存成功'));
        await loadData(date);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setChangedHouses(new Set(editable.filter((_, index) => results[index].status === 'rejected')));
        setError(String(failure.reason?.message || failure.reason));
      }
    } catch (error) {
      haptic('error');
      const message = error instanceof Error ? error.message : tr('mob.brd.save_fail', '保存失败');
      toast.error(message);
      setError(message);
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
      }}>💀 {tr('mob.brd.mortality_quick_entry', '死淘快录')}</span>
        {canRecord && <Link href={{ pathname: '/mobile/flock-lifecycle/losses', query: { entry: 'mortality', date } }} style={{ color: t.text, fontSize: 13 }}>{tr('productionJobs.recordLoss')}</Link>}
        <button disabled={saving} onClick={() => loadData(date)} style={{
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
        <button onClick={handleSave} disabled={saving || loading || permErr || loadedDate !== date || readonly || changedHouses.size === 0} style={{
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
          {saving ? tr('mob.brd.submitting', '提交中…') : saved ? tr('mob.brd.saved', '已保存') : tr('mob.brd.save', '保存')}
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
        <button disabled={saving} onClick={() => setDate(d => fmtDate(addDays(toDate(d), -1)))} style={{
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
        if (!isToday && !saving) setDate(d => fmtDate(addDays(toDate(d), 1)));
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
          }}>{tr('mob.brd.mortality_total', '死亡合计')}</div>
              <div style={{
            fontSize: 22,
            fontWeight: 800,
            color: totalMort > 0 ? 'var(--status-danger)' : 'var(--status-success)'
          }}>{totalMort} {tr('mob.brd.bird_unit_only', '只')}</div>
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
          }}>{tr('mob.brd.elimination_total', '淘汰合计')}</div>
              <div style={{
            fontSize: 22,
            fontWeight: 800,
            color: totalElim > 0 ? 'var(--status-warning)' : 'var(--status-success)'
          }}>{totalElim} {tr('mob.brd.bird_unit_only', '只')}</div>
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
          }}>{tr('mob.brd.today_total_loss', '今日总损耗')} · {houseList.length} {tr('mob.brd.house_unit', '栋')}</span>
                <span style={{
            fontSize: 16,
            fontWeight: 800,
            color: 'var(--status-danger)'
          }}>{totalLoss} {tr('mob.brd.bird_unit_only', '只')}</span>
              </div>}
          </div>}

        {permErr && <div style={{
        padding: 20,
        textAlign: 'center',
        color: t.textMuted,
        fontSize: 13
      }}>
            {tr('mob.brd.perm_insufficient', '权限不足（需要农场经理或管理员权限）')}
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
            {houseList.length === 0 && <MobileEmptyState icon="📊" title={tr('mob.brd.no_mortality_record', '暂无死淘记录')} desc={tr('mob.brd.no_mortality_today', '今日还没有死淘数据')} />}
            {houseList.map(house => {
          const mort = mortEdits[house] ?? 0;
          const elim = elimEdits[house] ?? 0;
          const hasLoss = mort > 0 || elim > 0;
          const managed = managedHouses.has(house);
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
            }}>{house}{managed && <p>{tr('mob.brd.mortality_managed', '已接续事件账，请办理死淘单。')}{canRecord && <> <Link href={{ pathname: '/mobile/flock-lifecycle/losses', query: { kind: 'MORTALITY', houseCode: house, date } }}>{tr('productionJobs.recordLoss')}</Link></>}</p>}</div>

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
                }}>{tr('mob.brd.mortality', '死亡')}</span>
                      {mort > 10 && <span style={{
                  fontSize: 10,
                  color: 'var(--status-danger)'
                }}>⚠ {tr('mob.brd.large_qty', '数量较大')}</span>}
                    </div>
                    <NumStepper disabled={locked(house) || saving} value={mort} onChange={v => {
                setMortEdits(p => ({
                  ...p,
                  [house]: v
                }));
                changeHouse(house);
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
                }}>{tr('mob.brd.elimination', '淘汰')}</span>
                    </div>
                    <NumStepper disabled={locked(house) || saving} value={elim} onChange={v => {
                setElimEdits(p => ({
                  ...p,
                  [house]: v
                }));
                changeHouse(house);
              }} />
                  </div>

                  {/* 淘汰原因（当淘汰 > 0 时展开） */}
                  {elim > 0 && <input type="text" disabled={locked(house) || saving} value={reasonEdits[house] || ''} onChange={e => {
              setReasonEdits(p => ({
                ...p,
                [house]: e.target.value
              }));
              changeHouse(house);
            }} placeholder={tr('mob.brd.culling_reason_placeholder', '淘汰原因（如：产蛋率低、受伤等）')} style={{
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
              <select disabled={readonly || saving || loadedDate !== date} value={newHouse} onChange={e => setNewHouse(e.target.value)} style={{
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
                <option value="">+ {tr('mob.brd.select_house_to_add', '选择要添加的栋舍')}</option>
                {allHouses.filter(h => h.house_code && !houseList.includes(h.house_code)).map(h => (
                  <option key={h.house_code} value={h.house_code}>{h.house_name || h.house_code}</option>
                ))}
              </select>
              <button disabled={readonly || saving || loadedDate !== date || !newHouse} onClick={handleAddHouse} style={{
            padding: '0 14px',
            borderRadius: 8,
            background: 'var(--status-warning-bg-medium)',
            border: '1px solid var(--status-warning-bg-strong)',
            color: 'var(--status-warning)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 700
          }}>
                {tr('mob.brd.add', '添加')}
              </button>
            </div>
          </>}
      </div>
    </div>;
}