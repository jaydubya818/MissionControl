# Security Policy

## Supported Versions

Security fixes are currently provided for the latest version of Mission Control on the `main` branch.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| Older versions | No |

Because Mission Control is under active development, users should test and deploy from the latest available revision rather than relying on older revisions.

## Reporting a Vulnerability

Please **do not report security vulnerabilities through public GitHub issues**.

Mission Control executes agent-produced code in local worktrees or an explicitly configured and approved remote sandbox, currently a Preview capability. It treats repository content, external text, memory, tool output, model output, and worker result payloads as untrusted data. Security vulnerabilities should therefore be reported privately so they can be investigated before details are made public.

### GitHub Private Vulnerability Reporting

Use [GitHub Private Vulnerability Reporting](https://github.com/jaydubya818/MissionControl/security/advisories/new) to submit a private report.

Include as much of the following information as possible:

- A clear description of the vulnerability.
- The affected component, file, endpoint, workflow, or security boundary.
- Steps to reproduce the issue.
- The security impact or potential impact.
- Any relevant logs, traces, screenshots, or proof-of-concept information that can be safely shared.
- The affected commit, version, or branch, if known.

Please avoid including live credentials, secrets, customer data, or other sensitive information in the report.

## Response Time

The maintainers aim to acknowledge security reports within **3 business days** and will provide an initial assessment or follow-up as soon as practical.

Response and remediation timelines may vary depending on the severity, complexity, affected components, and information available to reproduce the issue.

## Disclosure

Please allow the maintainers reasonable time to investigate and address a reported vulnerability before publicly disclosing technical details.

The maintainers may coordinate disclosure timing with the reporter when appropriate.

## Security Documentation

For additional information about Mission Control's security architecture and boundaries, see:

- [Security model](README.md#security-model)
- [Human and service authorization matrix](docs/security/human-service-authorization-matrix.md)
- [Verification plane threat model](docs/security/verification-plane-threat-model.md)
- [Remote Sandbox threat model](docs/security/remote-sandbox-threat-model.md)
- [GitHub App connection model](docs/security/github-app-connection.md)
- [Evidence retention policy](docs/security/evidence-retention-policy.md)
