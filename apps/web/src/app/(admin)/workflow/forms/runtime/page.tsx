'use client';
import { toast } from 'sonner';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, Plus, RefreshCw, ChevronRight, CheckCircle,
  Clock, Tag, Send, Eye, ArrowRight,
} from 'lucide-react';
import { WorkflowFormRenderer } from '@/components/workflow/WorkflowFormRenderer';
import type { FormSchema, UiSchema } from '@/components/workflow/WorkflowFormRenderer';
import ui from "@/components/ui/admin-ui.module.css";

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface FormDef {
  id:                  number;
  code:                string;
  name:                string;
  biz_type:            string | null;
  module_code:         string | null;
  category:            string | null;
  remark:              string | null;
  status:              string;
  current_version_id:  number | null;
  created_at:          string;
  updated_at:          string;
}

interface FormVersion {
  id:              number;
  form_id:         number;
  version_no:      number;
  status:          string;
  schema_json:     FormSchema;
  ui_schema_json:  UiSchema;
  validation_json: Record<string, unknown>;
  published_at:    string | null;
  created_at:      string;
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
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── 小组件 ────────────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: `${color}18`, color, border: `1px solid ${color}40`,
    }}>{label}</span>
  );
}

function statusColor(s: string) {
  if (s === 'ACTIVE' || s === 'PUBLISHED') return 'var(--status-success)';
  if (s === 'DRAFT') return 'var(--status-warning)';
  return 'var(--text-disabled)';
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function WorkflowFormRuntimePage() {
  const router = useRouter();

  // ── 列表状态 ──
  const [forms,       setForms]       = useState<FormDef[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [total,       setTotal]       = useState(0);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  // ── 选中表单 + 版本 ──
  const [selected,     setSelected]     = useState<FormDef | null>(null);
  const [versions,     setVersions]     = useState<FormVersion[]>([]);
  const [detailLoading,setDetailLoading]= useState(false);

  // ── 新建表单弹窗 ──
  const [showCreate,   setShowCreate]   = useState(false);
  const [createForm,   setCreateForm]   = useState({ code: '', name: '', bizType: '', moduleCode: '', category: '', remark: '' });
  const [creating,     setCreating]     = useState(false);
  const [createError,  setCreateError]  = useState('');

  // ── 新建版本弹窗 ──
  const [showVersion,  setShowVersion]  = useState(false);
  const [schemaText,   setSchemaText]   = useState('');
  const [uiSchemaText, setUiSchemaText] = useState('');
  const [savingVer,    setSavingVer]    = useState(false);
  const [verError,     setVerError]     = useState('');

  // ── 预览 ──
  const [previewVer,   setPreviewVer]   = useState<FormVersion | null>(null);
  const [previewData,  setPreviewData]  = useState<Record<string, unknown>>({});
  const [previewErrors,setPreviewErrors]= useState<Record<string, string>>({});

  // ── 发布 ──
  const [publishing,   setPublishing]   = useState(false);

  // ── 加载列表 ──────────────────────────────────────────────────────────────

  const loadForms = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ items: FormDef[]; total: number }>('/api/workflow/forms?pageSize=50');
      setForms(res.items ?? []);
      setTotal(res.total ?? 0);
      setRefreshedAt(new Date());
    } catch (e: any) {
      setError(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadForms(); }, [loadForms]);

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
      setCreateError('表单代码和名称为必填');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      await apiFetch('/api/workflow/forms', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      setShowCreate(false);
      setCreateForm({ code: '', name: '', bizType: '', moduleCode: '', category: '', remark: '' });
      await loadForms();
    } catch (e: any) {
      setCreateError(e.message ?? '创建失败');
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
      schemaJson   = JSON.parse(schemaText);
      uiSchemaJson = uiSchemaText.trim() ? JSON.parse(uiSchemaText) : {};
    } catch {
      setVerError('JSON 格式错误，请检查输入');
      return;
    }
    setSavingVer(true);
    try {
      await apiFetch(`/api/workflow/forms/${selected.id}/versions`, {
        method: 'POST',
        body: JSON.stringify({ schemaJson, uiSchemaJson }),
      });
      setShowVersion(false);
      await loadDetail(selected);
    } catch (e: any) {
      setVerError(e.message ?? '创建版本失败');
    } finally {
      setSavingVer(false);
    }
  };

  // ── 发布版本 ────────────────────────────────────────────────────────────────

  const handlePublish = async (versionId: number) => {
    if (!selected) return;
    setPublishing(true);
    try {
      await apiFetch(`/api/workflow/forms/versions/${versionId}/publish`, { method: 'POST' });
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
    setSchemaText(current
      ? JSON.stringify(current.schema_json, null, 2)
      : JSON.stringify({ type: 'object', required: [], properties: {} }, null, 2));
    setUiSchemaText(current
      ? JSON.stringify(current.ui_schema_json ?? {}, null, 2)
      : '{}');
    setVerError('');
    setShowVersion(true);
  };

  // ── 实时预览 ────────────────────────────────────────────────────────────────

  let previewSchema: FormSchema | null = null;
  let previewUiSchema: UiSchema = {};
  if (previewVer) {
    previewSchema   = previewVer.schema_json;
    previewUiSchema = previewVer.ui_schema_json ?? {};
  }

  // ── 渲染 ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>

      {/* 标题行 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--status-special)18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={22} color="var(--status-special)" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>Workflow 表单运行时</h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
              管理表单定义、版本和预览 · {total} 个表单
              {refreshedAt && ` · 更新于 ${refreshedAt.toLocaleTimeString('zh-CN')}`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={loadForms} disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 10,
            border: '1.5px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            刷新
          </button>
          <button onClick={() => { setShowCreate(true); setCreateError(''); }} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 10,
            border: 'none', background: 'var(--status-special)',
            color: 'var(--text-on-dark)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            <Plus size={14} /> 新建表单
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'color-mix(in srgb, var(--status-danger) 10%, transparent)', border: '1px solid var(--status-danger)', borderRadius: 12, padding: '12px 18px', marginBottom: 20, color: 'var(--status-danger)', fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* 主体：左列表 + 右详情 */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>

        {/* ── 左：表单列表 ── */}
        <div style={{ background: 'var(--bg-card)', borderRadius: 16, border: '1.5px solid var(--bg-muted)', overflow: 'hidden', height: 'fit-content' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bg-muted)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
            表单定义列表
          </div>
          {loading && forms.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text-disabled)', fontSize: 14, textAlign: 'center' }}>加载中…</div>
          ) : forms.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text-disabled)', fontSize: 14, textAlign: 'center' }}>暂无表单</div>
          ) : (
            <div>
              {forms.map(f => (
                <button
                  key={f.id}
                  onClick={() => loadDetail(f)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '12px 18px', borderBottom: '1px solid var(--bg-muted)',
                    textAlign: 'left', background: selected?.id === f.id ? 'color-mix(in srgb, var(--status-special) 10%, transparent)' : 'var(--bg-card)',
                    border: 'none', cursor: 'pointer', borderLeft: selected?.id === f.id ? '3px solid var(--status-special)' : '3px solid transparent',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-disabled)', marginTop: 2, fontFamily: 'monospace' }}>{f.code}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: statusColor(f.status),
                      display: 'inline-block',
                    }} />
                    <ChevronRight size={14} color="var(--text-disabled)" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── 右：详情 ── */}
        <div>
          {!selected ? (
            <div style={{
              background: 'var(--bg-card)', borderRadius: 16, border: '1.5px solid var(--bg-muted)',
              padding: '60px 40px', textAlign: 'center', color: 'var(--text-disabled)',
            }}>
              <FileText size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
              <div style={{ fontSize: 15 }}>请从左侧选择一个表单</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* 表单 meta */}
              <div style={{ background: 'var(--bg-card)', borderRadius: 16, border: '1.5px solid var(--bg-muted)', padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{selected.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-disabled)', fontFamily: 'monospace', marginTop: 2 }}>{selected.code}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Badge label={selected.status} color={statusColor(selected.status)} />
                    <button
                      onClick={() => router.push(`/workflow/forms/submit/${selected.code}`)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '6px 14px', borderRadius: 8, border: 'none',
                        background: 'var(--status-special)', color: 'var(--text-on-dark)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      <Send size={12} /> 去提交
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: '8px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {selected.biz_type && <span>业务类型：<b>{selected.biz_type}</b></span>}
                  {selected.module_code && <span>模块：<b>{selected.module_code}</b></span>}
                  {selected.category && <span>分类：<b>{selected.category}</b></span>}
                  {selected.remark && <span style={{ gridColumn: '1/-1', color: 'var(--text-disabled)', fontSize: 12 }}>{selected.remark}</span>}
                </div>
              </div>

              {/* 版本列表 */}
              <div style={{ background: 'var(--bg-card)', borderRadius: 16, border: '1.5px solid var(--bg-muted)', overflow: 'hidden' }}>
                <div style={{
                  padding: '14px 20px', borderBottom: '1px solid var(--bg-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>版本管理</span>
                  <button
                    onClick={openVersionModal}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 14px', borderRadius: 8, border: '1.5px solid var(--status-special)',
                      background: 'var(--bg-card)', color: 'var(--status-special)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    <Plus size={12} /> 新建版本
                  </button>
                </div>

                {detailLoading ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-disabled)' }}>加载中…</div>
                ) : versions.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-disabled)' }}>暂无版本，请新建</div>
                ) : (
                  <table className={ui.table}>
                    <thead>
                      <tr>
                        {['版本号', '状态', '发布时间', '创建时间', '操作'].map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {versions.map(v => (
                        <tr key={v.id}>
                          <td style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>
                            v{v.version_no}
                            {v.id === selected.current_version_id && (
                              <span style={{ marginLeft: 6, fontSize: 11, background: 'var(--status-special)18', color: 'var(--status-special)', padding: '1px 6px', borderRadius: 20 }}>当前</span>
                            )}
                          </td>
                          <td>
                            <Badge label={v.status} color={statusColor(v.status)} />
                          </td>
                          <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            {v.published_at ? new Date(v.published_at).toLocaleDateString('zh-CN') : '—'}
                          </td>
                          <td style={{ fontSize: 13, color: 'var(--text-disabled)' }}>
                            {new Date(v.created_at).toLocaleDateString('zh-CN')}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                onClick={() => { setPreviewVer(v); setPreviewData({}); setPreviewErrors({}); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
                              >
                                <Eye size={11} /> 预览
                              </button>
                              {v.status === 'DRAFT' && (
                                <button
                                  onClick={() => handlePublish(v.id)}
                                  disabled={publishing}
                                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--status-success)', color: 'var(--text-on-dark)', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
                                >
                                  <CheckCircle size={11} /> 发布
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* 表单预览 */}
              {previewVer && previewSchema && (
                <div style={{ background: 'var(--bg-card)', borderRadius: 16, border: '1.5px solid var(--bg-muted)', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bg-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Eye size={16} color="var(--status-special)" />
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                      表单预览 — v{previewVer.version_no}
                    </span>
                    <button
                      onClick={() => router.push(`/workflow/forms/submit/${selected.code}`)}
                      style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 7, border: 'none', background: 'color-mix(in srgb, var(--status-success) 12%, transparent)', color: 'var(--status-success)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      <ArrowRight size={11} /> 进入提交页
                    </button>
                  </div>
                  <div style={{ padding: '24px 28px', maxWidth: 600 }}>
                    <WorkflowFormRenderer
                      schema={previewSchema}
                      uiSchema={previewUiSchema}
                      value={previewData}
                      onChange={(key, val) => setPreviewData(prev => ({ ...prev, [key]: val }))}
                      errors={previewErrors}
                    />
                    <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                      📌 当前为预览模式，数据不会保存。请前往「提交页」进行真实提交。
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* ── 新建表单 Modal ── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 18, padding: 32, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>新建表单定义</h2>
            {createError && <div style={{ background: 'color-mix(in srgb, var(--status-danger) 10%, transparent)', color: 'var(--status-danger)', fontSize: 13, padding: '8px 12px', borderRadius: 8, marginBottom: 14 }}>{createError}</div>}
            {[
              { key: 'code',       label: '表单代码 *', placeholder: '大写字母/数字/下划线，如 MY_FORM' },
              { key: 'name',       label: '表单名称 *', placeholder: '中文名称' },
              { key: 'bizType',    label: '业务类型',   placeholder: '如 PAYMENT_REQUEST' },
              { key: 'moduleCode', label: '模块权限',   placeholder: '如 MENU_WORKFLOW' },
              { key: 'category',   label: '分类',       placeholder: '如 通用' },
              { key: 'remark',     label: '备注',       placeholder: '可选' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 5 }}>{label}</label>
                <input
                  value={(createForm as any)[key]}
                  onChange={e => setCreateForm(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>取消</button>
              <button onClick={handleCreate} disabled={creating} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: 'var(--status-special)', color: 'var(--text-on-dark)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {creating ? '创建中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 新建版本 Modal ── */}
      {showVersion && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 18, padding: 32, width: '90vw', maxWidth: 900, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>新建表单版本</h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)' }}>{selected.name} · 新版本将以 DRAFT 状态创建，发布后生效</p>
            {verError && <div style={{ background: 'color-mix(in srgb, var(--status-danger) 10%, transparent)', color: 'var(--status-danger)', fontSize: 13, padding: '8px 12px', borderRadius: 8, marginBottom: 14 }}>{verError}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>schema_json（字段定义）</label>
                <textarea
                  value={schemaText}
                  onChange={e => setSchemaText(e.target.value)}
                  rows={20}
                  style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border)', boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>ui_schema_json（控件配置）</label>
                <textarea
                  value={uiSchemaText}
                  onChange={e => setUiSchemaText(e.target.value)}
                  rows={20}
                  style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border)', boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>
            </div>

            {/* 实时预览 */}
            {(() => {
              try {
                const s = JSON.parse(schemaText) as FormSchema;
                const u = uiSchemaText.trim() ? JSON.parse(uiSchemaText) as UiSchema : {};
                return (
                  <div style={{ marginTop: 20, padding: '16px 20px', background: 'var(--bg-muted)', borderRadius: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>实时预览</div>
                    <WorkflowFormRenderer
                      schema={s}
                      uiSchema={u}
                      value={{}}
                      onChange={() => {}}
                    />
                  </div>
                );
              } catch {
                return <div style={{ marginTop: 14, fontSize: 12, color: 'var(--status-warning)' }}>⚠ JSON 解析失败，请检查格式</div>;
              }
            })()}

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button onClick={() => setShowVersion(false)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>取消</button>
              <button onClick={handleCreateVersion} disabled={savingVer} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: 'var(--status-special)', color: 'var(--text-on-dark)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {savingVer ? '保存中…' : '保存为草稿'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
