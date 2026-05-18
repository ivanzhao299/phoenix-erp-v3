'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

interface DailyReport {
  [key: string]: unknown;
  date?: unknown;
  house?: unknown;
  houseName?: unknown;
  eggs?: unknown;
  dirtyEggs?: unknown;
  brokenEggs?: unknown;
  deaths?: unknown;
  feedKg?: unknown;
  waterL?: unknown;
  temp?: unknown;
  humidity?: unknown;
  remark?: unknown;
}
import PageHeader from '@/components/PageHeader';
import { useCrud } from '@/hooks/useCrud';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/contexts/ToastContext';
import { useDialog } from '@/contexts/DialogContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Save, Download, Cpu, CheckCircle } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';

const FIELDS = ['eggs','dirtyEggs','brokenEggs','deaths','feedKg','waterL','temp','humidity'] as const;
const mkRow  = (id: number, shift: string) => ({ id, shift, eggs:'', dirtyEggs:'', brokenEggs:'', deaths:'', feedKg:'', waterL:'', temp:'', humidity:'', remark:'' });

export default function DailyPage() {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
  const toast = useToast();
  const { showConfirm } = useDialog();
  const { can } = usePermission();
  const { t } = useLanguage();
  const today = new Date().toISOString().split('T')[0];
  const historyRef = useRef<HTMLHeadingElement>(null);

  const HEADS = [t('ui.班次','班次'),t('ui.产蛋数(枚)','产蛋数(枚)'),`🟡${t('ui.脏蛋(枚)','脏蛋(枚)')}`,`🔴${t('ui.破损蛋(枚)','破损蛋(枚)')}`,t('ui.死淘(羽)','死淘(羽)'),t('ui.饲料(kg)','饲料(kg)'),t('ui.用水(L)','用水(L)'),t('ui.温度(℃)','温度(℃)'),t('ui.湿度(%)','湿度(%)'),`${t('common.remark','备注')}...`];

  const { fetchRecords: fetchHouses } = useCrud('brd_houses');
  const { fetchRecords: fetchFlocks } = useCrud('brd_flocks');
  const { fetchRecords, createRecord } = useCrud('brd_daily_logs');

  const [houses, setHouses]                   = useState<{ code: string; label: string }[]>([]);
  const [selectedHouse, setSelectedHouse]     = useState('');
  const [flockByHouse, setFlockByHouse]       = useState<Record<string, string>>({});
  const [farmCodeByHouse, setFarmCodeByHouse] = useState<Record<string, string>>({});
  const [formDate, setFormDate]               = useState(today);
  const [rows, setRows]                       = useState([mkRow(1,t('ui.早班','早班')), mkRow(2,t('ui.晚班','晚班'))]);
  const [submitted, setSubmitted]             = useState(false);
  const [approved, setApproved]               = useState(false);
  const [reports, setReports]                 = useState<DailyReport[]>([]);
  const [deviceHint, setDeviceHint]           = useState<Record<string,string> | null>(null);
  const [generating, setGenerating]           = useState(false);
  const [genResult, setGenResult]             = useState<any>(null);

  const loadData = useCallback(async () => {
    const [data, allHouses] = await Promise.all([fetchRecords(), fetchHouses()]);
    const houseNameMap: Record<string, string> = {};
    (allHouses || []).forEach((h: Record<string, unknown>) => {
      if (h.house_code) houseNameMap[h.house_code as string] = (h.house_name as string) || (h.house_code as string);
      if (h.house_no)   houseNameMap[h.house_no as string]   = (h.house_name as string) || (h.house_no as string);
    });
    setReports(((data || []) as Record<string, unknown>[]).map((d: Record<string, unknown>) => ({
      date: d.log_date, house: d.house_code || d.flock_no || t('ui.未知','未知'),
      houseName: houseNameMap[d.house_code as string] || houseNameMap[d.flock_no as string] || d.house_code || t('ui.未知','未知'),
      eggs: d.eggs_produced || 0, dirtyEggs: d.dirty_eggs || 0, brokenEggs: d.broken_eggs || 0,
      deaths: d.mortality_qty || 0, feedKg: d.feed_consumed || 0, waterL: d.water_consumed || 0,
      temp: d.temp || 25, humidity: d.humidity || 60, remark: d.note || '',
    })).reverse());
  }, [fetchRecords, fetchHouses]);

  useEffect(() => {
    Promise.all([fetchHouses(), fetchFlocks()]).then(([houses, flocks]: [Record<string, unknown>[], Record<string, unknown>[]]) => {
      const fromHouses = (houses || []).filter((h: Record<string, unknown>) => h.house_code || h.house_no);
      const fcmap: Record<string, string> = {};
      (houses || []).forEach((h: Record<string, unknown>) => { if (h.house_code) fcmap[h.house_code as string] = (h.farm_code as string) || ''; });
      setFarmCodeByHouse(fcmap);
      const hmap: Record<string, string> = {};
      (flocks || []).forEach((f: Record<string, unknown>) => { if (f.house_code && f.flock_no && !hmap[f.house_code as string]) hmap[f.house_code as string] = f.flock_no as string; });
      setFlockByHouse(hmap);
      const houseList = fromHouses.length > 0
        ? fromHouses.map((h: Record<string, unknown>) => ({ code: (h.house_code || h.house_no) as string, label: (h.house_name || h.house_code || h.house_no) as string }))
        : (flocks || []).map((f: Record<string, unknown>) => ({ code: f.flock_no as string, label: f.house_code ? `${f.house_code}${f.farm_name ? ' · '+f.farm_name : ''}` : f.flock_no as string }));
      setHouses(houseList);
      setSelectedHouse(houseList[0]?.code || '');
    }).catch(() => {});
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
        const byCode = Object.fromEntries(snap.map((s: Record<string, unknown>) => [s.property_code, s]));
        const hint: Record<string, string> = {};
        if (byCode['2001']?.value) hint.temp     = Number(byCode['2001'].value).toFixed(1);
        if (byCode['2083']?.value) hint.humidity = Number(byCode['2083'].value).toFixed(0);
        if (byCode['2488']?.value) hint.feedKg   = Number(byCode['2488'].value).toFixed(1);
        if (byCode['2484']?.value) hint.waterL   = Number(byCode['2484'].value * 1000).toFixed(0);
        if (Object.keys(hint).length) {
          setDeviceHint(hint);
          setRows(prev => prev.map(r => ({
            ...r,
            temp:     (!r.temp     && hint.temp)     ? hint.temp     : r.temp,
            humidity: (!r.humidity && hint.humidity) ? hint.humidity : r.humidity,
            feedKg:   (!r.feedKg   && hint.feedKg)   ? hint.feedKg   : r.feedKg,
            waterL:   (!r.waterL   && hint.waterL)   ? hint.waterL   : r.waterL,
          })));
        } else { setDeviceHint(null); }
      }).catch(() => setDeviceHint(null));
  }, [selectedHouse]);

  const updateRow = (id: number, field: string, val: string) =>
    setRows(rows.map(r => r.id === id ? { ...r, [field]: val } : r));

  const handleSubmit = async () => {
    const hasData = rows.some(r => r.eggs || r.deaths || r.feedKg || r.dirtyEggs || r.brokenEggs || r.waterL);
    if (!hasData) { toast.error(t('ui.请至少录入一项数据（产蛋数、死淘或饲料用量）后再提交','请至少录入一项数据（产蛋数、死淘或饲料用量）后再提交')); return; }

    const hasNegative = rows.some(r => Number(r.eggs) < 0 || Number(r.deaths) < 0 || Number(r.feedKg) < 0 || Number(r.dirtyEggs) < 0 || Number(r.brokenEggs) < 0 || Number(r.waterL) < 0);
    if (hasNegative) { toast.error(t('ui.产蛋数、死淘数及耗材等数据不能录入负数！','产蛋数、死淘数及耗材等数据不能录入负数！')); return; }

    const token = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') : '';
    const userStr = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_user') : '{}';
    const user = userStr ? JSON.parse(userStr) : {};
    const operatorName = user.realNameZh || user.username || t('ui.未知操作人','未知操作人');

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
      const failed = rejected.map(x => `${x.shift}：${(x.r.reason as Error)?.message || t('ui.未知错误','未知错误')}`).join('\n');
      toast.error(`${t('ui.部分班次提交失败：','部分班次提交失败：')}\n${failed}`);
    }
    if (fulfilled.length > 0) {
      setSubmitted(true); setApproved(false);
      setTimeout(() => setSubmitted(false), 3000);
      if (rejected.length === 0) {
        setRows([mkRow(1,t('ui.早班','早班')), mkRow(2,t('ui.晚班','晚班'))]);
      }
      loadData();
    }
  };

  const handleExport = () => {
    const headers = [t('ui.班次','班次'),t('ui.产蛋数','产蛋数'),t('ui.脏蛋','脏蛋'),t('ui.破损蛋','破损蛋'),t('ui.死淘','死淘'),t('ui.饲料kg','饲料kg'),t('ui.用水L','用水L'),t('ui.温度','温度'),t('ui.湿度','湿度'),t('common.remark','备注')];
    const rowData = rows.map(r => [r.shift, r.eggs||0, r.dirtyEggs||0, r.brokenEggs||0, r.deaths||0, r.feedKg||0, r.waterL||0, r.temp||0, r.humidity||0, r.remark]);
    const csv = [headers, ...rowData].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${t('ui.日报','日报')}_${selectedHouse}_${formDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleApprove = () => { setApproved(true); setTimeout(() => setApproved(false), 3000); };

  const handleGenerateFromDevice = async () => {
    if (!selectedHouse) { toast.error(t('ui.请先选择鸡舍','请先选择鸡舍')); return; }
    const ok = await showConfirm({ icon:'✅', type:'confirm', title:t('ui.确认操作','确认操作'), message:`${t('ui.将从','将从')}「${selectedHouse}」${t('ui.的实时设备快照生成/更新','的实时设备快照生成/更新')} ${formDate} ${t('ui.日报，继续？','日报，继续？')}`, confirmLabel:t('common.confirm','确认') });
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
      } else { toast.error(d.error || t('ui.生成失败','生成失败')); }
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
      <PageHeader title={t('ui.日生产日报录入','日生产日报录入')} subtitle={t('ui.按班次录入当日生产数据','按班次录入当日生产数据')} breadcrumb={[t('ui.养殖管理','养殖管理'),t('ui.日生产日报','日生产日报')]}
        actions={
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <button type="button" className={s.btnSecondary}
              onClick={() => historyRef.current?.scrollIntoView({ behavior:'smooth' })}>{t('ui.历史记录','历史记录')}</button>
            {can(['ROLE_FARM_MGR','ROLE_CEO','ROLE_QA_MGR','ROLE_ADMIN']) && (
              <button type="button" className={s.btnSecondary} onClick={handleExport}>
                <Download size={14} />{t('ui.导出报表','导出报表')}
              </button>
            )}
            {can(['ROLE_FARM_MGR','ROLE_CEO','ROLE_ADMIN']) && (
              <button type="button" className={s.btnSecondary}
                onClick={handleGenerateFromDevice} disabled={generating || !selectedHouse}
                style={{ opacity: generating||!selectedHouse ? 0.6 : 1, cursor: generating||!selectedHouse ? 'not-allowed' : 'pointer' }}>
                <Cpu size={14} />{generating ? t('ui.生成中...','生成中...') : t('ui.从设备生成日报','从设备生成日报')}
              </button>
            )}
            {can(['ROLE_FARM_MGR','ROLE_FARMER','ROLE_VET','ROLE_CEO','ROLE_QA_MGR','ROLE_ADMIN']) && (
              <button type="button" className={s.btnPrimary} onClick={handleSubmit}>
                <Save size={15} />{t('ui.提交日报','提交日报')}
              </button>
            )}
          </div>
        }
      />

      {/* 状态横幅 */}
      {submitted && <div style={{ marginBottom:12, padding:'12px 16px', backgroundColor:'color-mix(in srgb,var(--status-success) 12%,transparent)', borderRadius:'var(--radius-md)', color:'var(--status-success)', fontWeight:600, fontSize:13, border:'1px solid color-mix(in srgb,var(--status-success) 40%,transparent)' }}>✓ {t('ui.日报已成功提交！','日报已成功提交！')}</div>}
      {approved  && <div style={{ marginBottom:12, padding:'12px 16px', backgroundColor:'color-mix(in srgb,var(--status-success) 12%,transparent)', borderRadius:'var(--radius-md)', color:'var(--status-success)', fontWeight:600, fontSize:13, border:'1px solid color-mix(in srgb,var(--status-success) 40%,transparent)' }}>✓ {t('ui.日报审核已通过！','日报审核已通过！')}</div>}
      {genResult && (
        <div style={{ marginBottom:12, padding:'12px 16px', backgroundColor:'color-mix(in srgb,var(--color-primary) 10%,transparent)', borderRadius:'var(--radius-md)', color:'var(--color-primary)', fontSize:13, border:'1px solid color-mix(in srgb,var(--color-primary) 30%,transparent)', display:'flex', alignItems:'center', gap:8 }}>
          <Cpu size={14} />{genResult.message}
          {genResult.feedKg != null && ` · ${t('ui.耗料','耗料')}: ${genResult.feedKg}kg`}
          {genResult.waterL != null && ` · ${t('ui.用水','用水')}: ${genResult.waterL}L`}
          {genResult.avgTemp != null && ` · ${t('ui.均温','均温')}: ${Number(genResult.avgTemp).toFixed(1)}℃`}
          {genResult.avgHum  != null && ` · ${t('ui.湿度','湿度')}: ${Number(genResult.avgHum).toFixed(1)}%`}
        </div>
      )}

      {/* 表单头部 */}
      <div className={s.card} style={{ marginBottom:16 }}>
        <div className={s.cardBody} style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'center' }}>
          <div>
            <label className={s.lbl}>{t('common.date','日期')}</label>
            <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className={s.inp} style={{ width:160 }} />
          </div>
          <div>
            <label className={s.lbl}>{t('ui.鸡舍','鸡舍')}</label>
            <select value={selectedHouse} onChange={e => setSelectedHouse(e.target.value)} className={s.inp} style={{ width:160 }}>
              {houses.map(h => <option key={h.code} value={h.code}>{h.label}</option>)}
            </select>
          </div>
          {deviceHint && (
            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'6px 12px', backgroundColor:'color-mix(in srgb,var(--color-primary) 10%,transparent)', border:'1px solid color-mix(in srgb,var(--color-primary) 30%,transparent)', borderRadius:'var(--radius-sm)', fontSize:12, color:'var(--color-primary)', flexWrap:'wrap' }}>
              <span style={{ fontWeight:600 }}>📡 {t('ui.传感器参考：','传感器参考：')}</span>
              {deviceHint.temp     && <span>{t('ui.温度','温度')} {deviceHint.temp}℃</span>}
              {deviceHint.humidity && <span>{t('ui.湿度','湿度')} {deviceHint.humidity}%</span>}
              {deviceHint.feedKg   && <span>{t('ui.耗料','耗料')} {deviceHint.feedKg}kg</span>}
              {deviceHint.waterL   && <span>{t('ui.用水','用水')} {deviceHint.waterL}L</span>}
              <span style={{ color:'var(--text-secondary)', fontSize:11 }}>（{t('ui.已自动预填所有班次，可手动修改','已自动预填所有班次，可手动修改')}）</span>
            </div>
          )}
          <div style={{ marginLeft:'auto', display:'flex', gap:24 }}>
            {[
              { label:t('ui.合计产蛋','合计产蛋'), val: total.eggs   || '—', unit:t('ui.枚','枚') },
              { label:t('ui.合计死淘','合计死淘'), val: total.deaths || '—', unit:t('ui.羽','羽') },
              { label:t('ui.合计饲料','合计饲料'), val: total.feedKg || '—', unit:'kg' },
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
          <span className={s.cardTitle} style={{ color:'var(--color-primary)' }}>{t('ui.班次数据录入','班次数据录入')}</span>
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
                      className={s.inp} style={{ width:'120px', padding:'6px 8px' }} placeholder={`${t('common.remark','备注')}...`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 历史记录 */}
      <h3 ref={historyRef} style={{ fontSize:15, fontWeight:700, marginBottom:12, color:'var(--color-primary)', display:'flex', alignItems:'center', gap:8 }}>
        {t('ui.近期日报记录','近期日报记录')}
        {selectedHouse && <span style={{ fontSize:12, fontWeight:500, color:'var(--text-secondary)', backgroundColor:'var(--bg-page)', border:'1px solid var(--border)', borderRadius:12, padding:'2px 10px' }}>{houses.find(h => h.code === selectedHouse)?.label || selectedHouse}</span>}
      </h3>
      <div className={s.card} style={{ overflow:'hidden' }}>
        <table className={s.table}>
          <thead>
            <tr>
              {[t('common.date','日期'),t('ui.鸡舍','鸡舍'),t('ui.产蛋数','产蛋数'),t('ui.脏蛋','脏蛋'),t('ui.破损蛋','破损蛋'),t('ui.死淘','死淘'),t('ui.饲料(kg)','饲料(kg)'),t('ui.温度','温度'),t('ui.湿度','湿度'),t('common.remark','备注')].map(h =>
                <th key={h}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {visibleReports.map((r, i) => (
              <tr key={i}>
                <td>{String(r.date ?? '—')}</td>
                <td>{String(r.houseName ?? r.house ?? '—')}</td>
                <td style={{ fontWeight:600 }}>{Number(r.eggs ?? 0).toLocaleString()}</td>
                <td style={{ color: Number(r.dirtyEggs)>30?'#d97706':'var(--text-primary)' }}>{String(r.dirtyEggs ?? 0)}</td>
                <td style={{ color: Number(r.brokenEggs)>20?'var(--status-danger)':'var(--text-primary)', fontWeight: Number(r.brokenEggs)>20?700:'normal' }}>{String(r.brokenEggs ?? 0)}</td>
                <td style={{ color: Number(r.deaths)>8?'var(--status-danger)':'var(--text-primary)' }}>{String(r.deaths ?? '—')}</td>
                <td>{String(r.feedKg ?? '—')}</td>
                <td>{String(r.temp ?? '—')}℃</td>
                <td>{String(r.humidity ?? '—')}%</td>
                <td style={{ color:'var(--text-secondary)', fontSize:12 }}>{String(r.remark ?? '—')}</td>
              </tr>
            ))}
            {!visibleReports.length && <tr><td colSpan={10} style={{ padding:24, textAlign:'center', color:'var(--text-secondary)', fontSize:13 }}>{t('ui.暂无该鸡舍的日报记录','暂无该鸡舍的日报记录')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
