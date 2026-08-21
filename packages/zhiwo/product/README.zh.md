# @deepseek-ai/dsh-zhiwo-product

[English](README.md) | 中文

这个包是原生 `dsh web` Profile 上的一层薄知我AI Overlay；`zhiwo` 仍是内部包与 Preset ID。它不拥有独立的 Agent Loop、API Server、数据库、浏览器应用、知识编译器、来源目录或 Revision 格式。

Host 插件解析 `ZHIWO_WORKSPACE_ROOT`（默认 `userdata`）并把它交给原生 DSH Workspace Registry；后者负责规范化与目录校验。Bundle Patch 只选择内置 `zhiwo` Agent Preset、只读 Sandbox Mode、知我AI 品牌插件和精简后的浏览器插件清单。通用 Workspace UI 与 Session Log 下载插件不会加载；知我AI Client 只投影当前访问者的原生 Session，把干净浏览器自动连接到唯一 Workspace，隐藏不需要的输入区诊断控件，用本地化的知我AI 问候语替换通用预览标题，并在侧边栏提供直接的中英文切换。启动仍然走普通命令：

```sh
DSH_HOME=.artifacts/zhiwo pnpm dsh web \
  --patch packages/zhiwo/product/cordis.patch.yml
```

`zhiwo` Preset 使用维护中的文件系统 Consumer，并把 `mutations` 设为 `false`，同时挂载维护中的文件搜索 Consumer。因此模型只会看到 `read`、`glob` 和 `grep`，这些工具和原生 DSH 一样直接以 Session `cwd` 为工作目录。文件从 `userdata/` 实时读取；修改原文件后，后续 Turn 无需同步即可检索到新内容。

Host 插件还会在原生 Connection Transport 外安装一条访问策略。无状态签名 Cookie 为原生 Session ID 派生不透明的 Owner Prefix。该策略强制新 Session 使用已注册 Workspace，在分发前拒绝其他访问者的 Session ID，过滤列表与 Workspace 投影，并过滤两条原生 WebSocket 事件流。它只在 `DSH_HOME` 下持久化一把私有签名密钥，不拥有 Visitor、Message 或 Session 数据库。因此不同浏览器 Profile 共用只读 Workspace，但原生对话历史保持隔离。

## Model Experience

Indirectly, through 随仓库交付且由本包 Bundle Patch 选择的 `zhiwo` Preset；该 Preset 负责 Persona 与 Tool Registration。

#### KV Cache effect

本包本身不增加请求 Token；Cache 行为取决于所选 Preset 提供的稳定 Persona 与 `read`／`glob`／`grep` Schema。

## Known Limitations and Deferred Work

- 知我AI 继承原生 DSH 的文本文件行为；不会把 PDF、Office、压缩包、图片或其他二进制格式转换成第二份文本语料。
- 该 Overlay 会隔离匿名浏览器的 Session 历史。它不提供账号登录、授权管理、流量限制、TLS 终止或其他公开部署控制。
- Workspace 和 Session 历史由原生 DSH 保存在 `DSH_HOME`。应为知我AI 使用独立 Home，避免混入其他 Profile 的工作区或会话。
