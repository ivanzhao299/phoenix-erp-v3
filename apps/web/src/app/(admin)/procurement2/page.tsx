'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import u from '@/styles/uix-utils.module.css';

export default function ProcurementRootRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/procurement2/dashboard');
  }, [router]);

  return <div className={u.emptyCenter}>正在进入采购中心…</div>;
}
