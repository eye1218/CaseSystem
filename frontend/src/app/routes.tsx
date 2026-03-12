import { createBrowserRouter, Navigate } from "react-router-dom";

import MainLayout from "../components/MainLayout";
import RequireAdminRoute from "../components/RequireAdminRoute";
import RequireInternalRoute from "../components/RequireInternalRoute";
import RequireInternalKnowledge from "../components/RequireInternalKnowledge";
import EventDetailPage from "../pages/EventDetailPage";
import EventEditorPage from "../pages/EventEditorPage";
import EventsPage from "../pages/EventsPage";
import LoginPage from "../pages/LoginPage";
import TicketCreatePage from "../pages/TicketCreatePage";
import TicketListPage from "../pages/TicketListPage";
import TicketDetailPage from "../pages/TicketDetailPage";
import KnowledgeDetailPage from "../pages/KnowledgeDetailPage";
import KnowledgeEditorPage from "../pages/KnowledgeEditorPage";
import KnowledgeListPage from "../pages/KnowledgeListPage";
import NotificationsPage from "../pages/NotificationsPage";
import PlaceholderPage from "../pages/PlaceholderPage";
import ConfigurationPage from "../pages/ConfigurationPage";
import ReportTemplatesPage from "../pages/ReportTemplatesPage";
import ReportsPage from "../pages/ReportsPage";
import TasksPage from "../pages/TasksPage";
import TaskTemplatesPage from "../pages/TaskTemplatesPage";
import TemplateRenderingPage from "../pages/TemplateRenderingPage";

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
        element: <NotificationsPage />
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
        path: "events",
        element: (
          <RequireAdminRoute>
            <EventsPage />
          </RequireAdminRoute>
        )
      },
      {
        path: "events/new",
        element: (
          <RequireAdminRoute>
            <EventEditorPage />
          </RequireAdminRoute>
        )
      },
      {
        path: "events/:id",
        element: (
          <RequireAdminRoute>
            <EventDetailPage />
          </RequireAdminRoute>
        )
      },
      {
        path: "events/:id/edit",
        element: (
          <RequireAdminRoute>
            <EventEditorPage />
          </RequireAdminRoute>
        )
      },
      {
        path: "tasks",
        element: (
          <RequireInternalRoute>
            <TasksPage />
          </RequireInternalRoute>
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
        path: "configuration/templates",
        element: <TemplateRenderingPage />
      },
      {
        path: "configuration/report-templates",
        element: <ReportTemplatesPage />
      },
      {
        path: "configuration/task-templates",
        element: (
          <RequireAdminRoute>
            <TaskTemplatesPage />
          </RequireAdminRoute>
        )
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
