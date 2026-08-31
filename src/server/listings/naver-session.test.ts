import { describe, expect, it } from "vitest";
import {
  cookieHeaderFromSetCookie,
  extractNaverToken,
} from "./naver-session";

const SAMPLE_HTML = `<!doctype html><html><script>window.App={"state":{"user":{"isLogin":false}},"token":{"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IlJFQUxFU1RBVEUiLCJpYXQiOjE3ODgxNzcxNzMsImV4cCI6MTc4ODE4Nzk3M30.signature"}};</script></html>`;

describe("naver session helpers", () => {
  it("extracts the JWT from window.App token state", () => {
    expect(extractNaverToken(SAMPLE_HTML)).toBe(
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IlJFQUxFU1RBVEUiLCJpYXQiOjE3ODgxNzcxNzMsImV4cCI6MTc4ODE4Nzk3M30.signature",
    );
  });

  it("returns undefined when the page has no token", () => {
    expect(extractNaverToken("<html>nope</html>")).toBeUndefined();
  });

  it("joins Set-Cookie name/value pairs into a Cookie header", () => {
    expect(
      cookieHeaderFromSetCookie([
        "REALESTATE=abc; Path=/",
        "PROP_TEST_ID=xyz; Domain=.land.naver.com; Path=/",
      ]),
    ).toBe("REALESTATE=abc; PROP_TEST_ID=xyz");
  });
});
