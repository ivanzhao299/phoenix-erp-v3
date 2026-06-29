'use client';

/**
 * /settings/notifications — 通知中心配置
 *
 * 4 Tab：规则 / 模板 / 渠道 / 投递日志
 */

import { useEffect, useState, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { useToast } from '@/contexts/ToastContext';
import s from '@/components/ui/admin-ui.module.css'; // G28: 表格样式全局化
import { Bell, FileText, Mail, ListChecks, Play, RefreshCw } from 'lucide-react';
import {
  primaryActionButton, secondaryActionButton, inputField, formLabel, inlineBadge,
  tableContainer, tabBar, tabItem, searchToolbar, toolbarFilterPill,
} from '@/components/design-system/cockpit-styles';
import usePermission from '@/hooks/usePermission';
import { useLanguage } from "@/contexts/LanguageContext";

const tok = () => (typeof window === 'undefined' ? '' : sessionStorage.getItem('phoenix_token') || '');
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` });

type TabKey = 'rules' | 'templates' | 'channels' | 'logs';

export default function NotificationConfigPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<TabKey>('rules');
  const notifyPerm = usePermission('MENU_SETTINGS_NOTIFY');
  if (!notifyPerm.canView) {
    return (
      <div>
        <PageHeader
          title={t('ui.通知设置','通知设置')}
          subtitle={t('ui.需要通知设置查看权限','需要通知设置查看权限')}
          breadcrumb={[t('ui.系统设置','系统设置'), t('ui.通知设置','通知设置')]}
        />
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>{t('ui.无权限访问通知设置','无权限访问通知设置')}</div>
      </div>
    );
  }
  return (
    <div>
      <PageHeader
        title={t('ui.通知设置','通知设置')}
        subtitle={t('ui.规则配置 · 模板管理 · 渠道开关 · 投递日志','规则配置 · 模板管理 · 渠道开关 · 投递日志')}
        breadcrumb={[t('ui.系统设置','系统设置'), t('ui.通知设置','通知设置')]}
      />
      <div style={tabBar}>
        <button style={tabItem(tab === 'rules')}      onClick={() => setTab('rules')}><Bell size={13} /> {t('ui.规则','规则')}</button>
        <button style={tabItem(tab === 'templates')}  onClick={() => setTab('templates')}><FileText size={13} /> {t('ui.模板','模板')}</button>
        <button style={tabItem(tab === 'channels')}   onClick={() => setTab('channels')}><Mail size={13} /> {t('ui.渠道','渠道')}</button>
        <button style={tabItem(tab === 'logs')}       onClick={() => setTab('logs')}><ListChecks size={13} /> {t('ui.投递日志','投递日志')}</button>
      </div>
      {tab === 'rules'     && <RulesTab canEdit={notifyPerm.canEdit} />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'channels'  && <ChannelsTab canEdit={notifyPerm.canEdit} />}
      {tab === 'logs'      && <LogsTab />}
    </div>
  );
}

function RulesTab({ canEdit }: { canEdit: boolean }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [rules, setRules] = useState<any[]>([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [testCtx, setTestCtx] = useState<Record<string, string>>({});
  const [testTarget, setTestTarget] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = category ? `?category=${category}` : '';
      const res = await fetch(`/api/notifications/config/rules${q}`, { headers: authHeaders() });
      setRules(await res.json());
    } catch { toast.error(t('ui.加载失败','加载失败')); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);
  useEffect(() => { load(); }, [load]);

  const toggleStatus = async (r: any) => {
    await fetch(`/api/notifications/config/rules/${r.rule_code}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ status: r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
    });
    toast.success(t('ui.已更新','已更新'));
    load();
  };

  const fireTest = async () => {
    if (!testTarget) return;
    try {
      const ctxObj = Object.fromEntries(Object.entries(testCtx).filter(([_, v]) => v));
      const res = await fetch(`/api/notifications/config/test/${testTarget}`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify(ctxObj),
      });
      const j = await res.json();
      if (j.ok) toast.success(t('ui.已触发，请到日志 Tab 查看','已触发，请到日志 Tab 查看'));
      else toast.error(t('ui.触发失败','触发失败'));
    } catch { toast.error(t('ui.网络错误','网络错误')); }
    setTestTarget(null); setTestCtx({});
  };

  return (
    <div>
      <div style={searchToolbar}>
        <button style={toolbarFilterPill(category === '')}               onClick={() => setCategory('')}>{t('ui.全部','全部')}</button>
        <button style={toolbarFilterPill(category === 'WORKFLOW')}       onClick={() => setCategory('WORKFLOW')}>{t('ui.工作流','工作流')}</button>
        <button style={toolbarFilterPill(category === 'BUSINESS_ALERT')} onClick={() => setCategory('BUSINESS_ALERT')}>{t('ui.业务告警','业务告警')}</button>
        <button style={toolbarFilterPill(category === 'DAILY_DIGEST')}   onClick={() => setCategory('DAILY_DIGEST')}>{t('ui.每日提醒','每日提醒')}</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('ui.共','共')} {rules.length} {t('ui.条','条')}</span>
        <button style={secondaryActionButton} onClick={load}><RefreshCw size={13} /> {t('ui.刷新','刷新')}</button>
      </div>
      <div style={tableContainer}>
        <table className={s.table}>
          <thead style={{ background: 'var(--bg-muted)' }}>
            <tr>
              <th>{t('ui.规则编码 / 名称','规则编码 / 名称')}</th>
              <th>{t('ui.分类','分类')}</th>
              <th>{t('ui.触发','触发')}</th>
              <th>{t('ui.接收人','接收人')}</th>
              <th>{t('ui.渠道','渠道')}</th>
              <th>{t('ui.状态','状态')}</th>
              <th style={{ textAlign: 'right' }}>{t('ui.操作','操作')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center' }}>{t('ui.加载中…','加载中…')}</td></tr>}
            {!loading && rules.length === 0 && <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>{t('ui.暂无规则','暂无规则')}</td></tr>}
            {rules.map(r => (
              <tr key={r.rule_code}>
                <td style={td}>
                  <div style={{ fontWeight: 600 }}>{r.rule_name}</div>
                  <code style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.rule_code}</code>
                </td>
                <td style={td}><span style={inlineBadge('default')}>{r.category}</span></td>
                <td style={td}>
                  <span style={inlineBadge(r.event_type === 'SCHEDULE' ? 'warning' : 'success')}>{r.event_type}</span>
                  <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-secondary)' }}>
                    {r.trigger_config?.cron || r.trigger_config?.biz_type || '—'}
                  </div>
                </td>
                <td style={td}>
                  <div style={{ fontSize: 12 }}>{r.recipient_strategy}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {r.recipient_config?.role_codes?.join(', ') ||
                     r.recipient_config?.user_ids?.join(', ') || t('ui.自动','自动')}
                  </div>
                </td>
                <td style={td}>
                  {(r.channels || []).map((c: string) => (
                    <span key={c} style={{ ...inlineBadge('default'), marginRight: 4, fontSize: 11 }}>{c}</span>
                  ))}
                </td>
                <td style={td}>
                  <span style={inlineBadge(r.status === 'ACTIVE' ? 'success' : 'default')}>
                    {r.status === 'ACTIVE' ? t('ui.启用','启用') : t('ui.禁用','禁用')}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {canEdit ? (
                    <>
                      <button style={{ ...secondaryActionButton, padding: '4px 10px', fontSize: 11, marginRight: 6, display: 'inline-flex' }}
                        onClick={() => toggleStatus(r)}>{r.status === 'ACTIVE' ? t('ui.禁用','禁用') : t('ui.启用','启用')}</button>
                      <button style={{ ...secondaryActionButton, padding: '4px 10px', fontSize: 11, display: 'inline-flex' }}
                        onClick={() => { setTestTarget(r.rule_code); setTestCtx({}); }}>
                        <Play size={11} /> {t('ui.试发','试发')}
                      </button>
                    </>
                  ) : <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t('ui.只读','只读')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {testTarget && (
        <div onClick={() => setTestTarget(null)} style={{
          position: 'fixed', inset: 0, background: 'var(--overlay-black-45)', zIndex: 10010,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: 480, maxWidth: '95vw', background: 'var(--bg-card)', borderRadius: 14, padding: 24,
          }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t('ui.试发：','试发：')}{testTarget}</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '8px 0 16px' }}>
              {t('ui.填写模板变量，空字段忽略。常用：biz_no / submitter_name / amount / currency','填写模板变量，空字段忽略。常用：biz_no / submitter_name / amount / currency')}
            </p>
            {['biz_no', 'submitter_name', 'subject', 'amount', 'currency', 'supplier_name'].map(k => (
              <div key={k} style={{ marginBottom: 10 }}>
                <label style={formLabel}>{k}</label>
                <input style={inputField} value={testCtx[k] || ''} onChange={e => setTestCtx({ ...testCtx, [k]: e.target.value })} />
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button style={secondaryActionButton} onClick={() => setTestTarget(null)}>{t('ui.取消','取消')}</button>
              <button style={primaryActionButton} onClick={fireTest}><Play size={13} /> {t('ui.触发','触发')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplatesTab() {
  const { t } = useLanguage();
  const toast = useToast();
  const [templates, setTemplates] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/notifications/config/templates', { headers: authHeaders() });
        setTemplates(await res.json());
      } catch { toast.error(t('ui.加载失败','加载失败')); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const grouped: Record<string, any[]> = {};
  templates.forEach(t => { (grouped[t.template_code] = grouped[t.template_code] || []).push(t); });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Object.entries(grouped).map(([code, items]) => (
        <div key={code} style={{ ...tableContainer, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <code style={{ fontWeight: 700, fontSize: 14 }}>{code}</code>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>· {items.length} {t('ui.个变体','个变体')}</span>
          </div>
          {items.map(t => (
            <div key={t.id} style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <span style={inlineBadge('default')}>{t.locale}</span>
                <span style={inlineBadge(t.channel === 'PUSH' ? 'success' : 'default')}>{t.channel}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{t.title_tmpl}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{t.content_tmpl}</div>
            </div>
          ))}
        </div>
      ))}
      {templates.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>{t('ui.暂无模板','暂无模板')}</div>}
    </div>
  );
}

function ChannelsTab({ canEdit }: { canEdit: boolean }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [channels, setChannels] = useState<any[]>([]);
  const load = async () => {
    try {
      const res = await fetch('/api/notifications/config/channels', { headers: authHeaders() });
      setChannels(await res.json());
    } catch { toast.error(t('ui.加载失败','加载失败')); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const toggle = async (c: any) => {
    await fetch(`/api/notifications/config/channels/${c.channel_code}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ enabled: !c.enabled }),
    });
    toast.success(t('ui.已更新','已更新'));
    load();
  };
  return (
    <div style={tableContainer}>
      <table className={s.table}>
        <thead style={{ background: 'var(--bg-muted)' }}>
          <tr>
            <th>{t('ui.渠道','渠道')}</th>
            <th>{t('ui.状态','状态')}</th>
            <th>{t('ui.每日限额','每日限额')}</th>
            <th>{t('ui.每分钟限额','每分钟限额')}</th>
            <th>{t('ui.说明','说明')}</th>
            <th style={{ textAlign: 'right' }}>{t('ui.操作','操作')}</th>
          </tr>
        </thead>
        <tbody>
          {channels.map(c => (
            <tr key={c.channel_code}>
              <td style={td}>
                <div style={{ fontWeight: 600 }}>{c.channel_name}</div>
                <code style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.channel_code}</code>
              </td>
              <td style={td}>
                <span style={inlineBadge(c.enabled ? 'success' : 'default')}>{c.enabled ? t('ui.启用','启用') : t('ui.禁用','禁用')}</span>
              </td>
              <td style={td}>{c.daily_quota}</td>
              <td style={td}>{c.rate_limit_per_min}</td>
              <td style={{ ...td, fontSize: 11, color: 'var(--text-secondary)' }}>{c.remark || '—'}</td>
              <td style={{ ...td, textAlign: 'right' }}>
                {canEdit ? (
                  <button style={{ ...secondaryActionButton, padding: '4px 12px', fontSize: 11, display: 'inline-flex' }}
                    onClick={() => toggle(c)}>{c.enabled ? t('ui.禁用','禁用') : t('ui.启用','启用')}</button>
                ) : <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t('ui.只读','只读')}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogsTab() {
  const { t } = useLanguage();
  const toast = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = status ? `?status=${status}` : '';
      const res = await fetch(`/api/notifications/config/logs${q}`, { headers: authHeaders() });
      setLogs(await res.json());
    } catch { toast.error(t('ui.加载失败','加载失败')); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={searchToolbar}>
        <button style={toolbarFilterPill(status === '')}        onClick={() => setStatus('')}>{t('ui.全部','全部')}</button>
        <button style={toolbarFilterPill(status === 'SENT')}    onClick={() => setStatus('SENT')}>{t('ui.已发','已发')}</button>
        <button style={toolbarFilterPill(status === 'FAILED')}  onClick={() => setStatus('FAILED')}>{t('ui.失败','失败')}</button>
        <button style={toolbarFilterPill(status === 'DEDUPED')} onClick={() => setStatus('DEDUPED')}>{t('ui.去重','去重')}</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('ui.共','共')} {logs.length} {t('ui.条','条')}</span>
        <button style={secondaryActionButton} onClick={load}><RefreshCw size={13} /> {t('ui.刷新','刷新')}</button>
      </div>
      <div style={tableContainer}>
        <table className={s.table} style={{ fontSize: 12 }}>
          <thead style={{ background: 'var(--bg-muted)' }}>
            <tr>
              <th>{t('ui.时间','时间')}</th>
              <th>{t('ui.规则','规则')}</th>
              <th>{t('ui.接收人','接收人')}</th>
              <th>{t('ui.渠道','渠道')}</th>
              <th>{t('ui.状态','状态')}</th>
              <th>{t('ui.标题','标题')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center' }}>{t('ui.加载中…','加载中…')}</td></tr>}
            {!loading && logs.length === 0 && <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>{t('ui.暂无日志','暂无日志')}</td></tr>}
            {logs.map(l => (
              <tr key={l.id}>
                <td style={td}>{new Date(l.created_at).toLocaleString('zh-CN', { hour12: false })}</td>
                <td style={td}><code style={{ fontSize: 11 }}>{l.rule_code}</code></td>
                <td style={td}>{l.recipient_user_id}</td>
                <td style={td}><span style={{ ...inlineBadge('default'), fontSize: 10 }}>{l.channel}</span></td>
                <td style={td}>
                  <span style={inlineBadge(
                    l.status === 'SENT' ? 'success' :
                    l.status === 'FAILED' ? 'danger' :
                    l.status === 'DEDUPED' ? 'warning' : 'default'
                  )}>{l.status}</span>
                </td>
                <td style={td}>
                  {l.title}
                  {l.last_error && <div style={{ fontSize: 11, color: 'var(--status-danger)', marginTop: 2 }}>{l.last_error}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// G28: th 局部对象删除，统一走 admin-ui.module.css .table th
const td: React.CSSProperties = { padding: '12px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };
