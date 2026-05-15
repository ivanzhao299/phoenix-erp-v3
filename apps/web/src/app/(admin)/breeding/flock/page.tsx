'use client';
import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import RightDrawer from '@/components/RightDrawer';
import { useCrud } from '@/hooks/useCrud';
import { usePermission } from '@/hooks/usePermission';
import { useDialog } from '@/contexts/DialogContext';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';

const STATUS_MAP: Record<string, { status: string; label: string }> = {
  GROWING:   { status: 'info',    label: '育雏/育成期' },
  LAYING:    { status: 'success', label: '产蛋期' },
  PEAK:      { status: 'info',    label: '产蛋高峰期' },
  DECLINING: { status: 'warning', label: '产蛋下降期' },
  RETIRED:   { status: 'default', label: '已淘汰' },
};
const statusFilters = [
  { key: 'all', label: '全部' },
  { key: 'LAYING', label: '产蛋期' }, { key: 'GROWING', label: '育成期' },
  { key: 'PEAK', label: '高峰期' },   { key: 'RETIRED', label: '已淘汰' },
];

const emptyForm = () => ({
  farmCode:'', house:'', breed:'海兰褐', source:'中国总部繁育基地',
  placementAge:'1', cost:'3.5', inDate:'', qty:'', targetWeeks:'80',
  eliminationDate:'', peakLayRate:'', feedConvRatio:'', flockStatus:'GROWING',
});

export default function FlockPage() {
  const { showConfirm, showAlert } = useDialog();
  const { can } = usePermission();
  const [statusFilter, setStatusFilter] = useState('all');
  const [showDrawer, setShowDrawer]     = useState(false);
  const [editId, setEditId]             = useState<string | null>(null);
  const [form, setForm]                 = useState(emptyForm());
  const [flocks, setFlocks]             = useState<any[]>([]);
  const [farms, setFarms]               = useState<any[]>([]);
  const [houses, setHouses]             = useState<any[]>([]);
  const [breedOptions, setBreedOptions] = useState(['海兰褐','罗曼粉','京红一号']);

  const { fetchRecords, createRecord, updateRecord, deleteRecord } = useCrud('brd_flocks');
  const { fetchRecords: fetchFarms }  = useCrud('brd_farms');
  const { fetchRecords: fetchHouses } = useCrud('brd_houses');
  const { fetchRecords: fetchDict }   = useCrud('sys_dict');

  const load = useCallback(async () => {
    const data = await fetchRecords();
    setFlocks((data||[]).map((d: any) => ({
      id: d.flock_no, batchNo: d.flock_no,
      farmName: d.farm_name || d.farm_code, house: d.house_code || '',
      breed: d.breed_type || '—', inDate: d.start_date,
      ageWeeks: d.start_date ? Math.floor((d.placement_age||0)/7) + Math.floor((Date.now()-new Date(d.start_date).getTime())/(86400000*7)) : 0,
      quantity: d.current_qty,
      layingRate: d.current_lay_rate ?? '—',
      feedRatio:  d.feed_conversion_ratio ?? '—',
      status: d.status || 'GROWING',
      _raw: d,
    })));
  }, [fetchRecords]);

  useEffect(() => {
    load();
    fetchFarms().then((r: any) => setFarms(r || []));
    fetchHouses().then((r: any) => setHouses(r || []));
    fetchDict({ limit: 1000 }).then((d: any) => {
      const opts = (d||[]).filter((x: any) => x.dict_type==='BRD_BREED_TYPE' && x.status==='ACTIVE').map((x: any) => x.dict_label_zh);
      if (opts.length) setBreedOptions(opts);
    });
  }, [load]);

  const handleEdit = (row: any) => {
    const r = row._raw || {};
    setEditId(row.id);
    setForm({
      farmCode: r.farm_code||'', house: r.house_code||'', breed: r.breed_type||'海兰褐',
      source: r.source_farm||r.farm_name||'中国总部繁育基地',
      placementAge: r.placement_age!=null?String(r.placement_age):'1',
      cost: r.cost!=null?String(r.cost):'0', inDate: r.start_date||'',
      qty: r.current_qty!=null?String(r.current_qty):'', targetWeeks: r.target_weeks!=null?String(r.target_weeks):'80',
      eliminationDate: r.elimination_date||'', peakLayRate: r.peak_lay_rate!=null?String(r.peak_lay_rate):'',
      feedConvRatio: r.feed_conversion_ratio!=null?String(r.feed_conversion_ratio):'',
      flockStatus: r.status||'GROWING',
    });
    setShowDrawer(true);
  };

  const handleDelete = async (row: any) => {
    // B1: 在栏数 > 0 拦截 — 直接删 brd_flocks 会留下孤儿 brd_daily_logs / brd_medications / brd_vaccinations
    const currentQty = Number(row.currentQty ?? row.current_qty ?? 0);
    if (currentQty > 0) {
      await showAlert({
        icon: '🚫',
        type: 'warning',
        title: '无法删除',
        message: `鸡群「${row.batchNo}」仍有 ${currentQty.toLocaleString()} 只在栏，请先办理出栏 (status=RETIRED) 后再删除档案`,
      });
      return;
    }
    const ok = await showConfirm({ icon:'🗑️', type:'danger', title:'确认删除', message:`确认删除鸡群档案: ${row.batchNo}？`, confirmLabel:'确认删除' });
    if (ok) { const s = await deleteRecord(row.id,'flock_no'); if (s) load(); }
  };

  const handleSubmit = async () => {
    const payload = {
      farm_code: form.farmCode,
      farm_name: farms.find((f: any) => f.farm_code===form.farmCode)?.farm_name || form.farmCode,
      source_farm: form.source, house_code: form.house, breed_type: form.breed,
      start_date: form.inDate || new Date().toISOString().slice(0,10),
      current_qty: Number(form.qty)||0, placement_age: Number(form.placementAge)||1,
      cost: Number(form.cost)||0, target_weeks: Number(form.targetWeeks)||80,
      status: form.flockStatus, elimination_date: form.eliminationDate||null,
      peak_lay_rate: form.peakLayRate ? Number(form.peakLayRate) : null,
      feed_conversion_ratio: form.feedConvRatio ? Number(form.feedConvRatio) : null,
    };
    let ok: boolean;
    if (editId) {
      ok = await updateRecord(editId, payload, 'flock_no', '更新成功');
    } else {
      const flockNo = 'FK-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(-3).toUpperCase();
      ok = await createRecord({ ...payload, flock_no: flockNo, batch_no: flockNo, initial_qty: Number(form.qty)||0 }, '新建成功');
    }
    if (ok) { setShowDrawer(false); setEditId(null); load(); }
  };

  const data = statusFilter === 'all' ? flocks : flocks.filter(f => f.status === statusFilter);

  const columns = [
    { key:'batchNo',    title:'批次号',  width:'130px' },
    { key:'farmName',   title:'养殖场',  width:'90px'  },
    { key:'house',      title:'鸡舍',    width:'70px'  },
    { key:'breed',      title:'品种',    width:'80px'  },
    { key:'inDate',     title:'进雏日期',width:'100px' },
    { key:'ageWeeks',   title:'鸡龄',    width:'70px',  render: (v: any) => `${v}周` },
    { key:'quantity',   title:'存栏量',  width:'90px',  render: (v: any) => `${Number(v).toLocaleString()}羽` },
    { key:'layingRate', title:'产蛋率',  width:'80px',  render: (v: any) => typeof v === 'number' ? <span style={{ fontWeight:700, color: v>=90?'var(--status-success)':v>=85?'var(--status-warning)':'var(--status-danger)' }}>{v}%</span> : <span style={{color:'var(--text-secondary)'}}>—</span> },
    { key:'feedRatio',  title:'料蛋比',  width:'80px',  render: (v: any) => typeof v === 'number' ? <span style={{ color: v<=2.35?'var(--status-success)':'var(--status-warning)' }}>{v}</span> : '—' },
    { key:'status',     title:'状态',    width:'100px', render: (v: any) => { const st = STATUS_MAP[v]||{status:'default',label:v}; return <StatusBadge status={st.status} label={st.label} />; } },
    { key:'actions',    title:'操作',    width:'100px', render: (_: any, row: any) => can(['ROLE_FARM_MGR','ROLE_ADMIN']) ? (
      <div className={s.tableActions}>
        <button type="button" className={s.btnIcon} onClick={() => handleEdit(row)}><Edit2 size={12} /></button>
        <button type="button" className={`${s.btnIcon} ${s.btnDanger}`} onClick={() => handleDelete(row)}><Trash2 size={12} /></button>
      </div>
    ) : null },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="鸡群档案" subtitle={`当前共 ${flocks.length} 个鸡群批次`} breadcrumb={['养殖管理','鸡群档案']}
        actions={can(['ROLE_FARM_MGR','ROLE_ADMIN']) && (
          <button type="button" className={s.btnPrimary} onClick={() => { setEditId(null); setForm(emptyForm()); setShowDrawer(true); }}>
            <Plus size={15} />新建鸡群档案
          </button>
        )} />

      <DataTable columns={columns} data={data} searchPlaceholder="搜索批次号农场" searchKeys={['batchNo','farmName','breed']} rowKey="id"
        filters={<div style={{ display:'flex', gap:6 }}>
          {statusFilters.map(f => <button type="button" key={f.key} className={statusFilter===f.key ? s.tabPillActive : s.tabPill} onClick={() => setStatusFilter(f.key)}>{f.label}</button>)}
        </div>} />

      <RightDrawer isOpen={showDrawer} onClose={() => { setShowDrawer(false); setEditId(null); }} title={`${editId?'编辑':'新建'}鸡群档案`} width="460px">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>归属养殖场</label>
              <select value={form.farmCode} onChange={e => setForm({...form, farmCode:e.target.value, house:''})} className={s.inp}>
                <option value="">选择养殖场</option>
                {farms.map((f:any) => <option key={f.farm_code} value={f.farm_code}>{f.farm_name}</option>)}
              </select>
            </div>
            <div>
              <label className={s.lbl}>入驻鸡舍</label>
              <select value={form.house} onChange={e => setForm({...form, house:e.target.value})} disabled={!form.farmCode} className={s.inp} style={{ opacity:form.farmCode?1:0.6, cursor:form.farmCode?'pointer':'not-allowed' }}>
                <option value="">{form.farmCode?'选择鸡舍':'请先选择养殖场'}</option>
                {houses.filter((h:any) => h.farm_code===form.farmCode).map((h:any) => <option key={h.house_code} value={h.house_code}>{h.house_name} ({h.house_type})</option>)}
              </select>
            </div>
          </div>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>鸡群品种</label>
              <select value={form.breed} onChange={e => setForm({...form, breed:e.target.value})} className={s.inp}>
                {breedOptions.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div><label className={s.lbl}>引种来源种禽企业</label><input value={form.source} onChange={e => setForm({...form, source:e.target.value})} placeholder="如XX育种公司" className={s.inp} /></div>
          </div>
          <div className={s.fieldRow}>
            <div><label className={s.lbl}>入舍日龄(天)</label><input type="number" onFocus={e=>e.currentTarget.select()} value={form.placementAge} onChange={e => setForm({...form, placementAge:e.target.value})} className={s.inp} /></div>
            <div><label className={s.lbl}>种苗单价(元/羽)</label><input type="number" onFocus={e=>e.currentTarget.select()} value={form.cost} onChange={e => setForm({...form, cost:e.target.value})} className={s.inp} /></div>
          </div>
          <div className={s.fieldRow}>
            <div><label className={s.lbl}>进雏入栏日期</label><input type="date" value={form.inDate} onChange={e => setForm({...form, inDate:e.target.value})} className={s.inp} /></div>
            <div><label className={s.lbl}>{editId?'当前存栏(羽)':'初始存栏(羽)'}</label><input type="number" onFocus={e=>e.currentTarget.select()} value={form.qty} onChange={e => setForm({...form, qty:e.target.value})} placeholder="如8000" className={s.inp} /></div>
          </div>
          <div className={s.fieldRow}>
            <div><label className={s.lbl}>计划产蛋周数(周)</label><input type="number" onFocus={e=>e.currentTarget.select()} value={form.targetWeeks} onChange={e => setForm({...form, targetWeeks:e.target.value})} className={s.inp} /></div>
            <div><label className={s.lbl}>计划淘汰日期</label><input type="date" value={form.eliminationDate} onChange={e => setForm({...form, eliminationDate:e.target.value})} className={s.inp} /></div>
          </div>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>历史峰值产蛋率(%)</label>
              <div style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:4 }}>日报提交后自动更新</div>
              <input type="number" onFocus={e=>e.currentTarget.select()} step="0.1" value={form.peakLayRate} onChange={e => setForm({...form, peakLayRate:e.target.value})} className={s.inp} />
            </div>
            <div>
              <label className={s.lbl}>当前料蛋比</label>
              <div style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:4 }}>日报提交后自动更新</div>
              <input type="number" onFocus={e=>e.currentTarget.select()} step="0.01" value={form.feedConvRatio} onChange={e => setForm({...form, feedConvRatio:e.target.value})} className={s.inp} />
            </div>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>鸡群状态</label>
            <select value={form.flockStatus} onChange={e => setForm({...form, flockStatus:e.target.value})} className={s.inp}>
              <option value="GROWING">🐣 育雏/育成期</option><option value="LAYING">🥚 产蛋期</option>
              <option value="PEAK">📈 产蛋高峰期</option><option value="DECLINING">📉 产蛋下降期</option>
              <option value="RETIRED">🏁 已淘汰</option>
            </select>
          </div>
          <div style={{ display:'flex', gap:10, marginTop:8 }}>
            <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={() => { setShowDrawer(false); setEditId(null); }}>取消</button>
            <button type="button" className={s.btnPrimary} style={{ flex:2 }} onClick={handleSubmit}>{editId?'保存修改':'确认建档'}</button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}