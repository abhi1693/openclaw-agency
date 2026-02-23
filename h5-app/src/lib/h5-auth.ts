const ACCESS_TOKEN_KEY = "h5_access_token";
const REFRESH_TOKEN_KEY = "h5_refresh_token";
const USER_KEY = "h5_user";

export interface H5User { id: string; organization_id: string; username: string; display_name: string | null; email: string | null; phone: string | null; avatar_url: string | null; status: "active" | "suspended" | "deleted"; }
export interface H5TokenResponse { user: H5User; access_token: string; refresh_token: string; }

function safeGet(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key: string, value: string): void { try { localStorage.setItem(key, value); } catch {} }
function safeRemove(key: string): void { try { localStorage.removeItem(key); } catch {} }

export function getH5AccessToken(): string | null { return safeGet(ACCESS_TOKEN_KEY); }
export function getH5RefreshToken(): string | null { return safeGet(REFRESH_TOKEN_KEY); }
export function getH5User(): H5User | null { const raw = safeGet(USER_KEY); if (!raw) return null; try { return JSON.parse(raw) as H5User; } catch { return null; } }
export function saveH5Tokens(response: H5TokenResponse): void { safeSet(ACCESS_TOKEN_KEY, response.access_token); safeSet(REFRESH_TOKEN_KEY, response.refresh_token); safeSet(USER_KEY, JSON.stringify(response.user)); }
export function clearH5Auth(): void { safeRemove(ACCESS_TOKEN_KEY); safeRemove(REFRESH_TOKEN_KEY); safeRemove(USER_KEY); }
export function isH5Authenticated(): boolean { return !!getH5AccessToken(); }

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function h5Login(organizationId: string, username: string, password: string): Promise<H5TokenResponse> {
  const res = await fetch(`${API_BASE}/api/v1/h5/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organization_id: organizationId, username, password }) });
  if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error((body as { detail?: string }).detail ?? `Login failed (${res.status})`); }
  const data = (await res.json()) as H5TokenResponse;
  saveH5Tokens(data);
  return data;
}

export async function h5RefreshToken(): Promise<string | null> {
  const refreshToken = getH5RefreshToken();
  if (!refreshToken) return null;
  const res = await fetch(`${API_BASE}/api/v1/h5/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refreshToken }) });
  if (!res.ok) { clearH5Auth(); return null; }
  const data = (await res.json()) as H5TokenResponse;
  saveH5Tokens(data);
  return data.access_token;
}

export function buildWsUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
  const wsUrl = apiUrl.replace(/^http/, "ws");
  return `${wsUrl}/ws/h5/chat`;
}
