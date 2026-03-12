import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";

export default function RequireInternalRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (user?.active_role === "CUSTOMER") {
    return <Navigate to="/tickets" replace />;
  }

  return <>{children}</>;
}
