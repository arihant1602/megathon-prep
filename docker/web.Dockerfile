# Any Next.js app in apps/. Build from the repo root:
#   docker build -f docker/web.Dockerfile --build-arg APP=kestrel .
# On Railway set the service variable APP=<name>; Railway passes declared ARGs at build time.
ARG APP

FROM node:24-alpine AS deps
ARG APP
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/platform/package.json packages/platform/
COPY apps/kestrel/package.json apps/kestrel/
COPY apps/boli/package.json apps/boli/
COPY apps/onboard/package.json apps/onboard/
COPY apps/margin/package.json apps/margin/
COPY services/collab/package.json services/collab/
RUN npm ci -w apps/${APP} -w packages/platform --no-audit --no-fund

FROM deps AS builder
ARG APP
COPY packages/platform packages/platform
COPY apps/${APP} apps/${APP}
ENV NEXT_TELEMETRY_DISABLED=1 BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime
RUN npm run build -w apps/${APP}

# Tiny standalone migration runner (drizzle-orm + pg only).
FROM node:24-alpine AS migrator
WORKDIR /migrate
RUN npm init -y >/dev/null && npm i --no-audit --no-fund drizzle-orm@0.45.4 pg@8 && npm pkg set type=module
COPY packages/platform/drizzle ./drizzle
COPY packages/platform/migrate.mjs ./

FROM node:24-alpine AS runner
ARG APP
ENV APP=${APP} NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=::
WORKDIR /app
COPY --from=migrator /migrate /migrate
COPY --from=builder /repo/apps/${APP}/.next/standalone ./
COPY --from=builder /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=builder /repo/apps/${APP}/public ./apps/${APP}/public
USER node
EXPOSE 3000
CMD ["sh", "-c", "exec node apps/$APP/server.js"]
