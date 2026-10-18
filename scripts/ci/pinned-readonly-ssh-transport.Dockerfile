FROM node:20-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssh-client openssh-server \
 && rm -r /var/lib/apt/lists/* \
 && usermod -p x root
# Synthetic isolated test account only. Password/interactive auth stays disabled.
# Build context is a dedicated temporary directory with these two sources only.
WORKDIR /fixture
COPY pinned-readonly-ssh-transport.mjs pinned-readonly-ssh-transport.fixture.mjs /fixture/
ENTRYPOINT ["/usr/local/bin/node", "/fixture/pinned-readonly-ssh-transport.fixture.mjs", "--inside-owned-fixture"]
