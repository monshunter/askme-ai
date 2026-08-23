# 知我AI

[English](README.md) | 中文

知我AI 是资料所有者面向访客的个人 Agent。访客通过它了解资料所有者，它会基于资料代表所有者回答。产品是原生 DeepSeek Harness Web 应用上的一层轻量配置与品牌覆盖：它通过普通的 `dsh web` 命令启动，沿用上游 Host、Agent Loop、Session、API 与浏览器客户端，并把 `userdata/` 作为默认 Workspace 打开。

知我AI 没有 Revision、知识编译器、同步命令、生成语料、自建 API Server 或产品数据库。`userdata/` 下的文件就是事实来源，后续问答会读取文件的当前内容。

<a id="run-from-source"></a>

## 从源码运行

先创建一次已被 Git 忽略的项目环境文件，然后安装并构建：

```sh
cp .env.example .env
make zhiwo-install
make zhiwo-build
make zhiwo-run
```

打开 `dsh web` 输出的 URL。Makefile 是知我AI命令入口；运行 `make help` 可查看源码运行、测试、构建和 Docker 生命周期目标。源码与 Docker 启动都要求项目本地 `.env`，因此都不依赖启动 Shell 导出的凭据或用户 Home 下的环境文件。`make zhiwo-run USERDATA_DIR=/absolute/materials DSH_HOME_DIR=/absolute/state ZHIWO_PORT=19000` 可以覆盖三个本地路径与端口。已有的 `pnpm run zhiwo:demo` 快捷命令继续使用 `userdata/`、`.artifacts/zhiwo` 和端口 `18000` 作为默认值。

## 使用 Docker 运行

使用同一份项目 `.env` 启动持久服务：

```sh
make zhiwo-docker-up
```

`make zhiwo-docker-package` 会把已部署的 CLI、前端、原生 Launcher 和完整生产插件依赖闭包打包进 `zhiwo-ai:local`；生成的应用镜像不包含源码 Checkout、主机 `node_modules`、凭据或用户资料。`userdata` 始终是运行时输入，绝不会复制进镜像层。`make zhiwo-docker-deploy` 部署已有镜像，`make zhiwo-docker-up` 则连续完成两个阶段。Compose 在容器启动时注入 `.env`，要求把所选资料目录只读挂载到 `/data/userdata`，等待健康检查，发布 `0.0.0.0:18000`，并把原生 DSH Session、身份、Workspace 元数据和问题缓存保存在命名卷 `zhiwo-state` 中。在 `.env` 中把 `ZHIWO_TRUSTED_HOST` 设为该部署供浏览器访问的 `host` 或 `host:port`；Compose 会把它传给 API Host／Origin 检查，不会让可复用配置绑定某个域名。资料挂载目录默认是仓库本地 `userdata/`；设置主机环境变量 `ZHIWO_USERDATA=/absolute/materials`，或向部署目标传入 `USERDATA_DIR=/absolute/materials`，即可在不重建镜像的情况下选择另一个已有目录。使用 `ZHIWO_PORT=19000` 可改用其他端口。`make zhiwo-docker-status`、`make zhiwo-docker-logs` 与 `make zhiwo-docker-restart` 用于运维服务；`make zhiwo-docker-down` 会停止服务，但不会删除状态卷。

## 行为

启动覆盖层通过原生 Workspace Registry 注册配置目录，原生浏览器会自动把初始 Session 连接到该 Workspace。浏览器只向用户展示会话，不显示 Workspace 名称、分组、搜索、新建、设置或选择器。随仓库交付的 `zhiwo` Agent Preset 只暴露维护中的 `read`、`glob` 与 `grep` 工具。模型工具目录中不存在文件写入、Shell、Web Search、Skill、Plan、Goal、Workflow、Job 或 Subagent。

浏览器保留原生的会话、流式输出、历史、模型选择和 Session 行为。一个小型客户端插件在中文界面显示“知我AI”，在英文界面显示“AskmeAI”，以第一人称指代资料所有者，用邀请访客了解所有者的本地化问候语替换通用预览标题，在展开侧边栏的品牌文字旁放置 GitHub 源码链接，并提供侧边栏语言切换。知我AI 界面不显示 Workspace 控件、Session Log 下载、命令／访问模式控件组、上下文用量圆环或统计行。

每个浏览器 Profile 会获得一个匿名签名身份。知我AI 用该身份限定原生 Session ID、Session 列表、直接 Session 操作、Workspace 投影与两条事件流。一个浏览器无法读取、修改或接收另一个浏览器的对话。所有访问者会刻意读取同一个只读 `userdata/` Workspace；隔离对象是对话，而不是资料源。

原生 DSH 会把 Session 和 Workspace 元数据保存在 `DSH_HOME` 下。如果同一台机器还使用其他 DSH Profile，请保留独立的知我AI Home。

## 范围

知我AI 继承原生 DSH 的文本文件读取与搜索行为。它不会为 PDF、Office、压缩包、图片或其他二进制文件生成模型可读副本。匿名浏览器 Session 隔离属于该组合。账号登录、授权管理、流量限制、TLS 终止与公开部署加固仍属于部署问题。

实现细节见[知我AI 包概览](packages/zhiwo/README.md)与[用户指南](docs/user/zhiwo.md)。
