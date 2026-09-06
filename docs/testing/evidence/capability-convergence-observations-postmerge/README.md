# Observation retention — clean-main qualification

PR [#190](https://github.com/jaydubya818/MissionControl/pull/190) merged as
`44f240c6e22d0662107508149b888a7d71747b80` at 2026-09-06T17:10:51Z.
All twelve CI/Preview contexts passed on exact head
`ec2803182c8e147ba79523716be00ad5ba5d9215` in run `34047394440`.
Main base `d0e3ba889df1956bb6bae96d588ee76bb1bfcdca` was verified immediately
before the guarded merge.

A fresh detached checkout of merged main, with a locked offline installation,
passes all 19 composed gates, 2958 repository tests (11 inherited skips), Phase 5
and 15 critical browser checks. All 87 backend source hashes match the retained
57-scenario real local backend proof. Inspector and cancellation source hashes
also match their independently reviewed proof. Qualification changes no tracked
source files; generated proof is retained separately so the checkout stays clean.
Raw logs remain under `/private/tmp/fdlc-observations-postmerge/`.

Both premerge and postmerge readbacks confirm the same four Production deployment
IDs, aliases, settings and protection. Main automatic deployment remains disabled.
Economics remains WARN. This is source qualification with the previously declared
synthetic inputs and permission shim. It does not establish real provider calls,
actual billing, human WorkOrder acceptance, a live release or program completion.
Durable integrated accounting delivery and todo 063 remain in progress.
