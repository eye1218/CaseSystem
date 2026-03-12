# 开发问题记录

## 2026-03-09 身份与权限模块

1. 仓库初始状态没有 `.git`，但本次任务要求最终提交 commit。
2. 虚拟环境创建与依赖安装最初并行执行，导致 `.venv/bin/python` 在创建完成前被调用。
3. 默认 `pip` 版本较旧，最初对 `pyproject.toml` 的 editable 安装支持不足。
4. Python 3.9 下，Pydantic 2 对 `|` 联合类型的解析需要额外兼容依赖。
5. Python 3.9 下，SQLAlchemy ORM 对 `Mapped[str | None]` 这类注解解析失败。
6. SQLite 回读时间与服务端 UTC aware 时间比较时触发 naive/aware datetime 冲突。
7. 为兼容 SQLite 改成 naive 时间后，JWT 时间戳一度按本地时区计算，导致 access token 登录后立即过期。
8. Refresh token reuse 检测触发后，token 状态一度被会话撤销逻辑覆盖为 `revoked`，未保留 `reused_detected` 风险标记。

## 2026-03-09 工单页面原型

1. 当前仓库只有 FastAPI 后端 MVP，没有现成的前端工程、模板层或设计系统实现。
2. 为了先把工单页面设计落地，本次采用“FastAPI 挂载静态多页面原型”的方式承接工单列表、详情、创建、工单池和回收站页面。
3. 当前机器上的系统 Python 受 PEP 668 externally managed environment 限制，无法直接用系统解释器安装依赖或运行依赖不完整的测试流程。
4. 知识库抽屉最初采用固定覆盖层实现，打开后会拦截顶栏和详情页右侧的点击，和“抽屉打开后原页面仍可继续操作”的要求不一致。

## 2026-03-09 远端部署

1. 目标主机 `192.168.2.170` 使用默认本地用户名连接会认证失败，实际可用入口是 `root@192.168.2.170` 搭配现有 SSH key。
2. 目标主机的 `80/443` 已被现有 `docker-proxy` 占用，本次无法直接复用标准 HTTP/HTTPS 端口做预览发布。
3. 预览部署脚本首次加入远端 `/healthz` 校验后，发现 `systemd` 重启刚返回时 `uvicorn` 仍可能未完成端口监听，导致立即探测出现 `ConnectionRefusedError`。

## 2026-03-10 前后端分离目录重构

1. 目录迁移完成后，系统环境里的 `pytest` 因缺少 `httpx`，会在导入 `fastapi.testclient` 时直接失败。
2. 原型静态页面虽然已迁到 `frontend/legacy-static`，但内部仍保留旧 `/ui/*` 与 `/ui-assets/*` 路径，尚未迁移为真正的前端路由和资源引用。

## 2026-03-10 Figma Make 前端联调与预览部署

1. `CaseSystem` 在 Figma 中是 Make 项目，不是普通 Design 文件；常规的节点元数据和截图接口无法直接使用。
2. 真实浏览器联调时发现，HTTP 预览环境下继续使用 `__Host-access_token` / `__Secure-refresh_token` 会导致浏览器拒收 cookie。
3. 后端最初只种角色和工单，不种默认用户，导致本地与远端预览环境虽然服务可启动，但登录接口始终返回 `401`。
4. 预览部署脚本首次执行时，本地 `npm` 读取到了带 root 权限残留的 `~/.npm` 缓存文件，导致前端构建阶段报 `EACCES`。
5. 远端部署脚本首次加入登录态校验时，在 SSH 子进程里误用了未传入的 `REMOTE_HOST` 变量，导致服务已启动但校验脚本提前中断。

## 2026-03-10 工单详情页与建单联调

1. 本地第一次用浏览器联调时，服务启动在 `127.0.0.1:8011`，但该端口不在后端 `allowed_origins` 白名单内，导致 `/auth/login` 被 CSRF 校验直接拦成 `403`。
2. 工单时间字段从后端返回时不带时区，浏览器按本地时间解释后，列表时间和详情页 SLA 倒计时一度整体偏移 8 小时。
3. 知识库抽屉虽然能正常打开，但初版层级不够，真实鼠标点击关闭按钮时会被主内容区拦截，表现为“看起来可点但关不上”。

## 2026-03-10 工单列表表头字体不一致

1. 工单列表表头里，可排序列使用 `button`，普通列使用 `span`；虽然 JSX 上复用了同一组 Tailwind 类，但线上按钮列仍然显示成浏览器默认的 `16px` 粗体。
2. 根因是全局 `button, input, select { font: inherit; }` 写成了未分层规则，在 Tailwind v4 下压过了工具类，导致 `text-[11px]`、`font-semibold`、`leading-none` 对按钮不生效。

## 2026-03-11 报告模块工作树环境

1. 从独立 `git worktree` 切出来的工作目录默认不会继承主工作区的 Python 开发依赖与 `frontend/node_modules`，直接运行 `pytest` 会因为缺少 `httpx` 导入 `fastapi.testclient` 失败，直接运行 `npm run build` 会因为缺少 `vite` 报 `command not found`。

## 2026-03-11 报告模块前端类型校验

1. 前端最初只有 `vite build`，没有单独跑过 `tsc --noEmit`；补跑类型检查后暴露出仓库缺少 `frontend/src/vite-env.d.ts`，导致 `.svg` 资源导入在 TypeScript 下统一报模块声明缺失。

## 2026-03-12 报告模块预览部署

1. 预览机 `root@192.168.2.170:/root/workspace/CaseSystem` 上仍残留旧目录结构；执行 `rsync --delete` 时会对 `tests`、`casesystem`、`backend/app/modules/*` 等路径打印 `cannot delete non-empty directory` 警告，虽然本次未阻断部署，但说明远端工作目录并非干净镜像。

## 2026-03-12 知识库模块实现

1. 本地第一次对知识库页面做浏览器 smoke test 时，服务起在 `127.0.0.1:8011`，但该端口不在后端 `allowed_origins` 白名单内，导致登录请求被 CSRF 校验直接拦成 `403`。
2. 前端错误处理最初没有正确透传后端 JSON `detail`，导致知识库详情 `404` 等业务错误会退化成通用 `Request failed`，不利于页面按设计显示精确文案。
