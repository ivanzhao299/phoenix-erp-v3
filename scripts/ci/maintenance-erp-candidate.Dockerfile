FROM node:20-bookworm-slim
ARG SOURCE_SHA
ARG FIXTURE_OWNER
LABEL org.opencontainers.image.revision=$SOURCE_SHA
LABEL phoenix.test.owner=$FIXTURE_OWNER
LABEL phoenix.test.kind="maintenance-erp-candidate"
WORKDIR /app
COPY dist ./dist
COPY node_modules ./node_modules
COPY package.json ./package.json
COPY fixture-preload.cjs ./fixture-preload.cjs
RUN node -e "require('fs').mkdirSync('/app/uploads',{recursive:true});require('fs').chownSync('/app/uploads',1000,1000)"
USER 1000:1000
CMD ["node", "--require", "/app/fixture-preload.cjs", "dist/main.js"]
