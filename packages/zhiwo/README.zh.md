# 知我AI 包

[English](README.md) | 中文

`zhiwo/` 分组负责应用到原生 `dsh web` 上的小型知我AI 产品覆盖层；`zhiwo` 仍是内部包与 Preset ID。

| 包 | 职责 |
|---|---|
| [`product/`](product/README.md) | 注册原始 Workspace，并交付 Web Profile Patch。 |
| [`ui/`](ui/README.md) | 填充原生 Brand 与问候语 Slot、呈现 Session 历史和语言切换，并移除不需要的 Workspace 与诊断界面元素。 |

Agent 组合由随仓库交付的 [`zhiwo` Preset](../../apps/cli/config/agent-presets/zhiwo/agent.cordis.yml) 定义。原生 Host、API、Agent Loop、Persistence 与浏览器包仍是实际实现；本分组不复制这些能力。
