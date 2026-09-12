# Separate candidate image: preserve the approved qualification parent unchanged.
FROM mission-control/factory-docker-qualification@sha256:32951f1bd7974c9f6e7d37e75b5356ba0196120448b8b10b47bb34fc2dbe34e2
USER root
COPY bridge.mjs supervisor.mjs /opt/factory/
USER 10001:10001
