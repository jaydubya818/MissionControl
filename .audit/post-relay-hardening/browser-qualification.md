# Browser qualification

- Runtime: preserved Software Factory Research Lab, with no autonomous executors.
- Factory Run: `zh7w33gerpbxv5n4jfvn7vzves8eb38t`.
- Members: exactly 3; accepted 3; active 0; blocked 0; failed 0.
- WorkOrders: `yh776zvcm85y3sa4qbhxfb3zx58ea525`, `yh77w3zcfbk1whjnz7x8y9rfq58eayn3`, `yh7amzh70cvd96c79xx43kzy1h8ebnqy`.
- Factory page: explicit immutable membership, completed critical path, empty dispatch frontier, terminal `ACCEPTED` outcome.
- WorkOrder overview: accepted terminal state, 2/2 tasks, separate completed execution and verified verdict, exact-revision dependencies and dependents.
- Historical comparison: same candidate/producer, distinct verifier identities, `TIMED_OUT`, `NOT_EVALUATED`, `BLOCKED_BY_DEPENDENCY`, `NOT_VERIFIED`, `PRODUCT_FAILED`, and `FACTORY_FAILED` are visibly distinct.
- Browser console: development connection messages only; zero page errors.
- Screenshots: `factory-run-browser.png`, `workorder-overview-browser.png`, `workorder-history-browser.png`.

The local projection is idempotently derived from `.audit/post-relay-hardening/synthetic-qualification.json`; it does not dispatch a worker or confer publication authority.
