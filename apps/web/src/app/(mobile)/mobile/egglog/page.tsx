'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Save, RefreshCw, ChevronDown, ChevronUp, Sun, Moon } from 'lucide-react';
import { mobileApi, FlockRecord, FarmLog } from '@/lib/mobile-api';
import { useAuth } from '@/contexts/AuthContext';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import { MobilePageSkeleton, MobileEmptyState } from '@/components/mobile/MobileSkeleton';
import { useToast } from '@/contexts/ToastContext';
import { haptic } from '@/lib/haptic';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { loadEgglogFlocks, registerEgglogVisibilityRefresh } from '@/lib/egglog-refresh';
import { buildEgglogPayload } from '@/lib/egglog-payload';

// ── helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shiftDays(s: string, n: number) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
// G102：班次统一口径——早班/晚班（中文，与 BRD_SHIFT 字典一致）；中班已清理
const SHIFTS = [{
  key: '早班',
  label: '早班'
}, {
  key: '晚班',
  label: '晚班'
}];

// ── NumInput ─────────────────────────────────────────────────────────────────

function NumInput({
  value,
  onChange,
  placeholder = '0',
  small = false
}: {
  value: number | '';
  onChange: (v: number) => void;
  placeholder?: string;
  small?: boolean;
}) {
  const {
    t
  } = useMobileTheme();
  return <input type="number" inputMode="numeric" min="0" value={value === 0 ? '' : value} placeholder={placeholder} onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))} style={{
    width: small ? 64 : 80,
    height: small ? 32 : 40,
    textAlign: 'center',
    background: t.inputBg,
    border: `1px solid ${t.inputBorder}`,
    borderRadius: 8,
    color: t.text,
    fontSize: small ? 13 : 16,
    fontWeight: 700,
    outline: 'none',
    WebkitAppearance: 'none'
  }} />;
}

// ── types ────────────────────────────────────────────────────────────────────

interface HouseEntry {
  eggs: number;
  dirty: number;
  broken: number;
  temp: string;
  humidity: string;
}
const emptyEntry = (): HouseEntry => ({
  eggs: 0,
  dirty: 0,
  broken: 0,
  temp: '',
  humidity: ''
});

// ── HouseCard ─────────────────────────────────────────────────────────────────

function HouseCard({
  house,
  flock_no,
  entry,
  onChange,
  existing
}: {
  house: string;
  flock_no: string;
  entry: HouseEntry;
  onChange: (e: HouseEntry) => void;
  existing: number;
}) {
  const {
    t
  } = useMobileTheme();
  const { t: tr } = useLanguage();
  const [open, setOpen] = useState(false);
  const hasQuality = entry.dirty > 0 || entry.broken > 0;
  const hasEnv = entry.temp !== '' || entry.humidity !== '';
  const dirty = entry.eggs !== existing;
  return <div style={{
    background: dirty ? 'var(--status-warning-bg-faint)' : t.cardBg,
    border: `1px solid ${dirty ? 'var(--status-warning-bg-strong)' : t.cardBorder}`,
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden'
  }}>
      {/* Main row */}
      <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '12px 14px',
      gap: 10
    }}>
        {/* House badge */}
        <div style={{
        minWidth: 52,
        height: 36,
        borderRadius: 8,
        flexShrink: 0,
        background: 'var(--status-warning-bg-medium)',
        border: '1px solid var(--status-warning-bg-strong)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
          <span style={{
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--status-warning)'
        }}>{house}</span>
        </div>

        {/* Flock */}
        <div className={u.flex1}>
          <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: t.text
        }}>{flock_no || house}</div>
          {existing > 0 && <div style={{
          fontSize: 11,
          color: t.textFaint
        }}>
              {tr('mob.brd.recorded', '已录')} {existing.toLocaleString()} {tr('mob.brd.egg_unit', '枚')}
            </div>}
        </div>

        {/* Eggs input */}
        <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0
      }}>
          <span style={{
          fontSize: 12,
          color: t.textMuted
        }}>{tr('mob.brd.egg_produced', '产蛋')}</span>
          <NumInput value={entry.eggs} onChange={v => onChange({
          ...entry,
          eggs: v
        })} />
          <span style={{
          fontSize: 11,
          color: t.textFaint
        }}>{tr('mob.brd.egg_unit', '枚')}</span>
        </div>

        {/* Expand toggle */}
        <button onClick={() => setOpen(v => !v)} style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: t.textMuted,
        padding: 4,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center'
      }}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Expanded quality / env */}
      {open && <div style={{
      padding: '0 14px 14px',
      borderTop: `1px solid ${t.divider}`
    }}>
          {/* Quality breakdown */}
          <div style={{
        marginTop: 10,
        marginBottom: 8,
        fontSize: 11,
        color: t.textMuted,
        fontWeight: 600
      }}>
            {tr('mob.brd.egg_quality_grade', '蛋品质分级')}
          </div>
          <div className={u.flexWrap12}>
            {([{
          key: 'dirty',
          label: tr('mob.brd.dirty_egg', '脏蛋'),
          color: 'var(--status-warning)'
        }, {
          key: 'broken',
          label: tr('mob.brd.broken_egg', '破损蛋'),
          color: 'var(--status-danger)'
        }] as const).map(({
          key,
          label,
          color
        }) => <div key={key} className={u.flexRow}>
                <span style={{
            fontSize: 12,
            color,
            fontWeight: 600,
            minWidth: 30
          }}>{label}</span>
                <NumInput value={(entry as any)[key]} onChange={v => onChange({
            ...entry,
            [key]: v
          })} small />
              </div>)}
          </div>

          {/* Env data */}
          <div style={{
        marginTop: 12,
        marginBottom: 8,
        fontSize: 11,
        color: t.textMuted,
        fontWeight: 600
      }}>
            {tr('mob.brd.env_optional', '环境（选填）')}
          </div>
          <div className={u.flexWrap12}>
            <div className={u.flexRow}>
              <span style={{
            fontSize: 12,
            color: t.textSub,
            minWidth: 30
          }}>{tr('mob.brd.temperature', '温度')}</span>
              <input type="number" inputMode="decimal" placeholder="℃" value={entry.temp} onChange={e => onChange({
            ...entry,
            temp: e.target.value
          })} style={{
            width: 64,
            height: 32,
            textAlign: 'center',
            background: t.inputBg,
            border: `1px solid ${t.inputBorder}`,
            borderRadius: 8,
            color: t.text,
            fontSize: 13,
            fontWeight: 600,
            outline: 'none',
            WebkitAppearance: 'none'
          }} />
              <span style={{
            fontSize: 11,
            color: t.textFaint
          }}>℃</span>
            </div>
            <div className={u.flexRow}>
              <span style={{
            fontSize: 12,
            color: t.textSub,
            minWidth: 30
          }}>{tr('mob.brd.humidity', '湿度')}</span>
              <input type="number" inputMode="decimal" placeholder="%" value={entry.humidity} onChange={e => onChange({
            ...entry,
            humidity: e.target.value
          })} style={{
            width: 64,
            height: 32,
            textAlign: 'center',
            background: t.inputBg,
            border: `1px solid ${t.inputBorder}`,
            borderRadius: 8,
            color: t.text,
            fontSize: 13,
            fontWeight: 600,
            outline: 'none',
            WebkitAppearance: 'none'
          }} />
              <span style={{
            fontSize: 11,
            color: t.textFaint
          }}>%</span>
            </div>
          </div>
        </div>}
    </div>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EggLogPage() {
  const router = useRouter();
  const {
    user
  } = useAuth();
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
  } = useMobilePermission('egglog');
  const toast = useToast();
  const [date, setDate] = useState(todayStr());
  const [shift, setShift] = useState('早班');
  const [flocks, setFlocks] = useState<FlockRecord[]>([]);
  const [entries, setEntries] = useState<Record<string, HouseEntry>>({});
  const [existing, setExisting] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const flockRequestRef = useRef<Promise<void> | null>(null);
  const lastLogLoadedAtRef = useRef(0);

  const loadFlocks = useCallback(() => {
    if (flockRequestRef.current) return flockRequestRef.current;

    const request = loadEgglogFlocks()
      .then(setFlocks)
      .catch(() => {})
      .finally(() => {
        flockRequestRef.current = null;
      });
    flockRequestRef.current = request;
    return request;
  }, []);

  // Initial flock load; later refreshes reuse the same in-flight guarded request.
  useEffect(() => {
    void loadFlocks();
  }, [loadFlocks]);

  // Load existing logs for date+shift
  const loadExisting = useCallback(async (d: string, s: string) => {
    setLoading(true);
    setSaved(false);
    setError('');
    try {
      const res = await mobileApi.getFarmLogs(d);
      const arr: FarmLog[] = Array.isArray(res) ? res : (res as any)?.data ?? [];
      const filtered = arr.filter((r: any) => !s || r.shift === s || !r.shift);
      const existMap: Record<string, number> = {};
      const entryMap: Record<string, HouseEntry> = {};
      for (const r of filtered) {
        const key = r.house_code || r.flock_no || '';
        if (!key) continue;
        existMap[key] = (existMap[key] || 0) + Number(r.eggs_produced || 0);
        entryMap[key] = {
          eggs: (entryMap[key]?.eggs || 0) + Number(r.eggs_produced || 0),
          dirty: (entryMap[key]?.dirty || 0) + Number((r as any).dirty_eggs || 0),
          // bad_eggs is legacy-only. Never add it to broken_eggs or defects double-count.
          broken: (entryMap[key]?.broken || 0) + Number((r as any).broken_eggs || 0),
          temp: (r as any).temp != null ? String((r as any).temp) : '',
          humidity: (r as any).humidity != null ? String((r as any).humidity) : ''
        };
      }
      setExisting(existMap);
      setEntries(entryMap);
    } catch {
      setEntries({});
      setExisting({});
    } finally {
      lastLogLoadedAtRef.current = Date.now();
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    loadExisting(date, shift);
  }, [date, shift, loadExisting]);
  useEffect(() => registerEgglogVisibilityRefresh({
    refreshFlocks: loadFlocks,
    refreshLogs: () => loadExisting(date, shift),
    getLastLogLoadedAt: () => lastLogLoadedAtRef.current,
  }), [date, shift, loadExisting, loadFlocks]);
  const {
    pullHandlers
  } = usePullToRefresh(() => Promise.all([loadExisting(date, shift), loadFlocks()]));
  if (permLoading) return <MobilePageSkeleton title={tr('mob.brd.egg_entry', '产蛋录入')} onBack={() => router.back()} />;
  if (!allowed) return null;
  const getEntry = (house: string) => entries[house] ?? emptyEntry();
  const totalEggs = flocks.reduce((sum, f) => {
    const key = f.house_code || f.flock_no;
    return sum + (getEntry(key).eggs || 0);
  }, 0);
  const handleSubmit = async () => {
    const toSave = flocks.filter(f => {
      const key = f.house_code || f.flock_no;
      const e = getEntry(key);
      return e.eggs > 0 || e.dirty > 0 || e.broken > 0;
    });
    if (toSave.length === 0) {
      setError(tr('mob.brd.no_data_to_submit', '没有需要提交的数据'));
      return;
    }
    setSaving(true);
    setError('');
    const operator = user?.name || user?.username || 'SYS';
    const errors: string[] = [];
    for (const f of toSave) {
      const key = f.house_code || f.flock_no;
      const e = getEntry(key);
      try {
        await mobileApi.submitDailyLog(buildEgglogPayload(e, {
          house_code: f.house_code || key,
          flock_no: f.flock_no,
          log_date: date,
          shift,
          operator
        }));
      } catch (err: any) {
        errors.push(`${key}: ${err?.message || tr('mob.brd.failed', '失败')}`);
      }
    }
    setSaving(false);
    if (errors.length > 0) {
      haptic('error');
      setError(errors.join('；'));
    } else {
      haptic('success');
      toast.success(tr('mob.brd.egg_report_submit_ok', '产蛋日报提交成功'));
      setSaved(true);
      await loadExisting(date, shift);
    }
  };
  return <div style={{
    minHeight: '100svh',
    background: t.pageBg,
    display: 'flex',
    flexDirection: 'column'
  }}>
      {/* AppBar */}
      <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: 'calc(env(safe-area-inset-top) + 12px) 16px 12px',
      background: t.appBarBg,
      backdropFilter: 'blur(20px)',
      borderBottom: `1px solid ${t.barBorder}`,
      position: 'sticky',
      top: 0,
      zIndex: 10,
      gap: 10
    }}>
        <button onClick={() => router.back()} style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 4,
        color: t.textSub,
        display: 'flex',
        alignItems: 'center'
      }}>
          <ChevronLeft size={22} />
        </button>
        <div style={{
        flex: 1,
        fontSize: 16,
        fontWeight: 700,
        color: t.text
      }}>{tr('mob.brd.egg_report_entry', '产蛋日报录入')}</div>
        {totalEggs > 0 && <div style={{
        padding: '4px 10px',
        borderRadius: 8,
        background: 'var(--status-warning-bg-medium)',
        border: '1px solid var(--status-warning-bg-strong)',
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--status-warning)'
      }}>
            {totalEggs.toLocaleString()} {tr('mob.brd.egg_unit', '枚')}
          </div>}
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
      </div>

      {/* Date nav + shift */}
      <div style={{
      padding: '10px 16px',
      borderBottom: `1px solid ${t.divider}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }}>
        {/* Date row */}
        <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12
      }}>
          <button onClick={() => setDate(d => shiftDays(d, -1))} style={{
          background: t.btnBg,
          border: `1px solid ${t.btnBorder}`,
          borderRadius: 8,
          padding: '6px 10px',
          cursor: 'pointer',
          color: t.textSub,
          display: 'flex',
          alignItems: 'center'
        }}><ChevronLeft size={16} /></button>
          <span style={{
          fontSize: 15,
          fontWeight: 600,
          color: t.text,
          minWidth: 110,
          textAlign: 'center'
        }}>
            {date}
          </span>
          <button onClick={() => {
          if (date < todayStr()) setDate(d => shiftDays(d, 1));
        }} disabled={date >= todayStr()} style={{
          background: t.btnBg,
          border: `1px solid ${t.btnBorder}`,
          borderRadius: 8,
          padding: '6px 10px',
          cursor: date >= todayStr() ? 'default' : 'pointer',
          color: date >= todayStr() ? t.textFaint : t.textSub,
          display: 'flex',
          alignItems: 'center'
        }}><ChevronRight size={16} /></button>
        </div>

        {/* Shift row */}
        <div style={{
        display: 'flex',
        gap: 8,
        justifyContent: 'center'
      }}>
          {SHIFTS.map(s => <button key={s.key} onClick={() => setShift(s.key)} style={{
          padding: '6px 20px',
          borderRadius: 20,
          border: `1px solid ${shift === s.key ? 'var(--status-warning)' : t.inputBorder}`,
          background: shift === s.key ? 'var(--status-warning-border)' : t.cardBg,
          color: shift === s.key ? 'var(--status-warning)' : t.textSub,
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600
        }}>
              {s.key === '早班' ? tr('mob.brd.morning_shift', '早班') : s.key === '晚班' ? tr('mob.brd.evening_shift', '晚班') : s.label}
            </button>)}
        </div>
      </div>

      {/* House list */}
      <div {...pullHandlers} style={{
      flex: 1,
      padding: '12px 16px',
      paddingBottom: 'calc(88px + env(safe-area-inset-bottom))',
      overflowY: 'auto'
    }}>
        {loading ? <div style={{
        textAlign: 'center',
        padding: 40,
        color: t.textFaint,
        fontSize: 14
      }}>
            {tr('mob.brd.loading', '加载中…')}
          </div> : flocks.length === 0 ? <MobileEmptyState icon="🥚" title={tr('mob.brd.no_egg_data', '暂无产蛋数据')} desc={tr('mob.brd.no_record_today', '今日还没有记录')} /> : flocks.map(f => {
        const key = f.house_code || f.flock_no;
        return <HouseCard key={key} house={f.house_code || key} flock_no={f.flock_no} entry={getEntry(key)} onChange={e => setEntries(prev => ({
          ...prev,
          [key]: e
        }))} existing={existing[key] ?? 0} />;
      })}

        {error && <div style={{
        margin: '8px 0',
        padding: '12px 14px',
        borderRadius: 10,
        background: 'var(--status-danger-bg-light)',
        border: '1px solid var(--status-danger-bg-strong)',
        color: 'var(--status-danger)',
        fontSize: 13
      }}>
            {error}
          </div>}

        {saved && <div style={{
        margin: '8px 0',
        padding: '12px 14px',
        borderRadius: 10,
        background: 'var(--status-success-bg-medium)',
        border: '1px solid var(--status-success-bg-strong)',
        color: 'var(--status-success)',
        fontSize: 13,
        textAlign: 'center',
        fontWeight: 600
      }}>
            ✓ {tr('mob.brd.submit_ok', '提交成功')}
          </div>}
      </div>

      {/* Fixed submit bar */}
      <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      padding: '12px 16px',
      paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
      background: t.bottomBarBg,
      backdropFilter: 'blur(20px)',
      borderTop: `1px solid ${t.cardBorder}`
    }}>
        <button onClick={handleSubmit} disabled={saving || totalEggs === 0} style={{
        width: '100%',
        height: 52,
        borderRadius: 14,
        background: saving || totalEggs === 0 ? t.btnBg : 'linear-gradient(135deg,var(--status-warning),var(--status-warning))',
        border: 'none',
        cursor: saving || totalEggs === 0 ? 'default' : 'pointer',
        color: saving || totalEggs === 0 ? t.textFaint : 'white',
        fontSize: 16,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8
      }}>
          {saving ? <RefreshCw size={18} style={{
          animation: 'spin 1s linear infinite'
        }} /> : <Save size={18} />}
          {saving ? tr('mob.brd.submitting', '提交中…') : `${tr('mob.brd.submit', '提交')} ${shift === '早班' ? tr('mob.brd.morning_shift', '早班') : shift === '晚班' ? tr('mob.brd.evening_shift', '晚班') : shift} ${tr('mob.brd.egg_daily_report', '产蛋日报')}`}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>;
}
