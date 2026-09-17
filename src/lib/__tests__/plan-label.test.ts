import { describe, it, expect } from "vitest";
import { planLabel } from "@/lib/plan-label";

// The pricing cards double as the plan manager: "Manage Plan" on the dashboard
// lands here, so a subscriber has to see which plan is theirs and which way each
// other card moves them.
describe("planLabel", () => {
  it("invites a signed-out visitor to start", () => {
    expect(planLabel("starter", "free", false)).toBe("Get Started");
    expect(planLabel("premium", "free", false)).toBe("Get Started");
  });

  it("still says Get Started for a free account", () => {
    expect(planLabel("pro", "free", true)).toBe("Get Started");
  });

  it("marks the plan the subscriber is on", () => {
    expect(planLabel("pro", "pro", true)).toBe("Your current plan");
  });

  it("calls a more expensive plan an upgrade", () => {
    expect(planLabel("premium", "starter", true)).toBe("Upgrade to Premium");
    expect(planLabel("pro", "starter", true)).toBe("Upgrade to Pro");
  });

  it("calls a cheaper plan a switch, never an upgrade", () => {
    expect(planLabel("starter", "premium", true)).toBe("Switch to Starter");
    expect(planLabel("pro", "premium", true)).toBe("Switch to Pro");
  });
});
