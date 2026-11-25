import { Suspense } from 'react';
import NewChange from '@/components/egg-sources/NewChange';
import { Busy } from '@/components/egg-sources/parts';

export default function NewEggSourcePage() {
  return <Suspense fallback={<Busy/>}><NewChange/></Suspense>;
}
