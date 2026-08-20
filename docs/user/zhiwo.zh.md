# 运维知我

[English](zhiwo.md) | 中文

本手册适用于单节点知我 0.4 产品。Owner 命令必须在已复核 `UPSTREAM_BASE` 和 `VERSION` 的固定 Checkout 中运行。

## 安装与配置

安装 Lockfile 固定的 Workspace 并构建产品。构建会生成产品 CLI、Browser Assets、Manifest、Surface Snapshot、SPDX SBOM 与 `SHA256SUMS`。

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run zhiwo:build
```

Public Runtime 只需要状态、不可变 Knowledge、模型配置与 Secret。不要把 Owner Source Variables 放入 `serve` 环境。

```sh
export ZHIWO_PUBLIC_ORIGIN=https://askme.example.com
export ZHIWO_LISTEN_HOST=127.0.0.1
export ZHIWO_LISTEN_PORT=13081
export ZHIWO_METRICS_PORT=13082
export ZHIWO_STATE_ROOT=/var/lib/zhiwo/state
export ZHIWO_KNOWLEDGE_ROOT=/var/lib/zhiwo/knowledge
export ZHIWO_COOKIE_SECRET_FILE=/run/secrets/zhiwo_cookie_secret
export ZHIWO_MODEL=deepseek-chat
export ZHIWO_MODEL_API_KEY_FILE=/run/secrets/model_api_key
```

## 准备 Userdata 与编译配置

`userdata/` 接受任意普通文件和目录。该根目录下的全部普通文件进入同一份只读 Agent 数据，不存在文件级私有、仅引用或公开分级。Symlink、Hardlink、Device、Socket、FIFO、`.git` 内部文件和 `zhiwo.yaml` 控制文件不会成为来源。文本产物可预览，已引用来源的原文件可下载。

```yaml
version: 1
compiler:
  max_file_bytes: 52428800
  max_total_bytes: 2147483648
  max_archive_entries: 0
  git:
    enabled: true
    include_history_summary: true
    max_commits: 5000
starter_questions:
  - 他最有代表性的项目是什么？
  - 他适合 Agent Platform 岗位吗？
```

Text、PDF、DOCX、PPTX 与 XLSX 会生成有界 Text Artifacts。未知格式仍进入目录并可下载，但不会提供模型可读文本。`userdata/` 中疑似 Secret 的内容只计入 Owner Audit，不会被过滤或阻止；把文件放入该根目录即授权 Agent 读取。Git 分析只执行本地只读命令，禁用 Hook、Credential Helper、Prompt、Global Configuration 与 Network Operation，且永不发布 Remote URL。

## 校验、发布与回滚 Revision

在 Owner 或 CI 环境运行 Sync；该环境挂载 Raw Data 与 Knowledge Volume，但不拥有 Model Key、Cookie Secret、Session Database、SSH Agent 或 Docker Socket。`--check` 会执行 Compiler 与 Audit，但不改变 Current。Compiler 配置无效、Parser 失败、Checksum 失败或 Lock 竞争时，Current 保持不变。

```sh
export ZHIWO_SOURCE_ROOT=/app/userdata
export ZHIWO_CONFIG_FILE=/app/userdata/zhiwo.yaml
export ZHIWO_KNOWLEDGE_ROOT=/var/lib/zhiwo/knowledge
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo sync --check --json
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo sync --json
```

回滚时，从 `knowledge/revisions/` 中选择保留的 ID。命令在原子修改 Current 前校验 Manifest、Catalog、Audit 与 Artifacts。Existing Sessions 继续使用原 Revision；只有 New Sessions 使用回滚后的 Current。

```sh
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo rollback rev_example
```

## 启动、观测与诊断

`serve` 在监听前校验 Release Checksums、固定 Version/Baseline、Database Schema、Current Revision、空 Global Tool Registry、精确 Public Routes、Browser Chunks、Model Route、State Permissions 与 Cookie Strength。它拒绝 Owner Source Variables，而不会把 Raw Data 挂入 Public Process。

```sh
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo doctor
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo serve
curl -fsS http://127.0.0.1:13081/health/live
curl -fsS http://127.0.0.1:13081/health/ready
curl -fsS http://127.0.0.1:13082/metrics
```

JSON Request Logs 只包含随机 Request ID、标准化低基数 Route、Status、Latency 与安全 Error Code；不包含 Prompt、Answer、Source Text、Path、Cookie、Visitor ID、IP Address、Provider Body 或 Secret。`X-Request-Id` 用于关联 Browser Failure 与 Log，并作为 MVP Trace ID。对持续 Model Failure、Rate-limit 增长、Readiness Failure、Active Generation Saturation、Sync Failure、Database Integrity Failure 与 Revision GC Failure 配置告警。Metrics Listener 只绑定 Loopback，禁止公开代理。

## 轮换 Secret

轮换 Model Key File 并重启 `serve`，Knowledge Revision 无需变化。轮换 Cookie Secret File 前，应明确告知现有匿名 Identity Cookie 会失效，访客将获得新的隔离身份；随后再重启。Runtime 不会通过 IP、User Agent、localStorage 或 Browser Fingerprint 猜测旧身份。使用文件系统或 Secret Manager 原子替换，且不得通过 `doctor` 或日志打印 Secret。

## 备份与恢复 SQLite

使用 Node SQLite Online Backup API，通过部署方工具加密结果，并定义 Backup Expiry Window。不要直接复制正在写入的 DB/WAL 文件组合。

```sh
mkdir -p backup
node --input-type=module -e '
import { backup, DatabaseSync } from "node:sqlite";
const source = new DatabaseSync("runtime/state/zhiwo.db", { readOnly: true });
await backup(source, "backup/zhiwo.db");
source.close();
'
```

恢复时先停止 `serve`，通过同一 API 将 Backup 恢复到新文件，运行 SQLite Integrity 与 Foreign-key Checks，把旧 DB/WAL 文件保留到 Quarantine Directory，再原子放置已校验文件，重启并执行 `zhiwo doctor`。只有在保留 Session 可读取，且新删除 Session 在再次重启后仍不存在时，恢复演练才算完成。

## 删除数据与执行 Retention

浏览器的清空当前、删除单个与删除全部操作会取消 Active Generation、等待收敛，并从在线 SQLite 物理级联删除 Messages、Upstream Events、Source Access、Citations 与 Grants。重复删除安全，且不会泄露某个 ID 是否属于其他 Visitor。Offline Encrypted Backups 按部署披露的窗口到期。

```sh
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo gc --dry-run
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo gc
```

GC 执行配置的 Session Retention，删除 Orphan Guests，保留 Current 与配置数量的最新 Revisions，并拒绝清理任何被 Session 引用的 Revision。禁止手工删除 Revision Directory。

## 处理故障与来源误放

### Model Provider 故障

保持固定 Route，不回退到未经复核的 Model。新 Generation 返回稳定产品错误时，History、已引用来源与 Delete 仍可用。在不记录 Provider Body 的前提下检查 Public Network Policy 中的 Endpoint Reachability、Key-file Permission、Quota、Model ID 与低基数 Metrics。

### Parser 或 Sync 故障

只查看 Aggregate Audit Counts 与 Logical Warning Names。继续使用旧 Current，修正问题文件或 Compiler 配置，重新运行 `sync --check` 后再发布。不得通过启用 Runtime Parser 或 Shell 规避问题。

### 非预期来源发布

从 `userdata/` 删除误放文件，发布修正后的 Revision，并在必要时原子回滚。删除受影响的 Visitor Sessions 与 Grants，轮换已暴露凭据，在不读取正文的情况下复核 Access Logs，确定 Encrypted Backup Expiry，并把 Incident Evidence 保存在 Public Runtime 外。目录名或配置规则不能隐藏来源：只要位于 `userdata/` 下，就始终属于 Agent 可读范围。

## 更新 Upstream Baseline

使用 `upstream-sync/<version>` 分支。复核候选官方 Commit，更新 `UPSTREAM_BASE`，协调[上游差异](../UPSTREAM_DELTA.md)与[包分类](../PACKAGE_CLASSIFICATION.md)中的每条记录，然后执行 Preserved Kernel Tests、知我 Type/Build/Surface Gates、Compiler 与 Database Tests、Cross-guest/Source/Security E2E 和 Evaluation Set。合并前必须由人工确认没有新 Dependency、Tool、Route、Prompt Section、Event Requirement 或 Client Chunk 扩大产品能力。

## 验证 Release 没有 Coding Surface

运行固定产品门禁并检查 Release Identity。Surface Gate 只扫描构建后的 Browser JavaScript；Startup 会独立校验 Manifest、SBOM、全部 Checksums、Route List 与 Client Files。

```sh
pnpm run zhiwo:build
pnpm run zhiwo:test
pnpm run zhiwo:evaluate
pnpm run zhiwo:surface
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo version
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo doctor
```

公网暴露前，确认 Reverse Proxy 强制 HTTPS 与配置 Origin，只代理知我 Public Listener，保持 Streaming 且不缓冲，限制 Body 与 Header，不代理 Metrics 或 Owner Commands，并将 Application/Knowledge 只读挂载，仅允许 State 与已批准 Logs 可写。
