# Docker 部署

当前推荐部署方式改为 `Docker Compose`，运行以下服务：

- `nginx`：HTTPS 入口（443）+ 反向代理（TLS 终止）
- `api`：FastAPI + 前端静态资源（仅容器内暴露 8010）
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
- `CASESYSTEM_ALLOWED_ORIGINS`（必须包含实际 HTTPS 访问入口）
- SMTP 相关配置

3. 生成自签证书（首次）：

```bash
./scripts/gen_self_signed_cert.sh --cn localhost --dns localhost --ip 127.0.0.1
```

如需按实际 IP/域名访问，追加 SAN：

```bash
./scripts/gen_self_signed_cert.sh --cn 192.168.2.90 --ip 192.168.2.90 --dns localhost --ip 127.0.0.1
```

4. 启动基础服务：

```bash
docker compose --env-file .env.docker up -d postgres redis
```

5. 初始化数据库、按需从现有 `casesystem.db` 迁移数据并补种子数据：

```bash
docker compose --env-file .env.docker --profile init run --rm bootstrap
```

说明：

- `bootstrap` 会先创建 PostgreSQL schema
- 如果仓库根目录存在旧版 `casesystem.db`，会自动尝试迁移到 PostgreSQL
- 迁移完成后会执行 `seed_roles` 和 `seed_reporting`

6. 启动业务服务：

```bash
docker compose --env-file .env.docker up -d api worker beat nginx
```

7. 验证 HTTPS 入口：

```bash
curl -k https://127.0.0.1:${HTTPS_PORT:-443}/healthz
```

`-k` 用于跳过自签证书校验，仅建议在内网预览环境使用。

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

查看 Nginx 日志：

```bash
docker compose --env-file .env.docker logs -f nginx
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

## 部署说明（HTTPS）

- 对外入口为 `https://<host>:${HTTPS_PORT}`（默认 `443`）。
- 前端、`/api`、`/auth`、`/socket.io` 全部由 Nginx 反代到 `api:8010`。
- `CASESYSTEM_COOKIE_SECURE=true` 必须开启，确保认证 Cookie 以 Secure 下发。
- 自签证书会触发浏览器不受信任提示，适用于内部测试/验收。
