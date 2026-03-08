# CaseSystem Auth Module

这是基于 `docs/系统总览设计.md` 与 `docs/身份与权限模块.md` 实现的后端身份与权限模块 MVP。

## 功能范围

* 用户登录、登出、改密
* Access Token 鉴权
* Refresh Token 轮换与 reuse 检测
* 当前激活角色切换
* RBAC 权限校验
* 对象级访问控制钩子
* CSRF 防护
* 登录失败限流与账户临时锁定
* 安全事件落库

## 启动

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[dev]"
uvicorn casesystem.main:app --reload
```

## 测试

```bash
pytest
```
