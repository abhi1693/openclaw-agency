import { useCallback, useEffect, useState } from "react";
import { clearH5Auth, getH5AccessToken, getH5User, h5Login, H5TokenResponse, H5User, isH5Authenticated } from "../lib/h5-auth";

export interface UseH5AuthReturn { user: H5User | null; token: string | null; isAuthenticated: boolean; isLoading: boolean; error: string | null; login: (organizationId: string, username: string, password: string) => Promise<void>; logout: () => void; }

export function useH5Auth(): UseH5AuthReturn {
  const [user, setUser] = useState<H5User | null>(() => getH5User());
  const [token, setToken] = useState<string | null>(() => getH5AccessToken());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "h5_access_token") { setToken(e.newValue); if (!e.newValue) setUser(null); }
      if (e.key === "h5_user") { if (e.newValue) { try { setUser(JSON.parse(e.newValue) as H5User); } catch { setUser(null); } } else { setUser(null); } }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const login = useCallback(async (organizationId: string, username: string, password: string) => {
    setIsLoading(true); setError(null);
    try { const resp: H5TokenResponse = await h5Login(organizationId, username, password); setUser(resp.user); setToken(resp.access_token); }
    catch (err) { setError(err instanceof Error ? err.message : "Login failed"); throw err; }
    finally { setIsLoading(false); }
  }, []);

  const logout = useCallback(() => { clearH5Auth(); setUser(null); setToken(null); setError(null); }, []);

  return { user, token, isAuthenticated: isH5Authenticated() && !!user, isLoading, error, login, logout };
}
