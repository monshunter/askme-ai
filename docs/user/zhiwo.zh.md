# 使用知我AI

[English](zhiwo.md) | 中文

本教程在原生 DSH Web 应用上启动知我AI 组合，并说明它直接使用原始 Workspace 的行为。知我AI 是资料所有者面向访客的个人 Agent：它代表资料所有者作答，回答中的第一人称指所有者，而不是 Agent 或访客。

## 前置条件

使用受支持的 Node.js 版本，安装 pnpm 依赖，构建仓库，并设置 `DEEPSEEK_API_KEY`。把模型可读文本放在 `userdata/` 下的任意位置。

```sh
pnpm install
pnpm run build
export DEEPSEEK_API_KEY=your_key
```

## 启动知我AI

用知我AI Patch 运行普通 Web 命令：

```sh
DSH_HOME=.artifacts/zhiwo ZHIWO_WORKSPACE_ROOT=userdata \
  pnpm dsh web --patch packages/zhiwo/product/cordis.patch.yml
```

打开命令输出的 URL。Client 会把初始原生 Session 连接到已注册的 `userdata/` Workspace；不需要选择目录或执行导入。知我AI 不渲染 Workspace 名称、分组、搜索、新建、设置或选择器，也不显示 Session Log 下载、命令／访问模式控件、上下文用量圆环或统计行；模型选择与发送仍然可用。使用侧边栏底部的语言操作，可在中文与英文之间切换整个界面和会话历史。侧边栏名称在中文界面显示“知我AI”，在英文界面显示“AskmeAI”；空白会话分别用“你好，欢迎来了解我”与“Hi, get to know me here”邀请访客了解资料所有者，不再显示预览标记。访客只看到自己的会话。`pnpm run zhiwo:demo` 是同一命令的快捷方式。

默认 URL 是 `http://127.0.0.1:18000`。可用 `ZHIWO_LISTEN_PORT` 设置稳定的部署覆盖值，也可以在单次启动时传入优先级更高的 `--port`。所选端口无效或被占用时，知我AI 会启动失败，绝不会改用随机端口。

每个浏览器 Profile 会获得一个匿名身份。其原生 Session 历史仅对该 Profile 可见，而所有访问者读取同一个只读 `userdata/` Workspace。

## 提问

访客可以针对 Workspace 中存在的资料所有者事实提问。知我AI Agent 代表所有者以第一人称回答，使用 `glob` 与 `grep` 查找原始文件，使用 `read` 阅读相关片段，并以相对 `path:line` 位置标注重要证据。它不会暴露绝对路径，不会从主机用户名或其他机器环境数据推断所有者事实，也不会把访客的信息当成所有者的信息；证据不足时会说明缺少资料，而不是编造答案。

应用启动时，知我AI 会清点 Workspace 中可见的直接子目录与普通文档，并整理 100 个双语语义问题对。它把名称、类型、大小与修改时间元数据同 `DSH_HOME` 下的私有缓存比较；内容未变化时直接复用，不重新构建，目录或文档变化时才刷新。这个目录不会读取文档正文。存在项目目录时，一半是全局问题，一半会指向具体项目。空白 Session 会在消息输入框上方显示四个供访客了解所有者的轮换问题；选择问题后，它只会进入 Draft，仍由访客正常发送。使用“换一组”可以请求另一组。消息输入框的中文提示是“问问我的经历、项目、能力或计划”，英文提示是“Ask about my experience, projects, strengths, or plans”。

每次回答成功完成后，面板会变为“还可以继续问”，其中严格包含两个由该次已完成对话推断的问题与两个初始化全局问题，刷新按钮仍然可用。如果 Turn 被取消、中断、阻塞、达到 Token 上限或失败，或者提示问题刷新失败，上一次成功的四个问题会继续显示。切换语言只翻译同一组四个语义问题，不会替换问题。

模型不能编辑文件，也不能使用 Shell、Web Search、Skill、Plan、Goal、Workflow、Job 或 Subagent。该组合不会显示这些能力的浏览器控件。

## 更新资料

直接在 `userdata/` 中编辑、新增、重命名或删除文件。后续问题会读取当前文件系统状态；没有需要执行的同步命令或需要刷新的生成语料。已有答案仍是 Session 历史，源文件变化不会改写它们。

本地测试时可让 `ZHIWO_WORKSPACE_ROOT` 指向其他已有目录。相对路径从命令启动目录解析。

问题清单只读取直接条目元数据，不读取文档正文、不跟随符号链接、不建立内容 Index，也不会在提示问题中暴露 Workspace 路径。编辑文件内容会立即影响后续 Agent 回答；顶层文档或项目目录变化会在下次启动知我AI 时使私有问题缓存失效。浏览器标签与安装元数据使用“知我AI”产品标题和圆角“知”图标，不再使用通用 DSH 构建品牌。

## 状态与格式

原生 DSH 把 Workspace 元数据与 Session Log 保存在 `DSH_HOME` 下。知我AI 还会在那里保存一把私有身份签名密钥，并使用带 Owner Prefix 的原生 Session ID；它不增加 Visitor、Message 或 Session 数据库。使用独立的 `.artifacts/zhiwo` Home，可避免该状态与其他 Profile 混合。

知我AI 继承原生 DSH 的文本读取与搜索行为。它不会转换 PDF、Office、压缩包、图片或其他二进制格式；Agent 需要检查这些内容时，请在 Workspace 中提供对应的文本表示。

## 部署限制

该组合会隔离匿名浏览器的 Session 历史。它不增加账号登录、授权管理、流量限制、TLS 终止或经过加固的公开 HTTP 服务。
