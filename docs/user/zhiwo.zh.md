# 使用知我AI

[English](zhiwo.md) | 中文

本教程在原生 DSH Web 应用上启动知我AI 组合，并说明它直接使用原始 Workspace 的行为。

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

打开命令输出的 URL。Client 会把初始原生 Session 连接到已注册的 `userdata/` Workspace；不需要选择目录或执行导入。知我AI 不渲染 Workspace 名称、分组、搜索、新建、设置或选择器，也不显示 Session Log 下载、命令／访问模式控件、上下文用量圆环或统计行；模型选择与发送仍然可用。使用侧边栏底部的语言操作，可在中文与英文之间切换整个界面和会话历史。侧边栏名称在中文界面显示“知我AI”，在英文界面显示“AskmeAI”；空白会话标题分别显示问候语“你好，我是知我AI”与“Hello, I'm AskmeAI”，不再显示预览标记。用户只看到自己的会话。`pnpm run zhiwo:demo` 是同一命令的快捷方式。

每个浏览器 Profile 会获得一个匿名身份。其原生 Session 历史仅对该 Profile 可见，而所有访问者读取同一个只读 `userdata/` Workspace。

## 提问

针对 Workspace 中存在的事实提问。知我AI Agent 使用 `glob` 与 `grep` 查找原始文件，使用 `read` 阅读相关片段，并以相对 `path:line` 位置标注重要证据。证据不足时，它会说明缺少资料，而不是编造答案。

模型不能编辑文件，也不能使用 Shell、Web Search、Skill、Plan、Goal、Workflow、Job 或 Subagent。该组合不会显示这些能力的浏览器控件。

## 更新资料

直接在 `userdata/` 中编辑、新增、重命名或删除文件。后续问题会读取当前文件系统状态；没有需要执行的同步命令或需要刷新的生成语料。已有答案仍是 Session 历史，源文件变化不会改写它们。

本地测试时可让 `ZHIWO_WORKSPACE_ROOT` 指向其他已有目录。相对路径从命令启动目录解析。

## 状态与格式

原生 DSH 把 Workspace 元数据与 Session Log 保存在 `DSH_HOME` 下。知我AI 还会在那里保存一把私有身份签名密钥，并使用带 Owner Prefix 的原生 Session ID；它不增加 Visitor、Message 或 Session 数据库。使用独立的 `.artifacts/zhiwo` Home，可避免该状态与其他 Profile 混合。

知我AI 继承原生 DSH 的文本读取与搜索行为。它不会转换 PDF、Office、压缩包、图片或其他二进制格式；Agent 需要检查这些内容时，请在 Workspace 中提供对应的文本表示。

## 部署限制

该组合会隔离匿名浏览器的 Session 历史。它不增加账号登录、授权管理、流量限制、TLS 终止或经过加固的公开 HTTP 服务。
