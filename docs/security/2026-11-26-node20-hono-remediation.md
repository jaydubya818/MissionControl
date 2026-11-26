# Node 20 and current Hono advisories

The product owner explicitly authorized raising the repository minimum from Node 18 to Node 20 on 2026-11-26. Existing delivery CI already uses Node 20 or 24. No provider configuration, production deployment, tester installation or trial is changed.

Pin `@hono/node-server` to 2.1.11 and `hono` to 4.13.22, including transitive consumers through the existing workspace overrides. These patched releases remove advisory 1243661 and the new Hono advisories 1246368, 1246369, 1246370, 1246373 and 1246374. Retire the expired 1.19.18 risk acceptance; no exception is renewed. Historical decisions remain in the November 2 and November 3 documents and Git history.

Validation on the isolated source checkout: production and complete dependency audits both report zero critical, high, moderate and low findings; orchestration typecheck passes; 847 orchestration tests pass with 11 explicit skips. The hosted checks must also pass at the published source revision before release qualification.

The `ubuntu-latest` runner moved to Ubuntu 26.04 in November, which the locked MissionControl browser version does not support and whose Docker image store returns manifest IDs where the admitted runtime checks require config IDs. Pin browser/native qualification jobs to Ubuntu 24.04, the supported prior environment. Preserve the exact Docker CLI, runtime image, config, registry/archive digest, source, signature, lease and custody checks. No image-identity assertion is relaxed.

References: [server advisory](https://github.com/advisories/GHSA-rmxm-3fg6-px4f), [Hono mount advisory](https://github.com/advisories/GHSA-4m76-xfj5-7975), [runner image inventory](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md).
