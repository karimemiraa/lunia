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
# - Next's standalone-output tracer (`@vercel/nft`) does not reliably pick up
#   `@prisma/adapter-pg`'s own dependency chain (`@prisma/driver-adapter-utils`
#   -> `@prisma/debug`, `postgres-array`, `pg`) under pnpm's nested-symlink
#   store layout — `db.ts`'s `import { PrismaPg } from "@prisma/adapter-pg"`
#   is the only thing in the whole app that reaches that chain, and the
#   tracer can't statically prove the path through pnpm's `.pnpm/<pkg>@<ver>`
#   indirection.
#   We tried Next's `outputFileTracingIncludes` config (a version-wildcard
#   glob, so nothing pinned) to patch the gap instead of manually COPYing
#   pnpm-store folders. It sometimes produced a working image and sometimes
#   didn't — rebuilding with the exact same inputs surfaced a *different*
#   missing transitive module each time (first `@prisma/driver-adapter-utils`
#   entirely missing a top-level symlink, then, after adding that symlink
#   back, a `MODULE_NOT_FOUND` for `@prisma/debug` one level deeper — nft
#   dereferences nested pnpm symlinks inconsistently when copying via
#   include-globs, discarding a different sibling package each time). That
#   nondeterminism makes it unsafe to ship, so we dropped
#   `outputFileTracingIncludes` from next.config.ts entirely.
# - Fix actually used: the `run` stage below copies the **full** `node_modules`
#   from the `build` stage on top of the standalone output, instead of
#   cherry-picking files. A whole-directory `COPY` preserves pnpm's real
#   symlinks (only a symlink given directly as a COPY *source* gets
#   dereferenced — copying the directory that contains it does not), so the
#   entire adapter-pg -> driver-adapter-utils -> debug / pg / postgres-array
#   chain resolves exactly as it does in the `build` stage, with zero pinned
#   package or version names anywhere in this file. The tradeoff is a larger
#   image (full node_modules, including devDependencies) instead of the
#   trimmed standalone-only tree — an explicitly acceptable fallback when
#   trace-based inclusion isn't reliable enough to ship.
#   Re-verify after any Prisma/pnpm bump with:
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
    NODE_ENV="production" \
    # Raise V8's heap ceiling so the type-check/build survives on small hosts
    # (e.g. a 1GB VM); V8's default limit tracks physical RAM and swap doesn't
    # lift it, so a constrained box OOMs during `next build` without this.
    NODE_OPTIONS="--max-old-space-size=3072"
RUN pnpm db:generate && pnpm build

# --- Migrator/seed image: reuses the `build` stage's full node_modules ---
# This exists as its own named target (rather than relying on `run` also
# happening to have Prisma + tsx available — see that stage's comment below)
# so operational commands have one clearly-documented, stable entry point:
# `prisma migrate deploy` / `db:seed` always run via this image/target
# (see docker-compose.prod.yml's `migrate` service and
# deploy/scripts/deploy.sh), never via the `app` service's image, even
# though the latter happens to have the tooling too right now. If `run`'s
# node_modules is ever pruned back down to production-only deps (see that
# stage's comment), this is the one place that must keep working.
#
# IMPORTANT: this stage must stay *before* `run` in this file. `docker build`
# with no `--target` builds the LAST stage by default — `run` (the
# production image) must be that last stage, or a plain
# `docker build -t lunia:test .` silently builds the migrator image instead.
FROM build AS migrator
ENTRYPOINT ["corepack", "pnpm"]
CMD ["prisma", "migrate", "deploy"]

FROM base AS run
# HOSTNAME=0.0.0.0 so Next's standalone server binds to all interfaces; Docker
# otherwise sets HOSTNAME to the container id and Next binds only to that, which
# makes the compose healthcheck (http://localhost:3000) fail → nginx never
# starts. PORT is explicit for clarity.
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
# See the block comment at the top of this file: the standalone trace's own
# node_modules is unreliable for the Prisma adapter-pg chain, so the full
# `build`-stage node_modules (devDependencies included — prisma, tsx, etc.)
# replaces it wholesale here (preserves pnpm's real symlinks — no pinned
# package/version names). This means `app`'s image technically has Prisma's
# CLI and `tsx` available too, as a side effect, not by design — always run
# `migrate deploy` / `db:seed` via the dedicated `migrator` target /
# `migrate` compose service (see that stage's comment above and
# docs/RUNBOOK.md), not via `docker compose run app ...`.
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "server.js"]
