# 开发工作流 (Development workflow)

## 数据库迁移完整性门控 (CI)

CI (持续集成) 强制执行了迁移完整性门控，以防止在代码合并时发生数据库结构损坏。

### 它验证了什么

- Alembic 迁移脚本可以从一个干净的 Postgres 数据库成功应用 (`upgrade head`)
- 在所有迁移脚本应用后，Alembic 的版本图可以顺利解析到 Head (顶部) 版本
- 在涉及迁移的 PR (Pull Requests) 中，CI 还将检查模型 (Model) 的改变是否伴随着对应的迁移脚本更新

如果上述任何一项检查失败，CI 将报错并阻止 PR 的合并。

### 本地复现

在代码库根目录下运行：

```bash
make backend-migration-check
```

该命令将启动一个临时的 Postgres 容器，运行迁移检查逻辑，并在结束后清理容器。
