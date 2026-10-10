import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAskSession, saveAskSession, type AskStoredResult } from "./ask-session";

const result = {
  status: "ok",
  picks: [{ rank: 1, listing: { id: "zigbang:oneroom:1" }, reason: "r", reasonSource: "ai" }],
  summary: "s",
  assumptions: [],
  constraints: { maxRent: 70 },
  provider: "openai",
  candidateCount: 12,
  radiusM: 800,
  widened: false,
  sourceErrors: [],
  elapsedMs: 10,
} as unknown as AskStoredResult;

describe("ask session persistence", () => {
  const data = new Map<string, string>();
  beforeEach(() => {
    data.clear();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("restores the last result after close/reopen", () => {
    saveAskSession({ messages: [{ role: "user", content: "studio" }], constraints: { maxRent: 70 }, result });
    const restored = loadAskSession();
    expect(restored?.result?.status).toBe("ok");
    expect(restored?.constraints).toEqual({ maxRent: 70 });
    expect(restored?.messages).toHaveLength(1);
  });
  it("clears on empty session and ignores corrupt data", () => {
    saveAskSession({ messages: [], constraints: null, result });
    saveAskSession(null);
    expect(loadAskSession()).toBeNull();
    data.set("ziggybang:ask:v1", "{not json");
    expect(loadAskSession()).toBeNull();
    data.set("ziggybang:ask:v1", JSON.stringify({ result: { status: "ok", picks: [{}] } }));
    expect(loadAskSession()).toBeNull();
  });
});
