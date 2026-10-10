# Ziggybang

An English-language map of Zigbang, Naver, and Peterpan Korea rentals. Built as a foreigner-friendly alternative to those Korean-only sites.

**Live site:** <https://ziggybang.vercel.app>

## What it does

- Loads only the listings in the current map view
- Aggregates Zigbang, Peterpan, and (when reachable) Naver studios, villas, officetels, and apartments
- Shows KRW prices, jeonse vs monthly rent, size in m² and pyeong
- Clusters markers when you zoom out so the map stays fast
- Search neighborhoods in English or Korean (Hongdae, Dangsan / 당산, …)

## Naver from outside Korea

Naver Land blocks non-Korean **and cloud** IPs. Zigbang and Peterpan still work from Vercel.

Seoul (`icn1` in `vercel.json`) only places the function in AWS Korea. Outbound requests still use Amazon datacenter IPs, which Naver drops (the request hangs, then times out). A Korean home ISP, mobile hotspot, or residential proxy works; Vercel/AWS does not.

The mobile AJAX endpoints (`m.land.naver.com/cluster/...`) return a literal `null` even from a Korean Telecom home IP. Ziggybang therefore loads a short-lived JWT from `new.land.naver.com` and calls the desktop JSON APIs (`/api/articles`, `/api/articles/clusters`) with `Authorization: Bearer`. That bootstrap happens automatically when a Korean proxy is configured.

### Making Naver work with a proxy

Set `NAVER_PROXY_URL` to an HTTP(S) proxy whose egress IP is a Korean residential or
mobile address, and the server routes only the Naver API calls through it:

```bash
NAVER_PROXY_URL="http://user:pass@host:port"
```

Options that work:

- A Korean residential/mobile proxy provider (any standard HTTP CONNECT proxy).
- Your own machine on a Korean home ISP running [tinyproxy](https://tinyproxy.github.io/)
  or squid, port-forwarded so Vercel can reach it. **Protect it with credentials**
  (tinyproxy 1.11+ `BasicAuth`, or squid). An open proxy on a home IP will get
  hijacked.

A Korean **datacenter** VPS usually does not work — Naver drops those ranges too, the
same way it drops AWS. Without the variable, behavior is unchanged: Naver fails soft
and the map shows Zigbang and Peterpan.

### Or: Bright Data Web Unlocker

Instead of a raw proxy you can use [Web Unlocker](https://brightdata.com/products/web-unlocker):
create a Web Unlocker zone in the Bright Data dashboard and set

```bash
BRIGHTDATA_API_KEY="your-api-key"
# Only needed if your zone is not named web_unlocker1:
BRIGHTDATA_UNLOCKER_ZONE="your-zone-name"
```

Naver API calls are then sent through `https://api.brightdata.com/request` with
`country=kr`, and Bright Data handles IP selection and retries. The REST endpoint
is used rather than their proxy mode because proxy mode intercepts TLS and
requires installing Bright Data's CA certificate. If both variables are set,
`NAVER_PROXY_URL` takes precedence.

Unlocker egress is typically a Korean datacenter IP. That is enough to load Naver
HTML (and therefore the JWT), but the listing APIs may still reject the request.
A home-ISP proxy is the reliable path.

**Required zone setting:** enable **Custom headers & cookies** on the zone so the
app can send `Referer` and `Authorization`. Note that with this setting Bright Data
bills all requests, not only successful ones.

## Develop

This project uses [Bun](https://bun.sh) (`bun.lockb` is the lockfile; there is no `package-lock.json`).

```bash
bun install
cp .env.example .env   # optional: every variable is optional, see .env.example
bun run test
bun run dev
```

Set `SKIP_ENV_VALIDATION=1` to build or run without a `.env` file (used by CI and Docker builds):

```bash
SKIP_ENV_VALIDATION=1 bun run build
```

Open [http://localhost:3000](http://localhost:3000). Pan and zoom the map; only the visible area is fetched.

The map uses OpenStreetMap DE tiles by default so Seoul still has streets, parks,
and bilingual labels when you zoom in. Colored metro lines (Seoul metropolitan
subway plus Busan, Daegu, Daejeon, and Gwangju) sit on top; the subway button
next to zoom hides them. Esri World Street Map goes blank across Seoul from zoom
14 up, so it is no longer the fallback.

CARTO Voyager needs a free key ([get one here](https://carto.com/basemaps/apikey));
set `NEXT_PUBLIC_CARTO_API_KEY` if you want that style. That name matters — the
key is compiled into the browser bundle, so after adding it on Vercel you must
**Redeploy** (uncheck "Use existing Build Cache"). A dashboard save alone does
not change the map.

## Tests

`bun run test` runs the Vitest unit tests for geohash tiling, clustering, source mapping, English copy, and aggregation. Naver is asserted to fail soft if the host is unreachable. `src/server/listings/live.test.ts` is a live Zigbang smoke test that needs network access and can be flaky; CI excludes it (`bun run test --exclude src/server/listings/live.test.ts`).

CI (`.github/workflows/ci.yml`) runs lint, `tsc`, build, and tests with Bun on every PR and push to `main`.

## Ask: behavior notes and known limits

- **Only stated constraints apply.** Model output is grounded against the user's message (`groundIntent`): listing-date window, size bucket, radius, view mode, etc. are dropped unless the text supports them. Money is always parsed by our own parser (`600k`, `50만원`, `5천만원`, `5백만원`, `1 million`, `1억`, `₩600,000`), which overrides model numbers.
- **Search box is for place names only.** Amenity words (pet, furnished, rooftop…) may ride along to match listing titles; type/rent/age words become filters instead.
- **Off-topic or vague messages** ("what is the weather", "something nice") leave all filters and the view untouched and reply with a "can only help with finding rentals" hint.
- **Room count isn't supported** (the listing data has no reliable room-count field, only a free-text `roomType`). Ask says so in its reply instead of silently dropping "2 bedroom" / "투룸".
- **Rate limits.** Ziggybang has no rate limiting of its own on Ask. The only limit is OpenAI's per-key requests/tokens-per-minute for `gpt-4o-mini` (low usage tiers allow just a few requests per minute). On HTTP 429 the server retries once after `Retry-After` (capped at 2 s), then falls back to on-site search and the dialog shows "Using basic search — AI is busy". Timeouts (12 s server, 25 s client) and other errors show a matching notice. Raise the OpenAI tier/limits if this shows up in practice.
- **Address search.** Street addresses (`서울 마포구 양화로 160`) are geocoded through OpenStreetMap Nominatim at road level (no house numbers in OSM for most of Korea) with a 400 m circle. If Nominatim has nothing, the district is used and the UI says so. Kakao/Naver geocoding would give house-number precision but needs API keys (none configured).
- **List vs. map clusters.** At zoom < 15 the map shows server clusters that include Naver's grouped inventory, which has no individual homes to list. The list therefore can be empty while clusters show; the list now says "Zoom in to load individual homes".
