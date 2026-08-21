# 知我 Fork Baseline

[English](fork-baseline.md) | 中文

知我 0.4 基于 DeepSeek Harness 官方 Commit `141eb6fef83422698aef7a981029e843e8161534`。其产品架构是原生 Web Profile 上的 Patch。

## 运行时拓扑

```text
dsh web
  + packages/zhiwo/product/cordis.patch.yml
      -> register userdata/ in the native Workspace Registry
      -> select the shipped zhiwo Agent preset
      -> keep native Host / API / Session / Agent Loop / browser
      -> expose native read / glob / grep
      -> fill native brand slots
```

Session `cwd` 是 `userdata/` 的规范路径。原生 Filesystem Consumer 根据该 Workspace 解析模型路径并检查当前文件。`DSH_HOME` 下的原生 DSH Persistence 负责 Workspace 元数据与 Session 历史。

## 源码平面与产物平面

仓库使用普通 Host 与 Client Aggregate 以及普通 `pnpm run build`。Product 包输出一个 Host Entry 及其 Patch；UI 包输出一个 Client Plugin。标准 CLI 仍是唯一可执行入口。

## 负向产品图

知我没有独立 Server、API、数据库、Agent Loop、浏览器应用、编译器、索引、同步语料或版本化知识格式。Agent Preset 不挂载 Mutation、Shell、Network 与 Orchestration Tool。浏览器缩减是对原生 Client Roster 的 Patch 层选择，而不是 Client Fork。

维护清单见[包分类](../PACKAGE_CLASSIFICATION.md)与[上游差异](../UPSTREAM_DELTA.md)。
