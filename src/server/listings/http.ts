import { fetch as proxiedFetch, ProxyAgent } from "undici";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const proxyAgents = new Map<string, ProxyAgent>();

/** One connection pool per proxy URL, reused across requests. */
export function proxyDispatcher(proxyUrl: string): ProxyAgent {
  let agent = proxyAgents.get(proxyUrl);
  if (!agent) {
    agent = new ProxyAgent(proxyUrl);
    proxyAgents.set(proxyUrl, agent);
  }
  return agent;
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number; proxyUrl?: string } = {},
): Promise<T> {
  const { timeoutMs = 8000, proxyUrl, ...requestInit } = init;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      accept: "application/json, text/plain, */*",
      ...requestInit.headers,
    };
    // Node's built-in fetch rejects dispatchers from the npm undici package,
    // so proxied requests go through undici's own fetch.
    const response = proxyUrl
      ? await proxiedFetch(url, {
          method: requestInit.method ?? "GET",
          headers: headers as Record<string, string>,
          signal: controller.signal,
          dispatcher: proxyDispatcher(proxyUrl),
        })
      : await fetch(url, {
          ...requestInit,
          signal: controller.signal,
          headers,
        });

    if (!response.ok) {
      throw new HttpError(
        `HTTP ${response.status} for ${url}`,
        response.status,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(`Timed out fetching ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      reject(new HttpError(`${label} timed out`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(id);
        resolve(value);
      },
      (error) => {
        clearTimeout(id);
        reject(error);
      },
    );
  });
}

export function settledValue<T>(
  result: PromiseSettledResult<T>,
  fallback: T,
): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

export function settledError(
  result: PromiseSettledResult<unknown>,
): string | undefined {
  if (result.status === "rejected") {
    return result.reason instanceof Error
      ? result.reason.message
      : String(result.reason);
  }
  return undefined;
}
