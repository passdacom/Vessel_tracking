# 아키텍처 리뷰 — ShippingLanes 컴포넌트 (LaneEditor / LaneList / LaneManager) + lanes.js

리뷰 대상: LaneEditor.jsx, LaneList.jsx, LaneManager.jsx, lanes.js, App.jsx (관련 부분)
리뷰 기준일: 2026-04-19

---

## 요약

| 구분 | 건수 |
|------|------|
| 🔴 즉시 수정 필요 | 3 |
| 🟡 개선 권장 | 5 |
| 🟢 잘 된 점 | 4 |

---

## 🔴 즉시 수정 필요

### 1. lanes 데이터가 App.jsx 상태에 없음 — 메인 지도에 항로 표시 불가

**위치**: App.jsx 전체 / Map/index.jsx

**문제**: `LaneManager`는 `adminView === "lane-manager"` 조건에서 App 전체를 대체(full-page 렌더)하는 방식으로 마운트된다. `lanes` 상태는 App.jsx에 존재하지 않는다. 결과적으로 메인 지도(`<Map>`)에 항로를 표시하려면 구조적 변경이 필요하다.

```jsx
// App.jsx 현재 — lanes 상태 없음
const [vessels, setVessels] = useState([]);
const [positions, setPositions] = useState({});
// lanes 없음 → <Map>에 전달 불가
```

**영향**: 현재 ShippingLane 기능은 admin 전용 에디터 단독으로만 존재하고, 일반 사용자 지도(Map 컴포넌트)에는 항로가 전혀 표시되지 않는다. ETA 계산, 항로 기반 거리 계산 등 다음 단계 기능은 모두 lanes 데이터가 Map 레이어에 있어야 동작한다.

**수정 방향**:

```jsx
// App.jsx에 lanes 상태 추가
const [lanes, setLanes] = useState([]);

useEffect(() => {
  if (!isAuthed) return;
  apiFetch("/lanes")           // active=true만 반환 (기본)
    .then(r => r.ok ? r.json() : [])
    .then(setLanes);
}, [isAuthed, apiFetch]);

// Map 컴포넌트에 전달
<Map ... lanes={lanes} />
```

`GET /api/lanes`는 이미 모든 인증 사용자에게 허용되므로 백엔드 변경 없이 즉시 적용 가능하다.

---

### 2. handleSaved()가 저장된 항로 데이터를 버림 — UX 흐름 단절

**위치**: LaneManager.jsx L33-37

**문제**: `LaneEditor`의 `onSave` prop은 저장 완료 후 서버 응답 객체(`saved`)를 인자로 전달한다. 그러나 `LaneManager.handleSaved`는 인자를 받지 않고 단순히 목록 뷰로 전환만 한다.

```jsx
// LaneEditor.jsx — saved 객체를 onSave에 전달
const saved = await res.json();
onSave(saved);  // saved = { id, name, coordinates, ... }

// LaneManager.jsx — 인자를 무시
const handleSaved = () => {
  setEditingLane(null);
  setView("list");
};
```

**영향**: 저장 직후 방금 만든 항로를 바로 미리볼 수 없다. 신규 항로를 저장하면 목록으로 이동하지만, `LaneList`가 다시 `fetchLanes()`를 실행하기 때문에 약간의 지연 후에야 표시된다. 더 중요하게는, App.jsx의 lanes 상태를 업데이트할 콜백 경로가 없다.

**수정 방향**:

```jsx
// LaneManager.jsx
export default function LaneManager({ apiFetch, onClose, onLaneSaved }) {
  const handleSaved = (savedLane) => {
    onLaneSaved?.(savedLane);  // App.jsx에 저장 알림
    setEditingLane(null);
    setView("list");
  };
  ...
}

// App.jsx
const handleLaneSaved = (lane) => {
  setLanes(prev => {
    const idx = prev.findIndex(l => l.id === lane.id);
    return idx >= 0
      ? prev.map(l => l.id === lane.id ? lane : l)   // 수정
      : [...prev, lane];                              // 신규
  });
};

<LaneManager apiFetch={apiFetch} onClose={...} onLaneSaved={handleLaneSaved} />
```

---

### 3. LaneEditor가 /admin/vessels를 직접 fetch — admin 권한 종속성 암묵적 가정

**위치**: LaneEditor.jsx L81-95

**문제**: `LaneEditor`의 useEffect에서 `apiFetch("/admin/vessels")`를 호출한다. `/admin/vessels` 엔드포인트는 admin 전용이다. LaneEditor 자체도 현재 admin만 접근 가능하지만, 이 의존성이 컴포넌트 내부에 하드코딩되어 있어 향후 권한 구조 변경 시 숨겨진 버그로 이어진다.

```jsx
// LaneEditor.jsx L82-83 — admin 전용 엔드포인트를 컴포넌트가 직접 가정
apiFetch("/admin/vessels")
  .then((r) => (r.ok ? r.json() : []))
```

`/api/lanes`의 GET은 모든 인증 사용자에게 열려 있지만, 항적 가져오기용 선박 목록 조회는 admin 엔드포인트에 묶여 있다.

**수정 방향**: `/admin/vessels` 대신 `/vessels`(일반 vessel 목록 API)를 사용하거나, `vessels` 배열을 prop으로 주입받는다.

```jsx
// 옵션 A: vessels prop 주입 (권장)
export default function LaneEditor({ apiFetch, initialLane, onSave, onCancel, vessels = [] }) {
  // useEffect로 /admin/vessels fetch 제거
  ...
}

// LaneManager.jsx에서 App.jsx의 vessels 상태를 전달
<LaneEditor ... vessels={vessels} />
```

---

## 🟡 개선 권장

### 4. toLeaflet / toGeoJSON 헬퍼가 LaneEditor에만 존재 — 재사용 불가

**위치**: LaneEditor.jsx L8-9

**문제**: `toLeaflet([lon,lat][] → [lat,lon][])`, `toGeoJSON([lat,lon][] → [lon,lat][])` 두 함수가 LaneEditor 파일 상단에 모듈 스코프 함수로 정의되어 있다. ETA 계산, VesselTrack 렌더링, RestrictedZone 등 다른 컴포넌트에서도 동일한 좌표 변환이 필요할 때 복사·붙여넣기가 발생한다.

**수정 방향**: `frontend/src/utils/geo.js`로 추출하고 import 사용.

```js
// frontend/src/utils/geo.js
/** DB/GeoJSON [lon, lat][] → Leaflet [lat, lon][] */
export const toLeaflet = (lonLats) => lonLats.map(([lon, lat]) => [lat, lon]);

/** Leaflet [lat, lon][] → DB/GeoJSON [lon, lat][] */
export const toGeoJSON = (latLons) => latLons.map(([lat, lon]) => [lon, lat]);
```

`simplifyAdaptive` 함수도 동일한 파일 또는 `frontend/src/utils/geoProcessing.js`에 함께 두는 것이 적합하다.

---

### 5. LaneEditor 내 MapContainer 독립 인스턴스 — 타일 설정 중복

**위치**: LaneEditor.jsx L334-413 / Map/index.jsx

**문제**: LaneEditor는 `MapContainer`를 직접 생성하며 타일 레이어 URL, attribution, subdomains, maxZoom을 별도로 하드코딩한다. 메인 Map 컴포넌트(`Map/index.jsx`)에도 동일한 설정이 있다. 타일 공급자를 변경할 경우 두 곳을 수동으로 맞춰야 한다.

```jsx
// LaneEditor.jsx L341-346 — 타일 설정 하드코딩
<TileLayer
  attribution="&copy; OpenStreetMap contributors &copy; CARTO"
  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
  subdomains="abcd"
  maxZoom={19}
/>
```

**현실적 판단**: LaneEditor는 전체 화면 오버레이로 독립적인 지도 인스턴스가 맞는 설계다(react-leaflet의 MapContainer는 하나의 L.Map을 소유하므로 공유 불가). 따라서 MapContainer 자체를 공유하는 것은 불가능하나, 타일 설정만 상수로 추출해 공유하면 충분하다.

```js
// frontend/src/utils/mapConfig.js
export const CARTO_TILE = {
  url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  subdomains: "abcd",
  maxZoom: 19,
};
```

---

### 6. LaneManager의 list/editor 전환 — 뒤로가기 히스토리 없음

**위치**: LaneManager.jsx

**문제**: `view` 상태를 `"list" | "editor"` 문자열로 관리한다. 브라우저 뒤로가기 버튼이 에디터 → 목록으로 이동하지 않고 앱 전체를 빠져나간다. 현재는 관리자 전용이므로 큰 문제가 아니지만, 에디터에서 실수로 큰 변경 후 취소 경로가 onCancel 버튼뿐이다.

**수정 방향**: URL hash나 react-router history를 사용하거나, 브라우저 뒤로가기를 인터셉트하는 popstate 리스너를 추가한다. 단기적으로는 에디터에서 변경 사항이 있을 때 onCancel 전에 확인 대화상자를 추가하는 것으로 충분하다.

---

### 7. LaneList의 handleToggleActive에서 fetchLanes() 재호출 — 낙관적 업데이트 누락

**위치**: LaneList.jsx L37-54

**문제**: 활성화/비활성화 토글 후 `fetchLanes()`를 다시 호출한다. 서버 왕복이 완료될 때까지 UI가 갱신되지 않아 체감 응답이 느리다. DELETE도 마찬가지다.

**수정 방향**: 낙관적 업데이트를 먼저 적용하고, 실패 시 롤백한다.

```jsx
const handleToggleActive = async (lane) => {
  // 낙관적 업데이트
  setLanes(prev => prev.map(l => l.id === lane.id ? {...l, active: !l.active} : l));
  try {
    const res = await apiFetch(`/lanes/${lane.id}`, {
      method: "PUT",
      body: JSON.stringify({ active: !lane.active }),
    });
    if (!res.ok) throw new Error();
    setActionMsg(`"${lane.name}" ${!lane.active ? "활성화" : "비활성화"} 완료`);
  } catch {
    // 롤백
    setLanes(prev => prev.map(l => l.id === lane.id ? {...l, active: lane.active} : l));
    setActionMsg("변경 실패");
  }
  setTimeout(() => setActionMsg(""), 3000);
};
```

---

### 8. lanes.js PUT에서 active 단독 업데이트와 전체 수정이 같은 엔드포인트 — 의도 모호

**위치**: lanes.js L103-152

**문제**: PUT `/api/lanes/:id`는 `name`, `description`, `coordinates`, `color`, `active` 모두를 선택적으로 받는다. `LaneList`에서는 `{ active: false }` 하나만 보내고, `LaneEditor`에서는 전체 필드를 보낸다. 단일 PUT이 부분 업데이트와 전체 교체를 겸하고 있어 의미가 모호하다. 특히 `coordinates`가 undefined일 때 기존 값을 유지하는 로직이 스프레드로 처리되어 있어 명시적이지 않다.

**수정 방향**: 장기적으로는 `PATCH`(부분 업데이트)와 `PUT`(전체 교체)를 분리하는 것이 REST 관례에 부합한다. 단기적으로는 현재 구조를 유지하되 주석으로 "이 엔드포인트는 partial update를 지원함"을 명시한다.

---

## 🟢 잘 된 점

### 1. apiFetch prop 일관성 유지

LaneEditor, LaneList, LaneManager 모두 `apiFetch`를 prop으로 주입받는다. App.jsx의 세션 토큰 인증 헤더 처리 로직이 한 곳에만 있고, 모든 하위 컴포넌트가 이를 재사용한다. 인증 방식이 바뀌어도 App.jsx의 `apiFetch` 함수만 수정하면 된다.

### 2. lanes.js의 권한 분리 설계

GET(목록/단건)은 모든 인증 사용자에게 열고, `router.use(adminGuard)` 이후의 POST/PUT/DELETE는 admin에게만 제한한다. 미들웨어 위치로 권한 경계를 명확히 표현하고 있어 실수로 admin 전용 액션을 노출하기 어렵다.

### 3. simplifyAdaptive의 폴백 전략

turf.js 단순화 결과가 2포인트 미만으로 떨어질 경우 균등 샘플링으로 폴백한다. 단순히 `turf.simplify`만 믿지 않고 최소 보장 조건(포인트 2개 이상)을 명시적으로 처리한다.

### 4. validateCoordinates 서버 측 검증

좌표 배열의 길이, 타입, 범위를 백엔드에서 명시적으로 검증한다. 프론트엔드 검증(waypoints.length < 2)과 이중으로 보호되어 있어 직접 API 호출로도 잘못된 데이터가 저장되지 않는다.

---

## 구조 개선 제안 — 컴포넌트 의존성 그래프

**현재**:
```
App.jsx
  └── LaneManager (adminView === "lane-manager" 시 App 전체 대체)
        ├── LaneList  (독립 fetch — /lanes)
        └── LaneEditor (독립 fetch — /admin/vessels, /vessels/:id/positions, /lanes)

Map/index.jsx
  └── lanes 데이터 없음 (항로 표시 불가)
```

**개선 후**:
```
App.jsx
  ├── lanes 상태 (/lanes 초기 로드 + onLaneSaved 업데이트)
  ├── LaneManager (onLaneSaved 콜백 전달)
  │     ├── LaneList  (lanes prop 받거나 독립 fetch 유지)
  │     └── LaneEditor (vessels prop 주입, /admin/vessels 직접 호출 제거)
  └── Map/index.jsx
        └── lanes prop 전달 → ShippingLaneLayer 컴포넌트로 렌더링
```

---

## ETA 기능 추가 권장 아키텍처

### 배경 및 목표

사전 정의된 항로(ShippingLane)를 기준으로, 현재 선박 위치에서 항로 상의 특정 웨이포인트(목적지)까지의 예상 도착 시간을 계산한다.

### 계산 로직 위치 결정 — Frontend vs Backend

**권장: Frontend(utils)에서 계산**

이유:
1. ETA 계산에 필요한 모든 데이터(선박 현재 위치, 속도, 항로 좌표)가 이미 App.jsx 상태에 있다.
2. turf.js가 이미 LaneEditor에서 사용 중이고 의존성이 설치되어 있다.
3. 계산 결과는 사용자 세션에서만 필요하며 영속성이 불필요하다.
4. 백엔드 API 호출 없이 즉시 반응하는 UX가 가능하다.

Backend 계산이 필요한 경우: 계산 결과를 저장하거나, 다수 선박의 배치 ETA를 외부 시스템에 제공하거나, 계산 로직이 복잡해 서버 캐싱이 필요할 때.

### 계산 로직 설계

```js
// frontend/src/utils/eta.js

import * as turf from "@turf/turf";
import { toGeoJSON } from "./geo";

/**
 * 선박의 현재 위치와 속도(SOG)를 기반으로 항로 상의 목적지까지 ETA를 계산한다.
 *
 * @param {object} vesselPos - { lat, lon, sog } (sog: knots)
 * @param {number[][]} laneCoords - [[lon, lat], ...] (GeoJSON 순서)
 * @param {number} destWaypointIdx - 목적지 웨이포인트 인덱스
 * @returns {{ distanceNm: number, etaDate: Date | null, remainingCoords: number[][] }}
 */
export function calcETA(vesselPos, laneCoords, destWaypointIdx) {
  if (!vesselPos || !laneCoords || laneCoords.length < 2) return null;
  if (destWaypointIdx < 0 || destWaypointIdx >= laneCoords.length) return null;

  const vesselPoint = turf.point([vesselPos.lon, vesselPos.lat]);
  const line = turf.lineString(laneCoords);

  // 선박과 가장 가까운 항로 상의 점 탐색
  const nearestOnLine = turf.nearestPointOnLine(line, vesselPoint);
  const nearestIdx = nearestOnLine.properties.index ?? 0;

  // 목적지가 이미 지나쳤는지 확인
  if (destWaypointIdx <= nearestIdx) return null;

  // nearestOnLine → destWaypoint 구간 좌표 추출
  const remainingCoords = [
    nearestOnLine.geometry.coordinates,
    ...laneCoords.slice(nearestIdx + 1, destWaypointIdx + 1),
  ];

  if (remainingCoords.length < 2) return null;

  const remainingLine = turf.lineString(remainingCoords);
  const distanceKm = turf.length(remainingLine, { units: "kilometers" });
  const distanceNm = distanceKm / 1.852;

  const sogKnots = vesselPos.sog ?? 0;
  const etaDate = sogKnots > 0.1
    ? new Date(Date.now() + (distanceNm / sogKnots) * 3600 * 1000)
    : null;

  return { distanceNm, etaDate, remainingCoords };
}
```

### 상태 관리 위치

ETA 계산 파라미터(선택된 선박 + 목적지 웨이포인트)는 App.jsx 대신 **ETAPanel 컴포넌트 로컬 상태**로 관리한다. App.jsx는 이미 충분히 크고, ETA 파라미터는 전역 상태가 필요 없다.

```
App.jsx
  └── Map/index.jsx (lanes, vessels, positions prop 수신)
        ├── ShippingLaneLayer.jsx — 항로 폴리라인 렌더링 + 웨이포인트 클릭 핸들러
        └── ETAPanel.jsx          — 선택된 선박 + 클릭된 목적지 → calcETA 호출 → 표시
```

단, 선택된 선박 ID(`selectedVesselId`)는 App.jsx에서 관리되므로 `selectedVesselId` + 현재 위치는 Map을 통해 ETAPanel에 내려준다.

### 컴포넌트 추가 목록

| 컴포넌트/파일 | 역할 |
|---|---|
| `frontend/src/utils/geo.js` | toLeaflet, toGeoJSON 공용 함수 |
| `frontend/src/utils/eta.js` | calcETA 계산 로직 |
| `frontend/src/utils/mapConfig.js` | CARTO_TILE 등 지도 설정 상수 |
| `frontend/src/components/Map/ShippingLaneLayer.jsx` | lanes 배열을 받아 Polyline + 웨이포인트 마커 렌더링 |
| `frontend/src/components/Map/ETAPanel.jsx` | 선택된 목적지 웨이포인트 + ETA 결과 표시 UI |

### App.jsx 변경 범위 (최소화)

```jsx
// 추가: lanes 상태
const [lanes, setLanes] = useState([]);

// 추가: lanes 초기 로드
useEffect(() => {
  if (!isAuthed) return;
  apiFetch("/lanes").then(r => r.ok ? r.json() : []).then(setLanes);
}, [isAuthed, apiFetch]);

// 추가: LaneManager에 onLaneSaved 전달
const handleLaneSaved = (lane) => {
  setLanes(prev => {
    const idx = prev.findIndex(l => l.id === lane.id);
    return idx >= 0 ? prev.map(l => l.id === lane.id ? lane : l) : [...prev, lane];
  });
};

// 변경: Map에 lanes prop 추가
<Map ... lanes={lanes} />
```

App.jsx 추가 코드는 약 15줄로 제한되며, 기존 상태 패턴과 완전히 일관된다.

### 구현 순서 (우선순위)

1. `frontend/src/utils/geo.js` 생성 — LaneEditor의 toLeaflet/toGeoJSON 이전 (즉시 가능, 사이드이펙트 없음)
2. App.jsx에 lanes 상태 추가 + Map에 전달
3. `Map/ShippingLaneLayer.jsx` 구현 — 항로 폴리라인 렌더링
4. `frontend/src/utils/eta.js` 구현
5. `Map/ETAPanel.jsx` 구현 — 웨이포인트 클릭 시 ETA 표시
6. LaneEditor의 `/admin/vessels` 호출을 vessels prop 주입으로 교체
