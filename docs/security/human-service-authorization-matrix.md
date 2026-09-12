# Human and service authorization matrix

This inventory prevents a blanket human-authentication change from breaking
overnight agents, schedulers, webhooks, and receipt ingestion. It is the
boundary for incremental server enforcement.

## Enforcement status

| Domain | Representative public functions | Current callers | Authority | Status / next action |
| --- | --- | --- | --- | --- |
| Company context | `companyContext.listCompanies`, `getCompanyContext`, `updateCompany`, `createWorkspace` | Human UI | Exact Clerk membership plus named company permission; explicit local demo adapter | Enforced in this slice |
| Company members | `companyMembers.list`, `create`, `setRoles`, `setActive`, `ensureDefaultRoles` | Human UI | `members.manage`; last-owner and same-company invariants | Enforced in this slice |
| Tenant/operator registry | `registry/tenants.*`, `registry/operators.*` | Administration and legacy tools | Company membership or named administration permission | Enforced in this slice; tenant provisioning remains platform-controlled |
| Roles and assignments | `governance/roles.*`, `governance/roleAssignments.*` | Human administration | Company access or `members.manage`; role/operator tenant equality | Enforced in this slice |
| Mission planning | `missions.createDraft`, `updateDraft`, `savePlanDraft`, `submitPlan`, `approvePlan`, `start`, `accept` | Human UI | Future: workspace access plus `missions.write`/`missions.approve` | Public surface inventoried; enforcement is the next delivery-security slice |
| Factory package import | `factoryPackageImports.preview`, `factoryPackageImports.importDrafts` | Clerk-authenticated human UI | Exact Clerk subject plus `delivery.write` and `delivery.assign`; configured Factory Engineer issuer, engagement-scoped retrieval grant, workspace ref, repository, owner/team, code scopes, and active workflow | Enforced; preview is read-only and confirm creates only Mission/Plan drafts and one receipt atomically |
| Work orders | `workOrders.create`, `dispatch`, governance decisions, revision/acceptance mutations | Human UI, automation scheduler, Pi bridge, mission chat, loop engineering | Dispatch split enforced: public mutation is human-only; orchestration uses signed `workorders.dispatch`; remaining service callers still require named commands | Continue migration for scheduler/chat/loop paths before production promotion |
| Tasks | `tasks.create`, `update`, `assign`, `transition`, `linkToWorkOrder` | Human UI, GitHub ingest, planning, chat, loops, WorkOrder flows | Split required: human task permission versus scoped service capability | Do not blanket-guard; add internal command functions and retain audited actor provenance |
| Approvals | `approvals.request`, `approve`, `deny`, expiration/escalation | Human UI and cron | Human `approvals.decide`; internal scheduler for expiry/escalation | Split decision mutations from internal lifecycle automation |
| Evidence/receipts | WorkOrder verification receipt and Pi receipt packet paths | Human UI and orchestration/Pi bridge | Pi packet ingestion is internal and exposed through signed `receipts.ingest`; human receipt mutation remains workspace-authorized | Add named artifact/handoff service commands rather than widening receipt authority |
| Release/writeback | GitHub/writeback and future release mutations | Human approval and service integration | Approved human decision plus installation/service credential | Require approval linkage, idempotency, and audited integration identity |
| Loop Engineering | Cycle reads/writes, recommendation approval, workflow projection | Human UI and workflow completion | Human workspace permission; internal projection after completed run | Human authority enforced; projection and failure recording moved internal; route remains Preview pending durable denied-action audit and real Clerk evidence |
| Harness PR evidence | Manual/sync ingestion, merge recording, GitHub webhook | Human UI and signed GitHub App webhook | Human workspace permission or registered installation plus signature-verified internal webhook action | Installation identity, exact repository binding, delivery replay ledger, and human/webhook split enforced; live credential verification remains environment-dependent |
| Verifiers and change risk | Verifier reads/writes and risk-policy reads/writes | Human Harness/Registry UI | Workspace view/improve/approve permission with server-derived operator ID | Enforced for project-scoped UI paths; browser actor labels are ignored |
| Meta-loop decisions | Suggestion reads, accept/dismiss/resolve, lifecycle, measurement | Human UI plus internal signal ingestion | Workspace view/improve/approve permission; internal signal callers | Human decisions and measurement enforced; internal ingestion retained |

## Rules for the follow-on delivery-security slice

1. Resolve `projectId` to its tenant and authorize that relationship on the
   server; never infer authority from a client-selected project alone.
2. Keep public mutations for browser actions small and permission-specific.
3. Move cron, scheduler, bridge, webhook, and agent-to-agent calls to
   `internalMutation`/`internalAction` or a separately authenticated service
   command boundary before requiring Clerk on the equivalent human mutation.
4. Preserve `actorType`, actor ID, source, attempt, and evidence provenance on
   every automated transition.
5. Add denial and cross-tenant tests before changing a domain from inventoried
   to enforced.
6. Do not expose global list queries to ordinary company users; require company
   or workspace scope.

This matrix records incremental enforcement. Company/workspace administration,
Loop Engineering, project-scoped Harness authority, and the signed GitHub
webhook-to-internal-ingestion split are enforced. Mission, WorkOrder, Task,
approval, remaining evidence, orchestration/Pi service identity, and release
authorization still require the tested golden-path security slice; do not apply
scattered human guards that strand service execution.
