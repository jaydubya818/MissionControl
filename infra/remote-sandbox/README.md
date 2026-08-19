# Remote Sandbox image candidate

This image is the immutable toolchain candidate for `remote-sandbox/exe-dev/restricted-candidate-v1`.

It pins the exact Node base-image digest and Codex CLI package graph, installs the guest `nftables` enforcement dependency at image-build time, and creates the non-login `mc-attempt` user used for untrusted execution. Codex is not installed during an Attempt.

The image does not establish provider-level network isolation. exe.dev currently exposes custom image selection but no egress/firewall policy primitive through its documented or live CLI. The runtime profile therefore remains qualification-only and DEGRADED even when guest-kernel rules pass.

After the High/Critical gate passes, the image workflow publishes a public, repository-linked GHCR image so no registry credential is supplied to exe.dev or the VM. It emits an SPDX SBOM, fails before publication on High/Critical findings, and records the pushed digest and native Codex binary digest only for a passing candidate.
