FROM node:22-bookworm-slim
RUN useradd --system phoenix
WORKDIR /workspace/apps/api
COPY node_modules /workspace/node_modules
COPY apps/api/node_modules ./node_modules
COPY --chown=phoenix:root apps/api/dist ./dist
COPY apps/api/package.json ./package.json
ENV NODE_ENV=production
CMD ["node", "dist/main"]
