"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useH5Auth } from "@/hooks/useH5Auth";

export default function H5LoginPage() {
  const t = useTranslations("h5");
  const router = useRouter();
  const { login, isAuthenticated, isLoading, error } = useH5Auth();

  const [orgId, setOrgId] = useState(
    process.env.NEXT_PUBLIC_DEFAULT_ORG_ID ?? "",
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/h5/chat");
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(orgId, username, password);
      router.replace("/h5/chat");
    } catch {
      // error shown via `error` state
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo / brand */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-strong">OpenClaw</h1>
          <p className="mt-1 text-sm text-muted">{t("login.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!process.env.NEXT_PUBLIC_DEFAULT_ORG_ID && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-strong" htmlFor="orgId">
                {t("login.organizationId")}
              </label>
              <Input
                id="orgId"
                type="text"
                required
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                placeholder={t("login.organizationIdPlaceholder")}
                autoComplete="off"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-strong" htmlFor="username">
              {t("login.username")}
            </label>
            <Input
              id="username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("login.usernamePlaceholder")}
              autoComplete="username"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-strong" htmlFor="password">
              {t("login.password")}
            </label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("login.passwordPlaceholder")}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !username || !password || !orgId}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("login.submit")}
          </Button>
        </form>
      </div>
    </div>
  );
}
