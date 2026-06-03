/**
 * Phoenix ERP — Design System V2（Phase UI-2.2 组件收口）
 * ════════════════════════════════════════════════════════════════════
 * 统一组件层单一入口。页面今后从此处 import，不再页面内自实现。
 *   import { KpiCardV2, DataTableV3, StatusBadge, ConfirmDialogV2 } from '@/components/design-system';
 *
 * 设计约定：
 *   · 颜色/暗色全部走 CSS 变量(var(--*)) 与 design-tokens.ts，无硬编码 hex
 *   · 暗色由 [data-theme=dark] 自动切换，组件无需感知
 *   · 本阶段只建组件，不改任何业务页面（迁移在 UI-2.3+）
 * ════════════════════════════════════════════════════════════════════
 */

// cards — F3: KpiCardV2 → KpiCard 别名（现有 KpiCardV2 引用继续生效）
export { KpiCardV2, KpiCardV2 as KpiCard } from './cards/KpiCardV2';
export type { KpiCardV2Props, KpiCardV2Props as KpiCardProps } from './cards/KpiCardV2';
export { MetricCard } from './cards/MetricCard';
export type { MetricCardProps } from './cards/MetricCard';
export { NavCardV2 } from './cards/NavCardV2';
export type { NavCardV2Props } from './cards/NavCardV2';
export { WarningCard } from './cards/WarningCard';
export type { WarningCardProps } from './cards/WarningCard';
export { StatStripV2, SummaryCard } from './cards/StatStripV2';
export type { StatStripV2Props, StatStripItem, SummaryCardProps } from './cards/StatStripV2';

// status
export { StatusBadge } from './status/StatusBadge';
export { StatusBadge as StatusBadgeV2 } from './status/StatusBadge';   // V2 别名（同一实现）
export type { StatusBadgeProps } from './status/StatusBadge';

// tables
export { DataTableV3 } from './tables/DataTableV3';
export type { DataTableV3Props, ColumnV3 } from './tables/DataTableV3';

// forms
export { FormField, fieldInputStyle } from './forms/FormField';
export type { FormFieldProps } from './forms/FormField';
export { AmountInput, CurrencyInput } from './forms/AmountInput';
export type { AmountInputProps } from './forms/AmountInput';
export { DateRangePicker } from './forms/DateRangePicker';
export type { DateRange, DateRangePickerProps } from './forms/DateRangePicker';
export { SelectField, CompanySelector, ProjectSelector, StatusSelector } from './forms/SelectField';
export type { Option, SelectFieldProps } from './forms/SelectField';
export { AttachmentUploader } from './forms/AttachmentUploader';
export type { AttachmentUploaderProps } from './forms/AttachmentUploader';
export { TextInput, SelectInput, DateInput, UserSelector, AttachmentField } from './forms/Inputs';
export type { TextInputProps } from './forms/Inputs';

// dialogs
export { ModalV2 } from './dialogs/ModalV2';
export type { ModalV2Props } from './dialogs/ModalV2';
export { ConfirmDialogV2 } from './dialogs/ConfirmDialogV2';
export type { ConfirmDialogV2Props } from './dialogs/ConfirmDialogV2';

// drawers
export { DrawerV2 } from './drawers/DrawerV2';
export type { DrawerV2Props } from './drawers/DrawerV2';

// detail
export { DetailPanel } from './detail/DetailPanel';
export type { DetailPanelProps, DetailItem } from './detail/DetailPanel';
export { DetailGrid } from './detail/DetailGrid';
export type { DetailGridItem } from './detail/DetailGrid';
export { AuditTimeline } from './detail/AuditTimeline';
export type { AuditTimelineProps, TimelineItem } from './detail/AuditTimeline';
export { AttachmentViewer } from './detail/AttachmentViewer';
export type { AttachmentViewerProps } from './detail/AttachmentViewer';

// timeline
export { WorkflowTimeline } from './timeline/WorkflowTimeline';
export type { WorkflowStep } from './timeline/WorkflowTimeline';

// feedback
export { EmptyState } from './feedback/EmptyState';
export type { EmptyStateProps } from './feedback/EmptyState';
export { LoadingSkeleton } from './feedback/LoadingSkeleton';
export type { LoadingSkeletonProps } from './feedback/LoadingSkeleton';
export { ErrorState } from './feedback/ErrorState';
export type { ErrorStateProps } from './feedback/ErrorState';
export { PermissionDeniedState, NoDataState } from './feedback/States';

// layouts
export { PageShell } from './layouts/PageShell';
export type { PageShellProps } from './layouts/PageShell';
export { PageHeaderV2, PageBreadcrumb, PageSection, PageToolbar, PageActions } from './layouts/PageParts';
export type { PageHeaderV2Props, Crumb } from './layouts/PageParts';

// charts
export { ChartCard } from './charts/ChartCard';
export type { ChartCardProps } from './charts/ChartCard';

// mobile kit
export { MobilePageShell, MobileStatCard, MobileActionButton } from './mobile/MobileKit';
export type { MobilePageShellProps } from './mobile/MobileKit';

// workbench kit
export { WorkbenchShell, WorkbenchActionButton, WorkbenchStatusCard } from './workbench/WorkbenchKit';
export {
  WorkbenchHeader, WorkbenchProductCard, WorkbenchCartPanel,
  WorkbenchSummaryBar, WorkbenchKeypad, WorkbenchEmptyState,
} from './workbench/WorkbenchParts';

// displays
export { MoneyDisplay, DateDisplay, CompactStatusBadge } from './status/Displays';

// templates
export { ListPageTemplate, DashboardTemplate, DetailPageTemplate } from './templates/PageTemplates';
export type { ListPageTemplateProps } from './templates/PageTemplates';
export {
  MasterDataTemplate, DocumentTemplate, LedgerTemplate, ApprovalTemplate,
  ConfigTemplate, DetailTemplate, MobileTemplate, WorkbenchTemplate,
} from './templates/Templates';
export type {
  MasterDataTemplateProps, DocumentTemplateProps, LedgerTemplateProps, ApprovalTemplateProps,
  ConfigTemplateProps, ConfigSection, DetailTemplateProps, MobileTemplateProps, WorkbenchTemplateProps,
} from './templates/Templates';
