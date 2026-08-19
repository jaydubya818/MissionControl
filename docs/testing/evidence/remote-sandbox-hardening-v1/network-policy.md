# Network policy qualification

## Requested boundary

The desired policy is deny by default, with HTTPS to `openrouter.ai` as the only permanent executor destination. Package registries are not required at Attempt startup because Codex is installed in the candidate image.

## Implemented candidate control

Before untrusted execution, the root bootstrap:

1. resolves `openrouter.ai` and rejects private, loopback, link-local, documentation, multicast, and other reserved results;
2. proves `1.1.1.1:443` is reachable as a pre-policy control;
3. freezes the approved A/AAAA records in `/etc/hosts`;
4. installs an nftables output chain scoped to UID 10001;
5. allows established traffic and TCP/443 only to the frozen OpenRouter addresses for that UID;
6. rejects every other packet for that UID, including DNS;
7. reruns probes as UID/GID 10001 with `no_new_privs`; and
8. starts Codex only when every proof is true.

The policy digest in both local runs was `sha256:9786bfac28a3a6ab4803c6aea27172a97b38e43ae2290945226a4ae7174530e0`.

## Positive and negative results

| Probe | Result | Scope |
| --- | --- | --- |
| OpenRouter HTTPS endpoint | PASS | Non-root executor in two fresh linux/amd64 containers |
| Previously reachable arbitrary external endpoint | BLOCKED | Same endpoint was reachable by root before policy |
| RFC1918 target | BLOCKED | Safe outcome under the UID policy |
| `169.254.169.254` metadata target | BLOCKED | Safe outcome under the UID policy |
| Unexpected DNS lookup | BLOCKED | Resolver traffic denied after `/etc/hosts` freeze |
| Unexpected approved-host resolution to private/reserved address | FAIL CLOSED | Deterministic address validator |
| Policy/bootstrap failure | FAIL CLOSED | Provider does not launch supervisor without a complete proof |

## Enforcement limitation

This is guest-kernel enforcement for the unprivileged executor, not an exe.dev control-plane boundary. The VM's root administrator installs and can replace the nftables policy. A guest kernel compromise or root escape can therefore bypass it. Current exe.dev `new`, integration, copy, API, and customization interfaces exposed no egress/firewall option during the 2026-08-19 audit.

For that reason the profile is `DEGRADED`, `qualificationOnly`, and excluded from production routing. This evidence does not claim egress isolation against a compromised guest root or provider control plane.
