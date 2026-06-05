"use client";
import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle, AlertCircle, Clock, FileText, Link2, Activity, History, Info,
} from "lucide-react";
import request from "@/lib/api-client";
import { ReferenceGraph } from "./ReferenceGraph";

/**
 * G5.5-E — 通用主数据详情页布局
 *
 * 7 个 Panel 统一规范：
 *   1. 基础信息（外部传入）
 *   2. 状态 + 生命周期（含状态徽章 + 日期）
 *   3. 审批记录
 *   4. 引用关系（含 ReferenceGraph）
 *   5. 质量评分 + 缺失字段
 *   6. 审计日志
 *   7. 风险提示（冻结引用 / 归档阻断历史）
 *
 * 使用：
 *   <MasterDataDetailLayout
 *     objectType="CUSTOMER"
 *     objectCode="CUS-00001"
 *     title="客户档案"
 *     status="ACTIVE"
 *     basicInfo={<MyBasicInfoCard data={data} />}
 *   />
 */

export interface MasterDataDetailLayoutProps {
  objectType: string;     // CUSTOMER / SUPPLIER / ...
  objectCode: string;
  title: string;
  status?: string;
  effectiveDate?: string;
  expireDate?: string;
  basicInfo?: React.ReactNode;
  extraTabs?: { label: string; node: React.ReactNode }[];
}

interface References {
  totalReferences: number;
  references: Array<{
    refTable: string; refDocType: string; refCount: number;
    example: string[]; linkPattern: string;
  }>;
  isReferenced: boolean;
  canArchive: boolean;
}

interface AuditEntry {
  id: number; action: string; operator: string; reason?: string;
  before_json?: any; after_json?: any; created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'var(--text-secondary)',
  PENDING_APPROVAL: 'var(--status-warning)',
  ACTIVE: 'var(--status-success)',
  FROZEN: 'var(--status-info)',
  ARCHIVED: 'var(--text-disabled)',
  REJECTED: 'var(--status-danger)',
};

const TABS = [
  { key: 'basic',     label: '基础信息',  icon: Info },
  { key: 'lifecycle', label: '生命周期',  icon: Clock },
  { key: 'reference', label: '引用关系',  icon: Link2 },
  { key: 'quality',   label: '质量评分',  icon: Activity },
  { key: 'audit',     label: '审计日志',  icon: History },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function MasterDataDetailLayout(props: MasterDataDetailLayoutProps) {
  const { objectType, objectCode, title, status, effectiveDate, expireDate, basicInfo, extraTabs } = props;
  const [activeTab, setActiveTab] = useState<TabKey>('basic');
  const [refs, setRefs] = useState<References | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const loadRefs = useCallback(async () => {
    setLoadingRefs(true);
    try {
      const r = await request<References>(`/master-data/references/${objectType}/${encodeURIComponent(objectCode)}`);
      setRefs(r);
    } catch {
      setRefs(null);
    } finally { setLoadingRefs(false); }
  }, [objectType, objectCode]);

  const loadAudit = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const r = await request<{ items: AuditEntry[] }>(`/master-data/audit/${objectType}/${encodeURIComponent(objectCode)}`);
      setAudit(r.items ?? []);
    } catch {
      setAudit([]);
    } finally { setLoadingAudit(false); }
  }, [objectType, objectCode]);

  // 切到对应 tab 时按需加载
  useEffect(() => {
    if (activeTab === 'reference' && !refs && !loadingRefs) loadRefs();
    if (activeTab === 'audit' && audit.length === 0 && !loadingAudit) loadAudit();
  }, [activeTab, refs, audit.length, loadRefs, loadAudit, loadingRefs, loadingAudit]);

  const statusColor = STATUS_COLOR[status ?? 'ACTIVE'] ?? 'var(--text-secondary)';
  const allTabs: { key: string; label: string; icon: any }[] = [
    ...TABS,
    ...(extraTabs ?? []).map(t => ({ key: `extra_${t.label}`, label: t.label, icon: FileText })),
  ];

  return (
    <div>
      {/* 顶部对象摘要 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 20px', borderRadius: 12, background: 'var(--bg-card)',
        border: '1px solid var(--border)', marginBottom: 16,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{title}</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-primary)', marginTop: 2 }}>{objectCode}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
            objectType: <span style={{ fontFamily: 'monospace' }}>{objectType}</span>
            {effectiveDate && <> · 生效 {effectiveDate}</>}
            {expireDate && <> · 失效 {expireDate}</>}
          </div>
        </div>
        {status && (
          <span style={{
            fontSize: 13, padding: '4px 12px', borderRadius: 6, fontWeight: 600,
            background: `${statusColor}1a`, color: statusColor,
          }}>{status}</span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
        {allTabs.map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key as TabKey)}
              style={{
                padding: '8px 14px', borderRadius: '8px 8px 0 0', border: 'none',
                background: isActive ? 'var(--bg-card)' : 'transparent',
                color: isActive ? 'var(--color-primary)' : 'var(--text-secondary)',
                borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                fontSize: 13, fontWeight: isActive ? 600 : 400, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab 内容 */}
      <div style={{ padding: 20, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', minHeight: 240 }}>
        {activeTab === 'basic' && (basicInfo ?? <div style={{ color: 'var(--text-secondary)' }}>暂无基础信息（请由父组件传入 basicInfo）</div>)}

        {activeTab === 'lifecycle' && (
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>生命周期</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.keys(STATUS_COLOR).map(s => (
                <span key={s} style={{
                  fontSize: 12, padding: '3px 10px', borderRadius: 4,
                  background: status === s ? `${STATUS_COLOR[s]}33` : `${STATUS_COLOR[s]}0a`,
                  color: STATUS_COLOR[s],
                  fontWeight: status === s ? 700 : 400,
                  border: status === s ? `1px solid ${STATUS_COLOR[s]}` : '1px solid transparent',
                }}>{s}</span>
              ))}
            </div>
            <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
              {effectiveDate && <>生效日期：<strong style={{ color: 'var(--text-primary)' }}>{effectiveDate}</strong>　</>}
              {expireDate && <>失效日期：<strong style={{ color: 'var(--text-primary)' }}>{expireDate}</strong></>}
              {!effectiveDate && !expireDate && '尚未设置生效/失效日期'}
            </div>
          </div>
        )}

        {activeTab === 'reference' && (
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Link2 size={14} /> 被引用关系
              {refs && (
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 6 }}>
                  共 {refs.totalReferences} 处 · {refs.canArchive ? '可归档' : <span style={{ color: 'var(--status-danger)', fontWeight: 600 }}>不可归档（被引用）</span>}
                </span>
              )}
            </h3>
            {loadingRefs ? <div style={{ color: 'var(--text-secondary)' }}>加载中…</div> :
             !refs ? <div style={{ color: 'var(--text-secondary)' }}>暂无引用数据</div> :
             refs.totalReferences === 0 ? <div style={{ color: 'var(--status-success)' }}>✓ 该主数据当前无业务引用，可安全归档</div> :
             <ReferenceGraph centerLabel={objectCode} centerType={objectType} references={refs.references} />
            }
          </div>
        )}

        {activeTab === 'quality' && (
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>质量评分</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <QualityCard label="状态" value={status === 'ACTIVE' ? '生效中' : status ?? '—'} ok={status === 'ACTIVE'} />
              <QualityCard label="生效日期" value={effectiveDate ?? '未设置'} ok={!!effectiveDate} />
              <QualityCard label="引用情况" value={refs ? `${refs.totalReferences} 处` : '未查询'} ok={(refs?.totalReferences ?? 0) > 0 || status !== 'ARCHIVED'} />
              <QualityCard label="归档风险" value={refs?.canArchive ? '无' : '有引用'} ok={refs?.canArchive !== false} />
            </div>
            <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'var(--bg-muted)', fontSize: 12, color: 'var(--text-secondary)' }}>
              <Info size={12} style={{ display: 'inline', marginRight: 4 }} />
              全局健康评分见 <a href="/data-quality" style={{ color: 'var(--color-accent)' }}>G5 数据质量中心</a> 与 <a href="/master-data/governance" style={{ color: 'var(--color-accent)' }}>主数据治理驾驶舱</a>
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>审计日志</h3>
            {loadingAudit ? <div style={{ color: 'var(--text-secondary)' }}>加载中…</div> :
             audit.length === 0 ? <div style={{ color: 'var(--text-secondary)' }}>暂无审计记录</div> :
             <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
               {audit.map(a => (
                 <div key={a.id} style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, fontSize: 12 }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                     <span style={{ padding: '1px 8px', borderRadius: 4, background: 'var(--color-accent)1a', color: 'var(--color-accent)', fontWeight: 600 }}>{a.action}</span>
                     <span style={{ color: 'var(--text-primary)' }}>{a.operator ?? '系统'}</span>
                     <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }}>{new Date(a.created_at).toLocaleString('zh-CN')}</span>
                   </div>
                   {a.reason && <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{a.reason}</div>}
                 </div>
               ))}
             </div>
            }
          </div>
        )}

        {extraTabs && extraTabs.map(t => activeTab === `extra_${t.label}` && (
          <div key={t.label}>{t.node}</div>
        ))}
      </div>

      {/* 风险横幅（基于 references 数据） */}
      {refs && !refs.canArchive && status !== 'ARCHIVED' && (
        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
          fontSize: 12, color: 'var(--status-warning)', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertCircle size={13} />
          <strong>风险提示：</strong>该主数据被 {refs.totalReferences} 处业务单据引用，归档将被阻断；冻结将触发引用方告警
        </div>
      )}
    </div>
  );
}

function QualityCard({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{
      padding: 12, borderRadius: 8, border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
      background: ok ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {ok ? <CheckCircle size={13} style={{ color: 'var(--status-success)' }} /> : <AlertCircle size={13} style={{ color: 'var(--status-danger)' }} />}
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

export default MasterDataDetailLayout;
