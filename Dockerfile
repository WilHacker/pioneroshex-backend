FROM node:24-alpine AS base
# Misma versión que "packageManager" en package.json. No se usa corepack: Node 25+ ya no lo incluye.
ARG PNPM_VERSION=11.25.0
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app

# Dependencias completas + compilación
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
# El cliente de Prisma no está en git: se genera antes de compilar.
RUN pnpm exec prisma generate && pnpm build

# Solo dependencias de producción
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Imagen final ligera, sin pnpm ni código fuente
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main"]
