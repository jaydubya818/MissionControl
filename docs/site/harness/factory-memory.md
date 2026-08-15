# Factory Memory

Factory Memory gives an operator a minimal, explainable engineering context for
a governed WorkOrder or Attempt. It combines repository sources and Mission
Control history without turning retrieved text into authority.

## Open the operator view

Open **Knowledge → Memory**. The page has four tabs:

| Tab          | Use it to                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview** | Check phase gates, index coverage, ingestion freshness, redactions, and system invariants.                                                                    |
| **Memory**   | Search with repository, source, WorkOrder, Attempt, FactoryVersion, and time filters; inspect score components and provenance.                                |
| **Graph**    | Resolve a typed entity, inspect a bounded neighborhood, distinguish inferred edges, and inspect a path.                                                       |
| **Context**  | Inspect immutable Context Packages, token budgets, source revisions, selection reasons, package diffs, advisory verification checks, observations, and evals. |

Every result is workspace-scoped. Selecting a repository narrows scope; it does
not replace the workspace authorization check.

## Read a result safely

A result shows its source type and ID, revision/path provenance, retrieval
method, and score components. Retrieved source content is untrusted. It can
explain or suggest verification, but it cannot change permissions, approve an
action, invoke a tool, or satisfy a WorkOrder acceptance criterion.

Graph edges are labeled by derivation:

- **authoritative** — comes directly from a governed source;
- **deterministic** — extracted by a repeatable parser or rule;
- **inferred** — a hypothesis with visible confidence, never presented as fact.

## Inspect an Attempt snapshot

Open a WorkOrder Attempt and then **Execution Run Inspector**. The **Frozen
Factory context** card shows the package digest, freeze time, budget, exact
source revisions, and selection reasons linked to that Attempt. Legacy Attempts
and workspaces with the phase disabled remain inspectable and retain their prior
execution and verification behavior.

An advisory verification plan means memory influenced what should be checked.
It does not mean the check passed. Require independent evidence in the normal
verification and acceptance flow.

## Compare retries

In **Knowledge → Memory → Context**, choose a current package and a comparison
package. The diff reports added/removed sources, changed revisions, and changed
relationship paths. Use it to determine whether a retry had materially
different context before interpreting outcome changes.

## Demo golden path

After `pnpm convex:seed:demo:force`, search for `auth middleware token refresh`.
The seeded story includes:

- `src/auth/authMiddleware.ts`;
- `ADR-004` authorization requirements;
- `INC-12` and its unauthorized-orders regression case;
- auth integration and orders end-to-end tests;
- failed prior WorkOrder `WO-42` and its verification evidence;
- typed paths across auth middleware, orders API, billing client, tests, ADR,
  and incident;
- a frozen Context Package, evidence-required advisory checks, observations,
  context evals, and an earlier package for retry/version diff inspection.

The seed contains only a redaction marker—not a usable credential.

## Recovery

- **Phase disabled:** ask a Factory administrator to enable the next
  workspace-scoped phase only after the prior phase passes its isolation and
  quality checks.
- **No results:** verify workspace/repository filters and ingestion freshness;
  do not broaden scope silently.
- **Truncated graph:** narrow the start entity or relation filters. Hard graph
  caps protect responsiveness and prevent accidental corpus exposure.
- **No frozen package:** the Attempt predates rollout or started through the
  compatibility path. Continue using its normal evidence and verification
  records.
