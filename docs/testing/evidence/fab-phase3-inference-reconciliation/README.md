# Fab reconciliation with current inference accounting

Fresh detached source `4efffbb035859b824ddb64cc8943b1e8f49f5f4c` merges main
`cc1c530fad2cd46adeb43443013734a2900f7a06`, including governed inference accounting
and its documentation closure. A standard frozen pnpm install, all 19 System
Qualification gates, 15 critical browser tests and the incoming inference
accounting check pass. The runtime guard also passes against the exact merged
main: two added public recovery mutations, contract v43 to v44.

The combined schema preserves both additions. Fab enrollment remains before
dotenv and its frozen route/identity gate remains independent of the optional
inference gateway. The independent security reviewer reports GO for this bounded
offline merge delta. No live gateway or provider qualification is implied.

`bc5efcf` changes only the native CI setup: Homebrew Node 24 matches the permitted
Cellar executable boundary. FDLC's first GitHub run exposed setup-node's
unsupported tool-cache location; its corrected native suite passed on Node
24.20.0. The immutable vendored Fab archive is unchanged. Logs here are normalized
for ANSI/trailing whitespace; no original source-specific evidence is replaced.

Fab remains Experimental. Live models, deployed MC persistence, controlled runtime
publication and whole-agent containment remain unqualified. The source PR is a
separate operator-authorized delivery action. Public archive provenance and the
unresolved Fab license are documented under `vendor/fab/README.md`.
