# 开发策略：每个 PR 仅包含一个数据库迁移文件 (One DB migration per PR)

## 规则

如果某个 Pull Request (PR) 尝试在此路径下新增迁移文件：

- `backend/migrations/versions/*.py`

……那么该 PR **不得新增超过一个**迁移文件。

## 为什么这样做

- 使代码审查和问题回滚变得更加简单直接。
- 减少由于 Alembic 出现多个未预期的 head 尖端版本而带来的困扰。
- 保证 CI 或自动安装程序失败时更容易定位 Debug。

## 常见例外与指导建议

- 当您在本地开发时产生多个 Alembic heads 时，优先将其合并为一个包含 multiple head 解决策略的**单一**合并迁移文件。
- 如果是两个毫无关联的开发特性，请把它们拆分到多个不同的 PR 中进行提交。

## CI 强制门控

CI 系统将对每个 PR 运行 `scripts/ci/one_migration_per_pr.sh` 检查脚本。如果检测到新增了超过 1 个的迁移文件，CI 流程将会失败。

## 补充说明

本策略并不会替代既有的迁移完整性校验门控逻辑 (`make backend-migration-check`)。它只是一个轻量级的规范护栏，专门用于阻止在单个 PR 中塞入多个独立迁移的行为。
