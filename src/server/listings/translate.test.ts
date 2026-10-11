import { describe, expect, it } from "vitest";
import { hasHangul } from "~/lib/listings/foreigner";
import { translateListingBundle, translateListingNotes, translateListingTitle } from "./translate";

describe("listing note translation", () => {
  it("skips the model when the text is already English", async () => {
    const result = await translateListingNotes("Newly built flat near Hongdae");
    expect(result).toEqual({
      english: "Newly built flat near Hongdae",
      source: "original",
    });
    expect(hasHangul("Newly built")).toBe(false);
    expect(hasHangul("외국인환영")).toBe(true);
  });

  it("does not invent English when there is no OpenAI key", async () => {
    const result = await translateListingNotes("전입신고 가능, 외국인환영");
    if (!process.env.OPENAI_API_KEY) {
      expect(result).toEqual({ english: null, source: "none" });
    } else {
      expect(result.source).toBe("openai");
      expect(result.english).toBeTruthy();
    }
  });

  it("title: original when English, none (fall back to original) without a key", async () => {
    expect(await translateListingTitle("Bright 2-room")).toEqual({ english: "Bright 2-room", source: "original" });
    if (!process.env.OPENAI_API_KEY) {
      expect(await translateListingTitle("서교동 투룸, 넓고 채광도 좋아요")).toEqual({ english: null, source: "none" });
    }
  });

  it("bundle: English text passes through with its title", async () => {
    expect(await translateListingBundle("Bright", "Quiet place")).toEqual({
      english: "Quiet place",
      source: "original",
      englishTitle: "Bright",
    });
  });
});
