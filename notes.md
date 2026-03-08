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

