'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import RightDrawer from '@/components/RightDrawer';
import { useCrud } from '@/hooks/useCrud';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/contexts/ToastContext';
import { useDialog } from '@/contexts/DialogContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Plus, Edit2, Trash2, Activity } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';

const HOUSE_TYPES_KEYS = ['密闭式', '开放式', '半开放'] as const;
type HouseTypeKey = typeof HOUSE_TYPES_KEYS[number];
const emptyForm = () => ({ farmName: '', code: '', name: '', type: '密闭式' as HouseTypeKey, capacity: '' });

export default function HenHousePage() {
  const router = useRouter();
  const toast = useToast();
  const { showConfirm } = useDialog();
  const { can } = usePermission();
  const { t } = useLanguage();

  const [farmFilter, setFarmFilter]         = useState('all');
  const [showDrawer, setShowDrawer]         = useState(false);
  const [editId, setEditId]                 = useState<string | null>(null);
  const [editRow, setEditRow]               = useState<any>(null);
  const [form, setForm]                     = useState(emptyForm());
  const [housesList, setHousesList]         = useState<any[]>([]);
  const [farmsList, setFarmsList]           = useState<any[]>([]);
  const [mappedHouses, setMappedHouses]     = useState<Set<string>>(new Set());

  const { fetchRecords, createRecord, updateRecord, deleteRecord } = useCrud('brd_houses');
  const { fetchRecords: fetchFarms }  = useCrud('brd_farms');
  const { fetchRecords: fetchFlocks } = useCrud('brd_flocks');

  const loadData = useCallback(async () => {
    const [houses, flocks] = await Promise.all([fetchRecords(), fetchFlocks()]);
    const flockByHouse: Record<string, any> = {};
    (flocks || []).forEach((f: any) => {
      const hc = f.house_code; if (!hc) return;
      if (!flockByHouse[hc]) flockByHouse[hc] = { qty: 0, layRateSum: 0, layRateWeight: 0, startDate: null };
      const qty = Number(f.current_qty) || 0;
      flockByHouse[hc].qty += qty;
      if (f.current_lay_rate != null && qty > 0) {
        flockByHouse[hc].layRateSum    += f.current_lay_rate * qty;
        flockByHouse[hc].layRateWeight += qty;
      }
      if (f.start_date && (!flockByHouse[hc].startDate || f.start_date < flockByHouse[hc].startDate))
        flockByHouse[hc].startDate = f.start_date;
    });

    const today = new Date();
    const mapped = (houses || []).map((d: any) => {
      const hc = d.house_code;
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
    fetchFarms().then((res: any) => {
      const farms = res || [];
      setFarmsList(farms);
      if (farms.length > 0) setForm(prev => ({ ...prev, farmName: prev.farmName || farms[0].farm_code }));
    });
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') : '';
    fetch('/api/farm-device/mappings', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : [])
      .then(ms => setMappedHouses(new Set((Array.isArray(ms) ? ms : []).filter((m: any) => m.status === 'ACTIVE').map((m: any) => m.erp_house_code))))
      .catch(() => {});
  }, [loadData]);

  const handleEdit = (row: any) => {
    setEditId(row.id); setEditRow(row);
    setForm({ farmName: row.farmName || '', code: row.code || '', name: row.name || '', type: row.type || HOUSE_TYPES_KEYS[0], capacity: row.capacity != null ? String(row.capacity) : '' });
    setShowDrawer(true);
  };

  const handleDelete = async (row: any) => {
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
    const farmInfo = farmsList.find((f: any) => f.farm_code === form.farmName);
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
    { key: 'code',       title: t('ui.鸡舍编码','鸡舍编码'), width: '110px' },
    { key: 'farmLabel',  title: t('ui.所属农场','所属农场'), width: '100px' },
    { key: 'name',       title: t('ui.栋名','栋名'),     width: '70px'  },
    { key: 'type',       title: t('ui.舍型','舍型'),     width: '80px'  },
    { key: 'capacity',   title: t('ui.设计容量','设计容量'), width: '90px',  render: (v: any) => `${Number(v).toLocaleString()} ${t('ui.羽','羽')}` },
    { key: 'current',    title: t('ui.当前存栏','当前存栏'), width: '110px', render: (v: any, row: any) => (
      <span>{(v||0).toLocaleString()} {t('ui.羽','羽')}{row.capacity>0&&<span style={{ fontSize:11, color:row.isOverload?'var(--status-danger)':'var(--text-secondary)', marginLeft:4, fontWeight:row.isOverload?700:400 }}>({row.occupancyPct}%{row.isOverload?' ⚠️':''})</span>}</span>
    )},
    { key: 'ageWeeks',   title: t('ui.鸡龄周','鸡龄周'),  width: '80px',  render: (v: any) => v > 0 ? `${v} ${t('ui.周','周')}` : '—' },
    { key: 'layingRate', title: t('ui.产蛋率','产蛋率'),  width: '80px',  render: (v: any) => v != null ? <span style={{ fontWeight:700, color: v>=90?'var(--status-success)':v>=85?'var(--status-warning)':'var(--status-danger)' }}>{v}%</span> : <span style={{color:'var(--text-secondary)'}}>—</span> },
    { key: 'status',     title: t('common.status','状态'),    width: '90px',  render: (v: any, row: any) => <StatusBadge status={v==='normal'?'success':'warning'} label={v==='normal'?t('ui.正常','正常'):row.isOverload?t('ui.超载','超载'):t('ui.需关注','需关注')} /> },
    { key: 'actions',   title: t('common.operation','操作'),    width: '160px', render: (_: any, row: any) => (
      <div className={s.tableActions}>
        {can(['MENU_DEVICE_MONITOR']) && (
          <button
            className={mappedHouses.has(row.code) ? `${s.btn} ${s.btnSm}` : `${s.btn} ${s.btnSm} ${s.btnGhost}`}
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

  const KPI_CARDS = [
    { label:t('ui.鸡舍总数','鸡舍总数'), val:`${housesList.length}`, unit:t('ui.栋','栋'), color:'var(--color-primary)' },
    { label:t('ui.总存栏','总存栏'),   val:totalCurrent.toLocaleString(), unit:t('ui.羽','羽'), color:'var(--color-primary)' },
    { label:t('ui.正常鸡舍','正常鸡舍'), val:`${normalCount}`, unit:t('ui.栋','栋'), color:'#22c55e' },
    { label:t('ui.需关注','需关注'),   val:`${warnCount}`,   unit:t('ui.栋','栋'), color:'#f59e0b' },
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
          <div key={c.label} className={s.statCard} style={{ borderLeftColor: c.color }}>
            <div className={s.statValue} style={{ color: c.color }}>{c.val}<span style={{ fontSize:13, fontWeight:500, marginLeft:3, opacity:0.75 }}>{c.unit}</span></div>
            <div className={s.statLabel}>{c.label}</div>
          </div>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} searchPlaceholder={t('ui.搜索鸡舍编码名称','搜索鸡舍编码名称')} searchKeys={['code','name','farmLabel']} rowKey="id"
        filters={<div className={s.toolbar} style={{ gap:6 }}>
          <button type="button" className={farmFilter==='all' ? s.tabPillActive : s.tabPill} onClick={() => setFarmFilter('all')}>{t('ui.全部农场','全部农场')}</button>
          {farmsList.map((f: any) => <button type="button" key={f.farm_code} className={farmFilter===f.farm_code ? s.tabPillActive : s.tabPill} onClick={() => setFarmFilter(f.farm_code)}>{f.farm_name}</button>)}
        </div>} />

      <RightDrawer isOpen={showDrawer} onClose={() => { setShowDrawer(false); setEditId(null); setEditRow(null); }} title={`${editId?t('common.edit','编辑'):t('common.new','新增')}${t('ui.鸡舍','鸡舍')}`} width="450px">
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.所属农场','所属农场')} <span style={{color:'var(--status-danger)'}}>*</span></label>
            <select value={form.farmName} onChange={e => setForm({...form, farmName:e.target.value})} className={s.inp}>
              <option value="">{t('ui.选择所属农场','选择所属农场')}</option>
              {farmsList.map((f: any) => <option key={f.farm_code} value={f.farm_code}>{f.farm_name}</option>)}
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
            <div style={{ display:'flex', gap:12 }}>
              {HOUSE_TYPES_KEYS.map(type => (
                <label key={type} style={{ display:'flex', alignItems:'center', gap:6, fontSize:14, cursor:'pointer' }}>
                  <input type="radio" name="houseType" value={type} checked={form.type===type} onChange={e => setForm({...form,type:e.target.value as HouseTypeKey})} />
                  {type === '密闭式' ? t('ui.密闭式','密闭式') : type === '开放式' ? t('ui.开放式','开放式') : t('ui.半开放','半开放')}
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
