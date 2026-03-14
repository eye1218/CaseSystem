# 用户管理模块 Figma 提示词

## 目标

为 CaseSystem 设计并回看一个符合现有项目风格的用户管理页面，页面入口固定为 `/users`，只面向 `ADMIN` 使用。页面采用高密度后台工作台样式，以表格为主，不新增卡片式运营页视觉。

## 设计范围

本次只设计一个页面，但包含两个标签：

1. `Users`
2. `Groups`

所有创建、查看、编辑操作均通过右侧非模态抽屉完成，不新增独立详情页。

## 视觉与风格约束

1. 严格延续当前项目已有的后台视觉：
   - 高密度表格
   - 深浅主题都可用
   - 中英文双语文案都能成立
   - 顶部保留页面标题与简短说明
   - 过滤器使用横向工具栏 + 可折叠高级筛选区
2. 不做营销化、运营看板化设计，不使用大面积插画或大卡片。
3. 颜色、阴影、边框、圆角、状态 badge、按钮层级要贴近现有配置中心与工单页。
4. 页面重点是“可管理、可筛选、可批量识别状态”，不是“品牌展示”。

## 页面一：Users 标签

### 结构

1. 顶部标题区
   - 标题：`用户管理 / User Management`
   - 副标题：说明该页面仅供管理员维护账号状态与用户组关系
2. 工具栏
   - 关键词搜索框：支持用户名、显示名、邮箱模糊搜索
   - `Create User` 主按钮
   - `Filters` 按钮：展开或折叠高级筛选
3. 高级筛选区
   - 状态筛选：All / Active / Disabled
   - 角色筛选：T1 / T2 / T3 / ADMIN / CUSTOMER
   - 用户组筛选：下拉选择
4. 概览统计条
   - Total users
   - Active
   - Disabled
5. 主表格

### Users 表格列

固定列如下：

1. Username
2. Display Name
3. Email
4. Roles
5. Groups
6. Status
7. Last Login
8. Updated At
9. Actions

### Users 行操作

1. View
2. Edit
3. Disable / Enable
4. Delete

### Users 抽屉

抽屉从右侧滑出，占据页面右侧约 36% 到 42% 宽度。

需要覆盖三种状态：

1. 创建用户
   - 字段：username、display_name、email、password、role_codes、group_ids
   - username 和 password 为必填
   - role_codes 至少一个
2. 用户详情
   - username 只读
   - 展示状态、角色、所属组、最后登录时间、更新时间
3. 编辑用户
   - username 仍只读
   - 允许改 display_name、email、group_ids
   - roles 只展示，不允许编辑

### 交互重点

1. 点击表格行或 View 打开详情抽屉
2. Edit 在抽屉中切换成可编辑状态
3. Disable、Enable、Delete 走确认弹层
4. 失败提示必须能容纳明确错误原因，例如：
   - 最后一个有效 ADMIN 不可停用
   - 用户已参与业务，不能删除

## 页面二：Groups 标签

### 结构

1. 顶部结构沿用 Users 标签
2. 工具栏
   - 关键词搜索
   - `Create Group` 主按钮
3. 概览统计条
   - Total groups
   - Total memberships
   - Non-empty groups
4. 主表格

### Groups 表格列

固定列如下：

1. Group Name
2. Description
3. Member Count
4. Updated At
5. Actions

### Groups 行操作

1. View
2. Edit
3. Delete

### Groups 抽屉

需要覆盖三种状态：

1. 创建用户组
   - 字段：name、description
2. 编辑用户组
   - 字段同上
3. 用户组详情
   - 头部展示组名、描述、成员数
   - 下方展示成员表格
   - 成员表格上方有“添加成员”选择器与按钮
   - 每个成员行提供移除操作

### 成员表格列

1. Username
2. Display Name
3. Email
4. Status
5. Actions

## 必须捕获的 Figma 状态

至少产出以下 4 个回看状态，并确保 light/dark、zh/en 均可查看：

1. Users 列表态
2. 用户详情或编辑抽屉态
3. Groups 列表态
4. 用户组详情抽屉态（包含成员表格和添加成员控件）

## 设计注意事项

1. 所有表格都应优先考虑后台高密度阅读效率。
2. 抽屉打开后，左侧列表仍保持可见，不切页。
3. 失败提示、空状态、加载态、禁用按钮态需要可视化覆盖。
4. 非 `ADMIN` 无需单独做页面设计，本期由路由守卫直接拦截。
