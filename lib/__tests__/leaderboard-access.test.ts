import { describe, it, expect } from "vitest";
import { canSeePrizePoolCard } from "@/lib/leaderboard-access";

describe("canSeePrizePoolCard", () => {
  it("shows the card when the player has paid access", () => {
    expect(canSeePrizePoolCard({ can_access_paid: true })).toBe(true);
  });

  it("hides the card when the player has no paid access", () => {
    expect(canSeePrizePoolCard({ can_access_paid: false })).toBe(false);
    expect(canSeePrizePoolCard({})).toBe(false);
  });

  it("hides the card when the player hasn't resolved yet (fail-closed)", () => {
    expect(canSeePrizePoolCard(null)).toBe(false);
    expect(canSeePrizePoolCard(undefined)).toBe(false);
  });
});
