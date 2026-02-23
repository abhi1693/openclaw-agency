import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useH5Auth } from "../hooks/useH5Auth";

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, isAuthenticated, isLoading, error } = useH5Auth();
  const [orgId, setOrgId] = useState(import.meta.env.VITE_DEFAULT_ORG_ID ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => { if (isAuthenticated) void navigate("/sessions", { replace: true }); }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await login(orgId, username, password); void navigate("/sessions", { replace: true }); } catch {}
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">OpenClaw</h1>
          <p className="mt-1 text-sm text-gray-500">{t("login.subtitle")}</p>
        </div>
        <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
          {!import.meta.env.VITE_DEFAULT_ORG_ID && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-900" htmlFor="orgId">{t("login.organizationId")}</label>
              <input id="orgId" type="text" required value={orgId} onChange={e => setOrgId(e.target.value)} placeholder={t("login.organizationIdPlaceholder")} autoComplete="off" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-900" htmlFor="username">{t("login.username")}</label>
            <input id="username" type="text" required value={username} onChange={e => setUsername(e.target.value)} placeholder={t("login.usernamePlaceholder")} autoComplete="username" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-900" htmlFor="password">{t("login.password")}</label>
            <input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder={t("login.passwordPlaceholder")} autoComplete="current-password" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={isLoading || !username || !password || !orgId} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("login.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
