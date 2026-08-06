# syntax=docker/dockerfile:1

# ddREST — https://github.com/LarveyOfficial/ddREST
#
# Bun runs TypeScript directly, so there is no build step: dependencies are
# installed in one layer and the source copied in another, which keeps rebuilds
# cheap when only source changes.

FROM oven/bun:1-alpine AS deps
WORKDIR /app

# Only the manifests, so this layer is reused unless dependencies actually move.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine AS runtime
WORKDIR /app

# busybox wget backs the healthcheck; tini reaps zombies and forwards signals so
# the container stops promptly; su-exec drops privileges in the entrypoint.
RUN apk add --no-cache tini su-exec

COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# The session database lives here. Declared so a container run without an
# explicit mount still keeps sessions across restarts.
RUN mkdir -p /data
VOLUME ["/data"]

# 127.0.0.1 (the default) would only be reachable from inside the container.
ENV HOST=0.0.0.0 \
    PORT=8787 \
    SESSION_DB_PATH=/data/sessions.db \
    NODE_ENV=production \
    PUID=1000 \
    PGID=1000

# Starts as root only to fix /data ownership, then drops to PUID:PGID. Pass
# --user to skip that entirely; the entrypoint handles both.
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["bun", "src/index.ts"]

LABEL org.opencontainers.image.title="ddREST" \
      org.opencontainers.image.description="A REST implementation of the DoorDash Consumer MCP server." \
      org.opencontainers.image.source="https://github.com/LarveyOfficial/ddREST" \
      org.opencontainers.image.licenses="NOASSERTION"
