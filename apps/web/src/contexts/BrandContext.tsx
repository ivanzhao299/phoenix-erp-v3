'use client';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export interface BrandConfig {
  system_name:  string;
  company_name: string;
  tagline:      string;   // 登录页副标题，如「企业级直营运营系统 · Phoenix V3」
  logo_url:     string;
  footer_text:  string;
  favicon_url:  string;
}

const DEFAULT_BRAND: BrandConfig = {
  system_name:  '金凤凰 ERP',
  company_name: '凤凰农业食品集团',
  tagline:      '企业级直营运营系统 · Phoenix V3',
  logo_url:     '',
  footer_text:  '© 2026 Phoenix ERP · All rights reserved',
  favicon_url:  '',
};

interface BrandContextValue {
  brand:        BrandConfig;
  reloadBrand:  () => void;
}

const BrandContext = createContext<BrandContextValue>({
  brand:       DEFAULT_BRAND,
  reloadBrand: () => {},
});

/** 动态更新浏览器 favicon */
function applyFavicon(dataUrl: string) {
  if (typeof window === 'undefined') return;
  const url = dataUrl || '/favicon.ico';
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url;
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrand] = useState<BrandConfig>(DEFAULT_BRAND);

  const reloadBrand = useCallback(() => {
    fetch('/api/system/brand')
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.data) {
          const b: BrandConfig = { ...DEFAULT_BRAND, ...d.data };
          setBrand(b);
          // ✅ 同步浏览器标签标题
          if (b.system_name) document.title = b.system_name;
          // ✅ 同步 favicon（优先 favicon_url，其次 logo_url）
          const iconUrl = b.favicon_url || b.logo_url || '';
          applyFavicon(iconUrl);
          // ✅ 将 logo 缓存到 localStorage，供下次页面加载时同步应用（防止刷新/退出后图标丢失）
          try { localStorage.setItem('phoenix_logo', iconUrl); } catch {}
        }
      })
      .catch(() => {}); // 离线/API 未启动时静默降级
  }, []);

  useEffect(() => {
    reloadBrand();
  }, [reloadBrand]);

  const value = useMemo(() => ({ brand, reloadBrand }), [brand, reloadBrand]);

  return (
    <BrandContext.Provider value={value}>
      {children}
    </BrandContext.Provider>
  );
}

export const useBrand = () => useContext(BrandContext);
