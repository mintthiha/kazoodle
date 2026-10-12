import { describe, expect, it } from "vitest";
import { endReasonKey } from "./endReason";

describe("endReasonKey", () => {
  it("explains the reasons a round can be abandoned", () => {
    expect(endReasonKey("imposter_left")).toBe("gameEnd.imposter_left");
    expect(endReasonKey("player_left")).toBe("gameEnd.player_left");
  });

  it("says nothing about a round that simply finished", () => {
    // Someone tapped "play again"; the lobby speaks for itself.
    expect(endReasonKey("finished")).toBeNull();
  });

  it("falls back to a generic line for a reason this build doesn't know", () => {
    // A newer server may define its own reasons. Jumping back to the lobby
    // with no explanation is the one outcome worth avoiding.
    expect(endReasonKey("host_ended")).toBe("gameEnd.generic");
    expect(endReasonKey("something_invented_later")).toBe("gameEnd.generic");
  });
});
