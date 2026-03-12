# 开发注意事项

## 2026-03-09 身份与权限模块

1. 当前开发环境是 Python 3.9。若代码使用 `str | None` 这类新式联合类型：
   - Pydantic 2 需要安装 `eval-type-backport`
   - SQLAlchemy ORM 的 `Mapped[...]` 建议直接使用 `Optional[...]`，避免类型解析失败
2. SQLite 在本项目里回读 `DateTime(timezone=True)` 时可能仍然得到无时区时间。
   - 数据库存储与比较统一使用 UTC naive 时间
   - JWT 的 `iat` / `nbf` / `exp` 生成必须使用真正的 UTC aware 时间，否则 `.timestamp()` 会按本地时区解释，导致 token 立即过期
3. 在 zsh 下执行带版本范围的 `pip install` 命令时，包规格需要整体加引号，例如：
   - `pip install 'eval-type-backport>=0.2.0,<1.0.0'`
4. 新建虚拟环境后，先确认 `.venv` 已创建完成，再继续调用其中的 Python 或 pip。
5. 如果仓库一开始不是 Git 仓库，而任务要求提交 commit，需要先执行 `git init` 再提交。

## 2026-03-09 工单页面原型

1. 当前环境运行 Python 依赖与测试时，优先使用项目内 `.venv`：
   - 系统 Python 受 PEP 668 externally managed environment 限制
   - 安装依赖建议使用 `.venv/bin/python -m pip install -e '.[dev]'`
   - 运行测试建议使用 `.venv/bin/pytest`
2. 详情页的知识库预览抽屉如果直接固定在页面最上层，容易挡住顶栏按钮并误伤“原页面仍可点击”的交互要求。
   - 抽屉应放在顶栏下方
   - 打开时给详情内容区预留右侧空间，而不是继续覆盖可见主区域
   - 非模态不等于任意覆盖，最好显式保留可点击的原页面区域
3. 远端预览部署时，优先检查目标机上 `80/443` 是否已被现有服务占用。
   - 如果已有反向代理或容器占用对外端口，预览服务应先落到独立端口，例如 `8010`
   - 当前项目可直接用 `systemd + uvicorn` 部署，无需额外容器化
4. 预览发布流程已经固化为统一脚本：
   - 本地执行 `./scripts/deploy_preview.sh`
   - 脚本负责测试、`rsync`、远端 `.venv` 依赖安装、`systemd` 服务写入与重启
   - 后续预览更新优先复用该脚本，不再手工逐步执行部署命令
5. `systemd restart` 成功不代表 `uvicorn` 已经完成端口监听。
   - 远端部署脚本里的 `/healthz` 校验必须带重试
   - 否则服务刚重启时会因为连接过早而误判部署失败

## 2026-03-10 前后端分离目录重构

1. 仓库目录已切换为前后端分离式组织：
   - 后端代码位于 `backend/app`
   - 后端测试位于 `backend/tests`
   - 原静态页面原型迁移到 `frontend/legacy-static`
2. 当前后端启动入口和测试入口已经变更：
   - 本地启动使用 `uvicorn app.main:app --app-dir backend --reload`
   - 本地测试使用 `.venv/bin/pytest backend/tests -q`
3. 如果系统 Python 缺少开发依赖，优先不要直接用系统 `pytest` 验证。
   - `fastapi.testclient` 依赖 `httpx`
   - 当前仓库应统一通过项目内 `.venv` 执行测试

## 2026-03-10 Figma Make 前端联调与预览部署

1. Figma Make 文件和普通 Design 文件不同：
   - `get_metadata` / `get_screenshot` 不适用于 Make 文件
   - 应优先通过 `get_design_context` 读取 Make 项目的源码资源，再结合预览页做视觉校对
   - 远程 Figma MCP 在读取 Make 项目时，可以直接对 `makeFileKey` 调用 `get_design_context`
   - 当前实践里传入占位节点 `nodeId="0:0"` 即可拿到整份 Make 的源码资源列表，再按 `src/app/pages/*`、`src/styles/*` 精确读取
2. HTTP 预览环境下不要继续使用 `__Host-` / `__Secure-` 前缀 cookie 名。
   - 这两个前缀要求浏览器必须同时满足 `Secure`
   - 当 `cookie_secure=false` 且页面走 `http://` 时，浏览器会直接拒收 cookie，导致登录成功后后续接口仍然是未认证状态
   - 解决方式是按环境切换 cookie 名：安全环境继续使用严格前缀，预览环境改用普通 cookie 名
3. 预览环境如果需要直接给前端登录演示，启动种子数据里必须包含默认演示账号。
   - 当前已在 `bootstrap` 中补齐 `admin`、`analyst`、`customer`
   - 否则测试环境能登录，不代表真实预览环境也能登录
4. 本地 `npm` 缓存目录如果残留 root-owned 文件，`npm ci` 会直接报权限错误。
   - 部署脚本里应显式指定仓库内缓存目录，例如 `.npm-cache`
   - 这样可以避免依赖用户主目录下不可控的历史缓存状态
5. 预览部署时如果 `rsync --delete` 输出 `cannot delete non-empty directory: casesystem`，不一定表示本次部署失败。
   - 当前实践里该提示未阻断后续依赖安装、`systemd` 重启和健康检查
   - 应以脚本末尾的远端 `/healthz`、登录页和业务接口校验结果作为最终判定

## 2026-03-10 工单详情页与建单联调

1. 当前后端通过 SQLite 返回的工单时间字段仍然是 UTC naive 字符串。
   - 前端展示和倒计时计算时必须先按 UTC 解释，再转成本地时间
   - 否则列表时间会少 8 小时，详情页 SLA 会被误判为已超时
2. 非模态知识抽屉除了“能打开”，还要验证“能被真实鼠标点击关闭”。
   - 仅靠 DOM 事件或程序触发关闭不够
   - 抽屉容器需要显式提升层级，例如 `relative z-20`
   - 关闭态最好同时加 `pointer-events-none`，避免隐藏抽屉继续吞事件
3. 本地浏览器联调如果后端跑在不在 `allowed_origins` 白名单内的端口，CSRF 会直接拒绝登录。
   - 当前默认白名单包含 `8010`、`5173` 等端口
   - 手工起本地预览服务时，优先复用这些端口，避免把登录失败误判成账号或 cookie 问题

## 2026-03-10 Tailwind v4 表头字体修复

1. Tailwind v4 下，未放进 `@layer` 的全局元素规则会压过工具类。
   - 当前的 `button, input, select { font: inherit; }` 如果直接写在样式文件顶层，会把按钮上的 `text-*`、`font-*`、`leading-*` 等工具类覆盖掉
   - 这类重置规则应放进 `@layer base`，让组件和工具类还能继续覆盖
2. 遇到“只有按钮文字大小不对，普通文本正常”的问题时，不要只看 JSX 类名。
   - 最快的定位方式是直接在浏览器里读取 `getComputedStyle`
   - 本次线上表头的 `button` 实际计算值是 `16px / 700 / 24px`，而普通表头 `span` 是 `11px / 600 / 11px`

## 2026-03-11 后端结构抽取（core/infra）

1. 在 Git worktree 中做后端验证时，优先复用主仓库虚拟环境并显式设置导入路径：
   - `PYTHONPATH=backend /Volumes/data/workspace/python/CaseSystem/.venv/bin/python -c "from app.main import create_app"`
   - `PYTHONPATH=backend /Volumes/data/workspace/python/CaseSystem/.venv/bin/pytest backend/tests -q`
2. 做分层迁移（如 `app/*` -> `app/core`、`app/infra`）时，可先保留薄兼容模块转发导入，降低一次性全量改 import 的风险，便于后续分波次演进。

## 2026-03-11 Alembic 基线迁移

1. 用 Alembic 做首个基线迁移时，如果直接对已有表的开发库执行 `revision --autogenerate`，容易得到空差异。
   - 更稳妥做法是临时指定一个干净数据库（例如 `CASESYSTEM_DATABASE_URL=sqlite:///./alembic_bootstrap.db`）生成初始迁移，再执行 `alembic upgrade head` 验证。
2. 当前仓库在 worktree 中执行 Alembic 时，需显式补 `PYTHONPATH=backend`，否则 `alembic/env.py` 无法导入 `app.*`。

## 2026-03-11 Celery 运行时脚手架

1. 在本仓库 worktree 中验证 Celery 导入时，优先用主仓库虚拟环境并显式设置导入路径：
   - `PYTHONPATH=backend /Volumes/data/workspace/python/CaseSystem/.venv/bin/python -c "from app.worker.celery_app import celery_app; print(celery_app.main)"`
2. Celery 运行时初始化应与 FastAPI `create_app()` 解耦：
   - `celery_app` 放在独立的 `backend/app/worker/celery_app.py`
   - 任务 include 和 beat schedule 通过独立模块集中管理，避免后续事件任务接入时改动应用启动流程

## 2026-03-11 Auth domain modular migration

1. Refactoring a large auth service into a new module package can expose hidden type-flow assumptions.
   - Mark guard helpers that always raise as NoReturn (e.g., _raise_login_failed) so static analysis correctly narrows Optional values.
   - Keep behavior stable by pairing runtime guards with narrow typing updates (assert/cast) rather than rewriting auth logic.
2. For phased modularization, keep compatibility shims at old import paths (app/auth.py, app/policies.py, app/schemas.py auth re-exports) while routing FastAPI endpoints from the new domain router; this reduces break risk for existing imports/tests.

## 2026-03-11 Event migration contract

1. 当前运行环境是 Python 3.9，Alembic 迁移脚本里的类型注解不要使用 `str | Sequence[str] | None`。
   - 迁移模块会在导入阶段执行，3.9 下会因 `|` 联合类型报 `TypeError`
   - 应保持 `Union[str, Sequence[str], None]` 写法，避免命令级别失败（如 `alembic heads`）

## 2026-03-11 Ticket domain modularization

1. 领域模块拆分时，`package/__init__.py` 应保持最小化，避免在其中提前导入路由对象。
   - 本次若在 `backend/app/modules/tickets/__init__.py` 导入 `ticket_router`，会在应用导入阶段触发 `auth -> models -> tickets -> routes -> auth` 循环依赖。
2. 对旧入口（如 `backend/app/ticketing.py`）保留兼容 re-export shim，可在不改调用方的前提下平滑迁移到 `backend/app/modules/tickets/*`。

## 2026-03-11 Event Celery sweep verification

1. 验证 Event sweep/dispatch 行为时，优先在单条命令里显式设置独立数据库环境，避免受本地持久库历史数据干扰：
   - `CASESYSTEM_DATABASE_URL="sqlite+pysqlite:///:memory:" PYTHONPATH=backend /Volumes/data/workspace/python/CaseSystem/.venv/bin/python -c "..."`
2. 这种方式可以在一个进程内完成 `init_db -> 构造事件/绑定 -> 运行 sweep -> 断言状态`，适合快速验证“due pending 触发”和“cancelled 跳过”两条路径。

## 2026-03-11 Backend test environment alignment

1. 在这个仓库里跑后端测试时，应优先使用仓库内 `.venv`，不要直接依赖系统 Python 环境：
   - `PYTHONPATH=backend .venv/bin/pytest backend/tests -q`
2. 如果直接调用系统环境里的 `pytest`，可能会命中缺失依赖（本次实际遇到 `starlette.testclient` 依赖 `httpx` 缺失），造成“代码问题”和“环境问题”混淆。

## 2026-03-11 长连接模块接入

1. 前端无法直接读取登录态 access token 时，Socket.IO 握手不要尝试复用 `httpOnly` cookie 里的 JWT。
   - 本次稳定做法是新增 `/auth/socket-token`，由已登录 HTTP 会话换取一个短期 socket token，再通过 `auth.token` 建立连接。
2. 当前仓库的数据库初始化仍以 `Base.metadata.create_all()` 为主。
   - 当给已有表补字段（例如 `tickets.version`）时，单靠 `create_all()` 不会修改历史 SQLite 表结构。
   - 如果暂时没有 Alembic 迁移，至少要在启动期补一层轻量 schema sync，避免老库启动后直接因为缺列报错。
3. 在 `zsh` 下安装本项目 extras 时，`.[dev]` 需要加引号。
   - 可直接使用 `.venv/bin/pip install -e '.[dev]'`
   - 否则 shell 会把方括号当成 glob，命令在进入 pip 前就失败。
4. 当前仓库的 `.venv` 存在混合解释器痕迹，命令入口要优先跟 shebang 对齐。
   - 本次 `pip`、`pytest`、`uvicorn` 都落在 `.venv/bin/python3.14`
   - 但直接运行 `.venv/bin/python` 会进入 3.9 路径，看不到刚装进 `python3.14/site-packages` 的依赖（例如 `socketio`）

## 2026-03-11 Ticket realtime cache implementation

1. 当前测试种子里的 `admin` 用户默认活动角色不是 `ADMIN`，而是其主角色 `T2`。
   - 如果测试要验证 `ADMIN` 权限，必须显式走 `/auth/switch-role`。
   - 如果只是验证“内部角色可见性”，断言应基于实际默认角色，避免把用户身份和活动角色混为一谈。
   - 这条规则同样影响页面验收；配置中心这类 `ADMIN` 菜单如果在登录后看不到，先检查右上角活动角色是否仍是 `T2`，不要先把问题归因到部署或前端资源未更新。

## 2026-03-11 模板渲染后端接口

1. 本项目当前不会因为已有 `FastAPI` 依赖就自动具备模板渲染能力。
   - `jinja2` 需要显式写入 `pyproject.toml` 正式依赖，否则运行模板模块或导入 `jinja2.sandbox` 会直接报 `ModuleNotFoundError`
   - 补依赖后要重新执行 `.venv/bin/pip install -e '.[dev]'`，只改 `pyproject.toml` 不会让现有虚拟环境自动可用

## 2026-03-11 配置中心模板详情页前端接入

1. FastAPI/Pydantic 校验失败在这个项目里经常返回结构化 `detail`，不能只把错误响应当成纯文本抛出。
   - 如果 `apiFetch` 只保留字符串 message，配置页这类表单将拿不到字段级错误，无法把后端 `field_errors` 或 `loc/msg` 正确映射回输入框
   - 稳定做法是让统一 `ApiError` 同时保留 `status` 和原始 `detail`，页面再按业务场景解析
2. 当前后端的 CSRF 校验对部分变更接口依赖 `Origin/Referer` 语义，前端 `PATCH` 不能只带 `X-CSRF-Token`。
   - 本次模板编辑接口如果缺少 `Origin`，会出现“创建成功、更新失败”的假象
   - 统一在变更请求里补 `Origin: window.location.origin` 后，配置中心的保存/状态切换流程恢复稳定
3. Figma Make 文件不能沿用普通设计稿的 `get_metadata` / `get_screenshot` 工作流。
   - 这两个 MCP 工具对 Make 文件会直接返回“不支持”，不能再继续按节点截图或元数据拆层
   - 当前可行做法是先对 `0:0` 调 `get_design_context(forceCode=true)`，再从返回的 resource links 里直接读取 `src/app/pages/*.tsx` 作为页面真值

## 2026-03-12 知识库模块接回主工作区

1. 如果功能最初是在独立 `git worktree` 内完成，回到主工作区时必须重新核对真实路由挂载关系，不能假设“实现过一次就已经在当前仓库里”。
   - 这次根因不是缓存，而是主工作区的 `frontend/src/app/routes.tsx` 仍然把 `/knowledge` 指向 `PlaceholderPage`
   - 最快的确认方式是直接 `rg 'path: \"knowledge\"|PlaceholderPage' frontend/src/app/routes.tsx`
2. 当前后端模块化结构里，凡是会被 `app.models` 导入以注册 ORM 表的子模块包，`__init__.py` 都应该保持最小化。
   - 如果在这里导入 `routes`，很容易触发 `app.models -> 模块包 -> routes -> auth -> app.models` 的循环依赖
   - 稳定做法是让 `__init__.py` 保持为空或只暴露轻量符号，路由对象只在应用装配处显式导入
3. 前端仓库仅靠 `vite build` 还不够，补跑 `npx tsc --noEmit` 能额外暴露真实空值收窄问题。
   - 本次知识库接线完成后，又顺手修掉了 `RealtimeContext`、`TicketListPage`、`TicketDetailPage` 里的若干 `possibly null/undefined` 类型问题
