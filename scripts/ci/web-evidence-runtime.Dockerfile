# Isolated real ERP Web fixture. This is not a production deployment image.
FROM node:20-bookworm-slim
ARG GIT_SHA
LABEL org.opencontainers.image.revision="${GIT_SHA}"
LABEL phoenix.fixture.kind="erp-web-evidence"
WORKDIR /app
COPY --chown=node:node standalone ./
COPY --chown=node:node static ./apps/web/.next/static
COPY --chown=node:node public ./apps/web/public
COPY --chown=node:node web-evidence-runtime.fixture.mjs /fixture/web-evidence-runtime.fixture.mjs
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
USER node
CMD ["node", "/fixture/web-evidence-runtime.fixture.mjs"]
