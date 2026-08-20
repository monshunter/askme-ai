# 知我包

[English](README.md) | 中文

`zhiwo/` 分组负责构建在上游 harness 服务之上的固定产品层。

| 包 | 职责 | Cordis 服务 |
|---|---|---|
| [`product/`](product/README.md) | 知识编译器、访客身份、统一 SQLite 数据、revision 范围工具、Agent Loop 组合与窄 HTTP 服务 | 无；该包负责产品组合 |

上游 coding 包作为 baseline 维护的源码输入保留；除非本表和[包分类](../../docs/PACKAGE_CLASSIFICATION.md)另有说明，知我应用不会依赖这些包。
