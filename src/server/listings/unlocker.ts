import { env } from "~/env";
import { HttpError } from "./http";

/**
 * Bright Data Web Unlocker REST transport. Unlike the raw proxy path this
 * avoids TLS interception (their native proxy mode requires installing a
 * Bright Data CA certificate), and Bright Data only bills successful requests.
 */
const UNLOCKER_ENDPOINT = "https://api.brightdata.com/request";
const DEFAULT_ZONE = "web_unlocker1";

export type UnlockerConfig = {
  apiKey: string;
  zone?: string;
  endpoint?: string;
};

export function unlockerConfigured(): boolean {
  return Boolean(env.BRIGHTDATA_API_KEY);
}

export function buildUnlockerRequest(
  targetUrl: string,
  config: UnlockerConfig,
  targetHeaders?: Record<string, string>,
): { url: string; init: RequestInit } {
  return {
    url: config.endpoint ?? UNLOCKER_ENDPOINT,
    init: {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        zone: config.zone ?? DEFAULT_ZONE,
        url: targetUrl,
        format: "raw",
        method: "GET",
        country: "kr",
        // Ignored unless "Custom headers & cookies" is enabled on the zone.
        // Naver's AJAX endpoints return null without a referer, so that
        // zone setting is required for this transport.
        ...(targetHeaders ? { headers: targetHeaders } : {}),
      }),
    },
  };
}

export async function fetchTextViaUnlocker(
  targetUrl: string,
  timeoutMs: number,
  config: UnlockerConfig | undefined = env.BRIGHTDATA_API_KEY
    ? { apiKey: env.BRIGHTDATA_API_KEY, zone: env.BRIGHTDATA_UNLOCKER_ZONE }
    : undefined,
  targetHeaders?: Record<string, string>,
): Promise<string> {
  if (!config) {
    throw new HttpError("Web Unlocker is not configured");
  }
  const { url, init } = buildUnlockerRequest(targetUrl, config, targetHeaders);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new HttpError(
        `Web Unlocker HTTP ${response.status} for ${targetUrl}`,
        response.status,
      );
    }
    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(`Web Unlocker timed out for ${targetUrl}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJsonViaUnlocker<T>(
  targetUrl: string,
  timeoutMs: number,
  config: UnlockerConfig | undefined = env.BRIGHTDATA_API_KEY
    ? { apiKey: env.BRIGHTDATA_API_KEY, zone: env.BRIGHTDATA_UNLOCKER_ZONE }
    : undefined,
  targetHeaders?: Record<string, string>,
): Promise<T> {
  const text = await fetchTextViaUnlocker(targetUrl, timeoutMs, config, targetHeaders);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(`Web Unlocker returned non-JSON for ${targetUrl}`);
  }
}
