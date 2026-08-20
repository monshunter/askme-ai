# Upstream maintenance

English | [中文](UPSTREAM.zh.md)

Zhiwo 0.4 tracks the official repository `https://github.com/deepseek-ai/deepseek-harness.git` at commit `141eb6fef83422698aef7a981029e843e8161534`. The same value is stored in `UPSTREAM_BASE` and injected into every product release manifest.

Upstream movement never changes the product automatically. Create `upstream-sync/<version>`, fetch the official remote, review the desired commits, update the baseline candidate, and reconcile [package classification](docs/PACKAGE_CLASSIFICATION.md) plus [durable deltas](docs/UPSTREAM_DELTA.md). Merge only after the preserved Kernel checks and all Zhiwo build, surface, compiler, isolation, security, and evaluation gates pass.

The frozen upstream surface hashes live in `tests/snapshots/zhiwo/upstream-baseline-surface.json`. `pnpm run zhiwo:surface` re-reads those files from the baseline commit and fails if the recorded provenance drifts.
