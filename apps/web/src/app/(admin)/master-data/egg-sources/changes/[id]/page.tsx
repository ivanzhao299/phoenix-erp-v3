import { Suspense } from 'react';
import ChangeDetail from '@/components/egg-sources/ChangeDetail';
import { Busy } from '@/components/egg-sources/parts';

export default async function EggSourceChangePage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  return <Suspense fallback={<Busy/>}><ChangeDetail id={id}/></Suspense>;
}
