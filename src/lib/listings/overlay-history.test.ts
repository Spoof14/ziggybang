import { describe, expect, it } from "vitest";
import {
  listingSheetInHistory,
  listingSheetSyncAction,
  withListingSheet,
} from "./overlay-history";

describe("listing sheet history", () => {
  it("pushes when the popup opens and backs when it closes", () => {
    expect(listingSheetSyncAction(false, true)).toBe("push");
    expect(listingSheetSyncAction(true, true)).toBe("none");
    expect(listingSheetSyncAction(true, false)).toBe("back");
    expect(listingSheetSyncAction(false, false)).toBe("none");
  });

  it("keeps other history.state fields when tagging the popup", () => {
    const next = withListingSheet({ idx: 3 }, true);
    expect(listingSheetInHistory(next)).toBe(true);
    expect(next).toMatchObject({ idx: 3 });
    expect(listingSheetInHistory(withListingSheet(next, false))).toBe(false);
  });
});
