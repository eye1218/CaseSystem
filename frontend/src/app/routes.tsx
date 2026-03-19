import { Navigate, createBrowserRouter } from "react-router-dom";

import MainLayout from "../components/MainLayout";
import RequireAdminRoute from "../components/RequireAdminRoute";
import RequireInternalRoute from "../components/RequireInternalRoute";
import RequireInternalKnowledge from "../components/RequireInternalKnowledge";
import RequireKpiRoute from "../components/RequireKpiRoute";
import EventDetailPage from "../pages/EventDetailPage";
import EventEditorPage from "../pages/EventEditorPage";
import EventsPage from "../pages/EventsPage";
import LoginPage from "../pages/LoginPage";
import AuditPage from "../pages/AuditPage";
import KpiPage from "../pages/KpiPage";
import TicketCreatePage from "../pages/TicketCreatePage";
import TicketListPage from "../pages/TicketListPage";
import TicketDetailPage from "../pages/TicketDetailPage";
import KnowledgeDetailPage from "../pages/KnowledgeDetailPage";
import KnowledgeEditorPage from "../pages/KnowledgeEditorPage";
import KnowledgeListPage from "../pages/KnowledgeListPage";
import NotificationsPage from "../pages/NotificationsPage";
import PlaceholderPage from "../pages/PlaceholderPage";
import ConfigurationPage from "../pages/ConfigurationPage";
import AlertSourcesPage from "../pages/AlertSourcesPage";
import MailSendersPage from "../pages/MailSendersPage";
import ReportTemplatesPage from "../pages/ReportTemplatesPage";
import ReportsPage from "../pages/ReportsPage";
import SlaConfigurationPage from "../pages/SlaConfigurationPage";
import TicketConfigPage from "../pages/TicketConfigPage";
import TasksPage from "../pages/TasksPage";
import TaskTemplatesPage from "../pages/TaskTemplatesPage";
import TemplateRenderingPage from "../pages/TemplateRenderingPage";
import UsersPage from "../pages/UsersPage";
import ApiTokensPage from "../pages/ApiTokensPage";
import ProfilePage from "../pages/ProfilePage";

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
        element: (
          <RequireInternalRoute>
            <TicketListPage assignedToMeOnly />
          </RequireInternalRoute>
        )
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
        element: <Navigate to="/tickets" replace />
      },
      {
        path: "sla-monitor",
        element: <Navigate to="/tickets" replace />
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
        element: (
          <RequireKpiRoute>
            <KpiPage />
          </RequireKpiRoute>
        )
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
        path: "configuration/mail-senders",
        element: (
          <RequireAdminRoute>
            <MailSendersPage />
          </RequireAdminRoute>
        )
      },
      {
        path: "configuration/alert-sources",
        element: (
          <RequireAdminRoute>
            <AlertSourcesPage />
          </RequireAdminRoute>
        )
      },
      {
        path: "configuration/ticket-config",
        element: (
          <RequireAdminRoute>
            <TicketConfigPage />
          </RequireAdminRoute>
        )
      },
      {
        path: "configuration/sla-policies",
        element: (
          <RequireAdminRoute>
            <SlaConfigurationPage />
          </RequireAdminRoute>
        )
      },
      {
        path: "users",
        element: (
          <RequireAdminRoute>
            <UsersPage />
          </RequireAdminRoute>
        )
      },
      {
        path: "audit",
        element: (
          <RequireAdminRoute>
            <AuditPage />
          </RequireAdminRoute>
        )
      },
      {
        path: "recycle-bin",
        element: <PlaceholderPage titleKey="nav.recycle" description="回收站前端入口已保留，后续接工单软删除列表。" />
      },
      {
        path: "api-tokens",
        element: <ApiTokensPage />
      },
      {
        path: "profile",
        element: <ProfilePage />
      }
    ]
  }
]);
