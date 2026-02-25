# 网关 WebSocket 协议 (Gateway WebSocket protocol)

## 连接类型

OpenClaw Mission Control 同时支持建立安全 (`wss://`) 与非安全 (`ws://`) 的 WebSocket 网关连接。

### 安全连接 (wss://)

对于生产环境，始终建议使用挂载了有效 TLS 证书的 `wss://` (WebSocket Secure) 安全连接。

### 自签名证书 (Self-Signed Certificates)

对于内部环境使用的自签名 TLS 证书，您可以通过一个开关来启用兼容支持：

1. 导航到网关配置页面 (Settings → Gateways)
2. 在创建或编辑网关配置时，勾选：**"允许自签名的 TLS 证书 (Allow self-signed TLS certificates)"**
3. 这一设置将对该网关配置下所有基于 `wss://` 的网关连接生效。

当您开启此选项后，Mission Control 会在此特定网关的请求中跳过 TLS 证书的证书链有效性验证。

**🚨 安全警告**：开启此功能会削弱传输层安全认证机制，仅当您完全信任目标端点以及其网络传输路径时才可使用。对于面向公网的主力生产网关，强烈建议始终使用由正规 CA 签发的有效证书。

## 相关配置项

在 Mission Control 中配置一个新的网关实例时，您可以指定以下参数：

- **网关 URL (Gateway URL)**：WebSocket 接入端点（例如：`wss://localhost:18789` 或 `ws://gateway:18789`）
- **网关 Token (Gateway Token)**：可选的身份验证令牌
- **工作区根目录 (Workspace Root)**：网关执行任务所需的文件根目录（例如：`~/.openclaw`）
- **允许自签名的 TLS 证书 (Allow self-signed TLS certificates)**：关闭当前网关在 `wss://` 连接时的 TLS 证书验证（默认：未开启）
