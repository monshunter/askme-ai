# 知我

[English](README.md) | 中文

知我（英文代码名 Askme）是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的一套只读个人知识问答产品外观。产品保留上游 Agent Loop、LLM 适配器、推理、工具调用、流式输出和会话事件行为，只替换 coding 产品暴露的实体、公开 API、持久化、命令和浏览器界面。

生产制品只有一个 `zhiwo` 命令，不包含工作区选择器、Shell、终端、Web 搜索、动态插件 loader、工作流、subagent 或 coding UI。模型在一个轮次内只能使用 revision 范围的 `read`、`glob` 和 `grep`；每个展示给访客的引用都必须对应本轮实际访问的来源。

## Run

### Run from source

安装 Node.js 24 或受支持的 Node.js 22 版本及 pnpm，然后准备知识 revision 和产品构建：

```sh
pnpm install
pnpm run build
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo sync --source ./userdata
```

将 `ZHIWO_COOKIE_SECRET` 设置为至少 32 字节，并提供 `ZHIWO_MODEL`、`ZHIWO_MODEL_API_KEY` 和使用 HTTPS 的 `ZHIWO_PUBLIC_ORIGIN`，然后启动产品：

```sh
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo serve
```

在回环地址进行本地开发时，设置 `ZHIWO_DEVELOPMENT=true` 并使用 HTTP Origin。关于编译限制、密钥轮换、备份、回滚、保留策略和生产接口验证，参见[运维指南](docs/user/zhiwo.md)。

## 产品命令

- `zhiwo sync [--check]` 将可变 `userdata/` 下的全部普通文件编译为一个不可变只读 revision。
- `zhiwo serve [--dev]` 启动仅包含产品功能的 UI 和 API。
- `zhiwo doctor` 校验 Current Revision 和统一的 SQLite 数据库。
- `zhiwo gc [--dry-run]` 清理既非 Current Revision、也未被会话引用的 revision。
- `zhiwo rollback <revision-id>` 为 New Sessions 原子选择一个保留且已校验的 Revision。
- `zhiwo version` 打印产品版本和精确的官方上游 baseline。

## 开发

`pnpm run zhiwo:test`、`zhiwo:build`、`zhiwo:surface` 和 `zhiwo:release` 是稳定的产品检查。仓库保留上游 developer harness，供选择性同步 baseline 和执行 Kernel 回归。知我随包携带原生 Agent Loop 所需的服务定义，但其装配、工具注册表、HTTP 路由、浏览器客户端和发布入口只暴露只读职业知识产品。

Fork 清单见[上游维护](UPSTREAM.md)、[包分类](docs/PACKAGE_CLASSIFICATION.md)、[上游差异](docs/UPSTREAM_DELTA.md)和[baseline 架构](docs/architecture/fork-baseline.md)。贡献者遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)。第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)；每次产品构建还会生成 SPDX SBOM 和产物校验和。
