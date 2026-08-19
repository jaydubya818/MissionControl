# Controlled negative matrix

No destructive provider attack was performed. `PASS` means the attempted action failed safely in the stated test boundary; it does not imply a stronger provider guarantee.

| Action | Result | Evidence / limitation |
| --- | --- | --- |
| Unauthorized external HTTPS | PASS — blocked | `1.1.1.1:443` was reachable before policy and blocked for UID 10001 afterward in two fresh containers. |
| Private/internal network | PASS — blocked | `10.0.0.1:80` returned only the blocked outcome under the UID policy. |
| Metadata endpoint | PASS — blocked | `169.254.169.254:80` returned only the blocked outcome under the UID policy. |
| Unexpected DNS | PASS — blocked | `example.com` lookup failed after approved-host `/etc/hosts` freeze and DNS deny. |
| Unexpected image/toolchain | PASS — fail closed | Provider start requires exact provider-reported image plus Node, Codex, native binary, and toolchain-input digests. Missing or mismatched proof prevents supervisor launch. |
| Credential discovery | PASS in deterministic boundary | Executor environment contained only `OPENAI_API_KEY` and `OPENAI_BASE_URL`; management, GitHub, provider-admin, Convex/service, acceptance, and publication variables were absent. Host broker still revokes the Attempt key. |
| Write outside workspace | PASS — denied | UID 10001 wrote in its repository but could not write `/etc/mission-control` or `/usr`. |
| Stale credential after revocation | NOT RUN for candidate | Existing live certification proves exact Attempt-key deletion; candidate live gate was not admitted. The new code does not change the host credential broker. |
| Previous Attempt artifact access | PASS locally; NOT RUN on exe.dev candidate | The second fresh container could not observe the first sentinel. Exact live provider reuse was not tested because the image gate failed. |
| Cross-Attempt process visibility | DOCUMENTED LIMITATION | One Attempt per VM plus exact teardown prevents intended overlap. No claim is made that processes inside one VM are hidden from guest root. |
| Process escape / guest-root bypass | DOCUMENTED LIMITATION | `no_new_privs` and UID 10001 reduce executor authority, but guest nftables is not a provider boundary and cannot resist a kernel/root escape. |
| Public ingress | PASS by configuration | Provider allocation adds no exposed port and preserves the existing no-public-ingress invariant. |
| Automatic integration credential injection | PASS — fail closed | Allocation checks `integrations list --usage` and blocks when an automatic integration would attach. Final observed automatic integration list was empty. |

## Risk classification

- GREEN: the prior bounded human-governed Preview profile remains available only under its existing limitations. The restricted candidate is not production-eligible.
- YELLOW: requires provider-enforced egress, a clean image vulnerability gate, an immutable published digest, and live candidate isolation/teardown evidence.
- RED: remains prohibited and was not expanded.
