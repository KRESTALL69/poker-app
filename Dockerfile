# ── Stage 1: install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars are baked into the client JS bundle at build time.
# They MUST be supplied here — runtime injection does not affect the client.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN npm run build

# ── Stage 3: migrator ────────────────────────────────────────────────────────
# Runs Drizzle migrations (scripts/migrate.mjs) against Postgres. Extends
# `deps`, not `builder` — a migration run needs node_modules (devDependencies
# included, so drizzle-orm/postgres-js is present) plus the raw source
# (drizzle.config.ts, lib/db/), never the compiled Next.js build output.
# Same reasoning ReRaise's own Dockerfile documents for its migrator stage.
# Never built as part of the default `docker build` (last stage) — only
# reachable via an explicit `--target migrator` build.
FROM deps AS migrator
COPY . .
CMD ["npm", "run", "db:migrate"]

# ── Stage 4: production runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Public assets
COPY --from=builder /app/public ./public

# Locally-stored avatars (LocalAvatarStorageRepository) -- bind-mounted on
# the VPS (see compose.yaml), pre-created here with nextjs ownership so the
# non-root runtime user can write to it. Same pattern as ReRaise's Dockerfile.
RUN mkdir -p public/storage/avatars && \
    chown -R nextjs:nodejs public/storage

# Next.js standalone output: when WORKDIR is /app the basename is "app", so
# the standalone server lands at .next/standalone/app/ — copy that directory
# directly into /app so server.js sits at the container root.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Client-side static assets must be at .next/static/ relative to server.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
