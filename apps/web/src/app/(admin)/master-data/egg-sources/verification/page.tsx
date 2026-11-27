import { Suspense } from 'react';
import { EggSourceVerificationPage } from '@/components/egg-sources/EggSourceCutover';
import { Busy } from '@/components/egg-sources/parts';

export default function EggSourceCutoverVerificationPage() {
  return <Suspense fallback={<Busy/>}><EggSourceVerificationPage/></Suspense>;
}
