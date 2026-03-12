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

## 2026-03-11 后端结构抽取（core/infra）

1. 当前 worktree 没有独立 `.venv`，直接执行 `.venv/bin/python` 会报 `no such file or directory`，需要显式使用主仓库虚拟环境路径。
2. 基于当前项目配置，basedpyright 会对 `app.*` 导入和历史类型问题报大量严格诊断，LSP 结果噪音较高，和运行时测试通过状态不一致。

## 2026-03-11 Celery 脚手架接入

1. 新增 Celery 依赖与 worker 脚手架后，basedpyright 在当前环境仍持续报 `reportMissingImports`（如 `celery`），但同一环境下运行时导入校验可通过，导致“静态诊断报错与运行时正常”并存。

## 2026-03-11 Auth domain modular migration

1. During app/auth.py extraction to backend/app/modules/auth/service.py, basedpyright reported many Optional-member errors in existing auth flows because helper _raise_login_failed was typed as returning None instead of non-returning.
2. Issue was resolved by changing _raise_login_failed to NoReturn and adding explicit narrowing/casts at guarded access points; runtime auth regression tests remained green afterward.

## 2026-03-11 Event contracts and migration verification

1. `alembic upgrade head` 首次直接跑在 worktree 默认 SQLite (`casesystem.db`) 时失败：数据库里已有基线表但未写入 alembic 版本，触发 `table ... already exists`。
2. 事件模型初版使用 `Mapped[datetime | None]` 与迁移注解 `str | Sequence[str] | None`，在 Python 3.9 环境下触发运行时类型解析错误；已回退为 `Optional[...]` 和 `Union[...]`。

## 2026-03-11 Ticket domain modularization

1. 模块拆分过程中，`backend/app/modules/tickets/__init__.py` 初版导入 `ticket_router`，导致 `from app.main import create_app` 时触发循环导入（`app.auth` 部分初始化）。
2. 已通过移除 `tickets/__init__.py` 中的路由导入并在 `main.py` 直接引用 `app.modules.tickets.routes` 解决，路由与测试验证恢复通过。

## 2026-03-11 Event sweep task integration

1. 本次工作开始时，计划里要求的 `backend/app/worker/celery_app.py`、`backend/app/worker/includes.py`、`backend/app/worker/task_base.py` 在当前分支不存在，导致 Event sweep 任务无法挂载到 Celery 运行时。
2. 已通过补齐 `app.worker` 基础脚手架并在 `celery_app.conf.beat_schedule` 注册 `events.sweep_due_events` 解决。

## 2026-03-11 Backend test runner environment

1. 直接运行系统环境下的 `pytest backend/tests` 时，测试加载失败并报 `starlette.testclient` 缺少 `httpx` 依赖，说明当前 shell 默认 Python 环境和项目依赖环境不一致。
2. 已切换为仓库内 `.venv` 执行 `PYTHONPATH=backend .venv/bin/pytest backend/tests -q`，测试恢复正常。

## 2026-03-11 长连接模块补充开发

1. 在 `zsh` 下执行 `.venv/bin/pip install -e .[dev]` 会先被 shell 当成 glob 展开，命令在进入 pip 之前就失败。
2. 已通过改用 `.venv/bin/pip install -e '.[dev]'` 解决，后续安装 extras 需要保持这个写法。
3. 本次首次跑长连接相关回归时，`backend/app/modules/events/tasks.py` 导入 `celery`，但 `pyproject.toml` 未声明该依赖，导致 pytest 在收集阶段就报 `ModuleNotFoundError: No module named 'celery'`。
4. 已通过把 `celery` 补进正式依赖并重新安装 `.venv` 解决，当前后端测试可完整执行。
5. 当前项目默认使用 `create_all()` 初始化数据库；在已有 SQLite 开发库上新增 `tickets.version` 这类列时，历史表结构不会自动补齐。
6. 已在启动期增加轻量 schema sync 兜底，避免老库在引入长连接模块后因为缺列而无法运行。
7. 运行时导入校验阶段，直接执行 `.venv/bin/python` 仍会落到 Python 3.9 路径，而依赖实际安装在 `.venv/lib/python3.14/site-packages`。
8. 已改用与 shebang 一致的 `.venv/bin/python3.14` 做导入验证；`pytest`、`uvicorn` 等入口脚本当前也都指向 3.14。

## 2026-03-11 工单实时局部刷新与缓存

1. 新增 ticket 缓存测试时，初版断言把 `admin` 登录后的默认活动角色误认为 `ADMIN`，但当前种子数据下该用户默认活动角色实际是 `T2`。
2. 已通过按实际活动角色修正断言解决；如果后续要测试 `ADMIN` 专属能力，需要显式执行 role switch。

## 2026-03-11 配置中心模板渲染页面

1. `docs/功能模块/模版模块.md` 里对 Webhook `method` 的完整枚举范围尚未最终锁定，当前前端页面先按常见 HTTP 方法 `GET/POST/PUT/PATCH/DELETE` 实现下拉枚举。
2. `headers` 的最终编辑形态在文档中也未完全定稿；当前页面按文档推荐方案先落为“结构化键值对”编辑器，并默认只把 value 作为模板变量承载位。

## 2026-03-11 模板渲染后端接口

1. 当前运行环境最初缺少 `jinja2`，导致模板渲染服务无法直接导入；已通过把 `Jinja2` 补进 `pyproject.toml` 正式依赖并重新安装 `.venv` 解决。
2. 模块文档里对“模板编码是否必须唯一”尚未最终定稿；当前后端实现采用“可为空，但如果填写则必须唯一”的约束，便于按 `template_code` 调用渲染接口。
3. 模块文档里对“预览上下文来源如何确定”尚未最终定稿；当前后端 `preview` / `render` 接口统一要求调用方显式传入 `context`，避免把工单查询逻辑硬编码进模板模块。

## 2026-03-11 Figma CaseSystem 项目读取

1. 当前接入的 Figma MCP 远程服务不能直接枚举账号下全部项目或文件，只能基于已知 `fileKey` / `node-id` 或 Make 链接读取内容。
2. `CaseSystem` 已知是 Figma Make 项目时，如果没有明确的 Make 链接或文件标识，无法直接读取配置中心等页面的设计上下文。
3. 直接用浏览器打开公开的 Figma Make 预览链接时，如果当前会话未登录 Figma，页面只会停在 Figma 外壳和注册提示，无法看到真实业务页面，需要优先依赖 MCP 源码资源读取。

## 2026-03-11 预览环境再次部署

1. 本次执行 `scripts/deploy_preview.sh` 时，`rsync --delete` 仍输出 `cannot delete non-empty directory: casesystem`，说明远端目标目录下存在额外嵌套目录或残留内容，虽然本次未阻塞部署完成，但后续仍需确认远端目录结构是否持续漂移。

## 2026-03-11 远端配置中心验收排查

1. 本次排查中，远端源码和前端打包产物都已更新，但 `admin` 账号登录后默认活动角色仍是 `T2`，会导致配置中心菜单默认不可见，容易被误判成“部署未生效”。

## 2026-03-11 配置中心模板详情页前端接入

1. 配置中心模板表单初版接真实后端时，统一 `apiFetch` 只抛纯文本 `Error`，导致后端返回的字段级校验信息在前端丢失，页面只能显示笼统“保存失败”。
2. 模板编辑阶段还遇到 `PATCH` 请求携带 CSRF token 但未显式带 `Origin` 时被后端拒绝的问题，表现为读取和新建正常、更新失败，容易误判成接口实现不一致。
3. 本次继续对齐 Figma 时，尝试对 Make 文件使用 `get_metadata` 和 `get_screenshot` 都失败，因为这两类工具当前不支持 Make 文件，导致常规“按节点取截图/结构”的设计还原流程不可用。

## 2026-03-12 知识库模块接回主工作区

1. 当前主工作区的 `/knowledge` 实际仍然指向占位页；此前完成的知识库实现只存在于另一个工作树，未同步回本仓库。
2. 新增 `backend/app/modules/knowledge` 时，`__init__.py` 最初导出了 `knowledge_router`，导致运行时触发循环依赖：`app.models -> knowledge package -> routes -> auth -> app.models`。
3. 本地浏览器 smoke test 还暴露出当前 `.venv` 环境缺少 `python-socketio` 运行时依赖；虽然 `pyproject.toml` 已声明该包，但现有虚拟环境里 `import socketio` 仍会失败，导致 `uvicorn app.main:app` 无法直接启动。
