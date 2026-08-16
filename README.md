# Ziggybang

직방과 네이버 부동산 매물을 한 지도에서 모아 보는 aggregator입니다.

## What it does

- 현재 지도 화면(viewport)에 해당하는 매물만 불러옵니다.
- 직방은 geohash 타일(`onerooms`, `villas`, `officetels`, 아파트 단지)을 사용합니다.
- 네이버는 줌에 따라 cluster / article list를 사용합니다. 네이버가 막혀 있으면 직방만 보여주고 오류를 표시합니다.
- 멀리 보거나 점이 많으면 서버에서 묶음(cluster)으로 줄여 지도를 가볍게 유지합니다.
- 마커를 누르면 상세와 원문 링크를 엽니다.

## Develop

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Pan and zoom the map; only the visible area is fetched.

## Tests

`npm test` runs unit tests for geohash tiling, clustering, source mapping, and aggregation, plus a live Zigbang smoke test. Naver is asserted to fail soft if the host is unreachable.
