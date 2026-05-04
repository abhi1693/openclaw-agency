import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CopyableId } from "./copyable-id";

const copyToClipboardMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
  return {
    ...actual,
    copyToClipboard: copyToClipboardMock,
  };
});

describe("CopyableId", () => {
  beforeEach(() => {
    copyToClipboardMock.mockReset();
    copyToClipboardMock.mockResolvedValue(undefined);
  });

  it("truncates long ids to eight characters plus ellipsis", () => {
    render(<CopyableId value="session-1234567890" />);

    expect(screen.getByText("session-…")).toBeInTheDocument();
    expect(screen.getByText("session-…")).toHaveAttribute("title", "session-1234567890");
  });

  it("copies the full id and flips the button state", async () => {
    const user = userEvent.setup();

    render(<CopyableId value="session-1234567890" copyLabel="Copy session ID" />);

    await user.click(screen.getByRole("button", { name: "Copy session ID" }));

    expect(copyToClipboardMock).toHaveBeenCalledWith("session-1234567890");
    expect(
      screen.getByRole("button", { name: "Copy session ID copied" }),
    ).toBeInTheDocument();
  });
});
