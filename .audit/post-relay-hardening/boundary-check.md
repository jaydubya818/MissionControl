# Boundary check

- Historical Relay evidence has no diff from baseline commit `492c10f`; all nine SHA-256 digests were recaptured after qualification.
- `/Users/jaywest/factory-pilot` remains at `c55c80b11b30939d73487dcd66ccfbb68f211de1`; its only observed state is the pre-existing untracked `.mission-control/` directory.
- `/Users/jaywest/relay` was never used as a qualification workload and received no writes from this run. It is independently active and moved to `17262d051f743b1b9d8d535035c9be4a1d2878a0` during this milestone; its final observed changes are recorded in the terminal checkpoint.
- No Relay WorkOrder was dispatched or resumed.

## Historical Relay evidence SHA-256

| File | SHA-256 |
|---|---|
| `checkpoint-wo001.md` | `e5474b4aaca89a137d2391618c91ee68eab38590416666842fd3f05430a114f6` |
| `corrective-workorders.md` | `5c8ad8f0cebed0751508e455fe2b381b520c3760ba4dd6e9f2d0d57e09b25bac` |
| `decisions.tsv` | `695807284da710a04f1e96e7ac25e9fab6a19d39294b9846a61b26dadddc74ea` |
| `lessons-and-improvements.md` | `22689bad8423f49de4616a223df3e6f332910c31fd64af61a40ed19a975a49b1` |
| `relay-contract-revision-plan.md` | `27a6eee8d5ea771392dbb034d8cebabcb2d1219a64f511878f1649196d05745d` |
| `relay-runnable-and-code-inventory.md` | `ded9aafabd5f3c8e5c0ab578fa9e8641708185e36743a8df5e64af9b0042dba5` |
| `todo.md` | `58ceff2c27715f7fd42f8a74e2e0a3fc9bd098785c2ed65eb94966d422bf1434` |
| `wo001-revision4-request.json` | `5e4ab2d35d9526c81664b0d51f51f2bf6cf1e03f9f52b010de7142f1f2b58615` |
| `wo001-revision5-proposal.md` | `1b9356fdbe1da52622331dd2be1fc94ae5f20ed6b5fe1283514c1cc936d3d903` |
