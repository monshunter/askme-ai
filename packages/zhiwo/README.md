# AskmeAI packages

English | [中文](README.zh.md)

The `zhiwo/` group owns the small AskmeAI product overlay applied to native `dsh web`. AskmeAI is the material owner's personal Agent for visitors and represents that owner when answering; `zhiwo` remains the internal package and preset id.

| Package | Role |
|---|---|
| [`agent-policy/`](agent-policy/README.md) | Confines discovery tools to the canonical Session workspace and projects successful read paths as relative locations. |
| [`product/`](product/README.md) | Registers the raw Workspace, derives the bilingual question catalog, and ships the Web profile patch. |
| [`ui/`](ui/README.md) | Fills native brand, greeting, question, and product-copy slots; renders Session history and the language switch; and removes unused Workspace and diagnostic chrome. |

The Agent composition is the shipped [`zhiwo` preset](../../apps/cli/config/agent-presets/zhiwo/agent.cordis.yml). Its persona makes the material owner, visitor, and Agent distinct: first-person answers refer to the owner, never the Agent or visitor. The native Host, API, Agent Loop, persistence, and browser packages remain the implementation; this group does not duplicate them.
