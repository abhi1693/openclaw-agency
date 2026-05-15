import type React from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BoardsPage from "./page";

const boardsQueryResult = {
  data: {
    status: 200,
    data: {
      items: [
        {
          id: "board-1",
          name: "Ops Board",
          slug: "ops-board",
          description: "Operations board context.",
          organization_id: "org-1",
          gateway_id: "gateway-1",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
    },
  },
  isLoading: false,
  error: null,
};

const groupsQueryResult = {
  data: {
    status: 200,
    data: {
      items: [],
    },
  },
};

const sorting = [{ id: "name", desc: false }];
const onSortingChange = vi.fn();
const deleteMutation = {
  mutate: vi.fn(),
  isPending: false,
  error: null,
};

let gatewayStatusEntries = [
  {
    boardId: "board-1",
    gatewayId: "gateway-1",
    status: "connected" as const,
  },
];
let boardsTableRenderCount = 0;

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.PropsWithChildren<{
    href: string | { pathname?: string };
  }> &
    Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/auth/clerk", () => ({
  useAuth: () => ({ isSignedIn: true }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: gatewayStatusEntries }),
  useQueryClient: () => ({}),
}));

vi.mock("@/api/generated/boards/boards", () => ({
  getListBoardsApiV1BoardsGetQueryKey: () => ["boards"],
  useDeleteBoardApiV1BoardsBoardIdDelete: () => deleteMutation,
  useListBoardsApiV1BoardsGet: () => boardsQueryResult,
}));

vi.mock("@/api/generated/board-groups/board-groups", () => ({
  useListBoardGroupsApiV1BoardGroupsGet: () => groupsQueryResult,
}));

vi.mock("@/lib/list-delete", () => ({
  createOptimisticListDeleteMutation: () => ({}),
}));

vi.mock("@/lib/use-organization-membership", () => ({
  useOrganizationMembership: () => ({ isAdmin: true }),
}));

vi.mock("@/lib/use-url-sorting", () => ({
  useUrlSorting: () => ({ sorting, onSortingChange }),
}));

vi.mock("@/components/boards/BoardsTable", () => ({
  BoardsTable: ({
    gatewayStatusById,
  }: {
    gatewayStatusById: Record<string, string>;
  }) => {
    boardsTableRenderCount += 1;
    return <div data-testid="boards-table">{JSON.stringify(gatewayStatusById)}</div>;
  },
}));

vi.mock("@/components/templates/DashboardPageLayout", () => ({
  DashboardPageLayout: ({ children }: React.PropsWithChildren) => (
    <div data-testid="dashboard-layout">{children}</div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  buttonVariants: () => "",
}));

vi.mock("@/components/ui/confirm-action-dialog", () => ({
  ConfirmActionDialog: () => null,
}));

vi.mock("@/components/ui/error-boundary", () => ({
  ErrorBoundary: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  CardContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  CardHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

describe("BoardsPage", () => {
  beforeEach(() => {
    gatewayStatusEntries = [
      {
        boardId: "board-1",
        gatewayId: "gateway-1",
        status: "connected",
      },
    ];
    boardsTableRenderCount = 0;
    deleteMutation.mutate.mockReset();
    onSortingChange.mockReset();
  });

  it("skips table rerenders when gateway polling returns unchanged statuses", () => {
    const { rerender } = render(<BoardsPage />);

    expect(boardsTableRenderCount).toBe(1);

    gatewayStatusEntries = [
      {
        boardId: "board-1",
        gatewayId: "gateway-1",
        status: "connected",
      },
    ];
    rerender(<BoardsPage />);

    expect(boardsTableRenderCount).toBe(1);

    gatewayStatusEntries = [
      {
        boardId: "board-1",
        gatewayId: "gateway-1",
        status: "degraded",
      },
    ];
    rerender(<BoardsPage />);

    expect(boardsTableRenderCount).toBe(2);
  });
});
