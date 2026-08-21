# 知我AI

[English](README.md) | 中文

知我AI 是原生 DeepSeek Harness Web 应用上的一层轻量配置与品牌覆盖。它通过普通的 `dsh web` 命令启动，沿用上游 Host、Agent Loop、Session、API 与浏览器客户端，并把 `userdata/` 作为默认 Workspace 打开。

知我AI 没有 Revision、知识编译器、同步命令、生成语料、自建 API Server 或产品数据库。`userdata/` 下的文件就是事实来源，后续问答会读取文件的当前内容。

<a id="run-from-source"></a>

## 运行

安装依赖、构建仓库，并提供 DeepSeek 凭据：

```sh
pnpm install
pnpm run build
export DEEPSEEK_API_KEY=your_key
```

用知我AI Patch 启动原生 Web Profile：

```sh
DSH_HOME=.artifacts/zhiwo ZHIWO_WORKSPACE_ROOT=userdata \
  pnpm dsh web --patch packages/zhiwo/product/cordis.patch.yml
```

打开 `dsh web` 输出的 URL。快捷命令 `pnpm run zhiwo:demo` 执行同一条启动命令。测试时可让 `ZHIWO_WORKSPACE_ROOT` 指向其他目录，但产品默认值是 `userdata`。

## 行为

启动覆盖层通过原生 Workspace Registry 注册配置目录，原生浏览器会自动把初始 Session 连接到该 Workspace。浏览器只向用户展示会话，不显示 Workspace 名称、分组、搜索、新建、设置或选择器。随仓库交付的 `zhiwo` Agent Preset 只暴露维护中的 `read`、`glob` 与 `grep` 工具。模型工具目录中不存在文件写入、Shell、Web Search、Skill、Plan、Goal、Workflow、Job 或 Subagent。

浏览器保留原生的会话、流式输出、历史、模型选择和 Session 行为。一个小型客户端插件在中文界面显示“知我AI”，在英文界面显示“AskmeAI”，并用本地化问候语替换通用预览标题，同时提供侧边栏语言切换。知我AI 界面不显示 Workspace 控件、Session Log 下载、命令／访问模式控件组、上下文用量圆环或统计行。

每个浏览器 Profile 会获得一个匿名签名身份。知我AI 用该身份限定原生 Session ID、Session 列表、直接 Session 操作、Workspace 投影与两条事件流。一个浏览器无法读取、修改或接收另一个浏览器的对话。所有访问者会刻意读取同一个只读 `userdata/` Workspace；隔离对象是对话，而不是资料源。

原生 DSH 会把 Session 和 Workspace 元数据保存在 `DSH_HOME` 下。如果同一台机器还使用其他 DSH Profile，请保留独立的知我AI Home。

## 范围

知我AI 继承原生 DSH 的文本文件读取与搜索行为。它不会为 PDF、Office、压缩包、图片或其他二进制文件生成模型可读副本。匿名浏览器 Session 隔离属于该组合。账号登录、授权管理、流量限制、TLS 终止与公开部署加固仍属于部署问题。

实现细节见[知我AI 包概览](packages/zhiwo/README.md)与[用户指南](docs/user/zhiwo.md)。
