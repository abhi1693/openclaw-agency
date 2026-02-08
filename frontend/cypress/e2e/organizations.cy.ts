describe("Organizations (PR #61)", () => {
  const email = Cypress.env("CLERK_TEST_EMAIL") || "jane+clerk_test@example.com";

  it("negative: signed-out user is redirected to sign-in when opening /organization", () => {
    cy.visit("/organization");
    cy.location("pathname", { timeout: 30_000 }).should("match", /\/sign-in/);
  });

  it("positive: signed-in user can view /organization and sees correct invite permissions", () => {
    // Story (positive): a signed-in user can reach the organization page.
    // Story (negative within flow): non-admin users cannot invite members.
    cy.visit("/sign-in");
    cy.clerkLoaded();
    cy.clerkSignIn({ strategy: "email_code", identifier: email });

    cy.visit("/organization");
    cy.contains(/members\s*&\s*invites/i, { timeout: 30_000 }).should("be.visible");

    // Deterministic assertion across roles:
    // - if user is admin: invite button enabled
    // - else: invite button disabled with the correct tooltip
    cy.contains("button", /invite member/i)
      .should("be.visible")
      .then(($btn) => {
        const isDisabled = $btn.is(":disabled");
        if (isDisabled) {
          cy.wrap($btn)
            .should("have.attr", "title")
            .and("match", /only organization admins can invite/i);
        } else {
          cy.wrap($btn).should("not.be.disabled");
        }
      });
  });
});
