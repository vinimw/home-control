# syntax=docker/dockerfile:1.7
# Build context: repository root (see compose.yaml).
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @home-control/shared build \
    && pnpm --filter @home-control/api build \
    && pnpm --filter @home-control/api deploy --legacy --prod /out

FROM node:22-alpine AS runner
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3001 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# SQLite lives here; mount a named volume to persist it.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["node", "dist/index.js"]
