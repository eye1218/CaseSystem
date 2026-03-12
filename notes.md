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
