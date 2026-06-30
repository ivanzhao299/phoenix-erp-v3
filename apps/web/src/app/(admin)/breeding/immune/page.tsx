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
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import { StatusBadge } from '@/components/design-system';
import RightDrawer from '@/components/RightDrawer';
import { crudApi } from '@/lib/api-client'; // G27-C：useCrud → crudApi
import { useDictOptions } from '@/hooks/useDictOptions';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/contexts/ToastContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Plus, CheckCircle, AlertTriangle, Edit2 } from 'lucide-react';
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
const DOSE_BY_METHOD: Record<string, string> = {
  '滴鼻点眼': '2 drops/bird',
  '饮水': '1 dose/bird (diluted)',
  '皮下注射': '0.5ml/bird',
  '肌肉注射': '0.5ml/bird',
  '喷雾': 'Per house area'
};
const EMPTY_FORM = {
  batchNo: '',
  farmHouse: '',
  vaccine: '',
  planDate: '',
  method: '',
  dose: '',
  vaccineBatchNo: '',
  flockCount: '',
  nextDueDate: ''
};
export default function ImmunePage() {
  const toast = useToast();
  const {
    t
  } = useLanguage();
  const {
    can
  } = usePermission();
  // G24-A：can(role[]) → PBAC（MENU_FARM_VET：免疫记录归兽医防疫域）
  const { canCreate: canCreateImm, canEdit: canEditImm } = usePermission('MENU_FARM_VET');
  const [filter, setFilter] = useState('all');
  const [showDrawer, setShowDrawer] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
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
    }
  };
  // G27-C：useCrud → crudApi （deprecation 收口示范）
  const fetchRecords = useCallback(() => crudApi.list('brd_vaccinations', { pageSize: 1000 }).then(r => r.data), []);
  const fetchHouses  = useCallback(() => crudApi.list('brd_houses', { pageSize: 1000 }).then(r => r.data), []);
  const fetchFlocks  = useCallback(() => crudApi.list('brd_flocks', { pageSize: 1000 }).then(r => r.data), []);
  const createRecord = useCallback(async (data: Record<string, unknown>, _msg?: string) => {
    try { await crudApi.create('brd_vaccinations', data); toast.success(_msg || t('common.success', '操作成功')); return true; }
    catch { return false; /* G25-B 全局 toast 已捕获 error */ }
  }, []);
  const updateRecord = useCallback(async (id: number, data: Record<string, unknown>, _col?: string, _msg?: string) => {
    try { await crudApi.update('brd_vaccinations', id, data); toast.success(_msg || t('common.success', '操作成功')); return true; }
    catch { return false; }
  }, []);
  const {
    options: vaccineOpts
  } = useDictOptions('BRD_VACCINE_TYPE');
  const {
    options: vaccMethodOpts
  } = useDictOptions('BRD_VACCINATE_METHOD');
  const [plans, setPlans] = useState<ImmunePlan[]>([]);
  const [houseOptions, setHouseOptions] = useState<{
    code: string;
    label: string;
    farm_code: string;
  }[]>([]);
  const [flockOptions, setFlockOptions] = useState<{
    code: string;
    label: string;
  }[]>([]);
  const [flockMap, setFlockMap] = useState<Record<string, {
    house_code: string;
    farm_code: string;
  }>>({});
  useEffect(() => {
    if (vaccineOpts.length) setForm(p => ({
      ...p,
      vaccine: p.vaccine || vaccineOpts[0]
    }));
  }, [vaccineOpts]);
  useEffect(() => {
    if (vaccMethodOpts.length) {
      const m = vaccMethodOpts[0];
      setForm(p => ({
        ...p,
        method: p.method || m,
        dose: p.dose || DOSE_BY_METHOD[m] || ''
      }));
    }
  }, [vaccMethodOpts]);
  useEffect(() => {
    fetchHouses().then(h => {
      setHouseOptions((h || []).map((x: Record<string, unknown>) => ({
        code: (x.house_code || x.house_no) as string,
        label: x.house_name ? `${x.house_code} · ${x.house_name}` : String(x.house_code || ''),
        farm_code: x.farm_code as string || ''
      })).filter((o: {
        code: string;
        label: string;
        farm_code: string;
      }) => !!o.code));
    }).catch(() => {});
    fetchFlocks().then(f => {
      setFlockOptions((f || []).map((x: Record<string, unknown>) => ({
        code: x.flock_no as string,
        label: `${x.flock_no}${x.house_code ? ' · ' + x.house_code : ''}`
      })));
      const map: Record<string, {
        house_code: string;
        farm_code: string;
      }> = {};
      (f || []).forEach((x: Record<string, unknown>) => {
        map[x.flock_no as string] = {
          house_code: x.house_code as string || '',
          farm_code: x.farm_code as string || ''
        };
      });
      setFlockMap(map);
      if (f?.[0]) setForm(p => ({
        ...p,
        batchNo: p.batchNo || String(f[0].flock_no ?? ''),
        farmHouse: p.farmHouse || String(f[0].house_code ?? '')
      }));
    }).catch(() => {});
  }, []);
  const loadData = useCallback(async () => {
    const data = await fetchRecords();
    const now = new Date();
    const today = new Date(now.toDateString());
    const soon = new Date(today.getTime() + 3 * 86400000);
    setPlans(((data || []) as Record<string, unknown>[]).map((d: Record<string, unknown>) => {
      const planDate = d.plan_date ? new Date(d.plan_date as string) : null;
      let status: string;
      // 大写枚举与 STATUS_CONF 对齐
      if (d.actual_date) status = 'DONE';else if (!planDate) status = 'PENDING';else if (planDate < today) status = 'OVERDUE';else if (planDate <= soon) status = 'PENDING';else status = 'SCHEDULED';
      return {
        id: d.id,
        batchNo: d.flock_no || t('ui.未知', '未知'),
        farmHouse: d.farm_house || d.house_code || '',
        vaccine: d.vaccine || d.vaccine_name,
        vaccineBatchNo: d.vaccine_batch_no || '',
        flockCount: d.flock_count || '',
        planDate: d.plan_date,
        nextDueDate: d.next_due_date || '',
        actualDate: d.actual_date,
        method: d.method || '',
        dose: d.dose || '',
        executor: d.executor || '',
        status
      };
    }));
  }, [fetchRecords, t]);
  useEffect(() => {
    loadData();
  }, [loadData]);
  const handleRecordVaccine = async (row: ImmunePlan) => {
    const today = new Date().toISOString().slice(0, 10);
    let user: Record<string, unknown> = {};
    try {
      user = JSON.parse(sessionStorage.getItem('phoenix_user') || '{}');
    } catch {}
    const ok = await updateRecord(row.id as number, {
      status: 'DONE',
      actual_date: today,
      executor: user.realNameZh || user.username || ''
    }, 'id', t('ui.保存成功', '保存成功'));
    if (ok) loadData();
  };
  const handleEdit = (row: ImmunePlan) => {
    setEditId(row.id as number);
    const s = (v: unknown) => String(v ?? '');
    setForm({
      batchNo: s(row.batchNo),
      farmHouse: s(row.farmHouse),
      vaccine: s(row.vaccine || row.vaccine_name || vaccineOpts[0]),
      planDate: s(row.planDate),
      method: s(row.method || vaccMethodOpts[0]),
      dose: s(row.dose),
      vaccineBatchNo: s(row.vaccineBatchNo),
      flockCount: row.flockCount ? String(row.flockCount) : '',
      nextDueDate: s(row.nextDueDate)
    });
    setShowDrawer(true);
  };
  const handleSubmit = async () => {
    if (!form.batchNo) {
      toast.error(t('ui.请选择对应鸡群批次', '请选择对应鸡群批次'));
      return;
    }
    if (!form.planDate) {
      toast.error(t('ui.请选择计划免疫日期', '请选择计划免疫日期'));
      return;
    }
    if (form.flockCount && Number(form.flockCount) <= 0) {
      toast.error(t('ui.免疫头数必须大于0', '免疫头数必须大于 0'));
      return;
    }
    const fi = flockMap[form.batchNo] || {};
    const payload = {
      flock_no: form.batchNo,
      farm_house: form.farmHouse || fi.house_code || null,
      house_code: fi.house_code || form.farmHouse || null,
      farm_code: fi.farm_code || null,
      vaccine: form.vaccine,
      flock_count: form.flockCount ? Number(form.flockCount) : null,
      plan_date: form.planDate,
      next_due_date: form.nextDueDate || null,
      method: form.method,
      dose: form.dose
    };
    const ok = editId ? await updateRecord(editId, payload, 'id', t('ui.免疫计划更新成功', '免疫计划更新成功！')) : await createRecord({
      ...payload,
      actual_date: null,
      executor: '',
      status: 'PENDING'
    }, t('ui.免疫计划制定成功', '免疫计划制定成功！'));
    if (ok) {
      setShowDrawer(false);
      setEditId(null);
      setForm({
        ...EMPTY_FORM,
        batchNo: flockOptions[0]?.code || '',
        vaccine: vaccineOpts[0] || '',
        method: vaccMethodOpts[0] || '',
        dose: DOSE_BY_METHOD[vaccMethodOpts[0]] || ''
      });
      loadData();
    }
  };

  // A3 + C5: 统一大写枚举
  const filterKeys = ['all', 'PENDING', 'OVERDUE', 'SCHEDULED', 'DONE'];
  const filterLabels: Record<string, string> = {
    all: t('common.total', '全部'),
    PENDING: t('ui.待执行', '待执行'),
    OVERDUE: t('ui.逾期', '逾期'),
    SCHEDULED: t('ui.已计划', '已计划'),
    DONE: t('status.done', '已完成')
  };
  const filteredData = useMemo(() => filter === 'all' ? plans : plans.filter(p => normStatus(p.status) === filter), [plans, filter]);
  const overdueCnt = useMemo(() => plans.filter(p => normStatus(p.status) === 'OVERDUE').length, [plans]);
  const pendingCnt = useMemo(() => plans.filter(p => normStatus(p.status) === 'PENDING').length, [plans]);
  const scheduledCnt = useMemo(() => plans.filter(p => normStatus(p.status) === 'SCHEDULED').length, [plans]);
  const doneCnt = useMemo(() => plans.filter(p => normStatus(p.status) === 'DONE').length, [plans]);
  const columns = [{
    key: 'batchNo',
    title: t('ui.鸡群批次', '鸡群批次'),
    width: '120px'
  }, {
    key: 'farmHouse',
    title: t('ui.鸡舍', '鸡舍'),
    width: '100px'
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
        {canEditImm && normStatus(row.status) === 'PENDING' && (
          <button type="button" onClick={() => handleRecordVaccine(row)} style={actionPill("success")}><CheckCircle size={12} />{t('ui.执行', '执行')}</button>
        )}
        {canCreateImm && <button type="button" className={s.btnIcon} onClick={() => handleEdit(row)}><Edit2 size={12} /></button>}
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
          <button type="button" onClick={() => { setEditId(null); setForm({ ...EMPTY_FORM, batchNo: flockOptions[0]?.code || '', farmHouse: flockMap[flockOptions[0]?.code || '']?.house_code || '', vaccine: vaccineOpts[0] || '', method: vaccMethodOpts[0] || '', dose: DOSE_BY_METHOD[vaccMethodOpts[0]] || '' }); setShowDrawer(true); }} style={primaryActionButton}>
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

      <DataTable columns={columns} data={filteredData} searchPlaceholder={t('ui.搜索批次疫苗名称', '搜索批次疫苗名称')} searchKeys={['batchNo', 'farmHouse', 'vaccine']} rowKey="id" filters={
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
      setEditId(null);
    }} title={editId ? t('ui.编辑免疫计划', '编辑免疫计划') : t('ui.新增免疫计划', '新增免疫计划')} width="420px">
        <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }}>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.对应鸡群批次', '对应鸡群批次')} <span style={{
              color: 'var(--status-danger)'
            }}>*</span></label>
            <select value={form.batchNo} onChange={e => {
            const fi = flockMap[e.target.value] || {};
            setForm(p => ({
              ...p,
              batchNo: e.target.value,
              farmHouse: fi.house_code || p.farmHouse
            }));
          }} className={s.inp}>
              <option value="">{t('ui.请选择鸡群', '请选择鸡群')}</option>
              {flockOptions.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.所在鸡舍', '所在鸡舍')} <span style={{
              fontWeight: 400,
              fontSize: 11,
              color: 'var(--color-primary)',
              marginLeft: 6
            }}>{t('ui.随鸡群自动填入', '（随鸡群自动填入）')}</span></label>
            <select value={form.farmHouse} onChange={e => setForm(p => ({
            ...p,
            farmHouse: e.target.value
          }))} className={s.inp}>
              <option value="">{t('ui.自动联动或手动选择', '— 自动联动或手动选择 —')}</option>
              {houseOptions.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.疫苗名称', '疫苗名称')}</label>
            <select value={form.vaccine} onChange={e => setForm(p => ({
            ...p,
            vaccine: e.target.value
          }))} className={s.inp}>
              {vaccineOpts.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.计划免疫日期', '计划免疫日期')} <span style={{
              color: 'var(--status-danger)'
            }}>*</span></label>
            <input type="date" value={form.planDate} onChange={e => setForm(p => ({
            ...p,
            planDate: e.target.value
          }))} className={s.inp} />
          </div>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>{t('ui.接种方式', '接种方式')}</label>
              <select value={form.method} onChange={e => {
              const m = e.target.value;
              setForm(p => ({
                ...p,
                method: m,
                dose: DOSE_BY_METHOD[m] || p.dose || ''
              }));
            }} className={s.inp}>
                {vaccMethodOpts.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
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
            }))} placeholder={DOSE_BY_METHOD[form.method] || t('ui.如0.5ml/只', '如0.5ml/只')} className={s.inp} />
            </div>
          </div>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>{t('ui.疫苗批号', '疫苗批号')} <span style={{
                fontSize: 11,
                color: 'var(--color-primary)',
                fontWeight: 400
              }}>{t('ui.质量追溯', '（质量追溯）')}</span></label>
              <input value={form.vaccineBatchNo} onChange={e => setForm(p => ({
              ...p,
              vaccineBatchNo: e.target.value
            }))} placeholder={t('ui.如VAC-2026-001', '如VAC-2026-001')} className={s.inp} style={{
              fontFamily: 'monospace'
            }} />
            </div>
            <div>
              <label className={s.lbl}>{t('ui.免疫头数只', '免疫头数（只）')}</label>
              <input type="number" onFocus={e => e.currentTarget.select()} min="1" value={form.flockCount} onChange={e => setForm(p => ({
              ...p,
              flockCount: String(Math.max(0, Math.floor(Number(e.target.value) || 0)) || '')
            }))} placeholder={t('ui.如5000', '如5000')} className={s.inp} />
            </div>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.下次免疫日期', '下次免疫日期')}</label>
            <input type="date" value={form.nextDueDate} onChange={e => setForm(p => ({
            ...p,
            nextDueDate: e.target.value
          }))} className={s.inp} />
          </div>
          <div style={{
          display: 'flex',
          gap: 10,
          marginTop: 6
        }}>
            <button type="button" onClick={() => { setShowDrawer(false); setEditId(null); }} style={{ ...secondaryActionButton, flex: 1, justifyContent: "center" }}>{t('common.cancel', '取消')}</button>
            <button type="button" onClick={handleSubmit} style={{ ...primaryActionButton, flex: 2, justifyContent: "center" }}>{editId ? t('ui.保存修改', '保存修改') : t('ui.建立计划', '建立计划')}</button>
          </div>
        </div>
      </RightDrawer>
    </div>;
}