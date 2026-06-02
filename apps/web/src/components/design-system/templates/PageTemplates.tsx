'use client';
import React from 'react';
import { PageHeaderV2, PageToolbar, type Crumb } from '../layouts/PageParts';
import { DataTableV3, type ColumnV3 } from '../tables/DataTableV3';
import { KPI_GRID } from '@/lib/design-tokens';

/**
 * 页面模板（Design System V2 · UI-2.3 基座）。
 * 组合 Layout + 卡片 + 表格，给全站 8 类页面提供统一脚手架。
 * 仅为模板，页面迁移时按需采用；不强制。
 */

/** ListPageTemplate — 列表/单据/台账页（页头 + 工具栏 + KPI 槽 + 表格） */
export interface ListPageTemplateProps<T = any> {
  title: string;
  subtitle?: string;
  breadcrumb?: Crumb[];
  actions?: React.ReactNode;
  kpi?: React.ReactNode;
  toolbarLeft?: React.ReactNode;
  toolbarRight?: React.ReactNode;
  rows: T[];
  columns: ColumnV3<T>[];
  loading?: boolean;
  pageSize?: number;
  exportName?: string;
  rowKey?: (row: T, i: number) => string | number;
}
export function ListPageTemplate<T = any>(p: ListPageTemplateProps<T>) {
  return (
    <div style={{ padding: 24 }}>
      <PageHeaderV2 title={p.title} subtitle={p.subtitle} breadcrumb={p.breadcrumb} actions={p.actions} />
      {p.kpi && <div style={{ ...KPI_GRID, marginBottom: 16 }}>{p.kpi}</div>}
      {(p.toolbarLeft || p.toolbarRight) && <PageToolbar left={p.toolbarLeft} right={p.toolbarRight} />}
      <DataTableV3 rows={p.rows} columns={p.columns} loading={p.loading} pageSize={p.pageSize} exportName={p.exportName} rowKey={p.rowKey} />
    </div>
  );
}

/** DashboardTemplate — 驾驶舱页（页头 + KPI 区 + 自定义内容） */
export function DashboardTemplate({ title, subtitle, breadcrumb, actions, kpi, children }: {
  title: string; subtitle?: string; breadcrumb?: Crumb[]; actions?: React.ReactNode; kpi?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div style={{ padding: 24 }}>
      <PageHeaderV2 title={title} subtitle={subtitle} breadcrumb={breadcrumb} actions={actions} />
      {kpi && <div style={{ ...KPI_GRID, marginBottom: 20 }}>{kpi}</div>}
      {children}
    </div>
  );
}

/** DetailPageTemplate — 详情页（页头 + 主区/侧区双栏） */
export function DetailPageTemplate({ title, subtitle, breadcrumb, actions, main, aside }: {
  title: string; subtitle?: string; breadcrumb?: Crumb[]; actions?: React.ReactNode; main: React.ReactNode; aside?: React.ReactNode;
}) {
  return (
    <div style={{ padding: 24, maxWidth: 1080 }}>
      <PageHeaderV2 title={title} subtitle={subtitle} breadcrumb={breadcrumb} actions={actions} />
      <div style={{ display: 'grid', gridTemplateColumns: aside ? '1.5fr 1fr' : '1fr', gap: 20, alignItems: 'start' }}>
        <div>{main}</div>
        {aside && <div>{aside}</div>}
      </div>
    </div>
  );
}
