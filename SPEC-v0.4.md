# 知我AI v0.4 产品规格

## 目标

知我AI 是资料所有者面向访客的个人 Agent，英文名为 AskmeAI。它在原生 DeepSeek Harness Web 上提供只读资料问答：访客通过它了解资料所有者，它代表资料所有者作答。实现沿用原生 `dsh web` 的 Host、Agent Loop、Session、API、持久化与浏览器交互，不维护第二套产品运行时。

## 启动与工作区

知我AI 通过原生命令加载一个 Patch：

```sh
DSH_HOME=.artifacts/zhiwo ZHIWO_WORKSPACE_ROOT=userdata \
  pnpm dsh web --patch packages/zhiwo/product/cordis.patch.yml
```

`ZHIWO_WORKSPACE_ROOT` 默认为 `userdata`。启动插件解析并校验该目录，再通过原生 Workspace Registry 注册它。原生客户端自动把初始 Session 连接到这个 Workspace，用户无需选择工作区。

`userdata/` 就是用户资料，不是导入源。系统不会复制、编译、索引、同步或发布其中的文件，也没有 Revision、Current Pointer、Source ID 或生成的知识目录。每次工具调用读取磁盘上的当前文件；文件内容发生变化后，后续问答直接看到新内容。

## Agent 能力

知我AI 使用随 CLI 交付的 `zhiwo` Agent Preset。完整 Persona 明确区分资料所有者、访客与 Agent：回答中的“我”始终代表资料所有者，不得把访客的信息误写为资料所有者的信息。模型先用 `glob` 或 `grep` 定位原始文本，再用 `read` 阅读相关行，并以相对 `path:line` 标注关键事实；证据不足时明确说明，推断不得伪装成资料事实。

模型工具目录只有：

- `read`：读取 Workspace 内的文本文件。
- `glob`：按模式查找 Workspace 内的路径。
- `grep`：在 Workspace 内搜索文本。

原生 Filesystem Tool Consumer 通过 `mutations: false` 只注册读取能力。模型不能使用文件写入、编辑、Shell、Terminal、Web Search、Skill、Plan、Goal、Todo、Job、Workflow 或 Subagent。

## 浏览器

知我AI 保留原生 DSH 的对话、流式输出、推理展示、工具卡片、历史、Session、模型选择与发送交互。知我AI UI 插件填充原生品牌与空白会话标题 Slot，并把当前访问者的原生 Session Store 投影成会话列表；它不维护会话状态。中文名称为“知我AI”，英文名称为“AskmeAI”；中文问候语为“你好，欢迎来了解我”，英文问候语为“Hi, get to know me here”，其中“我”代表资料所有者。消息输入框分别显示“问问我的经历、项目、能力或计划”与“Ask about my experience, projects, strengths, or plans”。界面不显示原生预览标题与预览标记。Profile Patch 不加载通用 Workspace UI 与 Session Log 下载插件，并隐藏设置、插件管理、编码功能控件、命令／访问模式控件组、上下文用量圆环和 Session 统计行；侧边栏底部保留中英文切换。

Workspace 是 Host 内部实现细节。浏览器不显示 Workspace 标题、`userdata`、分组、未分组、搜索、新建、设置或选择器。干净浏览器在唯一 Workspace Baseline 就绪后通过原生 Workspace／Session Runtime 自动创建或复用空 Session，用户无需感知 Workspace。

知我AI 不实现独立 React 应用、HTTP API、反馈数据库或分享协议。原生 DSH 仍是唯一运行时事实来源。Host Overlay 只在原生 Connection Transport 外增加匿名访问策略：签名 Cookie 派生原生 Session ID 的 Owner Prefix；策略强制新 Session 使用 `userdata/`，在原生 API 分发前拒绝其他 Owner 的 Session ID，并过滤 Session 列表、Workspace 投影和两条 WebSocket 事件流。

不同浏览器 Profile 的对话历史互相不可见，也不能互相操作。所有 Profile 刻意共用同一个只读 `userdata/` Workspace；资料不是按访问者隔离的。身份层只在 `DSH_HOME` 下保存一把私有签名密钥，不建立 Visitor、Message 或 Session 数据库。

## 数据与持久化

原始资料始终位于选定 Workspace。原生 DSH 把 Workspace 元数据和 Session 历史保存在 `DSH_HOME` 下；知我AI 使用独立的 `.artifacts/zhiwo` Home，避免与其他 Profile 的状态混合。

知我AI 继承原生文本读取与搜索行为，不为 PDF、Office、压缩包、图片或其他二进制文件生成文本副本。需要解析这些格式时，用户先把可供模型阅读的文本放入 `userdata/`。

## 部署范围

匿名浏览器 Session 隔离属于 v0.4。账号登录、授权管理、流量限制、TLS 终止与公开部署加固不属于 v0.4。

## 验收

- 原生 `dsh web` 可携带知我AI Patch 启动，默认 Workspace 是 `userdata/`。
- 浏览器无需工作区选择即可进入知我AI Session。
- 浏览器中不存在 Workspace 名称、分组、搜索、新建、设置或选择入口，只显示当前访问者的会话。
- 浏览器中不存在 Session Log 下载、命令／访问模式控件、上下文用量圆环或 Session 统计行，模型选择与发送仍可用。
- 中文界面显示“知我AI”与“你好，欢迎来了解我”，英文界面显示“AskmeAI”与“Hi, get to know me here”；输入框使用资料所有者第一人称，且不存在原生预览标记。
- Agent 面向访客并代表资料所有者回答；回答中的“我”指资料所有者，不能把访客的信息混入资料所有者身份。
- 侧边栏提供可双向切换整个界面与会话历史的中英文入口。
- 两个独立浏览器 Profile 只能列出、读取、操作并接收各自的 Session 与事件，但都能读取同一个 `userdata/` Workspace。
- 真实问答通过 `glob`、`grep`、`read` 读取 `userdata/` 当前原始文本。
- 模型工具目录不含写入、Shell、网络或编排能力。
- 修改 Workspace 内的文本后，无需同步或重启，后续问答可读取新内容。
- 仓库中不存在知我AI 专用编译器、Revision 格式、自建 Server、数据库或并行前端入口。
