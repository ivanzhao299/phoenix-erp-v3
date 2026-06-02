'use client';
import React from 'react';
import { Lock, SearchX } from 'lucide-react';
import { EmptyState } from './EmptyState';

/**
 * 全局反馈态补充（Design System V2）。
 */

/** PermissionDeniedState — 无权限态 */
export function PermissionDeniedState({ message = '您没有访问该内容的权限，请联系管理员。' }: { message?: string }) {
  return <EmptyState icon={Lock} title="无访问权限" description={message} />;
}

/** NoDataState — 无数据/无结果态（带可选筛选提示） */
export function NoDataState({ title = '暂无数据', description, action }: { title?: string; description?: string; action?: React.ReactNode }) {
  return <EmptyState icon={SearchX} title={title} description={description} action={action} />;
}
