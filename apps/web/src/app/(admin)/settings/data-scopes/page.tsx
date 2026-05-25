'use client';

import { useEffect, useState, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { useToast } from '@/contexts/ToastContext';
import styles from '@/components/ui/admin-ui.module.css';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface DataScope {
  id: number;
  roleCode: string;
  moduleCode: string;
  scopeType: 'SELF' | 'PROJECT' | 'COMPANY' | 'REGION' | 'GROUP';
  enabled: boolean;
  createdAt: string;
}

const SCOPE_TYPE_LABELS: Record<string, string> = {
  SELF:    '个人',
  PROJECT: '项目',
  COMPANY: '公司',
  REGION:  '区域',
  GROUP:   '集团',
};

const SCOPE_TYPE_COLORS: Record<string, string> = {
  SELF:    '#6b7280',
  PROJECT: '#7c3aed',
  COMPANY: '#2563eb',
  REGION:  '#d97706',
  GROUP:   '#dc2626',
};

const ALL_SCOPE_TYPES = ['SELF', 'PROJECT', 'COMPANY', 'REGION', 'GROUP'] as const;

// ── 主组件 ────────────────────────────────────────────────────────────────────

export default function DataScopesPage() {
  const toast = useToast();
  const [scopes, setScopes] = useState<DataScope[]>([]);
  const [loading, setLoading] = useState(true);

  // 新增规则的表单状态
  const [newRoleCode, setNewRoleCode] = useState('');
  const [newModuleCode, setNewModuleCode] = useState('');
  const [newScopeType, setNewScopeType] = useState<string>('COMPANY');
  const [saving, setSaving] = useState(false);

  const fetchScopes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/org/data-scopes', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const json = await res.json();
      if (json.code === 200) {
        setScopes(json.data ?? []);
      } else {
        toast.error('加载数据范围规则失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchScopes(); }, [fetchScopes]);

  // 修改单条规则的 scopeType
  const handleUpdateScope = async (id: number, scopeType: string) => {
    try {
      const res = await fetch(`/api/org/data-scopes/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ scopeType }),
      });
      const json = await res.json();
      if (json.code === 200) {
        setScopes((prev) => prev.map((s) => s.id === id ? { ...s, scopeType: scopeType as DataScope['scopeType'] } : s));
        toast.success('更新成功');
      } else {
        toast.error('更新失败');
      }
    } catch {
      toast.error('网络错误');
    }
  };

  // 切换启用/禁用
  const handleToggleEnabled = async (scope: DataScope) => {
    try {
      const res = await fetch(`/api/org/data-scopes/${scope.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ enabled: !scope.enabled }),
      });
      const json = await res.json();
      if (json.code === 200) {
        setScopes((prev) => prev.map((s) => s.id === scope.id ? { ...s, enabled: !scope.enabled } : s));
        toast.success(scope.enabled ? '已禁用' : '已启用');
      }
    } catch {
      toast.error('操作失败');
    }
  };

  // 删除规则
  const handleDelete = async (id: number) => {
    if (!confirm('确认删除此数据范围规则？')) return;
    try {
      const res = await fetch(`/api/org/data-scopes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const json = await res.json();
      if (json.code === 200) {
        setScopes((prev) => prev.filter((s) => s.id !== id));
        toast.success('删除成功');
      }
    } catch {
      toast.error('删除失败');
    }
  };

  // 新增规则
  const handleCreate = async () => {
    if (!newRoleCode.trim() || !newModuleCode.trim()) {
      toast.error('角色编码和菜单编码为必填项');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/org/data-scopes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ roleCode: newRoleCode.trim(), moduleCode: newModuleCode.trim(), scopeType: newScopeType }),
      });
      const json = await res.json();
      if (json.code === 200) {
        toast.success('创建成功');
        setNewRoleCode('');
        setNewModuleCode('');
        setNewScopeType('COMPANY');
        await fetchScopes();
      } else {
        toast.error('创建失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  // 按模块分组
  const grouped = scopes.reduce<Record<string, DataScope[]>>((acc, s) => {
    (acc[s.moduleCode] = acc[s.moduleCode] ?? []).push(s);
    return acc;
  }, {});

  return (
    <div className={styles.pageContainer}>
      <PageHeader title="数据范围配置" subtitle="管理各角色在不同模块的数据可见范围（SELF / PROJECT / COMPANY / REGION / GROUP）" />

      {/* 新增规则表单 */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>新增数据范围规则</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label className={styles.formLabel}>角色编码</label>
            <input
              className={styles.formInput}
              placeholder="如 ROLE_PRC_BUYER"
              value={newRoleCode}
              onChange={(e) => setNewRoleCode(e.target.value)}
            />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label className={styles.formLabel}>菜单/模块编码</label>
            <input
              className={styles.formInput}
              placeholder="如 MENU_PRC2_ORDER"
              value={newModuleCode}
              onChange={(e) => setNewModuleCode(e.target.value)}
            />
          </div>
          <div style={{ minWidth: 120 }}>
            <label className={styles.formLabel}>范围等级</label>
            <select
              className={styles.formInput}
              value={newScopeType}
              onChange={(e) => setNewScopeType(e.target.value)}
            >
              {ALL_SCOPE_TYPES.map((t) => (
                <option key={t} value={t}>{t} — {SCOPE_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <button
            className={styles.btnPrimary}
            onClick={handleCreate}
            disabled={saving}
            style={{ marginBottom: 2 }}
          >
            {saving ? '保存中...' : '新增'}
          </button>
        </div>
      </div>

      {/* 规则列表（按模块分组） */}
      {loading ? (
        <div className={styles.loadingText}>加载中...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className={styles.emptyState}>暂无数据范围规则</div>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([moduleCode, rules]) => (
            <div key={moduleCode} className={styles.card} style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#64748b', fontFamily: 'monospace' }}>
                {moduleCode}
              </h4>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>角色编码</th>
                    <th>范围等级</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((s) => (
                    <tr key={s.id} style={{ opacity: s.enabled ? 1 : 0.5 }}>
                      <td>
                        <code style={{ fontSize: 12, background: '#f1f5f9', padding: '2px 6px', borderRadius: 3 }}>
                          {s.roleCode}
                        </code>
                      </td>
                      <td>
                        <select
                          value={s.scopeType}
                          style={{
                            fontSize: 13,
                            padding: '3px 8px',
                            borderRadius: 4,
                            border: `1px solid ${SCOPE_TYPE_COLORS[s.scopeType]}`,
                            color: SCOPE_TYPE_COLORS[s.scopeType],
                            background: '#fff',
                            cursor: 'pointer',
                          }}
                          onChange={(e) => handleUpdateScope(s.id, e.target.value)}
                        >
                          {ALL_SCOPE_TYPES.map((t) => (
                            <option key={t} value={t}>{t} — {SCOPE_TYPE_LABELS[t]}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 10, height: 10,
                            borderRadius: '50%',
                            background: s.enabled ? '#22c55e' : '#d1d5db',
                            marginRight: 6,
                          }}
                        />
                        {s.enabled ? '启用' : '禁用'}
                      </td>
                      <td>
                        <button
                          onClick={() => handleToggleEnabled(s)}
                          style={{
                            fontSize: 12, padding: '3px 10px', marginRight: 8,
                            border: '1px solid #e2e8f0', borderRadius: 4,
                            background: '#fff', cursor: 'pointer',
                          }}
                        >
                          {s.enabled ? '禁用' : '启用'}
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          style={{
                            fontSize: 12, padding: '3px 10px',
                            border: '1px solid #fca5a5', borderRadius: 4,
                            background: '#fff', color: '#ef4444', cursor: 'pointer',
                          }}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
      )}
    </div>
  );
}
