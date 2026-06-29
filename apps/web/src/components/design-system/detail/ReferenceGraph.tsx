'use client';

/**
 * ReferenceGraph — Phoenix DS（UIX-2 P1-E）
 * 主数据"被引用"关系可视化（依赖 /api/master-data/references/:type/:code）。
 * 不强依赖 d3，使用纯 div + flex 渲染：中心节点 + 周边业务表卡片。
 */

import React from 'react';
import Link from 'next/link';
import { Link2 } from 'lucide-react';
import { useLanguage } from "@/contexts/LanguageContext";

export interface ReferenceItem {
  refTable: string;
  refDocType: string;
  refCount: number;
  example?: string[];
  linkPattern?: string;
}

export interface ReferenceGraphProps {
  objectType: string;
  objectCode: string;
  references: ReferenceItem[];
  isReferenced: boolean;
  canArchive: boolean;
  /** 中心节点显示名（默认 objectCode）*/
  centerLabel?: string;
}

export function ReferenceGraph({
  objectType, objectCode, references, isReferenced, canArchive, centerLabel,
}: ReferenceGraphProps) {
  const { t } = useLanguage();
  return (
    <section style={{
      padding: 16, background: 'var(--bg-card)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-card)',
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Link2 size={16} color="var(--color-primary)" />
        <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{t('ui.引用关系','引用关系')}</strong>
        <span style={{
          marginLeft: 'auto', fontSize: 12,
          color: canArchive ? 'var(--status-success)' : 'var(--status-warning)',
        }}>
          {canArchive ? t('ui.✓ 可归档','✓ 可归档') : t('ui.⚠ 归档阻断','⚠ 归档阻断')}
        </span>
      </header>

      {!isReferenced ? (
        <div style={{
          padding: '32px 16px', textAlign: 'center',
          color: 'var(--text-secondary)', fontSize: 13,
        }}>
          {t('ui.当前没有任何业务单据引用','当前没有任何业务单据引用')} <code style={{ color: 'var(--color-primary)' }}>{objectCode}</code>{t('ui.，可以安全归档。','，可以安全归档。')}
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '12px 16px', marginBottom: 16,
            background: 'var(--bg-muted)',
            borderRadius: 'var(--radius-card)',
          }}>
            <strong style={{ color: 'var(--color-primary)', fontSize: 14 }}>
              {centerLabel || objectCode}
            </strong>
            <span style={{
              marginLeft: 8, padding: '2px 8px', fontSize: 12,
              background: 'var(--color-primary)', color: 'var(--text-on-dark)',
              borderRadius: 100,
            }}>{objectType}</span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 12,
          }}>
            {references.map((ref) => {
              const href = ref.linkPattern?.replace(':code', objectCode);
              const card = (
                <div style={{
                  padding: 12,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-card)',
                  display: 'flex', flexDirection: 'column', gap: 6,
                  transition: 'border-color var(--duration-fast) var(--ease-smooth)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{ref.refDocType}</strong>
                    <span style={{
                      padding: '0 8px', fontSize: 12, fontWeight: 600,
                      background: 'var(--status-warning)', color: 'var(--text-on-dark)',
                      borderRadius: 100,
                    }}>{ref.refCount}</span>
                  </div>
                  <code style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{ref.refTable}</code>
                  {ref.example?.length ? (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {t('ui.例：','例：')}{ref.example.slice(0, 2).join(', ')}{ref.example.length > 2 ? '…' : ''}
                    </div>
                  ) : null}
                </div>
              );
              return href ? (
                <Link key={ref.refTable} href={href} style={{ textDecoration: 'none' }}>{card}</Link>
              ) : (
                <div key={ref.refTable}>{card}</div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export default ReferenceGraph;
