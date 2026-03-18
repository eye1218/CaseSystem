# GitLab CI/CD Runner 部署说明（无 SSH）

本文档对应仓库 `.gitlab-ci.yml` 的部署策略：

- `dev` 分支：在测试机本地拉代码并重启容器（不构建镜像）
- `tag`：在生产机本地拉代码、构建镜像并部署
- 不通过 CI 到目标机 SSH 执行

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

## 2. 机器侧 Git 准备

1. 在两台机器上配置仓库 Deploy Key（只读即可）
2. 配置 `~/.ssh/known_hosts`，避免首次拉取交互
3. 验证：

```bash
ssh -T -p 20022 git@gitlab.keeploving.xyz
```

## 3. GitLab 项目配置

1. 保护策略
- 保护分支：`main`、`dev`
- 保护 tag：建议 `v*`
- 仅允许 Protected Runner 执行保护引用流水线

2. CI/CD 变量（非敏感即可）
- `REPO_SSH_URL`（默认已在 `.gitlab-ci.yml`）
- `TEST_DIR`（默认 `/home/gitlab-runner/workspace/CaseSystem`）
- `PROD_DIR`（默认 `/opt/casesystem`）
- `ENV_FILE`（默认 `.env.docker`）
- `APP_PORT`（默认 `8010`）

3. 通知
- 在 GitLab 项目或个人通知中开启 Pipeline 成功/失败邮件

## 4. 行为说明

1. `deploy_test_dev`
- 触发条件：push 到 `dev`
- 目录不存在 `.git` 时会自动 `git init` 并绑定 origin
- 会保留现有 `ENV_FILE` 内容
- 若 `ENV_FILE` 不存在会直接失败（避免使用错误默认配置）
- 执行 `docker compose up -d --force-recreate api worker beat`
- 不执行 `docker compose build`
- 健康检查带重试（20 次）

2. `deploy_prod_tag`
- 触发条件：tag pipeline
- 会校验 `CI_COMMIT_SHA` 必须是 `origin/main` 祖先提交
- 执行 `docker compose build` + `up -d`
- 执行 `bootstrap` 初始化任务
- 若 `ENV_FILE` 不存在会直接失败
- 健康检查带重试（20 次）

## 5. 验收建议

1. `dev` push 一次，确认测试机容器重启且健康检查 200。
2. 从 `main` 打 tag，确认生产机构建并部署成功。
3. 从非 `main` 提交打 tag，确认生产发布被阻断。
