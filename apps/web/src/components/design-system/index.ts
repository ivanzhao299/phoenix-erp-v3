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

// cards
export { KpiCardV2 } from './cards/KpiCardV2';
export type { KpiCardV2Props } from './cards/KpiCardV2';

// status
export { StatusBadge } from './status/StatusBadge';
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
export { AuditTimeline } from './detail/AuditTimeline';
export type { AuditTimelineProps, TimelineItem } from './detail/AuditTimeline';
export { AttachmentViewer } from './detail/AttachmentViewer';
export type { AttachmentViewerProps } from './detail/AttachmentViewer';

// feedback
export { EmptyState } from './feedback/EmptyState';
export type { EmptyStateProps } from './feedback/EmptyState';
export { LoadingSkeleton } from './feedback/LoadingSkeleton';
export type { LoadingSkeletonProps } from './feedback/LoadingSkeleton';
export { ErrorState } from './feedback/ErrorState';
export type { ErrorStateProps } from './feedback/ErrorState';

// layouts
export { PageShell } from './layouts/PageShell';
export type { PageShellProps } from './layouts/PageShell';

// charts
export { ChartCard } from './charts/ChartCard';
export type { ChartCardProps } from './charts/ChartCard';
