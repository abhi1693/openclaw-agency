/// <reference types="cypress" />

describe("/boards/:id task board", () => {
  const apiBase = "**/api/v1";
  const email = Cypress.env("CLERK_TEST_EMAIL") || "jane+clerk_test@example.com";

  const originalDefaultCommandTimeout = Cypress.config("defaultCommandTimeout");

  beforeEach(() => {
    Cypress.config("defaultCommandTimeout", 20_000);
  });

  afterEach(() => {
    Cypress.config("defaultCommandTimeout", originalDefaultCommandTimeout);
  });

  function stubEmptySse() {
    // Any SSE endpoint should not hang the UI in tests.
    cy.intercept("GET", `${apiBase}/**/stream*`, {
      statusCode: 200,
      headers: { "content-type": "text/event-stream" },
      body: "",
    });
  }

  it("auth negative: signed-out user is redirected to sign-in", () => {
    cy.visit("/boards/b1");
    cy.location("pathname", { timeout: 30_000 }).should("match", /\/sign-in/);
  });

  it("happy path: renders tasks from snapshot and can create a task (stubbed)", () => {
    stubEmptySse();

    cy.intercept("GET", `${apiBase}/boards/b1/snapshot*`, {
      statusCode: 200,
      body: {
        board: {
          id: "b1",
          name: "Demo Board",
          slug: "demo-board",
          description: "Demo",
          gateway_id: "g1",
          board_group_id: null,
          board_type: "general",
          objective: null,
          success_metrics: null,
          target_date: null,
          goal_confirmed: true,
          goal_source: "test",
          organization_id: "o1",
          created_at: "2026-02-11T00:00:00Z",
          updated_at: "2026-02-11T00:00:00Z",
        },
        tasks: [
          {
            id: "t1",
            board_id: "b1",
            title: "Inbox task",
            description: "",
            status: "inbox",
            priority: "medium",
            due_at: null,
            assigned_agent_id: null,
            depends_on_task_ids: [],
            created_by_user_id: null,
            in_progress_at: null,
            created_at: "2026-02-11T00:00:00Z",
            updated_at: "2026-02-11T00:00:00Z",
            blocked_by_task_ids: [],
            is_blocked: false,
            assignee: null,
            approvals_count: 0,
            approvals_pending_count: 0,
          },
        ],
        agents: [],
        approvals: [],
        chat_messages: [],
        pending_approvals_count: 0,
      },
    }).as("snapshot");

    cy.intercept("GET", `${apiBase}/boards/b1/group-snapshot*`, {
      statusCode: 200,
      body: { group: null, boards: [] },
    });

    cy.intercept("POST", `${apiBase}/boards/b1/tasks`, (req) => {
      // Minimal assertion the UI sends expected fields.
      expect(req.body).to.have.property("title");
      req.reply({
        statusCode: 200,
        body: {
          id: "t2",
          board_id: "b1",
          title: req.body.title,
          description: req.body.description ?? "",
          status: "inbox",
          priority: req.body.priority ?? "medium",
          due_at: null,
          assigned_agent_id: null,
          depends_on_task_ids: [],
          created_by_user_id: null,
          in_progress_at: null,
          created_at: "2026-02-11T00:00:00Z",
          updated_at: "2026-02-11T00:00:00Z",
          blocked_by_task_ids: [],
          is_blocked: false,
          assignee: null,
          approvals_count: 0,
          approvals_pending_count: 0,
        },
      });
    }).as("createTask");

    cy.visit("/sign-in");
    cy.clerkLoaded();
    cy.clerkSignIn({ strategy: "email_code", identifier: email });

    cy.visit("/boards/b1");
    cy.waitForAppLoaded();

    cy.wait(["@snapshot"]);

    // Existing task visible.
    cy.contains("Inbox task").should("be.visible");

    // Open create task flow.
    cy.contains("button", /create task|new task|add task|\+/i)
      .first()
      .click({ force: true });

    cy.get("input").filter('[placeholder*="Title"], [name*="title"], [id*="title"], input[type="text"]').first().type("New task");

    cy.contains("button", /create|save|add/i).click({ force: true });
    cy.wait(["@createTask"]);

    cy.contains("New task").should("be.visible");
  });
});
