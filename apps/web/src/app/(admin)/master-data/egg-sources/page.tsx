import { Suspense } from 'react';
import Workspace from '@/components/egg-sources/Workspace';
import { Busy } from '@/components/egg-sources/parts';

export default function EggSourcesPage() {
  return <Suspense fallback={<Busy/>}><Workspace/></Suspense>;
}
