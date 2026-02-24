# Railway 部署指南

本文档说明如何将 openclaw-mission-control 项目部署到 [Railway](https://railway.app)。

> 本地开发：继续使用根目录的 `compose.yml`，无需任何改动。

---

## 架构概览

Railway Project 中共 **5 个 Service**：

| Service | 类型 | 说明 |
|---------|------|------|
| `postgres` | Railway Plugin | PostgreSQL 数据库 |
| `redis` | Railway Plugin | Redis（RQ 任务队列） |
| `backend` | GitHub Repo | FastAPI API 服务 |
| `webhook-worker` | GitHub Repo | RQ Worker 后台任务 |
| `frontend` | GitHub Repo | Next.js 前端 |

---

## 第一步：创建 Railway Project

1. 登录 [railway.app](https://railway.app) → New Project
2. 选择 **Empty Project**

---

## 第二步：添加数据库 Plugin

在 Project 中依次点击 **+ New** → **Database**：

1. 添加 **PostgreSQL** → Railway 自动注入 `DATABASE_URL`（格式：`postgresql://...`）
2. 添加 **Redis** → Railway 自动注入 `REDIS_URL`（格式：`redis://...`）

> [!NOTE]
> Railway Plugin 注入的 `DATABASE_URL` 使用 `postgresql://` scheme。  
> 后端 SQLAlchemy 需要 `postgresql+psycopg://`，需在 backend 环境变量中手动转换，见下文。

---

## 第三步：部署 backend Service

1. **+ New** → **GitHub Repo** → 选择本仓库
2. Settings → **Build**：
   - Root Directory: `backend`
   - Dockerfile Path: `Dockerfile`
3. Settings → **Deploy** → Start Command：留空（使用 Dockerfile CMD）
4. **Variables** 中添加以下环境变量：

| 变量名 | 值 | 说明 |
|-------|-----|------|
| `DATABASE_URL` | `postgresql+psycopg://<user>:<pass>@<host>:<port>/<db>` | 将 Plugin 提供的 URL 中 `postgresql://` 改为 `postgresql+psycopg://` |
| `REDIS_URL` | `${{redis.REDIS_URL}}` | 引用 Redis Plugin 变量 |
| `RQ_REDIS_URL` | `${{redis.REDIS_URL}}` | 同上 |
| `AUTH_MODE` | `local` 或 `clerk` | 认证模式 |
| `LOCAL_AUTH_TOKEN` | `<your-token-50+chars>` | AUTH_MODE=local 时必填，≥50字符 |
| `CLERK_SECRET_KEY` | `sk_...` | AUTH_MODE=clerk 时必填 |
| `CORS_ORIGINS` | `https://<your-frontend>.up.railway.app` | 前端公网 URL（部署 frontend 后填写） |
| `DB_AUTO_MIGRATE` | `true` | 首次部署自动执行 Alembic 迁移 |
| `ENVIRONMENT` | `production` | |
| `LOG_FORMAT` | `json` | 推荐 Railway 日志格式 |
| `LOG_USE_UTC` | `true` | |

---

## 第四步：部署 webhook-worker Service

1. **+ New** → **GitHub Repo** → 选择本仓库（同一仓库，第二个 Service）
2. Settings → **Build**：
   - Root Directory: `backend`
   - Dockerfile Path: `Dockerfile.worker`
3. **Variables**：

| 变量名 | 值 |
|-------|-----|
| `DATABASE_URL` | 同 backend（`postgresql+psycopg://...`）|
| `REDIS_URL` | `${{redis.REDIS_URL}}` |
| `RQ_REDIS_URL` | `${{redis.REDIS_URL}}` |
| `AUTH_MODE` | 同 backend |
| `LOCAL_AUTH_TOKEN` | 同 backend |
| `RQ_QUEUE_NAME` | `default` |

---

## 第五步：部署 frontend Service

1. **+ New** → **GitHub Repo** → 选择本仓库
2. Settings → **Build**：
   - Root Directory: `frontend`
   - Dockerfile Path: `Dockerfile`
3. **Variables**：

| 变量名 | 值 | 说明 |
|-------|-----|------|
| `NEXT_PUBLIC_API_URL` | `https://<your-backend>.up.railway.app` | backend Service 的公网 URL（不含末尾 `/`） |
| `NEXT_PUBLIC_AUTH_MODE` | `local` 或 `clerk` | 与 backend 保持一致 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_...` | AUTH_MODE=clerk 时填写 |

> [!IMPORTANT]
> `NEXT_PUBLIC_API_URL` 的长度**不能超过 64 个字符**（含协议头），否则 entrypoint.sh 的文本替换会报错。  
> 如遇较长域名，可在 Railway 中为 backend 配置自定义短域名。

> [!NOTE]
> Railway 在构建时使用占位符，容器启动时由 `entrypoint.sh` 将 `NEXT_PUBLIC_API_URL` 实际值注入编译后的 JS 中，无需重新构建镜像即可切换 backend 地址。

---

## 第六步：更新 CORS_ORIGINS

frontend 部署完成后，获取其公网 URL，回到 **backend Service** 的 Variables，更新：

```
CORS_ORIGINS=https://<your-frontend>.up.railway.app
```

然后触发 backend redeploy 使配置生效。

---

## 服务间引用变量（Railway Reference Variables）

在 Railway Variables 中使用 `${{ServiceName.VARIABLE_NAME}}` 格式引用其他 Service 的变量，例如：

```
REDIS_URL=${{redis.REDIS_URL}}
```

---

## 常见问题

### `LOCAL_AUTH_TOKEN` 格式要求
必须至少 50 个字符，且不能是占位符（如 `change-me`）。可用命令生成：
```bash
openssl rand -hex 32
```

### 数据库 URL scheme 转换
Railway PostgreSQL Plugin 提供的格式为 `postgresql://`，但 psycopg3 驱动需要 `postgresql+psycopg://`，
手动将 URL 中前缀替换后填入 `DATABASE_URL` 变量即可。

### 首次部署数据库迁移
设置 `DB_AUTO_MIGRATE=true` 后，backend 启动时会自动执行 Alembic 迁移，无需手动操作。
后续稳定运行可改为 `false`。
