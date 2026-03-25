import React, { useState } from "react";

const sections = [
  {
    id: "overview",
    title: "앱 소개",
    icon: "🚢",
    content: (
      <>
        <p>
          <b>Vessel Tracking</b>은 선박의 실시간 위치를 모니터링하고,
          항적(Track)을 시각화하며, 위험구역 정보를 함께 관리할 수 있는
          해운 관제 시스템입니다.
        </p>
        <h4>주요 특징</h4>
        <ul>
          <li><b>실시간 위치 추적</b> — Datalastic API 기반 자동 위치 수신 (1일 6회)</li>
          <li><b>다중 계정</b> — 회사별 독립 관리 (KB, KDGC 등), Admin 통합 관제</li>
          <li><b>지도 시각화</b> — 선박 아이콘, 항적 라인, 위험구역 오버레이</li>
          <li><b>항적 재생</b> — 과거 이동 경로를 애니메이션으로 재현</li>
          <li><b>공유 기능</b> — 외부 고객에게 읽기 전용 링크 제공</li>
          <li><b>리포트 출력</b> — 선박 위치 보고서 인쇄/내보내기</li>
        </ul>
      </>
    ),
  },
  {
    id: "login",
    title: "로그인 / 계정",
    icon: "🔐",
    content: (
      <>
        <p>앱 접속 시 비밀번호를 입력하여 로그인합니다. 계정별로 관리하는 선박이 분리됩니다.</p>
        <h4>계정 종류</h4>
        <table>
          <thead>
            <tr><th>계정</th><th>역할</th><th>설명</th></tr>
          </thead>
          <tbody>
            <tr><td>KB</td><td>일반 사용자</td><td>KB 소속 선박만 관리</td></tr>
            <tr><td>KDGC</td><td>일반 사용자</td><td>KDGC 소속 선박만 관리</td></tr>
            <tr><td>Admin</td><td>관리자</td><td>모든 계정의 선박/설정 관리</td></tr>
          </tbody>
        </table>
        <h4>비밀번호 변경</h4>
        <ol>
          <li>사이드바 하단의 <b>⚙️ (설정)</b> 버튼을 클릭합니다.</li>
          <li>새 비밀번호를 입력하고 확인란에 동일하게 입력합니다.</li>
          <li><b>비밀번호 변경</b> 버튼을 누르면 변경 후 자동 로그아웃됩니다.</li>
        </ol>
        <div className="info-box">
          비밀번호는 최소 4자 이상이어야 합니다. 변경 후에는 새 비밀번호로 다시 로그인하세요.
        </div>
        <h4>로그아웃</h4>
        <p>설정 모달 하단의 <b>로그아웃</b> 버튼을 누르면 세션이 종료됩니다.</p>
      </>
    ),
  },
  {
    id: "sidebar",
    title: "사이드바 사용법",
    icon: "📋",
    content: (
      <>
        <p>좌측 사이드바에서 선박 목록 관리, 항적 설정, 포트 검색 등 대부분의 기능을 수행합니다.</p>
        <h4>사이드바 표시/숨기기</h4>
        <ul>
          <li>지도 좌측 상단의 <b>◀ / ▶</b> 버튼으로 사이드바를 숨기거나 표시할 수 있습니다.</li>
          <li>데스크탑에서는 사이드바 오른쪽 경계를 드래그하여 <b>너비를 조절</b>할 수 있습니다 (220~500px).</li>
        </ul>
        <h4>항적 시간 설정</h4>
        <p>사이드바 상단의 시간 버튼으로 지도에 표시할 항적 범위를 설정합니다.</p>
        <ul>
          <li><b>빠른 선택</b>: 6h, 24h, 3d, 7d 버튼</li>
          <li><b>상세 선택</b>: 드롭다운에서 1시간 ~ 30일까지 선택 가능</li>
        </ul>
        <h4>선박 그룹</h4>
        <p>선박은 그룹별로 분류되어 표시됩니다. 그룹 헤더를 클릭하면 접기/펼치기가 됩니다.</p>
        <ul>
          <li><b>기본 그룹</b>: 자사간사, 타사간사</li>
          <li><b>커스텀 그룹</b>: 그룹 관리 메뉴에서 직접 생성/이름 변경/삭제 가능</li>
          <li>그룹 헤더의 <b>눈 아이콘</b>으로 그룹 전체를 지도에서 숨기기/표시 가능</li>
        </ul>
      </>
    ),
  },
  {
    id: "vessel-add",
    title: "선박 추가",
    icon: "➕",
    content: (
      <>
        <p>사이드바 상단의 <b>+ 선박 추가</b> 버튼을 눌러 새 선박을 등록합니다.</p>
        <h4>방법 1: MMSI 직접 입력 (기본)</h4>
        <ol>
          <li><b>MMSI 번호</b> (9자리 숫자)를 입력합니다.</li>
          <li>선택적으로 <b>별칭</b>(표시 이름), <b>색상</b>, <b>소속 그룹</b>을 지정합니다.</li>
          <li><b>추가</b> 버튼을 누르면 등록되며, 다음 폴링 시 위치 데이터가 자동 수신됩니다.</li>
        </ol>
        <h4>방법 2: 검색으로 추가</h4>
        <ol>
          <li><b>검색</b> 탭을 선택합니다.</li>
          <li>보안을 위해 <b>검색 비밀번호</b>를 먼저 입력합니다. (API 크레딧 보호 목적)</li>
          <li>선박명, IMO 번호(7자리), 또는 MMSI 번호(9자리)로 검색합니다.</li>
          <li>검색 결과에서 원하는 선박의 <b>선택</b> 버튼을 누르면 MMSI가 자동 입력됩니다.</li>
          <li>별칭, 색상, 그룹을 설정한 후 <b>추가</b>합니다.</li>
        </ol>
        <div className="warn-box">
          검색 기능은 Datalastic API 크레딧을 소모합니다. 월 20,000 크레딧 한도이므로 신중하게 사용하세요.
        </div>
      </>
    ),
  },
  {
    id: "vessel-manage",
    title: "선박 관리",
    icon: "⚙️",
    content: (
      <>
        <p>사이드바의 선박 카드에서 각 선박을 관리합니다.</p>
        <h4>선박 카드 정보</h4>
        <ul>
          <li><b>상태 표시등</b>: 녹색(활성 - 2시간 이내 수신), 빨간색(미수신)</li>
          <li><b>속도/침로</b>: SOG (대지속력, 노트), HDG (선수방위) 또는 COG (대지침로)</li>
          <li><b>최근 수신</b>: "5분 전", "3시간 전" 등 상대 시간으로 표시</li>
        </ul>
        <h4>선박 카드 버튼</h4>
        <ul>
          <li><b>선택</b> (카드 클릭) — 지도에서 해당 선박으로 이동 및 포커스</li>
          <li><b>편집</b> (연필 아이콘) — 별칭, 색상, 소속 그룹 변경</li>
          <li><b>눈 아이콘</b> — 지도에서 해당 선박 숨기기/표시 토글</li>
          <li><b>보관</b> — 선박을 보관함으로 이동 (삭제하지 않고 비활성화)</li>
          <li><b>삭제</b> — 선박과 모든 위치 데이터를 영구 삭제 (확인 필요)</li>
        </ul>
        <h4>보관함</h4>
        <p>사이드바 하단의 <b>보관함</b> 링크를 클릭하면 보관된 선박 목록을 볼 수 있습니다.</p>
        <ul>
          <li><b>복원</b> — 보관된 선박을 다시 활성 목록으로 복원</li>
          <li><b>영구 삭제</b> — 보관된 선박을 완전히 삭제</li>
        </ul>
      </>
    ),
  },
  {
    id: "vessel-history",
    title: "과거 항적 불러오기",
    icon: "📡",
    content: (
      <>
        <p>Datalastic API를 통해 과거 위치 데이터를 가져올 수 있습니다.</p>
        <h4>사용 방법</h4>
        <ol>
          <li>선박 카드를 확장(선택)합니다.</li>
          <li><b>히스토리 가져오기</b> 버튼을 클릭합니다.</li>
          <li>기간을 선택합니다 (1일 ~ 30일).</li>
          <li>가져온 항적은 지도에 즉시 표시됩니다.</li>
        </ol>
        <div className="warn-box">
          히스토리 요청도 API 크레딧을 소모합니다. 15분당 10회 요청 제한이 있습니다.
        </div>
      </>
    ),
  },
  {
    id: "playback",
    title: "항적 재생 (Playback)",
    icon: "▶️",
    content: (
      <>
        <p>선박의 과거 이동 경로를 애니메이션으로 재생합니다.</p>
        <h4>사용 방법</h4>
        <ol>
          <li>선박 카드에서 <b>재생</b> 버튼을 클릭합니다.</li>
          <li>화면 하단에 재생 컨트롤 패널이 나타납니다.</li>
        </ol>
        <h4>재생 컨트롤</h4>
        <ul>
          <li><b>재생/일시정지</b> — 재생과 일시정지를 전환</li>
          <li><b>진행 바</b> — 드래그하여 원하는 시점으로 이동</li>
          <li><b>재생 시간</b> — 10초, 30초, 1분, 3분, 5분 중 선택 (전체 항적을 해당 시간에 압축 재생)</li>
          <li><b>카메라 추적</b> — 켜면 지도가 선박을 따라 자동으로 이동</li>
          <li><b>시간 표시</b> — 현재 재생 중인 시점의 UTC/KST 시간 표시</li>
        </ul>
        <div className="info-box">
          항적 재생 전에 충분한 위치 데이터가 필요합니다. 데이터가 부족하면 먼저 <b>히스토리 가져오기</b>로 과거 데이터를 불러오세요.
        </div>
      </>
    ),
  },
  {
    id: "map",
    title: "지도 기능",
    icon: "🗺️",
    content: (
      <>
        <h4>선박 표시</h4>
        <ul>
          <li>각 선박은 설정된 <b>고유 색상</b>의 선박 아이콘으로 표시됩니다.</li>
          <li>아이콘은 선박의 <b>침로(Heading/Course)</b> 방향으로 회전합니다.</li>
          <li>선택된 선박은 더 크게 표시됩니다.</li>
          <li>2시간 이상 데이터 미수신 선박은 <b>회색 반투명</b>으로 표시됩니다.</li>
        </ul>
        <h4>항적 (Track Line)</h4>
        <ul>
          <li>각 선박의 이동 경로가 <b>점선</b>으로 표시됩니다.</li>
          <li>항적 색상은 선박 색상과 동일합니다.</li>
          <li>사이드바의 항적 시간 설정에 따라 표시 범위가 변경됩니다.</li>
        </ul>
        <h4>선박 라벨</h4>
        <ul>
          <li>각 선박 옆에 이름 라벨이 표시됩니다.</li>
          <li>라벨은 <b>드래그</b>하여 위치를 변경할 수 있습니다.</li>
          <li>라벨 위치는 자동 저장되며, 줌 레벨에 따라 자동 배치됩니다.</li>
        </ul>
        <h4>선박 팝업</h4>
        <p>선박 아이콘을 클릭하면 상세 정보 팝업이 표시됩니다:</p>
        <ul>
          <li>선박명, MMSI, IMO</li>
          <li>위치 (위도/경도)</li>
          <li>속도, 침로, 선수방위</li>
          <li>목적지, 도착 예정시간(ETA)</li>
          <li>선종, 총톤수, 건조년도</li>
        </ul>
      </>
    ),
  },
  {
    id: "zones",
    title: "위험구역 (War Risk Zone)",
    icon: "🔴",
    content: (
      <>
        <p>전쟁위험구역 및 영해 경계를 지도에 오버레이합니다.</p>
        <h4>설정 방법</h4>
        <ol>
          <li>사이드바 하단의 <b>War Risk Zone 설정</b> 버튼을 클릭합니다.</li>
          <li>각 구역별로 표시 여부(ON/OFF)를 설정합니다.</li>
          <li>구역별 <b>색상</b>과 <b>투명도</b>를 조절할 수 있습니다.</li>
          <li>전체 표시/숨기기 버튼으로 일괄 제어가 가능합니다.</li>
        </ol>
        <h4>사용 가능한 구역</h4>
        <table>
          <thead>
            <tr><th>구분</th><th>구역명</th></tr>
          </thead>
          <tbody>
            <tr><td>JWC 전쟁위험</td><td>Persian Gulf, Gulf of Oman, Gulf of Aden, Red Sea, Arabian Sea, Indian Ocean</td></tr>
            <tr><td>영해 (12NM)</td><td>Saudi Arabia, Israel, Lebanon</td></tr>
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: "ports",
    title: "포트 (항구) 관리",
    icon: "⚓",
    content: (
      <>
        <p>사이드바의 <b>Port</b> 탭에서 항구를 검색하고 지도에 표시합니다.</p>
        <h4>포트 검색</h4>
        <ul>
          <li>항구명 (영문/한글), 국가명, 또는 <b>UNLOCODE</b>로 검색할 수 있습니다.</li>
          <li>검색 결과에서 항구를 클릭하면 지도가 해당 위치로 이동합니다.</li>
        </ul>
        <h4>포트 추가</h4>
        <ul>
          <li>검색으로 찾을 수 없는 항구는 직접 추가할 수 있습니다.</li>
          <li>항구명, 위도/경도, 국가, UNLOCODE 등을 입력합니다.</li>
        </ul>
        <h4>포트 삭제</h4>
        <p>불필요한 포트는 삭제 버튼으로 제거할 수 있습니다.</p>
      </>
    ),
  },
  {
    id: "share",
    title: "공유 링크",
    icon: "🔗",
    content: (
      <>
        <p>외부 고객이나 파트너에게 선박 위치를 공유할 수 있습니다.</p>
        <h4>공유 링크 생성</h4>
        <ol>
          <li>사이드바 하단의 <b>🔗 공유 링크</b> 버튼을 클릭합니다.</li>
          <li>공유할 선박을 <b>복수 선택</b>합니다.</li>
          <li>공유 링크의 <b>라벨</b>(설명)을 입력합니다.</li>
          <li><b>생성</b> 버튼을 누르면 고유 URL이 생성됩니다.</li>
          <li><b>복사</b> 버튼으로 URL을 클립보드에 복사합니다.</li>
        </ol>
        <h4>공유 화면 (외부 사용자)</h4>
        <ul>
          <li>공유 링크를 받은 사람은 로그인 없이 접속할 수 있습니다.</li>
          <li><b>읽기 전용</b>으로 선박 위치, 항적, 위험구역을 볼 수 있습니다.</li>
          <li>선박 추가/삭제/편집은 불가합니다.</li>
        </ul>
        <h4>공유 관리</h4>
        <p>공유 패널에서 기존 공유 링크를 확인하거나 <b>삭제</b>할 수 있습니다.</p>
      </>
    ),
  },
  {
    id: "manual-position",
    title: "수동 위치 입력",
    icon: "📍",
    content: (
      <>
        <p>API 수신이 되지 않는 경우, 수동으로 선박 위치를 입력할 수 있습니다.</p>
        <h4>사용 방법</h4>
        <ol>
          <li>사이드바 상단의 <b>수동 입력</b> 버튼을 클릭합니다.</li>
          <li>대상 <b>선박</b>을 선택합니다.</li>
          <li><b>위도</b> (-90~90), <b>경도</b> (-180~180)를 입력합니다.</li>
          <li>선택적으로 속도(SOG), 침로(COG), 선수방위(HDG)를 입력합니다.</li>
          <li>시간은 기본적으로 현재 시간이 설정되며, 변경할 수 있습니다.</li>
          <li><b>저장</b> 버튼을 눌러 위치 데이터를 기록합니다.</li>
        </ol>
        <div className="info-box">
          수동 입력된 위치도 항적 라인과 재생에 포함됩니다.
        </div>
      </>
    ),
  },
  {
    id: "api-update",
    title: "API 강제 수신",
    icon: "🔄",
    content: (
      <>
        <p>자동 폴링(하루 6회) 외에 즉시 위치 데이터를 갱신합니다.</p>
        <h4>사용 방법</h4>
        <ol>
          <li>사이드바 하단의 <b>🔄 API 강제 수신</b> 버튼을 클릭합니다.</li>
          <li>관리자 비밀번호를 입력합니다.</li>
          <li><b>전체 선박</b> 또는 <b>특정 선박만</b> 선택하여 갱신할 수 있습니다.</li>
          <li>실행 로그가 실시간으로 표시됩니다.</li>
        </ol>
        <div className="warn-box">
          강제 수신도 API 크레딧을 소모합니다. 15분당 5회로 횟수가 제한됩니다.
        </div>
      </>
    ),
  },
  {
    id: "report",
    title: "리포트 출력",
    icon: "🖨️",
    content: (
      <>
        <p>현재 선박 위치 정보를 표 형태의 보고서로 인쇄하거나 PDF로 저장할 수 있습니다.</p>
        <h4>사용 방법</h4>
        <ol>
          <li>사이드바 하단의 <b>Export / Print Report</b> 버튼을 클릭합니다.</li>
          <li>브라우저의 인쇄 대화상자가 열립니다.</li>
          <li><b>인쇄</b> 또는 <b>PDF로 저장</b>을 선택합니다.</li>
        </ol>
        <h4>보고서 내용</h4>
        <table>
          <thead>
            <tr><th>항목</th><th>설명</th></tr>
          </thead>
          <tbody>
            <tr><td>Vessel Name</td><td>선박명 (별칭 우선)</td></tr>
            <tr><td>MMSI</td><td>해상이동업무식별번호</td></tr>
            <tr><td>Latitude / Longitude</td><td>현재 위치 좌표</td></tr>
            <tr><td>Speed (kn)</td><td>대지속력 (노트)</td></tr>
            <tr><td>Course / Heading</td><td>침로 / 선수방위 (도)</td></tr>
            <tr><td>Last Update (UTC)</td><td>마지막 수신 시간</td></tr>
            <tr><td>Status</td><td>Active(활성) / Stale(미수신) / No Data</td></tr>
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: "mobile",
    title: "모바일 사용법",
    icon: "📱",
    content: (
      <>
        <p>모바일에서는 하단 드로어 방식으로 UI가 변경됩니다.</p>
        <h4>모바일 전용 UI</h4>
        <ul>
          <li><b>하단 드로어</b> — 화면 하단에서 위로 스와이프하여 선박 목록 확인</li>
          <li><b>간략 정보 바</b> — 접힌 상태에서도 활성 선박 수와 상태 표시</li>
          <li><b>전체 화면 지도</b> — 드로어를 닫으면 지도가 전체 화면으로 표시</li>
        </ul>
        <h4>모바일에서의 기능 차이</h4>
        <ul>
          <li>사이드바 너비 조절은 데스크탑에서만 가능합니다.</li>
          <li>항적 재생 패널은 세로 배치로 변경됩니다.</li>
          <li>위험구역 설정 패널은 화면 너비에 맞게 조절됩니다.</li>
        </ul>
      </>
    ),
  },
  {
    id: "tips",
    title: "사용 팁 & FAQ",
    icon: "💡",
    content: (
      <>
        <h4>자주 묻는 질문</h4>
        <div className="faq-item">
          <p className="faq-q">Q: 선박이 지도에 표시되지 않습니다.</p>
          <p className="faq-a">A: 다음을 확인하세요: (1) 선박이 보관함에 있지 않은지, (2) 눈 아이콘으로 숨기지 않았는지, (3) MMSI 번호가 올바른지. 새로 추가한 선박은 다음 자동 폴링까지 기다리거나 API 강제 수신을 사용하세요.</p>
        </div>
        <div className="faq-item">
          <p className="faq-q">Q: 항적이 표시되지 않습니다.</p>
          <p className="faq-a">A: 항적 시간 설정을 확인하세요. 6시간으로 설정되어 있는데 최근 수신이 하루 전이라면 24시간 이상으로 변경하세요. 데이터 자체가 없다면 <b>히스토리 가져오기</b>를 사용하세요.</p>
        </div>
        <div className="faq-item">
          <p className="faq-q">Q: "Stale" 상태는 무엇인가요?</p>
          <p className="faq-a">A: 2시간 이상 위치 데이터가 수신되지 않은 상태입니다. 선박의 AIS 장비가 꺼져있거나, 통신 범위 밖에 있을 수 있습니다.</p>
        </div>
        <div className="faq-item">
          <p className="faq-q">Q: API 크레딧은 어떻게 관리하나요?</p>
          <p className="faq-a">A: 월 20,000 크레딧이 제공됩니다. 자동 폴링, 검색, 히스토리 가져오기, 강제 수신 모두 크레딧을 소모합니다. Admin 대시보드에서 사용량을 확인하세요.</p>
        </div>
        <h4>효율적인 사용을 위한 팁</h4>
        <ul>
          <li>불필요한 선박은 <b>보관</b>하여 자동 폴링 대상에서 제외하세요. (크레딧 절약)</li>
          <li>선박 색상을 구분하면 지도에서 한눈에 식별할 수 있습니다.</li>
          <li>자주 확인하는 항구는 <b>포트</b>에 등록해두면 빠르게 이동할 수 있습니다.</li>
          <li>외부 보고용으로는 <b>공유 링크</b>를 활용하면 상대방이 직접 확인할 수 있습니다.</li>
          <li><b>리포트 출력</b>을 PDF로 저장하면 이메일 첨부용 보고서로 활용할 수 있습니다.</li>
        </ul>
      </>
    ),
  },
];

export default function UserGuide({ onClose }) {
  const [activeSection, setActiveSection] = useState("overview");

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📖</span>
            <div>
              <h2 className="text-white font-bold text-lg">사용자 매뉴얼</h2>
              <p className="text-gray-400 text-xs">Vessel Tracking System Guide</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition p-2 hover:bg-gray-800 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* 좌측 목차 (데스크탑) */}
          <nav className="hidden sm:block w-56 border-r border-gray-700 overflow-y-auto flex-shrink-0 bg-gray-900/50">
            <div className="py-2">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition flex items-center gap-2 ${
                    activeSection === s.id
                      ? "bg-blue-600/20 text-blue-400 border-r-2 border-blue-500 font-semibold"
                      : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                  }`}
                >
                  <span className="text-base flex-shrink-0">{s.icon}</span>
                  <span className="truncate">{s.title}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* 모바일 목차 (드롭다운) */}
          <div className="sm:hidden border-b border-gray-700 px-4 py-2 flex-shrink-0">
            <select
              value={activeSection}
              onChange={(e) => setActiveSection(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-600"
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.title}
                </option>
              ))}
            </select>
          </div>

          {/* 콘텐츠 영역 */}
          <div className="flex-1 overflow-y-auto">
            <div className="guide-content p-5 sm:p-6">
              {sections.map((s) =>
                activeSection === s.id ? (
                  <div key={s.id}>
                    <h3 className="flex items-center gap-2 text-xl font-bold text-white mb-4">
                      <span className="text-2xl">{s.icon}</span>
                      {s.title}
                    </h3>
                    {s.content}
                  </div>
                ) : null
              )}

              {/* 하단 페이지네이션 */}
              <div className="flex justify-between mt-8 pt-4 border-t border-gray-700">
                {(() => {
                  const idx = sections.findIndex((s) => s.id === activeSection);
                  const prev = idx > 0 ? sections[idx - 1] : null;
                  const next = idx < sections.length - 1 ? sections[idx + 1] : null;
                  return (
                    <>
                      {prev ? (
                        <button
                          onClick={() => setActiveSection(prev.id)}
                          className="text-sm text-gray-400 hover:text-blue-400 transition flex items-center gap-1"
                        >
                          ← {prev.title}
                        </button>
                      ) : <div />}
                      {next ? (
                        <button
                          onClick={() => setActiveSection(next.id)}
                          className="text-sm text-gray-400 hover:text-blue-400 transition flex items-center gap-1"
                        >
                          {next.title} →
                        </button>
                      ) : <div />}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 가이드 전용 스타일 */}
      <style>{`
        .guide-content h4 {
          color: #93c5fd;
          font-size: 0.95rem;
          font-weight: 700;
          margin: 1.2rem 0 0.5rem 0;
        }
        .guide-content p {
          color: #d1d5db;
          font-size: 0.875rem;
          line-height: 1.7;
          margin-bottom: 0.5rem;
        }
        .guide-content ul, .guide-content ol {
          color: #d1d5db;
          font-size: 0.875rem;
          line-height: 1.8;
          padding-left: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .guide-content ul { list-style: disc; }
        .guide-content ol { list-style: decimal; }
        .guide-content li { margin-bottom: 0.2rem; }
        .guide-content b { color: #f9fafb; }
        .guide-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.75rem 0;
          font-size: 0.825rem;
        }
        .guide-content th {
          background: #1e293b;
          color: #93c5fd;
          text-align: left;
          padding: 0.5rem 0.75rem;
          font-weight: 600;
          border-bottom: 1px solid #374151;
        }
        .guide-content td {
          color: #d1d5db;
          padding: 0.45rem 0.75rem;
          border-bottom: 1px solid #1f2937;
        }
        .guide-content .info-box {
          background: #172554;
          border: 1px solid #1e40af;
          border-radius: 0.5rem;
          padding: 0.75rem 1rem;
          color: #93c5fd;
          font-size: 0.825rem;
          margin: 0.75rem 0;
          line-height: 1.6;
        }
        .guide-content .warn-box {
          background: #422006;
          border: 1px solid #92400e;
          border-radius: 0.5rem;
          padding: 0.75rem 1rem;
          color: #fbbf24;
          font-size: 0.825rem;
          margin: 0.75rem 0;
          line-height: 1.6;
        }
        .guide-content .faq-item {
          background: #111827;
          border-radius: 0.5rem;
          padding: 0.75rem 1rem;
          margin: 0.5rem 0;
        }
        .guide-content .faq-q {
          color: #f9fafb !important;
          font-weight: 600;
          margin-bottom: 0.25rem !important;
        }
        .guide-content .faq-a {
          color: #9ca3af !important;
          margin-bottom: 0 !important;
        }
      `}</style>
    </div>
  );
}
