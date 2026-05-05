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
        "session-openai-1",
      ),
    ).toEqual({
      title: "Lead session",
      sessionId: "session-openai-1",
      provider: "openai",
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
        "session-anthropic-1",
      ),
    ).toEqual({
      title: "Worker session",
      sessionId: "session-anthropic-1",
      provider: "anthropic",
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
        "session-usage-1",
      ).usage,
    ).toBe("32.1k/128.0k (25%)");
  });

  it("keeps valid fields when nested JSON strings are partially malformed", () => {
    expect(
      buildSessionInspectDetails(
        {
          model: "openai/gpt-5.4",
          active_tools: '[{"id":"shell"},{"id":"browser"}]',
          usage: '{"used_tokens":32100',
          session_config: '{"approvals":"never","cwd":"/workspace"}',
        },
        "Partial session",
        "session-partial-1",
      ),
    ).toEqual({
      title: "Partial session",
      sessionId: "session-partial-1",
      provider: "openai",
      model: "openai/gpt-5.4",
      usage: "—",
      activeToolCount: 2,
      sessionConfig: '{\n  "approvals": "never",\n  "cwd": "/workspace"\n}',
    });
  });
});
