# Imagem única: o servidor Fastify entrega a API e o build do web/.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace server && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/prompts server/prompts
COPY --from=build /app/web/dist web/dist
# Banco SQLite (usuários, configuração e histórico). Monte um volume aqui para não perder os
# dados ao recriar o container: docker run -v issue-doc-generator-dados:/app/data ...
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]
ENV ARQUIVO_BANCO=/app/data/issue-doc-generator.db
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:3000/api/saude || exit 1
CMD ["node", "server/dist/index.js"]
