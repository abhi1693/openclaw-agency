"use client";

// NOTE: We intentionally keep this file very small and dependency-free.
// It provides CI/secretless-build safe fallbacks for Clerk hooks/components.

import type { ReactNode, ComponentProps } from "react";

import {
  ClerkProvider,
  SignedIn as ClerkSignedIn,
  SignedOut as ClerkSignedOut,
  SignInButton as ClerkSignInButton,
  SignOutButton as ClerkSignOutButton,
  useAuth as clerkUseAuth,
  useUser as clerkUseUser,
} from "@clerk/nextjs";

import { isLikelyValidClerkPublishableKey } from "@/auth/clerkKey";
import { getLocalAuthToken, isLocalAuthMode } from "@/auth/localAuth";

function isE2EAuthBypassEnabled(): boolean {
  // Used only for Cypress E2E to keep tests secretless and deterministic.
  // When enabled, we treat the user as signed in and skip Clerk entirely.
  return process.env.NEXT_PUBLIC_E2E_AUTH_BYPASS === "1";
}

function isLocalAuthEnabled(): boolean {
  // Local bearer token auth for self-hosted deployments.
  // Enabled when AUTH_MODE is local_bearer AND we have a token stored.
  return isLocalAuthMode() && !!getLocalAuthToken();
}

export function isClerkEnabled(): boolean {
  // IMPORTANT: keep this in sync with AuthProvider; otherwise components like
  // <SignedOut/> may render without a <ClerkProvider/> and crash during prerender.
  if (isE2EAuthBypassEnabled()) return false;
  if (isLocalAuthEnabled()) return false;
  return isLikelyValidClerkPublishableKey(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
}

export function SignedIn(props: { children: ReactNode }) {
  if (isE2EAuthBypassEnabled()) return <>{props.children}</>;
  if (isLocalAuthEnabled()) return <>{props.children}</>;  // Local auth is always "signed in"
  if (!isClerkEnabled()) return null;
  return <ClerkSignedIn>{props.children}</ClerkSignedIn>;
}

export function SignedOut(props: { children: ReactNode }) {
  if (isE2EAuthBypassEnabled()) return null;
  if (isLocalAuthEnabled()) return null;  // Local auth is never "signed out"
  if (!isClerkEnabled()) return <>{props.children}</>;
  return <ClerkSignedOut>{props.children}</ClerkSignedOut>;
}

// Keep the same prop surface as Clerk components so call sites don't need edits.
export function SignInButton(props: ComponentProps<typeof ClerkSignInButton>) {
  if (!isClerkEnabled()) return null;
  return <ClerkSignInButton {...props} />;
}

export function SignOutButton(
  props: ComponentProps<typeof ClerkSignOutButton>,
) {
  if (!isClerkEnabled()) return null;
  return <ClerkSignOutButton {...props} />;
}

export function useUser() {
  if (!isClerkEnabled()) {
    return { isLoaded: true, isSignedIn: false, user: null } as const;
  }
  return clerkUseUser();
}

export function useAuth() {
  const token = getLocalAuthToken();
  if (isLocalAuthMode() && token) {
    return {
      isLoaded: true,
      isSignedIn: true,
      userId: "local-user",
      sessionId: "local-session",
      getToken: async () => token,
    } as const;
  }
  if (isE2EAuthBypassEnabled()) {
    return {
      isLoaded: true,
      isSignedIn: true,
      userId: "e2e-user",
      sessionId: "e2e-session",
      getToken: async () => "e2e-token",
    } as const;
  }
  if (!isClerkEnabled()) {
    return {
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      sessionId: null,
      getToken: async () => null,
    } as const;
  }
  return clerkUseAuth();
}

// Re-export ClerkProvider for places that want to mount it, but strongly prefer
// gating via isClerkEnabled() at call sites.
export { ClerkProvider };
