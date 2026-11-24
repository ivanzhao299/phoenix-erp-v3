import { redirect } from 'next/navigation';
import { lifecycleLegacyLocation, type LegacySearch } from '@/components/breeding/flock-lifecycle-workspace';

export default async function Page({ searchParams }: { searchParams: Promise<LegacySearch> }) {
  redirect(lifecycleLegacyLocation(false, await searchParams));
}
