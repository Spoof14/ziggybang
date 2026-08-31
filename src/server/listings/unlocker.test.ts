import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpError } from "./http";
import { buildUnlockerRequest, fetchJsonViaUnlocker } from "./unlocker";

type SeenRequest = {
  authorization?: string;
  body: Record<string, unknown>;
};

describe("Web Unlocker transport", () => {
  const seen: SeenRequest[] = [];
  let server: http.Server;
  let endpoint: string;

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      let raw = "";
      request.on("data", (chunk: Buffer) => (raw += chunk.toString()));
      request.on("end", () => {
        const body = JSON.parse(raw) as Record<string, unknown>;
        seen.push({ authorization: request.headers.authorization, body });
        if (request.headers.authorization !== "Bearer test-key") {
          response.statusCode = 401;
          response.end("{}");
          return;
        }
        response.setHeader("content-type", "text/plain");
        if (body.url === "https://m.land.naver.com/not-json") {
          response.end("<html>blocked page</html>");
          return;
        }
        // format:"raw" returns the target's body verbatim.
        response.end(JSON.stringify({ body: [{ atclNo: "1" }] }));
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    endpoint = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(() => resolve(null)));
  });

  it("targets the Bright Data endpoint with zone, country kr, and raw format", () => {
    const { url, init } = buildUnlockerRequest("https://m.land.naver.com/x", {
      apiKey: "k",
    });
    expect(url).toBe("https://api.brightdata.com/request");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      zone: "web_unlocker1",
      url: "https://m.land.naver.com/x",
      format: "raw",
      country: "kr",
    });
    const custom = buildUnlockerRequest("https://m.land.naver.com/x", {
      apiKey: "k",
      zone: "my_zone",
    });
    expect(JSON.parse(String(custom.init.body))).toMatchObject({ zone: "my_zone" });
  });

  it("forwards target headers for zones with custom headers enabled", () => {
    const { init } = buildUnlockerRequest(
      "https://m.land.naver.com/x",
      { apiKey: "k" },
      { referer: "https://m.land.naver.com/" },
    );
    const body = JSON.parse(String(init.body)) as { headers?: Record<string, string> };
    expect(body.headers?.referer).toBe("https://m.land.naver.com/");
    const bare = buildUnlockerRequest("https://m.land.naver.com/x", { apiKey: "k" });
    expect(JSON.parse(String(bare.init.body))).not.toHaveProperty("headers");
  });

  it("returns the target JSON through the unlocker endpoint", async () => {
    const result = await fetchJsonViaUnlocker<{ body: Array<{ atclNo: string }> }>(
      "https://m.land.naver.com/cluster/ajax/articleList?page=1",
      3000,
      { apiKey: "test-key", endpoint },
    );
    expect(result.body[0]?.atclNo).toBe("1");
    const last = seen[seen.length - 1]!;
    expect(last.authorization).toBe("Bearer test-key");
    expect(last.body.url).toBe("https://m.land.naver.com/cluster/ajax/articleList?page=1");
    expect(last.body.country).toBe("kr");
  });

  it("fails with a clear error on bad credentials or non-JSON bodies", async () => {
    await expect(
      fetchJsonViaUnlocker("https://m.land.naver.com/x", 3000, {
        apiKey: "wrong-key",
        endpoint,
      }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      fetchJsonViaUnlocker("https://m.land.naver.com/not-json", 3000, {
        apiKey: "test-key",
        endpoint,
      }),
    ).rejects.toThrow(/non-JSON/);
    await expect(
      fetchJsonViaUnlocker("https://m.land.naver.com/x", 3000, undefined),
    ).rejects.toThrow(HttpError);
  });
});
