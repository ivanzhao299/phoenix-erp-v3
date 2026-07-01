'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
// P1-4 性能快修：xlsx 改为动态导入，不进入首屏 bundle，只在用户点击上传/下载时按需加载
import { shareholderApi, ShrProject, ShrShareholder, SOURCE_TYPE_LABEL } from '@/lib/shareholder-api';
import PageHeader from '@/components/PageHeader';
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermission } from '@/hooks/usePermission';
import u from "@/styles/uix-utils.module.css";
const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  background: 'var(--color-primary)',
  color: 'var(--text-on-dark)',
  fontSize: 12.5,
  fontWeight: 600
};
const td: React.CSSProperties = {
  padding: '7px 10px',
  borderBottom: '1px solid var(--border)',
  fontSize: 12.5
};

// 来源中文→编码（与 SOURCE_TYPE_LABEL 反向）
const SOURCE_REVERSE: Record<string, string> = Object.fromEntries(Object.entries(SOURCE_TYPE_LABEL).map(([code, zh]) => [zh, code]));
interface ParsedRow {
  projectName: string;
  shareholderName: string;
  amount: string;
  date: string;
  source: string;
  remark: string;
  projectCode?: string;
  shareholderCode?: string;
  sourceType?: string;
  errors: string[];
}
export default function CapitalImportPage() {
  const {
    t
  } = useLanguage();
  const shareholderPerm = usePermission('MENU_SHAREHOLDER_CAPITAL');
  const financeWriteRoles = new Set([
    'ROLE_ADMIN',
    'ROLE_FIN_CFO',
    'ROLE_FIN_ACCT',
    'ROLE_FIN_COST',
    'ROLE_GROUP_FINANCE',
    'ROLE_HQ_FINANCE',
    'ROLE_FACTORY_ACCOUNTANT',
    'ROLE_CASHIER',
    'ROLE_CASH',
    'ROLE_TREASURY_MANAGER',
    'ROLE_MENGSAI_DONGPENG_TREASURER',
  ]);
  const isFinanceOperator = shareholderPerm.isSuper || shareholderPerm.roles.some(role => financeWriteRoles.has(role));
  const [projects, setProjects] = useState<ShrProject[]>([]);
  const [holders, setHolders] = useState<ShrShareholder[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    ok: number;
    fail: number;
  } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    shareholderApi.listProjects().then(setProjects);
    shareholderApi.listShareholders().then(setHolders);
  }, []);
  const validRows = rows.filter(r => r.errors.length === 0);
  const invalidRows = rows.filter(r => r.errors.length > 0);
  const parse = (file: File) => {
    setErr('');
    setResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const XLSX = await import('xlsx'); // 动态加载，仅在用户实际上传文件时才下载 xlsx
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, {
          type: 'array'
        });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
          defval: ''
        });
        const pByName = new Map(projects.map(p => [p.projectName.trim(), p.projectCode]));
        const sByName = new Map(holders.map(h => [h.shareholderName.trim(), h.shareholderCode]));
        const parsed: ParsedRow[] = raw.map(r => {
          const projectName = String(r['项目'] ?? r['项目名称'] ?? '').trim();
          const shareholderName = String(r['股东'] ?? r['股东姓名'] ?? '').trim();
          const amount = String(r['金额'] ?? r['出资金额'] ?? '').trim();
          const date = normalizeDate(r['日期'] ?? r['出资日期'] ?? '', XLSX.SSF);
          const source = String(r['来源'] ?? r['出资来源'] ?? '').trim();
          const remark = String(r['备注'] ?? '').trim();
          const projectCode = pByName.get(projectName);
          const shareholderCode = sByName.get(shareholderName);
          const sourceType = source ? SOURCE_REVERSE[source] ?? source : 'BANK_TRANSFER';
          const errors: string[] = [];
          if (!projectName) errors.push(t('ui.项目为空', '项目为空'));else if (!projectCode) errors.push(`项目不存在: ${projectName}`);
          if (!shareholderName) errors.push(t('ui.股东为空', '股东为空'));else if (!shareholderCode) errors.push(`股东不存在: ${shareholderName}`);
          if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) errors.push(t('ui.金额无效', '金额无效'));
          return {
            projectName,
            shareholderName,
            amount,
            date,
            source,
            remark,
            projectCode,
            shareholderCode,
            sourceType,
            errors
          };
        });
        setRows(parsed);
        if (parsed.length === 0) setErr(t('ui.未解析到数据行（请检查表头：项目/股东/金额/日期/来源/备注）', '未解析到数据行（请检查表头：项目/股东/金额/日期/来源/备注）'));
      } catch (ex: any) {
        setErr(t('ui.解析失败：', '解析失败：') + (ex?.message || ex));
      }
    };
    reader.readAsArrayBuffer(file);
  };
  const doImport = async () => {
    setImporting(true);
    setErr('');
    setResult(null);
    let ok = 0,
      fail = 0;
    for (const r of validRows) {
      try {
        await shareholderApi.createFlow({
          projectCode: r.projectCode,
          shareholderCode: r.shareholderCode,
          amount: Number(r.amount),
          contributionDate: r.date || null,
          sourceType: r.sourceType,
          remark: r.remark || '历史资本流导入'
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setResult({
      ok,
      fail
    });
    setImporting(false);
  };
  const downloadTemplate = async () => {
    const XLSX = await import('xlsx'); // 动态加载，仅在用户点击下载模板时按需加载
    const ws = XLSX.utils.aoa_to_sheet([['项目', '股东', '金额', '日期', '来源', '备注'], ['孟赛蛋鸡养殖场', '赵永伟', 500000, '2025-05-12', '银行转账', '示例行（导入前请删除）']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '资本流');
    XLSX.writeFile(wb, '资本流导入模板.xlsx');
  };
  if (!isFinanceOperator) {
    return <div className={u.p24}>
      <Link href="/shareholders/capital" style={{
      color: 'var(--color-primary)',
      fontSize: 13
    }}>{t('ui.← 返回资本流列表', '← 返回资本流列表')}</Link>
      <div style={{ marginTop: 10 }}><PageHeader title={t('ui.导入资本流（Excel / CSV）', '导入资本流（Excel / CSV）')} /></div>
      <div style={{
      marginTop: 16,
      padding: 18,
      borderRadius: 'var(--radius-md)',
      border: '1px solid color-mix(in srgb,var(--status-warning) 35%,transparent)',
      background: 'color-mix(in srgb,var(--status-warning) 8%,var(--bg-card))',
      color: 'var(--text-secondary)',
      lineHeight: 1.7
    }}>
        {t('ui.当前账号仅可查看授权范围内资本流；批量导入、金额录入、确认到账、冲销等资金动作仅限财务角色或管理员操作。', '当前账号仅可查看授权范围内资本流；批量导入、金额录入、确认到账、冲销等资金动作仅限财务角色或管理员操作。')}
      </div>
    </div>;
  }
  return <div className={u.p24}>
      <Link href="/shareholders/capital" style={{
      color: 'var(--color-primary)',
      fontSize: 13
    }}>{t('ui.← 返回资本流列表', '← 返回资本流列表')}</Link>
      <div style={{ marginTop: 10 }}><PageHeader title={t('ui.导入资本流（Excel / CSV）', '导入资本流（Excel / CSV）')} /></div>
      <p style={{
      color: 'var(--text-secondary)',
      fontSize: 12.5,
      marginBottom: 16
    }}>
        {t('ui.历史资本流批量导入。表头：项目 / 股东 / 金额 / 日期 / 来源 / 备注。先预览校验（Dry Run），确认无误后导入；每条以', '历史资本流批量导入。表头：项目 / 股东 / 金额 / 日期 / 来源 / 备注。先预览校验（Dry Run），确认无误后导入；每条以')}<b>{t('ui.草稿', '草稿')}</b>{t('ui.状态创建，不覆盖已有资本流，仍需走正常审批→确认流程。', '状态创建，不覆盖已有资本流，仍需走正常审批→确认流程。')}
      </p>

      <div style={{
      display: 'flex',
      gap: 10,
      marginBottom: 16,
      flexWrap: 'wrap'
    }}>
        <button onClick={downloadTemplate} style={{
        padding: '8px 16px',
        borderRadius: 8,
        border: '1px solid var(--color-primary)',
        background: 'var(--bg-card)',
        color: 'var(--color-primary)',
        fontWeight: 600,
        cursor: 'pointer'
      }}>{t('ui.下载模板', '下载模板')}</button>
        <label style={{
        padding: '8px 16px',
        borderRadius: 8,
        border: 'none',
        background: 'var(--color-primary)',
        color: 'var(--text-on-dark)',
        fontWeight: 600,
        cursor: 'pointer'
      }}>
          {t('ui.选择文件（预览）', '选择文件（预览）')}
          <input type="file" accept=".xlsx,.xls,.csv" style={{
          display: 'none'
        }} onChange={e => {
          const f = e.target.files?.[0];
          if (f) parse(f);
        }} />
        </label>
        {fileName && <span style={{
        alignSelf: 'center',
        fontSize: 13,
        color: 'var(--text-secondary)'
      }}>{t('ui.已选：', '已选：')}{fileName}</span>}
      </div>

      {err && <div style={{
      color: 'var(--status-danger)',
      marginBottom: 12
    }}>{err}</div>}

      {rows.length > 0 && <>
          <div style={{
        display: 'flex',
        gap: 18,
        marginBottom: 12,
        fontSize: 14
      }}>
            <span>{t('ui.共 ', '共 ')}<b>{rows.length}</b>{t('ui. 行', ' 行')}</span>
            <span style={{
          color: 'var(--status-success)'
        }}>{t('ui.有效 ', '有效 ')}<b>{validRows.length}</b></span>
            <span style={{
          color: 'var(--status-danger)'
        }}>{t('ui.错误 ', '错误 ')}<b>{invalidRows.length}</b></span>
          </div>
          <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        background: 'var(--bg-card)',
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 16
      }}>
            <thead><tr>
              <th style={th}>#</th><th style={th}>{t('ui.项目', '项目')}</th><th style={th}>{t('ui.股东', '股东')}</th><th style={th}>{t('ui.金额', '金额')}</th>
              <th style={th}>{t('ui.日期', '日期')}</th><th style={th}>{t('ui.来源', '来源')}</th><th style={th}>{t('ui.备注', '备注')}</th><th style={th}>{t('ui.校验', '校验')}</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => <tr key={i} style={{
            background: r.errors.length ? 'color-mix(in srgb, var(--status-danger) 10%, transparent)' : 'var(--bg-card)'
          }}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>{r.projectName}</td>
                  <td style={td}>{r.shareholderName}</td>
                  <td style={td}>{r.amount}</td>
                  <td style={td}>{r.date || '—'}</td>
                  <td style={td}>{r.source || t('ui.银行转账', '银行转账')}</td>
                  <td style={td}>{r.remark || '—'}</td>
                  <td style={td}>{r.errors.length ? <span style={{
                color: 'var(--status-danger)'
              }}>{r.errors.join('；')}</span> : <span style={{
                color: 'var(--status-success)'
              }}>{t('ui.✓ 有效', '✓ 有效')}</span>}</td>
                </tr>)}
            </tbody>
          </table>

          <button onClick={doImport} disabled={importing || validRows.length === 0} style={{
        padding: '10px 24px',
        borderRadius: 8,
        border: 'none',
        background: validRows.length === 0 ? 'var(--text-disabled)' : 'var(--status-success)',
        color: 'var(--text-on-dark)',
        fontWeight: 600,
        cursor: validRows.length === 0 ? 'not-allowed' : 'pointer'
      }}>
            {importing ? t('ui.导入中…', '导入中…') : `确认导入 ${validRows.length} 条有效记录（创建草稿）`}
          </button>
          {invalidRows.length > 0 && <span style={{
        marginLeft: 12,
        fontSize: 12.5,
        color: 'var(--status-danger)'
      }}>{invalidRows.length}{t('ui. 条错误行将被跳过', ' 条错误行将被跳过')}</span>}
        </>}

      {result && <div style={{
      marginTop: 16,
      padding: '12px 16px',
      background: 'color-mix(in srgb, var(--status-success) 12%, transparent)',
      border: '1px solid var(--status-success)',
      borderRadius: 8
    }}>
          {t('ui.导入完成：成功 ', '导入完成：成功 ')}<b style={{
        color: 'var(--status-success)'
      }}>{result.ok}</b>{t('ui. 条，失败 ', ' 条，失败 ')}<b style={{
        color: 'var(--status-danger)'
      }}>{result.fail}</b>{t('ui. 条。', ' 条。')}
          <Link href="/shareholders/capital" style={{
        marginLeft: 12,
        color: 'var(--color-primary)'
      }}>{t('ui.返回查看 →', '返回查看 →')}</Link>
        </div>}
    </div>;
}

// normalizeDate 不依赖全局 XLSX（P1-4 动态导入后 XLSX 在 reader.onload 内按需传入）
function normalizeDate(v: any, xlsxSsf?: {
  parse_date_code: (n: number) => any;
}): string {
  if (!v) return '';
  if (typeof v === 'number' && xlsxSsf) {
    const d = xlsxSsf.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  return String(v).trim().replace(/\//g, '-');
}
