# syntax=docker/dockerfile:1.7
# Imagem da API Ajuda-aí (NestJS). Build: a partir de code/back/api
#   docker build -t ajudaai-api .
# Nenhum segredo entra na imagem: tudo vem de variáveis de ambiente no runtime.

ARG NODE_VERSION=24-alpine

# ---------- 1. dependências completas + build ----------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---------- 2. só dependências de produção ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ---------- 3. runtime ----------
FROM node:${NODE_VERSION} AS runtime
# NODE_ENV=production em homologação e produção; quem diferencia é APP_ENV
# (definido no Container App, nunca na imagem).
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node package.json ./
# CA pública do Supabase (não é segredo); DB_SSL_CA=certs/supabase-ca.crt
COPY --chown=node:node certs ./certs

# Versão exibida em /health (o CI passa o SHA do commit).
ARG APP_VERSION=local
ENV APP_VERSION=${APP_VERSION}

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
