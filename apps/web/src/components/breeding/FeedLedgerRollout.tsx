'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import request from '@/lib/api-client';
import { secondaryActionButton } from '@/components/design-system/cockpit-styles';
import ScopedFeedLedger from './ScopedFeedLedger';
import styles from './ScopedFeedLedger.module.css';

type Phase = 'LEGACY' | 'PILOT' | 'ACTIVE';

export default function FeedLedgerRollout({ legacy }: { legacy: ReactNode }) {
  const { t } = useLanguage();
  const [phase, setPhase] = useState<Phase>();
  const [checkFailed, setCheckFailed] = useState(false);
  const [preview, setPreview] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void request<{ code: number; data?: { phase: Phase } }>('/farm/feed/scoped/rollout', { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        const value = result?.data?.phase;
        if (result.code !== 200 || (value !== 'LEGACY' && value !== 'PILOT' && value !== 'ACTIVE')) {
          setCheckFailed(true);
          return;
        }
        setPhase(value);
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
          setPhase('LEGACY');
        } else {
          setCheckFailed(true);
        }
      });
    return () => controller.abort();
  }, [revision]);

  if (checkFailed) return <div role="alert">
    <p>{t('ui.feedRolloutUnavailable', '暂时无法确认饲料账的启用状态。')}</p>
    <button type="button" style={secondaryActionButton} onClick={() => {
      setCheckFailed(false);
      setRevision(value => value + 1);
    }}>{t('common.retry', '重试')}</button>
  </div>;
  if (!phase) return <p role="status">{t('common.loading', '加载中…')}</p>;
  if (phase === 'ACTIVE') return <ScopedFeedLedger />;

  return <>
    <div className={styles.filters}>
      <button type="button" style={secondaryActionButton} onClick={() => setPreview(value => !value)}>
        {preview ? t('ui.feedLegacyEntry', '返回原饲料账') : t('ui.feedScopedEntry', '按农场核对新版饲料账')}
      </button>
      {preview && phase === 'PILOT' && <p role="status">{t('ui.feedPilotNotice', '试点期间两个账独立记录，请在签认后切换正式口径。')}</p>}
    </div>
    {preview ? <ScopedFeedLedger /> : legacy}
  </>;
}
