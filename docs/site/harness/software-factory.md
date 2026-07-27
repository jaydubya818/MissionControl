# Software factory (Harness)

Mission Control implements the **software factory** diagram from IndyDevDan / ADW talks: intake → scoped execution → verification → learning loop.

## In-repo factory spec

Eric's workshop principle: the factory definition lives in git, not scattered markdown. Mission Control stores:

- WorkOrders and criteria in Convex
- Harness blueprint in `apps/mission-control-ui/src/harness/`
- Registry skills as versioned packages

## Factory loop

```
Intake → Plan → Dispatch → Execute → Verify → Approve → Learn
   ↑                                              |
   └──────── meta-loop suggestions ───────────────┘
```

## UI surfaces

| Route | Purpose |
| --- | --- |
| `harness-software-factory` | Loop diagram + live health |
| `factory` / Factory Board | Exception-first WorkOrder board |
| `control-work-orders` | WorkOrder list and detail |
| `factory-health` | KPI tiles and adoption metrics |

## Agent fleet

**Harness → Agent Fleet** shows registered agents with heartbeat, queue depth, and quarantine state — the Eric "fleet" view over ARM directory data.

Open **Harness → Software Factory** in the demo sidebar under the Harness group (legacy nav) or follow Work Orders in EOS nav.
