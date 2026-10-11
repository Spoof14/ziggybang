import { describe, expect, it } from "vitest";
import { isDeskSize } from "./layout";

describe("desk layout size", () => {
  it("needs both width and height (browser zoom shrinks both)", () => {
    expect(isDeskSize(1440, 900)).toBe(true);
    expect(isDeskSize(1024, 540)).toBe(true);
    expect(isDeskSize(1280, 320)).toBe(false); // short window
    expect(isDeskSize(960, 600)).toBe(false); // 200% zoom of a 1920 window
    expect(isDeskSize(512, 320)).toBe(false);
  });
});
