# Native successor build recipe checkpoint

The original native image remains UNAVAILABLE. This checkpoint adds a build recipe, not admitted execution authority. Explicit target is linux/amd64 so local Docker and hosted Linux qualification can use the same successor architecture. Generated input provenance distinguishes requested platform from later observed image metadata.

The canonical esbuild 0.27.0 builder captures bridge/backend input bytes. Final generation requires clean source, compares every captured input hash to that exact committed revision, rechecks HEAD and cleanliness, and rejects a reused context directory. The context contains only Dockerfile, bridge and immutable invocation binding. A pinned Node base supplies the minimal scratch image's env/chroot, node and required libraries. The workload runs nonroot inside a read-only chroot through the existing no-network/no-host-mount adapter.

Development controls passed against an explicitly unqualified dirty-source image: independent byte verification SUCCESS, changed candidate WORKLOAD_FAILURE, cancellation CANCELED and stale authority STALE, each with verified cleanup. Twenty-seven adapter/loader tests passed. Actual development metadata reported linux/amd64 and Node v24.21.0. These are component controls, not native accounting or enterprise gate qualification.

Independent security and architecture review found no blocker for the recipe checkpoint. Review requirements were incorporated: requested/observed architecture distinction, exact captured-source comparison, stable HEAD and clean tree. The next step rebuilds the committed clean recipe, retains image manifest/configuration identity, toolchain and archive hashes, then registers a distinct v3 composition and performs canonical execution qualification.

Paid operations 0. Production integration NOT_RUN. Publication DISABLED. Deployment NOT_AUTHORIZED. No historical or MyFactory runtime identity changed.
