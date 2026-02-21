"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import {
  SignInButton,
  SignedIn,
  SignedOut,
  isClerkEnabled,
} from "@/auth/clerk";

import { UserMenu } from "@/components/organisms/UserMenu";
import { useTranslation } from "@/lib/i18n";

export function LandingShell({ children }: { children: ReactNode }) {
  const clerkEnabled = isClerkEnabled();
  const { t } = useTranslation();

  return (
    <div className="landing-enterprise">
      <nav className="landing-nav" aria-label="Primary navigation">
        <div className="nav-container">
          <Link href="/" className="logo-section" aria-label="OpenClaw home">
            <div className="logo-icon" aria-hidden="true">
              OC
            </div>
            <div className="logo-text">
              <div className="logo-name">{t("landing.brandName")}</div>
              <div className="logo-tagline">{t("landing.missionControl")}</div>
            </div>
          </Link>

          <div className="nav-links">
            <Link href="#capabilities">{t("landing.capabilities")}</Link>
            <Link href="/boards">{t("menu.boards")}</Link>
            <Link href="/activity">{t("menu.activity")}</Link>
            <Link href="/gateways">{t("menu.gateways")}</Link>
          </div>

          <div className="nav-cta">
            <SignedOut>
              {clerkEnabled ? (
                <>
                  <SignInButton
                    mode="modal"
                    forceRedirectUrl="/onboarding"
                    signUpForceRedirectUrl="/onboarding"
                  >
                    <button type="button" className="btn-secondary">
                      {t("menu.signIn")}
                    </button>
                  </SignInButton>
                  <SignInButton
                    mode="modal"
                    forceRedirectUrl="/onboarding"
                    signUpForceRedirectUrl="/onboarding"
                  >
                    <button type="button" className="btn-primary">
                      {t("menu.startFreeTrial")}
                    </button>
                  </SignInButton>
                </>
              ) : (
                <>
                  <Link href="/boards" className="btn-secondary">
                    {t("menu.boards")}
                  </Link>
                  <Link href="/onboarding" className="btn-primary">
                    {t("menu.getStarted")}
                  </Link>
                </>
              )}
            </SignedOut>

            <SignedIn>
              <Link href="/boards/new" className="btn-secondary">
                {t("menu.createBoard")}
              </Link>
              <Link href="/boards" className="btn-primary">
                {t("menu.openBoards")}
              </Link>
              <UserMenu />
            </SignedIn>
          </div>
        </div>
      </nav>

      <main>{children}</main>

      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>{t("landing.brandName")}</h3>
            <p>{t("landing.tagline")}</p>
            <div className="footer-tagline">{t("landing.realtimeVisibility")}</div>
          </div>

          <div className="footer-column">
            <h4>{t("landing.product")}</h4>
            <div className="footer-links">
              <Link href="#capabilities">{t("landing.capabilities")}</Link>
              <Link href="/boards">{t("menu.boards")}</Link>
              <Link href="/activity">{t("menu.activity")}</Link>
              <Link href="/dashboard">{t("menu.dashboard")}</Link>
            </div>
          </div>

          <div className="footer-column">
            <h4>{t("landing.platform")}</h4>
            <div className="footer-links">
              <Link href="/gateways">{t("menu.gateways")}</Link>
              <Link href="/agents">{t("menu.agents")}</Link>
              <Link href="/dashboard">{t("menu.dashboard")}</Link>
            </div>
          </div>

          <div className="footer-column">
            <h4>{t("landing.access")}</h4>
            <div className="footer-links">
              <SignedOut>
                {clerkEnabled ? (
                  <>
                    <SignInButton
                      mode="modal"
                      forceRedirectUrl="/onboarding"
                      signUpForceRedirectUrl="/onboarding"
                    >
                      <button type="button">{t("menu.signIn")}</button>
                    </SignInButton>
                    <SignInButton
                      mode="modal"
                      forceRedirectUrl="/onboarding"
                      signUpForceRedirectUrl="/onboarding"
                    >
                      <button type="button">{t("menu.createAccount")}</button>
                    </SignInButton>
                  </>
                ) : (
                  <Link href="/boards">{t("menu.boards")}</Link>
                )}
                <Link href="/onboarding">{t("menu.onboarding")}</Link>
              </SignedOut>
              <SignedIn>
                <Link href="/boards">{t("menu.openBoards")}</Link>
                <Link href="/boards/new">{t("menu.createBoard")}</Link>
                <Link href="/dashboard">{t("menu.dashboard")}</Link>
              </SignedIn>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-copyright">
            © {new Date().getFullYear()} {t("landing.copyright")}
          </div>
          <div className="footer-bottom-links">
            <Link href="#capabilities">{t("landing.capabilities")}</Link>
            <Link href="/boards">{t("menu.boards")}</Link>
            <Link href="/activity">{t("menu.activity")}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
