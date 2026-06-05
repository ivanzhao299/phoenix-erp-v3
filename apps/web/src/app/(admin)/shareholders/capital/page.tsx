'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { shareholderApi, ShrContribution, ShrProject, ShrShareholder, ShrEquity, ShrBeneficial, CapitalStats, SOURCE_TYPE_LABEL, SOURCE_TYPE_OPTIONS, CONTRIB_STATUS_LABEL, lbl } from '@/lib/shareholder-api';
import { PageHeaderV2, KpiCard, StatStripV2, DataTableV3, StatusBadge, DrawerV2, ConfirmDialogV2, FormField, SelectField, AmountInput, DateInput, AttachmentUploader, type ColumnV3 } from '@/components/design-system';
import { KPI_GRID } from '@/lib/design-tokens';
import { Wallet, TrendingUp, Clock, CheckCircle2, CalendarPlus, CalendarClock } from 'lucide-react';
import u from "@/styles/uix-utils.module.css";
const money = (v?: string | number | null) => v == null || v === '' ? '—' : Number(v).toLocaleString('zh-CN', {
  minimumFractionDigits: 2
});
const sum = (arr: any[], pick: (x: any) => number) => arr.reduce((a, x) => a + (pick(x) || 0), 0);
const yuan = (v: number) => '¥' + v.toLocaleString('zh-CN', {
  minimumFractionDigits: 2
});
export default function CapitalFlowPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ShrProject[]>([]);
  const [holders, setHolders] = useState<ShrShareholder[]>([]);
  const [rows, setRows] = useState<ShrContribution[]>([]);
  const [stats, setStats] = useState<CapitalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [names, setNames] = useState<Record<string, string>>({});
  const [pmap, setPmap] = useState<Record<string, string>>({});
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<any>({
    projectCode: '',
    shareholderCode: '',
    amount: '' as number | '',
    sourceType: 'BANK_TRANSFER',
    contributionDate: '',
    remark: '',
    attachmentUrls: [] as string[]
  });
  const [equity, setEquity] = useState<ShrEquity[]>([]);
  const [bene, setBene] = useState<ShrBeneficial[]>([]);
  const [projContribs, setProjContribs] = useState<ShrContribution[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [reverseTarget, setReverseTarget] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const reload = () => {
    setLoading(true);
    shareholderApi.listFlows().then(setRows).catch(e => setErr(e?.message)).finally(() => setLoading(false));
  };
  useEffect(() => {
    shareholderApi.listProjects().then(p => {
      setProjects(p);
      setPmap(Object.fromEntries(p.map(x => [x.projectCode, x.projectName])));
    });
    shareholderApi.listShareholders().then(s => {
      setHolders(s);
      setNames(Object.fromEntries(s.map(x => [x.shareholderCode, x.shareholderName])));
    });
    shareholderApi.capitalStats().then(setStats).catch(() => {});
    reload();
  }, []);

  // 选择项目后加载该项目股权/实益/出资，用于股东信息联动卡
  useEffect(() => {
    if (!form.projectCode) {
      setEquity([]);
      setBene([]);
      setProjContribs([]);
      return;
    }
    shareholderApi.listEquity(form.projectCode).then(setEquity).catch(() => setEquity([]));
    shareholderApi.listBeneficial(form.projectCode).then(setBene).catch(() => setBene([]));
    shareholderApi.listContributions(form.projectCode).then(setProjContribs).catch(() => setProjContribs([]));
  }, [form.projectCode]);

  // 当前选中股东的联动信息
  const linkInfo = useMemo(() => {
    if (!form.projectCode || !form.shareholderCode) return null;
    const eq = equity.find(e => e.shareholderCode === form.shareholderCode);
    const beneAmt = sum(bene.filter(b => b.beneficialShareholderCode === form.shareholderCode), b => Number(b.amount || 0));
    const myContribs = projContribs.filter(c => c.shareholderCode === form.shareholderCode && c.status === 'CONFIRMED');
    const last = myContribs.slice().sort((a, b) => (b.contributionDate || '').localeCompare(a.contributionDate || ''))[0];
    return {
      name: names[form.shareholderCode] || form.shareholderCode,
      projectName: pmap[form.projectCode] || form.projectCode,
      equityRatio: eq ? Number(eq.equityRatio) : null,
      equityStatus: eq?.equityStatus,
      paidIn: eq?.paidInCapital != null ? Number(eq.paidInCapital) : null,
      capitalRatio: eq?.capitalRatio != null ? Number(eq.capitalRatio) : null,
      beneAmt,
      lastDate: last?.contributionDate || null,
      lastAmount: last ? Number(last.amount) : null
    };
  }, [form.projectCode, form.shareholderCode, equity, bene, projContribs, names, pmap]);
  const act = async (fn: () => Promise<any>, ok: string) => {
    setErr('');
    setMsg('');
    try {
      await fn();
      setMsg(ok);
      reload();
    } catch (e: any) {
      setErr(e?.message || '操作失败');
    }
  };
  const create = () => act(async () => {
    if (!form.projectCode || !form.shareholderCode || !form.amount) throw new Error('请填写项目、股东、金额');
    await shareholderApi.createFlow({
      ...form,
      amount: Number(form.amount),
      attachmentUrls: form.attachmentUrls
    });
    setShowNew(false);
    setForm({
      projectCode: '',
      shareholderCode: '',
      amount: '',
      sourceType: 'BANK_TRANSFER',
      contributionDate: '',
      remark: '',
      attachmentUrls: []
    });
  }, '资本流草稿已创建');
  const doReverse = () => {
    const id = reverseTarget;
    if (!id) return;
    act(() => shareholderApi.reverseFlow(id, reverseReason), '已冲销，实缴已反向调整');
    setReverseTarget(null);
    setReverseReason('');
  };

  // KPI 计算
  const kpis = useMemo(() => {
    const totalProjectPaidIn = sum(projects, p => Number(p.totalPaidInCapital || p.paidInTotal || 0));
    const confirmedTotal = sum(rows.filter(r => r.status === 'CONFIRMED'), r => Number(r.amount || 0));
    const pendingApproval = sum(rows.filter(r => r.status === 'SUBMITTED'), r => Number(r.amount || 0));
    const pendingConfirm = sum(rows.filter(r => r.status === 'APPROVED'), r => Number(r.amount || 0));
    const monthAdded = stats?.monthAdded?.total ?? 0;
    const lastDate = rows.map(r => r.contributionDate || (r.createdAt || '').slice(0, 10)).filter(Boolean).sort().slice(-1)[0] || '—';
    return {
      totalProjectPaidIn,
      confirmedTotal,
      pendingApproval,
      pendingConfirm,
      monthAdded,
      lastDate
    };
  }, [projects, rows, stats]);
  const columns: ColumnV3<ShrContribution>[] = [{
    key: 'no',
    title: '资本流编号',
    render: f => <Link href={`/shareholders/capital/${f.id}`} style={{
      color: 'var(--color-accent)',
      fontWeight: 600
    }}>{f.capitalFlowNo || f.contributionNo}</Link>
  }, {
    key: 'projectCode',
    title: '项目',
    render: f => pmap[f.projectCode] || f.projectCode
  }, {
    key: 'shareholderCode',
    title: '股东',
    render: f => names[f.shareholderCode] || f.shareholderCode
  }, {
    key: 'amount',
    title: '金额',
    type: 'money',
    sortable: true
  }, {
    key: 'sourceType',
    title: '来源',
    render: f => lbl(SOURCE_TYPE_LABEL, f.sourceType)
  }, {
    key: 'attachmentCount',
    title: '附件',
    render: f => f.attachmentCount ? `📎 ${f.attachmentCount}` : '—'
  }, {
    key: 'status',
    title: '状态',
    render: f => <StatusBadge status={f.status} label={lbl(CONTRIB_STATUS_LABEL, f.status)} />
  }, {
    key: 'op',
    title: '操作',
    render: f => <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8
    }}>
          <Link href={`/shareholders/capital/${f.id}`} style={{
        color: 'var(--color-primary)',
        fontSize: 12.5
      }}>查看</Link>
          {f.status === 'DRAFT' && <Btn tone="info" onClick={() => act(() => shareholderApi.submitFlow(f.id), '已提交审批')}>提交审批</Btn>}
          {f.status === 'APPROVED' && <Btn tone="success" onClick={() => act(() => shareholderApi.confirmFlow(f.id), '已确认到账，实缴已汇总')}>确认到账</Btn>}
          {f.status === 'CONFIRMED' && <Btn tone="danger" onClick={() => {
        setReverseReason('');
        setReverseTarget(f.id);
      }}>冲销</Btn>}
        </span>
  }];
  return <div className={u.p24}>
      <PageHeaderV2 title="资本流管理" breadcrumb={[{
      label: '股东权益中心'
    }, {
      label: '资本流管理'
    }]} actions={<>
            <Btn tone="outline" onClick={() => router.push('/shareholders/capital/import')}>导入资本流</Btn>
            <Btn tone="primary" onClick={() => setShowNew(true)}>+ 新增资本流</Btn>
          </>} />

      {/* KPI 区 */}
      <div style={{
      ...KPI_GRID,
      marginBottom: 16
    }}>
        <KpiCard title="项目总实缴资本" value={`¥${money(kpis.totalProjectPaidIn)}`} subValue={`共 ${projects.length} 个项目`} icon={Wallet} accentColor="blue" />
        <KpiCard title="股东累计实缴(已确认)" value={`¥${money(kpis.confirmedTotal)}`} icon={CheckCircle2} accentColor="green" />
        <KpiCard title="待审批资本流金额" value={`¥${money(kpis.pendingApproval)}`} icon={Clock} accentColor="amber" />
        <KpiCard title="待确认资本流金额" value={`¥${money(kpis.pendingConfirm)}`} icon={CalendarClock} accentColor="violet" />
        <KpiCard title="本月新增资本流" value={`¥${money(kpis.monthAdded)}`} subValue={`${stats?.monthAdded?.count ?? 0} 笔`} icon={CalendarPlus} accentColor="teal" />
        <KpiCard title="最近资本流日期" value={kpis.lastDate} icon={TrendingUp} accentColor="indigo" />
      </div>

      <p style={{
      color: 'var(--text-secondary)',
      fontSize: 12.5,
      marginBottom: 12
    }}>资本变化来自业务流+审批流，仅「已确认到账」参与实缴汇总；不可直接修改余额。流程：草稿 → 提交审批 → 审批通过 → 确认到账（自动汇总）。</p>
      {msg && <div style={{
      color: 'var(--status-success)',
      marginBottom: 10
    }}>{msg}</div>}
      {err && <div style={{
      color: 'var(--status-danger)',
      marginBottom: 10
    }}>{err}</div>}

      <StatStripV2 items={[{
      label: '合计金额',
      value: yuan(sum(rows, r => Number(r.amount || 0))),
      accent: true
    }, {
      label: '已确认到账合计',
      value: yuan(sum(rows.filter(r => r.status === 'CONFIRMED'), r => Number(r.amount || 0)))
    }, {
      label: '记录笔数',
      value: String(rows.length)
    }]} />

      <DataTableV3 rows={rows} columns={columns} loading={loading} rowKey={f => f.id} pageSize={20} emptyText="暂无资本流记录" />

      {/* 新增资本流抽屉 */}
      <DrawerV2 open={showNew} title="新增资本流" width={620} onClose={() => setShowNew(false)} footer={<>
            <Btn tone="outline" onClick={() => setShowNew(false)}>取消</Btn>
            <Btn tone="success" onClick={create}>创建草稿</Btn>
          </>}>
        <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))',
        gap: 12
      }}>
          <FormField label="项目" required>
            <SelectField value={form.projectCode} onChange={v => setForm({
            ...form,
            projectCode: v,
            shareholderCode: ''
          })} options={projects.map(p => ({
            value: p.projectCode,
            label: p.projectName
          }))} placeholder="请选择" />
          </FormField>
          <FormField label="股东" required>
            <SelectField value={form.shareholderCode} onChange={v => setForm({
            ...form,
            shareholderCode: v
          })} options={holders.map(h => ({
            value: h.shareholderCode,
            label: h.shareholderName
          }))} placeholder="请选择" />
          </FormField>
          <FormField label="金额（元）" required>
            <AmountInput value={form.amount} onChange={v => setForm({
            ...form,
            amount: v
          })} />
          </FormField>
          <FormField label="出资来源">
            <SelectField value={form.sourceType} onChange={v => setForm({
            ...form,
            sourceType: v
          })} options={SOURCE_TYPE_OPTIONS.map(s => ({
            value: s,
            label: lbl(SOURCE_TYPE_LABEL, s)
          }))} allowEmpty={false} />
          </FormField>
          <FormField label="出资日期">
            <DateInput value={form.contributionDate} onChange={v => setForm({
            ...form,
            contributionDate: v
          })} />
          </FormField>
          <FormField label="备注">
            <input value={form.remark} onChange={e => setForm({
            ...form,
            remark: e.target.value
          })} style={{
            width: '100%',
            padding: '8px 11px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontSize: 13.5,
            outline: 'none'
          }} />
          </FormField>
        </div>

        {/* 股东信息联动只读卡 */}
        {linkInfo && <div style={{
        marginTop: 16,
        padding: '12px 16px',
        background: 'var(--bg-muted)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))',
        gap: 10
      }}>
            <div style={{
          gridColumn: '1 / -1',
          fontWeight: 700,
          color: 'var(--color-primary)',
          fontSize: 14
        }}>{linkInfo.name} · {linkInfo.projectName}</div>
            <KV k="股权比例" v={linkInfo.equityRatio != null ? `${linkInfo.equityRatio.toFixed(2)}%` : '—'} />
            <KV k="股权状态" v={linkInfo.equityStatus === 'CONFIRMED' ? '已确认股权' : linkInfo.equityStatus === 'PROVISIONAL' ? '暂定股权' : '—'} />
            <KV k="累计实缴" v={linkInfo.paidIn != null ? `¥${money(linkInfo.paidIn)}` : '—'} />
            <KV k="实缴占比" v={linkInfo.capitalRatio != null ? `${linkInfo.capitalRatio.toFixed(2)}%` : '—'} />
            <KV k="实益出资占比" v={linkInfo.beneAmt > 0 ? `¥${money(linkInfo.beneAmt)}` : '无代持'} />
            <KV k="最近出资日期" v={linkInfo.lastDate || '—'} />
            <KV k="最近出资金额" v={linkInfo.lastAmount != null ? `¥${money(linkInfo.lastAmount)}` : '—'} />
          </div>}

        {/* 附件上传 */}
        <div style={{
        marginTop: 16
      }}>
          <FormField label="附件（银行回单 / 付款截图 / 投资协议 / 分红决议 / 土地协议 / 设备采购单等，PDF/图片 ≤15MB）">
            <AttachmentUploader value={form.attachmentUrls} onChange={urls => setForm({
            ...form,
            attachmentUrls: urls
          })} />
          </FormField>
        </div>
      </DrawerV2>

      {/* 冲销确认 */}
      <ConfirmDialogV2 open={reverseTarget != null} title="冲销资本流" danger confirmLabel="确认冲销" message={<div>
            <div style={{
        marginBottom: 10
      }}>冲销后该笔实缴将反向调整，操作保留审计轨迹。请填写冲销原因：</div>
            <input value={reverseReason} onChange={e => setReverseReason(e.target.value)} placeholder="冲销原因" style={{
        width: '100%',
        padding: '8px 11px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        color: 'var(--text-primary)',
        fontSize: 13.5,
        outline: 'none'
      }} />
          </div>} onConfirm={doReverse} onCancel={() => {
      setReverseTarget(null);
      setReverseReason('');
    }} />
    </div>;
}
function KV({
  k,
  v
}: {
  k: string;
  v: string;
}) {
  return <div><div style={{
      fontSize: 11.5,
      color: 'var(--text-secondary)'
    }}>{k}</div><div style={{
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-primary)',
      marginTop: 2
    }}>{v}</div></div>;
}
function Btn({
  tone,
  onClick,
  children
}: {
  tone: 'primary' | 'success' | 'danger' | 'info' | 'outline';
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const map: Record<string, React.CSSProperties> = {
    primary: {
      background: 'var(--color-primary)',
      color: 'var(--text-on-dark)',
      border: 'none'
    },
    success: {
      background: 'var(--status-success)',
      color: 'var(--text-on-dark)',
      border: 'none'
    },
    danger: {
      background: 'var(--status-danger)',
      color: 'var(--text-on-dark)',
      border: 'none'
    },
    info: {
      background: 'var(--color-accent)',
      color: 'var(--text-on-dark)',
      border: 'none'
    },
    outline: {
      background: 'var(--bg-card)',
      color: 'var(--color-primary)',
      border: '1px solid var(--color-primary)'
    }
  };
  const big = tone === 'primary' || tone === 'outline' || tone === 'success';
  return <button onClick={onClick} style={{
    ...map[tone],
    padding: big ? '8px 16px' : '5px 12px',
    borderRadius: 'var(--radius-md)',
    fontWeight: 600,
    fontSize: big ? 14 : 12.5,
    cursor: 'pointer'
  }}>
      {children}
    </button>;
}