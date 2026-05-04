import type React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BoardRead } from "@/api/generated/model";
import { BoardsTable } from "./BoardsTable";

vi.mock("next/link", () => {
  type LinkProps = React.PropsWithChildren<{
    href: string | { pathname?: string };
  }> &
    Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

  return {
    default: ({ href, children, ...props }: LinkProps) => (
      <a href={typeof href === "string" ? href : "#"} {...props}>
        {children}
      </a>
    ),
  };
});

const buildBoard = (overrides: Partial<BoardRead> = {}): BoardRead => ({
  id: "board-1",
  name: "Ops Board",
  slug: "ops-board",
  description: "Operations board context.",
  organization_id: "org-1",
  gateway_id: "gateway-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("BoardsTable", () => {
  it("renders gateway connection dots for connected, degraded, and disconnected rows", () => {
    render(
      <BoardsTable
        boards={[
          buildBoard({
            id: "board-1",
            name: "Connected Board",
            gateway_id: "gateway-1",
          }),
          buildBoard({
            id: "board-2",
            name: "Degraded Board",
            gateway_id: "gateway-2",
          }),
          buildBoard({
            id: "board-3",
            name: "Disconnected Board",
            gateway_id: "gateway-3",
          }),
        ]}
        gatewayStatusById={{
          "gateway-1": "connected",
          "gateway-2": "degraded",
          "gateway-3": "disconnected",
        }}
        showActions={false}
      />,
    );

    expect(screen.getByLabelText("Gateway connected")).toHaveClass("bg-emerald-500");
    expect(screen.getByLabelText("Gateway degraded")).toHaveClass("bg-amber-500");
    expect(screen.getByLabelText("Gateway disconnected")).toHaveClass("bg-slate-300");
  });

  it("defaults missing gateway health to disconnected", () => {
    render(
      <BoardsTable
        boards={[
          buildBoard({
            id: "board-4",
            name: "Unknown Board",
            gateway_id: "gateway-4",
          }),
        ]}
        showActions={false}
      />,
    );

    expect(screen.getByLabelText("Gateway disconnected")).toHaveClass("bg-slate-300");
  });
});
