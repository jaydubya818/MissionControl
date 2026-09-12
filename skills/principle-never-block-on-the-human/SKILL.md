---
name: principle-never-block-on-the-human
description: "Apply when tempted to ask about a low-risk, reversible implementation detail inside the authorized scope. Proceed and present the result, but preserve product-owner decisions, approval policy, and external-write boundaries."
license: MIT
metadata:
  author: lauren-tan-pstack
  source: michael-denyer/pstack-claude
  source-version: "0.9.29"
  source-commit: 458050195fdb347955a63812e6d749f164a8f62d
  owner: software-factory
  risk: low
  capabilities: pstack,engineering-principle
user-invocable: false
---

# Never Block on the Human

The human can supervise implementation asynchronously. Make reasonable low-risk decisions inside the authorized scope, then present the result for review.

**Why:** Every permission pause stalls the pipeline and makes the human the bottleneck. Since code changes are reversible and reviewable, a wrong decision usually costs less than blocking.

**Pattern:**
- **Proceed, then present.** Handle reversible implementation details that do not change product intent, authority, cost, or external state. Show the result and explain why.
- **Reserve questions for genuine ambiguity.** Ask only when you cannot infer intent from context.
- **Make the system self-healing.** When you notice a problem, log it and fix it in the next round.
- **Supervision is async.** Design workflows for review-after-the-fact.

**Boundaries:**
- **Approval policy wins.** Mission Control contracts plus system, user, and repository instructions define what the agent may do.
- **External writes need authority.** Messages, tickets, pull-request mutations, eval launches, publishing, merges, deploys, spending, and destructive cleanup do not become authorized merely because they are reversible.
- **Product direction stays with the human.** Experiments can inform a decision; they do not make the decision.
- **In-scope implementation should not stall.** Write code, edit local notes, and split internal tasks when those actions stay within the accepted outcome and scope.
