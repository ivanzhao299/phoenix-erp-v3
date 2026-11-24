import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import FlockLifecycleWorkspace from '@/components/breeding/FlockLifecycleWorkspace';
import { isLifecycleSection } from '@/components/breeding/flock-lifecycle-workspace';

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isLifecycleSection(section)) notFound();
  return <Suspense><FlockLifecycleWorkspace key={section} section={section} /></Suspense>;
}
