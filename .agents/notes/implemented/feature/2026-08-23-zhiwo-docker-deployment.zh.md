# Agent Note: 知我AI Docker 部署与仓库操作

Status: implemented

[English](2026-08-23-zhiwo-docker-deployment.md) | 中文

## 问题

知我AI的源码命令、构建前置条件、状态路径与运维步骤分散在包脚本和文档中。仓库没有受支持的长期运行容器组合，运维者必须自行判断哪些文件需要持久化、如何挂载 `userdata`，以及如何暴露 Web 端口。展开后的侧边栏也只标识产品，没有提供直接访问源码仓库的入口。

## 决策

仓库根目录 Makefile 是知我AI命令入口。它的目标用于安装依赖、构建、运行和测试源码组合，验证项目 `.env` 与所选资料目录，以及构建、启动、停止、重启、检查 Docker 组合并跟踪日志。`USERDATA_DIR`、`DSH_HOME_DIR` 与 `ZHIWO_PORT` 是显式覆盖变量；默认值保留已有的 `userdata`、`.artifacts/zhiwo` 与 `18000` 行为。源码目标会先清除继承的 DeepSeek Provider 变量，再由 Node 预加载项目 `.env`；Compose 会注入同一文件，因此两个受支持的启动路径都不依赖也不会优先使用继承进程或用户 Home 文件提供的凭据。

生产 Dockerfile 会构建 Workspace，静态构建与目标 Linux 平台匹配的 Landlock Launcher，把每个生产 Workspace 依赖注入自包含的 `@deepseek-ai/dsh` 部署，拒绝断开的 Package Link，并以无特权 Node 用户通过普通 `dsh web` 入口运行包内的知我AI Patch。CLI 组合根直接提供其生产插件图导入的 Service Definition 与基础设施 Peer，因此 pnpm 会把它们纳入部署，而不依赖开发 Workspace 根。App Boot 会先跟随每个已安装 Package 到其真实位置，再遍历它的依赖图，因此 pnpm 注入式 Virtual Store 布局可以用完整插件闭包填充 Profile 模块回退目录。Runtime 镜像不包含源码 Checkout、开发依赖、主机 Package Link、凭据或用户资料。Compose 只在容器启动时注入项目 `.env`，要求只读挂载所选用户资料目录，把 DSH Session、身份、Workspace 元数据与知我AI私有问题缓存保存在 `/data/dsh` 的命名卷 `zhiwo-state` 中，等待 HTTP 健康检查，并在未被明确停止时重启服务。Web Server 通过 `ZHIWO_LISTEN_HOST=0.0.0.0` 监听容器内所有接口，而 Compose 默认只发布到主机回环地址。Docker 停止与清理不会删除命名状态卷。

通用侧边栏声明可选的根作用域 single slot `sidebar.brand.action`，它与品牌的 New Session 按钮相邻，但位于按钮外部。知我AI在该 slot 注册带无障碍名称的 GitHub 图标，通过带 Opener 隔离的新标签页链接到 `https://github.com/monshunter/askme-ai`，并复用现有侧边栏 Token 呈现 Hover 与 Focus 状态。通用组合让该 slot 保持为空。

## 考虑过的替代方案

**把整个仓库复制到 Runtime 镜像。** Runtime 只需要已部署的 CLI 与生产依赖，不需要源码、测试、包管理器缓存或本地 `userdata`，因此不采用。

**把用户资料写入镜像。** 不采用，因为 `userdata` 是用户拥有的运行时输入，不是应用依赖。嵌入资料会让可复用镜像绑定某一位用户的私有内容，并迫使资料更新重建镜像。因此 Compose 要求启动时挂载所选主机目录，并使用只读语义。DSH 状态仍使用独立命名卷，因为 Session 与身份必须在替换镜像后继续存在。

**把 `.env` 凭据写入镜像。** 凭据必须保持为可替换的本地配置，且不能保留在镜像层中。要求项目文件可以消除对用户 Home 或继承配置的依赖，而 Compose Runtime 注入仍能让镜像保持可分发，因此不采用写入镜像的方案。

**把容器发布到主机所有网络接口。** 该组合不提供账号登录、流量限制、TLS 终止或经过加固的公开部署。只发布到回环地址可以让外部暴露继续成为显式的反向代理决策，因此不采用全接口发布。

**让品牌身份或其仓库链接启动 Session。** 专用 New Session 控件已经持有该行为。静态身份与 Sibling Action 可以避免含义模糊和嵌套交互，也让其他产品组合无需替换侧边栏几何即可添加独立控件，因此不采用该方案。

## 测试

聚焦 App Boot 测试覆盖通过 pnpm 风格 Package 符号链接修复依赖闭包。聚焦侧边栏与知我AI UI 测试覆盖 Slot 声明、注册生命周期、独立链接语义、本地化无障碍名称和展开布局。已组合的无密钥知我AI浏览器 Snapshot 要求仓库地址、新标签页目标与 Opener 隔离。Compose 配置检查固定只读绝对资料挂载、命名状态卷、回环端口、重启策略和健康检查。真实部署验收会启动构建后的容器，在浏览器中打开产品，验证展开后的侧边栏操作，重启服务，并确认服务与持久状态恢复。

## 后果

生产镜像构建会编译并注入仓库 Package，因此有意比源码启动更慢，但可以在不同用户资料目录之间复用。生成的 Runtime 不包含开发依赖、凭据、源码路径依赖或用户资料。运维者可以在容器启动时选择当前 `userdata` 而不重建镜像；常规重启或 Compose 停止与清理会保留会话状态。删除命名卷仍是独立的破坏性操作。公开部署仍然需要带身份验证的 TLS 反向代理与流量控制。
