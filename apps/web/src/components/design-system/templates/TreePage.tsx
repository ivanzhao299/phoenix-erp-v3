'use client';

/**
 * TreePage / TreePanel — Phoenix DS（UIX-2 P1-D）
 * 左侧树 + 右侧详情 的双栏页模板。组织树 / 项目树 / 分类树通用。
 */

import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useLanguage } from "@/contexts/LanguageContext";

export interface TreeNode {
  id: string;
  label: string;
  /** 状态徽标（可选） */
  status?: string;
  children?: TreeNode[];
  /** 自定义右侧附属（如：成员数 / 角色数） */
  meta?: React.ReactNode;
}

export interface TreePanelProps {
  nodes: TreeNode[];
  selectedId?: string;
  onSelect: (id: string, node: TreeNode) => void;
  /** 默认展开所有 */
  defaultExpanded?: boolean;
  emptyText?: string;
  width?: number;
}

export function TreePanel({
  nodes, selectedId, onSelect,
  defaultExpanded = true, emptyText, width = 280,
}: TreePanelProps) {
  const { t } = useLanguage();
  const emptyTextResolved = emptyText ?? t('ui.暂无节点', '暂无节点');
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => openMap[id] ?? defaultExpanded;
  const toggle = (id: string) => setOpenMap(m => ({ ...m, [id]: !isOpen(id) }));

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const hasKids = !!node.children?.length;
    const open = isOpen(node.id);
    const selected = selectedId === node.id;
    return (
      <React.Fragment key={node.id}>
        <div
          role="treeitem"
          aria-selected={selected}
          aria-expanded={hasKids ? open : undefined}
          onClick={() => onSelect(node.id, node)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            paddingLeft: 8 + depth * 16, paddingRight: 8,
            height: 32, cursor: 'pointer',
            background: selected ? 'var(--bg-muted)' : 'transparent',
            borderLeft: selected ? '3px solid var(--color-primary)' : '3px solid transparent',
            color: 'var(--text-primary)',
            fontSize: 13,
            transition: 'background var(--duration-fast) var(--ease-smooth)',
          }}
        >
          {hasKids ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle(node.id); }}
              aria-label={open ? t('ui.收起', '收起') : t('ui.展开', '展开')}
              style={{
                width: 18, height: 18, padding: 0, background: 'transparent', border: 'none',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : <span style={{ width: 18 }} />}
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.label}
          </span>
          {node.meta}
        </div>
        {hasKids && open ? node.children!.map(k => renderNode(k, depth + 1)) : null}
      </React.Fragment>
    );
  };

  return (
    <aside
      role="tree"
      style={{
        width, minWidth: width, maxHeight: '70vh', overflowY: 'auto',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
      }}
    >
      {nodes.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          {emptyTextResolved}
        </div>
      ) : (
        nodes.map(n => renderNode(n, 0))
      )}
    </aside>
  );
}

export interface TreePageProps {
  tree: TreeNode[];
  selectedId?: string;
  onSelect: (id: string, node: TreeNode) => void;
  detail: React.ReactNode;
  treeWidth?: number;
}

export function TreePage({ tree, selectedId, onSelect, detail, treeWidth = 280 }: TreePageProps) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <TreePanel nodes={tree} selectedId={selectedId} onSelect={onSelect} width={treeWidth} />
      <div style={{ flex: 1, minWidth: 0 }}>{detail}</div>
    </div>
  );
}

export default TreePage;
