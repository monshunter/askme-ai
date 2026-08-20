# 知我应用

[English](README.md) | 中文

`apps/zhiwo` 是唯一受支持的产品入口。它交付 `zhiwo` CLI 和 React 客户端；客户端只调用 `@deepseek-ai/dsh-zhiwo-product` 提供的窄 Public Runtime API，且不导入任何 `packages/client` coding UI 包。客户端保留原生 Agent 对话范式，在同一条有序会话流中展示上下文注入、推理、工具动作、中间文本、最终 Markdown 回答和引用卡片。

Assistant 回答使用独立 GFM Renderer：丢弃 Raw HTML，只允许显式 HTTP(S) 和邮件链接，把远程图片替换为不可交互的 Alt Text，并限制代码块、表格和长链接在窄屏中的横向溢出范围。

在仓库根目录运行 `pnpm run zhiwo:build`。构建会生成 CLI bundle、无 source map 的压缩静态客户端，以及 `build-manifest.json`、`surface-snapshot.json`、`sbom.spdx.json` 和 `SHA256SUMS`。Manifest 会固定版本、上游 baseline、agent definition、工具名、路由模板、数据库 schema、依赖锁校验和及静态产物校验和。

Production Docker Build 支持不含 `.git` 的 Source Archive：它会校验经过复核的 Upstream Surface Snapshot，把 `UPSTREAM_BASE` 记为 Build Commit 并设置 `dirty: true`，将 Workspace Packages 注入独立 Release Directory，并在创建 Non-root Runtime Image 前直接从该目录执行 `zhiwo version`。

CLI 子命令为 `serve`、`sync`、`doctor`、`gc`、`rollback` 和 `version`。仅 Owner 可用的编译、revision 回滚与保留操作始终位于 CLI；访客 API 无法触发这些操作。`serve` 在配置的公开监听地址提供产品流量，并通过独立的回环地址监听器提供低基数 Prometheus 指标。

`pnpm --filter @deepseek-ai/dsh-zhiwo run acceptance:browser` 会启动使用确定性 mock model 的临时真实产品服务，供手工浏览器验收。必测问题是 `askme 是一个什么项目？`，fixture 会验证过程 transcript、结构化 Markdown 最终回答和引用来源。设置 `ZHIWO_ACCEPTANCE_REAL_API=true` 并提供 `DEEPSEEK_API_KEY` 后，同一个一次性服务会通过真实 DeepSeek provider 完成验收。它会输出系统分配的回环地址，并在收到 `SIGTERM` 后删除生成的知识、数据库与资料 fixture。

仓库的无密钥 snapshot 层会运行真实知识编译器与上游 Agent Loop，并固定仅含三种工具的准确目录和经过引用校验的浏览器事件 transcript。
