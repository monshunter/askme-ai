# 上游维护

[English](UPSTREAM.md) | 中文

知我 0.4 跟踪官方仓库 `https://github.com/deepseek-ai/deepseek-harness.git` 的 Commit `141eb6fef83422698aef7a981029e843e8161534`。同一数值保存在 `UPSTREAM_BASE` 中，并注入每个 Product Release Manifest。

上游移动不会自动改变产品。创建 `upstream-sync/<version>`，Fetch 官方 Remote，复核所需 Commits，更新 Baseline Candidate，并协调[包分类](docs/PACKAGE_CLASSIFICATION.md)与[长期差异](docs/UPSTREAM_DELTA.md)。只有在 Preserved Kernel Checks 以及全部知我 Build、Surface、Compiler、Isolation、Security 与 Evaluation Gates 通过后才能合并。

固定的 Upstream Surface Hashes 位于 `tests/snapshots/zhiwo/upstream-baseline-surface.json`。`pnpm run zhiwo:surface` 会从 Baseline Commit 重新读取这些文件，并在记录的 Provenance 漂移时失败。
