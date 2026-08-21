# 知我包分类

[English](PACKAGE_CLASSIFICATION.md) | 中文

本清单记录知我 0.4 与原生 DSH 包图的关系。知我是覆盖层，不是替代应用。

## 分类

| 类别 | 位置 | 知我处理方式 |
|---|---|---|
| 保留 | `apps/cli`；`packages/bundle/{base,web-app}`；原生 Host、API、Agent Loop、Session、Persistence、Workspace、Model、Tool 与 Client 包 | 通过普通 `dsh web` 组合使用，不派生知我专用运行时行为。 |
| 调整 | `packages/fs/tool-fs` | 通用 `mutations` 选项允许 Preset 挂载维护中的 Reader，而不注册 `write` 或 `edit`；其他 Profile 的默认值仍为 `true`。 |
| 新增 | `packages/zhiwo/{product,ui}`；`apps/cli/config/agent-presets/zhiwo` | 注册一个原始 Workspace、固定只读 Agent 组合、缩减浏览器 Roster，并提供知我品牌。 |
| 未挂载 | Mutation、Shell、Terminal、Web、Skill、Plan、Goal、Todo、Job、Workflow 与 Subagent Consumer；配置和编码专用浏览器 Occupant | 仍是维护中的 DSH 包，但不会进入知我的 Agent 工具目录或浏览器 Roster。 |

## 依赖规则

CLI 声明 `@deepseek-ai/dsh-zhiwo-product`，使 Loader 可以解析 `--patch` 指定的覆盖层。Product 包依赖 Brand 包，其他原生 Service Definition 通过 Peer Dependency 使用。两个知我包均为私有包并携带产品 `VERSION`；它们不加入上游 npm 发布族。

Product 包不包含 Agent Loop、Server、Persistence 实现、Model Adapter、知识编译器或浏览器应用。设计理由由[原生覆盖层决策](../.agents/notes/implemented/simplification/2026-08-21-zhiwo-native-web-overlay.md)维护。
