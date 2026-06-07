'use client';

import { useState, useEffect, useRef, useCallback, Fragment, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import u from "@/styles/uix-utils.module.css";
interface DailyReport {
  [key: string]: unknown;
  date?: unknown;
  house?: unknown;
  houseName?: unknown;
  eggs?: unknown;
  dirtyEggs?: unknown;
  brokenEggs?: unknown;
  deaths?: unknown;
  elimination?: unknown; // 淘汰数（主动淘汰，非自然死亡）
  cullingReason?: unknown; // 淘汰原因
  feedKg?: unknown;
  waterL?: unknown;
  temp?: unknown;
  humidity?: unknown;
  remark?: unknown;
}
import PageHeader from '@/components/PageHeader';
import { useCrud } from '@/hooks/useCrud';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/contexts/ToastContext';
import { useDialog } from '@/contexts/DialogContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Save, Download, Cpu, CheckCircle, X as XIcon } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';
import { HouseSelector } from '@/components/shared-selectors/MasterDataSelectors'; // G4-E 鸡舍主数据
import { useDictOptions } from '@/hooks/useDictOptions'; // 班次字典化
import { useProductGrades } from '@/hooks/useProductGrades'; // G14 9 档分级

// 纯数字输入列（分前后两段，中间插入淘汰数+淘汰原因）
const FIELDS_A = ['eggs', 'dirtyEggs', 'brokenEggs', 'deaths'] as const;
const FIELDS_B = ['feedKg', 'waterL', 'selfUse', 'temp', 'humidity'] as const;
const mkRow = (id: number, shift: string) => ({
  id,
  shift,
  eggs: '',
  dirtyEggs: '',
  brokenEggs: '',
  deaths: '',
  elimination: '',
  elimReason: '',
  // 手机端 mortality 写入的字段
  feedKg: '',
  waterL: '',
  selfUse: '',  // G9：自用蛋数（孟赛 Excel 实有列）
  temp: '',
  humidity: '',
  remark: '',
  // G14：按 9 档分解的产蛋数量（可选；填了则提交时携带 eggs_by_grade JSON）
  gradeQty: {} as Record<string, string>,
});
export default function DailyPage() {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
  const toast = useToast();
  const {
    showConfirm
  } = useDialog();
  const {
    can
  } = usePermission();
  const {
    t
  } = useLanguage();
  const today = new Date().toISOString().split('T')[0];
  const historyRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // /daily-work?action=create / mortality 接入：mount 后自动滚到表单 + 提示
  const sp = useSearchParams();
  useEffect(() => {
    const action = sp.get('action');
    if (action === 'create' || action === 'mortality') {
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast.success(action === 'mortality' ? '已定位到死淘登记表单' : '已定位到日报录入表单');
      }, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // G14：表头分两行 — 第一行业务核心 6 列，第二行次要 5 列
  const HEADS_ROW1 = [t('ui.班次', '班次'), t('ui.产蛋数(枚)', '产蛋数(枚)'), `🟡${t('ui.脏蛋(枚)', '脏蛋(枚)')}`, `🔴${t('ui.破损蛋(枚)', '破损蛋(枚)')}`, t('ui.死亡(羽)', '死亡(羽)'), t('ui.淘汰(羽)', '淘汰(羽)'), t('ui.淘汰原因', '淘汰原因'), t('ui.9 档分级', '9 档分级')];
  const HEADS_ROW2 = [t('ui.饲料(kg)', '饲料(kg)'), t('ui.用水(L)', '用水(L)'), t('ui.自用蛋(枚)', '自用蛋(枚)'), t('ui.温度(℃)', '温度(℃)'), t('ui.湿度(%)', '湿度(%)'), `${t('common.remark', '备注')}...`];
  const {
    fetchRecords: fetchHouses
  } = useCrud('brd_houses');
  const {
    fetchRecords: fetchFlocks
  } = useCrud('brd_flocks');
  const {
    fetchRecords,
    createRecord
  } = useCrud('brd_daily_logs');
  const [houses, setHouses] = useState<{
    code: string;
    label: string;
  }[]>([]);
  const [selectedHouse, setSelectedHouse] = useState('');
  const [flockByHouse, setFlockByHouse] = useState<Record<string, string>>({});
  const [farmCodeByHouse, setFarmCodeByHouse] = useState<Record<string, string>>({});
  const [formDate, setFormDate] = useState(today);
  // 班次字典化：BRD_SHIFT，与后端 sys_dict 同步（既有 codes: MORNING/EVENING/NIGHT/DAY）
  const { optionPairs: shiftOptions } = useDictOptions('BRD_SHIFT');
  const shiftRows = shiftOptions.length > 0
    ? shiftOptions.map((opt, i) => mkRow(i + 1, opt.value))
    : [mkRow(1, 'BRD_SHIFT_MORNING'), mkRow(2, 'BRD_SHIFT_EVENING')];
  const [rows, setRows] = useState(shiftRows);
  // 字典加载完后同步 rows（首次加载从 fallback DAY/NIGHT 切到 dict 实际值）
  useEffect(() => {
    if (shiftOptions.length === 0) return;
    setRows(prev => {
      if (prev.length === shiftOptions.length && prev.every((r, i) => r.shift === shiftOptions[i].value)) return prev;
      return shiftOptions.map((opt, i) => mkRow(i + 1, opt.value));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftOptions.length]);
  // G14：字典加载失败时用内置中文 fallback，避免显示 'BRD_SHIFT_MORNING' 字典码
  const FALLBACK_SHIFT_LABELS: Record<string, string> = {
    'BRD_SHIFT_MORNING': '早班', 'BRD_SHIFT_EVENING': '晚班',
    'BRD_SHIFT_NIGHT':   '夜班', 'BRD_SHIFT_DAY':     '全天',
    'DAY': '早班', 'NIGHT': '晚班',
  };
  const shiftLabel = (code: string) =>
    shiftOptions.find(o => o.value === code)?.label || FALLBACK_SHIFT_LABELS[code] || code;
  const [submitted, setSubmitted] = useState(false);
  const [approved, setApproved] = useState(false);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [deviceHint, setDeviceHint] = useState<Record<string, string> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);
  // G16：设备一键填入 — 选时点（默认 17:00 集蛋后）
  const [showGenModal, setShowGenModal] = useState(false);
  const [genHour, setGenHour] = useState<number | ''>(17);
  // G14：当前舍存栏（拉自 brd_flocks.current_qty）+ 9 档 modal
  const [currentQty, setCurrentQty] = useState<number>(0);
  const [gradeModalRowId, setGradeModalRowId] = useState<number | null>(null);
  const { grades: productGrades } = useProductGrades();
  const loadData = useCallback(async () => {
    const [data, allHouses] = await Promise.all([fetchRecords(), fetchHouses()]);
    const houseNameMap: Record<string, string> = {};
    (allHouses || []).forEach((h: Record<string, unknown>) => {
      if (h.house_code) houseNameMap[h.house_code as string] = h.house_name as string || h.house_code as string;
      if (h.house_no) houseNameMap[h.house_no as string] = h.house_name as string || h.house_no as string;
    });
    setReports(((data || []) as Record<string, unknown>[]).map((d: Record<string, unknown>) => ({
      date: d.log_date,
      house: d.house_code || d.flock_no || t('ui.未知', '未知'),
      houseName: houseNameMap[d.house_code as string] || houseNameMap[d.flock_no as string] || d.house_code || t('ui.未知', '未知'),
      eggs: d.eggs_produced || 0,
      dirtyEggs: d.dirty_eggs || 0,
      brokenEggs: d.broken_eggs || 0,
      deaths: d.mortality_qty || 0,
      elimination: d.elimination_qty || 0,
      // 手机端 mortality 写入
      cullingReason: d.culling_reason || '',
      // 手机端 mortality 写入
      feedKg: d.feed_consumed || 0,
      waterL: d.water_consumed || 0,
      temp: d.temp || 25,
      humidity: d.humidity || 60,
      remark: d.note || ''
    })).reverse());
  }, [fetchRecords, fetchHouses]);
  useEffect(() => {
    Promise.all([fetchHouses(), fetchFlocks()]).then(([houses, flocks]: [Record<string, unknown>[], Record<string, unknown>[]]) => {
      const fromHouses = (houses || []).filter((h: Record<string, unknown>) => h.house_code || h.house_no);
      const fcmap: Record<string, string> = {};
      (houses || []).forEach((h: Record<string, unknown>) => {
        if (h.house_code) fcmap[h.house_code as string] = h.farm_code as string || '';
      });
      setFarmCodeByHouse(fcmap);
      const hmap: Record<string, string> = {};
      (flocks || []).forEach((f: Record<string, unknown>) => {
        if (f.house_code && f.flock_no && !hmap[f.house_code as string]) hmap[f.house_code as string] = f.flock_no as string;
      });
      setFlockByHouse(hmap);
      const houseList = fromHouses.length > 0 ? fromHouses.map((h: Record<string, unknown>) => ({
        code: (h.house_code || h.house_no) as string,
        label: (h.house_name || h.house_code || h.house_no) as string
      })) : (flocks || []).map((f: Record<string, unknown>) => ({
        code: f.flock_no as string,
        label: f.house_code ? `${f.house_code}${f.farm_name ? ' · ' + f.farm_name : ''}` : f.flock_no as string
      }));
      setHouses(houseList);
      // G13：admin/全局用户默认"全部鸡舍"（空字符串=全部），业务录入用户默认选第一个
      // 让初始数据可被 admin/CEO 等全局视角直接看到，无需手动切换
      const userStore = (typeof window !== 'undefined' ? JSON.parse(sessionStorage.getItem('phoenix_user') || '{}')?.storeCode : '') || '';
      const isGlobalUser = userStore === 'ALL' || userStore.startsWith('ORG-GROUP');
      setSelectedHouse(isGlobalUser ? '' : (houseList[0]?.code || ''));
    }).catch(() => {});
    loadData();
  }, []);
  // G14：拉当前选中舍的存栏数（brd_flocks.current_qty），供产蛋率实时计算
  useEffect(() => {
    if (!selectedHouse) { setCurrentQty(0); return; }
    fetchFlocks().then((flocks: Record<string, unknown>[]) => {
      const flock = (flocks || []).find(f => f.house_code === selectedHouse);
      setCurrentQty(Number(flock?.current_qty) || 0);
    }).catch(() => setCurrentQty(0));
  }, [selectedHouse, fetchFlocks]);
  useEffect(() => {
    if (!selectedHouse) return;
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') : '';
    fetch(`${API_BASE}/api/v3/iot/devices/${selectedHouse}/overview`, {
      headers: token ? {
        Authorization: `Bearer ${token}`
      } : {}
    }).then(r => r.ok ? r.json() : null).then(res => {
      const snap = res?.data?.sensors;
      if (!Array.isArray(snap) || !snap.length) {
        setDeviceHint(null);
        return;
      }
      const byCode = Object.fromEntries(snap.map((s: Record<string, unknown>) => [s.property_code, s]));
      const hint: Record<string, string> = {};
      if (byCode['2001']?.value) hint.temp = Number(byCode['2001'].value).toFixed(1);
      if (byCode['2083']?.value) hint.humidity = Number(byCode['2083'].value).toFixed(0);
      if (byCode['2488']?.value) hint.feedKg = Number(byCode['2488'].value).toFixed(1);
      if (byCode['2484']?.value) hint.waterL = Number(byCode['2484'].value * 1000).toFixed(0);
      if (Object.keys(hint).length) {
        setDeviceHint(hint);
        setRows(prev => prev.map(r => ({
          ...r,
          temp: !r.temp && hint.temp ? hint.temp : r.temp,
          humidity: !r.humidity && hint.humidity ? hint.humidity : r.humidity,
          feedKg: !r.feedKg && hint.feedKg ? hint.feedKg : r.feedKg,
          waterL: !r.waterL && hint.waterL ? hint.waterL : r.waterL
        })));
      } else {
        setDeviceHint(null);
      }
    }).catch(() => setDeviceHint(null));
  }, [selectedHouse]);
  const updateRow = (id: number, field: string, val: string) => setRows(rows.map(r => r.id === id ? {
    ...r,
    [field]: val
  } : r));
  // G14：9 档 sum 计算
  const gradeSumOf = (gradeQty: Record<string, string>): number =>
    Object.values(gradeQty || {}).reduce((s, v) => s + (Number(v) || 0), 0);

  const handleSubmit = async () => {
    const hasData = rows.some(r => r.eggs || r.deaths || r.feedKg || r.dirtyEggs || r.brokenEggs || r.waterL);
    if (!hasData) {
      toast.error(t('ui.请至少录入一项数据（产蛋数、死淘或饲料用量）后再提交', '请至少录入一项数据（产蛋数、死淘或饲料用量）后再提交'));
      return;
    }
    const hasNegative = rows.some(r => Number(r.eggs) < 0 || Number(r.deaths) < 0 || Number(r.feedKg) < 0 || Number(r.dirtyEggs) < 0 || Number(r.brokenEggs) < 0 || Number(r.waterL) < 0);
    if (hasNegative) {
      toast.error(t('ui.产蛋数、死淘数及耗材等数据不能录入负数！', '产蛋数、死淘数及耗材等数据不能录入负数！'));
      return;
    }
    // G14：9 档录入校验 — sum(9档) vs eggs_produced 偏差 > 3% 弹窗确认
    for (const r of rows) {
      const eggs = Number(r.eggs) || 0;
      const gradeSum = gradeSumOf(r.gradeQty);
      if (gradeSum > 0 && eggs > 0) {
        const diff = Math.abs(gradeSum - eggs);
        const tolerance = Math.max(3, eggs * 0.03);
        if (diff > tolerance) {
          const ok = await showConfirm({
            type: 'confirm', icon: '⚠️',
            title: `${shiftLabel(r.shift)}：9 档分级总数与产蛋数不一致`,
            message: `9 档分级 sum = ${gradeSum} 枚\n产蛋总数 = ${eggs} 枚\n差 ${diff} 枚（容差 ${Math.round(tolerance)}）\n\n是否继续提交？`,
            confirmLabel: '继续提交',
          });
          if (!ok) return;
        }
      }
    }
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') : '';
    const userStr = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_user') : '{}';
    const user = userStr ? JSON.parse(userStr) : {};
    const operatorName = user.realNameZh || user.username || t('ui.未知操作人', '未知操作人');
    const submitOne = async (r: typeof rows[number]) => {
      // G14：构建 eggs_by_grade JSON（仅含 qty>0 的档）
      const eggsByGrade: Record<string, number> = {};
      for (const [code, qty] of Object.entries(r.gradeQty || {})) {
        const n = Number(qty) || 0;
        if (n > 0) eggsByGrade[code] = n;
      }
      const payload: Record<string, unknown> = {
        house_code: selectedHouse,
        flock_no: flockByHouse[selectedHouse] || selectedHouse,
        farm_code: farmCodeByHouse[selectedHouse] || '',
        log_date: formDate,
        shift: r.shift,
        feed_consumed: Number(r.feedKg) || 0,
        water_consumed: Number(r.waterL) || 0,
        self_use_qty: Number(r.selfUse) || 0,  // G9：自用蛋数
        mortality_qty: Number(r.deaths) || 0,
        elimination_qty: Number(r.elimination) || 0,
        culling_reason: r.elimReason || null,
        eggs_produced: Number(r.eggs) || 0,
        dirty_eggs: Number(r.dirtyEggs) || 0,
        broken_eggs: Number(r.brokenEggs) || 0,
        temp: Number(r.temp) || 25,
        humidity: Number(r.humidity) || 60,
        note: r.remark,
        operator: operatorName,
      };
      // G14：携带 9 档分级 JSON，让生产终端可一键消费
      if (Object.keys(eggsByGrade).length > 0) payload.eggs_by_grade = eggsByGrade;
      const res = await fetch(`${API_BASE}/api/v3/farm/daily-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? {
            Authorization: `Bearer ${token}`
          } : {})
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({
          message: res.statusText
        }));
        throw new Error(j?.message || j?.msg || `HTTP ${res.status}`);
      }
      return r.shift;
    };
    const rowsToSubmit = rows.filter(r => r.eggs || r.deaths || r.feedKg || r.dirtyEggs || r.brokenEggs || r.waterL);
    const results = await Promise.allSettled(rowsToSubmit.map(submitOne));
    const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<string>[];
    const rejected = results.map((r, i) => ({
      r,
      shift: rowsToSubmit[i].shift
    })).filter(x => x.r.status === 'rejected') as Array<{
      r: PromiseRejectedResult;
      shift: string;
    }>;
    if (rejected.length > 0) {
      const failed = rejected.map(x => `${x.shift}：${(x.r.reason as Error)?.message || t('ui.未知错误', '未知错误')}`).join('\n');
      toast.error(`${t('ui.部分班次提交失败：', '部分班次提交失败：')}\n${failed}`);
    }
    if (fulfilled.length > 0) {
      setSubmitted(true);
      setApproved(false);
      setTimeout(() => setSubmitted(false), 3000);
      // G15：日报提交成功后，若任一班次填了 9 档 → 弹窗确认是否同步入销售库存
      // 仅 TEMP_PRODUCTION_INBOUND 模式可用；PACKAGING_INBOUND 模式提示前往包装中心
      const rowsWithGrades = rowsToSubmit.filter(r => Object.values(r.gradeQty || {}).some(v => Number(v) > 0));
      if (rowsWithGrades.length > 0) {
        const totalSum = rowsWithGrades.reduce((s, r) => s + gradeSumOf(r.gradeQty), 0);
        const ok = await showConfirm({
          type: 'confirm', icon: '📦',
          title: '日报已保存 — 是否同步入销售库存？',
          message: `共 ${rowsWithGrades.length} 个班次填了 9 档分级，合计 ${totalSum.toLocaleString()} 枚。\n\n确认 → 自动写入鸡蛋销售成品仓（LPH_MS_EGG_SALES），可直接销售。\n取消 → 仅保存日报数据，稍后去「日产蛋入库」分级入库。`,
          confirmLabel: '同步入销售库存',
          cancelLabel: '仅保存日报',
        });
        if (ok) {
          // 调 daily-inbound endpoint 一键入库
          const allItems = rowsWithGrades.flatMap(r =>
            Object.entries(r.gradeQty).filter(([, v]) => Number(v) > 0).map(([grade, qty]) => ({ grade, qty: Number(qty) }))
          );
          try {
            const res = await fetch(`${API_BASE}/api/v2/inventory/production-inbound`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
              body: JSON.stringify({ eggDate: formDate, houseCode: selectedHouse || undefined, items: allItems }),
            });
            const j = await res.json();
            if (res.ok && j.code === 200) {
              toast.success(`✓ 已入库 ${allItems.length} 个批次，合计 ${totalSum.toLocaleString()} 枚`);
            } else {
              if (j.message?.includes('PACKAGING_INBOUND')) {
                toast.error('当前 SITE 是包装入库模式，请去包装作业中心完成');
              } else {
                toast.error(`入库失败：${j.message || res.statusText}`);
              }
            }
          } catch (e: any) {
            toast.error(`入库失败：${e.message}`);
          }
        }
      }
      if (rejected.length === 0) {
        const codes = shiftOptions.length > 0 ? shiftOptions.map(o => o.value) : ['BRD_SHIFT_MORNING', 'BRD_SHIFT_EVENING'];
        setRows(codes.map((c, i) => mkRow(i + 1, c)));
      }
      loadData();
    }
  };
  const handleExport = () => {
    const headers = [t('ui.班次', '班次'), t('ui.产蛋数', '产蛋数'), t('ui.脏蛋', '脏蛋'), t('ui.破损蛋', '破损蛋'), t('ui.死亡', '死亡'), t('ui.淘汰数', '淘汰数'), t('ui.淘汰原因', '淘汰原因'), t('ui.饲料kg', '饲料kg'), t('ui.用水L', '用水L'), t('ui.温度', '温度'), t('ui.湿度', '湿度'), t('common.remark', '备注')];
    const rowData = rows.map(r => [shiftLabel(r.shift), r.eggs || 0, r.dirtyEggs || 0, r.brokenEggs || 0, r.deaths || 0, r.elimination || 0, r.elimReason || '', r.feedKg || 0, r.waterL || 0, r.temp || 0, r.humidity || 0, r.remark]);
    const csv = [headers, ...rowData].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], {
      type: 'text/csv;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t('ui.日报', '日报')}_${selectedHouse}_${formDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleApprove = () => {
    setApproved(true);
    setTimeout(() => setApproved(false), 3000);
  };
  // G16：设备一键填入 — 选时点 + 调日差额 endpoint，填入第一行（晨班）
  const handleGenerateFromDevice = async () => {
    if (!selectedHouse) {
      toast.error(t('ui.请先选择鸡舍', '请先选择鸡舍'));
      return;
    }
    const hour = genHour === '' ? null : Number(genHour);
    if (hour != null && (Number.isNaN(hour) || hour < 0 || hour > 23)) {
      toast.error(t('ui.时点须为 0-23', '时点须为 0-23'));
      return;
    }
    setShowGenModal(false);
    setGenerating(true);
    setGenResult(null);
    try {
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') : '';
      const res = await fetch(`${API_BASE}/api/v3/iot/devices/daily-report/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          house_code: selectedHouse,
          log_date: formDate,
          ...(hour != null ? { snapshot_hour: hour } : {})
        })
      });
      const d = await res.json();
      if (d.ok) {
        setGenResult(d);
        loadData();
        if (d.feedKg != null || d.waterL != null || d.avgTemp != null) {
          setRows(prev => prev.map((r, i) => i !== 0 ? r : {
            ...r,
            feedKg: d.feedKg != null ? String(d.feedKg) : r.feedKg,
            waterL: d.waterL != null ? String(d.waterL) : r.waterL,
            temp: d.avgTemp != null ? String(Number(d.avgTemp).toFixed(1)) : r.temp,
            humidity: d.avgHum != null ? String(Number(d.avgHum).toFixed(1)) : r.humidity
          }));
        }
      } else {
        toast.error(d.error || t('ui.生成失败', '生成失败'));
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };
  const total = {
    eggs: rows.reduce((sum, r) => sum + (Number(r.eggs) || 0), 0),
    deaths: rows.reduce((sum, r) => sum + (Number(r.deaths) || 0), 0),
    feedKg: rows.reduce((sum, r) => sum + (Number(r.feedKg) || 0), 0)
  };
  const visibleReports = reports.filter(r => !selectedHouse || r.house === selectedHouse).slice(0, 30);
  return <div className="animate-fade-in">
      <PageHeader title={t('ui.日生产日报录入', '日生产日报录入')} subtitle={t('ui.按班次录入当日生产数据', '按班次录入当日生产数据')} breadcrumb={[t('ui.养殖管理', '养殖管理'), t('ui.日生产日报', '日生产日报')]} actions={<div style={{
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap'
    }}>
            <button type="button" className={s.btnSecondary} onClick={() => historyRef.current?.scrollIntoView({
        behavior: 'smooth'
      })}>{t('ui.历史记录', '历史记录')}</button>
            {can(['ROLE_FARM_MGR', 'ROLE_CEO', 'ROLE_QA_MGR', 'ROLE_ADMIN']) && <button type="button" className={s.btnSecondary} onClick={handleExport}>
                <Download size={14} />{t('ui.导出报表', '导出报表')}
              </button>}
            {can(['ROLE_FARM_MGR', 'ROLE_CEO', 'ROLE_ADMIN']) && <button type="button" onClick={() => setShowGenModal(true)} disabled={generating || !selectedHouse} style={{
        opacity: generating || !selectedHouse ? 0.6 : 1,
        cursor: generating || !selectedHouse ? 'not-allowed' : 'pointer',
        padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
        background: 'linear-gradient(135deg, #06B6D4, #2563EB)', color: '#fff',
        border: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
                <Cpu size={15} />{generating ? t('ui.生成中...', '生成中...') : t('ui.⚡ 设备数据一键填入', '⚡ 设备数据一键填入')}
              </button>}
            {can(['ROLE_FARM_MGR', 'ROLE_FARMER', 'ROLE_VET', 'ROLE_CEO', 'ROLE_QA_MGR', 'ROLE_ADMIN']) && <button type="button" className={s.btnPrimary} onClick={handleSubmit}>
                <Save size={15} />{t('ui.提交日报', '提交日报')}
              </button>}
          </div>} />

      {/* 状态横幅 */}
      {submitted && <div style={{
      marginBottom: 12,
      padding: '12px 16px',
      backgroundColor: 'color-mix(in srgb,var(--status-success) 12%,transparent)',
      borderRadius: 'var(--radius-md)',
      color: 'var(--status-success)',
      fontWeight: 600,
      fontSize: 13,
      border: '1px solid color-mix(in srgb,var(--status-success) 40%,transparent)'
    }}>✓ {t('ui.日报已成功提交！', '日报已成功提交！')}</div>}
      {approved && <div style={{
      marginBottom: 12,
      padding: '12px 16px',
      backgroundColor: 'color-mix(in srgb,var(--status-success) 12%,transparent)',
      borderRadius: 'var(--radius-md)',
      color: 'var(--status-success)',
      fontWeight: 600,
      fontSize: 13,
      border: '1px solid color-mix(in srgb,var(--status-success) 40%,transparent)'
    }}>✓ {t('ui.日报审核已通过！', '日报审核已通过！')}</div>}
      {genResult && <div style={{
      marginBottom: 12,
      padding: '12px 16px',
      backgroundColor: 'color-mix(in srgb,var(--color-primary) 10%,transparent)',
      borderRadius: 'var(--radius-md)',
      color: 'var(--color-primary)',
      fontSize: 13,
      border: '1px solid color-mix(in srgb,var(--color-primary) 30%,transparent)',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }}>
          <Cpu size={14} />{genResult.message}
          {genResult.feedKg != null && ` · ${t('ui.耗料', '耗料')}: ${genResult.feedKg}kg`}
          {genResult.waterL != null && ` · ${t('ui.用水', '用水')}: ${genResult.waterL}L`}
          {genResult.avgTemp != null && ` · ${t('ui.均温', '均温')}: ${Number(genResult.avgTemp).toFixed(1)}℃`}
          {genResult.avgHum != null && ` · ${t('ui.湿度', '湿度')}: ${Number(genResult.avgHum).toFixed(1)}%`}
        </div>}

      {/* 表单头部 */}
      <div ref={formRef} className={`${s.card} ${u.mb16}`}>
        <div className={s.cardBody} style={{
        display: 'flex',
        gap: 20,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
          <div>
            <label className={s.lbl}>{t('common.date', '日期')}</label>
            <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className={s.inp} style={{
            width: 160
          }} />
          </div>
          <div style={{
          minWidth: 200
        }}>
            <label className={s.lbl}>{t('ui.鸡舍', '鸡舍')}</label>
            {/* G4-E：从 brd_houses 主数据加载，仅 ACTIVE */}
            <HouseSelector value={selectedHouse} onChange={setSelectedHouse} />
          </div>
          {deviceHint && <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '6px 12px',
          backgroundColor: 'color-mix(in srgb,var(--color-primary) 10%,transparent)',
          border: '1px solid color-mix(in srgb,var(--color-primary) 30%,transparent)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12,
          color: 'var(--color-primary)',
          flexWrap: 'wrap'
        }}>
              <span className={u.fw600}>📡 {t('ui.传感器参考：', '传感器参考：')}</span>
              {deviceHint.temp && <span>{t('ui.温度', '温度')} {deviceHint.temp}℃</span>}
              {deviceHint.humidity && <span>{t('ui.湿度', '湿度')} {deviceHint.humidity}%</span>}
              {deviceHint.feedKg && <span>{t('ui.耗料', '耗料')} {deviceHint.feedKg}kg</span>}
              {deviceHint.waterL && <span>{t('ui.用水', '用水')} {deviceHint.waterL}L</span>}
              <span style={{
            color: 'var(--text-secondary)',
            fontSize: 11
          }}>（{t('ui.已自动预填所有班次，可手动修改', '已自动预填所有班次，可手动修改')}）</span>
            </div>}
          <div style={{
          marginLeft: 'auto',
          display: 'flex',
          gap: 24
        }}>
            {[{
            label: t('ui.当前存栏', '当前存栏'),
            val: currentQty > 0 ? currentQty.toLocaleString() : '—',
            unit: t('ui.羽', '羽'),
            accent: 'var(--text-primary)',
          }, {
            label: t('ui.合计产蛋', '合计产蛋'),
            val: total.eggs || '—',
            unit: t('ui.枚', '枚'),
            accent: 'var(--color-primary)',
          }, {
            label: t('ui.产蛋率', '产蛋率'),
            val: (currentQty > 0 && total.eggs > 0) ? (total.eggs / currentQty * 100).toFixed(1) : '—',
            unit: '%',
            accent: 'var(--status-success)',
          }, {
            label: t('ui.合计死淘', '合计死淘'),
            val: total.deaths || '—',
            unit: t('ui.羽', '羽'),
            accent: 'var(--text-primary)',
          }, {
            label: t('ui.合计饲料', '合计饲料'),
            val: total.feedKg || '—',
            unit: 'kg',
            accent: 'var(--text-primary)',
          }].map(item => <div key={item.label} className={u.tac}>
                <div style={{ fontSize: 18, fontWeight: 700, color: item.accent }}>{item.val} <span className={u.muted12}>{item.unit}</span></div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.label}</div>
              </div>)}
          </div>
        </div>
      </div>

      {/* G14 v2：每个班次独立卡片，字段上方内嵌 label，负数自动归零 */}
      <div className={s.card} style={{ marginBottom: 24, overflow: 'hidden' }}>
        <div className={s.cardHeader}>
          <span className={s.cardTitle} style={{ color: 'var(--color-primary)' }}>{t('ui.班次数据录入', '班次数据录入')}</span>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rows.map(row => {
            const gradeSum = gradeSumOf(row.gradeQty);
            const eggsNum = Number(row.eggs) || 0;
            const gradeCellAccent = gradeSum > 0
              ? (eggsNum > 0 && Math.abs(gradeSum - eggsNum) > Math.max(3, eggsNum * 0.03)
                ? 'var(--status-warning)' : 'var(--status-success)')
              : 'var(--text-secondary)';
            // G14 v2：number 输入统一封装，min=0 + onChange 拦截负数
            const numInput = (field: keyof typeof row, w = 100) => (
              <input
                type="number" min={0} step={1}
                onFocus={e => e.currentTarget.select()}
                value={(row as any)[field]}
                onChange={e => {
                  const v = e.target.value;
                  if (v === '' || v === '-') { updateRow(row.id, field as string, ''); return; }
                  const n = Number(v);
                  if (Number.isNaN(n) || n < 0) { updateRow(row.id, field as string, '0'); return; }
                  updateRow(row.id, field as string, v);
                }}
                className={s.inp}
                style={{ textAlign: 'right', width: w, padding: '7px 10px' }}
                placeholder="0"
              />
            );
            const textInput = (field: keyof typeof row, placeholder: string, w = 160) => (
              <input
                value={(row as any)[field]}
                onChange={e => updateRow(row.id, field as string, e.target.value)}
                className={s.inp}
                style={{ width: w, padding: '7px 10px' }}
                placeholder={placeholder}
              />
            );
            const cellStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 };
            const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' };
            return (
              <div key={row.id} style={{
                border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--bg-page)',
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                {/* 班次标题 + 9 档分级按钮 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-primary)', padding: '4px 10px', borderRadius: 6, background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)' }}>
                      {shiftLabel(row.shift)}
                    </span>
                  </div>
                  <button type="button" onClick={() => setGradeModalRowId(row.id)} style={{
                    padding: '7px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    background: 'var(--bg-card)', border: `1px solid ${gradeCellAccent}`, color: gradeCellAccent,
                    display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600,
                  }}>
                    {gradeSum > 0 ? <><CheckCircle size={14} />{t('ui.9 档', '9 档')} {gradeSum}枚</> : <>{t('ui.按 9 档分级', '按 9 档分级')}</>}
                  </button>
                </div>
                {/* 第一行：业务核心 6 字段 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 10 }}>
                  <div style={cellStyle}><span style={labelStyle}>{t('ui.产蛋数(枚)', '产蛋数(枚)')}</span>{numInput('eggs', 130)}</div>
                  <div style={cellStyle}><span style={labelStyle}>🟡 {t('ui.脏蛋(枚)', '脏蛋(枚)')}</span>{numInput('dirtyEggs', 130)}</div>
                  <div style={cellStyle}><span style={labelStyle}>🔴 {t('ui.破损蛋(枚)', '破损蛋(枚)')}</span>{numInput('brokenEggs', 130)}</div>
                  <div style={cellStyle}><span style={labelStyle}>{t('ui.死亡(羽)', '死亡(羽)')}</span>{numInput('deaths', 130)}</div>
                  <div style={cellStyle}><span style={labelStyle}>{t('ui.淘汰(羽)', '淘汰(羽)')}</span>{numInput('elimination', 130)}</div>
                  <div style={cellStyle}><span style={labelStyle}>{t('ui.淘汰原因', '淘汰原因')}</span>{textInput('elimReason', t('ui.淘汰原因', '淘汰原因'), 160)}</div>
                </div>
                {/* 第二行：次要 6 字段 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 10 }}>
                  <div style={cellStyle}><span style={labelStyle}>{t('ui.饲料(kg)', '饲料(kg)')}</span>{numInput('feedKg', 130)}</div>
                  <div style={cellStyle}><span style={labelStyle}>{t('ui.用水(L)', '用水(L)')}</span>{numInput('waterL', 130)}</div>
                  <div style={cellStyle}><span style={labelStyle}>{t('ui.自用蛋(枚)', '自用蛋(枚)')}</span>{numInput('selfUse', 130)}</div>
                  <div style={cellStyle}><span style={labelStyle}>{t('ui.温度(℃)', '温度(℃)')}</span>{numInput('temp', 130)}</div>
                  <div style={cellStyle}><span style={labelStyle}>{t('ui.湿度(%)', '湿度(%)')}</span>{numInput('humidity', 130)}</div>
                  <div style={cellStyle}><span style={labelStyle}>{t('common.remark', '备注')}</span>{textInput('remark', `${t('common.remark', '备注')}...`, 160)}</div>
                </div>
              </div>
            );
          })}
        </div>
        {/* G14：底部大型保存按钮（PageHeader 顶部按钮另保留） */}
        {can(['ROLE_FARM_MGR', 'ROLE_FARMER', 'ROLE_VET', 'ROLE_CEO', 'ROLE_QA_MGR', 'ROLE_ADMIN', 'ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR']) && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0', borderTop: '1px solid var(--border)' }}>
            <button type="button" className={s.btnPrimary} onClick={handleSubmit} style={{ minWidth: 240, padding: '12px 32px', fontSize: 15, fontWeight: 700, gap: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Save size={18} /> {t('ui.提交日报', '提交日报')}
            </button>
          </div>
        )}
      </div>

      {/* 历史记录 */}
      <h3 ref={historyRef} style={{
      fontSize: 15,
      fontWeight: 700,
      marginBottom: 12,
      color: 'var(--color-primary)',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }}>
        {t('ui.近期日报记录', '近期日报记录')}
        {selectedHouse && <span style={{
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--text-secondary)',
        backgroundColor: 'var(--bg-page)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '2px 10px'
      }}>{houses.find(h => h.code === selectedHouse)?.label || selectedHouse}</span>}
      </h3>
      <div className={s.card} style={{
      overflow: 'hidden'
    }}>
        <table className={s.table}>
          <thead>
            <tr>
              {[t('common.date', '日期'), t('ui.鸡舍', '鸡舍'), t('ui.产蛋数', '产蛋数'), t('ui.脏蛋', '脏蛋'), t('ui.破损蛋', '破损蛋'), t('ui.死亡', '死亡'), t('ui.淘汰', '淘汰'), t('ui.淘汰原因', '淘汰原因'), t('ui.饲料(kg)', '饲料(kg)'), t('ui.温度', '温度'), t('ui.湿度', '湿度'), t('common.remark', '备注')].map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleReports.map((r, i) => <tr key={i}>
                <td>{String(r.date ?? '—')}</td>
                <td>{String(r.houseName ?? r.house ?? '—')}</td>
                <td className={u.fw600}>{Number(r.eggs ?? 0).toLocaleString()}</td>
                <td style={{
              color: Number(r.dirtyEggs) > 30 ? 'var(--status-warning)' : 'var(--text-primary)'
            }}>{String(r.dirtyEggs ?? 0)}</td>
                <td style={{
              color: Number(r.brokenEggs) > 20 ? 'var(--status-danger)' : 'var(--text-primary)',
              fontWeight: Number(r.brokenEggs) > 20 ? 700 : 'normal'
            }}>{String(r.brokenEggs ?? 0)}</td>
                <td style={{
              color: Number(r.deaths) > 8 ? 'var(--status-danger)' : 'var(--text-primary)'
            }}>{String(r.deaths ?? '—')}</td>
                <td style={{
              color: Number(r.elimination) > 0 ? 'var(--status-warning)' : 'var(--text-primary)'
            }}>{Number(r.elimination) > 0 ? String(r.elimination) : '—'}</td>
                <td className={u.muted12}>{String(r.cullingReason || '—')}</td>
                <td>{String(r.feedKg ?? '—')}</td>
                <td>{String(r.temp ?? '—')}℃</td>
                <td>{String(r.humidity ?? '—')}%</td>
                <td className={u.muted12}>{String(r.remark ?? '—')}</td>
              </tr>)}
            {!visibleReports.length && <tr><td colSpan={12} style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: 13
            }}>{t('ui.暂无该鸡舍的日报记录', '暂无该鸡舍的日报记录')}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* G14：9 档分级录入 modal */}
      {gradeModalRowId !== null && (() => {
        const row = rows.find(r => r.id === gradeModalRowId);
        if (!row) return null;
        const eggsNum = Number(row.eggs) || 0;
        const gradeSum = gradeSumOf(row.gradeQty);
        const diff = gradeSum - eggsNum;
        const tolerance = Math.max(3, eggsNum * 0.03);
        const inTolerance = eggsNum === 0 || Math.abs(diff) <= tolerance;
        return (
          <div onClick={() => setGradeModalRowId(null)} style={{
            position: 'fixed', inset: 0, background: 'var(--overlay-black-50)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'var(--bg-card)', borderRadius: 12, padding: 24,
              minWidth: 560, maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto',
              boxShadow: '0 20px 60px var(--overlay-black-30)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  {shiftLabel(row.shift)} · {t('ui.9 档分级录入', '9 档分级录入')}
                </h3>
                <button type="button" onClick={() => setGradeModalRowId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}>
                  <XIcon size={18} />
                </button>
              </div>
              <div style={{ marginBottom: 12, padding: 12, borderRadius: 8, background: 'var(--bg-muted)', fontSize: 13 }}>
                <div>{t('ui.产蛋总数', '产蛋总数')}：<strong>{eggsNum.toLocaleString()}</strong> 枚 · {t('ui.9 档 sum', '9 档 sum')}：<strong style={{ color: inTolerance ? 'var(--status-success)' : 'var(--status-warning)' }}>{gradeSum.toLocaleString()}</strong> 枚</div>
                {eggsNum > 0 && !inTolerance && (
                  <div style={{ marginTop: 6, color: 'var(--status-warning)', fontSize: 12 }}>
                    ⚠️ {t('ui.差', '差')} {Math.abs(diff)} 枚（{t('ui.容差', '容差')} {Math.round(tolerance)}），{t('ui.提交时会弹窗确认', '提交时会弹窗确认')}
                  </div>
                )}
              </div>
              <table className={s.table} style={{ width: '100%' }}>
                <thead>
                  <tr><th>{t('ui.等级', '等级')}</th><th>{t('ui.编码', '编码')}</th><th style={{ textAlign: 'right' }}>{t('ui.数量(枚)', '数量(枚)')}</th></tr>
                </thead>
                <tbody>
                  {productGrades.map(g => (
                    <tr key={g.grade_code}>
                      <td style={{ fontWeight: 500 }}>{g.grade_name}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{g.grade_code}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                        <input type="number" min={0} step={1} value={row.gradeQty[g.grade_code] ?? ''} onChange={e => {
                          const v = e.target.value;
                          let safe: string;
                          if (v === '' || v === '-') safe = '';
                          else { const n = Number(v); safe = (Number.isNaN(n) || n < 0) ? '0' : v; }
                          const newGradeQty = { ...row.gradeQty, [g.grade_code]: safe };
                          setRows(rs => rs.map(r => r.id === row.id ? { ...r, gradeQty: newGradeQty } : r));
                        }} onFocus={e => e.currentTarget.select()} className={s.inp} style={{ textAlign: 'right', width: 120, padding: '6px 8px' }} placeholder="0" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button type="button" className={s.btnSecondary} onClick={() => {
                  setRows(rs => rs.map(r => r.id === row.id ? { ...r, gradeQty: {} } : r));
                }}>
                  {t('ui.清空', '清空')}
                </button>
                <button type="button" className={s.btnPrimary} onClick={() => setGradeModalRowId(null)}>
                  {t('ui.确定', '确定')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* G16：设备数据一键填入 — 选时点 modal */}
      {showGenModal && (
        <div onClick={() => setShowGenModal(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-card)', borderRadius: 12, padding: 24,
            minWidth: 420, maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Cpu size={18} color="var(--color-primary)" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {t('ui.设备数据一键填入', '设备数据一键填入')}
              </h3>
            </div>
            <div style={{ padding: 12, background: 'var(--bg-muted)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
              <div>· {t('ui.饲料/用水', '饲料/用水')} = {t('ui.今日累计读数 − 昨日累计读数（当日用量）', '今日累计读数 − 昨日累计读数（当日用量）')}</div>
              <div>· {t('ui.温度/湿度', '温度/湿度')} = {t('ui.当日均值', '当日均值')}</div>
              <div>· {t('ui.填入晨班行；如需分摊到其它班次请手动拆分', '填入晨班行；如需分摊到其它班次请手动拆分')}</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>
                {t('ui.采集时点（0-23 小时，留空 = 全天 24h 累计）', '采集时点（0-23 小时，留空 = 全天 24h 累计）')}
              </label>
              <input
                type="number" min={0} max={23} step={1}
                value={genHour}
                onChange={e => {
                  const v = e.target.value;
                  if (v === '') { setGenHour(''); return; }
                  const n = Number(v);
                  if (!Number.isNaN(n) && n >= 0 && n <= 23) setGenHour(n);
                }}
                placeholder="17"
                className={s.inp}
                style={{ width: '100%', padding: '8px 12px', fontSize: 14 }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                {t('ui.建议每天 17:00 集蛋后采集一次', '建议每天 17:00 集蛋后采集一次')}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className={s.btnSecondary} onClick={() => setShowGenModal(false)}>
                {t('common.cancel', '取消')}
              </button>
              <button type="button" className={s.btnPrimary} onClick={handleGenerateFromDevice}>
                <Cpu size={14} />{t('common.confirm', '确认')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>;
}