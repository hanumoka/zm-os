# Freedoom · DOOM 엔진 체험

- 목적: 일반 개발자의 웹 게임을 ZIP 업로드·검증·검수·공개한 뒤 Store에서 실제 실행한다.
- 대상: zm-os 개발자와 검수자. 마지막 검토: 2026-11-06.
- 화면: 게임 캔버스를 중심에 두고 어두운 배경, 따뜻한 흰색, 회색, 황토색 버튼을 쓴다. 시스템 글꼴과 작은 고정폭 보조 문구를 사용한다. 별도 홍보 화면 없이 시작·정지·조작 안내·라이선스를 제공한다.

원작 DOOM의 상용 WAD는 포함하지 않는다. doomgeneric의 GPL-2.0-or-later 엔진과 Freedoom 0.13.0의 BSD-3-Clause 데이터를 조합했다. 이 변형은 E1M1만 제공하며 메뉴·다음 레벨은 E1M1로 돌아간다. 음향·멀티플레이·영구 저장은 제공하지 않는다. 게임 내부 저장은 휘발성 메모리 파일이며 창을 닫으면 사라진다. 별도의 앱 서버·사용자 정보·저장 권한·외부 API는 필요하지 않다.

## 재현과 배포

전제조건: Python 3.11+, Docker, 저장소의 고정 pnpm 버전 및 의존성. Docker 이미지는 tools/build.py의 digest로 고정했다. 처음 재현할 때 원본 두 개와 도구 이미지를 다운로드한다. 일반 앱 빌드에는 이미 추적된 public 생성물을 사용한다.

1. 저장소 루트에서 `python examples/freedoom/tools/build.py`를 실행한다. SHA-256으로 원본을 검증하고 지도·텍스처를 줄인 데이터, WebAssembly를 포함하는 JS, 대응 소스 묶음을 만든다.
2. `pnpm --filter @zm/cli cli build ../../examples/freedoom`으로 표준 앱 빌드를 수행한다. 실제 앱 등록 후 받은 appId를 manifest에 넣는다.
3. CLI의 pack으로 제출할 ZIP을 만든다. 기존 ZIP 5 MiB / 해제 20 MiB 제한을 그대로 통과해야 한다.
4. 개발자는 업로드 결과가 통과하면 검수를 제출한다. 운영자가 승인한 뒤 소유 개발자가 공개한다. 사용자는 Store에서 게임을 실행하고 이용 안내에 동의한다.
5. 시작 버튼, 이동·발사, 창 이탈 시 정지, 재개, 소스 열기를 확인한다. 실패하면 개발자는 새 버전을 제출한다. 공개 중단으로 새 실행을 막을 수 있다.

엔진은 별도 네트워크 요청 없이 JS에 포함된 Wasm을 컴파일한다. 앱 데이터도 gzip으로 묶어 브라우저 메모리에서 풀고 Emscripten 파일 시스템에 넣는다. 동작에 wasm-unsafe-eval이 필요하지만 JavaScript eval이나 Function 생성은 사용하지 않는다. 호스트는 기존 sandbox allow-scripts와 외부 연결 차단을 유지한다.

## 소스와 라이선스

public/source-code.js는 gzip/base64 JSON에 엔진 전체 C/헤더, 수정한 게임 전이, Canvas 어댑터, 빌드 스크립트, UI 원본과 라이선스를 담는다. 앱의 ‘소스·라이선스 열기’에서 네트워크 없이 파일별 전문을 확인하고 복사할 수 있다. 새 빌드는 반드시 코드 변경 후 실행하여 소스와 실행 파일을 함께 갱신한다. BUILD.json에 정확한 upstream commit, 다운로드 체크섬, 도구 이미지, 컴파일 명령이 있다. 데이터 변경은 지도·음악·미사용 벽 텍스처 제거이며 Freedoom 저작자 목록과 BSD 고지는 묶음에 유지한다.

- 엔진: https://github.com/ozkl/doomgeneric/tree/e257a09527062bfb986b6e5e0780839b6cbd5b71
- 데이터: https://github.com/freedoom/freedoom/releases/tag/v0.13.0
- 변경한 C 어댑터와 이 예제 UI/빌드 코드: GPL-2.0-or-later.

Freedoom과 원저작자는 이 배포를 보증하거나 후원하지 않는다. 원작 DOOM의 이름은 엔진 계보를 설명하기 위한 것이다.
