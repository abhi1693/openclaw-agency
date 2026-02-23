import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const LoginPage = lazy(() => import("./pages/Login"));
const SessionsPage = lazy(() => import("./pages/Sessions"));
const ChatPage = lazy(() => import("./pages/Chat"));

function LoadingFallback() {
  return <div className="flex h-full items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>;
}

export default function App() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white" style={{ paddingTop: "env(safe-area-inset-top)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/chat/:sessionId" element={<ChatPage />} />
          <Route path="*" element={<Navigate to="/sessions" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
