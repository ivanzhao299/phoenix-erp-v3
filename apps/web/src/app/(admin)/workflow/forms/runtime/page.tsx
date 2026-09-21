'use client';

// G28：替换 sonner 第三方 toast → 项目 useToast 统一（全局化收口）
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Plus, RefreshCw, ChevronRight, CheckCircle, Clock, Tag, Send, Eye, ArrowRight } from 'lucide-react';
import { WorkflowFormRenderer } from '@/components/workflow/WorkflowFormRenderer';
import type { FormSchema, UiSchema } from '@/components/workflow/WorkflowFormRenderer';
import PageHeader from '@/components/PageHeader';
import { useToast } from '@/contexts/ToastContext';
import { ModalV2 } from '@/components/design-system/dialogs/ModalV2';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from "@/contexts/LanguageContext";
import ui from "@/components/ui/admin-ui.module.css";

// ── 类型 ──────────────────────────────────────────────────────────────────────
import u from "@/styles/uix-utils.module.css";
interface FormDef {
  id: number;
  code: string;
  name: string;
  biz_type: string | null;
  module_code: string | null;
  category: string | null;
  remark: string | null;
  status: string;
  current_version_id: number | null;
  created_at: string;
  updated_at: string;
}
interface FormVersion {
  id: number;
  form_id: number;
  version_no: number;
  status: string;
  schema_json: FormSchema;
  ui_schema_json: UiSchema;
  validation_json: Record<string, unknown>;
  published_at: string | null;
  created_at: string;
}

function parseLivePreview(schemaText: string, uiSchemaText: string): { schema: FormSchema; uiSchema: UiSchema } | null {
  try {
    return {
      schema: JSON.parse(schemaText) as FormSchema,
      uiSchema: uiSchemaText.trim() ? JSON.parse(uiSchemaText) as UiSchema : {},
    };
  } catch {
    return null;
  }
}

// ── API ───────────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}
async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {})
    }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── 小组件 ────────────────────────────────────────────────────────────────────

function Badge({
  label,
  color
}: {
  label: string;
  color: string;
}) {
  return <span style={{
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 20,
    background: `${color}18`,
    color,
    border: `1px solid ${color}40`
  }}>{label}</span>;
}
function statusColor(s: string) {
  if (s === 'ACTIVE' || s === 'PUBLISHED') return 'var(--status-success)';
  if (s === 'DRAFT') return 'var(--status-warning)';
  return 'var(--text-disabled)';
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function WorkflowFormRuntimePage() {
  const {
    t
  } = useLanguage();
  const router = useRouter();
  const toast = useToast(); // G28：项目 useToast 替换 sonner
  const workflowPerm = usePermission('MENU_WORKFLOW_FORM');
  const canManageForms = workflowPerm.check('E') || workflowPerm.check('C') || workflowPerm.check('D');

  // ── 列表状态 ──
  const [forms, setForms] = useState<FormDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  // ── 选中表单 + 版本 ──
  const [selected, setSelected] = useState<FormDef | null>(null);
  const [versions, setVersions] = useState<FormVersion[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── 新建表单弹窗 ──
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    code: '',
    name: '',
    bizType: '',
    moduleCode: '',
    category: '',
    remark: ''
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // ── 新建版本弹窗 ──
  const [showVersion, setShowVersion] = useState(false);
  const [schemaText, setSchemaText] = useState('');
  const [uiSchemaText, setUiSchemaText] = useState('');
  const [savingVer, setSavingVer] = useState(false);
  const [verError, setVerError] = useState('');

  // ── 预览 ──
  const [previewVer, setPreviewVer] = useState<FormVersion | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown>>({});
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});

  // ── 发布 ──
  const [publishing, setPublishing] = useState(false);

  // ── 加载列表 ──────────────────────────────────────────────────────────────

  const loadForms = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{
        items: FormDef[];
        total: number;
      }>('/api/workflow/forms?pageSize=50');
      setForms(res.items ?? []);
      setTotal(res.total ?? 0);
      setRefreshedAt(new Date());
    } catch (e: any) {
      setError(e.message ?? t('ui.加载失败', '加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    loadForms();
  }, [loadForms]);

  // ── 加载表单详情 ────────────────────────────────────────────────────────────

  const loadDetail = useCallback(async (form: FormDef) => {
    setSelected(form);
    setVersions([]);
    setPreviewVer(null);
    setDetailLoading(true);
    try {
      const res = await apiFetch<{
        form: FormDef;
        currentVersion: FormVersion | null;
        versions: FormVersion[];
      }>(`/api/workflow/forms/${form.code}`);
      setSelected(res.form);
      setVersions(res.versions ?? []);
      if (res.currentVersion) {
        setPreviewVer(res.currentVersion);
        setPreviewData({});
      }
    } catch (e: any) {
      // ignore
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ── 创建表单 ────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!createForm.code || !createForm.name) {
      setCreateError(t('ui.表单代码和名称为必填', '表单代码和名称为必填'));
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      await apiFetch('/api/workflow/forms', {
        method: 'POST',
        body: JSON.stringify(createForm)
      });
      setShowCreate(false);
      setCreateForm({
        code: '',
        name: '',
        bizType: '',
        moduleCode: '',
        category: '',
        remark: ''
      });
      await loadForms();
    } catch (e: any) {
      setCreateError(e.message ?? t('ui.创建失败', '创建失败'));
    } finally {
      setCreating(false);
    }
  };

  // ── 创建版本 ────────────────────────────────────────────────────────────────

  const handleCreateVersion = async () => {
    if (!selected) return;
    setVerError('');
    let schemaJson: FormSchema, uiSchemaJson: UiSchema;
    try {
      schemaJson = JSON.parse(schemaText);
      uiSchemaJson = uiSchemaText.trim() ? JSON.parse(uiSchemaText) : {};
    } catch {
      setVerError(t('ui.JSON 格式错误，请检查输入', 'JSON 格式错误，请检查输入'));
      return;
    }
    setSavingVer(true);
    try {
      await apiFetch(`/api/workflow/forms/${selected.id}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          schemaJson,
          uiSchemaJson
        })
      });
      setShowVersion(false);
      await loadDetail(selected);
    } catch (e: any) {
      setVerError(e.message ?? t('ui.创建版本失败', '创建版本失败'));
    } finally {
      setSavingVer(false);
    }
  };

  // ── 发布版本 ────────────────────────────────────────────────────────────────

  const handlePublish = async (versionId: number) => {
    if (!selected) return;
    setPublishing(true);
    try {
      await apiFetch(`/api/workflow/forms/versions/${versionId}/publish`, {
        method: 'POST'
      });
      await loadDetail(selected);
    } catch (e: any) {
      toast.error(`发布失败：${e.message}`);
    } finally {
      setPublishing(false);
    }
  };

  // ── 新建版本弹窗的初始化 ────────────────────────────────────────────────────

  const openVersionModal = () => {
    // 以当前发布版本的 schema 作为默认值
    const current = versions.find(v => v.status === 'PUBLISHED') ?? versions[0];
    setSchemaText(current ? JSON.stringify(current.schema_json, null, 2) : JSON.stringify({
      type: 'object',
      required: [],
      properties: {}
    }, null, 2));
    setUiSchemaText(current ? JSON.stringify(current.ui_schema_json ?? {}, null, 2) : '{}');
    setVerError('');
    setShowVersion(true);
  };

  // ── 实时预览 ────────────────────────────────────────────────────────────────

  let previewSchema: FormSchema | null = null;
  let previewUiSchema: UiSchema = {};
  if (previewVer) {
    previewSchema = previewVer.schema_json;
    previewUiSchema = previewVer.ui_schema_json ?? {};
  }
  const livePreview = parseLivePreview(schemaText, uiSchemaText);

  // ── 渲染 ────────────────────────────────────────────────────────────────────

  if (!canManageForms) {
    return <div className={u.emptyPad40}>{t('ui.无权限访问表单管理。请联系系统管理员授予工作流管理权限。', '无权限访问表单管理。请联系系统管理员授予工作流管理权限。')}</div>;
  }

  return <div>
      {/* G28：替换自定义标题行为全局 PageHeader 组件 */}
      <PageHeader
        title={t('ui.Workflow 表单运行时', 'Workflow 表单运行时')}
        subtitle={`管理表单定义、版本和预览 · ${total} 个表单${refreshedAt ? ` · 更新于 ${refreshedAt.toLocaleTimeString('zh-CN')}` : ''}`}
        breadcrumb={[t('ui.工作流', '工作流'), t('ui.表单运行时', '表单运行时')]}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={loadForms} disabled={loading} className={ui.btnSecondary}>
              <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              {t('ui.刷新', '刷新')}
            </button>
            <button onClick={() => { setShowCreate(true); setCreateError(''); }} className={ui.btnPrimary}>
              <Plus size={14} /> {t('ui.新建表单', '新建表单')}
            </button>
          </div>
        }
      />

      {error && <div style={{
      background: 'color-mix(in srgb, var(--status-danger) 10%, transparent)',
      border: '1px solid var(--status-danger)',
      borderRadius: 12,
      padding: '12px 18px',
      marginBottom: 20,
      color: 'var(--status-danger)',
      fontSize: 14
    }}>
          {error}
        </div>}

      {/* 主体：左列表 + 右详情 */}
      <div style={{
      display: 'grid',
      gridTemplateColumns: '280px 1fr',
      gap: 24
    }}>

        {/* ── 左：表单列表 ── */}
        <div style={{
        background: 'var(--bg-card)',
        borderRadius: 16,
        border: '1.5px solid var(--bg-muted)',
        overflow: 'hidden',
        height: 'fit-content'
      }}>
          <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--bg-muted)',
          fontWeight: 700,
          fontSize: 14,
          color: 'var(--text-primary)'
        }}>
            {t('ui.表单定义列表', '表单定义列表')}
          </div>
          {loading && forms.length === 0 ? <div style={{
          padding: 24,
          color: 'var(--text-disabled)',
          fontSize: 14,
          textAlign: 'center'
        }}>{t('ui.加载中…', '加载中…')}</div> : forms.length === 0 ? <div style={{
          padding: 24,
          color: 'var(--text-disabled)',
          fontSize: 14,
          textAlign: 'center'
        }}>{t('ui.暂无表单', '暂无表单')}</div> : <div>
              {forms.map(f => <button key={f.id} onClick={() => loadDetail(f)} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '12px 18px',
            borderBottom: '1px solid var(--bg-muted)',
            textAlign: 'left',
            background: selected?.id === f.id ? 'color-mix(in srgb, var(--status-special) 10%, transparent)' : 'var(--bg-card)',
            border: 'none',
            cursor: 'pointer',
            borderLeft: selected?.id === f.id ? '3px solid var(--status-special)' : '3px solid transparent'
          }}>
                  <div>
                    <div style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text-primary)'
              }}>{f.name}</div>
                    <div style={{
                fontSize: 11,
                color: 'var(--text-disabled)',
                marginTop: 2,
                fontFamily: 'monospace'
              }}>{f.code}</div>
                  </div>
                  <div className={u.flexRow}>
                    <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: statusColor(f.status),
                display: 'inline-block'
              }} />
                    <ChevronRight size={14} color="var(--text-disabled)" />
                  </div>
                </button>)}
            </div>}
        </div>

        {/* ── 右：详情 ── */}
        <div>
          {!selected ? <div style={{
          background: 'var(--bg-card)',
          borderRadius: 16,
          border: '1.5px solid var(--bg-muted)',
          padding: '60px 40px',
          textAlign: 'center',
          color: 'var(--text-disabled)'
        }}>
              <FileText size={40} style={{
            opacity: 0.3,
            marginBottom: 12
          }} />
              <div className={u.fs15}>{t('ui.请从左侧选择一个表单', '请从左侧选择一个表单')}</div>
            </div> : <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 20
        }}>

              {/* 表单 meta */}
              <div style={{
            background: 'var(--bg-card)',
            borderRadius: 16,
            border: '1.5px solid var(--bg-muted)',
            padding: '20px 24px'
          }}>
                <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginBottom: 16
            }}>
                  <div>
                    <div style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: 'var(--text-primary)'
                }}>{selected.name}</div>
                    <div style={{
                  fontSize: 13,
                  color: 'var(--text-disabled)',
                  fontFamily: 'monospace',
                  marginTop: 2
                }}>{selected.code}</div>
                  </div>
                  <div className={u.flexRow8}>
                    <Badge label={selected.status} color={statusColor(selected.status)} />
                    <button onClick={() => router.push(`/workflow/forms/submit/${selected.code}`)} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--status-special)',
                  color: 'var(--text-on-dark)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}>
                      <Send size={12} /> {t('ui.去提交', '去提交')}
                    </button>
                  </div>
                </div>
                <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))',
              gap: '8px 16px',
              fontSize: 13,
              color: 'var(--text-secondary)'
            }}>
                  {selected.biz_type && <span>{t('ui.业务类型：', '业务类型：')}<b>{selected.biz_type}</b></span>}
                  {selected.module_code && <span>{t('ui.模块：', '模块：')}<b>{selected.module_code}</b></span>}
                  {selected.category && <span>{t('ui.分类：', '分类：')}<b>{selected.category}</b></span>}
                  {selected.remark && <span style={{
                gridColumn: '1/-1',
                color: 'var(--text-disabled)',
                fontSize: 12
              }}>{selected.remark}</span>}
                </div>
              </div>

              {/* 版本列表 */}
              <div style={{
            background: 'var(--bg-card)',
            borderRadius: 16,
            border: '1.5px solid var(--bg-muted)',
            overflow: 'hidden'
          }}>
                <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--bg-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
                  <span style={{
                fontWeight: 700,
                fontSize: 15,
                color: 'var(--text-primary)'
              }}>{t('ui.版本管理', '版本管理')}</span>
                  <button onClick={openVersionModal} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 14px',
                borderRadius: 8,
                border: '1.5px solid var(--status-special)',
                background: 'var(--bg-card)',
                color: 'var(--status-special)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}>
                    <Plus size={12} /> {t('ui.新建版本', '新建版本')}
                  </button>
                </div>

                {detailLoading ? <div style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--text-disabled)'
            }}>{t('ui.加载中…', '加载中…')}</div> : versions.length === 0 ? <div style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--text-disabled)'
            }}>{t('ui.暂无版本，请新建', '暂无版本，请新建')}</div> : <table className={ui.table}>
                    <thead>
                      <tr>
                        {[t('ui.版本号', '版本号'), t('ui.状态', '状态'), t('ui.发布时间', '发布时间'), t('ui.创建时间', '创建时间'), t('ui.操作', '操作')].map(h => <th key={h}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {versions.map(v => <tr key={v.id}>
                          <td style={{
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    fontSize: 13
                  }}>
                            v{v.version_no}
                            {v.id === selected.current_version_id && <span style={{
                      marginLeft: 6,
                      fontSize: 11,
                      background: 'var(--status-special)18',
                      color: 'var(--status-special)',
                      padding: '1px 6px',
                      borderRadius: 20
                    }}>{t('ui.当前', '当前')}</span>}
                          </td>
                          <td>
                            <Badge label={v.status} color={statusColor(v.status)} />
                          </td>
                          <td style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)'
                  }}>
                            {v.published_at ? new Date(v.published_at).toLocaleDateString('zh-CN') : '—'}
                          </td>
                          <td style={{
                    fontSize: 13,
                    color: 'var(--text-disabled)'
                  }}>
                            {new Date(v.created_at).toLocaleDateString('zh-CN')}
                          </td>
                          <td>
                            <div style={{
                      display: 'flex',
                      gap: 8
                    }}>
                              <button onClick={() => {
                        setPreviewVer(v);
                        setPreviewData({});
                        setPreviewErrors({});
                      }} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--bg-card)',
                        color: 'var(--text-secondary)',
                        fontSize: 12,
                        cursor: 'pointer'
                      }}>
                                <Eye size={11} /> {t('ui.预览', '预览')}
                              </button>
                              {v.status === 'DRAFT' && <button onClick={() => handlePublish(v.id)} disabled={publishing} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: 'none',
                        background: 'var(--status-success)',
                        color: 'var(--text-on-dark)',
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 700
                      }}>
                                  <CheckCircle size={11} /> {t('ui.发布', '发布')}
                                </button>}
                            </div>
                          </td>
                        </tr>)}
                    </tbody>
                  </table>}
              </div>

              {/* 表单预览 */}
              {previewVer && previewSchema && <div style={{
            background: 'var(--bg-card)',
            borderRadius: 16,
            border: '1.5px solid var(--bg-muted)',
            overflow: 'hidden'
          }}>
                  <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--bg-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
                    <Eye size={16} color="var(--status-special)" />
                    <span style={{
                fontWeight: 700,
                fontSize: 15,
                color: 'var(--text-primary)'
              }}>
                      {t('ui.表单预览 — v', '表单预览 — v')}{previewVer.version_no}
                    </span>
                    <button onClick={() => router.push(`/workflow/forms/submit/${selected.code}`)} style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 12px',
                borderRadius: 7,
                border: 'none',
                background: 'color-mix(in srgb, var(--status-success) 12%, transparent)',
                color: 'var(--status-success)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}>
                      <ArrowRight size={11} /> {t('ui.进入提交页', '进入提交页')}
                    </button>
                  </div>
                  <div style={{
              padding: '24px 28px',
              maxWidth: 600
            }}>
                    <WorkflowFormRenderer schema={previewSchema} uiSchema={previewUiSchema} value={previewData} onChange={(key, val) => setPreviewData(prev => ({
                ...prev,
                [key]: val
              }))} errors={previewErrors} />
                    <div style={{
                marginTop: 20,
                padding: '12px 16px',
                background: 'var(--bg-muted)',
                borderRadius: 10,
                fontSize: 12,
                color: 'var(--text-secondary)'
              }}>
                      {t('ui.📌 当前为预览模式，数据不会保存。请前往「提交页」进行真实提交。', '📌 当前为预览模式，数据不会保存。请前往「提交页」进行真实提交。')}
                    </div>
                  </div>
                </div>}

            </div>}
        </div>
      </div>

      {/* ── 新建表单 Modal ── */}
      <ModalV2 open={showCreate} title={t('ui.新建表单定义', '新建表单定义')} width={480} onClose={() => setShowCreate(false)}
        footer={<>
          <button onClick={() => setShowCreate(false)} style={{
            flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer'
          }}>{t('ui.取消', '取消')}</button>
          <button onClick={handleCreate} disabled={creating} style={{
            flex: 1, padding: '10px', borderRadius: 10, border: 'none',
            background: 'var(--status-special)', color: 'var(--text-on-dark)', fontSize: 14, fontWeight: 700, cursor: 'pointer'
          }}>
            {creating ? t('ui.创建中…', '创建中…') : t('ui.创建', '创建')}
          </button>
        </>}
      >
            {createError && <div style={{
          background: 'color-mix(in srgb, var(--status-danger) 10%, transparent)',
          color: 'var(--status-danger)',
          fontSize: 13,
          padding: '8px 12px',
          borderRadius: 8,
          marginBottom: 14
        }}>{createError}</div>}
            {[{
          key: 'code',
          label: t('ui.表单代码 *', '表单代码 *'),
          placeholder: t('ui.大写字母/数字/下划线，如 MY_FORM', '大写字母/数字/下划线，如 MY_FORM')
        }, {
          key: 'name',
          label: t('ui.表单名称 *', '表单名称 *'),
          placeholder: t('ui.中文名称', '中文名称')
        }, {
          key: 'bizType',
          label: t('ui.业务类型', '业务类型'),
          placeholder: t('ui.如 PAYMENT_REQUEST', '如 PAYMENT_REQUEST')
        }, {
          key: 'moduleCode',
          label: t('ui.模块权限', '模块权限'),
          placeholder: t('ui.如 MENU_WORKFLOW_FORM', '如 MENU_WORKFLOW_FORM')
        }, {
          key: 'category',
          label: t('ui.分类', '分类'),
          placeholder: t('ui.如 通用', '如 通用')
        }, {
          key: 'remark',
          label: t('ui.备注', '备注'),
          placeholder: t('ui.可选', '可选')
        }].map(({
          key,
          label,
          placeholder
        }) => <div key={key} className={u.mb14}>
                <label style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-primary)',
            display: 'block',
            marginBottom: 5
          }}>{label}</label>
                <input className={ui.inp} value={(createForm as any)[key]} onChange={e => setCreateForm(prev => ({
            ...prev,
            [key]: e.target.value
          }))} placeholder={placeholder} />
              </div>)}
      </ModalV2>

      {/* ── 新建版本 Modal ── */}
      <ModalV2 open={showVersion && !!selected} title={t('ui.新建表单版本', '新建表单版本')} width={900} onClose={() => setShowVersion(false)}
        footer={<>
          <button onClick={() => setShowVersion(false)} style={{
            flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer'
          }}>{t('ui.取消', '取消')}</button>
          <button onClick={handleCreateVersion} disabled={savingVer} style={{
            flex: 1, padding: '10px', borderRadius: 10, border: 'none',
            background: 'var(--status-special)', color: 'var(--text-on-dark)', fontSize: 14, fontWeight: 700, cursor: 'pointer'
          }}>
            {savingVer ? t('ui.保存中…', '保存中…') : t('ui.保存为草稿', '保存为草稿')}
          </button>
        </>}
      >
            {selected && <p style={{
          margin: '0 0 20px',
          fontSize: 13,
          color: 'var(--text-secondary)'
        }}>{selected.name}{t('ui. · 新版本将以 DRAFT 状态创建，发布后生效', ' · 新版本将以 DRAFT 状态创建，发布后生效')}</p>}
            {verError && <div style={{
          background: 'color-mix(in srgb, var(--status-danger) 10%, transparent)',
          color: 'var(--status-danger)',
          fontSize: 13,
          padding: '8px 12px',
          borderRadius: 8,
          marginBottom: 14
        }}>{verError}</div>}

            <div className={u.grid2_20}>
              <div>
                <label style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text-primary)',
              display: 'block',
              marginBottom: 6
            }}>{t('ui.schema_json（字段定义）', 'schema_json（字段定义）')}</label>
                <textarea value={schemaText} onChange={e => setSchemaText(e.target.value)} rows={20} style={{
              width: '100%',
              fontFamily: 'monospace',
              fontSize: 12,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1.5px solid var(--border)',
              boxSizing: 'border-box',
              resize: 'vertical'
            }} />
              </div>
              <div>
                <label style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text-primary)',
              display: 'block',
              marginBottom: 6
            }}>{t('ui.ui_schema_json（控件配置）', 'ui_schema_json（控件配置）')}</label>
                <textarea value={uiSchemaText} onChange={e => setUiSchemaText(e.target.value)} rows={20} style={{
              width: '100%',
              fontFamily: 'monospace',
              fontSize: 12,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1.5px solid var(--border)',
              boxSizing: 'border-box',
              resize: 'vertical'
            }} />
              </div>
            </div>

            {/* 实时预览 */}
            {livePreview ? <div style={{
              marginTop: 20,
              padding: '16px 20px',
              background: 'var(--bg-muted)',
              borderRadius: 12
            }}>
                    <div style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text-secondary)',
                marginBottom: 12
              }}>{t('ui.实时预览', '实时预览')}</div>
                    <WorkflowFormRenderer schema={livePreview.schema} uiSchema={livePreview.uiSchema} value={{}} onChange={() => {}} />
            </div> : <div style={{
              marginTop: 14,
              fontSize: 12,
              color: 'var(--status-warning)'
            }}>{t('ui.JSON 解析失败，请检查格式', 'JSON 解析失败，请检查格式')}</div>}
      </ModalV2>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>;
}
