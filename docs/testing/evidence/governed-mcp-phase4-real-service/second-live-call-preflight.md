# Second real MCP call preflight

The first handshake stopped before tool invocation on `SERVER_SCHEMA_SUBSTITUTION`. This is a new qualification decision for a new immutable Tool Version, not an in-place adaptation.

| Field | Value | Gate |
| --- | --- | --- |
| Service / operation | OpenAI Developer Docs MCP / `search_openai_docs` | QUALIFIED |
| Data | fixed public query, limit 3; optional server `cursor` remains ungranted | AUTHORIZED |
| Destination | exact TLS `https://developers.openai.com:443/mcp`; redirects and non-public DNS denied | QUALIFIED |
| Credential / service cost | none / no incremental cost | NOT_REQUIRED / AUTHORIZED |
| Model/provider/budget | no model call in direct diagnostic | NOT_REQUIRED |
| Tool Version | new digest `sha256:975f284c0045059615cee85e475a5dd4e0dde4401f8db58ceebf395ee37af2ff`; MCP input schema digest `7fe5182fc6d80abd05b373dbab70b45c6420b3ca91ccc5baa69817dfacb29692` | QUALIFIED |
| Tool Grant / profile / Attempt | exact one-call, expiring, workspace/profile/lease-bound shapes; rerun offline | QUALIFIED |
| Containment / network / cancellation | no discovery or write authority; exact destination; timeout and abort fencing | QUALIFIED |
| Independent verifier / WorkOrder | required later for browser acceptance, not this diagnostic | NOT_REQUIRED |
| Evidence | prior failed fingerprint retained; diagnostic emits only digests and receipt metrics | QUALIFIED |

The exact server schema was recovered without a second MCP request from a public recorded `tools/list` cassette. It contains `query`, optional `limit`, optional `cursor`, `additionalProperties: false`, and the draft-07 marker. Mission Control's grant remains narrower than the advertised schema and permits only the fixed query and limit.

After the focused offline suite passes for this new digest, one second direct diagnostic is authorized. Total real-service logical attempts remain within the preflight maximum of three.
