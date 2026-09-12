# Factory Incident Command — todo 060 qualification

This directory preserves the deterministic qualification for the first
canonical Factory Incident Command implementation on the exact baseline
`f749b06c8ef39c5bd22c9e0ad76334482ec35b33`.

The qualification proves the v47 control-plane contract, not a real production
incident. It used an isolated local Convex deployment, a seeded demo workspace,
fixture evidence references, and a named **fixture** commander. It made no
provider call, production mutation, customer-data access, release, or authority
change outside the isolated local deployment.

## Proven

- The lifecycle is exactly Clarify → Contain → Observe → Isolate → Restore →
  Correct → Prevent → Measure → Resolved.
- Containment used two bounded controls with two exact control references.
- Restoration was a separate explicit decision with known-safe evidence and an
  exact restoration reference.
- Resolution followed corrective, preventive, and measurement evidence.
- An exact duplicate resolution delivery returned the existing transition.
- A late/reordered delivery failed closed.
- Removing the local anonymous-company fixture context made the public list
  query fail closed.
- The operator UI survived refresh, rendered the resolved aggregate and
  immutable log, contained query failures locally, and retained the Event stream
  tab without browser errors.
- Twelve OWASP/NIST-aligned threat-drill definitions each name bounded
  containment and canonical evidence classes.

## Not proven

- No named real pilot incident commander, real product repository, or real
  incident drill was supplied.
- No real containment control was actuated and no real authority was restored.
- Todo 059 remains the promotion boundary for production-pilot evidence.

See [scenario-evidence.json](scenario-evidence.json) for exact fixture identities
and outcomes. The screenshots are visual evidence only; the durable Convex
records and automated tests are authoritative.

The composed repository qualification is retained separately in
[`../factory-incident-command-todo060-system/`](../factory-incident-command-todo060-system/).
