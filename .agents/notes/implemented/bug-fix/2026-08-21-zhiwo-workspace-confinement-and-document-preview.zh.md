# Agent Note：知我限制读取范围并在浏览器中预览文档

Status: implemented

[English](2026-08-21-zhiwo-workspace-confinement-and-document-preview.md) | 中文

## 问题

原生 Conversation Client 会基于 Session cwd 解析 Tool 的相对位置，再按照 [Web Workspace 文件链接决策](../feature/2026-07-31-web-workspace-file-links.md)把结果路径发送给 `host.openPath`。该操作可以正确地让 Host 操作系统打开本地文件，但知我浏览器访问策略没有暴露它。因此，点击知我的 read Card 会调用不可用的 `/api/host.openPath` 端点，并显示 HTTP 404 Transport Error。

知我还依赖 Persona 与只读 Sandbox 把资料发现限制在 `userdata/` 内。只读 Sandbox 防止修改，但不限制读取。`read` Tool 接受绝对路径与路径穿越，`glob` 和 `grep` 也接受外部搜索根。成功的 read 结果会把文件系统 Provider 的绝对展示路径传给模型、Session Log 与浏览器。要求模型使用相对引用的指令无法强制这些运行时属性。

## 决策

Client Workspace Runtime 提供 `workspaces/open-path` 接管瀑布。每个产品 Listener 都调用 `next()`，并返回自己是否处理了该位置。没有 Listener 接管时仍回退到原生 `host.openPath`，因此桌面 Profile 保留操作系统集成。知我接管位置，请求同源 `/api/zhiwo/document` 端点，确认响应媒体类型，并在当前页面渲染弹窗。Markdown、其他 UTF-8 文本或源码、PDF，以及 PNG／JPEG／GIF／WebP 光栅图片分别使用对应视图；HTML 保持纯文本，不支持的二进制格式以及与扩展名不符的 PDF 或图片签名会明确失败。Host 只接受虚拟绝对路径，把真实目标解析到配置的 Workspace 下，并拒绝路径穿越、外部符号链接、非文件和超大文件。允许的响应带有缓存与内容嗅探保护。端点位于 `/api` 下，也能避免精确路由缺失时回退到聊天应用的 HTML 外壳。

`zhiwo` Agent Preset 为 `read`、`glob` 与 `grep` 挂载作用域内的执行策略。分发前，策略通过 `ctx.fs` 解析 Session cwd 与请求目标，并要求二者满足规范包含关系；绝对路径与跨平台路径语法在解析前被拒绝。成功的 `read` 值会把 Provider 展示路径替换成规范化的请求相对路径；浏览器 read Card 及其可点击位置也使用该值。

浏览器 Transport 现在把 Session ID Owner Prefix 视为必要但不充分的条件。访问已有 Session 时还必须满足配置的 Workspace cwd 与 `zhiwo` Preset；Session 与 Workspace 投影只暴露 `/`，不暴露 Host 路径。原始 Session 导出不可用。包含私有 Host 状态的历史会被隐藏。当前知我回答会在 Chunk 进入 Session Log 前缓冲；只要回答包含 Host 绝对路径、Host 用户名或私有运行时设置，就替换成一条固定的安全回答。知我也会禁用本地 Spill 后端：被截断的资料发现结果只提示 Agent 缩小查询，不会发布物理临时文件位置。

Persona 还会把测试、Fixture、Mock 和示例排除在所有者事实之外，除非正式的所有者资料明确确认。该语义规则是文件系统限制的补充：文件可以位于 `userdata/` 内，但仍不适合作为描述所有者的证据。

## 考虑过的替代方案

向匿名知我浏览器暴露 `host.openPath` 可以恢复原生点击路径，但也会允许远程访客要求 Host 操作系统打开本地路径。浏览器预览既保留了交互能力，也不扩大这项权限。

仅靠 Persona 指令无法限制文件系统 Provider，也不能阻止不安全的局部回答进入 Session Log。只读 Sandbox 解决的也是修改而非资料发现问题。因此，必须在 Tool 执行、API 投影与模型发布三个运行时位置执行检查。

## 后果

会话中的文档链接现在可以在浏览器内展示有大小限制的 UTF-8 文本，而不向匿名访客授予 Host 原生打开能力。普通 dsh 产品在没有产品接管路径时仍使用 `host.openPath`。

知我的资料发现无法通过绝对路径、路径穿越或外部符号链接读取。成功的 Tool 输出与 API 元数据都不再暴露物理 Workspace 根。含不安全内容的旧历史仍由原生 Persistence 保存，但不会投影给知我浏览器；不会删除任何用户数据或 Session Artifact。

当前模型回答需要在通过发布检查后才显示 Token。模型工作期间的 Tool Lifecycle Event 仍然可见。这项延迟权衡只作用于知我 Session，并保证不安全的局部文本既不会进入浏览器，也不会进入持久 Session Log。

## 验证

聚焦测试覆盖原生打开回退与产品接管、Markdown／源码／PDF／图片弹窗视图、SPA 回退与不支持格式拒绝、安全文档响应与路径穿越拒绝、规范 Tool 拒绝与相对 read 成功值、精确 Workspace／Preset Session 授权、虚拟路径投影、原始导出拒绝、旧历史隐藏，以及发布前输出替换。组装后的无密钥知我 Web 场景会挂载随仓库交付的 Preset，执行真实的工作区内读取，拒绝外部路径穿越，验证超限 glob 结果不含 Host Spill 位置，检查三个 Tool 的目录与完整 Persona，并通过原生 Agent Loop 回放可见回答。
