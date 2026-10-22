FROM node:24-bookworm-slim AS base
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts/build.mjs ./scripts/build.mjs
RUN npm run build

FROM build AS migration
ENV NODE_ENV=production XDG_CACHE_HOME=/tmp/centerify-cache XDG_DATA_HOME=/tmp/centerify
COPY prisma.config.ts ./
COPY migrations ./migrations
USER node
CMD ["node", "node_modules/prisma/dist/prisma.js", "db", "migrate"]

FROM base AS production-dependencies
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

FROM golang:1.26-bookworm AS plugin-installer
WORKDIR /build
COPY tools/plugin-marketplace/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -buildid=" -o /centerify-plugins .

FROM base AS app
ENV NODE_ENV=production LOG_FORMAT=json XDG_DATA_HOME=/tmp/centerify
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node centerify.config.json centerify.config.schema.json ./
COPY --chown=node:node marketplace/catalog.json ./marketplace/catalog.json
COPY --chown=node:node scripts/healthcheck.mjs ./scripts/healthcheck.mjs
RUN mkdir -p /app/.centerify /app/plugins/installed && chown -R node:node /app/.centerify /app/plugins
USER node
STOPSIGNAL SIGTERM
CMD ["node", "--enable-source-maps", "dist/src/index.js"]

FROM app AS plugin-tools
COPY --from=plugin-installer /centerify-plugins /usr/local/bin/centerify-plugins
COPY --chown=node:node plugins/better-ticket/package ./plugins/better-ticket/package
ENTRYPOINT ["centerify-plugins", "--root", "/app", "--state", "/app/.centerify"]
CMD ["installed"]

FROM build AS dashboard-build
COPY dashboard/package.json dashboard/package-lock.json ./dashboard/
RUN cd dashboard && npm ci --ignore-scripts --no-audit --no-fund
COPY dashboard ./dashboard
ENV NEXT_TELEMETRY_DISABLED=1 CENTERIFY_DASHBOARD_STANDALONE=true
RUN cd dashboard && npm run build

FROM base AS dashboard-runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
COPY --from=dashboard-build --chown=node:node /app/dashboard/.next/standalone ./
COPY --from=dashboard-build --chown=node:node /app/dashboard/.next/static ./dashboard/.next/static
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node", "dashboard/server.js"]

FROM app AS runtime
