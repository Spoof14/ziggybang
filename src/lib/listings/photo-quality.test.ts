import { describe, expect, it } from "vitest";
import { analyzePixels } from "./photo-quality";

function fill(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number],
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe("listing photo quality", () => {
  it("scores a bright detailed interior higher than a dark muddy frame", () => {
    const bright = analyzePixels(
      64,
      64,
      fill(64, 64, (x, y) => {
        const stripe = (x + y) % 6 === 0;
        return stripe ? [210, 180, 140] : [170, 150, 130];
      }),
      640,
      480,
    );
    const dark = analyzePixels(
      64,
      64,
      fill(64, 64, () => [12, 10, 9]),
      640,
      480,
    );
    expect(bright.score).toBeGreaterThan(dark.score);
    expect(bright.likelyDim).toBe(false);
    expect(dark.likelyDim).toBe(true);
    expect(dark.summary).toMatch(/dark/i);
  });

  it("flags a white high-contrast floorplan", () => {
    const plan = analyzePixels(
      64,
      64,
      fill(64, 64, (x, y) => {
        const line = x % 16 === 0 || y % 16 === 0;
        return line ? [20, 20, 20] : [250, 250, 250];
      }),
      400,
      400,
    );
    expect(plan.likelyFloorplan).toBe(true);
    expect(plan.summary).toMatch(/floorplan/i);
    expect(plan.score).toBeLessThan(70);
  });
});
