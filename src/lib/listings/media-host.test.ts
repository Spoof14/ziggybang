import { describe, expect, it } from "vitest";
import { isAllowedMediaUrl } from "./media-host";

const ok = (u: string) => isAllowedMediaUrl(new URL(u));

describe("media proxy allowlist", () => {
  it("allows listing photo CDNs including realty.asil.kr", () => {
    expect(ok("https://realty.asil.kr/photo/1.jpg")).toBe(true);
    expect(ok("https://ic.zigbang.com/a.jpg")).toBe(true);
    expect(ok("https://landthumb-phinf.pstatic.net/x.jpg")).toBe(true);
  });
  it("keeps SSRF protections", () => {
    expect(ok("http://realty.asil.kr/1.jpg")).toBe(false);
    expect(ok("https://asil.kr/1.jpg")).toBe(false);
    expect(ok("https://evil.com/realty.asil.kr/1.jpg")).toBe(false);
    expect(ok("https://realty.asil.kr.evil.com/1.jpg")).toBe(false);
    expect(ok("https://user:pw@realty.asil.kr/1.jpg")).toBe(false);
    expect(ok("https://realty.asil.kr:8443/1.jpg")).toBe(false);
    expect(ok("https://127.0.0.1/1.jpg")).toBe(false);
    expect(ok("https://[::1]/1.jpg")).toBe(false);
    expect(ok("https://169.254.169.254/latest")).toBe(false);
  });
});
