# Frontend Workspace

`frontend/` 用于承载前端独立工程。

当前状态：

- 原 `casesystem/ui/static/` 静态页面原型已迁移到 `frontend/legacy-static/ui/`
- 后端不再负责页面路由和静态资源挂载

后续建议：

- 在 `frontend/src/` 初始化正式前端工程
- 将 `legacy-static` 中的页面逐步迁移为组件化页面
