/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.js");

/** @type {import("next").NextConfig} */
const config = {
  transpilePackages: ["leaflet", "react-leaflet"],
  // Inline into the client bundle at build time. NEXT_PUBLIC_ values are
  // compile-time: adding the key on Vercel does nothing until the next
  // deploy. An explicit `env` entry makes webpack replace the identifier
  // even when the var was previously unset.
  env: {
    NEXT_PUBLIC_CARTO_API_KEY: process.env.NEXT_PUBLIC_CARTO_API_KEY ?? "",
  },
};

export default config;
