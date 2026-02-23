const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const MC = `${API}/api/v1/mc`;
export const WS_URL = API.replace("http", "ws") + "/api/v1/mc/ws";

async function tryRefresh(): Promise<string | null> {
  const rt = typeof window !== "undefined" ? sessionStorage.getItem("mc_refresh_token") : null;
  if (!rt) return null;
  try {
    const res = await fetch(`${MC}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    sessionStorage.setItem("mc_local_auth_token", data.access_token);
    if (data.refresh_token) sessionStorage.setItem("mc_refresh_token", data.refresh_token);
    if (data.expires_in) sessionStorage.setItem("mc_token_expiry", String(Date.now() + data.expires_in * 1000));
    return data.access_token;
  } catch {
    return null;
  }
}

export async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("mc_local_auth_token") : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${MC}${path}`, { ...opts, headers: { ...headers, ...opts?.headers } });

  // On 401, try refresh and retry once
  if (res.status === 401) {
    const newToken = await tryRefresh();
    if (newToken) {
      const retryH: Record<string, string> = { "Content-Type": "application/json", "Authorization": `Bearer ${newToken}` };
      const retry = await fetch(`${MC}${path}`, { ...opts, headers: { ...retryH, ...opts?.headers } });
      if (!retry.ok) throw new Error(`API ${retry.status}`);
      return retry.json();
    }
    // Refresh failed — clear session
    sessionStorage.removeItem("mc_local_auth_token");
    sessionStorage.removeItem("mc_refresh_token");
    sessionStorage.removeItem("mc_permissions");
    sessionStorage.removeItem("mc_user");
    sessionStorage.removeItem("mc_token_expiry");
    throw new Error("API 401");
  }

  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
