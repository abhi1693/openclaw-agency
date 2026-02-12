/// <reference types="cypress" />

describe("/activity feed", () => {
  const apiBase = "**/api/v1";
  const email = Cypress.env("CLERK_TEST_EMAIL") || "jane+clerk_test@example.com";

  const originalDefaultCommandTimeout = Cypress.config("defaultCommandTimeout");

  beforeEach(() => {
    // Clerk's Cypress helpers perform async work inside `cy.then()`.
    // CI can be slow enough that the default 4s command timeout flakes.
    Cypress.config("defaultCommandTimeout", 20_000);
  });

  afterEach(() => {
    Cypress.config("defaultCommandTimeout", originalDefaultCommandTimeout);
  });

  function stubStreamsEmpty() {
    // The activity page connects multiple SSE streams (tasks/approvals/agents/board memory).
    // In E2E we keep them empty to avoid flake and keep assertions deterministic.
    const emptySse = {
      statusCode: 200,
      headers: { "content-type": "text/event-stream" },
      body: "",
    };

    cy.intercept("GET", `${apiBase}/boards/*/tasks/stream*`, emptySse).as(
      "tasksStream",
    );
    cy.intercept("GET", `${apiBase}/boards/*/approvals/stream*`, emptySse).as(
      "approvalsStream",
    );
    cy.intercept("GET", `${apiBase}/boards/*/memory/stream*`, emptySse).as(
      "memoryStream",
    );
    cy.intercept("GET", `${apiBase}/agents/stream*`, emptySse).as("agentsStream");
  }

  function assertSignedInAndLanded() {
    cy.waitForAppLoaded();
    cy.contains(/live feed/i).should("be.visible");
  }

  it("auth negative: signed-out user is redirected to sign-in", () => {
    // SignedOutPanel runs in redirect mode on this page.
    cy.visit("/activity");
    cy.location("pathname", { timeout: 20_000 }).should("match", /\/sign-in/);
  });

  it("happy path: renders task comment cards", () => {
    cy.intercept("GET", "**/api/v1/activity**", {
      statusCode: 200,
      body: {
        items: [
          {
            id: "e1",
            event_type: "task.comment",
            message: "Hello world",
            agent_id: null,
            agent_name: "Kunal",
            created_at: "2026-02-07T00:00:00Z",
            task_id: "t1",
            task_title: "CI hardening",
            agent_role: "QA 2",
          },
        ],
      },
    }).as("activityList");

    stubStreamsEmpty();

    cy.visit("/sign-in");
    cy.clerkLoaded();
    cy.clerkSignIn({ strategy: "email_code", identifier: email });

    cy.visit("/activity");
    assertSignedInAndLanded();
    cy.wait("@activityList", { timeout: 20_000 });

    // The Activity page lists generic activity events; task title enrichment is best-effort.
    // When the task metadata isn't available yet, it renders as "Unknown task".
    cy.contains(/unknown task/i).should("be.visible");
    cy.contains(/hello world/i).should("be.visible");
  });

  it("empty state: shows waiting message when no items", () => {
    cy.intercept("GET", "**/api/v1/activity**", {
      statusCode: 200,
      body: { items: [] },
    }).as("activityList");

    stubStreamsEmpty();

    cy.visit("/sign-in");
    cy.clerkLoaded();
    cy.clerkSignIn({ strategy: "email_code", identifier: email });

    cy.visit("/activity");
    assertSignedInAndLanded();
    cy.wait("@activityList", { timeout: 20_000 });

    cy.contains(/waiting for new activity/i).should("be.visible");
  });

  it("error state: shows failure UI when API errors", () => {
    cy.intercept("GET", "**/api/v1/activity**", {
      statusCode: 500,
      body: { detail: "boom" },
    }).as("activityList");

    stubStreamsEmpty();

    cy.visit("/sign-in");
    cy.clerkLoaded();
    cy.clerkSignIn({ strategy: "email_code", identifier: email });

    cy.visit("/activity");
    assertSignedInAndLanded();
    cy.wait("@activityList", { timeout: 20_000 });

    cy.contains(/unable to load activity feed/i).should("be.visible");
  });
});
