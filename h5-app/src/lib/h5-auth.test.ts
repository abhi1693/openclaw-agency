import { afterEach, describe, expect, it } from "vitest";

const store: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } },
  writable: true,
});

import { clearH5Auth, getH5AccessToken, getH5User, isH5Authenticated, saveH5Tokens } from "./h5-auth";

const mockResponse = { user: { id: "u1", organization_id: "org1", username: "testuser", display_name: "Test", email: null, phone: null, avatar_url: null, status: "active" as const }, access_token: "access-abc", refresh_token: "refresh-xyz" };

afterEach(() => { clearH5Auth(); });

describe("h5-auth", () => {
  it("saves tokens", () => { saveH5Tokens(mockResponse); expect(getH5AccessToken()).toBe("access-abc"); });
  it("saves user", () => { saveH5Tokens(mockResponse); expect(getH5User()?.username).toBe("testuser"); });
  it("isAuthenticated true when token", () => { saveH5Tokens(mockResponse); expect(isH5Authenticated()).toBe(true); });
  it("clears auth", () => { saveH5Tokens(mockResponse); clearH5Auth(); expect(getH5AccessToken()).toBeNull(); });
});
