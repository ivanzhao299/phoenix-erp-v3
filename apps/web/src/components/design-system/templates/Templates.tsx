'use client';
import React from 'react';
import { PageHeaderV2, PageToolbar, PageSection, type Crumb } from '../layouts/PageParts';
import { DataTableV3, type ColumnV3 } from '../tables/DataTableV3';
import { DrawerV2 } from '../drawers/DrawerV2';
import { DetailPanel, type DetailItem } from '../detail/DetailPanel';
import { AuditTimeline, type TimelineItem } from '../detail/AuditTimeline';
import { WorkflowTimeline, type WorkflowStep } from '../timeline/WorkflowTimeline';
import { AttachmentViewer } from '../detail/AttachmentViewer';
import { StatusBadge } from '../status/StatusBadge';
import { MobilePageShell } from '../mobile/MobileKit';
import { WorkbenchShell } from '../workbench/WorkbenchKit';
import { KPI_GRID } from '@/lib/design-tokens';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * 全站页面模板（Design System V2 · UI-2.3）。
 * 每个模板组合 design-system 基础组件，给 9 类页面提供统一骨架。
 * 仅模板，迁移时按需采用；禁止页面再自建骨架。暗色全部继承组件 CSS 变量。
 */

// ── 3. MasterDataTemplate（主数据：客户/供应商/产品/组织等）─────────────
export interface MasterDataTemplateProps<T = any> {
  title: string; subtitle?: string; breadcrumb?: Crumb[];
  filters?: React.ReactNode;        // FilterBar 槽
  actions?: React.ReactNode;        // ActionBar 槽（新增等）
  rows: T[]; columns: ColumnV3<T>[]; loading?: boolean; pageSize?: number;
  rowKey?: (row: T, i: number) => string | number;
  drawer?: { open: boolean; title?: string; onClose: () => void; content: React.ReactNode; footer?: React.ReactNode };
}
export function MasterDataTemplate<T = any>(p: MasterDataTemplateProps<T>) {
  return (
    <div style={{ padding: 24 }}>
      <PageHeaderV2 title={p.title} subtitle={p.subtitle} breadcrumb={p.breadcrumb} actions={p.actions} />
      {p.filters && <PageToolbar left={p.filters} />}
      <DataTableV3 rows={p.rows} columns={p.columns} loading={p.loading} pageSize={p.pageSize} rowKey={p.rowKey} />
      {p.drawer && (
        <DrawerV2 open={p.drawer.open} title={p.drawer.title} onClose={p.drawer.onClose} footer={p.drawer.footer}>
          {p.drawer.content}
        </DrawerV2>
      )}
    </div>
  );
}

// ── 4. DocumentTemplate（业务单据：订单/费用/资本流等单据详情）──────────
export interface DocumentTemplateProps {
  title: string; subtitle?: string; breadcrumb?: Crumb[];
  status?: string;                   // 状态条
  actions?: React.ReactNode;         // 操作区
  baseInfo: DetailItem[];            // 基础信息
  lines?: React.ReactNode;           // 明细表
  attachments?: { urls?: string[] | null; count?: number };
  workflow?: WorkflowStep[];         // 审批流
  timeline?: TimelineItem[];         // 审计时间线
}
export function DocumentTemplate(p: DocumentTemplateProps) {
  const { t } = useLanguage();
  return (
    <div style={{ padding: 24, maxWidth: 1080 }}>
      <PageHeaderV2 title={p.title} subtitle={p.subtitle} breadcrumb={p.breadcrumb}
        actions={<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{p.status && <StatusBadge status={p.status} size="md" />}{p.actions}</div>} />
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DetailPanel title={t('ui.基础信息','基础信息')} items={p.baseInfo} />
          {p.lines && <PageSection title={t('ui.明细','明细')}>{p.lines}</PageSection>}
          {p.attachments && <PageSection title={t('ui.附件','附件')}><AttachmentViewer urls={p.attachments.urls} count={p.attachments.count} /></PageSection>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {p.workflow && <PageSection title={t('ui.审批流','审批流')}><WorkflowTimeline steps={p.workflow} title="" /></PageSection>}
          {p.timeline && <PageSection title={t('ui.操作时间线','操作时间线')}><AuditTimeline items={p.timeline} title="" /></PageSection>}
        </div>
      </div>
    </div>
  );
}

// ── 5. LedgerTemplate（台账：资金/库存/AP/AR/资本流）─────────────────────
export interface LedgerTemplateProps<T = any> {
  title: string; subtitle?: string; breadcrumb?: Crumb[];
  kpi?: React.ReactNode; filters?: React.ReactNode; actions?: React.ReactNode;
  rows: T[]; columns: ColumnV3<T>[]; loading?: boolean; pageSize?: number; exportName?: string;
  rowKey?: (row: T, i: number) => string | number;
  drawer?: { open: boolean; title?: string; onClose: () => void; content: React.ReactNode };
}
export function LedgerTemplate<T = any>(p: LedgerTemplateProps<T>) {
  return (
    <div style={{ padding: 24 }}>
      <PageHeaderV2 title={p.title} subtitle={p.subtitle} breadcrumb={p.breadcrumb} actions={p.actions} />
      {p.kpi && <div style={{ ...KPI_GRID, marginBottom: 16 }}>{p.kpi}</div>}
      {p.filters && <PageToolbar left={p.filters} />}
      <DataTableV3 rows={p.rows} columns={p.columns} loading={p.loading} pageSize={p.pageSize} exportName={p.exportName || 'ledger'} rowKey={p.rowKey} />
      {p.drawer && <DrawerV2 open={p.drawer.open} title={p.drawer.title} onClose={p.drawer.onClose}>{p.drawer.content}</DrawerV2>}
    </div>
  );
}

// ── 6. ApprovalTemplate（审批：待办/实例/规则）──────────────────────────
export interface ApprovalTemplateProps<T = any> {
  title: string; subtitle?: string; breadcrumb?: Crumb[]; actions?: React.ReactNode;
  rows: T[]; columns: ColumnV3<T>[]; loading?: boolean; pageSize?: number;
  rowKey?: (row: T, i: number) => string | number;
  detail?: { open: boolean; title?: string; onClose: () => void; baseInfo?: DetailItem[]; steps?: WorkflowStep[]; footer?: React.ReactNode };
}
export function ApprovalTemplate<T = any>(p: ApprovalTemplateProps<T>) {
  const { t } = useLanguage();
  return (
    <div style={{ padding: 24 }}>
      <PageHeaderV2 title={p.title} subtitle={p.subtitle} breadcrumb={p.breadcrumb} actions={p.actions} />
      <DataTableV3 rows={p.rows} columns={p.columns} loading={p.loading} pageSize={p.pageSize} rowKey={p.rowKey} />
      {p.detail && (
        <DrawerV2 open={p.detail.open} title={p.detail.title || t('ui.审批详情','审批详情')} onClose={p.detail.onClose} footer={p.detail.footer}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {p.detail.baseInfo && <DetailPanel items={p.detail.baseInfo} />}
            {p.detail.steps && <WorkflowTimeline steps={p.detail.steps} />}
          </div>
        </DrawerV2>
      )}
    </div>
  );
}

// ── 7. ConfigTemplate（配置：设置/角色/用户/字典）───────────────────────
export interface ConfigSection { title: string; content: React.ReactNode; }
export interface ConfigTemplateProps {
  title: string; subtitle?: string; breadcrumb?: Crumb[];
  sections: ConfigSection[]; dirty?: boolean; onSave?: () => void; saving?: boolean;
}
export function ConfigTemplate(p: ConfigTemplateProps) {
  const { t } = useLanguage();
  return (
    <div style={{ padding: 24, maxWidth: 920 }}>
      <PageHeaderV2 title={p.title} subtitle={p.subtitle} breadcrumb={p.breadcrumb}
        actions={p.onSave && (
          <button onClick={p.onSave} disabled={p.saving || !p.dirty}
            style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', border: 'none', background: p.dirty ? 'var(--color-primary)' : 'var(--bg-muted)', color: p.dirty ? 'var(--text-on-dark)' : 'var(--text-disabled)', fontWeight: 600, cursor: p.dirty ? 'pointer' : 'not-allowed' }}>
            {p.saving ? t('ui.保存中…','保存中…') : t('ui.保存','保存')}
          </button>
        )} />
      {p.dirty && <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 'var(--radius-md)', background: 'color-mix(in srgb, var(--status-warning) 14%, transparent)', color: 'var(--status-warning)', fontSize: 12.5 }}>{t('ui.有未保存的更改','有未保存的更改')}</div>}
      {p.sections.map((s, i) => <PageSection key={i} title={s.title}>{s.content}</PageSection>)}
    </div>
  );
}

// ── 8. DetailTemplate（详情页：订单/客户/资本流/审批详情）────────────────
export interface DetailTemplateProps {
  title: string; subtitle?: string; breadcrumb?: Crumb[]; status?: string; actions?: React.ReactNode;
  coreFields: DetailItem[];
  sections?: { title: string; content: React.ReactNode }[];
  attachments?: { urls?: string[] | null; count?: number };
  approval?: WorkflowStep[];
  timeline?: TimelineItem[];
}
export function DetailTemplate(p: DetailTemplateProps) {
  const { t } = useLanguage();
  return (
    <div style={{ padding: 24, maxWidth: 1080 }}>
      <PageHeaderV2 title={p.title} subtitle={p.subtitle} breadcrumb={p.breadcrumb}
        actions={<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{p.status && <StatusBadge status={p.status} size="md" />}{p.actions}</div>} />
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DetailPanel title={t('ui.核心信息','核心信息')} items={p.coreFields} />
          {p.sections?.map((s, i) => <PageSection key={i} title={s.title}>{s.content}</PageSection>)}
          {p.attachments && <PageSection title={t('ui.附件','附件')}><AttachmentViewer urls={p.attachments.urls} count={p.attachments.count} /></PageSection>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {p.approval && <PageSection title={t('ui.审批记录','审批记录')}><WorkflowTimeline steps={p.approval} title="" /></PageSection>}
          {p.timeline && <PageSection title={t('ui.操作记录','操作记录')}><AuditTimeline items={p.timeline} title="" /></PageSection>}
        </div>
      </div>
    </div>
  );
}

// ── 9. MobileTemplate（移动端，基于 MobileKit）──────────────────────────
export interface MobileTemplateProps {
  title: string; left?: React.ReactNode; right?: React.ReactNode;
  stats?: React.ReactNode;            // MobileStatCard 网格
  children?: React.ReactNode;
}
export function MobileTemplate({ title, left, right, stats, children }: MobileTemplateProps) {
  return (
    <MobilePageShell title={title} left={left} right={right}>
      {stats && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>{stats}</div>}
      {children}
    </MobilePageShell>
  );
}

// ── 10. WorkbenchTemplate（作业台，基于 WorkbenchKit）────────────────────
export interface WorkbenchTemplateProps {
  title: string; status?: React.ReactNode;
  statusCards?: React.ReactNode;      // WorkbenchStatusCard 行
  actions?: React.ReactNode;          // WorkbenchActionButton 行
  children?: React.ReactNode;
}
export function WorkbenchTemplate({ title, status, statusCards, actions, children }: WorkbenchTemplateProps) {
  return (
    <WorkbenchShell title={title} status={status}>
      {statusCards && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>{statusCards}</div>}
      {children}
      {actions && <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 20 }}>{actions}</div>}
    </WorkbenchShell>
  );
}
