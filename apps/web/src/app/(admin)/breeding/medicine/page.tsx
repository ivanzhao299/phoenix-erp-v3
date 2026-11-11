'use client';

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
import { crudApi, farmProductionApi } from '@/lib/api-client';
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
  batchNo: '',
  farmHouse: '',
  medicine: '',
  disease: '',
  startDate: '',
  daysUsed: '5',
  withdrawDays: '7',
  dose: '',
  actualQty: '',
  qtyUnit: 'UNIT',
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
    canCreate, canEdit
  } = usePermission('MENU_FARM_VET');
  const {
    t
  } = useLanguage();
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
  const [flockOptions, setFlockOptions] = useState<{
    code: string;
    label: string;
  }[]>([]);
  const [flockMap, setFlockMap] = useState<Record<string, {
    house_code: string;
    farm_code: string;
    site_code?: string;
    company_code?: string;
  }>>({});
  const [medications, setMedications] = useState<Record<string, unknown>[]>([]);
  const [lots, setLots] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const unwrap = (value: unknown): Record<string, unknown>[] => {
    if (Array.isArray(value)) return value as Record<string, unknown>[];
    if (value && typeof value === 'object' && 'data' in value && Array.isArray(value.data)) return value.data as Record<string, unknown>[];
    return [];
  };
  const fetchRecords = useCallback(() => farmProductionApi.listMedicationRecords().then(unwrap), []);
  const fetchFlocks = useCallback(() => crudApi.list('brd_flocks', { pageSize: 1000 }).then(r => r.data), []);
  useEffect(() => {
    fetchFlocks().then(flocks => {
      if (!flocks?.length) return;
      setFlockOptions(flocks.map((f: Record<string, unknown>) => ({
        code: f.flock_no as string,
        label: `${f.flock_no}${f.house_code ? ' · ' + f.house_code : ''}`
      })));
      const map: Record<string, {
        house_code: string;
        farm_code: string;
        site_code?: string;
        company_code?: string;
      }> = {};
      flocks.forEach((f: Record<string, unknown>) => {
        if (f.flock_no) map[f.flock_no as string] = {
          house_code: f.house_code as string || '',
          farm_code: f.farm_code as string || '',
          site_code: f.site_code as string || '',
          company_code: f.company_code as string || ''
        };
      });
      setFlockMap(map);
      setForm(p => ({
        ...p,
        farmHouse: p.farmHouse || String(flocks[0].flock_no || '')
      }));
    }).catch(() => {});
    crudApi.list('brd_medications', { pageSize: 1000, status: 'ACTIVE' }).then(r => {
      setMedications((r.data || []).filter((m: Record<string, unknown>) => String(m.status || 'ACTIVE').toUpperCase() === 'ACTIVE'));
    }).catch(() => {});
  }, []);
  const loadData = useCallback(async () => {
    const data = await fetchRecords();
    setRecords(((data || []) as Record<string, unknown>[]).map((d: Record<string, unknown>) => {
      const backendStatus = String(d.effective_status || d.status || 'USING').toUpperCase();
      const computedStatus = backendStatus === 'IN_WITHDRAWAL' ? 'inWithdrawal' : backendStatus === 'CLEARED' ? 'cleared' : backendStatus === 'CANCELLED' ? 'cancelled' : 'using';
      return {
        id: d.id,
        batchNo: d.course_no || d.record_no || t('ui.未知', '未知'),
        farmHouse: d.flock_no || d.house_code || '—',  // G21-4 新表用 flock_no/house_code
        medicine: d.medication_code || d.medicine,  // G21-4 新表用 medication_code
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
    try { await farmProductionApi.createMedicationRecord(payload); return true; } catch { return false; }
  };
  const handleSubmit = async () => {
    if (!form.batchNo && !form.farmHouse || !form.medicine || !form.startDate || !form.actualQty || Number(form.actualQty) <= 0 || !form.usageRoute || (form.dose !== '' && Number(form.dose) <= 0) || (form.daysUsed !== '' && Number(form.daysUsed) <= 0) || (form.withdrawDays !== '' && Number(form.withdrawDays) < 0)) {
      toast.error(t('ui.请补齐药品、开始日期、数量和用药途径', '请补齐药品、开始日期、数量和用药途径'));
      return;
    }
    const fi = flockMap[form.batchNo || form.farmHouse] || {};
    let user: Record<string, unknown> = {};
    try { user = JSON.parse(sessionStorage.getItem('phoenix_user') || '{}'); } catch {}
    const payload = {
      flock_no:        form.batchNo || form.farmHouse,
      house_code:      fi.house_code || undefined,
      farm_code:       fi.farm_code || undefined,
      site_code:       fi.site_code || user.siteCode || user.site_code || user.storeCode || user.store_code || undefined,
      company_code:    fi.company_code || user.companyCode || user.company_code || undefined,
      medication_code: form.medicine,
      indication:      form.disease || undefined,
      start_date:      form.startDate,
      end_date:        form.daysUsed ? new Date(Date.parse(`${form.startDate}T00:00:00Z`) + (Number(form.daysUsed) - 1) * 86400000).toISOString().slice(0, 10) : undefined,
      dose_value:      form.dose ? Number(form.dose) : undefined,
      dose_unit:       form.qtyUnit || 'UNIT',
      actual_qty:      Number(form.actualQty),
      qty_unit:        form.qtyUnit || 'UNIT',
      usage_route:     form.usageRoute,
      withdraw_days:   form.withdrawDays ? Number(form.withdrawDays) : undefined,
      inventory_batch_no: form.inventoryBatchNo || undefined,
    };
    setBusy(true);
    const ok = await createRecord(payload);
    setBusy(false);
    if (ok) {
      setShowDrawer(false);
      setEditId(null);
      setForm({
        ...EMPTY_FORM,
        farmHouse: flockOptions[0]?.code || ''
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
    { label: t('ui.今日到期解禁', '今日到期解禁'), val: `${records.filter(r => r.clearDate === today).length} 个`,    tone: 'success' },
    { label: t('ui.累计用药记录', '累计用药记录'), val: `${records.length} 条`,                                       tone: 'brand'   },
  ];
  const columns = [{
    key: 'batchNo',
    title: t('ui.鸡群批次', '鸡群批次'),
    width: '120px'
  }, {
    key: 'farmHouse',
    title: t('ui.鸡舍', '鸡舍')
  }, {
    key: 'medicine',
    title: t('ui.药品名称', '药品名称'),
    width: '100px'
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
        actions={canCreate && (
          <button type="button" onClick={() => { setEditId(null); setForm({ ...EMPTY_FORM, farmHouse: flockOptions[0]?.code || '' }); setShowDrawer(true); }} style={primaryActionButton}>
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

      <DataTable columns={columns} data={data} searchPlaceholder={t('ui.搜索批次药品', '搜索批次药品')} searchKeys={['batchNo', 'farmHouse', 'medicine']} rowKey="id" filters={
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
            <select value={form.farmHouse} onChange={e => setForm({
            ...form,
            batchNo: e.target.value,
            farmHouse: e.target.value
          })} className={s.inp}>
              {flockOptions.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </div>
          <div className={s.fieldRow}>
            <div><label className={s.lbl}>{t('ui.药品主数据', '药品主数据')} *</label><select value={form.medicine} onChange={async e => {
              const code = e.target.value;
              setForm({ ...form, medicine: code, inventoryBatchNo: '' });
              const fi = flockMap[form.batchNo || form.farmHouse] || {};
              let user: Record<string, unknown> = {};
              try { user = JSON.parse(sessionStorage.getItem('phoenix_user') || '{}'); } catch {}
              const site = String(fi.site_code || user.siteCode || user.site_code || user.storeCode || user.store_code || '');
              const company = String(fi.company_code || user.companyCode || user.company_code || '');
              if (code && site && company) {
                try { const result = await farmProductionApi.listMedicineLots({ medication_code: code, site_code: site, company_code: company }); setLots(unwrap(result)); } catch { setLots([]); }
              }
            }} className={s.inp}><option value="">{t('ui.请选择ACTIVE药品', '请选择 ACTIVE 药品')}</option>{medications.map(m => <option key={String(m.medication_code)} value={String(m.medication_code)}>{String(m.medication_name || m.medication_code)}（{String(m.medication_code)}）</option>)}</select></div>
            <div><label className={s.lbl}>{t('ui.治疗疾病', '治疗疾病')}</label><input value={form.disease} onChange={e => setForm({
              ...form,
              disease: e.target.value
            })} placeholder={t('ui.如大肠杆菌', '如大肠杆菌')} className={s.inp} /></div>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.开始用药日期', '开始用药日期')}</label>
            <input type="date" value={form.startDate} onChange={e => setForm({
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
            <div><label className={s.lbl}>{t('ui.实际用量', '实际用量')} *</label><input type="number" min="0.001" step="0.001" value={form.actualQty} onChange={e => setForm({ ...form, actualQty: e.target.value })} className={s.inp} /></div>
            <div><label className={s.lbl}>{t('ui.用量单位', '用量单位')}</label><input value={form.qtyUnit} onChange={e => setForm({ ...form, qtyUnit: e.target.value })} className={s.inp} /></div>
          </div>
          <div className={s.fieldRow}>
            <div><label className={s.lbl}>{t('ui.用药途径', '用药途径')} *</label><input value={form.usageRoute} onChange={e => setForm({ ...form, usageRoute: e.target.value })} placeholder={t('ui.如饮水或拌料', '如饮水或拌料')} className={s.inp} /></div>
            <div><label className={s.lbl}>{t('ui.库存批次', '库存批次')}</label><select value={form.inventoryBatchNo} onChange={e => setForm({ ...form, inventoryBatchNo: e.target.value })} className={s.inp}><option value="">{t('ui.自动按FEFO分配', '自动按 FEFO 分配')}</option>{lots.map(lot => <option key={String(lot.batch_no)} value={String(lot.batch_no)}>{String(lot.batch_no)} · {String(lot.qty_available ?? '')}</option>)}</select></div>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.规定剂量', '规定剂量')}</label>
            <input value={form.dose} onChange={e => setForm({
            ...form,
            dose: e.target.value
          })} placeholder={t('ui.如100mg每kg饲料', '如100mg/kg饲料')} className={s.inp} />
          </div>
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
