---
name: adr-verbatim
description: "Record approved decisions as concise architecture decision records."
license: MIT
metadata:
  author: David Ondrej and Skillz contributors
  source: davidondrej/skills
  source-commit: 8aa01cf45110ae378bdf5c319cd41ac8fdbdf448
  adaptation: curated-rewrite
  owner: software-factory
  risk: low
  capabilities: davidondrej,decision-records
---

# Record an approved decision

Preserve the user's decision and its conditions without turning conversation
noise or an agent's suggestion into a requirement. Use when asked to create an
ADR or record an approved decision. Researching an old decision is a separate
task.

1. Identify the stated or approved decision in the source conversation or
   document. Distinguish approved scope from proposals and unanswered questions.
   Ask only when the decision itself is unclear. If approval is absent, keep
   the record proposed rather than marking it accepted.
2. Find the project's established ADR repository, directory, template, and
   naming convention. Do not assume the current checkout owns the records.
   Follow the existing sequence. Recheck filename availability before writing
   so another author's record is never overwritten.
3. Write the decision in plain English. Preserve meaning, boundaries, priority,
   and exceptions. Include rationale or alternatives only when supported by
   the source. Do not invent consequences to fill a template.
4. Record status, decision date, and an appropriate source reference when known.
   If the original date is unknown, distinguish the recording date from the
   decision date. Use exact quotations only when requested or when exact scope
   depends on the wording.
5. Check each statement against its source and show the saved path and record.

Without an established template, a title, status, date, and short decision
paragraph are enough. A changed decision usually needs a new ADR that identifies
the superseded record. Preserve the old record and follow the project's process
for updating its status. Correct an existing record when the user asks for a
correction. An agent's newer interpretation does not supersede an approved
decision.

Use repository isolation and publication rules. Recording a decision does not
authorize implementing it, publishing private discussion, or unrelated changes.
