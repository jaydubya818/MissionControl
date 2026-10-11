FROM public.ecr.aws/docker/library/node@sha256:3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0 AS toolchain
RUN set -eu; \
    mkdir -p /rootfs/jail/runtime /rootfs/jail/workspace /rootfs/jail/tmp; \
    cp --parents /usr/bin/env /usr/sbin/chroot /rootfs; \
    ldd /usr/bin/env /usr/sbin/chroot | awk '{ for (i=1;i<=NF;i++) if ($i ~ /^\// && $i !~ /:$/) print $i }' | sort -u | xargs -r cp --parents --target-directory=/rootfs; \
    cp /usr/local/bin/node /rootfs/jail/runtime/node; \
    ldd /usr/local/bin/node | awk '{ for (i=1;i<=NF;i++) if ($i ~ /^\//) print $i }' | sort -u | xargs -r cp --parents --target-directory=/rootfs/jail
COPY bridge.mjs /rootfs/jail/runtime/invoke.mjs
COPY invocation-binding.json /rootfs/jail/runtime/invocation-binding.json
RUN node -e 'const fs=require("fs"),c=require("crypto");const files=["/usr/local/bin/node","/usr/bin/env","/usr/sbin/chroot"];fs.writeFileSync("/rootfs/jail/runtime/toolchain.json",JSON.stringify({platform:process.platform,architecture:process.arch,node:process.version,versions:process.versions,binaries:Object.fromEntries(files.map(p=>[p,c.createHash("sha256").update(fs.readFileSync(p)).digest("hex")]))})+"\n")'; \
    chmod -R a-w /rootfs/jail/runtime
FROM scratch
ARG SOURCE_REVISION
LABEL org.opencontainers.image.title="MissionControl isolated native runtime successor" \
      org.opencontainers.image.version="3" \
      org.opencontainers.image.revision=$SOURCE_REVISION
COPY --from=toolchain /rootfs/ /
ENTRYPOINT ["/usr/sbin/chroot", "--userspec=65534:65534", "/jail", "/runtime/node", "/runtime/invoke.mjs"]
