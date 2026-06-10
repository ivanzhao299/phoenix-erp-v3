'use client';
import React from 'react';
import {
  cockpitCard,
  cockpitCardHeader,
  cockpitCardHeaderTitle,
} from '../cockpit-styles';

/**
 * Panel — 全局容器卡：统一边框 / 圆角 / 头部，与组织架构等标杆页完全一致。
 * 各页"面板/卡片容器"统一用它，禁止再自写 rounded/border/shadow 容器
 * （杜绝各页容器圆角、边框、头部风格不一）。
 *
 * 用法：
 *   <Panel title="用户列表" icon={<Users size={14}/>} extra={<span>38 人</span>}>
 *     ...内容...
 *   </Panel>
 */
export interface PanelProps {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  /** 头部右侧附加：计数 / 刷新按钮等 */
  extra?: React.ReactNode;
  children: React.ReactNode;
  /** body 内距（px）。列表/自管内距的内容传 false。默认 12 */
  bodyPadding?: number | false;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}

export function Panel({
  title, icon, extra, children, bodyPadding = 12, style, bodyStyle,
}: PanelProps) {
  return (
    <div style={{ ...cockpitCard, ...style }}>
      {(title != null || icon || extra) && (
        <div style={cockpitCardHeader}>
          {icon}
          {title != null && <span style={cockpitCardHeaderTitle}>{title}</span>}
          {extra && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              {extra}
            </div>
          )}
        </div>
      )}
      <div
        style={{
          flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
          ...(bodyPadding !== false ? { padding: bodyPadding } : {}),
          ...bodyStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
