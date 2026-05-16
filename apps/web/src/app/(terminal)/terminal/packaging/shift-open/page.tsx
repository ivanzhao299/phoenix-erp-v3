'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { packagingApi } from '@/lib/packaging-api';

const BG='#0f172a', CARD='#1e293b', BOR='#334155';
const ACC='#f59e0b', TXT='#f1f5f9', MUT='#94a3b8', GRN='#22c55e', RED='#ef4444';

const CHECK_ITEMS = [
  { key:'scanner',   label:'扫码枪在线',       icon:'📷' },
  { key:'printer',   label:'标签打印机在线',   icon:'🖨️' },
  { key:'scale',     label:'电子秤在线',       icon:'⚖️' },
  { key:'grader',    label:'分级机在线/人工模式确认', icon:'⚙️' },
  { key:'network',   label:'网络在线或离线缓存可用', icon:'🌐' },
  { key:'hygiene',   label:'包装区域卫生已确认', icon:'✅' },
  { key:'materials', label:'空箱/蛋托/标签等包材已准备', icon:'📦' },
];

const CHECK_ITEM_KEYS: Record<string, string> = {
  scanner:   'ui.扫码枪在线',
  printer:   'ui.标签打印机在线',
  scale:     'ui.电子秤在线',
  grader:    'ui.分级机在线人工模式确认',
  network:   'ui.网络在线或离线缓存可用',
  hygiene:   'ui.包装区域卫生已确认',
  materials: 'ui.空箱蛋托标签等包材已准备',
};

export default function ShiftOpenPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();
  const ctx = useTerminalContext();
  const [checks, setChecks] = useState<Record<string,boolean>>({});
  const [line, setLine] = useState('1号包装线');
  const [supervisor, setSupervisor] = useState(user?.name || '');
  const [offline, setOffline] = useState<string[]>([]);
  const [offlineReason, setOfflineReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const toggleCheck = (key: string) => {
    setChecks(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next[key]) setOffline(o => [...new Set([...o, key])]);
      else setOffline(o => o.filter(k => k !== key));
      return next;
    });
  };

  const allChecked = CHECK_ITEMS.every(i => checks[i.key]);
  const canSubmit = CHECK_ITEMS.filter(i => !['grader','scale'].includes(i.key)).every(i => checks[i.key]);

  // 把 API 返回的原始班次对象映射为 WorkShift 格式并写入 context
  const applyShiftToContext = (raw: Record<string, any>) => {
    if (!raw || !ctx?.setShift) return;
    ctx.setShift({
      id:             String(raw.id ?? ''),
      code:           raw.shift_code ?? raw.code ?? '',
      productionDate: raw.production_date ?? '',
      siteId:         raw.site_id ?? 'site-01',
      siteName:       raw.site_name ?? '凤凰农业',
      lineId:         raw.line_id ?? line,
      lineName:       raw.line_name ?? line,
      operatorIds:    raw.operator_id ? [String(raw.operator_id)] : [],
      operatorNames:  raw.operator_name ? [raw.operator_name] : [],
      supervisorId:   raw.supervisor_id ? String(raw.supervisor_id) : undefined,
      supervisorName: raw.supervisor_name ?? supervisor,
      terminalId:     raw.terminal_id ?? 'T-01',
      status:         raw.status ?? 'OPEN',
      openedAt:       raw.opened_at ?? new Date().toISOString(),
      hygieneCheckResult: checks['hygiene'] ?? true,
      deviceCheckResult:  checks['scanner'] ?? true,
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      let raw: Record<string, any> | null = null;
      try {
        raw = await packagingApi.openShift({ lineId: line, supervisorName: supervisor });
      } catch (err: any) {
        // 今日已有开放班次 → 直接加载现有班次写入 context
        if (err?.message?.includes('已有开放班次') || err?.message?.includes('already')) {
          const shifts = await packagingApi.getTodayShifts();
          const existing = Array.isArray(shifts) ? shifts.find((s: any) => s.status === 'OPEN') : null;
          if (existing) raw = existing;
        } else {
          throw err; // 其他错误继续向上抛
        }
      }
      if (raw) applyShiftToContext(raw);
      setDone(true);
      setTimeout(() => router.push('/terminal/packaging/dashboard'), 1500);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:BG, gap:16 }}>
      <div style={{ fontSize:64 }}>✅</div>
      <div style={{ fontSize:24, fontWeight:700, color:GRN }}>{t('ui.开班成功', '开班成功')}</div>
      <div style={{ color:MUT }}>{t('ui.正在返回作业台首页', '正在返回作业台首页...')}</div>
    </div>
  );

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:BG, overflow:'hidden' }}>
      {/* 页头 */}
      <div style={{ background:CARD, borderBottom:`1px solid ${BOR}`, padding:'14px 24px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ fontSize:24 }}>🔓</span>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:TXT }}>{t('terminal.shift_open', '开班 / 设备点检')}</div>
          <div style={{ fontSize:12, color:MUT }}>{t('ui.完成点检后方可开始作业', '完成点检后方可开始作业')}</div>
        </div>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:24, display:'flex', gap:24 }}>
        {/* 左：班次信息 */}
        <div style={{ width:280, flexShrink:0 }}>
          <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BOR}` }}>
            <div style={{ fontSize:13, color:MUT, marginBottom:16, fontWeight:600 }}>{t('ui.班次基本信息', '班次基本信息')}</div>
            {[
              { label: t('ui.生产日期', '生产日期'), value: new Date().toLocaleDateString('zh-CN') },
            ].map(item => (
              <div key={item.label} style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:MUT, marginBottom:4 }}>{item.label}</div>
                <div style={{ background:'rgba(255,255,255,0.05)', borderRadius:6, padding:'8px 12px', color:TXT, fontSize:14 }}>
                  {item.value}
                </div>
              </div>
            ))}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, color:MUT, marginBottom:4 }}>{t('ui.产线', '产线')}</div>
              <select value={line} onChange={e=>setLine(e.target.value)}
                style={{ width:'100%', background:'#1e293b', border:`1px solid ${BOR}`, borderRadius:6,
                  padding:'8px 12px', color:TXT, fontSize:14 }}>
                <option>1号包装线</option><option>2号包装线</option>
              </select>
            </div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, color:MUT, marginBottom:4 }}>{t('ui.班组长', '班组长')}</div>
              <input value={supervisor} onChange={e=>setSupervisor(e.target.value)}
                style={{ width:'100%', background:'#1e293b', border:`1px solid ${BOR}`, borderRadius:6,
                  padding:'8px 12px', color:TXT, fontSize:14, boxSizing:'border-box' }} />
            </div>
          </div>
        </div>

        {/* 右：点检清单 */}
        <div style={{ flex:1 }}>
          <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BOR}` }}>
            <div style={{ fontSize:13, color:MUT, marginBottom:16, fontWeight:600 }}>{t('ui.设备与卫生点检', '设备与卫生点检')}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {CHECK_ITEMS.map(item => {
                const checked = !!checks[item.key];
                return (
                  <button key={item.key} onClick={() => toggleCheck(item.key)}
                    style={{
                      display:'flex', alignItems:'center', gap:14, padding:'16px 20px',
                      background: checked ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
                      border: `2px solid ${checked ? 'rgba(34,197,94,0.4)' : BOR}`,
                      borderRadius:10, cursor:'pointer', textAlign:'left', transition:'all 0.15s',
                    }}>
                    <div style={{ width:28, height:28, borderRadius:6,
                      background: checked ? GRN : BOR,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:16, flexShrink:0, transition:'all 0.15s' }}>
                      {checked ? '✓' : ''}
                    </div>
                    <span style={{ fontSize:18 }}>{item.icon}</span>
                    <span style={{ fontSize:15, color: checked ? GRN : TXT, fontWeight: checked ? 600 : 400 }}>
                      {t(CHECK_ITEM_KEYS[item.key], item.label)}
                    </span>
                  </button>
                );
              })}
            </div>

            {offline.length > 0 && (
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:12, color:'#fbbf24', marginBottom:6 }}>
                  {t('ui.设备离线请说明原因', '以下设备离线，请说明原因（允许以人工模式继续）：')}
                </div>
                <textarea value={offlineReason} onChange={e=>setOfflineReason(e.target.value)}
                  placeholder={t('ui.设备离线原因示例', '例：电子秤故障，已联系维修，本班手工称重...')}
                  rows={3}
                  style={{ width:'100%', background:'rgba(251,191,36,0.05)', border:`1px solid rgba(251,191,36,0.3)`,
                    borderRadius:8, padding:'10px 12px', color:TXT, fontSize:13,
                    resize:'none', boxSizing:'border-box' }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 底部操作 */}
      <div style={{ background:CARD, borderTop:`1px solid ${BOR}`, padding:'16px 24px',
        display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div style={{ flex:1, fontSize:13, color: allChecked ? GRN : MUT }}>
          {allChecked
            ? `✅ ${t('ui.点检完成可以开班', '点检完成，可以开班')}`
            : `${t('ui.还剩', '还剩')} ${CHECK_ITEMS.filter(i=>!checks[i.key]).length} ${t('ui.项未确认', '项未确认')}`}
        </div>
        <button onClick={() => router.push('/terminal/packaging/dashboard')}
          style={{ padding:'14px 28px', borderRadius:10, border:`1px solid ${BOR}`,
            background:'transparent', color:MUT, fontSize:15, cursor:'pointer' }}>
          {t('common.back', '返回')}
        </button>
        <button onClick={handleSubmit} disabled={!canSubmit || submitting}
          style={{ padding:'14px 40px', borderRadius:10, border:'none',
            background: canSubmit ? ACC : BOR,
            color: canSubmit ? '#0f172a' : MUT,
            fontSize:16, fontWeight:700, cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: submitting ? 0.7 : 1, transition:'all 0.15s' }}>
          {submitting ? t('ui.开班中', '开班中...') : t('ui.确认开班', '确认开班')}
        </button>
      </div>
    </div>
  );
}
