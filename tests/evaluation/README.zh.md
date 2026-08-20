# 知我评测集

[English](README.md) | 中文

该版本化、无密钥 Release Set 固定产品要求的安全、全部 Userdata 可读与 Grounding Cases。Source Name 使用 Fixture Alias，因为 Compiler Source ID 是不透明且随 Revision 变化的。Product Integration Suite 会在每次 Fixture Sync 后解析这些 Alias，并通过 Deterministic Mock HTTP Provider 对真实上游 Agent Loop 与 DeepSeek Adapter 执行测试。

Live-provider Evaluation 可以在 Baseline 旁新增 Report，但不能替代 Internal-path Output、Invalid Citation、Cross-guest Access 和 Coding Capability Reachability 的零容忍检查。
