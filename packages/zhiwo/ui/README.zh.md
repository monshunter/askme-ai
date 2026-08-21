# @deepseek-ai/dsh-zhiwo-ui

[English](README.md) | 中文

这个纯浏览器插件填充原生 DSH 品牌、空白会话标题、Input Dock、Product Title 与消息 Placeholder 扩展点，把当前访问者的原生 Session 投影成不含 Workspace 概念的历史列表，并通过原生 Workspace 与 Session Runtime 把干净浏览器连接到 Host 投影的唯一 Workspace。中文界面显示“知我AI”与“你好，欢迎来了解我”，英文界面显示“AskmeAI”与“Hi, get to know me here”；其中第一人称指 Agent 所代表的资料所有者。浏览器标签始终使用“知我AI”与圆角“知” Favicon，通用预览标记则被本地化问候语替换。消息输入框显示“问问我的经历、项目、能力或计划”，不会把访客写成被介绍的对象，也不再询问想构建什么。

Input Dock 会验证并呈现 Product 私有 Connection 方法返回的四个双语语义问题。空白 Session 显示问候问题；最近完成的 Turn 严格显示两个上下文问题与两个全局问题。点击问题只填充原生 Draft，不会直接发送。自动刷新与手动刷新都采用 Single-flight；刷新失败或响应格式错误时，原来的四个问题保持可用。切换语言只改变同一组语义 ID 的文本，不会再发请求。

点击 Workspace 文件位置会在当前会话上方打开弹窗，不会改变浏览器 URL。Markdown 使用富文本渲染，其他 UTF-8 文本与源码使用支持语法着色的代码视图，PDF 和 PNG、JPEG、GIF 或 WebP 响应使用有大小限制的内嵌查看器。Client 只接受 Product 同源端点声明的媒体类型，因此 SPA HTML 回退会显示明确的加载失败，不会把当前聊天内容当作文档展示。

知我AI 组合不包含通用 Workspace Browser 与 Picker。它的展示样式还会移除前置命令／访问模式控件组、上下文用量圆环和 Session 统计行，同时保留模型选择与发送控件。侧边栏中始终可见的语言操作可以在中文与英文之间切换原生界面和知我AI 会话历史，无需恢复通用设置界面。该包不贡献 API、持久化状态存储、路由、会话实现或模型可见内容。

## Model Experience

None, as 该包只贡献浏览器呈现；这里没有任何内容进入模型请求。

#### KV Cache effect

无；本包既不组装也不发送 Provider Request。

## Known Limitations and Deferred Work

- 知我AI 复用原生 DSH 的布局、Draft 与会话状态。自定义 Session 和问题列表只是浏览器投影，不会替换原生会话状态或持久化第二份副本。
