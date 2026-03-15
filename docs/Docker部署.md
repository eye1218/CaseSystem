# Docker 部署

当前推荐部署方式改为 `Docker Compose`，运行以下服务：

- `api`：FastAPI + 前端静态资源
- `worker`：Celery worker
- `beat`：Celery beat
- `redis`：Celery broker/result backend + 工单查询缓存
- `postgres`：主数据库

## 首次使用

1. 基于示例生成环境变量文件：

```bash
cp .env.docker.example .env.docker
```

2. 根据实际环境修改：

- `POSTGRES_PASSWORD`
- `CASESYSTEM_JWT_SECRET_KEY`
- SMTP 相关配置

3. 启动基础服务：

```bash
docker compose --env-file .env.docker up -d postgres redis
```

4. 初始化数据库、按需从现有 `casesystem.db` 迁移数据并补种子数据：

```bash
docker compose --env-file .env.docker --profile init run --rm bootstrap
```

说明：

- `bootstrap` 会先创建 PostgreSQL schema
- 如果仓库根目录存在旧版 `casesystem.db`，会自动尝试迁移到 PostgreSQL
- 迁移完成后会执行 `seed_roles` 和 `seed_reporting`

5. 启动业务服务：

```bash
docker compose --env-file .env.docker up -d api worker beat
```

## Redis 用途

- `redis://redis:6379/0`：Celery broker
- `redis://redis:6379/1`：Celery result backend
- `redis://redis:6379/2`：Realtime 预留
- `redis://redis:6379/3`：工单查询缓存

工单查询缓存优先读取 `CASESYSTEM_TICKET_CACHE_REDIS_URL`，若未提供则回退到 `CASESYSTEM_REALTIME_REDIS_URL`。

## 常用命令

查看状态：

```bash
docker compose --env-file .env.docker ps
```

查看 API 日志：

```bash
docker compose --env-file .env.docker logs -f api
```

查看 Worker 日志：

```bash
docker compose --env-file .env.docker logs -f worker
```

查看 Beat 日志：

```bash
docker compose --env-file .env.docker logs -f beat
```

停止服务：

```bash
docker compose --env-file .env.docker down
```

保留数据卷停止服务：

```bash
docker compose --env-file .env.docker down
```

清理数据卷并重置：

```bash
docker compose --env-file .env.docker down -v
```
