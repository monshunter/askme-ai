# 知我包分类

[English](PACKAGE_CLASSIFICATION.md) | 中文

本清单固定官方 baseline `141eb6fef83422698aef7a981029e843e8161534` 在知我 0.4 中的参与方式。为上游维护而保留的源码不会自动进入生产依赖图。

## 分类

| 类别 | Baseline 位置 | 知我处理方式 |
|---|---|---|
| Preserved | `vendor/cordis`、`packages/core/{agent,agent-loop,llm,session,system-prompt,tools}`、`packages/llm/{llm-deepseek,token-meter}`、`packages/compaction/{compaction-basic,compaction-tool-result-pruner}` | 作为固定 Agent Kernel 以编程方式复用；常规上游测试继续提供回归证据。 |
| Adapted | `packages/zhiwo/product`、根 TypeScript/build faces | 使用一个 Persona、一个模型路由、Revision 范围工具、Compaction、引用校验和产品不变量组合保留的服务。 |
| Replaced | `apps/zhiwo`、知我 SQLite Schema、知我 HTTP Server 与 React Client | 替换通用 CLI/Web 产品、通用公开 API 组合、通用 Ownership Projection 和面向 Coding 的浏览器 Shell。 |
| Excluded | Shell、Subprocess、文件系统 Coding Tools、Terminal、Web Tools、Skill、Plan、Goal、Todo、Job、Workflow、Subagent、Workspace/Settings/Model Selection UI、动态 Loader Bundles | 可留在 Fork 中用于上游同步，但任何知我 Package、Release Route、Tool Schema、Static Chunk 或 Runtime Registration 都不可达。 |

## 依赖规则

`apps/zhiwo` 只依赖 `@deepseek-ai/dsh-zhiwo-product`；Product Package 显式列出它组合的每个 Preserved Service。Release Manifest 和 Surface Snapshot 固定模型 Tool Catalog、Public Route Templates 与唯一 Client Route。未知工具、API Route、Browser Route 或 Product Module 会触发启动失败或发布门禁失败，而不会加载通用 DSH Fallback。

两个知我 Workspace Manifest 都是 Private，并携带产品 `VERSION`。它们通过 `zhiwo:release` 交付 CLI 和经过审计的 Browser Artifact，不进入用于上游维护的 `dsh` npm 发布序列。上游 Package Family 保留自己的 Root Version 与 Repository Metadata，因此选择性上游维护不能静默重打知我 Tag，也不能把它纳入上游发布。

仓库级生成文档[模块图](module-graph.md)包含仅用于维护的源码。知我 Package Manifest、构建制品扫描、Route/Tool Snapshot 与启动审计分别证明生产排除成立。
