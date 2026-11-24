'use client';

import EggWithdrawalReviews from '@/components/breeding/EggWithdrawalReviews';
import { useState, useEffect, useCallback } from 'react';
interface MedicineRecord {
  id?: unknown;
  batchNo?: unknown;
  farmHouse?: unknown;
  medicine?: unknown;
  disease?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  daysUsed?: unknown;
  withdrawDays?: unknown;
  clearDate?: unknown;
  dose?: unknown;
  executor?: unknown;
  status: string;
  _raw?: Record<string, unknown>;
  [key: string]: unknown;
}
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import { StatusBadge } from '@/components/design-system';
import RightDrawer from '@/components/RightDrawer';
import { useVetChoices, useVetFlocks } from '@/hooks/useVetFlocks';
import { farmProductionApi } from '@/lib/api-client';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/contexts/ToastContext';
import { Plus, XCircle } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';
import {
  primaryActionButton, secondaryActionButton, toolbarFilterPill,
  kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
} from '@/components/design-system/cockpit-styles';

type Tone = "default" | "success" | "warning" | "danger" | "info" | "brand";
import u from "@/styles/uix-utils.module.css";
const EMPTY_FORM = {
  recordNo: '',
  batchNo: '',
  farmHouse: '',
  medicine: '',
  disease: '',
  startDate: '',
  daysUsed: '1',
  withdrawDays: '',
  dose: '',
  doseUnit:'',
  actualQty: '',
  actualHeads: '',
  usageRoute: '',
  inventoryBatchNo: ''
};
const todayStr = () => {
  const timeZone = process.env.NEXT_PUBLIC_PHOENIX_BUSINESS_TIMEZONE || 'Asia/Singapore';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
export default function MedicinePage() {
  const toast = useToast();
  // G18-1：从 role check 改为 PBAC menu perm check（宋明光持 MENU_FARM_VET:C,E 但无 ROLE_VET，旧 role check 拒之门外）
  const {
    canEdit
  } = usePermission('MENU_FARM_VET');
  const { t } = useLanguage();
  const STATUS_CONF: Record<string, {
    status: string;
    label: string;
  }> = {
    inWithdrawal: {
      status: 'warning',
      label: t('ui.停药期内', '停药期内')
    },
    cleared: {
      status: 'success',
      label: t('ui.停药期已过', '停药期已过')
    },
    using: {
      status: 'info',
      label: t('ui.用药中', '用药中')
    },
    cancelled: {
      status: 'default',
      label: t('ui.已撤销', '已撤销')
    }
  };
  const [filter, setFilter] = useState('all');
  const [showDrawer, setShowDrawer] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    ...EMPTY_FORM
  });
  const [records, setRecords] = useState<MedicineRecord[]>([]);
  const flocks = useVetFlocks();
  const flock = flocks.find(f=>f.flock_no===form.batchNo);
  const [submitError,setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const unwrap = (value: unknown): Record<string, unknown>[] => {
    if (Array.isArray(value)) return value as Record<string, unknown>[];
    if (value && typeof value === 'object' && 'data' in value && Array.isArray(value.data)) return value.data as Record<string, unknown>[];
    return [];
  };
  const fetchRecords = useCallback(() => farmProductionApi.listMedicationRecords().then(unwrap), []);
  const {materials:medications,lots,error:lotError} = useVetChoices(flock,form.medicine,'MEDICATION',showDrawer ? form.recordNo : '',form.startDate);
  const selectedLot = lots.find(b=>b.batch_no===form.inventoryBatchNo);
  const loadData = useCallback(async () => {
    const data = await fetchRecords();
    setRecords(((data || []) as Record<string, unknown>[]).map((d: Record<string, unknown>) => {
      const backendStatus = String(d.effective_status || d.status || 'USING').toUpperCase();
      const computedStatus = backendStatus === 'IN_WITHDRAWAL' ? 'inWithdrawal' : backendStatus === 'CLEARED' ? 'cleared' : backendStatus === 'CANCELLED' ? 'cancelled' : 'using';
      return {
        id: d.id,
        batchNo: d.flock_no || '—',
        courseNo: d.course_no || d.record_no || '—',
        farmHouse: d.house_code || '—',
        currentHouse: d.current_house_code || '—',
        actual: d.actual_qty ? d.actual_qty+' '+d.qty_unit : '—',
        heads: d.actual_heads ?? '—',
        medicine: d.material_name || d.material_code || d.drug_name || d.medication_code || d.medicine,  // G21-4 新表用 medication_code
        disease: d.indication || d.disease,
        startDate: d.start_date,
        endDate: d.end_date,
        daysUsed: d.days_used,
        withdrawDays: d.withdraw_days,
        clearDate: d.withdraw_until,
        dose: d.dose_value || d.dose,
        executor: d.executor,
        status: computedStatus,
        _raw: d
      };
    }));
  }, [fetchRecords, t]);
  useEffect(() => {
    loadData();
  }, [loadData]);
  const handleCancel = async (row: MedicineRecord) => {
    if (!canEdit || !window.confirm(t('ui.确认撤销该用药记录', '确认撤销该用药记录？'))) return;
    setBusy(true);
    try { await farmProductionApi.cancelMedicationRecord(Number(row.id)); await loadData(); } catch {} finally { setBusy(false); }
  };
  const createRecord = async (payload: Record<string, unknown>) => {
    try {
      await farmProductionApi.createMedicationRecord(payload);
      return true;
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '用药登记失败，请核对批次和可用量');
      return false;
    }
  };
  const handleSubmit = async () => {
    if (!flock || !selectedLot || !Number.isInteger(Number(form.actualHeads)) || Number(form.actualHeads)<=0 || Number(form.actualHeads)>flock.current_qty || !form.medicine || !form.startDate || !form.actualQty || Number(form.actualQty) <= 0 || !form.usageRoute || (form.dose !== '' && Number(form.dose) <= 0) || (!Number.isSafeInteger(Number(form.daysUsed)) || Number(form.daysUsed) <= 0) || form.withdrawDays === '' || !Number.isInteger(Number(form.withdrawDays)) || Number(form.withdrawDays) < 0) {
      toast.error(t('ui.请补齐药品、开始日期、数量和用药途径', '请选择鸡群、药品和批次，核对羽数、耗量、日期、疗程天数、休药天数和用药途径'));
      return;
    }
    const payload = {
      record_no:form.recordNo, flock_no:flock.flock_no, house_code:flock.house_code, farm_code:flock.farm_code,
      site_code:flock.site_code, company_code:flock.company_code, actual_heads:Number(form.actualHeads),
      material_code: form.medicine,
      indication:      form.disease || undefined,
      start_date:      form.startDate,
      end_date:        form.daysUsed ? new Date(Date.parse(`${form.startDate}T00:00:00Z`) + (Number(form.daysUsed) - 1) * 86400000).toISOString().slice(0, 10) : undefined,
      dose_unit:form.doseUnit || undefined,
      dose_value:      form.dose ? Number(form.dose) : undefined,

      actual_qty:      Number(form.actualQty),
      qty_unit:        String(selectedLot.unit),
      usage_route:     form.usageRoute,
      withdraw_days:   form.withdrawDays ? Number(form.withdrawDays) : undefined,
      inventory_batch_no: form.inventoryBatchNo || undefined,
    };
    setSubmitError('');
    setBusy(true);
    const ok = await createRecord(payload);
    setBusy(false);
    if (ok) {
      setShowDrawer(false);
      setEditId(null);
      setForm({
        ...EMPTY_FORM,
        batchNo: ''
      });
      loadData();
    }
  };
  const filterKeys = ['all', 'using', 'inWithdrawal', 'cleared'];
  const filterLabels: Record<string, string> = {
    all: t('common.total', '全部'),
    using: t('ui.用药中', '用药中'),
    inWithdrawal: t('ui.停药期内', '停药期内'),
    cleared: t('ui.已解禁', '已解禁')
  };
  const data = filter === 'all' ? records : records.filter(r => r.status === filter);
  const today = todayStr();
  const KPI_CARDS: { label: string; val: string; tone: Tone }[] = [
    { label: t('ui.停药期内批次', '停药期内批次'), val: `${records.filter(r => r.status === 'inWithdrawal').length} 个`, tone: 'warning' },
    { label: t('vet.courseEnding', '今日休药期届满'), val: `${records.filter(r => r.clearDate === today).length} 个`,    tone: 'success' },
    { label: t('ui.累计用药记录', '累计用药记录'), val: `${records.length} 条`,                                       tone: 'brand'   },
  ];
  const columns = [{
    key: 'batchNo',
    title: t('ui.鸡群批次', '鸡群批次'),
    width: '120px'
  }, {
    key: 'farmHouse',
    title: t('vet.eventHouse', '记录时鸡舍'),
  }, {
    key: 'currentHouse',
    title: t('vet.careHouse', '当前照管舍'),
  }, {
    key: 'courseNo', title: t('vet.courseNo', '疗程单号'),
  }, {
    key: 'medicine',
    title: t('ui.药品名称', '药品名称'),
    width: '100px'
  }, {
    key: 'heads', title:'实际用药羽数',
  }, {
    key: 'actual', title:'实际库存耗用',
  }, {
    key: 'disease',
    title: t('ui.治疗疾病', '治疗疾病'),
    width: '90px'
  }, {
    key: 'startDate',
    title: t('ui.开始日期', '开始日期'),
    width: '100px'
  }, {
    key: 'endDate',
    title: t('ui.结束日期', '结束日期'),
    width: '100px'
  }, {
    key: 'daysUsed',
    title: t('ui.用药天数', '用药天数'),
    width: '80px',
    render: (v: unknown) => `${String(v ?? '')} ${t('ui.天', '天')}`
  }, {
    key: 'withdrawDays',
    title: t('ui.停药期', '停药期'),
    width: '80px',
    render: (v: unknown) => `${String(v ?? '')} ${t('ui.天', '天')}`
  }, {
    key: 'clearDate',
    title: t('ui.解禁日期', '解禁日期'),
    width: '100px',
    render: (v: unknown, row: MedicineRecord) => <span style={{
      fontWeight: 600,
      color: row.status === 'inWithdrawal' ? 'var(--status-danger)' : 'var(--status-success)'
    }}>{String(v ?? '')}</span>
  }, {
    key: 'status',
    title: t('common.status', '状态'),
    width: '110px',
    render: (v: unknown) => {
      const st = STATUS_CONF[v as string] || {
        status: 'default',
        label: String(v ?? '')
      };
      return <StatusBadge status={st.status} label={st.label} />;
    }
  }, {
    key: 'executor',
    title: t('ui.兽医', '兽医'),
    width: '70px'
  }, {
    key: 'actions',
    title: t('common.operation', '操作'),
    width: '70px',
    render: (_: unknown, row: MedicineRecord) => canEdit && row.status !== 'cancelled' ? <button type="button" className={s.btnIcon} disabled={busy} onClick={() => handleCancel(row)} title={t('ui.撤销', '撤销')}><XCircle size={13} /></button> : null
  }];
  return <div className="animate-fade-in">
      <PageHeader title={t('ui.用药记录', '用药记录')} subtitle={t('ui.记录所有鸡群用药情况及停药期管理', '记录所有鸡群用药情况及停药期管理')} breadcrumb={[t('ui.养殖管理', '养殖管理'), t('ui.用药记录', '用药记录')]}
        actions={canEdit && (
          <button type="button" onClick={() => { setSubmitError(''); setEditId(null); setForm({ ...EMPTY_FORM, recordNo:'MED-'+crypto.randomUUID() }); setShowDrawer(true); }} style={primaryActionButton}>
            <Plus size={14} />{t('ui.新增用药记录', '新增用药记录')}
          </button>
        )}
      />

      {/* g200f KPI 3 卡 — kpiCardCompact(tone) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 20 }}>
        {KPI_CARDS.map(c => (
          <div key={c.label} style={kpiCardCompact(c.tone)}>
            <div style={kpiCardCompactLabel}>{c.label}</div>
            <div style={kpiCardCompactValue(c.tone)}>{c.val}</div>
          </div>
        ))}
      </div>

      <EggWithdrawalReviews/>
      <DataTable columns={columns} data={data} searchPlaceholder={t('ui.搜索批次药品', '搜索批次药品')} searchKeys={['batchNo', 'farmHouse', 'currentHouse', 'medicine']} rowKey="id" filters={
        <div style={{ display: 'flex', gap: 6 }}>
          {filterKeys.map(f => (
            <button key={f} type="button" onClick={() => setFilter(f)} style={toolbarFilterPill(filter === f)}>{filterLabels[f]}</button>
          ))}
        </div>
      } />

      <RightDrawer isOpen={showDrawer} onClose={() => {
      setShowDrawer(false);
      setEditId(null);
    }} title={editId ? t('ui.编辑用药记录', '编辑用药记录') : t('ui.新增用药记录', '新增用药记录')} width="400px">
        <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }}>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.对应鸡群批次', '对应鸡群批次')}</label>
            <select aria-label="鸡群批次" value={form.batchNo} onChange={e=>{
              const f=flocks.find(row=>row.flock_no===e.target.value);
              setForm({...form,batchNo:e.target.value,actualHeads:f?String(f.current_qty):'',medicine:'',inventoryBatchNo:''});
            }} className={s.inp}><option value="">请选择鸡群</option>
              {flocks.map(f=><option key={f.flock_no} value={f.flock_no}>{f.flock_no} · {f.house_code} · {f.current_qty} 羽</option>)}
            </select>
          </div>
          <div className={s.field}><label className={s.lbl}>实际用药羽数</label><input aria-label="实际用药羽数" type="number" min="1" max={flock?.current_qty} value={form.actualHeads} onChange={e=>setForm({...form,actualHeads:e.target.value})} className={s.inp}/></div>
          <div className={s.fieldRow}>
            <div><label className={s.lbl}>药品主数据 *</label><select aria-label="药品" value={form.medicine} onChange={e=>{
              const code=e.target.value;
              const m=medications.find(m=>m.material_code===code);
              setForm({...form,medicine:code,doseUnit:'',withdrawDays:String(m?.default_withdraw_days ?? ''),inventoryBatchNo:''});
            }} className={s.inp}><option value="">请选择药品</option>{medications.map(m=><option key={String(m.material_code)} value={String(m.material_code)}>{String(m.material_name)} · {String(m.material_code)}</option>)}</select></div>
            <div><label className={s.lbl}>{t('ui.治疗疾病', '治疗疾病')}</label><input value={form.disease} onChange={e => setForm({
              ...form,
              disease: e.target.value
            })} placeholder={t('ui.如大肠杆菌', '如大肠杆菌')} className={s.inp} /></div>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.开始用药日期', '开始用药日期')}</label>
            <input type="date" max={today} value={form.startDate} onChange={e => setForm({
            ...form,
            startDate: e.target.value
          })} className={s.inp} />
          </div>
          <div className={s.fieldRow}>
            <div><label className={s.lbl}>{t('ui.连用天数', '连用天数')}</label><input type="number" min="1" onFocus={e => e.currentTarget.select()} value={form.daysUsed} onChange={e => setForm({
              ...form,
              daysUsed: e.target.value
            })} className={s.inp} /></div>
            <div><label className={s.lbl}>{t('ui.停药休药期天', '停药休药期（天）')}</label><input type="number" min="0" onFocus={e => e.currentTarget.select()} value={form.withdrawDays} onChange={e => setForm({
              ...form,
              withdrawDays: e.target.value
            })} className={s.inp} /></div>
          </div>
          <div className={s.fieldRow}>
            <div><label className={s.lbl}>{t('ui.实际用量', '实际用量')} *</label><input type="number" min="0.001" step="0.001" aria-label="实际用量" value={form.actualQty} onChange={e => setForm({ ...form, actualQty: e.target.value })} className={s.inp} /></div>
            <div><label className={s.lbl}>{t('ui.用量单位', '用量单位')}</label><input value={String(selectedLot?.unit || '')} readOnly className={s.inp} /></div>
          </div>
          <div className={s.fieldRow}>
            <div><label className={s.lbl}>{t('ui.用药途径', '用药途径')} *</label><input aria-label="用药途径" value={form.usageRoute} onChange={e => setForm({ ...form, usageRoute: e.target.value })} placeholder={t('ui.如饮水或拌料', '如饮水或拌料')} className={s.inp} /></div>
            <div><label className={s.lbl}>{t('ui.库存批次', '库存批次')}</label><select aria-label="ERP库存批次" value={form.inventoryBatchNo} onChange={e => setForm({ ...form, inventoryBatchNo: e.target.value })} className={s.inp}><option value="">请选择库存批次</option>{lots.map(lot => <option key={String(lot.batch_no)} value={String(lot.batch_no)}>{String(lot.batch_no)} · {String(lot.qty_available ?? '')} {String(lot.unit || '')}</option>)}</select></div>
          </div>
          {form.medicine && !lots.length && <p role="status">{lotError || '本群所属公司、场站及授权药品仓暂无可选批次。请核对物料映射，或先办理入库、调拨。'}</p>}
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.规定剂量', '规定剂量')}</label>
            <input type="number" step="any" min="0" value={form.dose} onChange={e => setForm({
            ...form,
            dose: e.target.value
          })} className={s.inp} />
            <label className={s.lbl}>剂量单位</label><input value={form.doseUnit} onChange={e=>setForm({...form,doseUnit:e.target.value})} className={s.inp}/>
          </div>
          {submitError && <p role="alert">{submitError}</p>}
          <div style={{
          display: 'flex',
          gap: 10,
          marginTop: 6
        }}>
            <button type="button" onClick={() => { setShowDrawer(false); setEditId(null); }} style={{ ...secondaryActionButton, flex: 1, justifyContent: "center" }}>{t('common.cancel', '取消')}</button>
            <button type="button" disabled={busy} onClick={handleSubmit} style={{ ...primaryActionButton, flex: 2, justifyContent: "center" }}>{t('ui.新增用药', '新增用药')}</button>
          </div>
        </div>
      </RightDrawer>
    </div>;
}
