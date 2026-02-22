# Alibaba Cloud Deployment Guide

Production deployment for OpenClaw Mission Control on Alibaba Cloud.

## Architecture

```text
SLB (HTTPS/WSS termination)
  |
  +-- api.xxx.com ------> nginx -> api-server x2 (FastAPI, port 8000)
  +-- admin.xxx.com ----> nginx -> frontend x1 (Next.js, port 3000)
  +-- h5.xxx.com -------> nginx -> h5-app x1 (Phase 5)

ApsaraDB RDS PostgreSQL 16 (private endpoint)
ApsaraDB Redis 7 Cluster (private endpoint)
RQ Workers x2 (background jobs)
ACR (Docker image registry)
```

## Cloud Resources Required

| Service | Spec | Purpose |
|---------|------|---------|
| ECS x2 | 4C8G Ubuntu 22.04 | API Server (load balanced) |
| ECS x1 | 2C4G | Next.js Admin Frontend |
| ECS x2 | 2C4G | RQ Workers |
| ECS x1 | 2C4G | Event Bus Consumer |
| RDS PostgreSQL 16 | 2C4G 100GB HA | Primary database |
| Redis 7 | 4GB Cluster | Cache + Pub/Sub + Queue |
| SLB | Internet-facing | HTTPS/WSS load balancing |
| ACR | Standard | Docker image registry |
| SSL Certificate | Free DV via ACM | HTTPS/WSS termination |

## Initial Setup

### 1. Provision Cloud Resources

Create the resources listed above in your Alibaba Cloud console. Ensure all ECS instances, RDS, and Redis are in the same VPC with private network access.

### 2. Configure ACR

```bash
# Login to ACR
docker login registry.cn-shenzhen.aliyuncs.com

# Create namespaces: mc-backend, mc-frontend
```

### 3. Initialize RDS

```bash
# From a machine with psql and VPC access:
RDS_ADMIN_HOST=rm-xxxxx.pg.rds.aliyuncs.com \
RDS_ADMIN_USER=postgres \
RDS_ADMIN_PASS=<admin-password> \
RDS_DB=mission_control \
RDS_USER=mc_admin \
RDS_PASS=<app-password> \
  ./scripts/init-rds.sh
```

### 4. Configure Environment

```bash
cp env/.env.production.example env/.env.production
# Edit .env.production with actual values:
# - ACR_REGISTRY, RDS_*, REDIS_HOST
# - AUTH_MODE + credentials
# - H5_JWT_SECRET (generate with: openssl rand -hex 32)
# - LOCAL_AUTH_TOKEN (generate with: openssl rand -hex 32)
```

### 5. Build and Push Images

```bash
# From repo root:
docker build -f deploy/Dockerfile.backend.prod -t registry.cn-shenzhen.aliyuncs.com/<ns>/mc-backend:v1 .
docker build -f deploy/Dockerfile.frontend.prod -t registry.cn-shenzhen.aliyuncs.com/<ns>/mc-frontend:v1 frontend/

docker push registry.cn-shenzhen.aliyuncs.com/<ns>/mc-backend:v1
docker push registry.cn-shenzhen.aliyuncs.com/<ns>/mc-frontend:v1
```

### 6. Deploy

```bash
# Copy deploy directory to ECS:
scp -r deploy/aliyun/ user@ecs-host:/opt/openclaw/deploy/aliyun/

# SSH to ECS and deploy:
ssh user@ecs-host
cd /opt/openclaw/deploy/aliyun
TAG=v1 ./scripts/deploy.sh
```

## SLB Configuration

Configure the Server Load Balancer for WebSocket support:

| Setting | Value |
|---------|-------|
| Listener protocol | HTTPS (443) |
| Backend protocol | HTTP (80) |
| Connection timeout | 300 seconds |
| Idle timeout | 300 seconds |
| WebSocket upgrade | Enabled |
| Health check path | `GET /healthz` |
| Health check interval | 10 seconds |
| Session persistence | Source IP (for WS stickiness) |
| SSL Certificate | ACM-issued DV certificate |

Create three listener rules routing by domain:

- `api.xxx.com` -> ECS instances running api-server
- `admin.xxx.com` -> ECS instance running frontend
- `h5.xxx.com` -> (Phase 5) ECS instance running h5-app

## Routine Operations

### Deploy a New Version

```bash
# Via CI/CD (push to main branch triggers automatically)
# Or manually:
TAG=<git-sha> ./scripts/deploy.sh
```

### Skip Migration

```bash
SKIP_MIGRATION=1 TAG=<tag> ./scripts/deploy.sh
```

### Database Backup

```bash
# Manual backup
./scripts/backup.sh

# With OSS upload
UPLOAD_TO_OSS=1 OSS_BUCKET=my-bucket ./scripts/backup.sh

# Cron (daily at 2 AM)
# 0 2 * * * /opt/openclaw/deploy/aliyun/scripts/backup.sh >> /var/log/mc-backup.log 2>&1
```

### View Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs --tail=100 -f

# Specific service
docker compose -f docker-compose.prod.yml logs api-server --tail=50

# Nginx access logs
docker compose -f docker-compose.prod.yml exec nginx cat /var/log/nginx/access.log
```

### Scale Services

```bash
# Scale API servers
docker compose -f docker-compose.prod.yml up -d --scale api-server=3

# Scale RQ workers
docker compose -f docker-compose.prod.yml up -d --scale rq-worker=4
```

## File Structure

```text
deploy/
  Dockerfile.backend.prod       # Production backend image
  Dockerfile.frontend.prod      # Production frontend image
  aliyun/
    docker-compose.prod.yml     # Production compose (no DB/Redis)
    nginx/
      api.conf                  # API + WebSocket reverse proxy
      admin.conf                # Admin frontend proxy
      h5.conf                   # H5 app proxy (Phase 5)
    scripts/
      deploy.sh                 # Deployment automation
      init-rds.sh               # Initial RDS setup
      backup.sh                 # Database backup
    env/
      .env.production.example   # Environment template
    README.md                   # This file
.github/
  workflows/
    deploy-aliyun.yml           # CI/CD deploy pipeline
```
