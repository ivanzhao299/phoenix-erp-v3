'use client';
import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';

/**
 * EntityWorkspace — 复杂实体「工作台」全宽详情页模板。
 * 用于"实体 + 多个子集合"的复杂编辑（用户/角色/组织等），替代塞不下的侧抽屉。
 * 结构：返回 + 实体头(标题/副标题/状态/操作) + 页签 Tab + 当前页内容。
 * 各页内容用全局 Panel 组织。全 inline 封装、渲染可靠。
 *
 * 用法：
 *   <EntityWorkspace title="宋明光" subtitle="养殖场长" status={<StatusBadge/>}
 *     onBack={()=>router.push('/settings/users')} actions={<button>保存</button>}
 *     tabs={[{key:'basic',label:'基本信息',content:<.../>}, ...]} />
 */
export interface EntityTab {
  key: string;
  label: React.ReactNode;
  content: React.ReactNode;
}
export interface EntityWorkspaceProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  status?: React.ReactNode;
  onBack?: () => void;
  actions?: React.ReactNode;
  tabs: EntityTab[];
  defaultTab?: string;
  maxWidth?: number;
}

export function EntityWorkspace({
  title, subtitle, status, onBack, actions, tabs, defaultTab, maxWidth,
}: EntityWorkspaceProps) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.key);
  const cur = tabs.find(t => t.key === active) ?? tabs[0];
  return (
    <div style={{ padding: '24px 32px', maxWidth, margin: maxWidth ? '0 auto' : undefined }}>
      {/* 实体头 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        {onBack && (
          <button
            onClick={onBack}
            title="返回"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
            {status}
          </div>
          {subtitle && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {actions && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>{actions}</div>}
      </div>

      {/* 页签 */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {tabs.map(t => {
          const on = t.key === cur?.key;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              style={{
                padding: '9px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: 14, fontWeight: on ? 700 : 500,
                color: on ? 'var(--color-primary)' : 'var(--text-secondary)',
                borderBottom: on ? '2px solid var(--color-primary)' : '2px solid transparent',
                marginBottom: -1, transition: 'color .12s',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 当前页内容 */}
      <div>{cur?.content}</div>
    </div>
  );
}
