import { createBrowserRouter, Navigate } from "react-router-dom";

import MainLayout from "../components/MainLayout";
import RequireInternalKnowledge from "../components/RequireInternalKnowledge";
import LoginPage from "../pages/LoginPage";
import ConfigurationPage from "../pages/ConfigurationPage";
import KnowledgeDetailPage from "../pages/KnowledgeDetailPage";
import KnowledgeEditorPage from "../pages/KnowledgeEditorPage";
import KnowledgeListPage from "../pages/KnowledgeListPage";
import ReportsPage from "../pages/ReportsPage";
import ReportTemplatesPage from "../pages/ReportTemplatesPage";
import TicketCreatePage from "../pages/TicketCreatePage";
import TicketDetailPage from "../pages/TicketDetailPage";
import PlaceholderPage from "../pages/PlaceholderPage";
import TicketListPage from "../pages/TicketListPage";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />
  },
  {
    path: "/",
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/tickets" replace />
      },
      {
        path: "tickets",
        element: <TicketListPage />
      },
      {
        path: "tickets/new",
        element: <TicketCreatePage />
      },
      {
        path: "tickets/:id",
        element: <TicketDetailPage />
      },
      {
        path: "ticket-pool",
        element: <PlaceholderPage titleKey="nav.ticketPool" description="工单池工作台待接入后端。" />
      },
      {
        path: "sla-monitor",
        element: <PlaceholderPage titleKey="nav.slaMonitor" description="SLA 监控页保留入口，后续按模块文档扩展。" />
      },
      {
        path: "notifications",
        element: <PlaceholderPage titleKey="nav.notifications" description="通知中心尚未进入本阶段开发。" />
      },
      {
        path: "knowledge",
        element: (
          <RequireInternalKnowledge>
            <KnowledgeListPage />
          </RequireInternalKnowledge>
        )
      },
      {
        path: "knowledge/new",
        element: (
          <RequireInternalKnowledge>
            <KnowledgeEditorPage />
          </RequireInternalKnowledge>
        )
      },
      {
        path: "knowledge/:id",
        element: (
          <RequireInternalKnowledge>
            <KnowledgeDetailPage />
          </RequireInternalKnowledge>
        )
      },
      {
        path: "knowledge/:id/edit",
        element: (
          <RequireInternalKnowledge>
            <KnowledgeEditorPage />
          </RequireInternalKnowledge>
        )
      },
      {
        path: "reports",
        element: <ReportsPage />
      },
      {
        path: "kpi",
        element: <PlaceholderPage titleKey="nav.kpi" description="KPI 模块尚未进入本轮实现。" />
      },
      {
        path: "configuration",
        element: <ConfigurationPage />
      },
      {
        path: "configuration/report-templates",
        element: <ReportTemplatesPage />
      },
      {
        path: "users",
        element: <PlaceholderPage titleKey="nav.users" description="用户、角色与权限页保留入口，当前使用现有后端认证能力。" />
      },
      {
        path: "audit",
        element: <PlaceholderPage titleKey="nav.audit" description="审计页保留入口，后续接入操作日志查询。" />
      },
      {
        path: "recycle-bin",
        element: <PlaceholderPage titleKey="nav.recycle" description="回收站前端入口已保留，后续接工单软删除列表。" />
      }
    ]
  }
]);
