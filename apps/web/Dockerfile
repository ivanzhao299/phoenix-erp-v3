# ═══════════════════════════════════════════════════════════════
#  Phoenix ERP V3 Web — multi-stage build (Next.js standalone)
# ═══════════════════════════════════════════════════════════════

# ─── Stage 1: builder ──────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /workspace

# 复制 monorepo 顶层清单（利用 Docker layer cache）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json  apps/web/
COPY apps/api/package.json  apps/api/

# 仅装 web 依赖
RUN pnpm install --frozen-lockfile --filter web...

# 复制源码
COPY apps/web ./apps/web

# API_TARGET 在 build 时嵌入 rewrites；Docker Compose 里 api 服务名固定为 api
ARG API_TARGET=http://api:3100
ARG GIT_SHA=unknown
ENV API_TARGET=${API_TARGET}
ENV NEXT_PUBLIC_BUILD_SHA=${GIT_SHA}
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /workspace
RUN pnpm --filter web build

# ─── Stage 2: runtime ──────────────────────────────────────────
FROM node:20-alpine AS runtime

ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="Phoenix ERP V3 Web"
LABEL org.opencontainers.image.description="Next.js frontend for Phoenix ERP V3"
LABEL org.opencontainers.image.source="https://github.com/ivanzhao299/phoenix-erp-v3"
LABEL org.opencontainers.image.revision="${GIT_SHA}"

RUN apk add --no-cache curl tini

WORKDIR /app

# outputFileTracingRoot 指向 monorepo 根后，standalone 结构为：
#   standalone/
#     node_modules/          ← monorepo 公共依赖
#     apps/web/
#       server.js            ← 入口
#       .next/server/        ← 服务端 JS chunk
#       node_modules/        ← web 专属依赖（若有）
COPY --from=builder /workspace/apps/web/.next/standalone ./
COPY --from=builder /workspace/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder /workspace/apps/web/public           ./apps/web/public

RUN addgroup -S phoenix && adduser -S phoenix -G phoenix \
    && chown -R phoenix:phoenix /app
USER phoenix

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/ || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
# server.js 在 apps/web/ 子目录（monorepo outputFileTracingRoot 约定）
CMD ["node", "apps/web/server.js"]
