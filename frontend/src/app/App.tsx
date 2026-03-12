import { RouterProvider } from "react-router-dom";

import { router } from "./routes";
import { AuthProvider } from "../contexts/AuthContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import { RealtimeProvider } from "../contexts/RealtimeContext";
import { ThemeProvider } from "../contexts/ThemeContext";

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <RealtimeProvider>
            <RouterProvider router={router} />
          </RealtimeProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
