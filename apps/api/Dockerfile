# ═══════════════════════════════════════════════════════════════
#  Phoenix ERP V3 API — multi-stage build
# ═══════════════════════════════════════════════════════════════

# ─── Stage 1: builder ──────────────────────────────────────────
FROM node:20-alpine AS builder

# pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /workspace

# 复制 monorepo 顶层 + workspace 声明
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# 装依赖（仅 API；--filter 跳过 web 节省时间）
RUN pnpm install --frozen-lockfile --filter phoenix-erp-v3-nest...

# 复制 API 源码 + tsconfig
COPY apps/api ./apps/api

# 编译
WORKDIR /workspace/apps/api
RUN pnpm build

# 修剪 devDependencies
RUN pnpm prune --prod

# ─── Stage 2: runtime ──────────────────────────────────────────
FROM node:20-alpine AS runtime

LABEL org.opencontainers.image.title="Phoenix ERP V3 API"
LABEL org.opencontainers.image.description="NestJS backend for Phoenix ERP V3"
LABEL org.opencontainers.image.source="https://github.com/ivanzhao299/phoenix-erp"

# 装健康检查需要的 curl
RUN apk add --no-cache curl tini

WORKDIR /app

# 从 builder 复制编译产物 + 仅生产依赖
COPY --from=builder /workspace/apps/api/dist          ./dist
COPY --from=builder /workspace/apps/api/node_modules  ./node_modules
COPY --from=builder /workspace/apps/api/package.json  ./package.json
# bcrypt 等可能需要 prebuilds；不再 npm rebuild

# 非 root 用户
RUN addgroup -S phoenix && adduser -S phoenix -G phoenix \
    && chown -R phoenix:phoenix /app
USER phoenix

ENV NODE_ENV=production
ENV PORT=3100
EXPOSE 3100

# 健康检查：每 30s curl 一次 /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3100/api/health || exit 1

# tini 当 PID 1：正确处理信号 + zombie reap
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main"]
