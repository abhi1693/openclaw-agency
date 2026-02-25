# OpenClaw Mission Control

[![CI](https://github.com/abhi1693/openclaw-mission-control/actions/workflows/ci.yml/badge.svg)](https://github.com/abhi1693/openclaw-mission-control/actions/workflows/ci.yml) ![Static Badge](https://img.shields.io/badge/Join-Slack-active?style=flat&color=blue&link=https%3A%2F%2Fjoin.slack.com%2Ft%2Foc-mission-control%2Fshared_invite%2Fzt-3qpcm57xh-AI9C~smc3MDBVzEhvwf7gg)

**OpenClaw Mission Control** 是跨团队和组织运行 OpenClaw 的集中化运营与治理平台，提供统一的可见性、审批控制和**网关感知 (gateway-aware)** 的编排能力。
它为运维人员提供了一个一体化的界面界面，涵盖工作流编排、Agent 和网关管理、基于审批的治理机制，以及由 API 驱动的自动化系统。

<img width="1896" height="869" alt="Mission Control dashboard" src="https://github.com/user-attachments/assets/49a3c823-6aaf-4c56-8328-fb1485ee940f" />
<img width="1896" height="858" alt="image" src="https://github.com/user-attachments/assets/2bfee13a-3dab-4f4a-9135-e47bb6949dcf" />
<img width="1890" height="865" alt="image" src="https://github.com/user-attachments/assets/84c2e867-5dc7-4a36-9290-e29179d2a659" />
<img width="1912" height="881" alt="image" src="https://github.com/user-attachments/assets/3bbd825c-9969-4bbf-bf31-987f9168f370" />
<img width="1902" height="878" alt="image" src="https://github.com/user-attachments/assets/eea09632-60e4-4d6d-9e6e-bdfa0ac97630" />

## 平台概览

Mission Control 旨在成为 OpenClaw 的日常运营的核心工作台。
团队不再需要在多个工具之间分散工作，而是可以**在一个系统中完成规划、执行、审查和审计**。

核心运营能力包含：

- **工作流编排**：管理组织（organizations）、主板组（board groups）、主板（boards）、任务（tasks）和标签（tags）。
- **Agent 运营**：从统一的控制面板中创建、检查和管理 Agent 的生命周期。
- **治理与审批**：将敏感操作路由至明确的审批流中，确保安全与合规。
- **网关管理 (Gateway)**：连接和操作网关集成，轻松应对分布式分布式运行环境。
- **操作可见性**：通过系统操作的时间线进行历史回溯，支持更快的调试排错与责任追踪。
- **API 优先模式**：同一平台不仅支持 Web UI 界面的人工操作，也支持自动化客户端的无缝接入。

## 核心应用场景

- **多团队 Agent 运营**：通过单一的控制面板跨组织管理多个业务模块和 Agent 任务。
- **人机交互协同 (Human-in-the-loop)**：在敏感和高风险的 Agent 操作之前要求人工审批，并保留完整的决策审计追踪。
- **分布式运行环境控制**：无需改变运维流程即可连接远程网关、操作位于其他环境中的 Agent 实例。
- **审计与故障复盘**：利用活动历史记录还原事件时间轴——发生了什么、什么时候发生、由谁发起的指令。
- **内部流程通过 API 集成**：将现有的内部工作流和自动化客户端对接到与 UI 界面同样强大的底层运营模型中。

## 为什么选择 Mission Control？

- **运营优先 (Operations-first) 的设计**：专为可靠地运行大规模 Agent 任务而构建，而不仅仅是简单的任务创建工具。
- **原生内置的治理机制**：审批流程、各种不同的授权模式与清晰的安全边界是系统的一等公民。
- **网关感知的前沿编排**：设计之初就考虑并支持跨越本地与云端分布式连接环境的编排运行。
- **UI 与 API 的统一模型**：无论是在图形界面操作还是写代码实现自动化，面对的对象和生命周期是完全一致的。
- **团队级规模的支持**：在一个权威体系下包含组织机构、协作组、具体看板、任务分配、标签以及多角色用户管理。

## 适用对象圈层

- **平台研发团队**：希望在本地算力中心或企业内网中自建部署运行 OpenClaw。
- **系统运维与业务工程团队**：迫切需要清晰的审批流程和完备的审计控制能力。
- **技术导向型的企业**：希望底层系统必须可通过 API 深度访问，同时不要失去开箱即用的 Web UI 面板。

---

## 快速开始

可以通过以下三种方式快速在几分钟内启动该平台。

### 选项 A：生产级参数的一键部署脚本

如果你尚未 clone 本仓库，可以用以下命令直接一键执行：

```bash
curl -fsSL https://raw.githubusercontent.com/abhi1693/openclaw-mission-control/master/install.sh | bash
```

如果你已经克隆了本代码库：

```bash
./install.sh
```

该安装脚本是交互式的，它将协助你：

- 询问你期望的部署模式（`docker` 或 `local` 本机环境）。
- 在可能的情况下自动安装缺失的系统依赖。
- 生成并配置所需的环境变量文件（`.env` 等）。
- 启动初始化数据库并按所选模式拉起服务。

安装脚本支持的操作系统/环境矩阵可参考：[`docs/installer-support.md`](./docs/installer-support.md)

### 选项 B：手动本地部署 (Docker Compose)

#### 前置条件

- Docker Engine
- Docker Compose v2 (`docker compose`)

#### 1. 配置环境变量

```bash
cp .env.example .env
```

启动前请检查：

- 当 `AUTH_MODE=local` 时，给 `.env` 里的 `LOCAL_AUTH_TOKEN` 设置一个非占位符的真实秘钥（长度至少 50 个字符）。
- 确保 `NEXT_PUBLIC_API_URL` 填写的地址可以被你的浏览器顺利访问。

#### 2. 启动 Mission Control

```bash
docker compose -f compose.yml --env-file .env up -d --build
```

#### 3. 打开应用

- Mission Control 控制台 UI 界面: http://localhost:3000
- 后端 API 健康检查: http://localhost:8000/healthz

#### 4. 停止项目容器

```bash
docker compose -f compose.yml --env-file .env down
```

### 选项 C：一键部署到 Railway (云端)

本项目已支持开箱即用的 Railway PaaS 平台零代码部署。后端、前端独立工作，原生支持云数据库注入。

详细的 Railway 图文部署指南，请阅读：👉 **[Railway 完整部署指南 / railway-deployment.md](./docs/railway-deployment.md)**

---

## 身份验证

Mission Control 目前原生提供两种身份验证模式：

- `local` 模式：使用共享的静态 Bearer Token（推荐小型自建团队、测试用例的默认选择）
- `clerk` 模式：通过外部的 Clerk JWT 提供基于云端的账号安全流

各端的环境变量参考模板：

- 项目根目录: [`.env.example`](./.env.example)
- 后端目录: [`backend/.env.example`](./backend/.env.example)
- 前端目录: [`frontend/.env.example`](./frontend/.env.example)

## 文档参考

有关平台部署、线上生存指南、故障排除以及测试验收的完整手册，都请参阅根目录下的 [`/docs`](./docs/) 文件夹。

## 项目状态

Mission Control 目前处于高速的 **活跃开发（Active Development）** 阶段中。

- 随着版本迭代，功能版图和 API 可能有结构性突破更改。
- 强烈建议将其引入您的生产环境前，先在沙箱与测试网进行安全性的配置验证并固化参数设置。

## 参与贡献

我们欢迎社区提交 Issue 和 Pull Requests 来一起建设这个项目。

- [参与贡献指南 (Contributing guide)](./CONTRIBUTING.md)
- [尚未解决的 Issues](https://github.com/abhi1693/openclaw-mission-control/issues)

## 开源协议

MIT License. 详细信息请参见 [`LICENSE`](./LICENSE)。

## Star 趋势图

[![Star History Chart](https://api.star-history.com/svg?repos=abhi1693/openclaw-mission-control&type=date&legend=top-left)](https://www.star-history.com/#abhi1693/openclaw-mission-control&type=date&legend=top-left)
