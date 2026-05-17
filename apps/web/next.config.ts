import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Turbopack root = monorepo 根目录（防止误判到 /Users/mac/package-lock.json）
  turbopack: { root: path.resolve(__dirname, "../..") },

  // ✅ 允许 HMR 跨源 (Next 16 开发期跨源保护)
  // 不在白名单的 origin 会拿到首屏 HTML 但 JS hydration / HMR 全部失效, 表现为按钮死、输入框无反应
  allowedDevOrigins: [
    "127.0.0.1", "localhost",
    "192.168.31.5",   // 本机 LAN IP（当前）
    "192.168.124.4",  // 本机 LAN IP（旧网段）
    "192.168.124.2",  // 审计 iMac LAN IP
    "192.168.124.1",  // 路由器/其它 LAN 设备
  ],

  // ── API 反向代理 ─────────────────────────────────────────────────
  // 通过 API_TARGET 环境变量指定后端地址；默认 http://127.0.0.1:3100 (生产标准)
  // dev 想用其它端口（如 3101 绕过 phoenix-erp-v3-nest），在 apps/web/.env.local 里覆盖：
  //   API_TARGET=http://127.0.0.1:3101
  async rewrites() {
    const target = process.env.API_TARGET || "http://127.0.0.1:3100";
    return [
      {
        source: "/api/:path*",
        destination: `${target}/api/:path*`,
      },
    ];
  },

  // ── 图片域名白名单 ───────────────────────────────────────────────
  images: {
    remotePatterns: [
      { protocol: "http",  hostname: "127.0.0.1" },
      { protocol: "https", hostname: "**" },
    ],
  },

  // ── 生产构建安全头 ───────────────────────────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options",    value: "nosniff" },
          { key: "X-Frame-Options",           value: "SAMEORIGIN" },
          { key: "X-XSS-Protection",          value: "1; mode=block" },
          { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
        ],
      },
      // 静态资源缓存：仅生产环境设长缓存，开发环境不干预（让 Turbopack 自行管理）
      ...(process.env.NODE_ENV === "production" ? [{
        source: "/_next/static/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      }] : []),
    ];
  },

  // ── 编译优化 ────────────────────────────────────────────────────
  compiler: {
    // 生产环境移除 console.log（保留 warn/error）
    removeConsole: process.env.NODE_ENV === "production"
      ? { exclude: ["error", "warn"] }
      : false,
  },

  // ── 性能 ─────────────────────────────────────────────────────────
  poweredByHeader: false,   // 移除 X-Powered-By 响应头
  compress: true,            // 启用 gzip 压缩
  reactStrictMode: true,     // 严格模式（帮助发现副作用问题）

  // ── 实验性优化 ───────────────────────────────────────────────────
  experimental: {
    // 优化包导入，减少首屏 bundle 大小
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
