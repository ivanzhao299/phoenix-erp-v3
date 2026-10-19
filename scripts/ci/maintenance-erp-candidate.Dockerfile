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
# The host evidence directory stays0700/0600. A supervisor using umask077
# must still produce a readable UID1000 image payload. No host chmod occurs.
RUN chmod -R a+rX /app/dist /app/node_modules /app/package.json /app/fixture-preload.cjs \
    && node -e "require('fs').mkdirSync('/app/uploads',{recursive:true});require('fs').chownSync('/app/uploads',1000,1000)"
USER 1000:1000
HEALTHCHECK --interval=1s --timeout=4s --start-period=3s --retries=10 CMD ["node", "-e", "fetch('http://127.0.0.1:3100/api/readiness',{signal:AbortSignal.timeout(3000)}).then(async r=>{const b=await r.json();process.exit(r.ok&&b.status==='READY'&&b.db==='connected'?0:1)}).catch(()=>process.exit(1))"]
CMD ["node", "--require", "/app/fixture-preload.cjs", "dist/main.js"]
