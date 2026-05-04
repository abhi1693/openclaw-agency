import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CronCalendar from "./CronCalendar";

const jobs = [
  {
    id: "job-success",
    name: "Daily Success",
    schedule: "0 9 * * *",
    enabled: true,
    state: { lastRunOutcome: "success" },
  },
  {
    id: "job-failed",
    name: "Daily Failure",
    schedule: "0 10 * * *",
    enabled: true,
    state: { lastRunStatus: "error" },
  },
  {
    id: "job-running",
    name: "Daily Running",
    schedule: "0 11 * * *",
    enabled: true,
    state: { lastStatus: "running" },
  },
  {
    id: "job-scheduled",
    name: "Daily Scheduled",
    schedule: "0 12 * * *",
    enabled: true,
  },
] as const;

describe("CronCalendar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders month blocks with status-coded metadata and routes clicks to the history callback", () => {
    const onSelectJob = vi.fn();

    render(<CronCalendar jobs={[...jobs]} onSelectJob={onSelectJob} />);

    const successBlock = screen.getAllByRole("button", {
      name: "Daily Success at 09:00",
    })[0];
    const failedBlock = screen.getAllByRole("button", {
      name: "Daily Failure at 10:00",
    })[0];
    const runningBlock = screen.getAllByRole("button", {
      name: "Daily Running at 11:00",
    })[0];
    const scheduledBlock = screen.getAllByRole("button", {
      name: "Daily Scheduled at 12:00",
    })[0];

    expect(successBlock).toHaveAttribute("data-status", "success");
    expect(failedBlock).toHaveAttribute("data-status", "failed");
    expect(runningBlock).toHaveAttribute("data-status", "running");
    expect(scheduledBlock).toHaveAttribute("data-status", "scheduled");

    fireEvent.click(runningBlock);
    expect(onSelectJob).toHaveBeenCalledWith("job-running");
  });

  it("renders the weekly time grid with hour labels and clickable blocks", () => {
    const onSelectJob = vi.fn();

    render(
      <CronCalendar
        jobs={[...jobs]}
        activeJobId="job-success"
        onSelectJob={onSelectJob}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "📆 Week" }));

    expect(screen.getAllByText("00:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12:00").length).toBeGreaterThan(0);

    const weekBlock = screen.getAllByRole("button", {
      name: "Daily Success at 09:00",
    })[0];
    expect(weekBlock).toHaveAttribute("data-status", "success");

    fireEvent.click(weekBlock);
    expect(onSelectJob).toHaveBeenCalledWith("job-success");
  });
});
