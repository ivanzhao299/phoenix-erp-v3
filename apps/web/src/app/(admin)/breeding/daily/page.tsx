'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { useCrud } from '@/hooks/useCrud';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/contexts/ToastContext';
import { useDialog } from '@/contexts/DialogContext';
import { Save, Download, Cpu, CheckCircle } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';

const FIELDS = ['eggs','dirtyEggs','brokenEggs','deaths','feedKg','waterL','temp','humidity'] as const;
const HEADS  = ['班次','产蛋数(枚)','🟡脏蛋(枚)','🔴破损蛋(枚)','死淘(羽)','饲料(kg)','用水(L)','温度(℃)','湿度(%)','备注...'];
const mkRow  = (id: number, shift: string) => ({ id, shift, eggs:'', dirtyEggs:'', brokenEggs:'', deaths:'', feedKg:'', waterL:'', temp:'', humidity:'', remark:'' });
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

export default function DailyPage() {
  const toast = useToast();
  const { showConfirm } = useDialog();
  const { can } = usePermission();
  const today = new Date().toISOString().split('T')[0];
  const historyRef = useRef<HTMLHeadingElement>(null);

  const { fetchRecords: fetchHouses } = useCrud('brd_houses');
  const { fetchRecords: fetchFlocks } = useCrud('brd_flocks');
  const { fetchRecords, createRecord } = useCrud('brd_daily_logs');

  const [houses, setHouses]                   = useState<{ code: string; label: string }[]>([]);
  const [selectedHouse, setSelectedHouse]     = useState('');
  const [flockByHouse, setFlockByHouse]       = useState<Record<string, string>>({});
  const [farmCodeByHouse, setFarmCodeByHouse] = useState<Record<string, string>>({});
  const [formDate, setFormDate]               = useState(today);
  const [rows, setRows]                       = useState([mkRow(1,'早班'), mkRow(2,'晚班')]);
  const [submitted, setSubmitted]             = useState(false);
  const [approved, setApproved]               = useState(false);
  const [reports, setReports]                 = useState<any[]>([]);
  const [deviceHint, setDeviceHint]           = useState<Record<string,string> | null>(null);
  const [generating, setGenerating]           = useState(false);
  const [genResult, setGenResult]             = useState<any>(null);

  const loadData = useCallback(async () => {
    const [data, allHouses] = await Promise.all([fetchRecords(), fetchHouses()]);
    const houseNameMap: Record<string, string> = {};
    (allHouses || []).forEach((h: any) => {
      if (h.house_code) houseNameMap[h.house_code] = h.house_name || h.house_code;
      if (h.house_no)   houseNameMap[h.house_no]   = h.house_name || h.house_no;
    });
    setReports(((data || []) as any[]).map((d: any) => ({
      date: d.log_date, house: d.house_code || d.flock_no || '未知',
      houseName: houseNameMap[d.house_code] || houseNameMap[d.flock_no] || d.house_code || '未知',
      eggs: d.eggs_produced || 0, dirtyEggs: d.dirty_eggs || 0, brokenEggs: d.broken_eggs || 0,
      deaths: d.mortality_qty || 0, feedKg: d.feed_consumed || 0, waterL: d.water_consumed || 0,
      temp: d.temp || 25, humidity: d.humidity || 60, remark: d.note || '',
    })).reverse());
  }, [fetchRecords, fetchHouses]);

  // ✅ P3-2修复：改为 Promise.all 并行加载，消除嵌套 .then() 竞态风险
  useEffect(() => {
    Promise.all([fetchHouses(), fetchFlocks()]).then(([houses, flocks]: [any, any]) => {
      const fromHouses = (houses || []).filter((h: any) => h.house_code || h.house_no);
      const fcmap: Record<string, string> = {};
      (houses || []).forEach((h: any) => { if (h.house_code) fcmap[h.house_code] = h.farm_code || ''; });
      setFarmCodeByHouse(fcmap);
      const hmap: Record<string, string> = {};
      (flocks || []).forEach((f: any) => { if (f.house_code && f.flock_no && !hmap[f.house_code]) hmap[f.house_code] = f.flock_no; });
      setFlockByHouse(hmap);
      const houseList = fromHouses.length > 0
        ? fromHouses.map((h: any) => ({ code: h.house_code || h.house_no, label: h.house_name || h.house_code || h.house_no }))
        : (flocks || []).map((f: any) => ({ code: f.flock_no, label: f.house_code ? `${f.house_code}${f.farm_name ? ' · '+f.farm_name : ''}` : f.flock_no }));
      setHouses(houseList);
      setSelectedHouse(houseList[0]?.code || '');
    });
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedHouse) return;
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') : '';
    fetch(`${API_BASE}/api/v3/iot/devices/${selectedHouse}/overview`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then(res => {
        const snap = res?.data?.sensors;
        if (!Array.isArray(snap) || !snap.length) { setDeviceHint(null); return; }
        const byCode = Object.fromEntries(snap.map((s: any) => [s.property_code, s]));
        const hint: Record<string, string> = {};
        if (byCode['2001']?.value) hint.temp     = Number(byCode['2001'].value).toFixed(1);
        if (byCode['2083']?.value) hint.humidity = Number(byCode['2083'].value).toFixed(0);
        if (byCode['2488']?.value) hint.feedKg   = Number(byCode['2488'].value).toFixed(1);
        if (byCode['2484']?.value) hint.waterL   = Number(byCode['2484'].value * 1000).toFixed(0);
        if (Object.keys(hint).length) {
          setDeviceHint(hint);
          setRows(prev => prev.map((r, i) => i !== 0 ? r : {
            ...r,
            temp:     (!r.temp     && hint.temp)     ? hint.temp     : r.temp,
            humidity: (!r.humidity && hint.humidity) ? hint.humidity : r.humidity,
            feedKg:   (!r.feedKg   && hint.feedKg)   ? hint.feedKg   : r.feedKg,
            waterL:   (!r.waterL   && hint.waterL)   ? hint.waterL   : r.waterL,
          }));
        } else { setDeviceHint(null); }
      }).catch(() => setDeviceHint(null));
  }, [selectedHouse]);

  const updateRow = (id: number, field: string, val: string) =>
    setRows(rows.map(r => r.id === id ? { ...r, [field]: val } : r));

  const handleSubmit = async () => {
    const hasData = rows.some(r => r.eggs || r.deaths || r.feedKg || r.dirtyEggs || r.brokenEggs || r.waterL);
    if (!hasData) { toast.error('请至少录入一项数据（产蛋数、死淘或饲料用量）后再提交'); return; }
    
    const hasNegative = rows.some(r => Number(r.eggs) < 0 || Number(r.deaths) < 0 || Number(r.feedKg) < 0 || Number(r.dirtyEggs) < 0 || Number(r.brokenEggs) < 0 || Number(r.waterL) < 0);
    if (hasNegative) { toast.error('产蛋数、死淘数及耗材等数据不能录入负数！'); return; }

    // B5: 改 Promise.allSettled — 早班失败晚班成功不再静默丢失，分别提示
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') : '';
    const userStr = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_user') : '{}';
    const user = userStr ? JSON.parse(userStr) : {};
    const operatorName = user.realNameZh || user.username || '未知操作人';

    const submitOne = async (r: typeof rows[number]) => {
      const payload = {
        house_code:     selectedHouse,
        flock_no:       flockByHouse[selectedHouse] || selectedHouse,
        farm_code:      farmCodeByHouse[selectedHouse] || '',
        log_date:       formDate, shift: r.shift,
        feed_consumed:  Number(r.feedKg) || 0,
        water_consumed: Number(r.waterL) || 0,
        mortality_qty:  Number(r.deaths) || 0,
        eggs_produced:  Number(r.eggs) || 0,
        // C6: bad_eggs 移除 — DB 有列但与 dirty+broken 三写冗余；只写明细 2 列，
        //     展示侧若需要总数自行求和（service 端也可补 GENERATED column）
        dirty_eggs:     Number(r.dirtyEggs) || 0,
        broken_eggs:    Number(r.brokenEggs) || 0,
        temp:           Number(r.temp) || 25,
        humidity:       Number(r.humidity) || 60,
        note:           r.remark,
        operator:       operatorName,
      };
      const res = await fetch(`${API_BASE}/api/v3/farm/daily-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(j?.message || j?.msg || `HTTP ${res.status}`);
      }
      return r.shift;
    };

    const rowsToSubmit = rows.filter(r => r.eggs || r.deaths || r.feedKg || r.dirtyEggs || r.brokenEggs || r.waterL);
    const results = await Promise.allSettled(rowsToSubmit.map(submitOne));
    const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<string>[];
    const rejected  = results
      .map((r, i) => ({ r, shift: rowsToSubmit[i].shift }))
      .filter(x => x.r.status === 'rejected') as Array<{ r: PromiseRejectedResult; shift: string }>;

    if (rejected.length > 0) {
      const failed = rejected.map(x => `${x.shift}：${(x.r.reason as Error)?.message || '未知错误'}`).join('\n');
      toast.error(`部分班次提交失败：\n${failed}`);
    }
    if (fulfilled.length > 0) {
      setSubmitted(true); setApproved(false);
      setTimeout(() => setSubmitted(false), 3000);
      // 只在全部成功时清空；部分成功保留输入便于用户修正失败行
      if (rejected.length === 0) {
        setRows([mkRow(1,'早班'), mkRow(2,'晚班')]);
      }
      loadData();
    }
  };

  const handleExport = () => {
    const headers = ['班次','产蛋数','脏蛋','破损蛋','死淘','饲料kg','用水L','温度','湿度','备注'];
    const rowData = rows.map(r => [r.shift, r.eggs||0, r.dirtyEggs||0, r.brokenEggs||0, r.deaths||0, r.feedKg||0, r.waterL||0, r.temp||0, r.humidity||0, r.remark]);
    const csv = [headers, ...rowData].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `日报_${selectedHouse}_${formDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleApprove = () => { setApproved(true); setTimeout(() => setApproved(false), 3000); };

  const handleGenerateFromDevice = async () => {
    if (!selectedHouse) { toast.error('请先选择鸡舍'); return; }
    const ok = await showConfirm({ icon:'✅', type:'confirm', title:'确认操作', message:`将从「${selectedHouse}」的实时设备快照生成/更新 ${formDate} 日报，继续？`, confirmLabel:'确认' });
    if (!ok) return;
    setGenerating(true); setGenResult(null);
    try {
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') : '';
      const res = await fetch(`${API_BASE}/api/v3/iot/devices/daily-report/generate`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}) },
        body: JSON.stringify({ house_code: selectedHouse, log_date: formDate }),
      });
      const d = await res.json();
      if (d.ok) {
        setGenResult(d); loadData();
        if (d.feedKg != null || d.waterL != null || d.avgTemp != null) {
          setRows(prev => prev.map((r, i) => i !== 0 ? r : { ...r,
            feedKg: d.feedKg != null ? String(d.feedKg) : r.feedKg,
            waterL: d.waterL != null ? String(d.waterL) : r.waterL,
            temp: d.avgTemp != null ? String(Number(d.avgTemp).toFixed(1)) : r.temp,
            humidity: d.avgHum != null ? String(Number(d.avgHum).toFixed(1)) : r.humidity,
          }));
        }
      } else { toast.error(d.error || '生成失败'); }
    } catch (e: any) { toast.error(e.message); }
    finally { setGenerating(false); }
  };

  const total = {
    eggs:   rows.reduce((sum,r) => sum + (Number(r.eggs)   || 0), 0),
    deaths: rows.reduce((sum,r) => sum + (Number(r.deaths) || 0), 0),
    feedKg: rows.reduce((sum,r) => sum + (Number(r.feedKg) || 0), 0),
  };
  const visibleReports = reports.filter(r => !selectedHouse || r.house === selectedHouse).slice(0, 30);

  return (
    <div className="animate-fade-in">
      <PageHeader title="日生产日报录入" subtitle="按班次录入当日生产数据" breadcrumb={['养殖管理','日生产日报']}
        actions={
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <button type="button" className={s.btnSecondary}
              onClick={() => historyRef.current?.scrollIntoView({ behavior:'smooth' })}>历史记录</button>
            {can(['ROLE_FARM_MGR','ROLE_CEO','ROLE_QA_MGR','ROLE_ADMIN']) && (
              <button type="button" className={s.btnSecondary} onClick={handleExport}>
                <Download size={14} />导出报表
              </button>
            )}
            {can(['ROLE_FARM_MGR','ROLE_CEO','ROLE_ADMIN']) && (
              <button type="button" className={s.btnSecondary}
                onClick={handleGenerateFromDevice} disabled={generating || !selectedHouse}
                style={{ opacity: generating||!selectedHouse ? 0.6 : 1, cursor: generating||!selectedHouse ? 'not-allowed' : 'pointer' }}>
                <Cpu size={14} />{generating ? '生成中...' : '从设备生成日报'}
              </button>
            )}
            {can(['ROLE_FARM_MGR','ROLE_FARMER','ROLE_VET','ROLE_CEO','ROLE_QA_MGR','ROLE_ADMIN']) && (
              <button type="button" className={s.btnPrimary} onClick={handleSubmit}>
                <Save size={15} />提交日报
              </button>
            )}
            {/* TODO: 审核功能待后端实现持久化，暂时隐藏假审核按钮 */}
          </div>
        }
      />

      {/* 状态横幅 */}
      {submitted && <div style={{ marginBottom:12, padding:'12px 16px', backgroundColor:'color-mix(in srgb,var(--status-success) 12%,transparent)', borderRadius:'var(--radius-md)', color:'var(--status-success)', fontWeight:600, fontSize:13, border:'1px solid color-mix(in srgb,var(--status-success) 40%,transparent)' }}>✓ 日报已成功提交！</div>}
      {approved  && <div style={{ marginBottom:12, padding:'12px 16px', backgroundColor:'color-mix(in srgb,var(--status-success) 12%,transparent)', borderRadius:'var(--radius-md)', color:'var(--status-success)', fontWeight:600, fontSize:13, border:'1px solid color-mix(in srgb,var(--status-success) 40%,transparent)' }}>✓ 日报审核已通过！</div>}
      {genResult && (
        <div style={{ marginBottom:12, padding:'12px 16px', backgroundColor:'color-mix(in srgb,var(--color-primary) 10%,transparent)', borderRadius:'var(--radius-md)', color:'var(--color-primary)', fontSize:13, border:'1px solid color-mix(in srgb,var(--color-primary) 30%,transparent)', display:'flex', alignItems:'center', gap:8 }}>
          <Cpu size={14} />{genResult.message}
          {genResult.feedKg != null && ` · 耗料: ${genResult.feedKg}kg`}
          {genResult.waterL != null && ` · 用水: ${genResult.waterL}L`}
          {genResult.avgTemp != null && ` · 均温: ${Number(genResult.avgTemp).toFixed(1)}℃`}
          {genResult.avgHum  != null && ` · 湿度: ${Number(genResult.avgHum).toFixed(1)}%`}
        </div>
      )}

      {/* 表单头部 */}
      <div className={s.card} style={{ marginBottom:16 }}>
        <div className={s.cardBody} style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'center' }}>
          <div>
            <label className={s.lbl}>日期</label>
            <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className={s.inp} style={{ width:160 }} />
          </div>
          <div>
            <label className={s.lbl}>鸡舍</label>
            <select value={selectedHouse} onChange={e => setSelectedHouse(e.target.value)} className={s.inp} style={{ width:160 }}>
              {houses.map(h => <option key={h.code} value={h.code}>{h.label}</option>)}
            </select>
          </div>
          {deviceHint && (
            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'6px 12px', backgroundColor:'color-mix(in srgb,var(--color-primary) 10%,transparent)', border:'1px solid color-mix(in srgb,var(--color-primary) 30%,transparent)', borderRadius:'var(--radius-sm)', fontSize:12, color:'var(--color-primary)', flexWrap:'wrap' }}>
              <span style={{ fontWeight:600 }}>📡 传感器参考：</span>
              {deviceHint.temp     && <span>温度 {deviceHint.temp}℃</span>}
              {deviceHint.humidity && <span>湿度 {deviceHint.humidity}%</span>}
              {deviceHint.feedKg   && <span>耗料 {deviceHint.feedKg}kg</span>}
              {deviceHint.waterL   && <span>用水 {deviceHint.waterL}L</span>}
              <span style={{ color:'var(--text-secondary)', fontSize:11 }}>（已自动预填早班，可手动修改）</span>
            </div>
          )}
          <div style={{ marginLeft:'auto', display:'flex', gap:24 }}>
            {[
              { label:'合计产蛋', val: total.eggs   || '—', unit:'枚' },
              { label:'合计死淘', val: total.deaths || '—', unit:'羽' },
              { label:'合计饲料', val: total.feedKg || '—', unit:'kg' },
            ].map(item => (
              <div key={item.label} style={{ textAlign:'center' }}>
                <div style={{ fontSize:20, fontWeight:700, color:'var(--color-primary)' }}>{item.val} <span style={{ fontSize:12, color:'var(--text-secondary)' }}>{item.unit}</span></div>
                <div style={{ fontSize:11, color:'var(--text-secondary)' }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 班次录入表格 */}
      <div className={s.card} style={{ marginBottom:24, overflow:'hidden' }}>
        <div className={s.cardHeader}>
          <span className={s.cardTitle} style={{ color:'var(--color-primary)' }}>班次数据录入</span>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table className={s.table}>
            <thead>
              <tr>
                {HEADS.map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td style={{ fontWeight:600, color:'var(--text-primary)', whiteSpace:'nowrap' }}>{row.shift}</td>
                  {FIELDS.map(field => (
                    <td key={field} style={{ padding:'6px 8px' }}>
                      <input type="number" onFocus={e=>e.currentTarget.select()} value={(row as any)[field]} onChange={e => updateRow(row.id, field, e.target.value)}
                        className={s.inp} style={{ textAlign:'right', width:'80px', padding:'6px 8px' }} placeholder="0" />
                    </td>
                  ))}
                  <td style={{ padding:'6px 8px' }}>
                    <input value={row.remark} onChange={e => updateRow(row.id, 'remark', e.target.value)}
                      className={s.inp} style={{ width:'120px', padding:'6px 8px' }} placeholder="备注..." />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 历史记录 */}
      <h3 ref={historyRef} style={{ fontSize:15, fontWeight:700, marginBottom:12, color:'var(--color-primary)', display:'flex', alignItems:'center', gap:8 }}>
        近期日报记录
        {selectedHouse && <span style={{ fontSize:12, fontWeight:500, color:'var(--text-secondary)', backgroundColor:'var(--bg-page)', border:'1px solid var(--border)', borderRadius:12, padding:'2px 10px' }}>{houses.find(h => h.code === selectedHouse)?.label || selectedHouse}</span>}
      </h3>
      <div className={s.card} style={{ overflow:'hidden' }}>
        <table className={s.table}>
          <thead>
            <tr>
              {['日期','鸡舍','产蛋数','脏蛋','破损蛋','死淘','饲料(kg)','温度','湿度','备注'].map(h =>
                <th key={h}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {visibleReports.map((r, i) => (
              <tr key={i}>
                <td>{r.date}</td>
                <td>{r.houseName || r.house}</td>
                <td style={{ fontWeight:600 }}>{r.eggs.toLocaleString()}</td>
                <td style={{ color: r.dirtyEggs>30?'#d97706':'var(--text-primary)' }}>{r.dirtyEggs||0}</td>
                <td style={{ color: r.brokenEggs>20?'var(--status-danger)':'var(--text-primary)', fontWeight: r.brokenEggs>20?700:'normal' }}>{r.brokenEggs||0}</td>
                <td style={{ color: r.deaths>8?'var(--status-danger)':'var(--text-primary)' }}>{r.deaths}</td>
                <td>{r.feedKg}</td>
                <td>{r.temp}℃</td>
                <td>{r.humidity}%</td>
                <td style={{ color:'var(--text-secondary)', fontSize:12 }}>{r.remark||'—'}</td>
              </tr>
            ))}
            {!visibleReports.length && <tr><td colSpan={10} style={{ padding:24, textAlign:'center', color:'var(--text-secondary)', fontSize:13 }}>暂无该鸡舍的日报记录</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}