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

`bun run test` runs the Vitest unit tests for geohash tiling, clustering, source mapping, English copy, and aggregation. Naver is asserted to fail soft if the host is unreachable. `src/server/listings/live.test.ts` is a network test (live Zigbang/Peterpan/Naver; Peterpan upstream timeouts are tolerated). It is excluded from `bun run test` and CI; run it on demand with `bun run test:live`.

CI (`.github/workflows/ci.yml`) runs lint, `tsc`, build, and tests with Bun on every PR and push to `main`.

## Ask: ten AI-picked listings

Ask no longer sets the map filters. You describe what you want ("cheap studio near Hongdae under 700k monthly, quiet, close to subway") and get a **carousel of 10 listings** with a one-line "why this one" for each. Your map filters are only changed if you press **Apply as filters**.

Pipeline (`listings.askInterpret` → `listings.ask`, code in `src/server/listings/ask.ts`, `ask-picks.ts`, shared logic in `src/lib/listings/ask-picks.ts`):

1. **Extract constraints.** The request (plus the previous constraints, for follow-ups like "cheaper" or "only with elevator") goes through gpt-4o-mini and then the grounded parsers (`groundIntent`): a constraint only survives if the text supports it. Money is always parsed by our own parser (`600k`, `50만원`, `5천만원`, `1억`, `₩600,000`). The area is resolved to coordinates through the place table, then the geocoder; with no area it falls back to the map view (and says so). Soft wishes (quiet, close to subway, elevator, pet-friendly, furnished, parking, sunny) become **preferences**: they steer ranking but never exclude homes.
2. **Fetch + hard-filter.** One `getMapData` request per live source (Zigbang / Peterpan / Naver, each with its own timeout) for the resolved circle, then every stated constraint is applied as a hard filter. If fewer than 18 homes remain, the radius is widened once (×1.8, max 3 km). Listings that don't state an optional detail (floor, size, building age) are only admitted, ranked last, when too few strict matches exist; price and deal type stay strict.
3. **Rank.** Up to 50 compact candidate summaries (no agent text) go to gpt-4o-mini, which returns the 10 best with a reason each, a summary and its assumptions. IDs are validated against the candidate set; invented or duplicate IDs are dropped and gaps are topped up from the deterministic ranking. If the AI is unavailable (no key, 429, quota, timeout, bad output) the deterministic scorer (price percentile, distance to the center, building age, size, photos, preference matches; weights shift for "cheap"/"newest"/"spacious"/"close") ranks instead with generic reasons, and the UI shows "Using basic ranking — AI unavailable (reason)".

UI notes: the dialog shows progress while it works, then a scroll-snap carousel (arrow buttons, left/right/Home/End keys, swipe on touch, carousel/slide ARIA roles). Chips under the summary are the interpreted constraints; removing one re-ranks without re-interpreting. "Refine" continues the conversation. "Show these on the map" / "Show on map" plot only the picks (a banner offers "Show all homes"). The last result is kept in `sessionStorage`; closing the dialog aborts an in-flight request and ignores its late answer. Identical requests are served from a 60 s in-memory cache (AI-fallback answers are not cached).

Known limits:

- **Only stated constraints apply** (see grounding above). Elevator, noise, sunlight and "close to subway" are soft: the listing data states them only sometimes (`elevator`, nearby subway walking minutes, title/description mentions), so the AI is told not to claim what the data doesn't show.
- **Off-topic or vague messages** ("what is the weather") get a polite "I can only help find a rental" hint and leave everything unchanged.
- **Room count isn't supported** (no reliable room-count field). Ask notes this in the assumptions instead of silently dropping "2 bedroom" / "투룸".
- **Rate limits.** Ziggybang has no rate limiting of its own on Ask. The only limit is OpenAI's per-key requests/tokens-per-minute for `gpt-4o-mini`. On HTTP 429 the server retries once after `Retry-After` (capped at 1.5 s), then uses the basic ranking and shows the reason. Budgets: 8 s interpretation, 9 s per live-source fetch (+6 s for one widening), 9 s ranking, 45 s client ceiling; typical total is 5–10 s.
- **Address search.** Street addresses (`서울 마포구 양화로 160`) are geocoded through OpenStreetMap Nominatim at road level (no house numbers in OSM for most of Korea) with a 400 m circle. If Nominatim has nothing, the district is used and the UI says so. Kakao/Naver geocoding would give house-number precision but needs API keys (none configured).
- **List vs. map clusters.** At zoom < 15 the map shows server clusters that include Naver's grouped inventory, which has no individual homes to list. The list therefore can be empty while clusters show; the list now says "Zoom in to load individual homes".
