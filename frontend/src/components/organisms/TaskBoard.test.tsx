import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskBoard } from "./TaskBoard";

type TaskStatus = "inbox" | "in_progress" | "review" | "done";

type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  approvals_pending_count?: number;
  blocked_by_task_ids?: string[];
  is_blocked?: boolean;
};

const buildTask = (overrides: Partial<Task> = {}): Task => ({
  id: `task-${Math.random().toString(16).slice(2)}`,
  title: "Task",
  status: "inbox",
  priority: "medium",
  approvals_pending_count: 0,
  blocked_by_task_ids: [],
  is_blocked: false,
  ...overrides,
});

describe("TaskBoard", () => {
  it("renders the 4 columns and shows per-column counts", () => {
    const tasks: Task[] = [
      buildTask({ id: "t1", title: "Inbox A", status: "inbox" }),
      buildTask({ id: "t2", title: "Doing A", status: "in_progress" }),
      buildTask({ id: "t3", title: "Review A", status: "review" }),
      buildTask({ id: "t4", title: "Done A", status: "done" }),
      buildTask({ id: "t5", title: "Inbox B", status: "inbox" }),
    ];

    render(<TaskBoard tasks={tasks} />);

    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "In Progress" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Done" })).toBeInTheDocument();

    // Column count badges are plain spans; easiest stable check is text occurrence.
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText("Inbox A")).toBeInTheDocument();
    expect(screen.getByText("Inbox B")).toBeInTheDocument();
  });

  it("filters the review column by bucket", () => {
    const tasks: Task[] = [
      buildTask({
        id: "blocked",
        title: "Blocked Review",
        status: "review",
        is_blocked: true,
        blocked_by_task_ids: ["dep-1"],
      }),
      buildTask({
        id: "approval",
        title: "Needs Approval",
        status: "review",
        approvals_pending_count: 2,
      }),
      buildTask({
        id: "lead",
        title: "Lead Review",
        status: "review",
      }),
    ];

    render(<TaskBoard tasks={tasks} />);

    const reviewHeading = screen.getByRole("heading", { name: "Review" });
    const reviewColumn = reviewHeading.closest(".kanban-column") as HTMLElement | null;
    expect(reviewColumn).toBeTruthy();

    const header = reviewColumn!.querySelector(".column-header") as HTMLElement | null;
    expect(header).toBeTruthy();

    const headerQueries = within(header!);

    expect(headerQueries.getByRole("button", { name: /All · 3/i })).toBeInTheDocument();
    expect(
      headerQueries.getByRole("button", { name: /Approval needed · 1/i }),
    ).toBeInTheDocument();
    expect(
      headerQueries.getByRole("button", { name: /Lead review · 1/i }),
    ).toBeInTheDocument();
    expect(
      headerQueries.getByRole("button", { name: /Blocked · 1/i }),
    ).toBeInTheDocument();

    fireEvent.click(headerQueries.getByRole("button", { name: /Blocked · 1/i }));
    expect(screen.getByText("Blocked Review")).toBeInTheDocument();
    expect(screen.queryByText("Needs Approval")).not.toBeInTheDocument();
    expect(screen.queryByText("Lead Review")).not.toBeInTheDocument();

    fireEvent.click(
      headerQueries.getByRole("button", { name: /Approval needed · 1/i }),
    );
    expect(screen.getByText("Needs Approval")).toBeInTheDocument();
    expect(screen.queryByText("Blocked Review")).not.toBeInTheDocument();
    expect(screen.queryByText("Lead Review")).not.toBeInTheDocument();

    fireEvent.click(
      headerQueries.getByRole("button", { name: /Lead review · 1/i }),
    );
    expect(screen.getByText("Lead Review")).toBeInTheDocument();
    expect(screen.queryByText("Blocked Review")).not.toBeInTheDocument();
    expect(screen.queryByText("Needs Approval")).not.toBeInTheDocument();
  });

  it("invokes onTaskMove when a task is dropped onto a different column", () => {
    const onTaskMove = vi.fn();
    const tasks: Task[] = [
      buildTask({ id: "t1", title: "Inbox A", status: "inbox" }),
    ];

    render(<TaskBoard tasks={tasks} onTaskMove={onTaskMove} />);

    const dropTarget = screen
      .getByRole("heading", { name: "Done" })
      .closest(".kanban-column") as HTMLElement | null;
    expect(dropTarget).toBeTruthy();

    fireEvent.drop(dropTarget!, {
      dataTransfer: {
        getData: () => JSON.stringify({ taskId: "t1", status: "inbox" }),
      },
    });

    expect(onTaskMove).toHaveBeenCalledWith("t1", "done");
  });

  it("does not allow dragging when readOnly is true", () => {
    const tasks: Task[] = [buildTask({ id: "t1", title: "Inbox A" })];

    render(<TaskBoard tasks={tasks} readOnly />);

    expect(screen.getByRole("button", { name: /Inbox A/i })).toHaveAttribute(
      "draggable",
      "false",
    );
  });
});
