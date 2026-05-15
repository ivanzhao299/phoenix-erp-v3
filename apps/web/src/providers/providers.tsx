'use client';
import React from 'react';
import { AuthProvider }     from '@/contexts/AuthContext';
import { ThemeProvider }    from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { DialogProvider }   from '@/contexts/DialogContext';
import { ToastProvider }    from '@/contexts/ToastContext';
import { BrandProvider }    from '@/contexts/BrandContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
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
  );
}
