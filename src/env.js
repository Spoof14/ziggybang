import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]),
    OPENAI_API_KEY: z.string().optional(),
    /**
     * HTTP(S) proxy with a Korean egress IP, e.g. http://user:pass@host:port.
     * Naver Land drops packets from non-Korean and datacenter IPs, so without
     * this the Naver source fails soft and only Zigbang/Peterpan load.
     */
    NAVER_PROXY_URL: z.string().url().optional(),
    /**
     * Alternative to NAVER_PROXY_URL: Bright Data Web Unlocker API key.
     * Naver requests are sent through https://api.brightdata.com/request with
     * country=kr. NAVER_PROXY_URL wins when both are set.
     */
    BRIGHTDATA_API_KEY: z.string().optional(),
    /** Web Unlocker zone name; defaults to Bright Data's default "web_unlocker1". */
    BRIGHTDATA_UNLOCKER_ZONE: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    NAVER_PROXY_URL: process.env.NAVER_PROXY_URL,
    BRIGHTDATA_API_KEY: process.env.BRIGHTDATA_API_KEY,
    BRIGHTDATA_UNLOCKER_ZONE: process.env.BRIGHTDATA_UNLOCKER_ZONE,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
