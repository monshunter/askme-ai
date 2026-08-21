# Agent Note: 知我AI使用原生 Web Workspace

Status: implemented

[English](2026-08-21-zhiwo-native-web-overlay.md) | 中文

## 问题

知我AI，英文名 AskmeAI，是一个限制了模型和浏览器能力的本地化外壳；内部包名与 Preset ID 仍为 `zhiwo`。围绕这个需求曾形成一个独立应用：它把 `userdata/` 复制成不可变 Revision、编译文档格式、引入同步与回滚命令、组合另一套 Agent Runtime，并拥有自建 HTTP、Identity、SQLite 与 React 层。这套系统改变了 Workspace 的含义，普通文件更新必须经过 Owner Pipeline 后才能被 Agent 看见。

不可变设计把几个独立需求绑在了一起：可复现的来源 Snapshot、Guest 对话隔离、经过校验的引用与互联网服务。Guest 隔离不需要复制 Workspace，也不需要第二套 Session 实现。选中的目录本身就是权威 Workspace，而原生 Session 访问仍然需要 Visitor Owner。

## 决策

知我AI是随仓库交付的 `dsh web` Profile 上的 Patch。标准 CLI、Host、API、Session Persistence、Workspace Registry、Agent Loop、Model Route 与浏览器 Client 是唯一的运行时实现。`packages/zhiwo/product` 解析默认值为 `userdata` 的 `ZHIWO_WORKSPACE_ROOT`，并把它交给负责规范化与目录校验的原生 Workspace Registry。独立的 `DSH_HOME` 只存储原生 DSH Workspace 元数据与 Session 历史。

随仓库交付的 `zhiwo` Agent Preset 包含完整中文 Persona，并挂载维护中的 Filesystem Reader 与 Search Consumer。`@deepseek-ai/dsh-tool-fs` 接受通用的 `mutations` 与 `images` 配置字段；两者都设为 `false` 时只注册 `read`，两者的默认值保持其他 Profile 不变。因此该 Preset 只暴露基于 Session `cwd` 的 `read`、`glob` 与 `grep`。

Product Patch 选择该 Preset、固定只读 Sandbox Policy、从浏览器 Roster 中删除不用的配置与编码 Occupant、禁用通用 Workspace UI、Session Log 下载插件与本地 Spill 后端，并插入 `packages/zhiwo/ui`。Host 保留原生 Directory Picker 依赖，但知我AI访问策略不暴露其方法。UI 包填充原生 Brand 与 Hero Headline Slot，把当前访问者的原生 Session Store 投影成扁平历史列表，使用原生 Workspace 与 Session Runtime 把干净浏览器连接到唯一 Workspace，从界面移除常驻命令／访问模式控件组、上下文用量圆环和 Session 统计行，并提供在中英文之间切换原生 Locale 的侧边栏操作。中文显示“知我AI”，英文显示“AskmeAI”。空白会话问候区只保留邀请访客了解资料所有者的主标题，不会把 Agent 呈现为独立主体。覆盖层只修改原生搜索、读取与推理行的前导图标和主标题。原生摘要、路径链接、展开卡片、推理正文、文档预览操作与检查控件保持完整；只有运行尾部使用产品专属文案。随包交付的 AskmeAI Logo 用于浏览器、安装与问候界面；展开后的侧栏只显示本地化品牌文字，不显示 Logo，收起控件保留无障碍名称但不显示视觉 Tooltip。一张同源水墨图覆盖侧栏和对话区域背后的完整 Frame。产品把原生 Theme Runtime 固定为唯一支持的浅色主题，因此系统或已保存的深色偏好不会把深色 Token 混入绿米样式。该样式不替换原生布局、Composer、消息与控件。空白 Session 从紧凑图标栏开始，活动 Session 展示当前访问者的完整历史侧栏。模型选择、发送与消息反馈继续使用原生 Runtime，其中消息反馈受相同的访问者 Session Ownership 校验保护。UI 包不拥有 Transport、持久化 State 或 Conversation 实现。产品特定的 Route 与限制范围规则由[文档预览决策](../bug-fix/2026-08-21-zhiwo-workspace-confinement-and-document-preview.md)负责。

原始 Workspace 是事实来源。Tool Call 直接检查当前文件。知我不定义 Compiler、从正文派生的 Index、同步 Lifecycle、生成语料、Source Catalog、版本化知识格式、自建数据库、HTTP Server 或并行浏览器入口。知我只维护一份根据元数据派生的访客提示问题目录及其缓存；其有界输入与失效规则由[个性化提示问题决策](../feature/2026-08-21-zhiwo-personalized-questions.md)定义。

`packages/zhiwo/product` 在原生 Connection Transport 外安装一条访问策略。浏览器会在并发打开 API 与 WebSocket 连接前建立随机 Subject；Host 随后把它升级成签名 HttpOnly Cookie。Host 私有 HMAC 派生不透明的 Owner Prefix，并把它嵌入每个原生 Session ID。新 Session 被强制放到已注册 Workspace，其他访问者的 Session ID 会在原生分发前被拒绝，列表与 Workspace 投影会被过滤，两条原生事件流也会丢弃其他访问者的 Session Frame。该策略只在 `DSH_HOME` 下保存一把私有签名密钥，不保存 Visitor、Message 或 Session 记录。

## 考虑过的替代方案

**在原生 Client 后保留不可变 Revision。** 该方案保留可复现 Snapshot，但也保留了造成复杂度的 Compiler、同步 Lifecycle、Storage Format 与不同的 Workspace 语义。

**在原生 API 上保留自建知我 React 应用。** 该方案删除部分 Server 重复，但仍派生 Conversation 行为，并且需要持续对齐 Streaming、History、Tool、Model 与 Session。

**派生原生 Web Bundle。** 源码 Fork 可以直接隐藏功能，但 Loader Patch 与 Brand Slot Occupant 已能通过维护中的 Extension Point 表达同样的产品差异。

## 后果

编辑文本文件后，后续问答无需同步或重启即可看到新的证据。已有答案仍是历史 Session Event，不会变成后续文件状态的可复现 Snapshot。二进制格式只获得原生 Filesystem Tool 提供的支持；知我不会把它们转换成文本。

不同浏览器 Profile 共用同一个只读 Workspace，但无法列出、读取、修改、导出或接收彼此原生 Session 的事件。这种匿名隔离不提供账号登录、授权管理、流量限制、TLS 终止或其他公开部署控制。

Workspace 不是面向知我AI用户的概念。浏览器不渲染 Workspace 名称、分组、未分组 Bucket、搜索、新建、设置或 Picker，也不渲染 Session Log 下载、命令／访问模式控件、上下文用量圆环、Session 统计行、预览标题或预览徽标。由于通用 Settings UI 不存在，侧边栏保留直接的中英文切换操作。Host 注册仍是普通的原生 Workspace 关系，只在 Session 创建和 Filesystem Tool 内部使用。

聚焦包测试验证原始 Workspace 注册、只读 Filesystem 组合、Brand Lifecycle、Cookie 篡改处理、跨 Visitor API 拒绝、列表投影、Fork Ownership 与两条事件流过滤。配置、类型、构建与真实浏览器检查验证原生应用可以携带覆盖层启动，并通过三个工具从 `userdata/` 回答。只有可复现的来源 Snapshot 成为明确需求时，才重新考虑版本化知识系统。
