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

# 用 pnpm deploy 创建独立的生产目录（解决 pnpm 虚拟存储符号链接问题）
WORKDIR /workspace
RUN pnpm deploy --filter phoenix-erp-v3-nest --prod /app-deploy

# ─── Stage 2: runtime ──────────────────────────────────────────
FROM node:20-alpine AS runtime
ARG GIT_SHA
LABEL org.opencontainers.image.revision=$GIT_SHA

LABEL org.opencontainers.image.title="Phoenix ERP V3 API"
LABEL org.opencontainers.image.description="NestJS backend for Phoenix ERP V3"
LABEL org.opencontainers.image.source="https://github.com/ivanzhao299/phoenix-erp"

# 装健康检查需要的 curl + tini（PID1）+ su-exec（entrypoint 降权用）
RUN apk add --no-cache curl tini su-exec

WORKDIR /app

# 从 builder 复制编译产物 + 独立生产依赖（pnpm deploy 产物，无虚拟存储符号链接）
COPY --from=builder /app-deploy/node_modules  ./node_modules
COPY --from=builder /workspace/apps/api/dist  ./dist
COPY --from=builder /app-deploy/package.json  ./package.json

# 非 root 用户 phoenix（node 进程最终以它运行）
# G133：显式建 /app/uploads/contracts 并归 phoenix——合同附件落盘目录。命名卷 phoenix_uploads
#   挂载到 /app/uploads；Docker 对**全新**卷从镜像该路径继承属主，故先建好+chown，新卷即 phoenix 可写。
RUN addgroup -S phoenix && adduser -S phoenix -G phoenix \
    && mkdir -p /app/uploads/contracts \
    && chown -R phoenix:phoenix /app
# 注意：不设 USER——以 root 启动 entrypoint 先修卷属主（存量 root 卷的关键），再 su-exec 降权到 phoenix。

ENV NODE_ENV=production
ENV PORT=3100
EXPOSE 3100

# 健康检查：每 30s curl 一次 /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3100/api/health || exit 1

# G133：以 root 跑 entrypoint——修复命名卷 phoenix_uploads 的属主（存量卷是 root 所有，
#   非 root 容器写 /app/uploads/contracts 会 EACCES 致上传 500），再用 su-exec 降权到 phoenix 跑 node。
#   tini 仍是 PID1（正确处理信号 + 收割僵尸）。CMD 通过 "$@" 传入，保持可覆盖。
ENTRYPOINT ["/sbin/tini", "--", "sh", "-c", "chown -R phoenix:phoenix /app/uploads 2>/dev/null || true; exec su-exec phoenix \"$@\"", "--"]
CMD ["node", "dist/main"]
