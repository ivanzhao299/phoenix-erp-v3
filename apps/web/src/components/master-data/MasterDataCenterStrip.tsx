'use client';

/**
 * MasterDataCenterStrip — UIX-PROD-2 升级为金融驾驶舱 KPI 风格
 *
 * 4 张 KpiCardV2：在管 / 运行（含进度条+健康度）/ 待审批 / 风险冻结
 * 与工作台 /master-data/operations/centers 同源
 */

import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Clock, Snowflake } from 'lucide-react';
import { useLanguage } from "@/contexts/LanguageContext";
import request from '@/lib/api-client';
import { KpiCardV2 } from '@/components/design-system/KpiCardV2';
import { CockpitGrid } from '@/components/design-system/CockpitGrid';

interface MemberStat {
  type: string;
  total: number;
  active: number;
  pending: number;
  frozen: number;
  archived: number;
}
interface CenterStat { members: MemberStat[]; }

export function MasterDataCenterStrip({ type }: { type: string }) {
  const { t } = useLanguage();
  const [stat, setStat] = useState<MemberStat | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    request<CenterStat[]>('/master-data/operations/centers', { silent: true })  // G70：可选总览，无权限时静默隐藏(不弹错误toast)
      .then(centers => {
        if (cancelled) return;
        setStat(centers.flatMap(c => c.members).find(m => m.type === type) ?? null);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [type]);

  if (loading) {
    return (
      <CockpitGrid cols={4} minItemWidth={180}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            minHeight: 86, borderRadius: 'var(--radius-card)',
            background: 'var(--bg-muted)', opacity: 0.4,
          }} />
        ))}
      </CockpitGrid>
    );
  }
  if (!stat) return null;

  const live = Math.max(stat.total - stat.archived, 0);
  const health = live > 0 ? Math.round((stat.active / live) * 100) : 100;

  return (
    <div style={{ marginBottom: 16 }}>
      <CockpitGrid cols={4} minItemWidth={180}>
        <KpiCardV2
          tone="default"
          icon={<Activity size={14} />}
          label={t('ui.在管总数','在管总数')}
          value={stat.total}
          suffix={t('ui.条','条')}
          hint={`含归档 ${stat.archived} 条`}
        />
        <KpiCardV2
          tone="success"
          icon={<CheckCircle2 size={14} />}
          label={t('ui.运行中','运行中')}
          value={stat.active}
          suffix={t('ui.条','条')}
          progress={{ value: health }}
          hint={<>{t('ui.健康度','健康度')} <strong style={{ color: 'var(--status-success)' }}>{health}%</strong></>}
        />
        <KpiCardV2
          tone={stat.pending > 0 ? 'warning' : 'default'}
          icon={<Clock size={14} />}
          label={t('ui.待审批','待审批')}
          value={stat.pending}
          suffix={t('ui.单','单')}
          hint={stat.pending > 0 ? t('ui.需要处理','需要处理') : t('ui.暂无积压','暂无积压')}
        />
        <KpiCardV2
          tone={stat.frozen > 0 ? 'danger' : 'default'}
          icon={<Snowflake size={14} />}
          label={t('ui.冻结 · 风险','冻结 · 风险')}
          value={stat.frozen}
          suffix={t('ui.条','条')}
          hint={stat.frozen > 0 ? t('ui.关注异常','关注异常') : t('ui.无风险','无风险')}
        />
      </CockpitGrid>
    </div>
  );
}

export default MasterDataCenterStrip;
