'use client';

import ScopedFeedLedger from '@/components/breeding/ScopedFeedLedger';
import { useMobilePermission } from '@/hooks/useMobilePermission';

export default function MobileFeedLedger() {
  const { allowed } = useMobilePermission('feed');
  return allowed ? <ScopedFeedLedger /> : null;
}
