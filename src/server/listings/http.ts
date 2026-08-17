export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 8000, ...requestInit } = init;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...requestInit,
      signal: controller.signal,
      headers: {
        accept: "application/json, text/plain, */*",
        ...requestInit.headers,
      },
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
