# 安装脚本的平台支持矩阵 (Installer platform support)

此文档定义了 `./install.sh` 一键安装脚本当前的平台支持状态。

## 支持状态定义

- **稳定支持 (Stable)**：在 CI 中经过完整测试的路径，预期能够端到端顺利运行。
- **脚手架支持 (Scaffolded)**：能够成功检测出对应的 Linux 发行版，并能提供明确且可操作的安装提示指导（actionable install guidance），但尚未实现全自动的系统包静默安装。
- **不支持 (Unsupported)**：安装器无法检测出该发行版 / 包管理器。

## 当前支持矩阵

| 发行版家族 (Distro family) | 包管理器 | 状态 | 备注说明 |
|---|---|---|---|
| Debian / Ubuntu | `apt` | **稳定支持 (Stable)** | 全自动安装前置依赖的完整路径。 |
| Fedora / RHEL / CentOS | `dnf` / `yum` | **脚手架支持 (Scaffolded)** | 支持检测 + 提供手动执行命令；自动安装功能待开发 (TODO)。 |
| openSUSE | `zypper` | **脚手架支持 (Scaffolded)** | 支持检测 + 提供手动执行命令；自动安装功能待开发 (TODO)。 |
| Arch Linux | `pacman` | **脚手架支持 (Scaffolded)** | 支持检测 + 提供手动执行命令；自动安装功能待开发 (TODO)。 |
| 其他 Linux 发行版 | 未知 | **不支持 (Unsupported)** | 安装脚本将中断退出，并提示需要手动处理包管理器的依赖配置。 |

## 开发护栏与原则

- 每次关于多平台兼容性的 PR（Pull Request），都必须保证 Debian/Ubuntu 环境的行为依然稳定可靠。
- 新增发行版的支持应当基于明确的"包管理器适配器 (package-manager adapters)"进行扩展并提供测试。
- 如果某个发行版处于“脚手架支持”阶段尚未完全自动化落地，安装器应当采用快速失败 (fail fast) 策略，并向用户提供明确、可操作的手动执行命令指令（而不是抛出泛泛的报错信息）。
