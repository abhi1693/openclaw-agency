import { describe, expect, it } from "vitest";

import { normalizeAttachment, safeJoinInside, validateAttachmentId } from "./securityPolicy";

describe("console IA securityPolicy", () => {
  it("rejects path traversal attachment ids", () => {
    for (const id of ["../evil", "..\\evil", "/tmp/evil", "a/b"]) {
      expect(validateAttachmentId(id, "fallback")).toMatchObject({ ok: false });
    }
  });

  it("normalizes safe attachments as untrusted input", () => {
    const result = normalizeAttachment({
      id: "cam_001",
      kind: "camera",
      name: "camera.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 0,
    }, undefined, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.trust).toBe("UNTRUSTED_INPUT");
      expect(result.value.id).toBe("cam_001");
    }
  });

  it("rejects unknown kinds", () => {
    expect(normalizeAttachment({
      id: "ok",
      kind: "binary",
      name: "payload.txt",
      mimeType: "text/plain",
      sizeBytes: 1,
    }, undefined, 0)).toMatchObject({ ok: false });
  });

  it("blocks path traversal in final storage path", () => {
    expect(safeJoinInside("/tmp/base", "../evil.txt")).toMatchObject({ ok: false });
    expect(safeJoinInside("/tmp/base", "safe.txt")).toMatchObject({ ok: true });
  });
});
