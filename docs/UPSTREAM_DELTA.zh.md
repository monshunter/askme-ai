# 知我上游差异

[English](UPSTREAM_DELTA.md) | 中文

Fork Baseline：`141eb6fef83422698aef7a981029e843e8161534`。产品版本：`0.4.0`。这些记录描述持久的产品差异，而不是知我原样继承的包。

## 持久差异

| Delta ID | 位置 | 类型 | 产品原因 | 当前验证 | 可上游化 |
|---|---|---|---|---|---|
| DELTA-ZW-001 | `packages/zhiwo/product` | 新增 | 把 `userdata/` 注册成普通原生 Workspace，并应用受限 Web 组合。 | Product Test 与真实 Web 启动。 | 否，产品专用。 |
| DELTA-ZW-002 | `apps/cli/config/agent-presets/zhiwo` | 新增 | 为原生 Agent 提供完整的中文只读 Persona，并且只提供 `read`、`glob` 与 `grep`。 | 组装后的组合与浏览器问答。 | 否，产品专用。 |
| DELTA-ZW-003 | `packages/fs/tool-fs` | 调整 | 让任意组合复用原生 Reader，而不注册 Mutation Tool。 | 使用 `mutations: false` 的 Filesystem Consumer Test。 | 是。 |
| DELTA-ZW-004 | `packages/zhiwo/ui` | 新增 | 填充原生 Branding Slot，同时保留原生 Client 应用。 | Client Plugin Test 与浏览器检查。 | 否，产品专用。 |

## 选择性同步流程

依据这四个位置及其使用的原生 Extension Point 复核上游变更。运行聚焦包测试、配置检查、构建，并通过真实 `dsh web` 对 `userdata/` 完成一次问答。只有持久差异变化时才更新本文件。
