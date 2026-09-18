'use client';

/**
 * /settings/data-scopes — V3 RBAC 数据范围配置
 *
 * 管理"角色 × 模块 × 范围等级（SELF / PROJECT / COMPANY / REGION / GROUP）"的
 * 三维数据可见性矩阵。
 *
 * 改造点（GLP-1A-2 联调发现）：
 *   · 角色/菜单不再手填字符串，改 selector 从 sys_role + permissions/menus 拉取
 *   · 全 cockpit-styles 化（kpiCard / searchToolbar / tableContainer / drawer 系列）
 *   · 顶部 KPI 5 张统计各 scope 分布
 *   · 新增表单从顶部内联改为右侧抽屉
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import PageHeader from '@/components/PageHeader';
import { ConfirmDialogV2 } from '@/components/design-system';
import { useToast } from '@/contexts/ToastContext';
import { usePermission } from '@/hooks/usePermission';
import { Shield, Plus, Trash2, Power, Search, X, Users, Briefcase, Building2, Map, Globe } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';
import {
  primaryActionButton, secondaryActionButton,
  inputField, formLabel, inlineBadge,
  searchToolbar, toolbarFilterPill, toolbarSearchInput,
  tableContainer, kpiCard,
  drawerMask, drawerPanel, drawerHeader, drawerHeaderTitle, drawerCloseButton, drawerFooter,
} from '@/components/design-system/cockpit-styles';
import { useLanguage } from "@/contexts/LanguageContext";

// ── 类型 ────────────────────────────────────────────────────────────────────
interface DataScope {
  id: number;
  roleCode: string;
  moduleCode: string;
  scopeType: 'SELF' | 'PROJECT' | 'COMPANY' | 'REGION' | 'GROUP';
  enabled: boolean;
  createdAt: string;
}

interface SysRole { role_code: string; role_name_zh: string; role_type?: string; }
interface SysMenu { menu_code: string; menu_name_zh: string; domain: string; }
interface MenuGroup { domain: string; menus: SysMenu[]; }

type ScopeType = DataScope['scopeType'];

// ── 常量 ────────────────────────────────────────────────────────────────────
const SCOPE_TYPES: { code: ScopeType; label: string; tone: 'default' | 'success' | 'warning' | 'danger'; icon: typeof Users }[] = [
  { code: 'SELF',    label: '个人', tone: 'default', icon: Users },
  { code: 'PROJECT', label: '项目', tone: 'success', icon: Briefcase },
  { code: 'COMPANY', label: '公司', tone: 'default', icon: Building2 },
  { code: 'REGION',  label: '区域', tone: 'warning', icon: Map },
  { code: 'GROUP',   label: '集团', tone: 'danger',  icon: Globe },
];
const SCOPE_TONE: Record<ScopeType, 'default' | 'success' | 'warning' | 'danger'> = Object.fromEntries(
  SCOPE_TYPES.map(t => [t.code, t.tone])
) as Record<ScopeType, 'default' | 'success' | 'warning' | 'danger'>;

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${typeof window === 'undefined' ? '' : sessionStorage.getItem('phoenix_token') || ''}`,
});

// ── 组件 ────────────────────────────────────────────────────────────────────
export default function DataScopesPage() {
  const { t } = useLanguage();
  const toast = useToast();
  const { canView, canCreate, canEdit, canDelete } = usePermission('MENU_SETTINGS_DATA_SCOPE');
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [scopes, setScopes]       = useState<DataScope[]>([]);
  const [roles, setRoles]         = useState<SysRole[]>([]);
  const [menus, setMenus]         = useState<SysMenu[]>([]);
  const [loading, setLoading]     = useState(true);

  const [keyword, setKeyword]     = useState('');
  const [scopeFilter, setScopeFilter] = useState<ScopeType | ''>('');
  const [enabledFilter, setEnabledFilter] = useState<'ALL' | 'ENABLED' | 'DISABLED'>('ALL');

  const [showCreate, setShowCreate] = useState(false);
  const [newRoleCode, setNewRoleCode] = useState('');
  const [newModuleCode, setNewModuleCode] = useState('');
  const [newScopeType, setNewScopeType] = useState<ScopeType>('COMPANY');
  const [saving, setSaving] = useState(false);

  const [delId, setDelId] = useState<number | null>(null);

  // ── 数据加载 ──────────────────────────────────────────────────────────────
  const fetchScopes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/org/data-scopes', { headers: authHeaders() });
      const json = await res.json();
      if (json.code === 200) setScopes(json.data ?? []);
      else toastRef.current.error(t('ui.加载数据范围规则失败','加载数据范围规则失败'));
    } catch { toastRef.current.error(t('ui.网络错误','网络错误')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    fetchScopes();
    // 角色 + 菜单 selector 数据
    (async () => {
      try {
        const [rolesRes, menusRes] = await Promise.all([
          fetch('/api/crud/sys_role', { headers: authHeaders() }).then(r => r.json()),
          fetch('/api/permissions/menus', { headers: authHeaders() }).then(r => r.json()),
        ]);
        if (Array.isArray(rolesRes)) setRoles(rolesRes);
        else if (Array.isArray(rolesRes?.data)) setRoles(rolesRes.data);
        const menuGroups: MenuGroup[] = menusRes?.data || menusRes || [];
        const flat: SysMenu[] = [];
        menuGroups.forEach(g => g.menus?.forEach(m => flat.push(m)));
        setMenus(flat);
      } catch { /* selector 加载失败不阻塞主功能 */ }
    })();
  }, [canView, fetchScopes]);

  // ── 操作 ──────────────────────────────────────────────────────────────────
  const handleUpdateScope = async (id: number, scopeType: string) => {
    try {
      const res = await fetch(`/api/org/data-scopes/${id}`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ scopeType }),
      });
      const json = await res.json();
      if (json.code === 200) {
        setScopes(prev => prev.map(x => x.id === id ? { ...x, scopeType: scopeType as ScopeType } : x));
        toast.success(t('ui.范围已更新','范围已更新'));
      } else toast.error(t('ui.更新失败','更新失败'));
    } catch { toast.error(t('ui.网络错误','网络错误')); }
  };

  const handleToggle = async (sc: DataScope) => {
    try {
      const res = await fetch(`/api/org/data-scopes/${sc.id}`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ enabled: !sc.enabled }),
      });
      const json = await res.json();
      if (json.code === 200) {
        setScopes(prev => prev.map(x => x.id === sc.id ? { ...x, enabled: !sc.enabled } : x));
        toast.success(sc.enabled ? t('ui.已禁用','已禁用') : t('ui.已启用','已启用'));
      }
    } catch { toast.error(t('ui.操作失败','操作失败')); }
  };

  const doDelete = async () => {
    const id = delId; setDelId(null);
    if (id == null) return;
    try {
      const res = await fetch(`/api/org/data-scopes/${id}`, { method: 'DELETE', headers: authHeaders() });
      const json = await res.json();
      if (json.code === 200) {
        setScopes(prev => prev.filter(x => x.id !== id));
        toast.success(t('ui.删除成功','删除成功'));
      }
    } catch { toast.error(t('ui.删除失败','删除失败')); }
  };

  const handleCreate = async () => {
    if (!newRoleCode || !newModuleCode) {
      toast.error(t('ui.请选择角色和菜单','请选择角色和菜单'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/org/data-scopes', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ roleCode: newRoleCode, moduleCode: newModuleCode, scopeType: newScopeType }),
      });
      const json = await res.json();
      if (json.code === 200) {
        toast.success(t('ui.创建成功','创建成功'));
        setNewRoleCode(''); setNewModuleCode(''); setNewScopeType('COMPANY');
        setShowCreate(false);
        fetchScopes();
      } else toast.error(json.message || t('ui.创建失败','创建失败'));
    } catch { toast.error(t('ui.网络错误','网络错误')); }
    finally { setSaving(false); }
  };

  // ── 派生 ──────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return scopes.filter(x => {
      if (scopeFilter && x.scopeType !== scopeFilter) return false;
      if (enabledFilter === 'ENABLED' && !x.enabled) return false;
      if (enabledFilter === 'DISABLED' && x.enabled) return false;
      if (kw && !`${x.roleCode} ${x.moduleCode}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [scopes, keyword, scopeFilter, enabledFilter]);

  const stats = useMemo(() => {
    const total = scopes.length;
    const enabled = scopes.filter(x => x.enabled).length;
    const byScope = SCOPE_TYPES.reduce<Record<ScopeType, number>>(
      (acc, t) => { acc[t.code] = scopes.filter(x => x.scopeType === t.code).length; return acc; },
      { SELF: 0, PROJECT: 0, COMPANY: 0, REGION: 0, GROUP: 0 }
    );
    return { total, enabled, byScope };
  }, [scopes]);

  // 角色名 / 菜单名映射（用于显示）
  const roleNameMap = useMemo(() => Object.fromEntries(roles.map(r => [r.role_code, r.role_name_zh])), [roles]);
  const menuNameMap = useMemo(() => Object.fromEntries(menus.map(m => [m.menu_code, m.menu_name_zh])), [menus]);

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  if (!canView) {
    return <div className="text-text-muted" style={{ padding: 40, textAlign: 'center' }}>{t('ui.无权限查看数据范围规则','无权限查看数据范围规则')}</div>;
  }

  return <div>
      <PageHeader
        title={t('ui.数据范围配置','数据范围配置')}
        subtitle={t('ui.数据可见性第2层·范围等级：角色 × 模块 → SELF / PROJECT / COMPANY / REGION / GROUP（第1层功能权限见「角色与权限」，第3层组织归属见「用户管理」）','数据可见性第2层·范围等级：角色 × 模块 → SELF / PROJECT / COMPANY / REGION / GROUP（第1层功能权限见「角色与权限」，第3层组织归属见「用户管理」）')}
        breadcrumb={[t('ui.系统设置','系统设置'), t('ui.数据范围','数据范围')]}
        actions={canCreate ? (
          <button onClick={() => setShowCreate(true)} style={primaryActionButton}>
            <Plus size={13} /> {t('ui.新增规则','新增规则')}
          </button>
        ) : null}
      />

      {/* KPI 顶卡 — 总数 + 5 个 scope 分布 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={kpiCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={14} color="var(--color-primary)" />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{t('ui.总规则数','总规则数')}</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2, marginTop: 2 }}>
            {stats.total}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 'auto' }}>
            启用 {stats.enabled} / 禁用 {stats.total - stats.enabled}
          </div>
        </div>
        {SCOPE_TYPES.map(t => {
          const Icon = t.icon;
          return (
            <div key={t.code} style={kpiCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon size={14} color={`var(--status-${t.tone === 'default' ? 'info' : t.tone})`} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{t.label} · {t.code}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2, marginTop: 2 }}>
                {stats.byScope[t.code]}
              </div>
            </div>
          );
        })}
      </div>

      {/* 工具栏 — 搜索 + scope 过滤 + 启用过滤 */}
      <div style={searchToolbar}>
        <Search size={14} color="var(--text-secondary)" />
        <input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder={t('ui.搜索 ROLE_/ MENU_ 编码…','搜索 ROLE_/ MENU_ 编码…')}
          style={toolbarSearchInput}
        />

        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

        <button onClick={() => setScopeFilter('')} style={toolbarFilterPill(scopeFilter === '')}>{t('ui.全部','全部')}</button>
        {SCOPE_TYPES.map(t => (
          <button key={t.code} onClick={() => setScopeFilter(t.code)} style={toolbarFilterPill(scopeFilter === t.code)}>
            {t.code}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

        <button onClick={() => setEnabledFilter('ALL')}      style={toolbarFilterPill(enabledFilter === 'ALL')}>{t('ui.全部状态','全部状态')}</button>
        <button onClick={() => setEnabledFilter('ENABLED')}  style={toolbarFilterPill(enabledFilter === 'ENABLED')}>{t('ui.启用','启用')}</button>
        <button onClick={() => setEnabledFilter('DISABLED')} style={toolbarFilterPill(enabledFilter === 'DISABLED')}>{t('ui.禁用','禁用')}</button>

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {filtered.length} / {scopes.length} {t('ui.条','条')}
        </span>
      </div>

      {/* 表格 */}
      <div style={tableContainer}>
        <div style={{ overflowX: 'auto' }}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>{t('ui.角色','角色')}</th>
                <th>{t('ui.菜单 / 模块','菜单 / 模块')}</th>
                <th>{t('ui.范围等级','范围等级')}</th>
                <th>{t('ui.状态','状态')}</th>
                <th>{t('ui.创建时间','创建时间')}</th>
                <th style={{ textAlign: 'right' }}>{t('ui.操作','操作')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>{t('ui.加载中…','加载中…')}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                  {scopes.length === 0 ? t('ui.暂无数据范围规则，点击右上"新增规则"开始配置','暂无数据范围规则，点击右上"新增规则"开始配置') : t('ui.无匹配结果，调整筛选条件试试','无匹配结果，调整筛选条件试试')}
                </td></tr>
              ) : (
                filtered.map(sc => (
                  <tr key={sc.id} style={{ opacity: sc.enabled ? 1 : 0.55 }}>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {roleNameMap[sc.roleCode] || sc.roleCode}
                      </div>
                      <code style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{sc.roleCode}</code>
                    </td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {menuNameMap[sc.moduleCode] || sc.moduleCode}
                      </div>
                      <code style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{sc.moduleCode}</code>
                    </td>
                    <td>
                      <select
                        value={sc.scopeType}
                        onChange={e => handleUpdateScope(sc.id, e.target.value)}
                        style={{ ...inlineBadge(SCOPE_TONE[sc.scopeType]), fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}
                      >
                        {SCOPE_TYPES.map(t => <option key={t.code} value={t.code}>{t.code} — {t.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <span style={inlineBadge(sc.enabled ? 'success' : 'default')}>
                        {sc.enabled ? t('ui.启用','启用') : t('ui.禁用','禁用')}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {sc.createdAt ? new Date(sc.createdAt).toLocaleString('zh-CN', { hour12: false }) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canEdit && (
                        <button onClick={() => handleToggle(sc)} style={{ ...secondaryActionButton, display: 'inline-flex', padding: '5px 12px', fontSize: 12, marginRight: 6 }}>
                          <Power size={12} /> {sc.enabled ? t('ui.禁用','禁用') : t('ui.启用','启用')}
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setDelId(sc.id)} style={{ ...secondaryActionButton, display: 'inline-flex', padding: '5px 12px', fontSize: 12, color: 'var(--status-danger)', borderColor: 'var(--status-danger)' }}>
                          <Trash2 size={12} /> {t('ui.删除','删除')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 新增抽屉 */}
      {showCreate && (
        <div style={drawerMask} onClick={() => setShowCreate(false)}>
          <div style={drawerPanel(440)} onClick={e => e.stopPropagation()}>
            <div style={drawerHeader}>
              <div style={drawerHeaderTitle}>
                <Shield size={16} /> {t('ui.新增数据范围规则','新增数据范围规则')}
              </div>
              <button onClick={() => setShowCreate(false)} style={drawerCloseButton}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={formLabel}>{t('ui.角色','角色')}</label>
                <select value={newRoleCode} onChange={e => setNewRoleCode(e.target.value)} style={inputField}>
                  <option value="">{t('ui.请选择角色','请选择角色')}</option>
                  {roles.map(r => (
                    <option key={r.role_code} value={r.role_code}>
                      {r.role_name_zh}（{r.role_code}）
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={formLabel}>{t('ui.菜单 / 模块','菜单 / 模块')}</label>
                <select value={newModuleCode} onChange={e => setNewModuleCode(e.target.value)} style={inputField}>
                  <option value="">{t('ui.请选择菜单','请选择菜单')}</option>
                  {menus.map(m => (
                    <option key={m.menu_code} value={m.menu_code}>
                      [{m.domain}] {m.menu_name_zh}（{m.menu_code}）
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={formLabel}>{t('ui.范围等级','范围等级')}</label>
                <select value={newScopeType} onChange={e => setNewScopeType(e.target.value as ScopeType)} style={inputField}>
                  {SCOPE_TYPES.map(t => (
                    <option key={t.code} value={t.code}>{t.code} — {t.label}</option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
                  {t('ui.· SELF：仅本人创建的数据','· SELF：仅本人创建的数据')}<br />
                  {t('ui.· PROJECT：本人所在项目','· PROJECT：本人所在项目')}<br />
                  {t('ui.· COMPANY：本人所属公司','· COMPANY：本人所属公司')}<br />
                  {t('ui.· REGION：本人所属区域','· REGION：本人所属区域')}<br />
                  {t('ui.· GROUP：全集团（最大范围）','· GROUP：全集团（最大范围）')}
                </div>
              </div>
            </div>

            <div style={drawerFooter}>
              <button onClick={() => setShowCreate(false)} style={secondaryActionButton}>{t('ui.取消','取消')}</button>
              <button onClick={handleCreate} disabled={saving} style={{ ...primaryActionButton, opacity: saving ? 0.6 : 1 }}>
                {saving ? t('ui.保存中…','保存中…') : t('ui.创建','创建')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialogV2
        open={delId != null}
        title={t('ui.删除数据范围规则','删除数据范围规则')}
        danger
        confirmLabel={t('ui.确认删除','确认删除')}
        message={t('ui.确认删除此数据范围规则？此操作不可撤销，可能影响相关角色的数据可见范围。','确认删除此数据范围规则？此操作不可撤销，可能影响相关角色的数据可见范围。')}
        onConfirm={doDelete}
        onCancel={() => setDelId(null)}
      />
    </div>;
}
