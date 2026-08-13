ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
WORKDIR /app

ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

FROM base AS dependencies
COPY package*.json ./
RUN npm ci

FROM dependencies AS development
ENV NODE_ENV=development
COPY . .
CMD ["npm", "run", "start:dev"]

FROM dependencies AS build
COPY nest-cli.json tsconfig*.json ./
COPY prisma ./prisma
COPY src ./src
RUN npm run prisma:generate && npm run build

FROM base AS production-dependencies
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    API_PREFIX=api \
    XDG_CACHE_HOME=/tmp/.cache

COPY --chown=node:node package*.json ./
COPY --chown=node:node --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --chown=node:node --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/prisma ./prisma

RUN mkdir -p storage/media && chown -R node:node storage

USER node
STOPSIGNAL SIGTERM

FROM runtime AS migration
CMD ["npm", "run", "prisma:migrate:deploy"]

FROM runtime AS worker
CMD ["node", "dist/src/worker.js"]

FROM runtime AS api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT}/${API_PREFIX}/health" || exit 1
CMD ["node", "dist/src/main.js"]
