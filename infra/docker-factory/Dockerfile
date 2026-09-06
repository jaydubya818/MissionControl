# Reuses the source-built, pinned Linux x64 Codex 0.146.0 toolchain.
# Docker execution is a new compatibility identity, not the prior VM qualification.
FROM ghcr.io/jaydubya818/mission-control-remote-sandbox@sha256:41a66f1d6f7b90618a6c58fb9a1a336ef69ab2794fc1322233e4a5d9788782b8
USER root
COPY --chmod=0555 bridge.mjs supervisor.mjs qualification.mjs runtime-fixture.mjs /opt/factory/
USER 10001:10001
ENV HOME=/var/lib/mission-control/attempt/home TMPDIR=/tmp
WORKDIR /var/lib/mission-control/attempt
ENTRYPOINT ["node", "/opt/factory/bridge.mjs"]
