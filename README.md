# Ziggybang

An English-language map of Zigbang, Naver, and Peterpan Korea rentals. Built as a foreigner-friendly alternative to those Korean-only sites.

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

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Pan and zoom the map; only the visible area is fetched.

## Tests

`npm test` runs unit tests for geohash tiling, clustering, source mapping, English copy, and aggregation, plus a live Zigbang smoke test. Naver is asserted to fail soft if the host is unreachable.
