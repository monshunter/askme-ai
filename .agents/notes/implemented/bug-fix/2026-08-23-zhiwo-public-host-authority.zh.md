# Agent Note: 知我AI公网 Host Authority

Status: implemented

[English](2026-08-23-zhiwo-public-host-authority.md) | 中文

## 问题

[Docker 部署](../feature/2026-08-23-zhiwo-docker-deployment.md)通过公网反向代理提供静态文件，但只在回环地址发布主机端口。更关键的是，API Browser Trust Check 收到代理保留的公网 `Host` 后，因该部署没有声明对应 Authority 而在 RPC Dispatch 前返回 `403`。页面可以打开，但 `host.describe`、事件流和 Session 创建都无法连接。

## 决策

Compose 在 `0.0.0.0` 发布所选容器端口，并要求从部署实例的 `.env` 读取 `ZHIWO_TRUSTED_HOST`。该值是不带 Scheme 的规范 `host` 或 `host:port`，通过已有 `--trusted-host` 选项传入。可复用 Compose 文件不包含具体部署域名；每位运维者提供访客实际使用的 Authority。

原生 Host 与 Origin 检查保持启用。请求必须使用已声明 Authority 和同源浏览器标记；仅限回环的特权方法继续保留原有限制。反向代理保留浏览器访问的 Host，不会重写或剥离安全 Header。

## 考虑过的替代方案

**在 Compose 中写死当前公网域名。** 不采用，因为这会让每个安装都耦合到一个部署实例，并导致其他运维者的有效域名失败。

**让代理把 Host 重写为回环地址。** 不采用，因为浏览器 Origin 会与 Host 不一致；剥离或伪造 Origin 会削弱现有跨站防护。

**接受任意 Host。** 不采用，因为这会移除 DNS Rebinding 防护，而不是声明当前部署拥有的 Authority。

## 测试

渲染后的 Compose 配置记录实例提供的 Authority 与 `0.0.0.0` 端口发布。真实验收要求公网 `host.describe` 与 `session.create` 返回 HTTP 200，浏览器中的“新建会话”控件和输入框可用，并且选择“新建会话”后不出现 `403` 或 `forbidden` 状态。

## 后果

主机端口可以从所有主机接口访问，因此身份验证、TLS 终止与流量控制仍由部署负责。缺少或格式错误的 `ZHIWO_TRUSTED_HOST` 会在公网部署静默提供 API 不可用的页面前导致失败。应用镜像与 Compose 文件可以在不同域名间复用。
