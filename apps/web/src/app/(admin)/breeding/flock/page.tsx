'use client';

import type { FarmRow, HouseRow } from '@/types';
import Link from 'next/link';
import { useState, useEffect, useCallback, useMemo } from 'react';
interface FlockCard {
  id: unknown;
  batchNo?: string;
  farmName?: string;
  farmCode?: string;
  houseName?: string;
  houseCode?: string;
  breed?: string;
  breedCode?: string;
  breedSearch?: string;
  inDate?: unknown;
  age?: ReturnType<typeof flockArchiveAge>;
  quantity?: unknown;
  layingRate?: unknown;
  feedRatio?: unknown;
  status: string;
  _raw?: Record<string, unknown>;
}
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import { DrawerV2, StatusBadge } from '@/components/design-system';
import FlockBreedConfirmation from '@/components/breeding/FlockBreedConfirmation';
import FlockCycleDrawer from '@/components/breeding/FlockCycleDrawer';
import { flockArchiveAge, flockArchiveDate, flockArchiveFormatNumber, flockArchiveNumber, flockArchivePlacementDate, flockArchiveTransferPath } from '@/components/breeding/flock-archive';
import { flockBusinessToday, flockDay } from '@/components/flock-lifecycle-form';
import { useProductionArchive } from '@/hooks/useProductionArchive';
import { useCrud } from '@/hooks/useCrud';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/contexts/ToastContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Plus, Edit2 } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';
import u from "@/styles/uix-utils.module.css";
import MasterNameCode from '@/components/MasterNameCode';
import { flockMasterLabels } from '@/lib/flock-display';
import { masterNameWithCode } from '@/lib/localized-master-data';
import { useMasterNames } from '@/hooks/useMasterNames';
import { SupplierSelector } from '@/components/shared-selectors/MasterDataSelectors';
import { DictSelect } from '@/components/shared-selectors/DictSelect';
import { useDictOptions } from '@/hooks/useDictOptions';
// g200f 模板 token(2026-06-20)
import { primaryActionButton, secondaryActionButton, toolbarFilterPill } from '@/components/design-system/cockpit-styles';
const emptyForm = () => ({
  breed: '',
  source: '',
  placementAge: '',
  cost: '',
  inDate: '',
  targetWeeks: '',
  eliminationDate: '',
  peakLayRate: '',
  feedConvRatio: '',
  flockStatus: 'GROWING'
});
export default function FlockPage() {
  const toast = useToast();
  const {canEdit:canCreateFlock}=usePermission('MENU_FLOCK_CREATE');
  // G23-B：can(role[]) → PBAC
  const { canEdit: canEditFlock } = usePermission('MENU_FARM_DATA');
  const {
    t, lang
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
      label: t('flockArchive.closed', '已关群')
    },
    /* g200f(2026-06-20):兼容 DB 历史值 ACTIVE → 产蛋期(LAYING 同义) */
    ACTIVE: {
      status: 'success',
      label: t('ui.产蛋期', '产蛋期')
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
    key: 'DECLINING',
    label: t('ui.产蛋下降期', '产蛋下降期')
  }, {
    key: 'RETIRED',
    label: t('flockArchive.closed', '已关群')
  }];
  const [statusFilter, setStatusFilter] = useState('all');
  const archive = useProductionArchive('flocks', statusFilter === 'all' ? '' : statusFilter);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [originalForm, setOriginalForm] = useState(emptyForm());
  const flockFacts = archive.result?.items;
  const [businessDate, setBusinessDate] = useState(flockBusinessToday);
  const farmMasters = useMasterNames('farm');
  const houseMasters = useMasterNames('house');
  const farms: FarmRow[] = useMemo(() => [...farmMasters.values()].map(row => ({
    ...row, farm_code: String(row.farm_code), farm_name: String(row.farm_name || ''), status: String(row.status || 'ACTIVE')
  })), [farmMasters]);
  const houses: HouseRow[] = useMemo(() => [...houseMasters.values()].map(row => ({
    ...row, farm_code: String(row.farm_code || ''), house_code: String(row.house_code), house_name: String(row.house_name || ''), status: String(row.status || 'ACTIVE')
  })), [houseMasters]);
  const { optionPairs: breedOptions, loading: breedsLoading } = useDictOptions('BRD_BREED');
  const [historicalBreed, setHistoricalBreed] = useState('');
  const [confirmFlockNo, setConfirmFlockNo] = useState<string | null>(null);
  const [cycleFlockNo, setCycleFlockNo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { updateRecord } = useCrud('brd_flocks');
  const load = archive.reload;
  const flocks: FlockCard[] = useMemo(() => flockMasterLabels(flockFacts ?? [], farms, houses, lang).map(d => ({
      id: d.flock_no,
      batchNo: String(d.flock_no ?? ''),
      farmCode: d.farmCode,
      farmName: d.farmName,
      houseCode: d.houseCode,
      houseName: d.houseName,
      breedCode: String(d.breed_code || ''),
      breedSearch: [d.breed_code, d.strain, d.breed_type, breedOptions.find(option => option.value === d.breed_code)?.label].filter(Boolean).join(' '),
      breed: breedOptions.find(option => option.value === d.breed_code)?.label
        || String(d.strain || d.breed_type || d.breed_code || '—'),
      inDate: flockArchivePlacementDate(d.placement_date, d.start_date),
      age: flockArchiveAge(flockArchivePlacementDate(d.placement_date, d.start_date), d.placement_age,
        d.status === 'RETIRED' ? d.closed_on : businessDate),
      quantity: d.current_qty,
      layingRate: d.current_lay_rate ?? '—',
      feedRatio: d.feed_conversion_ratio ?? '—',
      status: String(d.status ?? ''),
      _raw: d
    })), [flockFacts, businessDate, farms, houses, lang, breedOptions]);
  useEffect(() => {
  }, [load]);
  useEffect(() => {
    const refreshBusinessDate = () => setBusinessDate(flockBusinessToday());
    const interval = window.setInterval(refreshBusinessDate, 60_000);
    window.addEventListener('focus', refreshBusinessDate);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshBusinessDate);
    };
  }, []);
  const handleEdit = (row: FlockCard) => {
    const r = (row._raw || {}) as Record<string, string | number | null>;
    setEditId(row.id as string);
    const s = (v: string | number | null) => String(v ?? '');
    // 不猜测历史中文名的标准码，也不默认首项；未知码由 DictSelect 原样展示。
    const breedCode = s(r.breed_code);
    const inDate = flockArchivePlacementDate(r.placement_date, r.start_date);
    setHistoricalBreed([...new Set([s(r.breed_code), s(r.strain), s(r.breed_type)].filter(Boolean))].join(' / '));
    const next = {
      breed: breedCode,
      source: s(r.source_farm),
      placementAge: s(r.placement_age),
      cost: s(r.cost),
      inDate,
      targetWeeks: s(r.target_weeks),
      eliminationDate: flockDay(r.planned_elimination_date),
      peakLayRate: s(r.peak_lay_rate),
      feedConvRatio: s(r.feed_conversion_ratio),
      flockStatus: s(r.status)
    };
    setOriginalForm(next);
    setForm(next);
  };
  const handleSubmit = async () => {
    if (!editId || submitting) return;
    const breedChanged = form.breed !== originalForm.breed;
    if (breedChanged && (breedsLoading || !breedOptions.some(o => o.value === form.breed))) {
      toast.warning(t('ui.请选择有效鸡群品种', '请选择有效的鸡群品种标准码'));
      return;
    }
    if (originalForm.inDate && !form.inDate) {
      toast.warning(t('ui.不能清空已登记入栏日期', '不能清空已登记的入栏日期'));
      return;
    }
    if ((form.eliminationDate !== originalForm.eliminationDate || form.inDate !== originalForm.inDate)
      && form.eliminationDate && form.inDate && form.eliminationDate <= form.inDate) {
      toast.warning(t('ui.淘汰日期必须晚于进雏日期', '预计淘汰日期必须晚于进雏入栏日期'));
      return;
    }
    const placementAge = flockArchiveNumber(form.placementAge);
    if (form.placementAge !== originalForm.placementAge && form.placementAge !== ''
      && (placementAge === null || placementAge < 0 || !Number.isInteger(placementAge))) {
      toast.warning(t('flockArchive.invalidAge', '入舍日龄须为大于或等于 0 的整数。'));
      return;
    }
    const payload: Record<string, unknown> = {
      ...(form.source !== originalForm.source ? { source_farm: form.source } : {}),
      ...(breedChanged ? { breed_code: form.breed } : {}),
      ...(form.inDate && form.inDate !== originalForm.inDate ? { start_date: form.inDate, placement_date: form.inDate } : {}),
      ...(form.placementAge !== originalForm.placementAge ? { placement_age: placementAge } : {}),
      ...(form.cost !== originalForm.cost ? { cost: flockArchiveNumber(form.cost) } : {}),
      ...(form.targetWeeks !== originalForm.targetWeeks ? { target_weeks: flockArchiveNumber(form.targetWeeks) } : {}),
      ...(form.flockStatus !== originalForm.flockStatus ? { status: form.flockStatus } : {}),
      ...(form.eliminationDate !== originalForm.eliminationDate ? { planned_elimination_date: form.eliminationDate || null } : {}),
      ...(form.peakLayRate !== originalForm.peakLayRate ? { peak_lay_rate: flockArchiveNumber(form.peakLayRate) } : {}),
      ...(form.feedConvRatio !== originalForm.feedConvRatio ? { feed_conversion_ratio: flockArchiveNumber(form.feedConvRatio) } : {}),
    };
    if (!Object.keys(payload).length) {
      setEditId(null);
      return;
    }
    setSubmitting(true);
    try {
      if (await updateRecord(editId, payload, 'flock_no')) {
        const refreshed = await load();
        setEditId(null);
        toast.success(t('ui.更新成功', '更新成功'));
        if (!refreshed) toast.warning(t('flockArchive.refreshAfterSave', '档案已保存，列表刷新失败。'));
      }
    } finally {
      setSubmitting(false);
    }
  };
  const breedLabelOf = useCallback((code: string) => breedOptions.find(o => o.value === code)?.label || code, [breedOptions]);
  const needsBreedReview = (code?: string) => !code?.trim() || (!breedsLoading && !breedOptions.some(o => o.value === code));
  const editedFlock = flocks.find(flock => flock.id === editId);
  const data = statusFilter === 'all' ? flocks : flocks.filter(f => f.status === statusFilter || statusFilter === 'LAYING' && f.status === 'ACTIVE');
  const columns = [{
    key: 'batchNo',
    title: t('ui.批次号', '批次号'),
    width: '130px'
  }, {
    key: 'farmName',
    title: t('ui.养殖场', '养殖场'),
    width: '130px',
    render: (_: unknown, row: FlockCard) => <MasterNameCode name={row.farmName} code={row.farmCode} />
  }, {
    key: 'houseName',
    title: t('ui.鸡舍', '鸡舍'),
    width: '110px',
    render: (_: unknown, row: FlockCard) => <MasterNameCode name={row.houseName} code={row.houseCode} />
  }, {
    key: 'breed',
    title: t('ui.品种', '品种'),
    width: '80px',
    render: (_: unknown, row: FlockCard) => {
      const v = breedLabelOf(String(row.breed ?? ''));
      return <>{v && v !== '—' ? v : <span className={u.muted}>—</span>}{needsBreedReview(row.breedCode) &&
        <div className={u.muted}>{t('ui.品种待核对', '标准码待核对')}</div>}</>;
    }
  }, {
    key: 'inDate',
    title: t('ui.进雏日期', '进雏日期'),
    width: '100px',
    render: (v: unknown) => flockArchiveDate(v, lang)
  }, {
    key: 'age',
    title: t('ui.鸡龄', '鸡龄'),
    width: '100px',
    render: (_: unknown, { age }: FlockCard) => age
      ? `${flockArchiveFormatNumber(age.weeks, lang)}${t('ui.周', '周')} ${flockArchiveFormatNumber(age.remainingDays, lang)}${t('flockArchive.dayUnit', '天')}`
      : '—'
  }, {
    key: 'quantity',
    title: t('ui.存栏量', '存栏量'),
    width: '90px',
    render: (v: unknown) => flockArchiveNumber(v) === null ? '—' : `${flockArchiveFormatNumber(v, lang)}${t('ui.羽', '羽')}`
  }, {
    key: 'layingRate',
    title: t('ui.产蛋率', '产蛋率'),
    width: '80px',
    render: (v: unknown) => {
      const rate = flockArchiveNumber(v);
      return rate === null ? <span className={u.muted}>—</span> : <span style={{
        fontWeight: 700,
        color: rate >= 90 ? 'var(--status-success)' : rate >= 85 ? 'var(--status-warning)' : 'var(--status-danger)'
      }}>{flockArchiveFormatNumber(rate, lang)}%</span>;
    }
  }, {
    key: 'feedRatio',
    title: t('ui.料蛋比', '料蛋比'),
    width: '80px',
    render: (v: unknown) => {
      const ratio = flockArchiveNumber(v);
      return ratio === null ? '—' : <span style={{
        color: ratio <= 2.35 ? 'var(--status-success)' : 'var(--status-warning)'
      }}>{flockArchiveFormatNumber(ratio, lang, 4)}</span>;
    }
  }, {
    key: 'targetWeeks',
    title: t('ui.目标周数', '目标周数'),
    width: '80px',
    render: (v: unknown, row: FlockCard) => {
      const tw = flockArchiveNumber(v ?? row._raw?.target_weeks);
      return tw === null ? '—' : `${flockArchiveFormatNumber(tw, lang)}${t('ui.周', '周')}`;
    }
  }, {
    key: 'eliminationDate',
    title: t('ui.预计淘汰日', '预计淘汰日'),
    width: '100px',
    render: (_: unknown, row: FlockCard) => flockArchiveDate(row._raw?.planned_elimination_date, lang)
  }, {
    key: 'status',
    title: t('common.status', '状态'),
    width: '100px',
    render: (v: unknown) => {
      const st = STATUS_MAP[v as string] || {
        status: 'default',
        label: String(v || '—')
      };
      return <StatusBadge status={st.status} label={st.label} />;
    }
  }, {
    key: 'actions',
    title: t('common.operation', '操作'),
    width: '180px',
    render: (_: unknown, row: FlockCard) => <div className={s.tableActions}>
        {canEditFlock && <button type="button" className={s.btnIcon} aria-label={t('flockArchive.editFlock', '编辑鸡群 {flock}').replace('{flock}', String(row.id))} onClick={() => handleEdit(row)}><Edit2 size={12} /></button>}
        <button type="button" style={secondaryActionButton} onClick={() => setCycleFlockNo(String(row.id))}>
          {t('flockArchive.cycle', '鸡群周期')}
        </button>
        {needsBreedReview(row.breedCode) && <button type="button" style={secondaryActionButton} onClick={() => setConfirmFlockNo(String(row.id))}>
          {t('ui.核对品种', '核对品种')}
        </button>}
      </div>
  }];
  return <div className="animate-fade-in">
      {cycleFlockNo && <FlockCycleDrawer key={cycleFlockNo} flockNo={cycleFlockNo} canTransfer={canCreateFlock} onClose={() => setCycleFlockNo(null)} />}
      {confirmFlockNo && <FlockBreedConfirmation key={confirmFlockNo} flockNo={confirmFlockNo}
        onClose={() => setConfirmFlockNo(null)} onConfirmed={({ receiptId }) => {
          setConfirmFlockNo(null);
          toast.success(receiptId
            ? t('breeding.breed.confirmedReceipt', '品种已确认，审计编号 {id}').replace('{id}', receiptId)
            : t('breeding.breed.confirmed', '品种已确认'));
          void load();
        }} />}

      <PageHeader
        title={t('ui.鸡群档案', '鸡群档案')}
        subtitle={`${t('ui.当前共', '当前共')} ${archive.result?.total ?? 0} ${t('ui.个鸡群批次', '个鸡群批次')}`}
        breadcrumb={[t('ui.养殖管理', '养殖管理'), t('ui.鸡群档案', '鸡群档案')]}
        actions={canCreateFlock && (
          <button type="button" style={primaryActionButton} onClick={() => { window.location.href='/breeding/flock-lifecycle/admissions?kind=ADMIT'; }}>
            <Plus size={14} />{t('ui.办理入栏与生命周期', '办理入栏与生命周期')}
          </button>
        )}
      />

      <DataTable columns={columns} data={archive.loading ? [] : data} pageSize={25} server={{ query: archive.search, onQueryChange: archive.setSearch, page: archive.page, onPageChange: archive.setPage, total: archive.result?.total ?? 0 }} emptyText={archive.error || (archive.loading ? t("common.loading", "加载中…") : undefined)} searchPlaceholder={t('ui.搜索批次号农场', '搜索批次号农场')} searchKeys={['batchNo', 'farmName', 'farmCode', 'houseName', 'houseCode', 'breed', 'breedCode', 'breedSearch']} rowKey="id" filters={
        <div style={{ display: 'flex', gap: 6 }}>
          {statusFilters.map(f => (
            <button key={f.key} type="button" onClick={() => { archive.setPage(1); setStatusFilter(f.key); }} style={toolbarFilterPill(statusFilter === f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      } />

      <DrawerV2 open={Boolean(editedFlock)} closeDisabled={submitting} onClose={() => setEditId(null)}
        title={`${t('common.edit', '编辑')} ${t('ui.鸡群档案', '鸡群档案')}`} width={460}>
        <form noValidate onSubmit={event => { event.preventDefault(); void handleSubmit(); }} style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }}>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl} htmlFor="flock-archive-farm">{t('ui.归属养殖场', '归属养殖场')}</label>
              <input id="flock-archive-farm" data-i18n-skip="true" value={editedFlock ? masterNameWithCode(editedFlock.farmName, editedFlock.farmCode) : ''}
                readOnly className={s.inp} style={{ background: 'var(--bg-muted)' }} />
            </div>
            <div>
              <label className={s.lbl} htmlFor="flock-archive-house">{t('flockArchive.currentHouse', '当前鸡舍')}</label>
              <input id="flock-archive-house" data-i18n-skip="true" value={editedFlock ? masterNameWithCode(editedFlock.houseName, editedFlock.houseCode) : ''}
                readOnly className={s.inp} style={{ background: 'var(--bg-muted)' }} />
              {canCreateFlock && editId && editedFlock?.houseCode && editedFlock.status !== 'RETIRED' &&
                <Link href={flockArchiveTransferPath(editId, editedFlock.houseCode)}>{t('flockArchive.transfer', '办理整群转舍')}</Link>}
            </div>
          </div>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>{t('ui.鸡群品种', '鸡群品种')}</label>
              {editId && needsBreedReview(originalForm.breed) ? <button type="button" style={secondaryActionButton} disabled={submitting} onClick={() => {
                setEditId(null);
                setConfirmFlockNo(editId);
              }}>{t('ui.核对品种', '核对品种')}</button> : <DictSelect dictType="BRD_BREED" value={form.breed} onChange={breed => setForm(p => ({ ...p, breed }))}
                ariaLabel={t('ui.鸡群品种', '鸡群品种')} allowEmpty={false} className={s.inp} disabled={submitting || breedsLoading} />}
              {historicalBreed && <div className={u.muted}>
                {t('ui.历史品种原值', '历史品种原值')}：{historicalBreed}
              </div>}
            </div>
            <div><label className={s.lbl}>{t('ui.引种来源种禽企业', '引种来源种禽企业')}</label><SupplierSelector value={form.source} onChange={v => setForm({
              ...form,
              source: v
            })} placeholder={t('ui.选择种禽供应商', '选择种禽供应商')} /></div>
          </div>
          <div className={s.fieldRow}>
            <div><label className={s.lbl} htmlFor="flock-archive-age">{t('ui.入舍日龄(天)', '入舍日龄(天)')}</label><input id="flock-archive-age" type="number" min={0} step={1} onFocus={e => e.currentTarget.select()} value={form.placementAge} onChange={e => setForm({
              ...form,
              placementAge: e.target.value
            })} className={s.inp} /></div>
            <div><label className={s.lbl} htmlFor="flock-archive-cost">{t('ui.种苗单价(元/羽)', '种苗单价(元/羽)')}</label><input id="flock-archive-cost" type="number" step="any" onFocus={e => e.currentTarget.select()} value={form.cost} onChange={e => setForm({
              ...form,
              cost: e.target.value
            })} className={s.inp} /></div>
          </div>
          <div className={s.fieldRow}>
            <div><label className={s.lbl} htmlFor="flock-archive-placement">{t('ui.进雏入栏日期', '进雏入栏日期')}</label><input id="flock-archive-placement" type="date" value={form.inDate} onChange={e => setForm({
              ...form,
              inDate: e.target.value
            })} className={s.inp} /></div>
            <div><label className={s.lbl} htmlFor="flock-archive-quantity">{t('ui.当前存栏(羽)', '当前存栏(羽)')}</label><input id="flock-archive-quantity"
              type="number" value={String(editedFlock?.quantity ?? '')} readOnly style={{ background: 'var(--bg-muted)' }} className={s.inp} /></div>
          </div>
          <div className={s.fieldRow}>
            <div><label className={s.lbl} htmlFor="flock-archive-target-weeks">{t('ui.计划产蛋周数(周)', '计划产蛋周数(周)')}</label><input id="flock-archive-target-weeks" type="number" onFocus={e => e.currentTarget.select()} value={form.targetWeeks} onChange={e => setForm({
              ...form,
              targetWeeks: e.target.value
            })} className={s.inp} /></div>
            <div><label className={s.lbl} htmlFor="flock-archive-elimination">{t('ui.计划淘汰日期', '计划淘汰日期')}</label><input id="flock-archive-elimination" type="date" value={form.eliminationDate} onChange={e => setForm({
              ...form,
              eliminationDate: e.target.value
            })} className={s.inp} /></div>
          </div>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl} htmlFor="flock-archive-peak-rate">{t('ui.历史峰值产蛋率(%)', '历史峰值产蛋率(%)')}</label>
              <div style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              marginBottom: 4
            }}>{t('ui.日报提交后自动更新', '日报提交后自动更新')}</div>
              <input id="flock-archive-peak-rate" type="number" onFocus={e => e.currentTarget.select()} step="any" value={form.peakLayRate} onChange={e => setForm({
              ...form,
              peakLayRate: e.target.value
            })} className={s.inp} />
            </div>
            <div>
              <label className={s.lbl} htmlFor="flock-archive-feed-ratio">{t('ui.当前料蛋比', '当前料蛋比')}</label>
              <div style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              marginBottom: 4
            }}>{t('ui.日报提交后自动更新', '日报提交后自动更新')}</div>
              <input id="flock-archive-feed-ratio" type="number" onFocus={e => e.currentTarget.select()} step="any" value={form.feedConvRatio} onChange={e => setForm({
              ...form,
              feedConvRatio: e.target.value
            })} className={s.inp} />
            </div>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t('ui.鸡群状态', '鸡群状态')}</label>
            <DictSelect dictType="BRD_FLOCK_STATUS" ariaLabel={t('ui.鸡群状态', '鸡群状态')} value={form.flockStatus} allowedValues={['GROWING','LAYING','PEAK','DECLINING']} disabled={form.flockStatus==='RETIRED'} onChange={flockStatus=>setForm(p=>({...p,flockStatus}))} className={s.inp}/>
            <small>{t('flockArchive.closeThroughLifecycle', '请通过生命周期关闭单办理关群。')}</small>
          </div>
          <div style={{
          display: 'flex',
          gap: 10,
          marginTop: 8
        }}>
            <button type="button" disabled={submitting} style={{ ...secondaryActionButton, flex: 1, justifyContent: "center", opacity: submitting ? 0.65 : 1 }} onClick={() => setEditId(null)}>{t('common.cancel', '取消')}</button>
            <button type="submit" disabled={submitting} style={{ ...primaryActionButton, flex: 2, justifyContent: "center", opacity: submitting ? 0.65 : 1 }}>{submitting ? t('common.saving', '保存中...') : t('ui.保存修改', '保存修改')}</button>
          </div>
        </form>
      </DrawerV2>
    </div>;
}
