# Qualified runtime distribution approval request

Status: PREPARED, NOT PUBLISHED. Fresh-environment registry retrieval is NOT_RUN.

Approve copying the existing qualified OCI artifact into a new private package at `ghcr.io/jaydubya818/missioncontrol-native-runtime`. Proposed retention tag: `qualified-v3-912e26eb`. The retrieval reference must be `ghcr.io/jaydubya818/missioncontrol-native-runtime@sha256:bddbcca962226a60fe962ccd5812b04b480064004b97e04a97f7166bc3be233a` after the registry confirms that exact manifest. This reference is proposed, not an existing verified package.

The original artifact is `.sources/native-successor-912e26eb/image.tar` in the enterprise workspace, SHA256 `4b93462b2a5c8ac6408d613b0f01a8729cd15834caea08ca555727105e1634d0`. It is 49,308,160 bytes. Configuration digest is `sha256:dadde9fff32581d2ebad5eda80c675f4e69a0805c7dbd3952119735db0a6da0b`. Runtime source is `912e26ebd2b08c2c58f7cbfc1b903c1d52c4851e`, runtime/harness 3/3, linux/amd64. Preserve the existing build provenance, context bytes, toolchain hashes and successor qualification manifest beside the release record. No rebuild, relabeling, recompression, manifest conversion or binary-equivalence claim is permitted.

## Requested authority

- Create and write only the proposed private container package, with read access for a clean verification environment.
- Use an operator-configured package credential through its normal credential store. Do not paste a token into chat, source, logs or command arguments.
- Grant no delete permission, public visibility, deployment, production execution, model spending or external-alpha changes.
- Retain the qualified manifest and layers indefinitely until an explicit owner-approved retirement. Exempt this digest and its retention tag from cleanup. Keep the local archive and checksum as an independent recovery copy. Registry retention configuration must be verified after publication; this document is not an enforced registry policy.

Current read-only package enumeration returned HTTP 403, requiring `read:packages`. No credential scope was changed. GitHub documents `write:packages` for publication and private package access controls. See [Container registry authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) and [package access control](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility).

## Reviewed transfer and retrieval procedure

After approval and credential setup, first verify the local archive with `scripts/qualification/inspect-native-successor.mjs`. Use an installed, recorded Skopeo version and its existing auth file. The proposed transfer is:

```sh
skopeo copy --preserve-digests oci-archive:/absolute/path/image.tar docker://ghcr.io/jaydubya818/missioncontrol-native-runtime:qualified-v3-912e26eb
```

Skopeo's [digest preservation option](https://github.com/podman-container-tools/skopeo/blob/main/docs/skopeo-copy.1.md) must fail the transfer if it cannot retain the image digest. Record the actual registry manifest bytes and confirm their SHA256. Then use a fresh environment without the local image cache:

```sh
skopeo copy --preserve-digests docker://ghcr.io/jaydubya818/missioncontrol-native-runtime@sha256:bddbcca962226a60fe962ccd5812b04b480064004b97e04a97f7166bc3be233a oci-archive:/fresh/path/retrieved.tar
node scripts/qualification/inspect-native-successor.mjs /fresh/path/retrieved.tar /path/to/retained-build-provenance /fresh/path/inspection
```

Compare the inspected manifest, configuration, layers, architecture, source and toolchain to `successor-artifact.json`. OCI archive packaging may differ; compare content-addressed image identities, not an assumed identical outer tar file. Record the newly retrieved archive checksum separately. Do not execute the image as part of this distribution step. Qualification fails if any image identity differs.

Package visibility, retention and fresh-environment retrieval remain approval-gated. All unrelated readiness engineering can be reviewed independently.
