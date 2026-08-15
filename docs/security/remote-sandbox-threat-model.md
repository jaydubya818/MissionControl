---
title: Remote Sandbox Threat Model
status: proposed
date: 2026-08-10
owner: product
---

# Remote Sandbox Threat Model

## Scope and security claim

This threat model covers one Mission Control Factory Attempt executing on one
disposable exe.dev VM. Phase 0 contains no repository source, model credential,
GitHub identity, customer data, or production access.

The security claim is intentionally narrow:

> A disposable VM reduces persistence and host collision. It does not bound
> blast radius unless identity, integration attachment, privilege, egress,
> spend, port visibility, result publication, and teardown are independently
> controlled.

## Protected assets

- private repository source and history;
- WorkOrder intent, context, and acceptance criteria;
- Mission Control company/workspace/service identity;
- GitHub App write/PR/merge authority;
- model-provider credentials and spend;
- package-registry and future cloud credentials;
- result integrity, verifier evidence, and audit history;
- private application previews and observability data; and
- provider quota, billing, and machine inventory.

## Trust boundaries

1. **Operator to Mission Control:** authenticated human intent and approval.
2. **Mission Control to exe.dev lobby:** provider management over verified SSH
   or HTTPS identity.
3. **Provider lobby to VM:** allocation, integration attachment, proxy, and
   lifecycle controls.
4. **Root-owned supervisor to unprivileged agent:** manifest, firewall, receipt
   spool, limits, and shutdown versus non-deterministic code execution.
5. **Sandbox to external services:** read-only source, approved packages, and
   off-box model proxy.
6. **Sandbox result to control-plane quarantine:** untrusted artifact becomes
   eligible only after independent verification.
7. **Control plane to GitHub:** the only write/publication boundary.

## Threats and required mitigations

| Threat | Required mitigation | Phase 0 proof |
| --- | --- | --- |
| SSH man-in-the-middle | Pin and verify the provider-published host fingerprint before authentication | Doctor compares the scanned SHA-256 fingerprint and fails closed |
| Unregistered or ambiguous local identity | Batch-mode authentication with an optional dedicated identity file | Doctor reports an actionable auth failure without interactive registration |
| Broad automatic integration | Inventory integrations and reject `auto:all` before allocation | Doctor blocks live canary on any automatic attachment by default |
| Secret passed through environment/setup | No `--env`, repository, or model integration in the canary | Exact create-command contract test |
| Agent gains root or changes firewall | Pinned image, unprivileged user, no sudo; root-owned supervisor | Live canary reports privilege posture; production gate remains closed until a compliant image exists |
| Unrestricted egress exfiltrates source | Provider allowlist or immutable root firewall with minimal destinations | Design/test requirement; no source is mounted in Phase 0 |
| Public preview leaks service | Private provider proxy only; agent cannot call `set-public` | No public operation in provider command allowlist |
| Sandbox forges evidence | Root-owned hash chain and ephemeral supervisor signature; host-side independent verifier | Contract tests first; live receipt proof before repository mutation |
| Sandbox pushes or opens PR | No GitHub write identity; selected bundle published only by outer control plane | No GitHub integration in Phase 0 |
| Spend exceeds intent | Hard per-run key limit/expiry plus supervisor runtime limit and usage reconciliation | No model use in Phase 0; compatibility/cap proof is a separate exit gate |
| Worker dies after VM creation | Allocation journal before external mutation; exact-name startup reconciliation | Standalone canary uses exact-name `finally` removal; durable journal follows in Phase 1 |
| Cleanup targets wrong VM | Generated `mc-sbx-doctor-*` name, exact delete command, no globs | Command contract test and inventory absence verification |
| Cleanup partially fails | Close credentials first, retain actionable orphan state, retry by exact provider ID | Doctor returns non-zero and prints the exact remaining resource name |
| Logs expose credentials/provider payloads | Structured summaries, allowlisted fields, generic error redaction | Tests seed token-like strings and assert they are absent |

## Phase 0 prohibited actions

- registering a provider identity or adding a payment method automatically;
- adding, editing, attaching, or deleting provider integrations;
- creating an OpenRouter key;
- cloning any private repository;
- passing any environment secret to a VM;
- invoking an LLM;
- exposing a public port;
- retaining a VM after the canary; or
- deleting resources by glob, tag, or account-wide operation.

## Known blocker and residual risk

On 2026-08-10 the live exe.dev host key matched the published fingerprint and a
dedicated public SSH key was registered through the provider's verified account
flow. The account inventory is clean: zero VMs and zero `auto:all` integration
attachments. The active Basic plan reports `max_vms: 0`, so allocation fails
closed with `PROVIDER_CAPACITY_BLOCKED`. The Product Owner declined a paid-plan
upgrade; no payment method, VM, or provider resource was created.

Even after authentication, the default exe.dev image is not automatically
approved for agent execution. If it grants passwordless sudo or if an
agent-resistant egress policy cannot be demonstrated, the production risk
ceiling remains GREEN/YELLOW Preview work and no sensitive repository source is
mounted.

## Free local canary boundary

The zero-cost Docker canary is a development diagnostic, not a substitute for
the remote trust boundary. It improves confidence in exact-name lifecycle,
runtime-policy inspection, offline non-root execution, receipt extraction,
redaction, timeout handling, and cleanup. Its immutable cached image and
`--pull=never` posture avoid an implicit network or supply-chain change during
the check. Readiness also rejects non-local Docker endpoints and an ambient
`DOCKER_HOST` override so the local diagnostic cannot silently mutate a remote
daemon.

Residual risk is materially different from a remote sandbox: the container
still depends on the operator's machine, Docker daemon, Docker Desktop Linux VM,
storage, power, and network uplink. A Docker-daemon or virtualization-boundary
compromise can reach beyond the canary, and simultaneous containers do not
provide N independent machines. Therefore no private repository, model key,
GitHub identity, customer data, production credential, public port, or host
bind mount is permitted in this local diagnostic, and its evidence cannot
satisfy any remote-provider promotion gate.

## Security exit evidence

Before N=1 repository execution, attach evidence for:

- three clean allocate/health/run/delete lifecycle canaries;
- provider/account integration inventory with no unexpected automatic access;
- unprivileged pinned-image and egress tests;
- private proxy access denial from an unauthorized session;
- model-client compatibility and effective hard spend cap;
- seeded-secret searches across VM environment, filesystem, process list,
  logs, receipts, bundle, and provider metadata; and
- restart recovery with zero orphaned VM, key, integration, or SSH access.
