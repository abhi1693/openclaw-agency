"use client";

import Link from "next/link";

import {
  SignInButton,
  SignedIn,
  SignedOut,
  isClerkEnabled,
} from "@/auth/clerk";

import { useLanguage } from "@/lib/i18n";
import { t } from "@/lib/translations";

const ArrowIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M6 12L10 8L6 4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function LandingHero() {
  const clerkEnabled = isClerkEnabled();
  const { language } = useLanguage();

  const FEATURES = [
    t(language, "landing_feature_1_title"),
    t(language, "landing_feature_2_title"),
    t(language, "landing_feature_3_title"),
  ];

  const FEATURE_CARDS = [
    { title: t(language, "feat_boards_title"), description: t(language, "feat_boards_desc") },
    { title: t(language, "feat_approvals_title"), description: t(language, "feat_approvals_desc") },
    { title: t(language, "feat_signals_title"), description: t(language, "feat_signals_desc") },
    { title: t(language, "feat_audit_title"), description: t(language, "feat_audit_desc") },
  ];

  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <div className="hero-label">{t(language, "landing_label")}</div>
          <h1>
            {t(language, "landing_h1_1")}
            <span className="hero-highlight">{t(language, "landing_h1_highlight")}</span>
            <br />
            {t(language, "landing_h1_2")}
          </h1>
          <p>{t(language, "landing_p")}</p>

          <div className="hero-actions">
            <SignedOut>
              {clerkEnabled ? (
                <>
                  <SignInButton
                    mode="modal"
                    forceRedirectUrl="/boards"
                    signUpForceRedirectUrl="/boards"
                  >
                    <button type="button" className="btn-large primary">
                      {t(language, "landing_open_boards")} <ArrowIcon />
                    </button>
                  </SignInButton>
                  <SignInButton
                    mode="modal"
                    forceRedirectUrl="/boards/new"
                    signUpForceRedirectUrl="/boards/new"
                  >
                    <button type="button" className="btn-large secondary">
                      {t(language, "landing_create_board")}
                    </button>
                  </SignInButton>
                </>
              ) : (
                <>
                  <Link href="/boards" className="btn-large primary">
                    {t(language, "landing_open_boards")} <ArrowIcon />
                  </Link>
                  <Link href="/boards/new" className="btn-large secondary">
                    {t(language, "landing_create_board")}
                  </Link>
                </>
              )}
            </SignedOut>

            <SignedIn>
              <Link href="/boards" className="btn-large primary">
                {t(language, "landing_open_boards")} <ArrowIcon />
              </Link>
              <Link href="/boards/new" className="btn-large secondary">
                {t(language, "landing_create_board")}
              </Link>
            </SignedIn>
          </div>

          <div className="hero-features">
            {FEATURES.map((label) => (
              <div key={label} className="hero-feature">
                <div className="feature-icon">✓</div>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="command-surface">
          <div className="surface-header">
            <div className="surface-title">{t(language, "landing_cmd_surface")}</div>
            <div className="live-indicator">
              <div className="live-dot" />
              {t(language, "landing_live")}
            </div>
          </div>
          <div className="surface-subtitle">
            <h3>{t(language, "landing_ship")}</h3>
            <p>{t(language, "landing_ship_p")}</p>
          </div>
          <div className="metrics-row">
            {[
              { label: t(language, "boards"), value: "12" },
              { label: t(language, "agents"), value: "08" },
              { label: language === "zh" ? "任务" : "Tasks", value: "46" },
            ].map((item) => (
              <div key={item.label} className="metric">
                <div className="metric-value">{item.value}</div>
                <div className="metric-label">{item.label}</div>
              </div>
            ))}
          </div>
          <div className="surface-content">
            <div className="content-section">
              <h4>{t(language, "landing_board_in_progress")}</h4>
              {[
                language === "zh" ? "准备候选发布版本" : "Cut release candidate",
                language === "zh" ? "处理审批积压" : "Triage approvals backlog",
                language === "zh" ? "稳定 Agent 交接流程" : "Stabilize agent handoffs",
              ].map((title) => (
                <div key={title} className="status-item">
                  <div className="status-icon progress">⊙</div>
                  <div className="status-item-content">
                    <div className="status-item-title">{title}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="content-section">
              <h4>{t(language, "landing_approvals_pending")}</h4>
              {[
                { title: language === "zh" ? "部署窗口已确认" : "Deploy window confirmed", status: "ready" as const },
                { title: language === "zh" ? "文案已审核" : "Copy reviewed", status: "waiting" as const },
                { title: language === "zh" ? "安全签字" : "Security sign-off", status: "waiting" as const },
              ].map((item) => (
                <div key={item.title} className="approval-item">
                  <div className="approval-title">{item.title}</div>
                  <div className={`approval-badge ${item.status}`}>
                    {item.status}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              padding: "2rem",
              borderTop: "1px solid var(--neutral-200)",
            }}
          >
            <div className="content-section">
              <h4>{t(language, "landing_signals")}</h4>
              {[
                { text: language === "zh" ? "Agent Delta 将任务移入审核" : "Agent Delta moved task to review", time: language === "zh" ? "刚刚" : "Now" },
                { text: language === "zh" ? "Growth Ops 触及 WIP 上限" : "Growth Ops hit WIP limit", time: "5m" },
                { text: language === "zh" ? "发布流水线已稳定" : "Release pipeline stabilized", time: "12m" },
              ].map((signal) => (
                <div key={signal.text} className="signal-item">
                  <div className="signal-text">{signal.text}</div>
                  <div className="signal-time">{signal.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="features-section" id="capabilities">
        <div className="features-grid">
          {FEATURE_CARDS.map((feature, idx) => (
            <div key={feature.title} className="feature-card">
              <div className="feature-number">
                {String(idx + 1).padStart(2, "0")}
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-content">
          <h2>{t(language, "landing_cta_h2")}</h2>
          <p>{t(language, "landing_cta_p")}</p>
          <div className="cta-actions">
            <SignedOut>
              {clerkEnabled ? (
                <>
                  <SignInButton
                    mode="modal"
                    forceRedirectUrl="/boards/new"
                    signUpForceRedirectUrl="/boards/new"
                  >
                    <button type="button" className="btn-large white">
                      {t(language, "landing_create_board")}
                    </button>
                  </SignInButton>
                  <SignInButton
                    mode="modal"
                    forceRedirectUrl="/boards"
                    signUpForceRedirectUrl="/boards"
                  >
                    <button type="button" className="btn-large outline">
                      {t(language, "landing_view_boards")}
                    </button>
                  </SignInButton>
                </>
              ) : (
                <>
                  <Link href="/boards/new" className="btn-large white">
                    {t(language, "landing_create_board")}
                  </Link>
                  <Link href="/boards" className="btn-large outline">
                    {t(language, "landing_view_boards")}
                  </Link>
                </>
              )}
            </SignedOut>

            <SignedIn>
              <Link href="/boards/new" className="btn-large white">
                {t(language, "landing_create_board")}
              </Link>
              <Link href="/boards" className="btn-large outline">
                {t(language, "landing_view_boards")}
              </Link>
            </SignedIn>
          </div>
        </div>
      </section>
    </>
  );
}
