import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type Language = "zh" | "en";

interface LanguageContextValue {
  language: Language;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  zh: {
    "nav.dashboard": "工作台",
    "nav.tickets": "工单中心",
    "nav.ticketPool": "工单池",
    "nav.slaMonitor": "SLA 监控",
    "nav.notifications": "通知中心",
    "nav.knowledge": "知识库",
    "nav.events": "Event 中心",
    "nav.tasks": "任务中心",
    "nav.reports": "报告",
    "nav.kpi": "KPI",
    "nav.configuration": "配置中心",
    "nav.users": "用户、角色与权限",
    "nav.audit": "审计",
    "nav.recycle": "回收站",
    "common.create": "创建",
    "common.filter": "筛选",
    "common.loading": "加载中...",
    "common.searchTicketId": "按工单 ID 搜索",
    "common.noData": "暂无数据",
    "user.logout": "退出登录",
    "user.profile": "个人资料",
    "role.t1": "T1 分析员",
    "role.t2": "T2 分析员",
    "role.t3": "T3 专家",
    "role.admin": "管理员",
    "role.customer": "客户",
    "status.waiting_response": "待响应",
    "status.in_progress": "处理中",
    "status.response_timeout": "响应超时",
    "status.resolution_timeout": "处置超时",
    "status.resolved": "已处置",
    "status.closed": "已关闭",
    "status.reopened": "已重开",
    "substatus.none": "无",
    "substatus.escalation_pending_confirm": "升级待确认",
    "substatus.escalation_confirmed": "升级已确认",
    "substatus.escalation_rejected": "升级被拒绝",
    "login.title": "SOC 7x24 工单系统",
    "login.subtitle": "安全运营中心",
    "login.username": "用户名",
    "login.password": "密码",
    "login.signin": "登录",
    "login.securityNote": "请使用授权账号登录",
    "login.invalid": "用户名或密码错误",
    "login.failed": "登录失败，请稍后重试",
    "ticket.category": "分类",
    "ticket.priority": "优先级",
    "ticket.status": "工单状态",
    "ticket.subStatus": "子状态",
    "ticket.createdFrom": "创建时间起",
    "ticket.createdTo": "创建时间止",
    "ticket.assignee": "当前处理人",
    "ticket.pool": "当前池子",
    "ticket.createdAt": "创建时间",
    "ticket.updatedAt": "更新时间",
    "ticket.responseDeadline": "响应时间",
    "ticket.resolutionDeadline": "处置时间",
    "ticket.actions": "操作",
    "ticket.title": "标题",
    "ticket.risk": "风险",
    "ticket.view": "查看",
    "ticket.edit": "编辑",
    "ticket.metrics.visible": "可见工单",
    "ticket.metrics.waiting": "待响应",
    "ticket.metrics.timeout": "超时中",
    "ticket.metrics.closed": "已处置 / 已关闭",
    "dashboard.title": "工作台"
  },
  en: {
    "nav.dashboard": "Dashboard",
    "nav.tickets": "Tickets",
    "nav.ticketPool": "Ticket Pool",
    "nav.slaMonitor": "SLA Monitor",
    "nav.notifications": "Notifications",
    "nav.knowledge": "Knowledge",
    "nav.events": "Event Center",
    "nav.tasks": "Tasks",
    "nav.reports": "Reports",
    "nav.kpi": "KPI",
    "nav.configuration": "Configuration",
    "nav.users": "Users & Permissions",
    "nav.audit": "Audit",
    "nav.recycle": "Recycle Bin",
    "common.create": "Create",
    "common.filter": "Filter",
    "common.loading": "Loading...",
    "common.searchTicketId": "Search by ticket ID",
    "common.noData": "No data",
    "user.logout": "Logout",
    "user.profile": "Profile",
    "role.t1": "T1 Analyst",
    "role.t2": "T2 Analyst",
    "role.t3": "T3 Expert",
    "role.admin": "Administrator",
    "role.customer": "Customer",
    "status.waiting_response": "Waiting Response",
    "status.in_progress": "In Progress",
    "status.response_timeout": "Response Timeout",
    "status.resolution_timeout": "Resolution Timeout",
    "status.resolved": "Resolved",
    "status.closed": "Closed",
    "status.reopened": "Reopened",
    "substatus.none": "None",
    "substatus.escalation_pending_confirm": "Escalation Pending Confirm",
    "substatus.escalation_confirmed": "Escalation Confirmed",
    "substatus.escalation_rejected": "Escalation Rejected",
    "login.title": "SOC 7x24 Ticket System",
    "login.subtitle": "Security Operations Center",
    "login.username": "Username",
    "login.password": "Password",
    "login.signin": "Sign In",
    "login.securityNote": "Please use an authorized account",
    "login.invalid": "Invalid username or password",
    "login.failed": "Login failed, please try again later",
    "ticket.category": "Category",
    "ticket.priority": "Priority",
    "ticket.status": "Status",
    "ticket.subStatus": "Sub-Status",
    "ticket.createdFrom": "Created From",
    "ticket.createdTo": "Created To",
    "ticket.assignee": "Handler",
    "ticket.pool": "Pool",
    "ticket.createdAt": "Created",
    "ticket.updatedAt": "Updated",
    "ticket.responseDeadline": "Response Time",
    "ticket.resolutionDeadline": "Resolution Time",
    "ticket.actions": "Actions",
    "ticket.title": "Title",
    "ticket.risk": "Risk",
    "ticket.view": "View",
    "ticket.edit": "Edit",
    "ticket.metrics.visible": "Visible Tickets",
    "ticket.metrics.waiting": "Waiting Response",
    "ticket.metrics.timeout": "Timed Out",
    "ticket.metrics.closed": "Resolved / Closed",
    "dashboard.title": "Dashboard"
  }
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("zh");

  useEffect(() => {
    const saved = window.localStorage.getItem("casesystem-language");
    if (saved === "zh" || saved === "en") {
      setLanguage(saved);
    }
  }, []);

  const value = useMemo(
    () => ({
      language,
      toggleLanguage: () =>
        setLanguage((current) => {
          const next = current === "zh" ? "en" : "zh";
          window.localStorage.setItem("casesystem-language", next);
          return next;
        }),
      t: (key: string) => translations[language][key] ?? key
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
