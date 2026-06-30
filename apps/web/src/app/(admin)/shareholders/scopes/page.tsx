'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { shareholderApi, ShrScope, SCOPE_TYPE_LABEL, ORG_CODE_LABEL, lbl } from '@/lib/shareholder-api';
import { SummaryBar } from '../SummaryBar';
import u from "@/styles/uix-utils.module.css";
import { useLanguage } from "@/contexts/LanguageContext";
const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  background: 'var(--color-primary)',
  color: 'var(--text-on-dark)',
  fontSize: 13,
  fontWeight: 600
};
const td: React.CSSProperties = {
  padding: '9px 12px',
  borderBottom: '1px solid var(--border)',
  fontSize: 13
};
export default function ScopesPage() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<ShrScope[]>([]);
  const [names, setNames] = useState<Record<string, string>>({}); // shareholderCode → 股东姓名
  const [users, setUsers] = useState<Record<string, string>>({}); // userId → 真实姓名
  const [pmap, setPmap] = useState<Record<string, string>>({}); // projectCode → 项目名
  const [err, setErr] = useState('');
  useEffect(() => {
    shareholderApi.listScopes().then(setRows).catch(e => setErr(e?.message));
    shareholderApi.listShareholders().then(s => setNames(Object.fromEntries(s.map(x => [x.shareholderCode, x.shareholderName])))).catch(() => {});
    shareholderApi.listProjects().then(p => setPmap(Object.fromEntries(p.map(x => [x.projectCode, x.projectName])))).catch(() => {});

    // 加载用户真实姓名（用于非股东岗位人员显示）
    fetch('/api/generic-crud/sys_user?limit=200', {
      headers: {
        Authorization: `Bearer ${typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') || '' : ''}`
      }
    }).then(r => r.json()).then(d => {
      const arr: Array<{
        user_id: number;
        real_name: string;
      }> = d.data || d || [];
      setUsers(Object.fromEntries(arr.map(u => [String(u.user_id), u.real_name || ''])));
    }).catch(() => {});
  }, []);
  return <div>
      <PageHeader title={t('ui.股东查看范围','股东查看范围')} subtitle={t('ui.按项目/公司/场区授权查看权限；无 scope 的用户在驾驶舱看不到任何项目','按项目/公司/场区授权查看权限；无 scope 的用户在驾驶舱看不到任何项目')} />

      {err && <div style={{
      color: 'var(--status-danger)',
      marginBottom: 12,
      fontSize: 13
    }}>{err}</div>}

      <SummaryBar items={[{
      label: t('ui.查看范围绑定数','查看范围绑定数'),
      value: String(rows.length),
      accent: true
    }, {
      label: t('ui.可审批','可审批'),
      value: String(rows.filter(r => r.canApprove).length)
    }]} />

      <div style={{
      borderRadius: 10,
      overflow: 'hidden',
      border: '1px solid var(--border)'
    }}>
        <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        background: 'var(--bg-card)'
      }}>
          <thead>
            <tr>
              <th style={th}>{t('ui.用户','用户')}</th>
              <th style={th}>{t('ui.股东','股东')}</th>
              <th style={th}>{t('ui.范围类型','范围类型')}</th>
              <th style={th}>{t('ui.范围对象','范围对象')}</th>
              <th style={th}>{t('ui.项目','项目')}</th>
              <th style={th}>{t('ui.可审批','可审批')}</th>
              <th style={th}>{t('ui.状态','状态')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => {
            const shareholderName = s.shareholderCode ? names[s.shareholderCode] || s.shareholderCode : null;
            const realName = users[String(s.userId)] || `${t('ui.用户','用户')} ${s.userId}`;
            return <tr key={s.id}>
                  {/* 用户：显示真实姓名 */}
                  <td style={td}>
                    <span className={u.fw500}>{realName}</span>
                    <span style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  marginLeft: 6
                }}>
                      #{s.userId}
                    </span>
                  </td>
                  {/* 股东：有股东身份显示姓名，否则显示"岗位人员"标签 */}
                  <td style={td}>
                    {shareholderName ? <span className={u.fw500}>{shareholderName}</span> : <span style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'var(--bg-muted)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)'
                }}>
                        {t('ui.岗位人员','岗位人员')}
                      </span>}
                  </td>
                  <td style={td}>{lbl(SCOPE_TYPE_LABEL, s.scopeType)}</td>
                  <td style={td}>{s.scopeCode ? ORG_CODE_LABEL[s.scopeCode] || s.scopeCode : '—'}</td>
                  <td style={td}>{s.projectCode ? pmap[s.projectCode] || s.projectCode : '—'}</td>
                  <td style={td}>{s.canApprove ? t('ui.是','是') : t('ui.否','否')}</td>
                  <td style={td}>
                    <span style={{
                  fontSize: 12,
                  padding: '1px 8px',
                  borderRadius: 4,
                  fontWeight: 500,
                  background: s.status === 'ACTIVE' ? 'var(--status-success-bg)' : 'var(--bg-muted)',
                  color: s.status === 'ACTIVE' ? 'var(--status-success)' : 'var(--text-secondary)'
                }}>
                      {s.status === 'ACTIVE' ? t('ui.启用','启用') : s.status}
                    </span>
                  </td>
                </tr>;
          })}
            {rows.length === 0 && <tr>
                <td style={{
              ...td,
              textAlign: 'center',
              padding: 40,
              color: 'var(--text-secondary)'
            }} colSpan={7}>
                  {t('ui.暂无范围绑定','暂无范围绑定')}
                </td>
              </tr>}
          </tbody>
        </table>
      </div>
    </div>;
}