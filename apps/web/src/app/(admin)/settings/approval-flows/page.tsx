'use client';

/**
 * WF-2 W2-04: /settings/approval-flows — 流程配置中心
 *
 * 之前是 redirect 占位页；本次改为真实流程列表 + 启停 + 版本视图。
 * 数据源：/api/workflow/definitions（已上线）。
 *
 * 功能：
 *   - 列表：code / name / category / status / current_version_id / updated_at
 *   - 启用：POST /workflow/definitions/:id/publish
 *   - 停用：POST /workflow/definitions/:id/disable
 *   - 设计器入口：跳 /workflow/designer/[id]
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import request from '@/lib/api-client';
import { usePermission } from '@/hooks/usePermission';
import s from '@/components/ui/admin-ui.module.css';
import { primaryActionButton, secondaryActionButton, actionPill, toolbarFilterPill } from '@/components/design-system/cockpit-styles';
import u from "@/styles/uix-utils.module.css";
import { useLanguage } from "@/contexts/LanguageContext";
interface DefinitionRow {
  id: number;
  code: string;
  name: string;
  description?: string;
  category?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'DISABLED' | string;
  current_version_id?: number | null;
  created_at?: string;
  updated_at?: string;
}
const STATUS_FILTERS = [{
  label: '全部',
  value: ''
}, {
  label: '草稿',
  value: 'DRAFT'
}, {
  label: '已发布',
  value: 'PUBLISHED'
}, {
  label: '已停用',
  value: 'DISABLED'
}];
const STATUS_LABEL: Record<string, {
  text: string;
  color: string;
}> = {
  DRAFT: {
    text: '草稿',
    color: 'var(--text-secondary)'
  },
  PUBLISHED: {
    text: '已发布',
    color: 'var(--status-success)'
  },
  DISABLED: {
    text: '已停用',
    color: 'var(--text-disabled)'
  }
};
export default function ApprovalFlowsPage() {
  const { t } = useLanguage();
  const workflowPerm = usePermission('MENU_WORKFLOW_CONFIG');
  const canManageFlows = workflowPerm.check('E') || workflowPerm.check('C') || workflowPerm.check('D');
  const [rows, setRows] = useState<DefinitionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request<{
        code: number;
        data: DefinitionRow[];
        total: number;
      }>('/workflow/definitions');
      setRows(res.data || []);
    } catch (err) {
      console.error('[approval-flows] load failed:', err);
      setError(err instanceof Error ? `${t('ui.加载失败：','加载失败：')}${err.message}` : t('ui.加载流程列表失败','加载流程列表失败'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function toggleStatus(row: DefinitionRow) {
    const target = row.status === 'PUBLISHED' ? 'disable' : 'publish';
    const action = target === 'publish' ? t('ui.启用','启用') : t('ui.停用','停用');
    setError('');
    setNotice('');
    try {
      await request(`/workflow/definitions/${row.id}/${target}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      setNotice(`${action} ${row.code} ${t('ui.成功','成功')}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? `${action}${t('ui.失败：','失败：')}${err.message}` : `${action}${t('ui.失败','失败')}`);
    }
  }
  const filtered = filter ? rows.filter(r => r.status === filter) : rows;
  if (!canManageFlows) {
    return <div className={u.emptyPad40}>{t('ui.无权限访问流程配置。请联系系统管理员授予工作流管理权限。','无权限访问流程配置。请联系系统管理员授予工作流管理权限。')}</div>;
  }

  return <div>
      <PageHeader title={t('ui.流程配置中心','流程配置中心')} subtitle={t('ui.审批流程定义 · 启用/停用 · 版本管理','审批流程定义 · 启用/停用 · 版本管理')} breadcrumb={[t('ui.审批中心','审批中心'), t('ui.流程配置','流程配置')]} actions={<>
            <Link href="/workflow/builder" style={primaryActionButton}>{t('ui.新建流程','新建流程')}</Link>
            <Link href="/settings/approval-rules" style={{ ...secondaryActionButton, marginLeft: 8, textDecoration: "none" }}>{t('ui.审批规则','审批规则')}</Link>
          </>} />

      {error && <section className={s.card} style={{
      marginBottom: 12,
      borderLeft: '4px solid var(--status-danger)'
    }}>
          <div className={s.cardBody} style={{
        color: 'var(--status-danger)'
      }}>
            <strong>⚠ {t('ui.加载失败','加载失败')}</strong>
            <div style={{
          marginTop: 4,
          fontSize: 13
        }}>{error}</div>
            <button type="button" onClick={() => void load()} style={{ ...secondaryActionButton, marginTop: 8 }}>{t('ui.重试','重试')}</button>
          </div>
        </section>}

      {notice && <section className={s.card} style={{
      marginBottom: 12,
      borderLeft: '4px solid var(--status-success)'
    }}>
          <div className={s.cardBody} style={{
        color: 'var(--status-success)'
      }}>
            <strong>✓ </strong>{notice}
          </div>
        </section>}

      <section className={`${s.card} ${u.mb12}`}>
        <div className={s.cardBody} style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap'
      }}>
          <div>
            <h3 className={s.cardTitle}>{t('ui.流程列表','流程列表')}</h3>
            <p className={`${s.modalDesc} ${u.mt4}`}>
              {t('ui.当前共','当前共')} {rows.length} {t('ui.个流程定义','个流程定义')}{filter ? `（${t('ui.已筛选：','已筛选：')}${STATUS_LABEL[filter]?.text || filter}）` : ''}
            </p>
          </div>
          <div style={{
          display: 'flex',
          gap: 8
        }}>
            {STATUS_FILTERS.map(item => <button key={item.value || 'ALL'} type="button" className={`${s.tabPill} ${filter === item.value ? s.tabPillActive : ''}`} onClick={() => setFilter(item.value)}>
                {item.label}
              </button>)}
          </div>
        </div>
      </section>

      <section className={s.card}>
        {loading ? <div className={s.emptyState}>
            <div className={s.emptyStateText}>{t('ui.加载中…','加载中…')}</div>
          </div> : filtered.length === 0 ? <div className={s.emptyState}>
            <div className={s.emptyStateText}>
              {filter ? t('ui.当前筛选条件下没有流程','当前筛选条件下没有流程') : t('ui.尚未配置任何流程，点击"新建流程"开始','尚未配置任何流程，点击"新建流程"开始')}
            </div>
          </div> : <table className={s.table}>
            <thead>
              <tr>
                <th>{t('ui.编码','编码')}</th>
                <th>{t('ui.名称','名称')}</th>
                <th>{t('ui.分类','分类')}</th>
                <th>{t('ui.状态','状态')}</th>
                <th>{t('ui.当前版本','当前版本')}</th>
                <th>{t('ui.更新时间','更新时间')}</th>
                <th>{t('ui.操作','操作')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
            const status = STATUS_LABEL[row.status] || {
              text: row.status,
              color: 'var(--text-secondary)'
            };
            return <tr key={row.id}>
                    <td><code>{row.code}</code></td>
                    <td>
                      <strong>{row.name}</strong>
                      {row.description ? <div style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  marginTop: 2
                }}>{row.description}</div> : null}
                    </td>
                    <td>{row.category || '-'}</td>
                    <td>
                      <span style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'var(--bg-muted)',
                  color: status.color
                }}>{status.text}</span>
                    </td>
                    <td>{row.current_version_id ? `v${row.current_version_id}` : '-'}</td>
                    <td className={u.muted12}>
                      {row.updated_at ? new Date(row.updated_at).toLocaleString('zh-CN') : '-'}
                    </td>
                    <td>
                      <div style={{
                  display: 'flex',
                  gap: 8
                }}>
                        <Link href={`/workflow/designer/${row.id}`} style={{ ...secondaryActionButton, padding: '4px 10px', fontSize: 12, textDecoration: "none" }}>{t('ui.设计','设计')}</Link>
                        {row.status === 'PUBLISHED'
                          ? <button type="button" onClick={() => toggleStatus(row)} style={{ ...actionPill("danger"), padding: '4px 10px', fontSize: 12 }}>{t('ui.停用','停用')}</button>
                          : <button type="button" onClick={() => toggleStatus(row)} style={{ ...primaryActionButton, padding: '4px 10px', fontSize: 12 }}>{t('ui.启用','启用')}</button>}
                      </div>
                    </td>
                  </tr>;
          })}
            </tbody>
          </table>}
      </section>
    </div>;
}
