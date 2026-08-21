# 知我AI 包

[English](README.md) | 中文

`zhiwo/` 分组负责应用到原生 `dsh web` 上的小型知我AI 产品覆盖层。知我AI 是资料所有者面向访客的个人 Agent，基于资料代表所有者回答；`zhiwo` 仍是内部包与 Preset ID。

| 包 | 职责 |
|---|---|
| [`product/`](product/README.md) | 注册原始 Workspace、派生双语问题目录，并交付 Web Profile Patch。 |
| [`ui/`](ui/README.md) | 填充原生 Brand、问候语、提示问题与产品文案 Slot，呈现 Session 历史和语言切换，并移除不需要的 Workspace 与诊断界面元素。 |

Agent 组合由随仓库交付的 [`zhiwo` Preset](../../apps/cli/config/agent-presets/zhiwo/agent.cordis.yml) 定义。它明确区分资料所有者、访客与 Agent：回答中的第一人称指资料所有者，不能指 Agent 或访客。原生 Host、API、Agent Loop、Persistence 与浏览器包仍是实际实现；本分组不复制这些能力。
