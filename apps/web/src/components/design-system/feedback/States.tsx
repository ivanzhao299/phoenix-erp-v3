'use client';
import React from 'react';
import { Lock, SearchX } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * 全局反馈态补充（Design System V2）。
 */

/** PermissionDeniedState — 无权限态 */
export function PermissionDeniedState({ message }: { message?: string }) {
  const { t } = useLanguage();
  const resolvedMessage = message ?? t('ui.您没有访问该内容的权限，请联系管理员。', '您没有访问该内容的权限，请联系管理员。');
  return <EmptyState icon={Lock} title={t('ui.无访问权限','无访问权限')} description={resolvedMessage} />;
}

/** NoDataState — 无数据/无结果态（带可选筛选提示） */
export function NoDataState({ title, description, action }: { title?: string; description?: string; action?: React.ReactNode }) {
  const { t } = useLanguage();
  const resolvedTitle = title ?? t('ui.暂无数据', '暂无数据');
  return <EmptyState icon={SearchX} title={resolvedTitle} description={description} action={action} />;
}
