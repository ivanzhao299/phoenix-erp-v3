'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
interface ImmunePlan {
  id?: unknown;
  batchNo?: unknown;
  farmHouse?: unknown;
  vaccine?: unknown;
  vaccineBatchNo?: unknown;
  flockCount?: unknown;
  planDate?: unknown;
  nextDueDate?: unknown;
  actualDate?: unknown;
  method?: unknown;
  dose?: unknown;
  executor?: unknown;
  status: string;
  [key: string]: unknown;
}
interface InventoryLot {
  batch_no: string;
  product_code?: string;
  qty_available?: number | string;
  unit?: string;
  expire_date?: string | null;
  warehouse_code?: string | null;
}
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import { StatusBadge } from '@/components/design-system';
import RightDrawer from '@/components/RightDrawer';
import { useMasterNames } from '@/hooks/useMasterNames';
import { masterDisplayLabel } from '@/lib/master-display';
import { useVetChoices, useVetFlocks } from '@/hooks/useVetFlocks';
import { farmProductionApi } from '@/lib/api-client';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/contexts/ToastContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Plus, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import DictSelect from '@/components/shared-selectors/DictSelect';
import s from '@/components/ui/admin-ui.module.css';
import {
  primaryActionButton, secondaryActionButton, actionPill, toolbarFilterPill, inlineAlert,
  kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
} from '@/components/design-system/cockpit-styles';

type Tone = "default" | "success" | "warning" | "danger" | "info" | "brand";

// A3 + C5: 状态枚举统一大写（V2 残留有小写 done/pending/overdue/scheduled 混存，已由
// generic-crud.service.ts boot migration UPPER 统一）
import u from "@/styles/uix-utils.module.css";
const normStatus = (s: string) => String(s || '').toUpperCase();
const EMPTY_FORM = {
  recordNo: '',
  batchNo: '',
  farmHouse: '',
  vaccine: '',
  planDate: '',
  method: '',
  dose: '',
  vaccineBatchNo: '',
  flockCount: '',
  nextDueDate: '',
  vaccineExpireDate: '',
  inventoryBatchNo: '',
  plannedHeads: '',
  doseValue: '',
  issueLines: [{ inventoryBatchNo: '', quantity: '' }]
};
const businessToday = () => {
  const timeZone = process.env.NEXT_PUBLIC_PHOENIX_BUSINESS_TIMEZONE || 'Asia/Singapore';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
export default function ImmunePage() {
  const toast = useToast();
  const { t, lang } = useLanguage();
  const houseNames = useMasterNames('house');
  // G24-A：can(role[]) → PBAC（MENU_FARM_VET：免疫记录归兽医防疫域）
  const { canCreate: canCreateImm, canEdit: canEditImm } = usePermission('MENU_FARM_VET');
  const [linkedPlan, setLinkedPlan] = useState('');
  useEffect(() => { setLinkedPlan(new URLSearchParams(window.location.search).get('planId') || ''); }, []);
  const [filter, setFilter] = useState('all');
  const [showDrawer, setShowDrawer] = useState(false);
  const [form, setForm] = useState({
    ...EMPTY_FORM
  });
  const STATUS_CONF: Record<string, {
    status: string;
    label: string;
  }> = {
    DONE: {
      status: 'success',
      label: t('status.done', '已完成')
    },
    PENDING: {
      status: 'info',
      label: t('ui.待执行', '待执行')
    },
    OVERDUE: {
      status: 'danger',
      label: t('ui.逾期未执行', '逾期未执行')
    },
    SCHEDULED: {
      status: 'default',
      label: t('ui.已计划', '已计划')
    },
    PLANNED: {
      status: 'info',
      label: t('ui.待执行', '待执行')
    },
    EXECUTED: {
      status: 'success',
      label: t('status.done', '已完成')
    },
    CANCELLED: {
      status: 'default',
      label: t('ui.已取消', '已取消')
    }
  };
  const unwrapData = (value: unknown): Record<string, unknown>[] => {
    if (Array.isArray(value)) return value as Record<string, unknown>[];
    if (value && typeof value === 'object' && 'data' in value && Array.isArray(value.data)) return value.data as Record<string, unknown>[];
    return [];
  };
  const fetchRecords = useCallback(() => farmProductionApi.listImmunePlans().then(unwrapData), []);
  const [submitError,setSubmitError] = useState('');
  const createRecord = useCallback(async (data: Record<string, unknown>, _msg?: string) => {
    try { await farmProductionApi.createImmunePlan(data); toast.success(_msg || t('common.success', '操作成功')); return true; }
    catch (error) {setSubmitError(error instanceof Error ? error.message : '免疫计划保存失败');return false;}
  }, [t, toast]);
  const [plans, setPlans] = useState<ImmunePlan[]>([]);
  const flocks = useVetFlocks();
  const flock = flocks.find(row => row.flock_no === form.batchNo);
  const [executing, setExecuting] = useState<ImmunePlan | null>(null);
  const [saving, setSaving] = useState(false);
  const {materials:vaccineOpts,lots,error:lotError} = useVetChoices(flock,form.vaccine,'VACCINE',
    showDrawer ? String(executing?.id || form.recordNo) : '');
  const inventoryLots = lots as unknown as InventoryLot[];
  const loadData = useCallback(async () => {
    const data = await fetchRecords();
    const today = businessToday();
    const soon = new Date(`${today}T00:00:00Z`);
    soon.setUTCDate(soon.getUTCDate() + 3);
    const soonDate = soon.toISOString().slice(0, 10);
    setPlans(((data || []) as Record<string, unknown>[]).map((d: Record<string, unknown>) => {
      const planDate = d.plan_date ? String(d.plan_date).slice(0, 10) : null;
      let status: string;
      // 大写枚举与 STATUS_CONF 对齐
      const backendStatus = String(d.effective_status || d.status || '').toUpperCase();
      if (backendStatus === 'EXECUTED' || d.actual_date) status = 'EXECUTED';else if (backendStatus === 'CANCELLED') status = 'CANCELLED';else if (backendStatus === 'OVERDUE' || (planDate && planDate < today)) status = 'OVERDUE';else if (backendStatus === 'PLANNED' || !planDate || (planDate && planDate <= soonDate)) status = 'PLANNED';else status = 'SCHEDULED';
      return {
        id: d.id,
        batchNo: d.flock_no || t('ui.未知', '未知'),
        farmHouse: d.house_code || d.farm_house || '—',
        currentHouse: d.current_house_code || '—',
        executedHouse: d.executed_house_code || '—',
        vaccine: d.executed_material_name ? [d.vaccine_name || d.vaccine_code,d.executed_material_name].filter((v,i,a)=>v && a.indexOf(v)===i).join(' → ') : (d.vaccine_name || d.vaccine_code || d.material_code || d.vaccine),
        vaccineBatchNo: d.vaccine_batch_no || '',
        flockCount: d.actual_heads || d.planned_heads || d.flock_count || '',
        consumed: Array.isArray(d.issue_lines) ? d.issue_lines.map(l=>l.qty+' '+l.unit_code+' · '+l.inventory_batch_no).join('，') : '',
        planDate: d.plan_date,
        nextDueDate: d.next_due_date || '',
        actualDate: d.actual_date,
        method: d.method || '',
        dose: d.dose || '',
        executor: d.executor || '',
        status,
        vaccineExpireDate: d.vaccine_expire_date || '',
        inventoryBatchNo: d.inventory_batch_no || '',
        plannedHeads: d.planned_heads || d.flock_count || '',
        doseValue: d.dose_value || '',
        _raw: d
      };
    }));
  }, [fetchRecords, t]);
  useEffect(() => {
    loadData();
  }, [loadData]);
  const handleRecordVaccine = async (row: ImmunePlan) => {
    const raw = (row._raw || row) as Record<string, unknown>;
    const target = flocks.find(f=>f.flock_no===row.batchNo);
    if (!target) { toast.error('当前鸡群已关闭或不在可登记范围内'); return; }
    const planned = Array.isArray(raw.planned_issue_lines) ? raw.planned_issue_lines : [];
    setSubmitError('');
    setExecuting(row);
    setForm({...EMPTY_FORM, batchNo:target.flock_no, farmHouse:target.house_code, vaccine:String(raw.material_code || ''),
      plannedHeads:String(raw.planned_heads || ''), vaccineBatchNo:String(raw.vaccine_batch_no || ''),
      issueLines:planned.length ? planned.map(l=>({inventoryBatchNo:String(l.inventory_batch_no),quantity:String(l.qty)}))
        : [{inventoryBatchNo:String(raw.inventory_batch_no || ''),quantity:''}]});
    setShowDrawer(true);
  };
  const handleSubmit = async () => {
    setSubmitError('');
    if (saving || !flock || !form.vaccine || !Number.isInteger(Number(form.plannedHeads)) ||
        Number(form.plannedHeads)<=0 || Number(form.plannedHeads)>flock.current_qty) {
      toast.error('请选择鸡群和疫苗，羽数须在当前存栏内'); return;
    }
    const entered = form.issueLines.filter(l=>l.inventoryBatchNo || l.quantity);
    if ((executing && !entered.length) || entered.some(l=>!inventoryLots.some(b=>b.batch_no===l.inventoryBatchNo)
        || !(Number(l.quantity)>0)) || new Set(entered.map(l=>l.inventoryBatchNo)).size!==entered.length) {
      toast.error('请逐行选择有效库存批次并填写耗用数量'); return;
    }
    const issue_lines = entered.map(l=>({inventory_batch_no:l.inventoryBatchNo,qty:Number(l.quantity),
      unit_code:inventoryLots.find(b=>b.batch_no===l.inventoryBatchNo)?.unit}));
    if (executing) {
      setSaving(true);
      try {
        await farmProductionApi.executeImmunePlan(Number(executing.id), {material_code:form.vaccine, actual_heads:Number(form.plannedHeads), issue_lines,
          vaccine_batch_no:form.vaccineBatchNo || undefined});
        setShowDrawer(false); setExecuting(null); await loadData();
        toast.success('免疫执行已登记，库存已扣减');
      } catch (e) {setSubmitError(e instanceof Error ? e.message : '执行失败');}
      finally {setSaving(false);}
      return;
    }
    if (!form.planDate) { toast.error('请选择计划日期'); return; }
    const payload = {
      record_no: form.recordNo, flock_no: form.batchNo,
      house_code: flock.house_code,
      farm_code: flock.farm_code,
      site_code: flock.site_code, company_code: flock.company_code,
      material_code: form.vaccine,
      vaccine_batch_no: form.vaccineBatchNo || undefined,
      inventory_batch_no: entered[0]?.inventoryBatchNo,
      vaccine_expire_date: form.vaccineExpireDate || undefined,
      planned_heads: Number(form.plannedHeads || form.flockCount || 0),
      plan_date: form.planDate,
      next_due_date: form.nextDueDate || null,
      method_code: form.method,
      dose_value: form.doseValue ? Number(form.doseValue) : undefined,
      dose: form.dose || undefined,
      issue_lines,
    };
    setSaving(true);
    try {
      if (await createRecord(payload, t('ui.免疫计划制定成功','免疫计划制定成功'))) {
        setShowDrawer(false); await loadData();
      }
    } finally {setSaving(false);}

  };

  // A3 + C5: 统一大写枚举
  const filterKeys = ['all', 'PLANNED', 'OVERDUE', 'EXECUTED', 'CANCELLED'];
  const filterLabels: Record<string, string> = {
    all: t('common.total', '全部'),
    PLANNED: t('ui.待执行', '待执行'),
    OVERDUE: t('ui.逾期', '逾期'),
    SCHEDULED: t('ui.已计划', '已计划'),
    EXECUTED: t('status.done', '已完成'),
    CANCELLED: t('ui.已取消', '已取消')
  };
  const filteredData = useMemo(() => plans.filter(p => (!linkedPlan || String(p.id) === linkedPlan)
    && (filter === 'all' || normStatus(p.status) === filter)), [plans, filter, linkedPlan]);
  const overdueCnt = useMemo(() => plans.filter(p => normStatus(p.status) === 'OVERDUE').length, [plans]);
  const pendingCnt = useMemo(() => plans.filter(p => ['PENDING', 'PLANNED'].includes(normStatus(p.status))).length, [plans]);
  const scheduledCnt = useMemo(() => plans.filter(p => normStatus(p.status) === 'SCHEDULED').length, [plans]);
  const doneCnt = useMemo(() => plans.filter(p => ['DONE', 'EXECUTED'].includes(normStatus(p.status))).length, [plans]);
  const columns = [{
    key: 'batchNo',
    title: t('ui.鸡群批次', '鸡群批次'),
    width: '120px'
  }, {
    key: 'farmHouse',
    render: (houseCode: unknown) => masterDisplayLabel(houseNames, 'house', houseCode, lang),
    title: t('vet.eventHouse', '记录时鸡舍'),
  }, {
    key: 'currentHouse',
    render: (houseCode: unknown) => masterDisplayLabel(houseNames, 'house', houseCode, lang),
    title: t('vet.careHouse', '当前照管舍'),
  }, {
    key: 'executedHouse',
    render: (houseCode: unknown) => masterDisplayLabel(houseNames, 'house', houseCode, lang), title: t('vet.executedHouse', '实际执行舍'),
  }, {
    key: 'vaccine',
    title: t('ui.疫苗名称', '疫苗名称')
  }, {
    key: 'vaccineBatchNo',
    title: t('ui.疫苗批号', '疫苗批号'),
    width: '130px',
    render: (v: unknown) => v != null && v !== '' ? <span style={{
      fontFamily: 'monospace',
      fontSize: 12,
      color: 'var(--color-primary)'
    }}>{String(v)}</span> : <span className={u.muted}>—</span>
  }, {
    key: 'flockCount',
    title: t('ui.免疫头数', '免疫头数'),
    width: '90px',
    render: (v: unknown) => v != null && v !== '' ? `${String(v)} ${t('ui.只', '只')}` : '—'
  }, {
    key: 'consumed', title:'实际库存耗用',
  }, {
    key: 'planDate',
    title: t('ui.计划日期', '计划日期'),
    width: '100px'
  }, {
    key: 'nextDueDate',
    title: t('ui.下次免疫', '下次免疫'),
    width: '100px',
    render: (v: unknown) => v != null && v !== '' ? String(v) : '—'
  }, {
    key: 'actualDate',
    title: t('ui.执行日期', '执行日期'),
    width: '100px',
    render: (v: unknown) => v != null && v !== '' ? String(v) : '—'
  }, {
    key: 'method',
    title: t('ui.接种方式', '接种方式'),
    width: '90px'
  }, {
    key: 'dose',
    title: t('ui.剂量', '剂量'),
    width: '90px'
  }, {
    key: 'executor',
    title: t('ui.执行人', '执行人'),
    width: '80px'
  }, {
    key: 'status',
    title: t('common.status', '状态'),
    width: '110px',
    render: (v: unknown) => {
      const st = STATUS_CONF[normStatus(String(v ?? ''))] || {
        status: 'default',
        label: String(v ?? '')
      };
      return <StatusBadge status={st.status} label={st.label} />;
    }
  }, {
    key: 'actions',
    title: t('common.operation', '操作'),
    width: '120px',
    render: (_: unknown, row: ImmunePlan) => <div className={s.tableActions}>
        {canEditImm && ['PENDING', 'PLANNED', 'OVERDUE'].includes(normStatus(row.status)) && (
          <button type="button" onClick={() => handleRecordVaccine(row)} style={actionPill("success")}><CheckCircle size={12} />{t('ui.执行', '执行')}</button>
        )}
        {canEditImm && ['PENDING', 'PLANNED', 'OVERDUE'].includes(normStatus(row.status)) && (
          <button type="button" className={s.btnIcon} onClick={async () => { try { await farmProductionApi.cancelImmunePlan(Number(row.id)); await loadData(); }
            catch (error) { toast.error(error instanceof Error ? error.message : t('ui.取消免疫计划失败', '取消免疫计划失败')); } }} title={t('ui.取消', '取消')}><XCircle size={12} /></button>
        )}
      </div>
  }];
  const KPI_CARDS: { label: string; val: string; tone: Tone }[] = [
    { label: t('ui.计划总数',   '计划总数'),   val: `${plans.length}项`, tone: 'brand'   },
    { label: t('ui.待执行',     '待执行'),     val: `${pendingCnt}项`,   tone: 'warning' },
    { label: t('ui.逾期未执行', '逾期未执行'), val: `${overdueCnt}项`,   tone: 'danger'  },
    { label: t('status.done',   '已完成'),     val: `${doneCnt}项`,      tone: 'success' },
  ];
  return <div className="animate-fade-in">
      <PageHeader title={t('ui.免疫计划', '免疫计划')} subtitle={t('ui.管理所有鸡群的疫苗免疫计划与执行记录', '管理所有鸡群的疫苗免疫计划与执行记录')} breadcrumb={[t('ui.养殖管理', '养殖管理'), t('ui.免疫计划', '免疫计划')]}
        actions={canCreateImm && (
          <button type="button" onClick={() => { setForm({ ...EMPTY_FORM, recordNo:'VAC-'+crypto.randomUUID() }); setSubmitError(''); setExecuting(null); setShowDrawer(true); }} style={primaryActionButton}>
            <Plus size={14} />{t('ui.新增免疫计划', '新增免疫计划')}
          </button>
        )}
      />

      {/* g200f 逾期警告 — inlineAlert('danger') */}
      {overdueCnt > 0 && (
        <div style={{ ...inlineAlert("danger"), marginBottom: 16, fontWeight: 600 }}>
          <AlertTriangle size={14} />{t('ui.注意有免疫计划逾期', `注意：有 ${overdueCnt} 项免疫计划已逾期未执行，请尽快安排！`)}
        </div>
      )}

      {/* g200f KPI 4 卡 — kpiCardCompact(tone) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 20 }}>
        {KPI_CARDS.map(c => (
          <div key={c.label} style={kpiCardCompact(c.tone)}>
            <div style={kpiCardCompactLabel}>{c.label}</div>
            <div style={kpiCardCompactValue(c.tone)}>{c.val}</div>
          </div>
        ))}
      </div>

       {linkedPlan && <p>{t('vet.linkedPlan', '承接免疫计划')} #{linkedPlan} <button type="button" onClick={() => setLinkedPlan('')}>{t('vet.allPlans', '查看全部计划')}</button></p>}
      <DataTable columns={columns} data={filteredData} searchPlaceholder={t('ui.搜索批次疫苗名称', '搜索批次疫苗名称')} searchKeys={['batchNo', 'farmHouse', 'currentHouse', 'vaccine']} rowKey="id" filters={
        <div style={{ display: 'flex', gap: 6 }}>
          {filterKeys.map(f => (
            <button key={f} type="button" onClick={() => setFilter(f)} style={toolbarFilterPill(filter === f)}>
              {filterLabels[f]}{f === 'scheduled' && scheduledCnt > 0 && <span style={{ marginLeft: 4, fontSize: 11 }}>({scheduledCnt})</span>}
            </button>
          ))}
        </div>
      } />

      <RightDrawer isOpen={showDrawer} onClose={() => {
      setShowDrawer(false);
    }} title={executing ? '登记免疫执行' : t('ui.新增免疫计划', '新增免疫计划')} width="420px">
        <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }}>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.对应鸡群批次', '对应鸡群批次')} <span style={{
              color: 'var(--status-danger)'
            }}>*</span></label>
            <select aria-label="鸡群批次" disabled={!!executing} value={form.batchNo} onChange={e => {
              const selected = flocks.find(f=>f.flock_no===e.target.value);
              setForm(p=>({...p,batchNo:e.target.value,plannedHeads:selected?String(selected.current_qty):'',
                vaccine:'',issueLines:EMPTY_FORM.issueLines,inventoryBatchNo:''}));
            }} className={s.inp}>
              <option value="">请选择鸡群</option>
              {flocks.map(f=><option key={f.flock_no} value={f.flock_no}>{f.flock_no} · {f.house_code} · {f.current_qty} 羽</option>)}
            </select>
          </div>
          <div className={s.field}><label className={s.lbl}>所在鸡舍</label><input readOnly value={flock?.house_code || ''} className={s.inp}/></div>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.疫苗名称', '疫苗名称')}</label>
            {executing && !(executing._raw as Record<string,unknown>)?.material_code && <p>原计划：{String(executing.vaccine)}。请选择本次实际使用的疫苗物料。</p>}
            <select aria-label="疫苗" disabled={!!(executing?._raw as Record<string,unknown>)?.material_code} value={form.vaccine} onChange={e => setForm(p => ({
            ...p,
            vaccine: e.target.value, issueLines:EMPTY_FORM.issueLines, inventoryBatchNo:''
          }))} className={s.inp}>
              <option value="">{t('ui.请选择疫苗', '请选择疫苗')}</option>
              {vaccineOpts.map(v => <option key={String(v.material_code)} value={String(v.material_code)}>{String(v.material_name)} · {String(v.material_code)}</option>)}
            </select>
          </div>
          {!executing && <>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.计划免疫日期', '计划免疫日期')} <span style={{
              color: 'var(--status-danger)'
            }}>*</span></label>
            <input aria-label="计划免疫日期" type="date" value={form.planDate} onChange={e => setForm(p => ({
            ...p,
            planDate: e.target.value
          }))} className={s.inp} />
          </div>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>{t('ui.接种方式', '接种方式')}</label>
              <DictSelect dictType="BRD_VACCINATE_METHOD" value={form.method} allowEmpty={false} className={s.inp}
                onChange={m => setForm(p => ({ ...p, method: m }))} />
            </div>
            <div>
              <label className={s.lbl}>{t('ui.规定剂量', '规定剂量')} <span style={{
                fontWeight: 400,
                fontSize: 11,
                color: 'var(--color-primary)'
              }}>{t('ui.可更改', '（可更改）')}</span></label>
              <input value={form.dose} onChange={e => setForm(p => ({
              ...p,
              dose: e.target.value
            }))} placeholder="按实际医嘱填写剂量与单位" className={s.inp} />
            </div>
          </div>
          </>}
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>{executing?'实际免疫羽数':'计划免疫羽数'}</label>
              <input aria-label={executing?"实际免疫羽数":"计划免疫羽数"} type="number" onFocus={e => e.currentTarget.select()} min="1" value={form.plannedHeads || form.flockCount} onChange={e => setForm(p => ({
              ...p,
              plannedHeads: String(Math.max(0, Math.floor(Number(e.target.value) || 0)) || ''),
              flockCount: String(Math.max(0, Math.floor(Number(e.target.value) || 0)) || '')
            }))} placeholder={t('ui.如5000', '如5000')} className={s.inp} />
            </div>
          </div>
          <div className={s.fieldRow}>
            {!executing && <div>
              <label className={s.lbl}>{t('ui.疫苗有效期', '疫苗有效期')}</label>
              <input type="date" value={form.vaccineExpireDate} onChange={e => setForm(p => ({ ...p, vaccineExpireDate: e.target.value }))} className={s.inp} />
            </div>}
            <div>
              <label className={s.lbl}>{t('ui.厂商批号', '厂商批号')} <span style={{ fontSize: 11, color: 'var(--color-primary)', fontWeight: 400 }}>{t('ui.质量追溯', '（质量追溯）')}</span></label>
              <input value={form.vaccineBatchNo} onChange={e => setForm(p => ({ ...p, vaccineBatchNo: e.target.value }))} className={s.inp} placeholder={t('ui.如VAC-2026-001', '如 VAC-2026-001')} style={{ fontFamily: 'monospace' }} />
            </div>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.ERP库存批次分配', 'ERP库存批次分配')} <span style={{ fontSize: 11, color: 'var(--color-primary)', fontWeight: 400 }}>{t('ui.执行时按批次扣减并写入库存流水', '（执行时按批次扣减并写入库存流水）')}</span></label>
            {form.vaccine && !inventoryLots.length && <p role="status">{lotError || '本群所属公司、场站及授权药品仓暂无可选批次。请核对物料用途分类，或办理入库、调拨。'}</p>}
            {form.issueLines.map((line, index) => (
              <div key={`issue-line-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr 90px auto', gap: 6, marginBottom: 6 }}>
                <select aria-label="ERP库存批次" value={line.inventoryBatchNo} onChange={e => setForm(p => ({ ...p, issueLines: p.issueLines.map((x, i) => i === index ? { ...x, inventoryBatchNo: e.target.value } : x), inventoryBatchNo: index === 0 ? e.target.value : p.inventoryBatchNo }))} className={s.inp}>
                  <option value="">{inventoryLots.length ? t('ui.请选择库存批次', '请选择库存批次') : t('ui.暂无可用库存批次', '暂无可用库存批次')}</option>
                  {inventoryLots.map(lot => <option key={lot.batch_no} value={lot.batch_no}>{lot.batch_no} · {lot.qty_available ?? 0}{lot.unit ? ` ${lot.unit}` : ''}{lot.expire_date ? ` · ${lot.expire_date}` : ''}</option>)}
                </select>
                <input type="number" min="0" step="0.001" value={line.quantity} onChange={e => setForm(p => ({ ...p, issueLines: p.issueLines.map((x, i) => i === index ? { ...x, quantity: e.target.value } : x) }))} className={s.inp} aria-label={executing?'实际耗用数量':'计划耗用数量'} placeholder={inventoryLots.find(b=>b.batch_no===line.inventoryBatchNo)?.unit || '库存数量'} />
                <button type="button" className={s.btnIcon} onClick={() => setForm(p => ({ ...p, issueLines: p.issueLines.length > 1 ? p.issueLines.filter((_, i) => i !== index) : p.issueLines }))} title={t('ui.删除批次行', '删除批次行')}><XCircle size={14} /></button>
              </div>
            ))}
            <button type="button" className={s.btnSecondary} onClick={() => setForm(p => ({ ...p, issueLines: [...p.issueLines, { inventoryBatchNo: '', quantity: '' }] }))}><Plus size={13} />{t('ui.增加库存批次', '增加库存批次')}</button>
          </div>
          {!executing && <>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.剂量数值', '剂量数值')}</label>
            <input type="number" min="0" step="0.001" value={form.doseValue} onChange={e => setForm(p => ({ ...p, doseValue: e.target.value }))} className={s.inp} />
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.下次免疫日期', '下次免疫日期')}</label>
            <input type="date" value={form.nextDueDate} onChange={e => setForm(p => ({
            ...p,
            nextDueDate: e.target.value
          }))} className={s.inp} />
          </div>
          </>}
          {submitError && <p role="alert">{submitError}</p>}
          <div style={{
          display: 'flex',
          gap: 10,
          marginTop: 6
        }}>
          <button type="button" onClick={() => { setShowDrawer(false); }} style={{ ...secondaryActionButton, flex: 1, justifyContent: "center" }}>{t('common.cancel', '取消')}</button>
            <button type="button" disabled={saving} onClick={handleSubmit} style={{ ...primaryActionButton, flex: 2, justifyContent: "center" }}>{executing?'确认实际耗用并执行':t('ui.建立计划', '建立计划')}</button>
          </div>
        </div>
      </RightDrawer>
    </div>;
}
