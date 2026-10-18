# Isolated non-production Git/descriptor fault fixture; no Docker socket or keys.
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git python3 util-linux \
    && apt-get clean && rm -r /var/lib/apt/lists/*
WORKDIR /fixture
COPY . /fixture
ENV MAINTENANCE_NATIVE_GIT_FIXTURE=1
CMD ["node", "--test", "scripts/ops/production-maintenance-gated-checkout.test.mjs"]
