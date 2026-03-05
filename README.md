# Vessel Tracking System 🚢

실시간 선박 위치 추적 및 상세 정보 조회 시스템입니다. 지정된 선박들의 위경도 위치뿐만 아니라 목적지, ETA, 선박 제원(GT, DWT 등)을 통합적으로 제공합니다.

---

## 🏗️ 시스템 아키텍처

- **Backend**: Node.js, Express, Prisma (PostgreSQL), node-cron
- **Frontend**: React, Vite, Tailwind CSS, React-Leaflet
- **Data Source**: [Datalastic API](https://datalastic.com/) (이전의 AISStream 연동은 연결 불안정 문제로 완전 제거됨)

---

## ✨ 핵심 기능

### 1. Datalastic API 기반 주기적 폴링 (Polling)
- **IMO 기준 우선 폴링**: 선박 식별 시 **IMO 번호를 최우선**으로 사용하며, IMO가 없는 경우 MMSI를 차선책으로 사용합니다. (잦은 MMSI 변경이나 재할당으로 인한 데이터 혼선 방지)
- **제원 및 위치 수집**: 
  - `vessel_info` 엔드포인트: 선박 제원(GT, DWT, 선종, 건조년도, 국가 등)을 서버 시작 시 최초 1회 수집.
  - `vessel` 엔드포인트: 현재 위치(위경도), 항로(COG), 속력(SOG), 목적지, ETA 정보 등을 주기적으로 수집.
- **수집 스케줄**: KST(한국시간) 기준 하루 6회 주기적으로 자동 수집됩니다. (00:00, 08:00, 13:00, 15:00, 17:00, 20:00)
- **오래된 데이터 정리**: 30일이 지난 과거 위치 데이터(`Position` 테이블)는 매일 자정 자동 삭제(`cleanup.js`)됩니다.

### 2. 향상된 선박 UI (VesselCard & Marker)
- 선박 목록(사이드바) 및 지도 마커 팝업에 다음 정보가 확장 표시됩니다:
  - 🏳️ **국기 이모지** (Country ISO 기반 자동 변환)
  - 🚢 **선종** (Vessel Type / Type Specific)
  - 📍 **목적지 및 ETA** (Destination, ETA UTC)
  - ⚖️ **제원** (총톤수 GT, 재화중량 DWT, 건조년도)
  - 🆔 **식별번호** (IMO, MMSI)
- **상태 인디케이터**: 1시간 이상 신호가 없으면 빨간색 경고(⚠ 신호 없음) 표시, 1시간 이내면 녹색(● 활성) 표시.
- **편집 기능**: 프론트엔드 UI를 통해 선박의 식별 색상 및 별칭(Alias) 변경 가능.

---

## 🚀 설치 및 주요 파일 구조

### 주요 파일
- **`backend/src/index.js`**: 백엔드 진입점. 서버 및 크론잡 초기화. (AISStream 제거 완료)
- **`backend/src/services/datalasticPoller.js`**: Datalastic API 주기적 호출, IMO 기반 조회 로직 핵심 파일.
- **`frontend/src/components/Sidebar/VesselCard.jsx`**: 좌측 사이드바의 개별 선박 UI 컴포넌트.
- **`frontend/src/components/Map/VesselMarker.jsx`**: 지도 상의 선박 아이콘 및 클릭 시 상세 정보 팝업 컴포넌트.

### 로컬 실행 방법
\`\`\`bash
# Backend
cd backend
npm install
npx prisma generate
npm run dev

# Frontend
cd frontend
npm install
npm run dev
\`\`\`

---

## 📝 최근 주요 변경 이력
- **[2024년 3월 업데이트]**
  - 불안정한 AISStream.io 연동 완전 제거, Datalastic 단일 소스로 통합.
  - MMSI 충돌 문제(예: YC AZALEA)를 해결하기 위해 API 폴링 시 **IMO 번호**를 최우선으로 적용.
  - UI에 국가, 선종, 목적지, ETA, GT 정보 추가. (VesselMarker `OFFSETS` export 버그 수정 및 안정화 진행)
