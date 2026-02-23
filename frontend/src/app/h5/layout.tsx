import type { ReactNode } from "react";

/**
 * H5 layout — mobile-first, no admin sidebar.
 *
 * This layout intentionally omits the DashboardSidebar and other admin
 * chrome so H5 users get a clean, full-screen chat experience optimised
 * for mobile devices.
 */
export default function H5Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-app">
      {children}
    </div>
  );
}
