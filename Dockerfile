FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.logging.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npx tsc --build tsconfig.logging.json

FROM node:24-slim
# Prisma's query engine links against OpenSSL
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/data/database.db
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./
VOLUME /app/data
HEALTHCHECK --interval=30s CMD ["node", "dist/healthcheck.js"]
CMD ["sh", "docker-entrypoint.sh"]
