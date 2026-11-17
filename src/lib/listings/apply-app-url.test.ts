import { describe, expect, it } from "vitest";
import { parseAppUrlPatch } from "./apply-app-url";

describe("apply app url patch", () => {
  it("maps URL params into a patch MapApp can apply", () => {
    const patch = parseAppUrlPatch(
      "?q=itaewon&view=list&src=naver&type=oneroom&sale=jeonse&lat=37.5345&lng=126.9947&z=15&ok=1",
    );
    expect(patch.searchInput).toBe("itaewon");
    expect(patch.viewMode).toBe("list");
    expect(patch.sources).toEqual(["naver"]);
    expect(patch.propertyTypes).toEqual(["oneroom"]);
    expect(patch.salesTypes).toEqual(["jeonse"]);
    expect(patch.view?.zoom).toBe(15);
    expect(patch.foreignerOk).toBe(true);
  });
});