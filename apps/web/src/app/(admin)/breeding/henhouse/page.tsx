'use client';
import type { FarmRow } from '@/types';
import { useState, useEffect, useCallback } from 'react';

interface HouseCard {
  id: string | number; dbId?: unknown; code: string;
  farmName?: string; farmLabel?: string; name?: string; type?: string;
  capacity: number; current: number; currentBirds: number;
  ageWeeks: number; layingRate: number | null;
  occupancyPct: number; isOverload: boolean; status: string;
}
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import RightDrawer from '@/components/RightDrawer';
import { useCrud } from '@/hooks/useCrud';
import { useDictOptions } from '@/hooks/useDictOptions';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/contexts/ToastContext';
import { useDialog } from '@/contexts/DialogContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Plus, Edit2, Trash2, Activity, Building2, Users, CheckCircle, AlertTriangle } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';

const emptyForm = () => ({ farmName: '', code: '', name: '', type: '', capacity: '' });

export default function HenHousePage() {
  const router = useRouter();
  const toast = useToast();
  const { showConfirm } = useDialog();
  const { can } = usePermission();
  const { t } = useLanguage();

  const [farmFilter, setFarmFilter]         = useState('all');
  const [showDrawer, setShowDrawer]         = useState(false);
  const [editId, setEditId]                 = useState<string | null>(null);
  const [editRow, setEditRow]               = useState<HouseCard | null>(null);
  const [form, setForm]                     = useState(emptyForm());
  const [housesList, setHousesList]         = useState<HouseCard[]>([]);
  const [farmsList, setFarmsList]           = useState<FarmRow[]>([]);
  const [mappedHouses, setMappedHouses]     = useState<Set<string>>(new Set());

  const { fetchRecords, createRecord, updateRecord, deleteRecord } = useCrud('brd_houses');
  const { fetchRecords: fetchFarms }  = useCrud('brd_farms');
  const { fetchRecords: fetchFlocks } = useCrud('brd_flocks');
  const { optionPairs: houseTypeOptions, codeMap: houseTypeMap } = useDictOptions('BRD_HOUSE_TYPE');

  const loadData = useCallback(async () => {
    const [houses, flocks] = await Promise.all([fetchRecords(), fetchFlocks()]);
    const flockByHouse: Record<string, any> = {};
    (flocks || []).forEach((f: Record<string, unknown>) => {
      const hc = f.house_code as string; if (!hc) return;
      if (!flockByHouse[hc]) flockByHouse[hc] = { qty: 0, layRateSum: 0, layRateWeight: 0, startDate: null };
      const qty = Number(f.current_qty) || 0;
      flockByHouse[hc].qty += qty;
      if (f.current_lay_rate != null && qty > 0) {
        flockByHouse[hc].layRateSum    += Number(f.current_lay_rate) * qty;
        flockByHouse[hc].layRateWeight += qty;
      }
      if (f.start_date && (!flockByHouse[hc].startDate || String(f.start_date) < flockByHouse[hc].startDate))
        flockByHouse[hc].startDate = f.start_date;
    });

    const today = new Date();
    const mapped = (houses || []).map((d: Record<string, unknown>) => {
      const hc = d.house_code as string;
      const agg = flockByHouse[hc] || { qty: 0, layRateSum: 0, layRateWeight: 0, startDate: null };
      const ageWeeks   = agg.startDate ? Math.floor((today.getTime() - new Date(agg.startDate).getTime()) / (7 * 86400000)) : 0;
      const layingRate = agg.layRateWeight > 0 ? parseFloat((agg.layRateSum / agg.layRateWeight).toFixed(2)) : null;
      const cap        = Number(d.capacity) || 0;
      const current    = agg.qty;
      const occupancyPct = cap > 0 ? Math.round(current / cap * 100) : 0;
      const isOverload   = cap > 0 && occupancyPct > 120;
      const status       = (d.status === 'ACTIVE' && !isOverload) ? 'normal' : 'warning';
      return { id: hc || d.id, dbId: d.id, code: hc, farmName: d.farm_code, farmLabel: d.farm_name || d.farm_code, name: d.house_name, type: d.house_type, capacity: cap, current, ageWeeks, layingRate, occupancyPct, currentBirds: Number(d.current_birds) || 0, status, isOverload };
    });
    setHousesList(mapped);
  }, [fetchRecords, fetchFlocks]);

  useEffect(() => {
    loadData();
    fetchFarms().then((res) => {
      const farms = res || [];
      setFarmsList(farms);
      if (farms.length > 0) setForm(prev => ({ ...prev, farmName: prev.farmName || farms[0].farm_code }));
    });
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') : '';
    fetch('/api/farm-device/mappings', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : [])
      .then(ms => setMappedHouses(new Set((Array.isArray(ms) ? ms : []).filter((m: Record<string, unknown>) => m.status === 'ACTIVE').map((m: Record<string, unknown>) => m.erp_house_code as string))))
      .catch(() => {});
  }, [loadData]);

  const handleEdit = (row: HouseCard) => {
    setEditId(String(row.id)); setEditRow(row);
    setForm({ farmName: row.farmName || '', code: row.code || '', name: row.name || '', type: row.type || houseTypeOptions[0]?.value || '', capacity: row.capacity != null ? String(row.capacity) : '' });
    setShowDrawer(true);
  };

  const handleDelete = async (row: HouseCard) => {
    if (Number(row.current || 0) > 0) { toast.error(`${t('ui.该鸡舍仍有','该鸡舍仍有')} ${Number(row.current).toLocaleString()} ${t('ui.羽在栏鸡群，无法删除。请先办理鸡群出栏。','羽在栏鸡群，无法删除。请先办理鸡群出栏。')}`); return; }
    const ok = await showConfirm({ icon:'🗑️', type:'danger', title:t('ui.确认解散','确认解散'), message:`${t('ui.确认拆除鸡舍','确认拆除鸡舍')}: ${row.name}（${row.code}）`, confirmLabel:t('ui.确认解散','确认解散') });
    if (ok) { const ok2 = await deleteRecord(row.id, 'house_code', t('ui.鸡舍删除成功','鸡舍删除成功')); if (ok2) loadData(); }
  };

  const handleSave = async () => {
    if (!form.farmName) { toast.error(t('ui.请选择农场','请选择农场')); return; }
    if (!form.name.trim()) { toast.error(t('ui.请填写鸡舍名称','请填写鸡舍名称')); return; }
    if (!editId && !form.code.trim()) { toast.error(t('ui.请填写鸡舍编码','请填写鸡舍编码')); return; }
    const cap = parseInt(form.capacity);
    if (form.capacity !== '' && (isNaN(cap) || cap < 0)) { toast.error(t('ui.容量不能为负','容量不能为负')); return; }
    const farmInfo = farmsList.find((f) => f.farm_code === form.farmName);
    const payload = { farm_code: form.farmName, farm_name: farmInfo?.farm_name || form.farmName, house_name: form.name.trim(), house_type: form.type, capacity: isNaN(cap) ? 0 : cap, status: 'ACTIVE' };
    const ok = editId
      ? await updateRecord(editId, payload, 'house_code', t('ui.鸡舍信息已更新','鸡舍信息已更新'))
      : await createRecord({ ...payload, house_code: form.code.trim(), current_birds: 0 }, t('ui.鸡舍注册成功','鸡舍注册成功'));
    if (ok) { setShowDrawer(false); setEditId(null); setEditRow(null); setForm({ ...emptyForm(), farmName: farmsList[0]?.farm_code || '' }); loadData(); }
  };

  const filtered = farmFilter === 'all' ? housesList : housesList.filter(h => h.farmName === farmFilter);
  const totalCurrent = housesList.reduce((s, h) => s + (Number(h.current) || 0), 0);
  const normalCount  = housesList.filter(h => h.status === 'normal').length;
  const warnCount    = housesList.filter(h => h.status === 'warning').length;

  const columns = [
    { key: 'name', title: t('ui.鸡舍','鸡舍'), width: '160px', render: (v: unknown, row: HouseCard) => (
      <div>
        <div style={{ fontWeight:600, color:'var(--text-primary)', lineHeight:1.3 }}>{v != null ? String(v) : '—'}</div>
        <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:2, fontFamily:'monospace' }}>{row.code}</div>
      </div>
    )},
    { key: 'farmLabel',  title: t('ui.所属农场','所属农场'), width: '110px', render: (v: unknown) => (
      <span style={{ fontSize:13 }}>{v != null ? String(v) : '—'}</span>
    )},
    { key: 'type',       title: t('ui.舍型','舍型'),     width: '75px',  render: (v: unknown) => houseTypeMap[v as string] ?? (v != null ? String(v) : '—') },
    { key: 'capacity',   title: t('ui.设计容量','设计容量'), width: '90px',  render: (v: unknown) => `${Number(v).toLocaleString()} ${t('ui.羽','羽')}` },
    { key: 'current',    title: t('ui.当前存栏','当前存栏'), width: '120px', render: (v: unknown, row: HouseCard) => (
      <div>
        <div style={{ marginBottom:4 }}>
          <span style={{ fontWeight:600 }}>{(Number(v)||0).toLocaleString()}</span>
          <span style={{ fontSize:11, color:'var(--text-secondary)', marginLeft:2 }}>{t('ui.羽','羽')}</span>
          {row.capacity>0 && <span style={{ fontSize:11, color:row.isOverload?'var(--status-danger)':'var(--text-secondary)', marginLeft:5, fontWeight:row.isOverload?700:400 }}>({row.occupancyPct}%{row.isOverload?' ⚠️':''})</span>}
        </div>
        {row.capacity>0 && (
          <div style={{ height:3, background:'var(--border)', borderRadius:2, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${Math.min(row.occupancyPct,100)}%`, background: row.isOverload?'#ef4444':row.occupancyPct>90?'#f59e0b':'#22c55e', borderRadius:2, transition:'width 0.4s' }} />
          </div>
        )}
      </div>
    )},
    { key: 'ageWeeks',   title: t('ui.鸡龄周','鸡龄周'),  width: '72px',  render: (v: unknown) => Number(v) > 0 ? `${String(v)} ${t('ui.周','周')}` : <span style={{color:'var(--text-secondary)'}}>—</span> },
    { key: 'layingRate', title: t('ui.产蛋率','产蛋率'),  width: '76px',  render: (v: unknown) => v != null ? <span style={{ fontWeight:700, color: Number(v)>=90?'var(--status-success)':Number(v)>=85?'var(--status-warning)':'var(--status-danger)' }}>{String(v)}%</span> : <span style={{color:'var(--text-secondary)'}}>—</span> },
    { key: 'status',     title: t('common.status','状态'),    width: '88px',  render: (v: unknown, row: HouseCard) => <StatusBadge status={v==='normal'?'success':'warning'} label={v==='normal'?t('ui.正常','正常'):row.isOverload?t('ui.超载','超载'):t('ui.需关注','需关注')} /> },
    { key: 'actions',   title: t('common.operation','操作'),    width: '160px', render: (_: unknown, row: HouseCard) => (
      <div className={s.tableActions}>
        {can(['MENU_DEVICE_MONITOR']) && (
          <button
type="button"             className={mappedHouses.has(row.code) ? `${s.btn} ${s.btnSm}` : `${s.btn} ${s.btnSm} ${s.btnGhost}`}
            style={mappedHouses.has(row.code) ? { color:'#16a34a', borderColor:'#bbf7d0', background:'#f0fdf4' } : { opacity:0.5, cursor:'default' }}
            onClick={() => mappedHouses.has(row.code) && router.push(`/breeding/device/${row.code}`)}>
            <Activity size={12} />{mappedHouses.has(row.code)?t('ui.实时环境','实时环境'):t('ui.未映射','未映射')}
          </button>
        )}
        {can(['ROLE_FARM_MGR','ROLE_ADMIN']) && (<>
          <button type="button" className={s.btnIcon} onClick={() => handleEdit(row)}><Edit2 size={12} /></button>
          <button type="button" className={`${s.btnIcon} ${s.btnDanger}`} onClick={() => handleDelete(row)}><Trash2 size={12} /></button>
        </>)}
      </div>
    )},
  ];

  const hasWarn = warnCount > 0;
  const KPI_CARDS = [
    { label:t('ui.鸡舍总数','鸡舍总数'), val:`${housesList.length}`, sub:t('ui.栋已登记','栋已登记'), Icon:Building2, cardCls:s.statCardPrimary, valCls:'', alarmBg:false },
    { label:t('ui.总存栏','总存栏'),   val:totalCurrent.toLocaleString(), sub:t('ui.羽在栏','羽在栏'), Icon:Users, cardCls:s.statCardPrimary, valCls:'', alarmBg:false },
    { label:t('ui.正常鸡舍','正常鸡舍'), val:`${normalCount}`, sub:`${t('ui.共','共')} ${housesList.length} ${t('ui.栋正常运行','栋正常运行')}`, Icon:CheckCircle, cardCls:s.statCardSuccess, valCls:s.textSuccess, alarmBg:false },
    { label:t('ui.需关注','需关注'),   val:`${warnCount}`, sub:hasWarn?t('ui.请检查超载鸡舍','请检查超载鸡舍'):t('ui.全部正常','全部正常'), Icon:AlertTriangle, cardCls:hasWarn?s.statCardDanger:s.statCardSuccess, valCls:hasWarn?s.textDanger:s.textSuccess, alarmBg:hasWarn },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('ui.鸡舍管理','鸡舍管理')} subtitle={`${t('ui.共','共')} ${housesList.length} ${t('ui.栋鸡舍','栋鸡舍')}`} breadcrumb={[t('ui.养殖管理','养殖管理'),t('ui.鸡舍管理','鸡舍管理')]}
        actions={can(['ROLE_FARM_MGR','ROLE_ADMIN']) && (
          <button type="button" className={s.btnPrimary}
            onClick={() => { setEditId(null); setEditRow(null); setForm({...emptyForm(), farmName: farmsList[0]?.farm_code||''}); setShowDrawer(true); }}>
            <Plus size={15} />{t('ui.新增鸡舍','新增鸡舍')}
          </button>
        )} />

      {/* KPI 统计卡片 */}
      <div className={s.statsRow}>
        {KPI_CARDS.map(c => (
          <div key={c.label} className={`${s.statCard} ${c.cardCls}`} style={c.alarmBg?{background:'rgba(239,68,68,0.05)'}:{}}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
              <div className={`${s.statValue} ${c.valCls}`} style={{ fontSize:28, lineHeight:1, letterSpacing:'-0.5px' }}>{c.val}</div>
              <c.Icon size={15} style={{ color:'var(--text-secondary)', opacity:0.4, marginTop:3, flexShrink:0 }} />
            </div>
            <div className={s.statLabel} style={{ fontSize:12, marginBottom:3 }}>{c.label}</div>
            <div className={s.statSub} style={{ fontSize:11, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} searchPlaceholder={t('ui.搜索鸡舍编码名称','搜索鸡舍编码名称')} searchKeys={['code','name','farmLabel']} rowKey="id"
        filters={<div className={s.toolbar} style={{ gap:6 }}>
          <button type="button" className={`${s.tabPill} ${farmFilter==='all' ? s.tabPillActive : ""}`} onClick={() => setFarmFilter('all')}>{t('ui.全部农场','全部农场')}</button>
          {farmsList.map((f) => <button type="button" key={f.farm_code as string} className={`${s.tabPill} ${farmFilter===f.farm_code ? s.tabPillActive : ""}`} onClick={() => setFarmFilter(f.farm_code as string)}>{f.farm_name as string}</button>)}
        </div>} />

      <RightDrawer isOpen={showDrawer} onClose={() => { setShowDrawer(false); setEditId(null); setEditRow(null); }} title={`${editId?t('common.edit','编辑'):t('common.new','新增')}${t('ui.鸡舍','鸡舍')}`} width="450px">
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.所属农场','所属农场')} <span style={{color:'var(--status-danger)'}}>*</span></label>
            <select value={form.farmName} onChange={e => setForm({...form, farmName:e.target.value})} className={s.inp}>
              <option value="">{t('ui.选择所属农场','选择所属农场')}</option>
              {farmsList.map((f) => <option key={f.farm_code as string} value={f.farm_code as string}>{f.farm_name as string}</option>)}
            </select>
          </div>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>
                {t('ui.鸡舍编码','鸡舍编码')} {!editId && <span style={{color:'var(--status-danger)'}}>*</span>}
                {editId && <span style={{ fontSize:11, color:'var(--text-secondary)', fontWeight:400 }}>（{t('ui.编辑时不可修改','编辑时不可修改')}）</span>}
              </label>
              <input value={form.code} readOnly={!!editId} onChange={e => setForm({...form,code:e.target.value})} placeholder={t('ui.例 A001','例 A001')}
                className={s.inp} style={{ backgroundColor: editId?'var(--bg-muted)':'', color: editId?'var(--text-secondary)':'', cursor: editId?'not-allowed':'' }} />
            </div>
            <div>
              <label className={s.lbl}>{t('ui.鸡舍名称','鸡舍名称')} <span style={{color:'var(--status-danger)'}}>*</span></label>
              <input value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder={t('ui.例 A栋（主产蛋舍）','例 A栋（主产蛋舍）')} className={s.inp} />
            </div>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.鸡舍类型','鸡舍类型')}</label>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              {houseTypeOptions.map(opt => (
                <label key={opt.value} style={{ display:'flex', alignItems:'center', gap:6, fontSize:14, cursor:'pointer' }}>
                  <input type="radio" name="houseType" value={opt.value} checked={form.type===opt.value} onChange={e => setForm({...form,type:e.target.value})} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.设计容量（最大存栏羽）','设计容量（最大存栏羽）')}</label>
            <input type="number" min="0" step="1" value={form.capacity} placeholder="0"
              onChange={e => setForm({...form, capacity: String(Math.max(0, Math.floor(Number(e.target.value)||0)))})} onFocus={e=>e.currentTarget.select()} className={s.inp} />
          </div>
          {editId && editRow && (
            <div style={{ padding:'10px 14px', backgroundColor:'var(--bg-muted)', borderRadius:'var(--radius-md)', fontSize:13, color:'var(--text-secondary)', border:'1px solid var(--border)' }}>
              📊 {t('ui.当前存栏：','当前存栏：')}<strong style={{color:'var(--text-primary)'}}>{(editRow.current||0).toLocaleString()} {t('ui.羽','羽')}</strong>
              &nbsp;·&nbsp;{t('ui.占用率：','占用率：')}<strong style={{color:editRow.isOverload?'var(--status-danger)':'var(--text-primary)'}}>{editRow.occupancyPct}%{editRow.isOverload?` ⚠️ ${t('ui.超载','超载')}`:''}</strong>
              <div style={{ fontSize:11, marginTop:4 }}>{t('ui.存栏数据来自鸡群档案（brd_flocks），不可在此修改','存栏数据来自鸡群档案（brd_flocks），不可在此修改')}</div>
            </div>
          )}
          <div style={{ display:'flex', gap:10, marginTop:4 }}>
            <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={() => { setShowDrawer(false); setEditId(null); setEditRow(null); }}>{t('common.cancel','取消')}</button>
            <button type="button" className={s.btnPrimary} style={{ flex:2 }} onClick={handleSave}>{editId?t('ui.保存修改','保存修改'):t('ui.确认注册','确认注册')}</button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}
