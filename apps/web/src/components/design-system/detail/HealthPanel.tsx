'use client';

/**
 * HealthPanel — Phoenix DS（UIX-2 P1-F）
 * 数据质量 / 治理评分多维度面板。已对接 /api/data-quality/scores 数据结构。
 */

import React from 'react';
import { Activity } from 'lucide-react';

export interface HealthDimension {
  label: string;
  score: number; // 0-100
  /** 可选权重，用于显示"占比" */
  weight?: number;
}

export interface HealthPanelProps {
  overall: number;
  dimensions: HealthDimension[];
  /** "as of" 时间 */
  asOf?: string;
  /** 告警条数（HIGH/MEDIUM/LOW） */
  alertCount?: number;
  highAlertCount?: number;
  /** 颜色阈值（默认 < 60 危险，< 80 警告，>= 80 良好） */
  thresholds?: { warn: number; bad: number };
}

function scoreColor(score: number, thresholds: { warn: number; bad: number }) {
  if (score < thresholds.bad)  return 'var(--status-danger)';
  if (score < thresholds.warn) return 'var(--status-warning)';
  return 'var(--status-success)';
}

export function HealthPanel({
  overall, dimensions, asOf, alertCount, highAlertCount,
  thresholds = { warn: 80, bad: 60 },
}: HealthPanelProps) {
  return (
    <section style={{
      padding: 16, background: 'var(--bg-card)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-card)',
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Activity size={16} color="var(--color-primary)" />
        <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>数据质量评分</strong>
        {asOf ? (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
            截至 {new Date(asOf).toLocaleString('zh-CN')}
          </span>
        ) : null}
      </header>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div style={{
          width: 96, height: 96, borderRadius: '50%',
          background: 'conic-gradient(' + scoreColor(overall, thresholds) + ' ' + (overall * 3.6) + 'deg, var(--bg-muted) 0)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          <div style={{
            width: 76, height: 76, borderRadius: '50%', background: 'var(--bg-card)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <strong style={{ fontSize: 24, color: scoreColor(overall, thresholds) }}>{overall}</strong>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>综合</span>
          </div>
        </div>

        {(alertCount !== undefined || highAlertCount !== undefined) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {typeof alertCount === 'number' && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                告警 <strong style={{ color: 'var(--text-primary)', fontSize: 14 }}>{alertCount}</strong> 条
              </div>
            )}
            {typeof highAlertCount === 'number' && highAlertCount > 0 && (
              <div style={{ fontSize: 12, color: 'var(--status-danger)' }}>
                HIGH <strong style={{ fontSize: 14 }}>{highAlertCount}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {dimensions.map((d) => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 100, fontSize: 12, color: 'var(--text-secondary)' }}>{d.label}</span>
            <div style={{
              flex: 1, height: 6, borderRadius: 100, background: 'var(--bg-muted)', overflow: 'hidden',
            }}>
              <div style={{
                width: d.score + '%', height: '100%',
                background: scoreColor(d.score, thresholds),
                transition: 'width var(--duration-base) var(--ease-smooth)',
              }} />
            </div>
            <span style={{
              width: 36, textAlign: 'right', fontSize: 12, fontWeight: 600,
              color: scoreColor(d.score, thresholds),
            }}>{d.score}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default HealthPanel;
