'use client';
import React, { useEffect } from 'react';
import { AuthProvider }     from '@/contexts/AuthContext';
import { ThemeProvider }    from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { DialogProvider }   from '@/contexts/DialogContext';
import { ToastProvider }    from '@/contexts/ToastContext';
import { BrandProvider }    from '@/contexts/BrandContext';
import { ErrorBoundary }    from '@/components/ErrorBoundary';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    console.info(`[Phoenix ERP] build ${process.env.NEXT_PUBLIC_BUILD_SHA || 'unknown'}`);
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          <BrandProvider>
            <AuthProvider>
              <ToastProvider>
                <DialogProvider>
                  {children}
                </DialogProvider>
              </ToastProvider>
            </AuthProvider>
          </BrandProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
