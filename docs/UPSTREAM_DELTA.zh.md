# 知我上游差异

[English](UPSTREAM_DELTA.md) | 中文

Fork baseline：`141eb6fef83422698aef7a981029e843e8161534`。产品版本：`0.4.0`。这些记录描述长期产品差异，不记录每个普通 Commit。

## 长期差异

| Delta ID | 上游位置 / 包 | 类型 | 产品理由 | 安全影响 | 当前 Owner | 覆盖测试 | 上游同步风险 | 是否适合上游化 | 最近复核版本 |
|---|---|---|---|---|---|---|---|---|---|
| DELTA-ZW-001 | `apps/cli`、通用 Web Bundles；`apps/zhiwo` | replaced | 使用一个知我公开命令和一个产品浏览器 Route 替换 Coding Product。 | 移除 Developer Routes、Runtime Composition Inputs 与隐藏 Coding UI。 | 知我维护者 | `apps/zhiwo/tests/server.spec.ts`；Surface Snapshot | 高：通用 App 变更不得隐式合入知我入口。 | 否，产品专用 | 0.4.0 |
| DELTA-ZW-002 | Core Tool Runtime；`packages/zhiwo/product/src/tools.ts` | adapted | 每个 Turn 只注册 Revision 范围的 `read`、`glob` 和 `grep`。 | 绝对路径、Traversal、Symlink、Hardlink、Write、Shell、Network、Workflow 与 Subagent 能力均不可达。 | 知我维护者 | `product.spec.ts`；Build Surface Audit | 高：上游默认 Tool 或 Prompt Section 可能扩大模型权限。 | Root-scoped Read Primitives 可能适合 | 0.4.0 |
| DELTA-ZW-003 | 通用 Session Persistence 与 Projections；`database.ts` | replaced | Guest Ownership、Public Messages、上游 Session Events、Access Records、Citations 与 Grants 使用统一 SQLite 模型。 | 每个访客查询都带 Ownership；硬删除级联覆盖完整在线记录。 | 知我维护者 | Product Database 与 Cross-guest Server Tests | 高：上游 Event Format 变化需要 Replay 与 Migration 复核。 | 否，产品专用 | 0.4.0 |
| DELTA-ZW-004 | 上游没有 Owner Data Compiler；`knowledge.ts`、`policy.ts` | adapted | 可变 `userdata/` 在公开使用前生成不可变、策略过滤且带校验和的 Revision。 | 排除 Private/Control Files 与文件系统逃逸；失败 Sync 保留 Current。 | 知我维护者 | Compiler、Office、Git、Secret、Checksum 与 Revision Tests | 中：Parser/Dependency 更新需要 Fixture 与资源限制复核。 | Compiler Utilities 可能适合 | 0.4.0 |
| DELTA-ZW-005 | 通用 Host/API/Client；`server.ts`、`apps/zhiwo/src/client` | replaced | 窄 Guest-owned API 与中文优先产品 UI 替换 Developer Host。 | 强制 CSRF、精确 Origin、Secure Cookie、CSP、安全 Source Projection、精确静态 Route 与独立 Loopback Metrics。 | 知我维护者 | HTTP Ownership/Source Tests；Chrome Acceptance | 高：除非主动移植，否则忽略上游 Host/Client 变化。 | 否，产品专用 | 0.4.0 |
| DELTA-ZW-006 | 通用 Build；知我 Build/Release Scripts | adapted | Release 固定 Version、Baseline、Tools、Routes、Client Entry、Schema、SBOM 与 Checksums。 | 未知 Coding Surface、本地路径、Source Map、Manifest Drift 或 Checksum Drift 阻塞启动/发布。 | 知我维护者 | `zhiwo:build`、`zhiwo:surface`、`zhiwo:release` | 中：Package Graph 变化需要 SBOM 与 Artifact 复核。 | Surface Gate Patterns 可能适合 | 0.4.0 |

## 选择性同步流程

从产品分支创建 `upstream-sync/<version>`，更新候选 `UPSTREAM_BASE`，只合并或 Cherry-pick 所需上游变更，解决每个受影响 Delta，并执行 Preserved Kernel Tests、知我 Tool/API/Client Snapshots、Compiler Fixtures、Isolation/Security Tests 与 Evaluation。更新本文件及[包分类](PACKAGE_CLASSIFICATION.md)，获得人工复核后才修改固定 Baseline。
