/// <reference types="cypress" />

describe("/activity feed", () => {
  const apiBase = "**/api/v1";

  function stubStreamEmpty() {
    // Return a minimal SSE response that ends immediately.
    cy.intercept("GET", `${apiBase}/activity/task-comments/stream*`, {
      statusCode: 200,
      headers: {
        "content-type": "text/event-stream",
      },
      body: "",
    }).as("activityStream");
  }

  function signInViaClerk() {
    // The /activity page is gated by <SignedIn/> when Clerk is enabled.
    // This flow automates Clerk's modal sign-in.
    cy.contains("button", /sign in/i, { timeout: 20_000 }).click();

    // Clerk typically uses `name=identifier` for the email field.
    cy.get(
      'input[name="identifier"], input[type="email"], input[autocomplete="email"]',
      {
        timeout: 20_000,
      },
    )
      .first()
      .clear()
      .type("jane+clerk_test@example.com");

    cy.contains("button", /continue|sign in/i, { timeout: 20_000 }).click();

    // OTP step: Clerk uses a code input (often `name=code`).
    cy.get(
      'input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]',
      {
        timeout: 20_000,
      },
    )
      .first()
      .clear()
      .type("424242");

    cy.contains("button", /continue|verify|sign in/i, {
      timeout: 20_000,
    }).click();

    // After successful sign-in, the main UI should be visible.
    cy.contains(/live feed/i, { timeout: 30_000 }).should("be.visible");
  }

  it("happy path: renders task comment cards", () => {
    cy.intercept("GET", `${apiBase}/activity/task-comments*`, {
      statusCode: 200,
      body: {
        items: [
          {
            id: "c1",
            message: "Hello world",
            agent_name: "Kunal",
            agent_role: "QA 2",
            board_id: "b1",
            board_name: "Testing",
            task_id: "t1",
            task_title: "CI hardening",
            created_at: "2026-02-07T00:00:00Z",
          },
          {
            id: "c2",
            message: "Second comment",
            agent_name: "Riya",
            agent_role: "QA",
            board_id: "b1",
            board_name: "Testing",
            task_id: "t2",
            task_title: "Coverage policy",
            created_at: "2026-02-07T00:01:00Z",
          },
        ],
      },
    }).as("activityList");

    stubStreamEmpty();

    cy.visit("/activity", {
      onBeforeLoad(win: Window) {
        win.localStorage.clear();
      },
    });

    signInViaClerk();

    cy.wait("@activityList");
    cy.contains("CI hardening").should("be.visible");
    cy.contains("Coverage policy").should("be.visible");
    cy.contains("Hello world").should("be.visible");
  });

  it("empty state: shows waiting message when no items", () => {
    cy.intercept("GET", `${apiBase}/activity/task-comments*`, {
      statusCode: 200,
      body: { items: [] },
    }).as("activityList");

    stubStreamEmpty();

    cy.visit("/activity");
    signInViaClerk();
    cy.wait("@activityList");

    cy.contains(/waiting for new comments/i).should("be.visible");
  });

  it("error state: shows failure UI when API errors", () => {
    cy.intercept("GET", `${apiBase}/activity/task-comments*`, {
      statusCode: 500,
      body: { detail: "boom" },
    }).as("activityList");

    stubStreamEmpty();

    cy.visit("/activity");
    signInViaClerk();
    cy.wait("@activityList");

    // UI uses query.error.message or fallback.
    cy.contains(/unable to load feed|boom/i).should("be.visible");
  });
});
