'use client';

/**
 * MasterDataDetailDrawer — UIX-8 通用主数据详情抽屉
 *
 * 把 customer/supplier 的样板抽成 config-driven 通用组件，新增 9 类主数据只需写 config，
 * 不再每类 copy-paste 一份 200-300 行的 drawer。
 *
 * config 结构：
 *   · header: 标题 + 副标题（中心名）
 *   · runtimeApi: 基础数据 API
 *   · kpis: 业务 KPI 列表（每项含 label / icon / 从 API 解析 value）
 *   · sections: 自定义内容区（最近活动 / 引用图 / 审计 等）
 *   · referenceObjectType: master-data references 用的 object_type
 *
 * 已配 6 类：customer / supplier / product / warehouse / project / sku
 */

import { useEffect, useState, ReactNode } from 'react';
import { X, Link2 } from 'lucide-react';
import request from '@/lib/api-client';
import { useLanguage } from '@/contexts/LanguageContext';
import type { MasterDataConfig } from './detail-configs';
import { drawerMask, drawerCloseButton } from '@/components/design-system/cockpit-styles';

interface ReferenceItem { refTable: string; refDocType: string; refCount: number; }
interface AuditItem { action: string; operator?: string; reason?: string; created_at: string; }

interface Props {
  open: boolean;
  code: string | null;
  config: MasterDataConfig;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  DRAFT:            { label: '草稿',   color: 'var(--text-secondary)' },
  PENDING_APPROVAL: { label: '待审批', color: 'var(--status-warning)' },
  ACTIVE:           { label: '已生效', color: 'var(--status-success)' },
  FROZEN:           { label: '已冻结', color: 'var(--status-info)' },
  ARCHIVED:         { label: '已归档', color: 'var(--text-disabled)' },
  REJECTED:         { label: '已驳回', color: 'var(--status-danger)' },
};

export function MasterDataDetailDrawer({ open, code, config, onClose }: Props) {
  const { t } = useLanguage();
  const [info, setInfo] = useState<any>(null);
  const [extra, setExtra] = useState<Record<string, any>>({});
  const [refs, setRefs] = useState<{ totalReferences: number; references: ReferenceItem[]; canArchive: boolean }>({ totalReferences: 0, references: [], canArchive: true });
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !code) return;
    setLoading(true); setErrors([]);
    const errs: string[] = [];
    const safe = async <T,>(p: string, label: string): Promise<T | null> => {
      try { return await request<T>(p); }
      catch (e) { errs.push(`${label}: ${e instanceof Error ? e.message : t('ui.失败','失败')}`); return null; }
    };

    const extraCalls = (config.extraApis || []).map(api =>
      safe<any>(api.path.replace(':code', encodeURIComponent(code)), api.label)
    );

    Promise.all([
      safe<any>(`/master-data/runtime/${config.type}/${encodeURIComponent(code)}`, t('ui.基础','基础')),
      safe<{ totalReferences: number; references: ReferenceItem[]; canArchive: boolean }>(
        `/master-data/references/${config.referenceObjectType}/${encodeURIComponent(code)}`, t('ui.引用','引用')),
      safe<{ items: AuditItem[] }>(
        `/master-data/audit/${config.referenceObjectType}/${encodeURIComponent(code)}`, t('ui.审计','审计')),
      ...extraCalls,
    ]).then(results => {
      const [infoR, refsR, auditR, ...extras] = results;
      setInfo(infoR);
      setRefs(refsR || { totalReferences: 0, references: [], canArchive: true });
      const auditItems = Array.isArray(auditR) ? auditR : (auditR?.items ?? []);
      setAudit(auditItems.slice(0, 8));
      const extraMap: Record<string, any> = {};
      (config.extraApis || []).forEach((api, i) => { extraMap[api.key] = extras[i]; });
      setExtra(extraMap);
      setErrors(errs);
    }).finally(() => setLoading(false));
  }, [open, code, config]);

  if (!open) return null;

  const status = info?.status ? (STATUS_LABEL[info.status] || { label: info.status, color: 'var(--text-secondary)' }) : null;
  const titleText = info?.[config.nameKey] || code || '—';

  return (
    <div style={drawerMask} onClick={onClose}>
      <div
        style={{ width: 680, maxWidth: '95vw', background: 'var(--bg-card)', height: '100%', overflowY: 'auto', boxShadow: '0 0 40px var(--overlay-black-25)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={{
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{config.centerName}</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{titleText}</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>{code}</code>
              {status && (
                <span style={{ padding: '2px 8px', fontSize: 11, fontWeight: 600, background: 'var(--bg-muted)', color: status.color, borderRadius: 100 }}>{status.label}</span>
              )}
              {!refs.canArchive && (
                <span style={{ padding: '2px 8px', fontSize: 11, fontWeight: 600, background: 'var(--status-warning-bg-light)', color: 'var(--status-warning)', borderRadius: 100 }}>{t('ui.归档阻断','归档阻断')}</span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('ui.关闭','关闭')} style={drawerCloseButton}>
            <X size={20} />
          </button>
        </header>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>{t('ui.加载中…','加载中…')}</div>}

          {errors.length > 0 && (
            <section style={{ padding: 12, borderLeft: '3px solid var(--status-warning)', background: 'var(--status-warning-bg-faint)', fontSize: 12 }}>
              <strong>{t('ui.部分数据加载失败','部分数据加载失败')}</strong>
              <ul style={{ margin: '4px 0 0 16px' }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </section>
          )}

          {/* KPI */}
          {config.kpis && config.kpis.length > 0 && (
            <section>
              <SectionTitle>{t('ui.业务统计','业务统计')}</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, config.kpis.length)}, 1fr)`, gap: 12 }}>
                {config.kpis.map((k, i) => {
                  const v = k.value(info, extra);
                  return (
                    <KpiTile
                      key={i}
                      icon={k.icon}
                      label={k.label}
                      value={v?.display ?? '—'}
                      suffix={v?.suffix}
                      tone={v?.tone}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* 基础信息 */}
          {info && config.basicFields && (
            <section>
              <SectionTitle>{t('ui.基础信息','基础信息')}</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', padding: 16, background: 'var(--bg-muted)', borderRadius: 'var(--radius-card)' }}>
                {config.basicFields.map(f => (
                  <InfoRow key={f.key} label={f.label} value={f.format ? f.format(info[f.key], info) : (info[f.key] || '—')} />
                ))}
              </div>
            </section>
          )}

          {/* 自定义 sections（最近活动等） */}
          {config.sections?.map((s, i) => (
            <section key={i}>
              <SectionTitle>{s.title}</SectionTitle>
              {s.render(extra, info)}
            </section>
          ))}

          {/* 引用 */}
          {refs.totalReferences > 0 && (
            <section>
              <SectionTitle>{t('ui.被引用','被引用')} ({refs.totalReferences})</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {refs.references.map(r => (
                  <div key={r.refTable} style={{ padding: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Link2 size={14} color="var(--color-primary)" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{r.refDocType}</div>
                      <code style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{r.refTable}</code>
                    </div>
                    <span style={{ padding: '1px 7px', fontSize: 11, fontWeight: 600, background: 'var(--status-warning)', color: 'var(--text-on-dark)', borderRadius: 100 }}>{r.refCount}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 审计 */}
          {audit.length > 0 && (
            <section>
              <SectionTitle>{t('ui.最近活动','最近活动')}</SectionTitle>
              <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12, marginLeft: 4 }}>
                {audit.map((a, i) => (
                  <div key={i} style={{ position: 'relative', paddingBottom: 12 }}>
                    <span style={{ position: 'absolute', left: -18, top: 4, width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)' }} />
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <strong style={{ fontSize: 12, color: 'var(--text-primary)' }}>{a.action}</strong>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        by {a.operator || '—'} · {new Date(a.created_at).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    {a.reason && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>{a.reason}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</h3>
  );
}

function KpiTile({ icon, label, value, suffix, tone = 'default' }: { icon: ReactNode; label: string; value: ReactNode; suffix?: string; tone?: 'default' | 'warning' | 'danger' | 'success'; }) {
  const color = tone === 'danger' ? 'var(--status-danger)' :
                tone === 'warning' ? 'var(--status-warning)' :
                tone === 'success' ? 'var(--status-success)' :
                'var(--text-primary)';
  return (
    <div style={{ padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
        {icon}<span style={{ fontSize: 11 }}>{label}</span>
      </div>
      <strong style={{ fontSize: 18, color, fontWeight: 700 }}>{value}</strong>
      {suffix && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{suffix}</span>}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 72 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

export default MasterDataDetailDrawer;
