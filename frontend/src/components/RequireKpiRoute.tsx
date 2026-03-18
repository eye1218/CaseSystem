import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";

const ALLOWED_KPI_ROLES = new Set(["T2", "T3", "ADMIN"]);

export default function RequireKpiRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (!user || !ALLOWED_KPI_ROLES.has(user.active_role)) {
    return <Navigate to="/tickets" replace />;
  }

  return <>{children}</>;
}
