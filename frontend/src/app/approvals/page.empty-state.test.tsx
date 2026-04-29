import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { QueryProvider } from "@/components/providers/QueryProvider";

const mockBoardGroupsQuery = vi.fn();
const mockBoardsQuery = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/approvals",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.PropsWithChildren<{ href: string }> &
    Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/auth/clerk", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));

vi.mock("@/api/generated/board-groups/board-groups", () => ({
  useListBoardGroupsApiV1BoardGroupsGet: (...args: unknown[]) =>
    mockBoardGroupsQuery(...args),
}));

vi.mock("@/api/generated/boards/boards", () => ({
  useListBoardsApiV1BoardsGet: (...args: unknown[]) => mockBoardsQuery(...args),
}));

vi.mock("@/components/templates/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/components/organisms/DashboardSidebar", () => ({
  DashboardSidebar: () => <div>sidebar</div>,
}));

vi.mock("@/components/BoardApprovalsPanel", () => ({
  BoardApprovalsPanel: () => <div>approvals-panel</div>,
}));

import GlobalApprovalsPage from "./page";

describe("/approvals empty state", () => {
  it("renders a board-group empty state when no board groups exist", () => {
    mockBoardGroupsQuery.mockReturnValue({
      data: { status: 200, data: { items: [] } },
      isLoading: false,
    });
    mockBoardsQuery.mockReturnValue({
      data: { status: 200, data: { items: [] } },
      isLoading: false,
    });

    render(
      <QueryProvider>
        <GlobalApprovalsPage />
      </QueryProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "No Board Groups" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Create a board group to enable approval workflows"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to Boards →" }),
    ).toHaveAttribute("href", "/boards");
    expect(screen.queryByText("approvals-panel")).not.toBeInTheDocument();
  });
});
