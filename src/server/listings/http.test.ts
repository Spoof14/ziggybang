import http from "node:http";
import net from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchJson, fetchText, proxyDispatcher } from "./http";

type TestProxy = {
  url: string;
  tunneled: string[];
  close: () => Promise<void>;
};

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });
}

/** Minimal HTTP CONNECT proxy, enough for undici's ProxyAgent to tunnel through. */
async function startProxy(): Promise<TestProxy> {
  const tunneled: string[] = [];
  const server = http.createServer();
  server.on("connect", (request, clientSocket, head) => {
    tunneled.push(request.url ?? "");
    const [host, port] = (request.url ?? "").split(":");
    const upstream = net.connect(Number(port ?? 80), host, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => upstream.destroy());
  });
  const port = await listen(server);
  return {
    url: `http://127.0.0.1:${port}`,
    tunneled,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

describe("proxied fetchJson", () => {
  let proxy: TestProxy;
  let target: http.Server;
  let targetPort: number;
  let directHits = 0;

  beforeAll(async () => {
    proxy = await startProxy();
    target = http.createServer((request, response) => {
      directHits += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true, path: request.url }));
    });
    targetPort = await listen(target);
  });

  afterAll(async () => {
    await proxy.close();
    await new Promise((resolve) => target.close(() => resolve(null)));
  });

  it("tunnels the request through the proxy when proxyUrl is set", async () => {
    const result = await fetchJson<{ ok: boolean; path: string }>(
      `http://127.0.0.1:${targetPort}/naver-check`,
      { proxyUrl: proxy.url, timeoutMs: 3000 },
    );
    expect(result.ok).toBe(true);
    expect(result.path).toBe("/naver-check");
    expect(directHits).toBe(1);
    expect(proxy.tunneled).toContain(`127.0.0.1:${targetPort}`);
  });

  it("skips the proxy when proxyUrl is not set", async () => {
    const before = proxy.tunneled.length;
    const result = await fetchJson<{ ok: boolean }>(
      `http://127.0.0.1:${targetPort}/direct`,
      { timeoutMs: 3000 },
    );
    expect(result.ok).toBe(true);
    expect(proxy.tunneled.length).toBe(before);
  });

  it("fetchText returns the raw body through the same proxy path", async () => {
    const result = await fetchText(`http://127.0.0.1:${targetPort}/plain`, {
      proxyUrl: proxy.url,
      timeoutMs: 3000,
    });
    expect(result.text).toContain("\"ok\":true");
    expect(proxy.tunneled).toContain(`127.0.0.1:${targetPort}`);
  });

  it("reuses one dispatcher per proxy URL", () => {
    const first = proxyDispatcher("http://user:pass@proxy.example:8080");
    const second = proxyDispatcher("http://user:pass@proxy.example:8080");
    const other = proxyDispatcher("http://other.example:8080");
    expect(second).toBe(first);
    expect(other).not.toBe(first);
  });
});
