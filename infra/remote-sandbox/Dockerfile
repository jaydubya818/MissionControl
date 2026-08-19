# syntax=docker/dockerfile:1.7

FROM cgr.dev/chainguard/node:latest-dev@sha256:a80a0ccda073dd286414fe410189d2c749038af4c874e5e2be6d6fb8acc53182

USER root

LABEL org.opencontainers.image.source="https://github.com/jaydubya818/MissionControl"
LABEL org.opencontainers.image.description="Mission Control exe.dev restricted-profile candidate"
LABEL org.opencontainers.image.licenses="UNLICENSED"
LABEL exe.dev/login-user="root"

RUN apk upgrade --no-cache \
  && apk add --no-cache \
    busybox=1.38.0-r1 \
    ca-certificates \
    git \
    iproute2 \
    nftables \
    procps \
    setpriv \
    shadow \
    util-linux-misc

WORKDIR /opt/mission-control/codex
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
  && test "$(node --version)" = "v26.7.0" \
  && test "$(node_modules/.bin/codex --version)" = "codex-cli 0.146.0" \
  && ln -s /opt/mission-control/codex/node_modules/.bin/codex /usr/local/bin/codex \
  && rm -rf /usr/lib/node_modules/npm /usr/bin/npm /usr/bin/npx

RUN groupadd --gid 10001 mc-attempt \
  && useradd --uid 10001 --gid 10001 --home-dir /var/lib/mission-control/attempt/home --no-create-home --shell /usr/sbin/nologin mc-attempt \
  && mkdir -p /var/lib/mission-control/attempt/home /var/lib/mission-control/attempt/tmp /etc/mission-control \
  && chown root:root /var/lib/mission-control/attempt /etc/mission-control \
  && chmod 0711 /var/lib/mission-control/attempt \
  && chown mc-attempt:mc-attempt /var/lib/mission-control/attempt/home /var/lib/mission-control/attempt/tmp \
  && chmod 0700 /var/lib/mission-control/attempt/home /var/lib/mission-control/attempt/tmp \
  && chmod 0755 /etc/mission-control

COPY toolchain-inputs.json /etc/mission-control/toolchain-inputs.json
RUN native_binary="/opt/mission-control/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex" \
  && test -x "$native_binary" \
  && sha256sum "$native_binary" | awk '{print $1}' >/etc/mission-control/codex-binary.sha256 \
  && sha256sum /etc/mission-control/toolchain-inputs.json | awk '{print $1}' >/etc/mission-control/toolchain-inputs.sha256 \
  && chmod 0444 /etc/mission-control/toolchain-inputs.json /etc/mission-control/codex-binary.sha256 /etc/mission-control/toolchain-inputs.sha256

WORKDIR /var/lib/mission-control/attempt
