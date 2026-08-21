# @deepseek-ai/dsh-zhiwo-ui

[English](README.md) | 中文

这个纯浏览器插件填充原生 DSH 品牌与空白会话标题 Slot，把当前访问者的原生 Session 投影成不含 Workspace 概念的历史列表，并通过原生 Workspace 与 Session Runtime 把干净浏览器连接到 Host 投影的唯一 Workspace。中文界面显示“知我AI”与“你好，我是知我AI”，英文界面显示“AskmeAI”与“Hello, I'm AskmeAI”；通用预览标记会被这条问候语替换。知我AI 组合不包含通用 Workspace Browser 与 Picker。它的展示样式还会移除前置命令／访问模式控件组、上下文用量圆环和 Session 统计行，同时保留模型选择与发送控件。侧边栏中始终可见的语言操作可以在中文与英文之间切换原生界面和知我AI 会话历史，无需恢复通用设置界面。该包不贡献 API、状态存储、路由、会话实现或模型可见内容。

## Model Experience

None, as 该包只贡献浏览器呈现；这里没有任何内容进入模型请求。

#### KV Cache effect

无；本包既不组装也不发送 Provider Request。

## Known Limitations and Deferred Work

- 知我AI 复用原生 DSH 的布局与会话组件。唯一的自定义列表只是原生 Session Store 的呈现，不拥有会话状态。
