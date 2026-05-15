'use client';
/**
 * 集蛋作业 KIOSK 终端 — V3 复刻 V2 phoenix-frontend EggCollection.jsx
 * 路径：/packaging/egg-terminal
 *
 * 业务流：操作员一线触屏选鸡舍 → 选班次 → 数字键盘录入集蛋/脏蛋/破损 →
 *        提交 → 后端 5 步事务（pkg_shifts/brd_daily_logs/inv_batches/inv_ledger/pkg_tasks）
 *        → 成功 modal 显示生成的 GRADE-... 任务号 + 跳转分级页
 *
 * KIOSK：全屏强制 + 路由囚禁 + F5/F11/Ctrl+R 拦截 (KioskGuard hook)
 *        PWA manifest 切换为 /egg-terminal-manifest.json 让桌面快捷方式默认全屏 landscape
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle, LogOut, RefreshCw } from 'lucide-react';
import { useBrand } from '@/contexts/BrandContext';
import { useKioskGuard } from '@/components/packaging/KioskGuard';

// ─── 主题色 ────────────────────────────────────────────────
const BG = '#0f172a', CARD = '#1e293b', BOR = '#334155';
const ACC = '#f59e0b', TXT = '#f1f5f9', MUT = '#94a3b8', GRN = '#22c55e';

interface House { code: string; label: string }
interface ShiftOpt { code: string; label: string }
interface RawShift {
  id: number; shift_no?: string; shift_date?: string; shift_type?: string;
  shift_time?: string; house_code?: string; status?: string;
  total_qty?: number | string; eggs_collected?: number | string;
  dirty_qty?: number | string; dirty_eggs?: number | string;
  broken_qty?: number | string; broken_eggs?: number | string;
  operator?: string;
}
interface ShiftRow {
  id: number; shiftNo: string; houseCode: string; shiftType: string;
  status: string; total: number; dirty: number; broken: number;
}

const tok = () => (typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') || '' : '');
const hdr = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok() });
const getRole = () => { try { return JSON.parse(sessionStorage.getItem('phoenix_user') || '{}').role || ''; } catch { return ''; } };
const getUser = () => { try { return JSON.parse(sessionStorage.getItem('phoenix_user') || '{}'); } catch { return {}; } };

export default function EggTerminalPage() {
  const router = useRouter();
  const { brand } = useBrand();
  const companyName = brand.company_name || '凤凰农业';
  const logoUrl = brand.logo_url || '';
  const role = useMemo(() => getRole(), []);
  const user = useMemo(() => getUser(), []);
  const isAdmin = role === 'ROLE_ADMIN';

  const today = new Date().toISOString().slice(0, 10);

  // 任务/班次状态
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [shiftOpts, setShiftOpts] = useState<ShiftOpt[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [houseCode, setHouseCode] = useState('');
  const [shiftType, setShiftType] = useState('');
  const [loading, setLoading] = useState(true);

  // 录入
  const [eggCount, setEggCount] = useState('');
  const [dirtyEggs, setDirtyEggs] = useState('');
  const [brokenEggs, setBrokenEggs] = useState('');
  const [focused, setFocused] = useState<'egg' | 'dirty' | 'broken'>('egg');
  const [pressedKey, setPressedKey] = useState('');

  // 提交状态 + 成功 modal
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ taskNo: string; batchNo: string; good: number; bad: number; total: number } | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isPrinting] = useState(false);

  const { isFullscreen, requestFullscreen } = useKioskGuard({
    isAdmin,
    manifestHref: '/egg-terminal-manifest.json',
    trapPath: '/packaging/egg-terminal',
    isPrinting,
  });

  // ─── 加载数据 ──────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    // 今日班次
    try {
      const r = await fetch(`/api/crud/pkg_shifts?limit=100&_t=${Date.now()}`, { headers: hdr() });
      if (r.ok) {
        const j = await r.json();
        const rows: ShiftRow[] = ((j.data || j) as RawShift[])
          .filter((x) => String(x.shift_date || '').slice(0, 10) === today)
          .map((x) => ({
            id: x.id,
            shiftNo: x.shift_no || '',
            houseCode: x.house_code || '',
            shiftType: x.shift_time || x.shift_type || '',
            status: x.status || 'PENDING',
            total: Number(x.total_qty || x.eggs_collected || 0),
            dirty: Number(x.dirty_qty || x.dirty_eggs || 0),
            broken: Number(x.broken_qty || x.broken_eggs || 0),
          }));
        setShifts(rows);
        if (rows.length > 0 && !activeId) setActiveId(rows[0].id);
      }
    } catch { /* ignore */ }
    // 鸡舍下拉
    try {
      const r = await fetch('/api/crud/brd_houses?limit=200', { headers: hdr() });
      if (r.ok) {
        const j = await r.json();
        setHouses(((j.data || j) as Record<string, unknown>[])
          .filter(h => h.house_code && h.status !== 'DISABLED' && h.status !== 'DELETED')
          .map(h => ({
            code: h.house_code as string,
            label: h.house_name ? `${h.house_code} · ${h.house_name}` : (h.house_code as string),
          })));
      }
    } catch { /* ignore */ }
    // PKG_SHIFT 字典
    try {
      const r = await fetch('/api/crud/sys_dict?dict_type=PKG_SHIFT&status=ACTIVE&limit=20', { headers: hdr() });
      if (r.ok) {
        const j = await r.json();
        const list = ((j.data || j) as Record<string, unknown>[])
          .filter(d => d.dict_type === 'PKG_SHIFT' && d.status === 'ACTIVE');
        setShiftOpts(list.map(d => ({ code: d.dict_code as string, label: (d.dict_label_zh || d.dict_code) as string })));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [today, activeId]);

  useEffect(() => { loadAll(); }, []);  // eslint-disable-line

  // 10s 轮询同步其他终端动作
  useEffect(() => {
    if (!tok()) return;
    const t = setInterval(() => {
      fetch(`/api/crud/pkg_shifts?limit=100&_t=${Date.now()}`, { headers: hdr() })
        .then(r => r.ok ? r.json() : null)
        .then(j => {
          if (!j) return;
          const rows: ShiftRow[] = ((j.data || j) as RawShift[])
            .filter((x) => String(x.shift_date || '').slice(0, 10) === today)
            .map((x) => ({
              id: x.id, shiftNo: x.shift_no || '', houseCode: x.house_code || '',
              shiftType: x.shift_time || x.shift_type || '', status: x.status || 'PENDING',
              total: Number(x.total_qty || x.eggs_collected || 0),
              dirty: Number(x.dirty_qty || x.dirty_eggs || 0),
              broken: Number(x.broken_qty || x.broken_eggs || 0),
            }));
          setShifts(rows);
        }).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [today]);

  const cur = shifts.find((s) => s.id === activeId) || null;
  const total = Number(eggCount) || 0;
  const dirty = Number(dirtyEggs) || 0;
  const broken = Number(brokenEggs) || 0;
  const badSum = dirty + broken;
  const good = Math.max(0, total - badSum);
  const brCalc = total > 0 ? (badSum / total) * 100 : 0;
  const isOverflow = badSum > total;
  const isHighBad = !isOverflow && brCalc > 50;
  const isWarnBad = !isOverflow && brCalc > 20;
  const canSubmit = total > 0 && !isOverflow && (cur?.status === 'PENDING' || cur?.status === 'IN_PROGRESS');

  // ─── 数字键盘 ───────────────────────────────────────────────
  const setActiveField = (v: string) => {
    if (focused === 'egg') setEggCount(v);
    else if (focused === 'dirty') setDirtyEggs(v);
    else setBrokenEggs(v);
  };
  const curFieldValue = focused === 'egg' ? eggCount : focused === 'dirty' ? dirtyEggs : brokenEggs;
  const press = (k: string) => {
    if (k === '⌫') { setActiveField(curFieldValue.length > 1 ? curFieldValue.slice(0, -1) : ''); return; }
    if (k === 'C') { setActiveField(''); return; }
    const next = (curFieldValue === '' || curFieldValue === '0') ? k : curFieldValue + k;
    if (next.length > 6) return;
    setActiveField(next);
  };
  const pressRef = useRef(press);
  pressRef.current = press;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key >= '0' && e.key <= '9') { e.preventDefault(); pressRef.current(e.key); }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); pressRef.current('⌫'); }
      else if (e.key === 'Escape') { e.preventDefault(); pressRef.current('C'); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        setFocused((p) => p === 'egg' ? 'dirty' : p === 'dirty' ? 'broken' : 'egg');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ─── 新建班次 + 提交 ───────────────────────────────────────
  const createShift = async () => {
    if (!houseCode || !shiftType) { window.alert('请先选鸡舍和班次'); return; }
    setSubmitting(true);
    try {
      const r = await fetch('/api/packaging/shifts', {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({
          house_code: houseCode,
          shift_type: shiftType,
          shift_time: shiftOpts.find(s => s.code === shiftType)?.label || shiftType,
          shift_date: today,
          operator: user.username || 'TERMINAL',
        }),
      });
      const d = await r.json();
      if (d.code === 200 && d.data?.id) {
        await loadAll();
        setActiveId(d.data.id);
      } else {
        window.alert(d.msg || '新建班次失败');
      }
    } catch { window.alert('网络错误'); }
    finally { setSubmitting(false); }
  };

  const submitEggs = async () => {
    if (!cur) return;
    if (!canSubmit) return;
    if (isHighBad && !window.confirm(`非优品率高达 ${brCalc.toFixed(1)}%，确认提交？`)) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/packaging/shifts/${cur.id}/complete`, {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({ eggs_collected: total, dirty_eggs: dirty, broken_eggs: broken }),
      });
      const d = await r.json();
      if (d.code === 200) {
        setSubmitResult({ taskNo: d.task_no || '', batchNo: d.batch_no || '', good: d.good_eggs || good, bad: d.bad_eggs || badSum, total });
        setEggCount(''); setDirtyEggs(''); setBrokenEggs('');
        await loadAll();
      } else {
        window.alert(d.msg || `提交失败 (${r.status})`);
      }
    } catch { window.alert('网络错误'); }
    finally { setSubmitting(false); }
  };

  const doLogout = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    try { sessionStorage.removeItem('phoenix_token'); sessionStorage.removeItem('phoenix_user'); } catch {}
    router.push('/login');
  };

  const KEYS: string[][] = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['C', '0', '⌫']];

  // ─── 渲染 ─────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: BG, color: TXT, fontFamily: "'Inter','Noto Sans SC',sans-serif", overflow: 'hidden' }}>
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}.pkg-caret{animation:blink 1s step-end infinite;font-weight:300;margin-left:1px}`}</style>

      {/* HEADER */}
      <div style={{ height: 56, background: '#060c19', borderBottom: '2px solid ' + BOR, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logoUrl} alt="logo" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 8 }} />
            : <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,rgba(245,158,11,0.2),rgba(245,158,11,0.06))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🏢</div>}
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: ACC }}>{companyName}</div>
            <div style={{ fontSize: 10, color: MUT }}>集蛋作业终端</div>
          </div>
        </div>
        {isAdmin && (
          <button type="button" onClick={() => router.push('/packaging')}
            style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid #334155', background: CARD, color: MUT, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            <ArrowLeft size={13} /> 返回
          </button>
        )}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          {cur && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#0c1e38', border: '1px solid #1e3a5f', borderRadius: 28, padding: '6px 18px' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: ACC }}>🏠 {cur.houseCode}</span>
              <span style={{ width: 1, height: 14, background: BOR }} />
              <span style={{ fontSize: 13, color: TXT }}>{cur.shiftType || '—'}</span>
              <span style={{ width: 1, height: 14, background: BOR }} />
              <span style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>{cur.shiftNo}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 10px 4px 4px', borderRadius: 20, background: 'rgba(51,65,85,0.4)', border: '1px solid #334155' }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff' }}>
              {/* C3: 兼容 realNameZh (V3) 与 real_name_zh (V2 残留)、name 字段 */}
              {(user.realNameZh || user.real_name_zh || user.name || user.username || '?').charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>{user.realNameZh || user.real_name_zh || user.name || user.username || '—'}</span>
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: TXT, letterSpacing: 2 }}>
            {new Date().toLocaleTimeString('zh', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button type="button" onClick={loadAll} title="刷新"
            style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid ' + BOR, background: CARD, color: MUT, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <RefreshCw size={15} />
          </button>
          {!isAdmin && (
            <button type="button" onClick={() => setShowLogoutConfirm(true)}
              style={{ height: 36, padding: '0 14px', borderRadius: 10, border: '1px solid #991b1b', background: 'linear-gradient(135deg,#7f1d1d,#991b1b)', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              <LogOut size={14} /> 退出
            </button>
          )}
        </div>
      </div>

      {/* BODY */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* LEFT: 今日班次队列 */}
        <div style={{ width: 220, background: '#060b18', borderRight: '2px solid ' + BOR, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid ' + BOR, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: MUT, letterSpacing: 1 }}>{loading ? '加载中…' : '今日班次'}</span>
            {!loading && <span style={{ fontSize: 11, fontWeight: 800, color: ACC, background: '#fef3c7', padding: '2px 8px', borderRadius: 10 }}>{shifts.length}</span>}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
            {shifts.map((s) => {
              const a = s.id === activeId;
              const done = s.status === 'DONE' || s.status === 'COMPLETED';
              return (
                <div key={s.id} onClick={() => setActiveId(s.id)}
                  style={{ position: 'relative', padding: '10px 12px', marginBottom: 6, borderRadius: 12, cursor: 'pointer', background: a ? 'rgba(30,58,95,0.8)' : CARD, border: '1.5px solid ' + (a ? ACC : BOR), opacity: done ? 0.6 : 1 }}>
                  {a && <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2, background: ACC }} />}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: a ? ACC : TXT }}>{s.houseCode}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: done ? '#16a34a30' : '#3b82f630', color: done ? '#86efac' : '#93c5fd' }}>
                      {done ? '✓ 已完成' : '待录入'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: MUT }}>{s.shiftType || '—'}</div>
                  {done && <div style={{ fontSize: 12, color: GRN, fontWeight: 700, marginTop: 3 }}>{s.total.toLocaleString()} 枚</div>}
                </div>
              );
            })}
            {shifts.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: 16, fontSize: 11, color: '#334155' }}>
                <div style={{ fontSize: 28, opacity: 0.3 }}>📋</div>
                <div style={{ marginTop: 6 }}>今日暂无班次</div>
                <div style={{ marginTop: 4, color: ACC }}>请新建</div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: 主区 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!cur ? (
            // 无任务：显示新建班次表单
            <div style={{ flex: 1, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
              <div style={{ width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg,rgba(30,58,95,0.6),rgba(15,23,42,0.8))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>🥚</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: TXT }}>新建集蛋班次</div>
              <div style={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: MUT, fontWeight: 700, marginBottom: 6 }}>指派鸡舍</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {houses.map((h) => (
                      <button type="button" key={h.code} onClick={() => setHouseCode(h.code)}
                        style={{ height: 44, padding: '0 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: '2px solid ' + (houseCode === h.code ? ACC : BOR), background: houseCode === h.code ? 'rgba(245,158,11,0.15)' : CARD, color: houseCode === h.code ? ACC : TXT }}>
                        {h.label}
                      </button>
                    ))}
                    {houses.length === 0 && <span style={{ fontSize: 13, color: MUT }}>暂无鸡舍...</span>}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: MUT, fontWeight: 700, marginBottom: 6 }}>班次时间</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {shiftOpts.map((s) => (
                      <button type="button" key={s.code} onClick={() => setShiftType(s.code)}
                        style={{ height: 44, padding: '0 20px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', border: '2px solid ' + (shiftType === s.code ? ACC : BOR), background: shiftType === s.code ? 'rgba(245,158,11,0.15)' : CARD, color: shiftType === s.code ? ACC : TXT }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={createShift} disabled={!houseCode || !shiftType || submitting}
                  style={{ height: 56, marginTop: 8, fontSize: 16, fontWeight: 800, borderRadius: 14, border: 'none', cursor: (!houseCode || !shiftType || submitting) ? 'not-allowed' : 'pointer', background: (!houseCode || !shiftType || submitting) ? 'rgba(30,41,59,0.6)' : 'linear-gradient(135deg,#3b82f6,#1d4ed8)', color: (!houseCode || !shiftType || submitting) ? '#475569' : TXT }}>
                  {submitting ? '创建中…' : '＋ 创建班次并开始录入'}
                </button>
              </div>
            </div>
          ) : cur.status === 'DONE' || cur.status === 'COMPLETED' ? (
            // 已完成
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 32 }}>
              <div style={{ fontSize: 64 }}>✅</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: GRN }}>本班次已完成录入</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, width: '100%', maxWidth: 600 }}>
                {[
                  ['总集蛋量', cur.total.toLocaleString(), TXT],
                  ['脏蛋', cur.dirty.toLocaleString(), '#fbbf24'],
                  ['破损蛋', cur.broken.toLocaleString(), '#f87171'],
                ].map(([l, v, c]) => (
                  <div key={l as string} style={{ background: CARD, borderRadius: 14, padding: 18, textAlign: 'center', border: '1px solid ' + BOR }}>
                    <div style={{ fontSize: 11, color: MUT, marginBottom: 4 }}>{l}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: c as string }}>{v}</div>
                    <div style={{ fontSize: 10, color: MUT, marginTop: 2 }}>枚</div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => router.push('/packaging/grading')}
                style={{ height: 50, padding: '0 28px', fontSize: 15, fontWeight: 800, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: TXT, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ArrowRight size={18} /> 前往分级作业
              </button>
            </div>
          ) : (
            // 录入模式
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40, padding: '20px 24px' }}>
              {/* 输入区 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 460 }}>
                {([
                  ['egg', '🥚 集蛋数量', eggCount, '请输入集蛋总数', TXT],
                  ['dirty', '🟡 脏蛋数量', dirtyEggs, '可清洗后重新分级', '#fbbf24'],
                  ['broken', '🔴 破损蛋数量', brokenEggs, '当日处理不可储存', '#f87171'],
                ] as const).map(([k, label, val, hint, color]) => {
                  const active = focused === k;
                  return (
                    <div key={k} onClick={() => setFocused(k)}
                      style={{ background: active ? 'rgba(245,158,11,0.05)' : CARD, borderRadius: 16, padding: '12px 16px', position: 'relative', border: '2.5px solid ' + (active ? ACC : 'rgba(51,65,85,0.5)'), cursor: 'pointer', boxShadow: active ? '0 0 24px rgba(245,158,11,0.2)' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: active ? ACC : MUT }}>{label}</span>
                        <span style={{ fontSize: 10, color: '#475569' }}>{hint}</span>
                      </div>
                      <div style={{ fontSize: val && val.length > 5 ? 36 : 48, fontWeight: 900, fontFamily: 'monospace', color: val ? (color as string) : MUT, lineHeight: 1.1, textAlign: 'right' }}>
                        {val || '0'}
                        {active && <span className="pkg-caret" style={{ color: ACC, fontSize: '0.8em' }}>|</span>}
                      </div>
                    </div>
                  );
                })}
                {/* 实时合计 */}
                {total > 0 && (
                  <div style={{ background: isOverflow ? 'rgba(127,29,29,.25)' : isHighBad ? 'rgba(127,29,29,.15)' : isWarnBad ? 'rgba(146,64,14,.2)' : 'rgba(21,128,61,.15)', border: '1.5px solid ' + (isOverflow || isHighBad ? '#b91c1c' : isWarnBad ? '#d97706' : 'rgba(34,197,94,0.4)'), borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, color: isOverflow || isHighBad ? '#fca5a5' : isWarnBad ? '#fbbf24' : '#86efac' }}>
                    {isOverflow
                      ? <>❌ 脏+破 {badSum} 枚超过总量 {total} 枚！</>
                      : <>合格蛋 <strong>{good.toLocaleString()}</strong> 枚 · 非优品率 <strong>{brCalc.toFixed(2)}%</strong>{isHighBad && ' 🔴 极高'}{isWarnBad && !isHighBad && ' ⚠️ 偏高'}</>}
                  </div>
                )}
                <button type="button" onClick={submitEggs} disabled={!canSubmit || submitting}
                  style={{ height: 62, fontSize: 17, fontWeight: 800, borderRadius: 16, border: canSubmit ? 'none' : '1px solid #334155', cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed', background: canSubmit && !submitting ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'rgba(30,41,59,0.6)', color: canSubmit && !submitting ? TXT : '#475569', boxShadow: canSubmit && !submitting ? '0 8px 24px rgba(22,163,74,.4)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <CheckCircle size={18} /> {submitting ? '提交中…' : '提交集蛋记录'}
                </button>
              </div>

              {/* NUMPAD */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,130px)', gridTemplateRows: 'repeat(4,130px)', gap: 10 }}>
                {KEYS.flatMap((row, ri) => row.map((k) => {
                  const isC = k === 'C', isDel = k === '⌫';
                  const id = ri + '-' + k;
                  const p = pressedKey === id;
                  const nBg = isC ? 'linear-gradient(145deg,#7f1d1d,#6b1919)' : isDel ? 'linear-gradient(145deg,#1e3a5f,#162d4a)' : 'linear-gradient(145deg,#1e2d3d,#172333)';
                  const pBg = isC ? '#dc2626' : isDel ? '#2563eb' : '#3b82f6';
                  const fg = isC ? '#fca5a5' : isDel ? '#93c5fd' : TXT;
                  return (
                    <button type="button" key={id}
                      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setPressedKey(id); press(k); }}
                      onPointerUp={() => setPressedKey('')} onPointerCancel={() => setPressedKey('')} onPointerLeave={() => setPressedKey('')}
                      style={{ border: 'none', cursor: 'pointer', fontWeight: 900, borderRadius: 20, background: p ? pBg : nBg, color: p ? '#fff' : fg, fontSize: 40, boxShadow: p ? `0 0 24px ${pBg}88` : '0 6px 16px rgba(0,0,0,.5)', transform: p ? 'scale(0.88)' : 'scale(1)', transition: p ? 'none' : 'transform .14s cubic-bezier(.34,1.56,.64,1)' }}>
                      {k}
                    </button>
                  );
                }))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KIOSK 全屏遮罩 */}
      {!isAdmin && !isFullscreen && (
        <div onClick={requestFullscreen}
          style={{ position: 'fixed', inset: 0, background: 'rgba(7,13,26,0.98)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 20 }}>
          <div style={{ fontSize: 72 }}>⛶</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: TXT }}>点击屏幕进入全屏工作模式</div>
        </div>
      )}

      {/* 成功 Modal */}
      {submitResult && (
        <div onClick={() => setSubmitResult(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: CARD, border: '1px solid ' + BOR, borderRadius: 16, padding: 28, minWidth: 420, maxWidth: 560, boxShadow: '0 12px 48px rgba(0,0,0,.5)' }}>
            <div style={{ fontSize: 56, textAlign: 'center', marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: GRN, textAlign: 'center', marginBottom: 16 }}>集蛋数据已录入</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
              {[['总集蛋', submitResult.total.toLocaleString(), TXT], ['合格蛋', submitResult.good.toLocaleString(), GRN], ['非优品', submitResult.bad.toLocaleString(), '#fbbf24']].map(([l, v, c]) => (
                <div key={l as string} style={{ background: BG, borderRadius: 10, padding: '10px 8px', textAlign: 'center', border: '1px solid ' + BOR }}>
                  <div style={{ fontSize: 10, color: MUT }}>{l}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: c as string }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ background: '#0c1e38', borderRadius: 10, padding: '10px 14px', marginBottom: 16, border: '1px solid #1e3a5f' }}>
              <div style={{ fontSize: 11, color: MUT, marginBottom: 4 }}>已生成分级任务</div>
              <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: '#60a5fa' }}>{submitResult.taskNo || '—'}</div>
              {submitResult.batchNo && <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', marginTop: 4 }}>批次：{submitResult.batchNo}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setSubmitResult(null)}
                style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid ' + BOR, background: 'transparent', color: TXT, cursor: 'pointer', fontWeight: 700 }}>
                继续录入下一班
              </button>
              <button type="button" onClick={() => { setSubmitResult(null); router.push('/packaging/grading?task=' + encodeURIComponent(submitResult.taskNo || '')); }}
                style={{ flex: 1, height: 44, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <ArrowRight size={14} /> 前往分级
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 退出确认 */}
      {showLogoutConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: CARD, borderRadius: 16, padding: 24, width: 360, border: '1px solid ' + BOR }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: TXT, marginBottom: 8 }}>🚪 确认退出登录？</div>
            <div style={{ fontSize: 13, color: MUT, marginBottom: 20 }}>退出后需重新登录</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setShowLogoutConfirm(false)}
                style={{ flex: 1, height: 40, borderRadius: 10, border: '1px solid ' + BOR, background: 'transparent', color: TXT, cursor: 'pointer', fontWeight: 600 }}>取消</button>
              <button type="button" onClick={doLogout}
                style={{ flex: 1, height: 40, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7f1d1d,#991b1b)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>确认退出</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
