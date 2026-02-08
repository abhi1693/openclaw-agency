describe("Organizations (PR #61)", () => {
  const email = Cypress.env("CLERK_TEST_EMAIL") || "jane+clerk_test@example.com";

  beforeEach(() => {
    // Story: user signs in via official Clerk Cypress commands.
    cy.visit("/sign-in");
    cy.clerkLoaded();
    cy.clerkSignIn({ strategy: "email_code", identifier: email });
  });

  it("signed-in user can open /organization (and non-admin cannot invite)", () => {
    // Story (negative): a signed-in non-admin should not be able to invite members.
    // (CI test user may not be an org admin.)
    cy.visit("/organization");

    cy.contains(/members\s*&\s*invites/i, { timeout: 30_000 }).should("be.visible");

    cy.contains("button", /invite member/i)
      .should("be.visible")
      .should("be.disabled")
      .and("have.attr", "title")
      .and("match", /only organization admins can invite/i);
  });
});
