# @deepseek-ai/dsh-zhiwo-agent-policy

[English](README.md) | 中文

这个知我私有插件把 `read`、`glob` 与 `grep` 资料发现 Tool 限制在当前 Session Workspace 内。随仓库交付的 [`zhiwo` Preset](../../../apps/cli/config/agent-presets/zhiwo/agent.cordis.yml) 会在这些 Tool 注册后挂载该插件。

插件会在分发前拒绝绝对路径、Windows 路径、反斜杠以及包含 NUL 的路径语法。它通过已配置的文件系统 Provider 解析 Session cwd 与请求目标，然后要求两者满足规范包含关系；最后这一步也会拒绝 `..` 穿越，以及真实目标位于 Workspace 外的符号链接。解析失败时只返回一条固定拒绝信息，不暴露 Provider 路径。

成功执行 `read` 后，插件会把 Provider 展示路径替换成规范化的请求相对路径，文件内容保持不变。其他 Tool 与拒绝结果仍通过普通 Tool Waterfall 委托。

## 模型体验

### 条件工具结果

#### 模型看到的内容

允许的读取保留原文，并只暴露相对路径。尝试发现 Workspace 外内容时只返回 `Zhiwo tools can only access the provided materials.`，不会返回文件内容、文件系统位置或 Provider 诊断。

#### Token 影响

允许的调用不增加内容。拒绝调用只增加一条简短且会保留的 Tool Result。

#### KV Cache 影响

仅追加；该策略只改变当前 Tool Result，不会使已有 Request Prefix 失效。

## 已知限制与暂缓事项

- 该插件限制的是文件系统资料发现 Tool，不会约束另一个 Preset 额外加入的独立能力。随仓库交付的知我 Preset 有意只暴露 `read`、`glob` 与 `grep`。
- Workspace 内的文件是普通所有者资料：Agent 可以读取并展示其内容，Persona 证据规则只控制它可以据此断言什么。
