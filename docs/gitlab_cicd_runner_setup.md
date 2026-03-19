# GitLab CI/CD Runner 部署说明（main tag 自动发布）

本文档对应仓库 [`.gitlab-ci.yml`](/Volumes/data/workspace/python/CaseSystem/.gitlab-ci.yml) 的部署策略。

当前流程分两条线：

- `dev` 分支 push：在测试机本地拉代码并重启容器
- 受保护 tag：在生产机本地拉代码，使用 GitLab CI/CD 变量渲染 `.env.docker`，自动生成证书并部署

## 1. Runner 规划

1. 测试机 `192.168.2.90`
- 安装 GitLab Runner（shell executor）
- 注册标签：`test-deploy`
- 设置为 Protected Runner

2. 生产机 `10.20.100.42`
- 安装 GitLab Runner（shell executor）
- 注册标签：`prod-deploy`
- 设置为 Protected Runner

3. 两台 Runner 用户要求
- 具备 Docker 命令执行权限（root 或 docker group）
- 能访问仓库 SSH 地址：`ssh://git@gitlab.keeploving.xyz:20022/soc/casesystem.git`
- 具备 `git`、`python3`、`openssl`、`curl`、`rsync`、`ssh`

## 2. GitLab 项目配置

1. 保护策略
- 保护分支：`main`、`dev`
- 保护 tag：建议使用 `v*`
- 生产部署只允许受保护 tag 触发

2. 生产变量分组

| 变量 | 用途 | 建议属性 | 是否必填 |
| --- | --- | --- | --- |
| `POSTGRES_PASSWORD` | PostgreSQL 数据库密码 | Protected + Masked | 必填 |
| `CASESYSTEM_JWT_SECRET_KEY` | JWT 签名密钥 | Protected + Masked | 必填 |
| `CASESYSTEM_SMTP_PASSWORD` | SMTP 密码 | Protected + Masked | 必填 |
| `POSTGRES_USER` | PostgreSQL 用户名 | Protected | 必填 |
| `POSTGRES_DB` | PostgreSQL 数据库名 | Protected | 必填 |
| `PUBLIC_HOST` | 生产对外访问域名或 IP | Protected | 必填 |
| `HTTPS_PORT` | 生产 HTTPS 端口 | Protected | 建议固定为 `443` |
| `CASESYSTEM_SMTP_HOST` | SMTP 服务器地址 | Protected | 必填 |
| `CASESYSTEM_SMTP_PORT` | SMTP 端口 | Protected | 必填 |
| `CASESYSTEM_SMTP_USERNAME` | SMTP 用户名 | Protected | 必填 |
| `CASESYSTEM_SMTP_FROM_EMAIL` | 发件人地址 | Protected | 必填 |
| `CASESYSTEM_SMTP_USE_SSL` | SMTP SSL 开关 | Protected | 必填 |
| `CASESYSTEM_SMTP_STARTTLS` | SMTP STARTTLS 开关 | Protected | 必填 |

3. 生产变量说明
- `CASESYSTEM_ALLOWED_ORIGINS` 通常不需要单独配置，CI 会优先根据 `PUBLIC_HOST` 和 `HTTPS_PORT` 生成
- 如果确实需要多入口访问，可以手工定义 `CASESYSTEM_ALLOWED_ORIGINS`，CI 会优先使用该变量
- `CASESYSTEM_DATABASE_URL` 不建议作为 GitLab 变量维护，CI 会由 `POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB` 自动组合生成

4. 通知
- 在 GitLab 项目或个人通知中开启 Pipeline 成功/失败通知

## 3. 行为说明

1. `deploy_test_dev`
- 触发条件：push 到 `dev`
- 目录不存在 `.git` 时会自动 `git init` 并绑定 origin
- 会保留现有 `ENV_FILE` 内容
- 执行 `docker compose up -d postgres redis`
- 执行 `docker compose up -d --force-recreate api worker beat`
- 健康检查仍然是 HTTP 入口

2. `deploy_prod_tag`
- 触发条件：受保护 tag pipeline
- 先校验 `CI_COMMIT_SHA` 必须是 `origin/main` 的祖先提交
- 生产 `.env.docker` 由 GitLab CI/CD 变量渲染，不再依赖 runner 上的手工 env 文件
- 生产证书在部署时自动生成，SAN 覆盖 `PUBLIC_HOST`、`localhost`、`127.0.0.1`
- 执行 `docker compose --env-file .env.docker build`
- 执行 `docker compose --env-file .env.docker up -d postgres redis`
- 执行 `docker compose --env-file .env.docker --profile init run --rm bootstrap`
- 执行 `docker compose --env-file .env.docker up -d api worker beat nginx`
- 健康检查改为 `https://127.0.0.1:${HTTPS_PORT}`，不再使用 `http://...:8010`

## 4. 变量变更规则

1. 以下变量不要随意修改
- `POSTGRES_PASSWORD`
- `CASESYSTEM_JWT_SECRET_KEY`
- `CASESYSTEM_SMTP_PASSWORD`

2. 这些变量变化会触发状态变更
- `POSTGRES_USER`
- `POSTGRES_DB`
- `CASESYSTEM_SMTP_HOST`
- `CASESYSTEM_SMTP_PORT`
- `CASESYSTEM_SMTP_USERNAME`
- `CASESYSTEM_SMTP_FROM_EMAIL`
- `CASESYSTEM_SMTP_USE_SSL`
- `CASESYSTEM_SMTP_STARTTLS`
- `PUBLIC_HOST`
- `HTTPS_PORT`

3. 变更影响
- 修改数据库密码会导致现有 PostgreSQL 数据卷认证失败，除非同步完成数据库密码轮换
- 修改 JWT 密钥会让现有登录态和刷新令牌全部失效
- 修改 SMTP 密码会影响邮件发送

## 5. 验收建议

1. 从 `main` 打一个受保护 tag，确认生产机自动部署成功。
2. 从非 `main` 祖先提交打 tag，确认生产发布被阻断。
3. 删除或修改一个必填 GitLab 变量，确认生产 job 在渲染 `.env.docker` 前直接失败。
4. 确认生产机 `https://127.0.0.1:443/healthz`、`/login`、`/auth/csrf`、`/socket.io` 正常。
