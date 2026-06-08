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
import { useCrud } from '@/hooks/useCrud';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import { Plus, Edit2 } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';
import u from "@/styles/uix-utils.module.css";
const EMPTY_FORM = {
  batchNo: '',
  farmHouse: '',
  medicine: '',
  disease: '',
  startDate: '',
  daysUsed: '5',
  withdrawDays: '7',
  dose: ''
};
const todayStr = () => new Date().toISOString().slice(0, 10);
export default function MedicinePage() {
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
  }>>({});
  const {
    fetchRecords,
    createRecord,
    updateRecord
  } = useCrud('brd_medication_records');  // G21-4 切到新建的用药记录表（主档独立）
  const {
    fetchRecords: fetchFlocks
  } = useCrud('brd_flocks');
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
      }> = {};
      flocks.forEach((f: Record<string, unknown>) => {
        if (f.flock_no) map[f.flock_no as string] = {
          house_code: f.house_code as string || '',
          farm_code: f.farm_code as string || ''
        };
      });
      setFlockMap(map);
      setForm(p => ({
        ...p,
        farmHouse: p.farmHouse || flocks[0].flock_no
      }));
    }).catch(() => {});
  }, []);
  const loadData = useCallback(async () => {
    const data = await fetchRecords();
    // B6: 前端时区双算 bug — 旧版 new Date(d.clear_date) 受浏览器时区影响，
    //     后端 cron 走字符串比较（YYYY-MM-DD），跨日界点两边显示不一致。
    //     改用纯字符串比较（YYYY-MM-DD 字典序即时间序），与后端 cron 对齐。
    const todayStr = new Date().toISOString().slice(0, 10);
    setRecords(((data || []) as Record<string, unknown>[]).map((d: Record<string, unknown>) => {
      const clearStr = d.clear_date ? String(d.clear_date).slice(0, 10) : '';
      const endStr = d.end_date ? String(d.end_date).slice(0, 10) : '';
      let computedStatus: string = String(d.status || 'using');
      if (clearStr) {
        if (todayStr > clearStr) computedStatus = 'cleared';else if (endStr && todayStr > endStr) computedStatus = 'inWithdrawal';else computedStatus = 'using';
      }
      return {
        id: d.id,
        batchNo: d.batch_no || t('ui.未知', '未知'),
        farmHouse: d.flock_no || d.house_code || '—',  // G21-4 新表用 flock_no/house_code
        medicine: d.medication_code || d.medicine,  // G21-4 新表用 medication_code
        disease: d.disease,
        startDate: d.start_date,
        endDate: d.end_date,
        daysUsed: d.days_used,
        withdrawDays: d.withdraw_days,
        clearDate: d.clear_date,
        dose: d.dose,
        executor: d.executor,
        status: computedStatus,
        _raw: d
      };
    }));
  }, [fetchRecords, t]);
  useEffect(() => {
    loadData();
  }, [loadData]);
  const handleEdit = (row: MedicineRecord) => {
    const r = (row._raw || {}) as Record<string, string | number | null>;
    setEditId(row.id as number);
    const s = (v: string | number | null, fb = '') => v != null ? String(v) : fb;
    setForm({
      batchNo: s(r.batch_no),
      farmHouse: s(r.farm_house),
      medicine: s(r.medication_code || r.medicine),  // G21-4
      disease: s(r.disease),
      startDate: s(r.start_date),
      daysUsed: s(r.days_used, '5'),
      withdrawDays: s(r.withdraw_days, '7'),
      dose: s(r.dose)
    });
    setShowDrawer(true);
  };
  const handleSubmit = async () => {
    const sDate = form.startDate ? new Date(form.startDate) : new Date(); // ✅ 避免 new Date("") Invalid Date
    const eDate = new Date(sDate.getTime() + (Number(form.daysUsed) - 1) * 86400000);
    const cDate = new Date(eDate.getTime() + Number(form.withdrawDays) * 86400000);
    const fi = flockMap[form.batchNo || form.farmHouse] || {};
    // G21-4：字段映射对齐 brd_medication_records 真实列
    //   medicine → medication_code、删 farm_house（house_code 已足够）
    const payload = {
      flock_no:        form.batchNo || form.farmHouse,
      batch_no:        form.batchNo || form.farmHouse,
      house_code:      fi.house_code || null,
      farm_code:       fi.farm_code || null,
      medication_code: form.medicine,
      disease:         form.disease,
      start_date:      sDate.toISOString().slice(0, 10),
      end_date:        eDate.toISOString().slice(0, 10),
      days_used:       Number(form.daysUsed),
      withdraw_days:   Number(form.withdrawDays),
      clear_date:      cDate.toISOString().slice(0, 10),
      dose:            form.dose,
    };
    const userStr = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_user') : '{}';
    const user = userStr ? JSON.parse(userStr) : {};
    const executorName = user.realNameZh || user.username || t('ui.未知兽医', '未知兽医');
    const ok = editId ? await updateRecord(editId, payload, 'id', t('ui.用药记录更新成功', '用药记录更新成功！')) : await createRecord({
      ...payload,
      executor: executorName,
      status: 'using'
    }, t('ui.用药记录创建成功', '用药记录创建成功！'));
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
  const KPI_CARDS = [{
    label: t('ui.停药期内批次', '停药期内批次'),
    val: `${records.filter(r => r.status === 'inWithdrawal').length} 个`,
    color: 'var(--status-warning)'
  }, {
    label: t('ui.今日到期解禁', '今日到期解禁'),
    val: `${records.filter(r => r.clearDate === today).length} 个`,
    color: 'var(--status-success)'
  }, {
    label: t('ui.累计用药记录', '累计用药记录'),
    val: `${records.length} 条`,
    color: 'var(--color-primary)'
  }];
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
    render: (_: unknown, row: MedicineRecord) => canEdit ? <button type="button" className={s.btnIcon} onClick={() => handleEdit(row)}><Edit2 size={12} /></button> : null
  }];
  return <div className="animate-fade-in">
      <PageHeader title={t('ui.用药记录', '用药记录')} subtitle={t('ui.记录所有鸡群用药情况及停药期管理', '记录所有鸡群用药情况及停药期管理')} breadcrumb={[t('ui.养殖管理', '养殖管理'), t('ui.用药记录', '用药记录')]} actions={canCreate && <button type="button" className={s.btnPrimary} onClick={() => {
      setEditId(null);
      setForm({
        ...EMPTY_FORM,
        farmHouse: flockOptions[0]?.code || ''
      });
      setShowDrawer(true);
    }}>
            <Plus size={15} />{t('ui.新增用药记录', '新增用药记录')}
          </button>} />

      <div className={s.statsRow} style={{
      gridTemplateColumns: 'repeat(3,1fr)'
    }}>
        {KPI_CARDS.map(c => <div key={c.label} className={s.statCard} style={{
        borderLeftColor: c.color
      }}>
            <div className={s.statValue} style={{
          color: c.color
        }}>{c.val}</div>
            <div className={s.statLabel}>{c.label}</div>
          </div>)}
      </div>

      <DataTable columns={columns} data={data} searchPlaceholder={t('ui.搜索批次药品', '搜索批次药品')} searchKeys={['batchNo', 'farmHouse', 'medicine']} rowKey="id" filters={<div style={{
      display: 'flex',
      gap: 6
    }}>
          {filterKeys.map(f => <button type="button" key={f} className={`${s.tabPill} ${filter === f ? s.tabPillActive : ""}`} onClick={() => setFilter(f)}>{filterLabels[f]}</button>)}
        </div>} />

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
            <div><label className={s.lbl}>{t('ui.药品名称', '药品名称')}</label><input value={form.medicine} onChange={e => setForm({
              ...form,
              medicine: e.target.value
            })} placeholder={t('ui.如土霉素', '如土霉素')} className={s.inp} /></div>
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
            <div><label className={s.lbl}>{t('ui.连用天数', '连用天数')}</label><input type="number" onFocus={e => e.currentTarget.select()} value={form.daysUsed} onChange={e => setForm({
              ...form,
              daysUsed: e.target.value
            })} className={s.inp} /></div>
            <div><label className={s.lbl}>{t('ui.停药休药期天', '停药休药期（天）')}</label><input type="number" onFocus={e => e.currentTarget.select()} value={form.withdrawDays} onChange={e => setForm({
              ...form,
              withdrawDays: e.target.value
            })} className={s.inp} /></div>
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
            <button type="button" className={`${s.btnSecondary} ${u.flex1}`} onClick={() => {
            setShowDrawer(false);
            setEditId(null);
          }}>{t('common.cancel', '取消')}</button>
            <button type="button" className={s.btnPrimary} style={{
            flex: 2
          }} onClick={handleSubmit}>{editId ? t('ui.保存修改', '保存修改') : t('ui.新增用药', '新增用药')}</button>
          </div>
        </div>
      </RightDrawer>
    </div>;
}