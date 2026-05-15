'use client';
import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import RightDrawer from '@/components/RightDrawer';
import { useCrud } from '@/hooks/useCrud';
import { useDictOptions } from '@/hooks/useDictOptions';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/contexts/ToastContext';
import { Plus, CheckCircle, AlertTriangle, Edit2 } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';

// A3 + C5: 状态枚举统一大写（V2 残留有小写 done/pending/overdue/scheduled 混存，已由
// generic-crud.service.ts boot migration UPPER 统一）
const STATUS_CONF: Record<string, { status: string; label: string }> = {
  DONE:      { status:'success', label:'已完成' },
  PENDING:   { status:'info',    label:'待执行' },
  OVERDUE:   { status:'danger',  label:'逾期未执行' },
  SCHEDULED: { status:'default', label:'已计划' },
};
const normStatus = (s: string) => String(s || '').toUpperCase();
const DOSE_BY_METHOD: Record<string, string> = {
  '滴鼻点眼':'2 drops/bird', '饮水':'1 dose/bird (diluted)',
  '皮下注射':'0.5ml/bird',   '肌肉注射':'0.5ml/bird', '喷雾':'Per house area',
};
const EMPTY_FORM = { batchNo:'', farmHouse:'', vaccine:'', planDate:'', method:'', dose:'', vaccineBatchNo:'', flockCount:'', nextDueDate:'' };

export default function ImmunePage() {
  const toast = useToast();
  const { can } = usePermission();
  const [filter, setFilter] = useState('all');
  const [showDrawer, setShowDrawer] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const { fetchRecords, createRecord, updateRecord } = useCrud('brd_vaccinations');
  const { fetchRecords: fetchHouses } = useCrud('brd_houses');
  const { fetchRecords: fetchFlocks } = useCrud('brd_flocks');
  const { options: vaccineOpts }    = useDictOptions('BRD_VACCINE_TYPE');
  const { options: vaccMethodOpts } = useDictOptions('BRD_VACCINATE_METHOD');
  const [plans, setPlans]               = useState<any[]>([]);
  const [houseOptions, setHouseOptions] = useState<{ code: string; label: string; farm_code: string }[]>([]);
  const [flockOptions, setFlockOptions] = useState<{ code: string; label: string }[]>([]);
  const [flockMap, setFlockMap]         = useState<Record<string, { house_code: string; farm_code: string }>>({});

  useEffect(() => { if (vaccineOpts.length) setForm(p => ({ ...p, vaccine: p.vaccine || vaccineOpts[0] })); }, [vaccineOpts]);
  useEffect(() => {
    if (vaccMethodOpts.length) {
      const m = vaccMethodOpts[0];
      setForm(p => ({ ...p, method: p.method || m, dose: p.dose || DOSE_BY_METHOD[m] || '' }));
    }
  }, [vaccMethodOpts]);

  useEffect(() => {
    fetchHouses().then((h: any) => {
      setHouseOptions((h||[]).map((x: any) => ({ code: x.house_code||x.house_no, label: x.house_name?`${x.house_code} · ${x.house_name}`:x.house_code, farm_code: x.farm_code||'' })).filter((o: any) => o.code));
    });
    fetchFlocks().then((f: any) => {
      setFlockOptions((f||[]).map((x: any) => ({ code: x.flock_no, label: `${x.flock_no}${x.house_code?' · '+x.house_code:''}` })));
      const map: Record<string, any> = {};
      (f||[]).forEach((x: any) => { map[x.flock_no] = { house_code: x.house_code||'', farm_code: x.farm_code||'' }; });
      setFlockMap(map);
      if (f?.[0]) setForm(p => ({ ...p, batchNo: p.batchNo || f[0].flock_no, farmHouse: p.farmHouse || f[0].house_code || '' }));
    });
  }, []);

  const loadData = useCallback(async () => {
    const data = await fetchRecords();
    const now = new Date(); const today = new Date(now.toDateString());
    const soon = new Date(today.getTime() + 3 * 86400000);
    setPlans(((data||[]) as any[]).map((d: any) => {
      const planDate = d.plan_date ? new Date(d.plan_date) : null;
      let status: string;
      // 大写枚举与 STATUS_CONF 对齐
      if (d.actual_date)           status = 'DONE';
      else if (!planDate)          status = 'PENDING';
      else if (planDate < today)   status = 'OVERDUE';
      else if (planDate <= soon)   status = 'PENDING';
      else                         status = 'SCHEDULED';
      return { id:d.id, batchNo:d.flock_no||'未知', farmHouse:d.farm_house||d.house_code||'', vaccine:d.vaccine||d.vaccine_name, vaccineBatchNo:d.vaccine_batch_no||'', flockCount:d.flock_count||'', planDate:d.plan_date, nextDueDate:d.next_due_date||'', actualDate:d.actual_date, method:d.method||'', dose:d.dose||'', executor:d.executor||'', status };
    }));
  }, [fetchRecords]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRecordVaccine = async (row: any) => {
    const today = new Date().toISOString().slice(0,10);
    let user: any = {};
    try { user = JSON.parse(sessionStorage.getItem('phoenix_user')||'{}'); } catch {}
    const ok = await updateRecord(row.id, { status:'DONE', actual_date:today, executor: user.realNameZh||user.username||'' }, 'id', '保存成功');
    if (ok) loadData();
  };

  const handleEdit = (row: any) => {
    setEditId(row.id);
    setForm({ batchNo:row.batchNo||'', farmHouse:row.farmHouse||'', vaccine:row.vaccine||row.vaccine_name||vaccineOpts[0]||'', planDate:row.planDate||'', method:row.method||vaccMethodOpts[0]||'', dose:row.dose||'', vaccineBatchNo:row.vaccineBatchNo||'', flockCount:row.flockCount?String(row.flockCount):'', nextDueDate:row.nextDueDate||'' });
    setShowDrawer(true);
  };

  const handleSubmit = async () => {
    if (!form.batchNo)  { toast.error('请选择对应鸡群批次'); return; }
    if (!form.planDate) { toast.error('请选择计划免疫日期'); return; }
    if (form.flockCount && Number(form.flockCount) <= 0) { toast.error('免疫头数必须大于 0'); return; }
    const fi = flockMap[form.batchNo] || {};
    const payload = {
      flock_no: form.batchNo, farm_house: form.farmHouse || fi.house_code || null,
      house_code: fi.house_code || form.farmHouse || null, farm_code: fi.farm_code || null,
      vaccine: form.vaccine,
      flock_count: form.flockCount ? Number(form.flockCount) : null,
      plan_date: form.planDate, next_due_date: form.nextDueDate || null,
      method: form.method, dose: form.dose,
    };
    const ok = editId
      ? await updateRecord(editId, payload, 'id', '免疫计划更新成功！')
      : await createRecord({ ...payload, actual_date:null, executor:'', status:'pending' }, '免疫计划制定成功！');
    if (ok) {
      setShowDrawer(false); setEditId(null);
      setForm({ ...EMPTY_FORM, batchNo:flockOptions[0]?.code||'', vaccine:vaccineOpts[0]||'', method:vaccMethodOpts[0]||'', dose:DOSE_BY_METHOD[vaccMethodOpts[0]]||'' });
      loadData();
    }
  };

  // A3 + C5: 统一大写枚举
  const filterKeys = ['all','PENDING','OVERDUE','SCHEDULED','DONE'];
  const filterLabels: Record<string, string> = { all:'全部', PENDING:'待执行', OVERDUE:'逾期', SCHEDULED:'已计划', DONE:'已完成' };
  const filteredData = filter==='all' ? plans : plans.filter(p => normStatus(p.status)===filter);
  const overdueCnt   = plans.filter(p => normStatus(p.status)==='OVERDUE').length;
  const pendingCnt   = plans.filter(p => normStatus(p.status)==='PENDING').length;
  const scheduledCnt = plans.filter(p => normStatus(p.status)==='SCHEDULED').length;
  const doneCnt      = plans.filter(p => normStatus(p.status)==='DONE').length;

  const columns = [
    { key:'batchNo',        title:'鸡群批次', width:'120px' },
    { key:'farmHouse',      title:'鸡舍',     width:'100px' },
    { key:'vaccine',        title:'疫苗名称' },
    { key:'vaccineBatchNo', title:'疫苗批号', width:'130px', render: (v: any) => v ? <span style={{ fontFamily:'monospace', fontSize:12, color:'var(--color-primary)' }}>{v}</span> : <span style={{ color:'var(--text-secondary)' }}>—</span> },
    { key:'flockCount',     title:'免疫头数', width:'90px',  render: (v: any) => v ? `${v} 只` : '—' },
    { key:'planDate',       title:'计划日期', width:'100px' },
    { key:'nextDueDate',    title:'下次免疫', width:'100px', render: (v: any) => v || '—' },
    { key:'actualDate',     title:'执行日期', width:'100px', render: (v: any) => v || '—' },
    { key:'method',         title:'接种方式', width:'90px'  },
    { key:'dose',           title:'剂量',     width:'90px'  },
    { key:'executor',       title:'执行人',   width:'80px'  },
    { key:'status',         title:'状态',     width:'110px', render: (v: any) => { const st = STATUS_CONF[normStatus(v)]||{ status:'default', label:v }; return <StatusBadge status={st.status} label={st.label} />; } },
    { key:'actions',        title:'操作',     width:'120px', render: (_: any, row: any) => (
      <div className={s.tableActions}>
        {can(['ROLE_VET','ROLE_ADMIN']) && row.status==='pending' && (
          <button type="button" className={`${s.btn} ${s.btnSm}`} style={{ background:'var(--status-success)', color:'#fff', border:'none' }}
            onClick={() => handleRecordVaccine(row)}><CheckCircle size={12} />执行</button>
        )}
        {can(['ROLE_VET','ROLE_FARM_MGR','ROLE_ADMIN']) && (
          <button type="button" className={s.btnIcon} onClick={() => handleEdit(row)}><Edit2 size={12} /></button>
        )}
      </div>
    )},
  ];

  const KPI_CARDS = [
    { label:'计划总数',   val:`${plans.length}项`,  color:'var(--color-primary)' },
    { label:'待执行',     val:`${pendingCnt}项`,    color:'var(--color-primary)' },
    { label:'逾期未执行', val:`${overdueCnt}项`,    color:'var(--status-danger)' },
    { label:'已完成',     val:`${doneCnt}项`,       color:'var(--status-success)' },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="免疫计划" subtitle="管理所有鸡群的疫苗免疫计划与执行记录" breadcrumb={['养殖管理','免疫计划']}
        actions={can(['ROLE_VET','ROLE_FARM_MGR','ROLE_ADMIN']) && (
          <button type="button" className={s.btnPrimary}
            onClick={() => { setEditId(null); setForm({ ...EMPTY_FORM, batchNo:flockOptions[0]?.code||'', farmHouse:flockMap[flockOptions[0]?.code||'']?.house_code||'', vaccine:vaccineOpts[0]||'', method:vaccMethodOpts[0]||'', dose:DOSE_BY_METHOD[vaccMethodOpts[0]]||'' }); setShowDrawer(true); }}>
            <Plus size={15} />新增免疫计划
          </button>
        )} />

      {overdueCnt > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', backgroundColor:'color-mix(in srgb,var(--status-danger) 12%,transparent)', border:'1px solid color-mix(in srgb,var(--status-danger) 40%,transparent)', borderRadius:'var(--radius-md)', marginBottom:16, color:'#991b1b', fontSize:13, fontWeight:600 }}>
          <AlertTriangle size={16} />注意：有 {overdueCnt} 项免疫计划已逾期未执行，请尽快安排！
        </div>
      )}

      <div className={s.statsRow}>
        {KPI_CARDS.map(c => (
          <div key={c.label} className={s.statCard} style={{ borderLeftColor: c.color }}>
            <div className={s.statValue} style={{ color: c.color }}>{c.val}</div>
            <div className={s.statLabel}>{c.label}</div>
          </div>
        ))}
      </div>

      <DataTable columns={columns} data={filteredData} searchPlaceholder="搜索批次疫苗名称" searchKeys={['batchNo','farmHouse','vaccine']} rowKey="id"
        filters={<div style={{ display:'flex', gap:6 }}>
          {filterKeys.map(f => <button type="button" key={f} className={filter===f ? s.tabPillActive : s.tabPill} onClick={() => setFilter(f)}>
            {filterLabels[f]}{f==='scheduled'&&scheduledCnt>0&&<span style={{ marginLeft:4, fontSize:11 }}>({scheduledCnt})</span>}
          </button>)}
        </div>} />

      <RightDrawer isOpen={showDrawer} onClose={() => { setShowDrawer(false); setEditId(null); }} title={editId?'编辑免疫计划':'新增免疫计划'} width="420px">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className={s.field}>
            <label className={s.lbl}>对应鸡群批次 <span style={{ color:'var(--status-danger)' }}>*</span></label>
            <select value={form.batchNo} onChange={e => { const fi = flockMap[e.target.value]||{}; setForm(p => ({ ...p, batchNo:e.target.value, farmHouse:fi.house_code||p.farmHouse })); }} className={s.inp}>
              <option value="">请选择鸡群</option>
              {flockOptions.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>所在鸡舍 <span style={{ fontWeight:400, fontSize:11, color:'var(--color-primary)', marginLeft:6 }}>（随鸡群自动填入）</span></label>
            <select value={form.farmHouse} onChange={e => setForm(p => ({ ...p, farmHouse:e.target.value }))} className={s.inp}>
              <option value="">— 自动联动或手动选择 —</option>
              {houseOptions.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>疫苗名称</label>
            <select value={form.vaccine} onChange={e => setForm(p => ({ ...p, vaccine:e.target.value }))} className={s.inp}>
              {vaccineOpts.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>计划免疫日期 <span style={{ color:'var(--status-danger)' }}>*</span></label>
            <input type="date" value={form.planDate} onChange={e => setForm(p => ({ ...p, planDate:e.target.value }))} className={s.inp} />
          </div>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>接种方式</label>
              <select value={form.method} onChange={e => { const m=e.target.value; setForm(p => ({ ...p, method:m, dose:DOSE_BY_METHOD[m]||p.dose||'' })); }} className={s.inp}>
                {vaccMethodOpts.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={s.lbl}>规定剂量 <span style={{ fontWeight:400, fontSize:11, color:'var(--color-primary)' }}>（可更改）</span></label>
              <input value={form.dose} onChange={e => setForm(p => ({ ...p, dose:e.target.value }))} placeholder={DOSE_BY_METHOD[form.method]||'如0.5ml/只'} className={s.inp} />
            </div>
          </div>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>疫苗批号 <span style={{ fontSize:11, color:'var(--color-primary)', fontWeight:400 }}>（质量追溯）</span></label>
              <input value={form.vaccineBatchNo} onChange={e => setForm(p => ({ ...p, vaccineBatchNo:e.target.value }))} placeholder="如VAC-2026-001" className={s.inp} style={{ fontFamily:'monospace' }} />
            </div>
            <div>
              <label className={s.lbl}>免疫头数（只）</label>
              <input type="number" onFocus={e=>e.currentTarget.select()} min="1" value={form.flockCount} onChange={e => setForm(p => ({ ...p, flockCount:String(Math.max(0,Math.floor(Number(e.target.value)||0))||'') }))} placeholder="如5000" className={s.inp} />
            </div>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>下次免疫日期</label>
            <input type="date" value={form.nextDueDate} onChange={e => setForm(p => ({ ...p, nextDueDate:e.target.value }))} className={s.inp} />
          </div>
          <div style={{ display:'flex', gap:10, marginTop:6 }}>
            <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={() => { setShowDrawer(false); setEditId(null); }}>取消</button>
            <button type="button" className={s.btnPrimary} style={{ flex:2 }} onClick={handleSubmit}>{editId?'保存修改':'建立计划'}</button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}