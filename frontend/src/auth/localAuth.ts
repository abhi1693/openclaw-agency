// Local bearer auth - runtime token storage (not baked into build)
let localToken: string | null = null;

export function setLocalAuthToken(token: string): void {
  localToken = token;
  // Also store in sessionStorage for persistence across reloads
  // (sessionStorage is cleared when tab closes, more secure than localStorage)
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem("mc_local_token", token);
    } catch {
      // Ignore storage errors
    }
  }
}

export function getLocalAuthToken(): string | null {
  if (localToken) return localToken;

  // Try to restore from sessionStorage
  if (typeof window !== "undefined") {
    try {
      const stored = sessionStorage.getItem("mc_local_token");
      if (stored) {
        localToken = stored;
        return stored;
      }
    } catch {
      // Ignore storage errors
    }
  }

  return null;
}

export function clearLocalAuthToken(): void {
  localToken = null;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem("mc_local_token");
    } catch {
      // Ignore storage errors
    }
  }
}

// Check if local auth mode is enabled (based on build-time flag)
export function isLocalAuthMode(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_MODE === "local_bearer";
}
