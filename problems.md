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
