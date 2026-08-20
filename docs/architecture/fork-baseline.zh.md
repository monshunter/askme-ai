# 知我 Fork Baseline

[English](fork-baseline.md) | 中文

知我 0.4 基于 DeepSeek Harness 官方 Commit `141eb6fef83422698aef7a981029e843e8161534`。`UPSTREAM_BASE` 在本 Release 中不可变；更新上游分支不会更新产品，除非完整执行选择性同步流程。

## 产品拓扑

```text
Owner / CI
  -> userdata + zhiwo.yaml
  -> zhiwo sync
  -> immutable Knowledge Revision

Visitor browser
  -> apps/zhiwo static client
  -> narrow Zhiwo HTTP API
  -> guest-owned SQLite data
  -> fixed Zhiwo Agent
  -> upstream Agent Loop + DeepSeek adapter + compaction
  -> revision-scoped read / glob / grep
```

只有 Owner Plane 能看见 Raw Data，并执行 PDF、Office、Git 和 Secret Audit 工作。Public Process 只能看见只读且已校验的 Revision 与可写产品状态。Model Turn 只获得当前 Session Revision Tools；它不能选择文件系统 Root、Model Route、Persona、Tool Set、Plugin 或 Revision。

## 源码与制品平面

基于源码的 TypeScript Gates 将 Workspace Packages 解析到 `src/`。`pnpm run zhiwo:build` 先构建固定的 Preserved Service Closure，再产出知我 CLI 与仅包含产品功能的 Browser Assets。交付目录不包含通用 DSH Web Entry、动态 Product Profile、Source Map、Development Database、Secret 或 `userdata/`。

Release Manifest 绑定知我 Version、Upstream Baseline、Build Commit/Time、Lockfile Checksum、Agent Definition、Tool Catalog、Public Route Templates、Client Route、Compiler Version、Database Schema、SBOM Checksum 与 Static Artifact Checksums。`SHA256SUMS` 覆盖 Manifest、SBOM、Surface Snapshot 与 Browser Files。启动过程会在打开公开 Listener 前重新校验它们。

## 生产负依赖图

Coding Packages 仅为 Baseline 维护保留在 Fork 中。`apps/zhiwo` 只有一个产品依赖；`packages/zhiwo/product` 显式组合 Preserved Kernel Packages，不依赖 Shell、Subprocess Provider、Writable Filesystem Tool、Terminal、Web Tool、Skill、Plan、Goal、Todo、Job、Workflow、Subagent、Generic Host 或 Generic Client。Tool Schemas 只注册在每个 Session 的 Agent Scope 中，全局 Tool Registry 必须保持为空。

维护清单和复核义务见[包分类](../PACKAGE_CLASSIFICATION.md)与[上游差异](../UPSTREAM_DELTA.md)。
