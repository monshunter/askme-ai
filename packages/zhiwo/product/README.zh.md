# @deepseek-ai/dsh-zhiwo-product

[English](README.md) | 中文

这个包是原生 `dsh web` Profile 上的一层薄知我AI Overlay。知我AI 是资料所有者面向访客的个人 Agent，基于资料代表所有者回答；`zhiwo` 仍是内部包与 Preset ID。它不拥有独立的 Agent Loop、API Server、数据库、浏览器应用、知识编译器、生成知识语料或 Revision 格式，但拥有下文所述的有界派生问题目录。

Host 插件解析 `ZHIWO_WORKSPACE_ROOT`（默认 `userdata`）并把它交给原生 DSH Workspace Registry；后者负责规范化与目录校验。Bundle Patch 只选择内置 `zhiwo` Agent Preset、只读 Sandbox Mode、知我AI 品牌插件和精简后的浏览器插件清单。通用 Workspace UI 与 Session Log 下载插件不会加载；知我AI Client 只投影当前访问者的原生 Session，把干净浏览器自动连接到唯一 Workspace，隐藏不需要的输入区诊断控件，用本地化的知我AI 问候语替换通用预览标题，在展开后的品牌文字旁提供 GitHub 源码操作，并在侧边栏提供直接的中英文切换。启动仍然走普通命令，仓库根目录通过 `make zhiwo-run` 暴露该命令：

```sh
DSH_HOME=.artifacts/zhiwo pnpm dsh web \
  --patch packages/zhiwo/product/cordis.patch.yml
```

Patch 后的 Web Server 默认绑定 `127.0.0.1:18000`。显式启动 Host 优先，其次是 `ZHIWO_LISTEN_HOST`，最后才是回环默认值；Docker 只在自身网络命名空间中使用环境变量覆盖，并把容器端口发布到主机回环地址。单次启动时显式 `--port` 优先；否则 `ZHIWO_LISTEN_PORT` 可以覆盖 `18000`。端口无效或被占用时启动直接失败，不会选择随机端口。

根目录 Dockerfile 把构建后的 `@deepseek-ai/dsh` 生产依赖闭包与该 Patch 注入 Node 24 Runtime 镜像，不会复制用户资料。镜像不会从源码 Checkout 解析代码或数据，并且要求在运行时挂载 `userdata`。Compose 以只读 Mount 语义把所选已有目录绑定到 `/data/userdata`；它还会把命名卷 `zhiwo-state` 挂载到 `/data/dsh`，只发布 `127.0.0.1:${ZHIWO_PORT}:18000`，提供应用健康检查，并使用 `restart: unless-stopped`。主机环境变量 `ZHIWO_USERDATA` 或 Make 变量 `USERDATA_DIR` 用于选择资料目录；`ZHIWO_PORT` 与 `ZHIWO_IMAGE` 是 Make 变量。`make zhiwo-docker-package` 与 `make zhiwo-docker-deploy` 分别暴露镜像和部署阶段，`make zhiwo-docker-up` 则连续完成两者。重建镜像或执行 `docker compose down` 都会保留命名状态卷。

`zhiwo` Preset 告诉模型，它是资料所有者面向访客的个人 Agent。回答中的第一人称指资料所有者，不能指 Agent 或访客；测试 Fixture 与示例也不能在缺少所有者正式资料确认时成为所有者事实。该 Preset 使用维护中的文件系统 Consumer，并把 `mutations` 设为 `false`，同时挂载维护中的文件搜索 Consumer，因此模型只会看到 `read`、`glob` 和 `grep`。[`zhiwo-agent-policy`](../agent-policy/README.md) 插件通过文件系统 Provider 解析每个读取或搜索根，并要求其规范目标仍位于 Session `cwd` 下；绝对路径、`..` 穿越和指向外部目标的符号链接会在读取或启动搜索进程前失败。成功的 read 值只暴露规范化相对路径。文件仍从 `userdata/` 实时读取；修改原文件后，后续 Turn 无需同步即可检索到新内容。

Host 插件还会在原生 Connection Transport 外安装一条访问策略。无状态签名 Cookie 为原生 Session ID 派生不透明的 Owner Prefix。该策略强制新 Session 使用已注册 Workspace 与 `zhiwo` Preset，并在每次访问既有 Session 前再次验证这两个事实；它还会过滤列表与两条原生 WebSocket 事件流，并把 Workspace、Host Home 与 Session cwd 投影成虚拟根 `/`。原始 Session 导出保持不可用。已授权的 Session 历史与模型流保留原生 DSH 行为；`userdata/` 下的全部资料都可以读取与展示。该策略只在 `DSH_HOME` 下持久化一把私有签名密钥，不拥有 Visitor、Message 或 Session 数据库。因此不同浏览器 Profile 共用只读 Workspace，但原生对话历史保持隔离。

原生 DSH 文档链接通常通过 `host.openPath` 启动操作系统默认应用。知我不会把这项 API 暴露给匿名浏览器；Client 通过原生 Workspace Runtime 接管会话文件位置，请求 `/api/zhiwo/document`，确认响应媒体类型后在当前页面的弹窗中展示。Markdown 使用富文本渲染器，其他 UTF-8 文本和源码使用支持语法着色的代码视图，PDF 与 PNG、JPEG、GIF 或 WebP 图片使用有大小限制的内嵌查看器；HTML 只按纯文本提供和展示，绝不执行。Host 只接受虚拟绝对路径，把真实文件目标解析到 `userdata/` 下，拒绝路径穿越、外部符号链接、目录、超大文件、错误的 PDF 或图片签名、不支持的二进制格式和无效 UTF-8。允许的响应设置 `no-store` 与 `nosniff`；没有安全内置查看器的格式会明确失败，不会调用宿主操作系统。默认预览上限为 2 MiB，可通过 `documentMaxBytes` 配置。

知我禁用本地 Spill 后端，因为它的恢复定位信息是 Host 物理路径。被截断的搜索结果保留在行内，并提示 Agent 缩小请求；模型上下文与浏览器会话都不会出现临时文件位置。

应用启动时还会异步安排一次清单扫描，读取 Workspace 下符合条件的直接子目录与普通文档元数据，用名称、类型、大小和修改时间生成指纹，不读取文档正文。指纹命中 `DSH_HOME` 下带版本的私有缓存时，直接发布其中的 100 个双语语义问题对，不重新构建或重写；目录或文档变化时重新构建并原子替换缓存。存在项目时为 50 个全局问题对加 50 个项目问题对，否则为 100 个全局问题对。内部 `zhiwo/questions` Remote 复用现有 Typert Gateway 与 Visitor Session 校验。问候页响应包含四个轮换目录问题。每个 Turn 完成后，Product 会把截至该 Turn 的有界对话发给同一次回答使用的 Provider 和 Model Route，要求模型实时生成严格两个双语上下文问题，再与初始化全局池中的两个问题组合。自动更新与“换一组”走同一条实时生成路径。分发前写入的 `zhiwo/question-llm-request` 事件记录确切 Route、System Prompt、Messages、Turn Identity 与输出 Token 上限；`questionModelMaxInputBytes` 和 `questionModelMaxOutputTokens` 分别配置两项上限。生成失败或格式无效时会明确返回错误，不会用确定性上下文模板替代，因此 Client 可以保留原来的四个问题。

Host 在返回知我AI页面前改写初始 Document Title 与 Favicon，并用“知我AI”元数据替换通用安装 Manifest 与图标资源。它通过固定的同源 `/assets/zhiwo/*` 路由提供随包交付的 AskmeAI Logo 与一张全页面共用水墨背景。Client 在浏览器、安装与问候区使用同一个 Logo；展开后的侧栏显示不带 Logo 的本地化品牌文字，并在旁边放置链接到 `https://github.com/monshunter/askme-ai` 的 GitHub 图标。空白和已有标题标签都只在该 Logo 旁显示“AskmeAI | 知我AI”。访问策略只会在通过与其他 Session 操作相同的访问者 Session Ownership 与 Preset 校验后，才允许调用原生消息反馈方法。

## Model Experience

Indirectly, through 随仓库交付且由本包 Bundle Patch 选择的 `zhiwo` Preset；该 Preset 负责 Persona 与 Tool Registration。

#### KV Cache effect

本包本身不增加请求 Token；Cache 行为取决于所选 Preset 提供的稳定 Persona 与 `read`／`glob`／`grep` Schema。

## Known Limitations and Deferred Work

- 知我AI 继承原生 DSH 的文本文件行为；不会把 PDF、Office、压缩包、图片或其他二进制格式转换成第二份文本语料。
- 该 Overlay 会隔离匿名浏览器的 Session 历史。它不提供账号登录、授权管理、流量限制、TLS 终止或其他公开部署控制。
- Workspace 和 Session 历史由原生 DSH 保存在 `DSH_HOME`。应为知我AI 使用独立 Home，避免混入其他 Profile 的工作区或会话。
- 项目提示只使用直接子目录名，不读取文档正文。目录名过短时，项目标签也会较短，直到源目录被重命名。
- 已完成 Turn 的提示问题依赖当前 Provider Route。辅助模型请求失败或没有返回有效双语 JSON 时，Client 会保留上一组并提供重试；Product 不会用固定上下文模板掩盖错误。
