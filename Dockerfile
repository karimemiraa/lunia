# syntax=docker/dockerfile:1
#
# Multi-stage production image for the Lunia Next.js app.
#
# Prisma 7 + @prisma/adapter-pg notes (read before touching this file):
# - The Prisma client talks to Postgres through the `pg` driver adapter, so
#   no Prisma query-engine binary is needed at runtime.
# - `prisma generate` (run in the `build` stage) validates `prisma.config.ts`,
#   which resolves `DATABASE_URL` via `env()`. It never connects to a
#   database, but it does require the variable to be *set* to something
#   syntactically valid, so the build stage sets dummy connection values.
#   Do not point these at anything real.
# - `src/lib/env.ts` (zod) and `src/lib/db.ts` (which builds the pg adapter
#   at module scope) are imported while Next.js "collects page data" during
#   `next build`, which means DATABASE_URL, REDIS_URL, SESSION_SECRET and
#   APP_URL must ALL be present (with placeholder values) at build time, not
#   just DATABASE_URL. Real values are supplied at container runtime via
#   `.env.prod` (see docker-compose.prod.yml) and are NOT baked into the
#   image.
# - Next's standalone output tracing (`.next/standalone`) does not pick up
#   `@prisma/adapter-pg` (nor its own dependency chain: driver-adapter-utils,
#   debug) because nothing in the traced bundle statically resolves those
#   files the way the tracer expects under pnpm's symlinked store. The extra
#   COPY lines in the `run` stage below patch that gap by copying the exact
#   pnpm-store packages and the top-level `@prisma/adapter-pg` symlink from
#   the `build` stage's full install. `pg` and `postgres-array` themselves
#   ARE picked up correctly by the tracer and need no extra handling.
#   If `pnpm-lock.yaml` bumps these packages, re-verify with:
#     docker run --rm lunia:test node -e \
#       "require('@prisma/client'); require('@prisma/adapter-pg'); console.log('ok')"

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Dummy build-time values only — schema/env validation needs *a* value, not
# a reachable database or a real secret. Never used to connect anywhere.
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db" \
    REDIS_URL="redis://localhost:6379" \
    SESSION_SECRET="build-time-placeholder-secret-not-for-real-use-only" \
    APP_URL="http://localhost:3000" \
    NODE_ENV="production"
RUN pnpm db:generate && pnpm build

FROM base AS run
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma

# --- Prisma driver-adapter files missing from the standalone trace ---
# See the block comment at the top of this file for why these are needed.
# NOTE: we copy the real pnpm-store package directories, then RECREATE the
# top-level `@prisma/adapter-pg` symlink with `ln -s` instead of copying it
# directly. `COPY --from=` across build stages dereferences a symlink into a
# plain directory copy of just the target's own files — which for a pnpm
# package throws away the private `node_modules` (pg, postgres-array,
# @prisma/driver-adapter-utils) that lives as a *sibling* of that target
# inside the pnpm-store folder, breaking its own internal requires.
# Recreating the symlink instead keeps pnpm's real structure intact.
COPY --from=build /app/node_modules/.pnpm/@prisma+adapter-pg@7.10.0 ./node_modules/.pnpm/@prisma+adapter-pg@7.10.0
COPY --from=build /app/node_modules/.pnpm/@prisma+driver-adapter-utils@7.10.0 ./node_modules/.pnpm/@prisma+driver-adapter-utils@7.10.0
COPY --from=build /app/node_modules/.pnpm/@prisma+debug@7.10.0 ./node_modules/.pnpm/@prisma+debug@7.10.0
# The standalone tracer half-copies postgres-array@3.0.4 (package.json only,
# no index.js) because it only reaches the 2.0.0 copy (a `pg` dependency)
# through a traced path; adapter-pg needs the untraced 3.0.4 copy in full.
COPY --from=build /app/node_modules/.pnpm/postgres-array@3.0.4 ./node_modules/.pnpm/postgres-array@3.0.4
RUN ln -s ../.pnpm/@prisma+adapter-pg@7.10.0/node_modules/@prisma/adapter-pg ./node_modules/@prisma/adapter-pg

EXPOSE 3000
CMD ["node", "server.js"]
