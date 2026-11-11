# Web do Canteiro (Next.js). Imagem com o servidor standalone do Next; API_URL, AGENTE_URL e PROXY_SEGREDO são lidos
# em tempo de execução (docker run --env-file .env), nunca embutidos no build.
# A base vai fixada pelo digest do índice multi-arquitetura (amd64 e arm64): a tag node:24-slim muda por baixo sem
# aviso; o Dependabot propõe o digest novo.
FROM node:24-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS deps
RUN corepack enable
WORKDIR /app
# o .pnpmfile.cjs entra na conta do lockfile: sem ele o install congelado recusa
COPY package.json pnpm-lock.yaml .pnpmfile.cjs ./
RUN pnpm install --frozen-lockfile

FROM node:24-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS build
RUN corepack enable
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:24-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# Os arquivos do app ficam do root: o processo roda como node e não consegue reescrever o próprio código.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/srv/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
