import { describe, expect, it } from "vitest";
import { cached, clearListingCache } from "./cache";

describe("listing cache", () => {
  it("reuses in-flight and cached values", async () => {
    clearListingCache();
    let calls = 0;
    const load = () =>
      cached("tile:a", 5_000, async () => {
        calls += 1;
        return "value";
      });

    const [first, second] = await Promise.all([load(), load()]);
    const third = await load();

    expect(first).toBe("value");
    expect(second).toBe("value");
    expect(third).toBe("value");
    expect(calls).toBe(1);
  });
});
