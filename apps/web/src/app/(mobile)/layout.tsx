'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !isLoggedIn && pathname !== '/mobile/login') {
      router.replace(`/mobile/login?return=${encodeURIComponent(pathname)}`);
    }
  }, [loading, isLoggedIn, pathname, router]);

  return <>{children}</>;
}
