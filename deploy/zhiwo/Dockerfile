# syntax=docker/dockerfile:1.7
FROM node:24.8.0-bookworm-slim@sha256:cadbfafeb6baf87eaaffa40b3640209c4b7fd38cebde65059d15bc39cd636b85 AS build

ENV CI=1 \
  ZHIWO_SOURCE_ARCHIVE_BUILD=true
WORKDIR /source
RUN corepack enable \
  && corepack prepare pnpm@11.7.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm run zhiwo:build \
  && pnpm --config.inject-workspace-packages=true --filter @deepseek-ai/dsh-zhiwo deploy --prod /release \
  && node /release/lib/bin.js version

FROM node:24.8.0-bookworm-slim@sha256:cadbfafeb6baf87eaaffa40b3640209c4b7fd38cebde65059d15bc39cd636b85 AS runtime

ENV NODE_ENV=production \
  ZHIWO_LISTEN_HOST=0.0.0.0 \
  ZHIWO_LISTEN_PORT=13081 \
  ZHIWO_METRICS_PORT=13082 \
  ZHIWO_STATE_ROOT=/var/lib/zhiwo/state \
  ZHIWO_KNOWLEDGE_ROOT=/var/lib/zhiwo/knowledge
RUN groupadd --gid 10001 zhiwo \
  && useradd --uid 10001 --gid zhiwo --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin zhiwo \
  && apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/* \
  && install -d -o zhiwo -g zhiwo -m 0700 /var/lib/zhiwo/state /var/lib/zhiwo/knowledge
COPY --from=build --chown=zhiwo:zhiwo /release /app
WORKDIR /app
USER 10001:10001
EXPOSE 13081
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:13081/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["node", "lib/bin.js"]
CMD ["serve"]
