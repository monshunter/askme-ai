# Agent Note: 知我薄产品 Fork

Status: implemented

[English](2026-08-20-zhiwo-thin-product-fork.md) | 中文

## 问题

知我改变了公开用户、数据权限、工具、身份、持久化、API、浏览器界面和 Release Entry。若把它当作通用 Coding Product 内的 Bundle，危险默认能力仍然可达，Ownership 也会分散到无关 Store。重写 Agent Kernel 会丢弃成熟的 Loop、Adapter、Streaming、Session Event、Tool Protocol 和 Compaction 行为，却不能改善产品安全模型。

## 决策

仓库把知我作为薄产品 Fork 交付，其行为核心仍是 DeepSeek Harness。`apps/zhiwo` 是唯一产品入口；`packages/zhiwo/product` 直接组合 Preserved Upstream Agent Loop、LLM/DeepSeek Adapter、Session、System Prompt、Tool、Token Meter 与 Compaction Services。该组合固定一个 Persona、一个 Model Route，以及只包含 Revision 范围 `read`、`glob` 和 `grep` 的 Per-session Tool Catalog；它不会替换或短路 Agent Loop。

Owner Plane 把可变 `userdata/` 编译为不可变且带 Checksum 的 Revisions。该根目录下的全部普通文件属于同一份只读 Agent 数据；目录名和 Owner 配置不会建立私有、仅引用或公开分级。来源格式支持只决定 Agent 能否取得文本，不决定它有没有权限查看文件。Public Runtime 读取这些 Revisions，并使用一个 SQLite Schema 保存匿名 Ownership、Public Messages、Preserved Session Events、Source Access、Citations、Grants 与 Delete。HTTP Server 与 Browser Client 实现 Allowlisted Product Surface，而不是包装通用 DSH API 或 Client。

浏览器投影保留上游对话范式：上下文注入、推理、工具动作、中间 Assistant 文本和最终 Markdown 回答按会话顺序流式展示。投影会隐藏工作区、模型、设置、通用 Coding 实体、Raw Tool Results 和宿主路径，并用 `userdata/` 逻辑路径展示读取动作。Public Event Stream 只允许通过当前轮次 Source Access 与 Citation 校验的最终 Assistant Text 进入。同一 Source 的多次引用会在投影前合并其逻辑行范围，因此浏览器不会把不完整 Citation Location 当作可见事实。

Coding Packages 保留在源码树中用于选择性上游维护。可部署包会携带原生 Agent Loop 加载所需的 Peer Service Definitions，其中包括与 Coding Profiles 共用的定义，但知我组合不会挂载其 Providers 或 Consumers。知我的 Scoped Tool Registry、HTTP Routes、Browser Chunks 与 Release Entry 只暴露已编译 `userdata/` Revision 上的 `read`、`glob` 和 `grep`。Build Manifest、Surface Snapshot、SBOM/Checksum Files、Startup Audit 与 Negative Tests 维持该排除不变量。

两个知我 Workspace Manifest 都是 Private，并跟随产品 `VERSION`。它们不会进入用于上游维护的 `dsh` npm Family，而是由 Product Release Command 以 CLI 加经过审计的 Browser Artifacts 交付。Source Archive Build 会校验经过复核的 Baseline Snapshot，以 Dirty Provenance 记录 `UPSTREAM_BASE`，并把 Workspace Dependency Graph 注入独立 Release Directory；Runtime Image 组装前会直接执行其中的 CLI。这样可以保留上游 Family 自己的 Version 与 Source Metadata，同时阻止上游 Release Scripts 重打或发布知我。

## 备选方案

基于通用 CLI/Web Composition 的 In-tree Bundle 无法从结构上消除通用 API、Dynamic Loading、Coding Tools、Ownership Projections 或 Client Routes。Out-of-tree Plugin 会增加不稳定的 Delivery Seam，而产品主要 Surface 已全部不同。完整重写 Kernel 会增加 Replay、Cancellation、Provider 与 Compaction 风险，并重复已经满足产品要求的上游服务。

## 影响

产品外观与能力限制集中在 `apps/zhiwo` 和 `packages/zhiwo`；Upstream Kernel 工作仍可识别并可选择性同步。Existing Sessions 保留绑定的 Revision，New Sessions 跟随 Atomic Current Pointer。Baseline 更新需要显式复核 Package Classification 与 Durable Delta Inventory，然后执行 Kernel、Compiler、Ownership、Surface、Security 与 Evaluation Regression。运维方必须把资料放入 `userdata/` 视为明确授权 Agent 读取和展示来源。

Release Build 可以编译 Preserved Workspace Dependencies，但交付的 Entry 与 Browser Artifacts 只暴露知我。Multi-node Persistence、Semantic Retrieval、Pixel-faithful Office Rendering 与启用 Vision 的 `read_image` Composition 仍是独立变更，必须有证据和显式产品配置。
