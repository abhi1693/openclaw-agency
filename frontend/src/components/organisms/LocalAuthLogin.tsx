"use client";

import { useState } from "react";
import { setLocalAuthToken, isLocalAuthMode } from "@/auth/localAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Lock } from "lucide-react";

interface LocalAuthLoginProps {
  onLogin?: () => void;
}

export function LocalAuthLogin({ onLogin }: LocalAuthLoginProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Don't show if not in local auth mode
  if (!isLocalAuthMode()) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError("Please enter a token");
      return;
    }
    setLocalAuthToken(token.trim());
    setError(null);
    onLogin?.();
    // Reload the page to trigger auth check
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-center">
            <div className="rounded-full bg-primary/10 p-3">
              <Lock className="h-6 w-6 text-primary" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Local Authentication</h1>
            <p className="text-sm text-muted-foreground">
              Enter your local bearer token to access Mission Control.
              This is configured in your backend environment.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Enter bearer token..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full"
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
            <Button type="submit" className="w-full">
              Sign In
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Local bearer token is set via the LOCAL_AUTH_TOKEN environment variable.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
