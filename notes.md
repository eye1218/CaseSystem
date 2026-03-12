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

## 2026-03-11 报告模块工作树环境

1. 使用独立 `git worktree` 开发这个仓库时，需要把依赖准备动作视为工作树级别而不是仓库级别。
   - Python 侧如果直接跑系统 `pytest`，需要先补 `httpx`，否则 `fastapi.testclient` 无法导入
   - 前端侧进入新的工作树后需要在 `frontend/` 下重新执行一次 `npm install`，否则 `npm run build` 会因为找不到 `vite` 失败

## 2026-03-11 报告模块前端类型校验

1. 这个前端仓库默认只有 `vite build`，不会自动替代 TypeScript 的独立类型校验。
   - 在交付前最好额外执行一次 `npx tsc --noEmit`
   - 如果仓库里没有标准的 `frontend/src/vite-env.d.ts`，静态资源导入（例如 `.svg`）会在 `tsc` 阶段统一报模块声明缺失
   - 最小修复方式是补上 `/// <reference types="vite/client" />`

## 2026-03-12 报告模块预览部署

1. 当前预览机目录上存在历史残留文件树时，`rsync --delete` 不一定能把不再受版本控制的旧目录清干净。
   - 本次在远端看到 `tests`、`casesystem`、`backend/app/modules/*` 等路径出现 `cannot delete non-empty directory`
   - 如果后续需要彻底收敛远端目录结构，应该安排一次受控的远端清理，而不是假设普通增量发布会自动抹平历史目录

## 2026-03-12 知识库模块实现

1. 本地浏览器联调知识库页面时，后端端口如果不在 `allowed_origins` 白名单内，登录请求会被 CSRF 拦截。
   - 这次在 `127.0.0.1:8011` 上复现了 `403`
   - 当前默认白名单已覆盖 `127.0.0.1:8010`
   - 本地 smoke test 最好直接复用 `8010`，不要把端口问题误判成账号、cookie 或知识库接口错误
2. 前端 `apiFetch` 需要在抛错前先稳定解析 JSON 错误体，再把 `detail` 透传给 UI。
   - 如果把 `throw new Error(detail)` 放进解析 JSON 的 `try` 代码块里，会被自己的 `catch` 意外吞掉
   - 更稳妥的写法是先提取 `detail`，再在 `try/catch` 外统一抛出错误

## 2026-03-11 后端结构抽取（core/infra）

1. 在 Git worktree 中做后端验证时，优先复用主仓库虚拟环境并显式设置导入路径：
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
   - Mark guard helpers that always raise as NoReturn (e.g., `_raise_login_failed`) so static analysis correctly narrows Optional values.
   - Keep behavior stable by pairing runtime guards with narrow typing updates (`assert`/`cast`) rather than rewriting auth logic.
2. For phased modularization, keep compatibility shims at old import paths (`app/auth.py`, `app/policies.py`, `app/schemas.py` auth re-exports) while routing FastAPI endpoints from the new domain router; this reduces break risk for existing imports/tests.

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
   - 最快的确认方式是直接 `rg 'path: "knowledge"|PlaceholderPage' frontend/src/app/routes.tsx`
2. 当前后端模块化结构里，凡是会被 `app.models` 导入以注册 ORM 表的子模块包，`__init__.py` 都应该保持最小化。
   - 如果在这里导入 `routes`，很容易触发 `app.models -> 模块包 -> routes -> auth -> app.models` 的循环依赖
   - 稳定做法是让 `__init__.py` 保持为空或只暴露轻量符号，路由对象只在应用装配处显式导入
3. 前端仓库仅靠 `vite build` 还不够，补跑 `npx tsc --noEmit` 能额外暴露真实空值收窄问题。
   - 本次知识库接线完成后，又顺手修掉了 `RealtimeContext`、`TicketListPage`、`TicketDetailPage` 里的若干 `possibly null/undefined` 类型问题

## 2026-03-12 Event 模块规则层重构

1. 当业务文档要求的 Event 是“规则定义”而仓库现有实现是“运行态队列”时，不要直接复用同一张表承载两种语义。
   - 本次稳定做法是保留 `events / event_bindings` 作为内部调度队列，再新增 `event_rules / event_rule_bindings` 作为管理员可见的规则定义层
   - 这样 `/api/v1/events` 可以切到规则 CRUD，而 `sweep_due_events` 仍然继续消费内部队列，不会把调度运行态暴露成用户看到的 Event 列表
2. Figma Make 项目在拿不到 `node-id` 时，仍然可以通过 `file://figma/make/source/<fileKey>/src/app/pages/*.tsx` 直接读取页面源码，把它当成页面结构和视觉层级的真值。
   - 这次 Event 列表页、详情页、编辑页就是基于 Make 源码资源还原，而不是依赖普通设计稿的节点截图工作流
3. 自定义表单校验如果要给前端字段级错误提示，后端不要在首个错误就提前返回。
   - 本次 Event 规则创建接口需要同时返回 `task_template_ids` 和 `filters[0].operator` 的错误
   - 稳定做法是先聚合 filter/time_rule/task_template 等所有业务校验错误，再统一返回 `{ message, field_errors }`
4. 从 `git worktree` 直接执行发布脚本时，要先确认当前工作树下是否真的存在独立 `.venv`。
   - 之前 `scripts/deploy_preview.sh` 默认调用 `${ROOT_DIR}/.venv/bin/pytest`，在 worktree 场景下会因为本地没有 `.venv` 直接失败
   - 现在稳定做法是让脚本自动解析 git common dir：优先使用当前工作区 `.venv`，不存在时回退到主工作区共享 `.venv`；只有再找不到时才要求显式传 `LOCAL_PYTHON`
5. 浏览器端在 HTTP 预览环境里不能默认假设 `crypto.randomUUID()` 可用。
   - 这次 Event 新建页点击“添加优先级/工单分类/风险分数/创建时间”时直接崩溃，根因是当前预览站点跑在非 HTTPS 安全上下文，`crypto.randomUUID` 不存在
   - 稳定做法是统一走本地 `createClientId` 这类兜底 helper：优先用 `globalThis.crypto?.randomUUID()`，不可用时回退到时间戳 + 计数器 + 随机串
6. 预览部署脚本不能只假设“本地共享 `.venv` 已经和 `pyproject.toml` 同步”。
   - 这次标准部署脚本虽然已经能自动找到主工作区共享 `.venv`，但第一步测试仍然因为该环境缺少 `python-socketio` 而失败
   - 稳定做法是把 `pip install -e '.[dev]'` 也纳入标准部署流程，在本地测试前先同步一次虚拟环境，再进入测试和发布
7. 在 Python 3.9 运行时，不要把 `str | None` 这类 PEP 604 联合类型直接放进 `typing.cast(...)` 之类会实际求值的表达式里。
   - 这次 `tickets/service.py` 在 `type_cast(str | None, access.get(...))` 处触发了 `TypeError`
   - 兼容做法是改用 `Optional[str]`，只把 `|` 联合语法留在注解位置，而不是运行时会执行的表达式里

## 2026-03-12 远程 main 合并

1. 在带大量未提交改动的 worktree 上合并远程 `main` 时，先做本地 checkpoint commit 比直接硬 merge 更稳。
   - 这样即使冲突很多，也能保证当前实现有明确回退点，不会因为一次失败合并把工作区改脏到不可恢复
2. 同一个 git worktree 上不要并行执行两个会写 index 的 Git 命令。
   - 这次并行 `git checkout` 触发了 `.git/worktrees/.../index.lock` 竞争
   - 处理方式是改回串行执行，避免把正常的冲突解决误判成仓库损坏

## 2026-03-12 预览部署运行产物隔离

1. 预览部署脚本同步整个仓库时，需要显式排除本地运行产物目录，不要把开发机上的报告存储文件带到远端。
   - 这次实际工作树里存在未跟踪的 `backend/.runtime/`
   - 稳定做法是在 `rsync` 排除列表里同时忽略 `.runtime` 和 `backend/.runtime`

## 2026-03-13 任务模块实现

1. 这台机器上的命令可用性不能想当然依赖 `python` 和裸 `uvicorn`。
   - 当前环境没有可直接使用的 `python`
   - 本地后端启动与测试应优先使用 `python3`
   - 启动服务时优先使用 `python3 -m uvicorn app.main:app --app-dir backend`，不要假设 PATH 里已有 `uvicorn`
2. 在没有独立 worktree `.venv` 的情况下，如果需要把 `pyproject.toml` 里的新正式依赖装到当前用户环境，当前机器可用的入口是 `$HOME/Library/Python/3.9/bin/pip3`。
   - 这次为同步 `httpx` 等依赖，实际使用的是 `$HOME/Library/Python/3.9/bin/pip3 install -e '.[dev]'`
   - 直接假设 `pip` / `pip3` 在 PATH 上可写，风险较高
3. 使用 Figma HTML-to-Design 捕获本地 SPA 页面时，如果页面已经完成加载，再单纯补 `#figmacapture=...` hash，脚本不一定会真正发起提交。
   - 这次 `generate_figma_design` 的 `existingFile` 捕获一直停在 `pending`
   - 页面里虽然已经存在 `window.figma`，但没有出现提交请求
   - 更稳妥的做法是确认脚本已加载后，直接在页面里执行 `window.figma.captureForDesign({ captureId, endpoint, selector: 'body' })`
