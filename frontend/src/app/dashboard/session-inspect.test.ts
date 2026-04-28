import { describe, expect, it } from "vitest";

import { buildSessionInspectDetails } from "./session-inspect";

describe("buildSessionInspectDetails", () => {
  it("reads the inspect payload fields from a typical session object", () => {
    expect(
      buildSessionInspectDetails(
        {
          model: "openai/gpt-5.4",
          active_tools: [{ id: "shell" }, { id: "browser" }],
          session_config: {
            approvals: "never",
            cwd: "/workspace",
          },
        },
        "Lead session",
      ),
    ).toEqual({
      title: "Lead session",
      model: "openai/gpt-5.4",
      usage: "—",
      activeToolCount: 2,
      sessionConfig: '{\n  "approvals": "never",\n  "cwd": "/workspace"\n}',
    });
  });

  it("falls back to alternate key names and string config payloads", () => {
    expect(
      buildSessionInspectDetails(
        {
          model_name: "anthropic/claude-sonnet-4",
          activeToolCount: 3,
          config: '{"sandbox":"workspace-write"}',
        },
        "Worker session",
      ),
    ).toEqual({
      title: "Worker session",
      model: "anthropic/claude-sonnet-4",
      usage: "—",
      activeToolCount: 3,
      sessionConfig: '{"sandbox":"workspace-write"}',
    });
  });

  it("builds a usage label from nested usage payloads", () => {
    expect(
      buildSessionInspectDetails(
        {
          usage: {
            used_tokens: 32_100,
            max_tokens: 128_000,
            usage_pct: 25,
          },
        },
        "Usage session",
      ).usage,
    ).toBe("32.1k/128.0k (25%)");
  });
});
