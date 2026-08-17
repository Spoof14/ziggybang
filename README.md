# Ziggybang

An English-language map of Zigbang, Naver, and Peterpan Korea rentals. Built as a foreigner-friendly alternative to those Korean-only sites.

## What it does

- Loads only the listings in the current map view
- Aggregates Zigbang, Peterpan, and (when reachable) Naver studios, villas, officetels, and apartments
- Shows KRW prices, jeonse vs monthly rent, size in m² and pyeong
- Clusters markers when you zoom out so the map stays fast
- Search neighborhoods in English or Korean (Hongdae, Dangsan / 당산, …)

## Naver from outside Korea

Naver Land blocks non-Korean IPs. Zigbang and Peterpan still work from US/EU hosts.

To get Naver listings:

1. Deploy Vercel functions in Seoul. This repo pins them with `vercel.json` `"regions": ["icn1"]`.
2. Locally, run the app from a Korean network, VPN, or jump host. There is no API key.

## Develop

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Pan and zoom the map; only the visible area is fetched.

## Tests

`npm test` runs unit tests for geohash tiling, clustering, source mapping, English copy, and aggregation, plus a live Zigbang smoke test. Naver is asserted to fail soft if the host is unreachable.
