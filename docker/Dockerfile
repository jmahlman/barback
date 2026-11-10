# syntax=docker/dockerfile:1

# Barback — single-container build.
#
# Build from the repository root, which is the build context:
#   docker build -f docker/Dockerfile .
# The ignore list is .dockerignore at the root, since that is where every
# builder looks for it.
# Debian slim rather than Alpine: better-sqlite3 ships glibc prebuilds, which
# avoids a from-source native compile on most machines.
ARG NODE_VERSION=26-bookworm-slim

# ---------------------------------------------------------------------------
# deps — full install, including the toolchain for native modules
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# The schema comes first: package.json has a postinstall that generates the
# Prisma client, and it cannot do that without the schema to generate from.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---------------------------------------------------------------------------
# builder — generate the Prisma client and compile the app
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV DATABASE_URL="file:./data/build.db"
ENV NEXT_TELEMETRY_DISABLED=1

# The real secret is supplied at runtime. This placeholder only satisfies
# imports during the build, so it is set for this one command rather than
# as an ENV, which would keep it in the stage's configuration.
RUN BETTER_AUTH_SECRET="build-time-placeholder-not-used-at-runtime" \
    sh -c 'npx prisma generate && npm run build'

# ---------------------------------------------------------------------------
# prisma-cli — the migration tool, installed on its own
#
# The CLI pulls in a large dependency tree that has nothing to do with the
# running app, so it lives in its own prefix rather than being merged into the
# standalone bundle's node_modules.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS prisma-cli
ARG PRISMA_VERSION=7.10.1
WORKDIR /opt/prisma
RUN npm init -y >/dev/null \
    && npm install --omit=dev --no-audit --no-fund "prisma@${PRISMA_VERSION}"

# ---------------------------------------------------------------------------
# runner — the shipped image
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

# Where the source is, and under what license. GHCR uses the source label to
# link the package to its repository.
LABEL org.opencontainers.image.title="Barback" \
      org.opencontainers.image.description="Self-hosted home bar inventory, recipes and cocktail discovery." \
      org.opencontainers.image.source="https://github.com/jmahlman/barback" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:/data/barback.db"
ENV UPLOAD_DIR="/data/uploads"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data/uploads \
    && chown -R node:node /data

# Next's standalone bundle: server plus only the modules it actually uses.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# The license travels with the software, as the AGPL expects.
COPY --from=builder --chown=node:node /app/LICENSE /app/NOTICE ./

# The Prisma CLI and the migration history, so the schema is brought up to
# date when the container starts.
COPY --from=prisma-cli --chown=node:node /opt/prisma /opt/prisma
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --chown=node:node docker/prisma.config.ts /opt/prisma/prisma.config.ts

COPY --chown=node:node docker/entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/sign-in').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
