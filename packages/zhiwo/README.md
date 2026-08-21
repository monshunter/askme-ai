# AskmeAI packages

English | [中文](README.zh.md)

The `zhiwo/` group owns the small AskmeAI product overlay applied to native `dsh web`; `zhiwo` remains the internal package and preset id.

| Package | Role |
|---|---|
| [`product/`](product/README.md) | Registers the raw Workspace and ships the Web profile patch. |
| [`ui/`](ui/README.md) | Fills native brand and greeting slots, renders Session history and the language switch, and removes unused Workspace and diagnostic chrome. |

The Agent composition is the shipped [`zhiwo` preset](../../apps/cli/config/agent-presets/zhiwo/agent.cordis.yml). The native Host, API, Agent Loop, persistence, and browser packages remain the implementation; this group does not duplicate them.
