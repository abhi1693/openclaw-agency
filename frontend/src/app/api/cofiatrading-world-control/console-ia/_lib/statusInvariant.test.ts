import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("console IA status invariant", () => {
  it("does not label queued packets as green", async () => {
    const routePath = path.resolve(
      process.cwd(),
      "src/app/api/cofiatrading-world-control/console-ia/route.ts",
    );
    const handlersPath = path.resolve(
      process.cwd(),
      "src/app/api/cofiatrading-world-control/console-ia/_lib/handlers.ts",
    );
    const routeSource = [
      await readFile(routePath, "utf8"),
      await readFile(handlersPath, "utf8"),
    ].join("\n");

    expect(routeSource).not.toContain("GREEN_PACKET_QUEUED_LOCAL");
    expect(routeSource).toContain("PACKET_QUEUED_LOCAL");
  });
});
