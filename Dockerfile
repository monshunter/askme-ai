# syntax=docker/dockerfile:1.7

FROM node:24-bookworm AS build

WORKDIR /src
RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends musl-tools \
  && rm -rf /var/lib/apt/lists/*

COPY . .
ARG DSH_CLIENT_COMMIT_HASH=0000000
ENV DSH_CLIENT_COMMIT_HASH=${DSH_CLIENT_COMMIT_HASH}
RUN pnpm install --frozen-lockfile
RUN pnpm run build
RUN pnpm --dir native/landlock-run build:native
RUN pnpm --config.inject-workspace-packages=true \
  --config.ignore-scripts=true \
  --filter @deepseek-ai/dsh deploy --prod /opt/zhiwo \
  && test -z "$(find -L /opt/zhiwo/node_modules -type l -print -quit)"

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
COPY --from=build --chown=node:node /opt/zhiwo/ ./

RUN mkdir -p /data/dsh && chown -R node:node /data

ENV NODE_ENV=production \
    DSH_HOME=/data/dsh \
    DSH_TELEMETRY_DISABLED=1 \
    ZHIWO_WORKSPACE_ROOT=/data/userdata \
    ZHIWO_LISTEN_HOST=0.0.0.0 \
    ZHIWO_LISTEN_PORT=18000

USER node
EXPOSE 18000
VOLUME ["/data/dsh"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:18000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "lib/bin.js", "web", "--patch", "node_modules/@deepseek-ai/dsh-zhiwo-product/cordis.patch.yml", "--no-open"]
