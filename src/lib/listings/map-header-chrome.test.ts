import { describe, expect, it } from "vitest";
import {
  FILTER_TOGGLE_ATTR,
  HEADER_PANEL_ATTR,
  HEADER_STICKY_ATTR,
  MOBILE_CHROME_ATTR,
} from "./map-header-chrome";

describe("map header chrome markers", () => {
  it("uses stable data attributes for sticky filters UX", () => {
    expect(HEADER_PANEL_ATTR).toBe("data-header-panel");
    expect(HEADER_STICKY_ATTR).toBe("data-header-sticky");
    expect(FILTER_TOGGLE_ATTR).toBe("data-filter-toggle");
    expect(MOBILE_CHROME_ATTR).toBe("data-mobile-chrome");
  });
});