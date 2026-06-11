'use client';

import type { FarmRow, HouseRow } from '@/types';
import { useState, useEffect, useCallback } from 'react';
interface FlockCard {
  id: unknown;
  batchNo?: string;
  farmName?: string;
  house?: string;
  breed?: string;
  inDate?: unknown;
  ageWeeks?: number;
  quantity?: unknown;
  layingRate?: unknown;
  feedRatio?: unknown;
  status: string;
  _raw?: Record<string, unknown>;
}
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import { StatusBadge } from '@/components/design-system';
import RightDrawer from '@/components/RightDrawer';
import { useCrud } from '@/hooks/useCrud';
import { usePermission } from '@/hooks/usePermission';
import { useDialog } from '@/contexts/DialogContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';
import u from "@/styles/uix-utils.module.css";
import { SupplierSelector } from '@/components/shared-selectors/MasterDataSelectors';
const emptyForm = () => ({
  farmCode: '',
  house: '',
  breed: '',
  source: '',
  placementAge: '1',
  cost: '0',
  inDate: '',
  qty: '',
  targetWeeks: '80',
  eliminationDate: '',
  peakLayRate: '',
  feedConvRatio: '',
  flockStatus: 'GROWING'
});
export default function FlockPage() {
  const {
    showConfirm,
    showAlert
  } = useDialog();
  const {
    can
  } = usePermission('MENU_FARM_DATA');
  // G23-B：can(role[]) → PBAC
  const { canCreate: canCreateFlock, canEdit: canEditFlock } = usePermission('MENU_FARM_DATA');
  const {
    t
  } = useLanguage();
  const STATUS_MAP: Record<string, {
    status: string;
    label: string;
  }> = {
    GROWING: {
      status: 'info',
      label: t('ui.育雏/育成期', '育雏/育成期')
    },
    LAYING: {
      status: 'success',
      label: t('ui.产蛋期', '产蛋期')
    },
    PEAK: {
      status: 'info',
      label: t('ui.产蛋高峰期', '产蛋高峰期')
    },
    DECLINING: {
      status: 'warning',
      label: t('ui.产蛋下降期', '产蛋下降期')
    },
    RETIRED: {
      status: 'default',
      label: t('ui.已淘汰', '已淘汰')
    }
  };
  const statusFilters = [{
    key: 'all',
    label: t('ui.全部', '全部')
  }, {
    key: 'LAYING',
    label: t('ui.产蛋期', '产蛋期')
  }, {
    key: 'GROWING',
    label: t('ui.育成期', '育成期')
  }, {
    key: 'PEAK',
    label: t('ui.高峰期', '高峰期')
  }, {
    key: 'RETIRED',
    label: t('ui.已淘汰', '已淘汰')
  }];
  const [statusFilter, setStatusFilter] = useState('all');
  const [showDrawer, setShowDrawer] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [flocks, setFlocks] = useState<FlockCard[]>([]);
  const [farms, setFarms] = useState<FarmRow[]>([]);
  const [houses, setHouses] = useState<HouseRow[]>([]);
  const [breedOptions, setBreedOptions] = useState<string[]>([]);
  const {
    fetchRecords,
    createRecord,
    updateRecord
  } = useCrud('brd_flocks');
  const {
    fetchRecords: fetchFarms
  } = useCrud('brd_farms');
  const {
    fetchRecords: fetchHouses
  } = useCrud('brd_houses');
  const {
    fetchRecords: fetchDict
  } = useCrud('sys_dict');
  const load = useCallback(async () => {
    const data = await fetchRecords();
    setFlocks((data || []).map((d: Record<string, unknown>) => ({
      id: d.flock_no,
      batchNo: d.flock_no,
      farmName: d.farm_name || d.farm_code,
      house: d.house_code || '',
      breed: d.breed_type || '—',
      inDate: d.start_date,
      ageWeeks: d.start_date ? Math.floor((Number(d.placement_age) || 0) / 7) + Math.floor((Date.now() - new Date(d.start_date as string).getTime()) / (86400000 * 7)) : 0,
      quantity: d.current_qty,
      layingRate: d.current_lay_rate ?? '—',
      feedRatio: d.feed_conversion_ratio ?? '—',
      status: d.status || 'GROWING',
      _raw: d
    })));
  }, [fetchRecords]);
  useEffect(() => {
    load();
    fetchFarms().then(r => setFarms(r || [])).catch(() => {});
    fetchHouses().then(r => setHouses(r || [])).catch(() => {});
    fetchDict({
      limit: 1000
    }).then(d => {
      const opts = (d || []).filter((x: Record<string, unknown>) => x.dict_type === 'BRD_BREED_TYPE' && x.status === 'ACTIVE').map((x: Record<string, unknown>) => x.dict_label_zh as string);
      if (opts.length) {
        setBreedOptions(opts);
        setForm(p => ({
          ...p,
          breed: p.breed || opts[0]
        }));
      }
    }).catch(() => {});
  }, [load]);
  const handleEdit = (row: FlockCard) => {
    const r = (row._raw || {}) as Record<string, string | number | null>;
    setEditId(row.id as string);
    const s = (v: string | number | null, fb = '') => v != null ? String(v) : fb;
    setForm({
      farmCode: s(r.farm_code),
      house: s(r.house_code),
      breed: s(r.breed_type) || breedOptions[0] || '',
      source: s(r.source_farm),
      placementAge: s(r.placement_age, '1'),
      cost: s(r.cost, '0'),
      inDate: s(r.start_date),
      qty: s(r.current_qty),
      targetWeeks: s(r.target_weeks, '80'),
      eliminationDate: s(r.elimination_date),
      peakLayRate: s(r.peak_lay_rate),
      feedConvRatio: s(r.feed_conversion_ratio),
      flockStatus: s(r.status, 'GROWING')
    });
    setShowDrawer(true);
  };
  const handleDelete = async (row: FlockCard) => {
    const currentQty = Number(row.quantity ?? 0);
    if (currentQty > 0) {
      await showAlert({
        icon: '🚫',
        type: 'warning',
        title: t('ui.无法删除', '无法删除'),
        message: `${t('ui.鸡群', '鸡群')}「${row.batchNo}」${t('ui.仍有', '仍有')} ${currentQty.toLocaleString()} ${t('ui.只在栏，请先办理出栏 (status=RETIRED) 后再删除档案', '只在栏，请先办理出栏 (status=RETIRED) 后再删除档案')}`
      });
      return;
    }
    const ok = await showConfirm({
      icon: '🗑️',
      type: 'danger',
      title: t('common.confirm', '确认') + t('common.delete', '删除'),
      message: `${t('ui.确认删除鸡群档案', '确认删除鸡群档案')}: ${row.batchNo}？`,
      confirmLabel: t('ui.确认删除', '确认删除')
    });
    if (ok) {
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') : null;
      const apiBase = (process.env.NEXT_PUBLIC_API_BASE || '') + '/api/crud';
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(`${apiBase}/brd_flocks/flock_no/${row.id}`, {
        method: 'DELETE',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? {
            Authorization: `Bearer ${token}`
          } : {})
        }
      }).finally(() => clearTimeout(tid));
      if (res.ok) {
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        await showAlert({
          icon: '❌',
          type: 'danger',
          title: t('crud.err.deleteFailTitle', '删除失败'),
          message: err.msg || err.message || t('crud.err.deleteFail', '删除失败，请稍后重试'),
          confirmLabel: t('common.close', '关闭')
        });
      }
    }
  };
  const handleSubmit = async () => {
    if (form.eliminationDate && form.inDate && form.eliminationDate <= form.inDate) {
      await showAlert({
        icon: '⚠️',
        type: 'warning',
        title: t('ui.日期错误', '日期错误'),
        message: t('ui.淘汰日期必须晚于进雏日期', '预计淘汰日期必须晚于进雏入栏日期')
      });
      return;
    }
    const payload = {
      farm_code: form.farmCode,
      farm_name: farms.find(f => f.farm_code === form.farmCode)?.farm_name || form.farmCode,
      source_farm: form.source,
      house_code: form.house,
      breed_type: form.breed,
      start_date: form.inDate || new Date().toISOString().slice(0, 10),
      current_qty: Number(form.qty) || 0,
      placement_age: Number(form.placementAge) || 1,
      cost: Number(form.cost) || 0,
      target_weeks: Number(form.targetWeeks) || 80,
      status: form.flockStatus,
      elimination_date: form.eliminationDate || null,
      peak_lay_rate: form.peakLayRate ? Number(form.peakLayRate) : null,
      feed_conversion_ratio: form.feedConvRatio ? Number(form.feedConvRatio) : null
    };
    let ok: boolean;
    if (editId) {
      ok = await updateRecord(editId, payload, 'flock_no', t('ui.更新成功', '更新成功'));
    } else {
      const flockNo = 'FK-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(-3).toUpperCase();
      ok = await createRecord({
        ...payload,
        flock_no: flockNo,
        batch_no: flockNo,
        initial_qty: Number(form.qty) || 0
      }, t('ui.新建成功', '新建成功'));
    }
    if (ok) {
      setShowDrawer(false);
      setEditId(null);
      load();
    }
  };
  const data = statusFilter === 'all' ? flocks : flocks.filter(f => f.status === statusFilter);
  const columns = [{
    key: 'batchNo',
    title: t('ui.批次号', '批次号'),
    width: '130px'
  }, {
    key: 'farmName',
    title: t('ui.养殖场', '养殖场'),
    width: '90px'
  }, {
    key: 'house',
    title: t('ui.鸡舍', '鸡舍'),
    width: '70px'
  }, {
    key: 'breed',
    title: t('ui.品种', '品种'),
    width: '80px'
  }, {
    key: 'inDate',
    title: t('ui.进雏日期', '进雏日期'),
    width: '100px'
  }, {
    key: 'ageWeeks',
    title: t('ui.鸡龄', '鸡龄'),
    width: '70px',
    render: (v: unknown) => `${String(v ?? '')}${t('ui.周', '周')}`
  }, {
    key: 'quantity',
    title: t('ui.存栏量', '存栏量'),
    width: '90px',
    render: (v: unknown) => `${Number(v).toLocaleString()}${t('ui.羽', '羽')}`
  }, {
    key: 'layingRate',
    title: t('ui.产蛋率', '产蛋率'),
    width: '80px',
    render: (v: unknown) => typeof v === 'number' ? <span style={{
      fontWeight: 700,
      color: v >= 90 ? 'var(--status-success)' : v >= 85 ? 'var(--status-warning)' : 'var(--status-danger)'
    }}>{v}%</span> : <span className={u.muted}>—</span>
  }, {
    key: 'feedRatio',
    title: t('ui.料蛋比', '料蛋比'),
    width: '80px',
    render: (v: unknown) => typeof v === 'number' ? <span style={{
      color: v <= 2.35 ? 'var(--status-success)' : 'var(--status-warning)'
    }}>{v}</span> : '—'
  }, {
    key: 'targetWeeks',
    title: t('ui.目标周数', '目标周数'),
    width: '80px',
    render: (v: unknown, row: FlockCard) => {
      const tw = v ?? row._raw?.target_weeks;
      return tw ? `${String(tw)}${t('ui.周', '周')}` : '—';
    }
  }, {
    key: 'eliminationDate',
    title: t('ui.预计淘汰日', '预计淘汰日'),
    width: '100px',
    render: (_: unknown, row: FlockCard) => String(row._raw?.elimination_date || '—')
  }, {
    key: 'status',
    title: t('common.status', '状态'),
    width: '100px',
    render: (v: unknown) => {
      const st = STATUS_MAP[v as string] || {
        status: 'default',
        label: String(v)
      };
      return <StatusBadge status={st.status} label={st.label} />;
    }
  }, {
    key: 'actions',
    title: t('common.operation', '操作'),
    width: '100px',
    render: (_: unknown, row: FlockCard) => canEditFlock ? <div className={s.tableActions}>
        <button type="button" className={s.btnIcon} onClick={() => handleEdit(row)}><Edit2 size={12} /></button>
        <button type="button" className={s.btnIconDanger} onClick={() => handleDelete(row)}><Trash2 size={12} /></button>
      </div> : null
  }];
  return <div className="animate-fade-in">
      <PageHeader title={t('ui.鸡群档案', '鸡群档案')} subtitle={`${t('ui.当前共', '当前共')} ${flocks.length} ${t('ui.个鸡群批次', '个鸡群批次')}`} breadcrumb={[t('ui.养殖管理', '养殖管理'), t('ui.鸡群档案', '鸡群档案')]} actions={canEditFlock && <button type="button" className={s.btnPrimary} onClick={() => {
      setEditId(null);
      setForm(emptyForm());
      setShowDrawer(true);
    }}>
            <Plus size={15} />{t('ui.新建鸡群档案', '新建鸡群档案')}
          </button>} />

      <DataTable columns={columns} data={data} searchPlaceholder={t('ui.搜索批次号农场', '搜索批次号农场')} searchKeys={['batchNo', 'farmName', 'breed']} rowKey="id" filters={<div style={{
      display: 'flex',
      gap: 6
    }}>
          {statusFilters.map(f => <button type="button" key={f.key} className={`${s.tabPill} ${statusFilter === f.key ? s.tabPillActive : ""}`} onClick={() => setStatusFilter(f.key)}>{f.label}</button>)}
        </div>} />

      <RightDrawer isOpen={showDrawer} onClose={() => {
      setShowDrawer(false);
      setEditId(null);
    }} title={`${editId ? t('common.edit', '编辑') : t('common.new', '新建')}${t('ui.鸡群档案', '鸡群档案')}`} width="460px">
        <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }}>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>{t('ui.归属养殖场', '归属养殖场')}</label>
              <select value={form.farmCode} onChange={e => setForm({
              ...form,
              farmCode: e.target.value,
              house: ''
            })} className={s.inp}>
                <option value="">{t('ui.选择养殖场', '选择养殖场')}</option>
                {farms.map((f: any) => <option key={f.farm_code} value={f.farm_code}>{f.farm_name}</option>)}
              </select>
            </div>
            <div>
              <label className={s.lbl}>{t('ui.入驻鸡舍', '入驻鸡舍')}</label>
              <select value={form.house} onChange={e => setForm({
              ...form,
              house: e.target.value
            })} disabled={!form.farmCode} className={s.inp} style={{
              opacity: form.farmCode ? 1 : 0.6,
              cursor: form.farmCode ? 'pointer' : 'not-allowed'
            }}>
                <option value="">{form.farmCode ? t('ui.选择鸡舍', '选择鸡舍') : t('ui.请先选择养殖场', '请先选择养殖场')}</option>
                {houses.filter((h: any) => h.farm_code === form.farmCode).map((h: any) => <option key={h.house_code} value={h.house_code}>{h.house_name} ({h.house_type})</option>)}
              </select>
            </div>
          </div>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>{t('ui.鸡群品种', '鸡群品种')}</label>
              <select value={form.breed} onChange={e => setForm({
              ...form,
              breed: e.target.value
            })} className={s.inp}>
                {breedOptions.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div><label className={s.lbl}>{t('ui.引种来源种禽企业', '引种来源种禽企业')}</label><SupplierSelector value={form.source} onChange={v => setForm({
              ...form,
              source: v
            })} placeholder={t('ui.选择种禽供应商', '选择种禽供应商')} /></div>
          </div>
          <div className={s.fieldRow}>
            <div><label className={s.lbl}>{t('ui.入舍日龄(天)', '入舍日龄(天)')}</label><input type="number" onFocus={e => e.currentTarget.select()} value={form.placementAge} onChange={e => setForm({
              ...form,
              placementAge: e.target.value
            })} className={s.inp} /></div>
            <div><label className={s.lbl}>{t('ui.种苗单价(元/羽)', '种苗单价(元/羽)')}</label><input type="number" onFocus={e => e.currentTarget.select()} value={form.cost} onChange={e => setForm({
              ...form,
              cost: e.target.value
            })} className={s.inp} /></div>
          </div>
          <div className={s.fieldRow}>
            <div><label className={s.lbl}>{t('ui.进雏入栏日期', '进雏入栏日期')}</label><input type="date" value={form.inDate} onChange={e => setForm({
              ...form,
              inDate: e.target.value
            })} className={s.inp} /></div>
            <div><label className={s.lbl}>{editId ? t('ui.当前存栏(羽)', '当前存栏(羽)') : t('ui.初始存栏(羽)', '初始存栏(羽)')}</label><input type="number" onFocus={e => e.currentTarget.select()} value={form.qty} onChange={e => setForm({
              ...form,
              qty: e.target.value
            })} placeholder={t('ui.如8000', '如8000')} className={s.inp} /></div>
          </div>
          <div className={s.fieldRow}>
            <div><label className={s.lbl}>{t('ui.计划产蛋周数(周)', '计划产蛋周数(周)')}</label><input type="number" onFocus={e => e.currentTarget.select()} value={form.targetWeeks} onChange={e => setForm({
              ...form,
              targetWeeks: e.target.value
            })} className={s.inp} /></div>
            <div><label className={s.lbl}>{t('ui.计划淘汰日期', '计划淘汰日期')}</label><input type="date" value={form.eliminationDate} onChange={e => setForm({
              ...form,
              eliminationDate: e.target.value
            })} className={s.inp} /></div>
          </div>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>{t('ui.历史峰值产蛋率(%)', '历史峰值产蛋率(%)')}</label>
              <div style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              marginBottom: 4
            }}>{t('ui.日报提交后自动更新', '日报提交后自动更新')}</div>
              <input type="number" onFocus={e => e.currentTarget.select()} step="0.1" value={form.peakLayRate} onChange={e => setForm({
              ...form,
              peakLayRate: e.target.value
            })} className={s.inp} />
            </div>
            <div>
              <label className={s.lbl}>{t('ui.当前料蛋比', '当前料蛋比')}</label>
              <div style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              marginBottom: 4
            }}>{t('ui.日报提交后自动更新', '日报提交后自动更新')}</div>
              <input type="number" onFocus={e => e.currentTarget.select()} step="0.01" value={form.feedConvRatio} onChange={e => setForm({
              ...form,
              feedConvRatio: e.target.value
            })} className={s.inp} />
            </div>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.鸡群状态', '鸡群状态')}</label>
            <select value={form.flockStatus} onChange={e => setForm({
            ...form,
            flockStatus: e.target.value
          })} className={s.inp}>
              <option value="GROWING">🐣 {t('ui.育雏/育成期', '育雏/育成期')}</option>
              <option value="LAYING">🥚 {t('ui.产蛋期', '产蛋期')}</option>
              <option value="PEAK">📈 {t('ui.产蛋高峰期', '产蛋高峰期')}</option>
              <option value="DECLINING">📉 {t('ui.产蛋下降期', '产蛋下降期')}</option>
              <option value="RETIRED">🏁 {t('ui.已淘汰', '已淘汰')}</option>
            </select>
          </div>
          <div style={{
          display: 'flex',
          gap: 10,
          marginTop: 8
        }}>
            <button type="button" className={`${s.btnSecondary} ${u.flex1}`} onClick={() => {
            setShowDrawer(false);
            setEditId(null);
          }}>{t('common.cancel', '取消')}</button>
            <button type="button" className={s.btnPrimary} style={{
            flex: 2
          }} onClick={handleSubmit}>{editId ? t('ui.保存修改', '保存修改') : t('ui.确认建档', '确认建档')}</button>
          </div>
        </div>
      </RightDrawer>
    </div>;
}