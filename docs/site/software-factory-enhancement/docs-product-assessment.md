# Mission Control Docs Product Assessment

| Field | Value |
| --- | --- |
| Document ID | SFE-DOC-008 |
| Status | PUBLISHED |
| Owner | Mission Control Platform |
| Reviewer | Quality Engineering |
| Workspace | Software Factory Research Lab (`sn71gskbdemgf4z1trt9zdmm5h8bde69`) |
| Requested Docs workspace | `w17bnnjbwzws1rdyvg97s9cwxd8bfda8` — invalid in current deployment |
| Repository | `jaydubya818/MissionControl` |
| Related Mission | WorkOrders and Tasks Operator Experience (`gs7g4215qyeka9njttxdcsd48n8bc9yn`) |
| Created / updated | 2026-07-28 |
| Source commit | Discovery `bc8340d`; Docs remediation `78d7219` |
| Document version | 1.0 |

## Summary

Mission Control Docs currently reads version-controlled Markdown well but is not
a document-management product. Collection records, browser authoring, status,
ownership, review, approval, version history, relationships, import/export, and
synchronization are missing.

## Capability assessment

| Capability | Classification | Evidence |
| --- | --- | --- |
| Repository Markdown rendering | WORKING | headings, lists, tables, code, links |
| Static section navigation | WORKING | configured Docs sections/pages |
| Title/path filter | WORKING | sidebar filter |
| Semantic Search tab | PARTIAL | indexes a hard-coded document list |
| Repo chat | PARTIAL | requires indexing and external embedding setup |
| Collections/folders as records | MISSING | sections exist only in source config |
| Create document through UI | MISSING | no New Document action |
| Edit/save/autosave | MISSING | read-only renderer |
| Status/owner/reviewer | MISSING | descriptive Markdown only |
| Approval/publication | MISSING | no enforced workflow |
| Version/history | MISSING | Git only, no in-product history |
| Direct document URL | WORKING | `doc` query behavior verified in Chromium |
| Browser back/forward | WORKING | static page history verified in Chromium |
| Workspace scoping | CONFUSING | Docs content is global while route accepts workspace |
| Record relationships | MISSING | text references only |
| Markdown import/export | MISSING | no UI workflow |
| Mermaid | MISSING | displayed as a code block |
| Screenshots/attachments | MISSING | no attachment record workflow |
| Empty/loading/error states | PARTIAL | missing page has an error card; invalid workspace crashes App |
| Accessibility | PARTIAL | named filter/pages; dynamic authoring cannot be tested |
| Large-document performance | NEEDS_RESEARCH | no benchmark |
| Many-document performance | NEEDS_RESEARCH | source-config list only |

## Defects

### DOCS-001 — Supplied Docs workspace crashes the console

- Severity: Critical
- URL: `/v2/docs?workspace=w17bnnjbwzws1rdyvg97s9cwxd8bfda8`
- Expected: workspace resolves or a scoped not-found state is shown.
- Actual: `projects:get` validation error reaches the App error boundary.
- Status: OPEN
- Recommended owner: Workspace/Docs platform.

### DOCS-002 — Required UI authoring journey is unavailable

- Severity: High
- Expected: collection/document create, edit, save, search, history, and
  relationship workflow.
- Actual: static read-only Markdown browser.
- Status: OPEN
- Recommended owner: Docs product.

### DOCS-003 — Static document selection did not persist

- Severity: Medium
- Expected: refresh/back/forward preserve selected document.
- Actual: previous implementation reset to the default page.
- Status: VERIFIED IN BRANCH.
- Evidence: automated Chromium test passed direct URL, refresh, back, and
  forward navigation with no page errors or relevant failed requests.

### DOCS-004 — Mermaid is not rendered

- Severity: Medium
- Expected: supported diagrams render or clearly identify unsupported syntax.
- Actual: Mermaid displays as a code block.
- Status: OPEN

### DOCS-005 — New Docs pages are absent from semantic indexing

- Severity: Medium
- Expected: repository Docs discovery is automatic or configurable.
- Actual: `knowledge.indexAllDocs` uses a hard-coded list.
- Status: OPEN

## Decisions

- do not insert fake Docs records directly into Convex;
- expose current work through the existing operator-facing Docs browser;
- record missing dynamic behavior as defects;
- design dynamic authoring separately before adding a new persistence model;
- use stable static IDs for repository-to-Docs mapping during compatibility.

## Risks

- users may interpret descriptive status as an enforced approval;
- global content may appear workspace-scoped when it is not;
- static and future dynamic documents may duplicate;
- semantic search can omit new pages silently;
- invalid workspace persistence can make the whole console unavailable.

## Open questions

- should static repository guides and dynamic governed documents be separate
  tabs or one catalog?
- which record owns collection/status/version history?
- how are Git and Docs conflicts resolved?
- which publication actions require approval?

## Next actions

1. create a governed Work Order for DOCS-001;
2. design dynamic collections/authoring/status/history;
3. make repository indexing manifest-driven;
4. add Mermaid only after sanitizer, accessibility, and export behavior are
   specified.

## Supporting evidence and repository mapping

- Full assessment: `docs/plans/mission-control-docs-assessment.md`
- Documentation policy: `docs/software-factory/documentation-governance.md`
- Test record: `docs/testing/mission-control-docs-ui-results.md`
- Screenshots: `docs/testing/evidence/mission-control-docs/`
- Last synchronized: 2026-07-28
