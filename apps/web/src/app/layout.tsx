import type { Metadata, Viewport } from "next";
import { Providers } from "@/providers/providers";
import "./globals.css";

// ✅ 移除 next/font/google — 生产环境无法访问 Google Fonts
// 字体通过 globals.css 的 @import + display=swap 加载，或使用系统字体栈 fallback
// 构建服务器（无公网）不应依赖外部字体 CDN

export const metadata: Metadata = {
  title: "金凤凰 ERP — Phoenix ERP V3",
  description: "Phoenix ERP V3 — 鸡蛋供应链管理系统（老挝凤羽农业）",
  robots: { index: false, follow: false },
  manifest: "/manifest.json",
};

// ✅ Next.js 16 要求：viewport 必须独立导出，不能放在 metadata 里
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f59e0b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning：layout 内的 inline script 会在 hydration 前根据
    // localStorage 把 data-theme 改成 dark/light，这是已知的安全 hydration 偏差
    <html lang="zh-CN" data-theme="light" suppressHydrationWarning>
      <head>
        {/* ── 主题 + Favicon 初始化脚本（同步阻塞执行，防止刷新/退出后闪白/图标丢失）── */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  try {
    /* 1. 主题 */
    var t = localStorage.getItem('phoenix_theme');
    var resolved;
    if (t === 'dark') { resolved = 'dark'; }
    else if (t === 'light') { resolved = 'light'; }
    else { resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
    document.documentElement.setAttribute('data-theme', resolved);

    /* 2. Favicon — 从缓存同步恢复，无需等待 API */
    var logo = localStorage.getItem('phoenix_logo');
    if (logo) {
      var link = document.createElement('link');
      link.rel = 'icon';
      link.href = logo;
      document.head.appendChild(link);
    }
  } catch(e) {}
})();`,
          }}
        />
        {/* 预连接字体 CDN，减少 DNS 查找延迟 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* ── PWA Service Worker 注册 (生产环境启用；dev 不缓存避免冲突 HMR) ── */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  if (!('serviceWorker' in navigator)) return;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    /* dev 环境主动卸载，避免 SW 缓存 HMR 资源 */
    navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});});
    return;
  }
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function(err){
      console.warn('[Phoenix SW] register failed:', err);
    });
  });
})();`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
