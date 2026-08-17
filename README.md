# Ziggybang

An English-language map of Zigbang and Naver Korea rentals. Built as a foreigner-friendly alternative to those Korean-only sites.

## What it does

- Loads only the listings in the current map view
- Aggregates Zigbang studios, villas, officetels, and apartment complexes
- Adds Naver listings when that host is reachable
- Shows KRW prices, jeonse vs monthly rent, size in m² and pyeong
- Clusters markers when you zoom out so the map stays fast

## Develop

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Pan and zoom the map; only the visible area is fetched.

## Tests

`npm test` runs unit tests for geohash tiling, clustering, source mapping, English copy, and aggregation, plus a live Zigbang smoke test. Naver is asserted to fail soft if the host is unreachable.
