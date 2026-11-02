# 실행 호스트 브리지

대상: zm-os 호스트 구현자. 검토일: 2026-11-01. ADR-0042의 메시지·저장 경계를 구현한다.

`attachHostBridge({iframe,userId,session,authorize,createCode,onClose})`를 iframe 문서 로드 전에 호출한다. 반환값의 `dispose()`는 종료·사용자 변경·동의 철회 때 호출한다. `authorize()`는 현재 실행을 서버에서 확인하며 401·403·404 오류에는 숫자 `status`를 포함한다. 일시 연결 실패는 SDK 요청을 거부하지만 기존 화면을 자동으로 새 실행하지 않는다.

연결 조건은 정확한 iframe window, opaque origin, URL의 실행 인스턴스와 HELLO의 인스턴스 일치다. 그 뒤 전용 MessagePort로만 SDK를 처리한다. `allow-scripts` 이외의 sandbox 권한이 있는 iframe을 거부한다. iframe의 두 번째 load는 문서 이동으로 취급해 종료한다. SDK 메서드·권한·인자·메시지 크기·요청 속도·동시 요청을 확인하며, dispose 이후 비동기 결과는 전달하지 않는다.

IndexedDB의 키는 `[userId, appId, key]`이며 앱이 앞의 두 값을 고르는 API가 없다. 앱별 총량 확인과 쓰기는 같은 readwrite 트랜잭션이다. `clearAppStorage(userId,appId)`는 호스트의 별도 삭제 확인 후 호출한다. 내 앱 제거·동의 철회와 데이터를 자동으로 묶어 삭제하지 않는다. 삭제는 현재 기기의 이 파티션에만 적용된다.

미리보기 실행은 저장 키의 앱 부분을 `preview:<appId>`로 고정한다. 같은 사용자가 같은 앱을 일반 실행하더라도 저장 영역을 공유하지 않는다. `clearPreviewStorage(userId,appId)`는 별도 확인 후 미리보기 영역만 삭제하며 일반 실행 데이터는 유지한다. SDK가 임의로 preview 여부를 바꾸는 인자는 없다.

검증은 `pnpm --filter @zm/host-bridge test`, 실제 iframe·저장 검증은 `node packages/cli/e2e/dev-host.mjs`다. 후자는 저장소의 기존 `@zm/web` Playwright 설치와 Chrome을 사용한다. 브라우저가 없으면 해당 계층은 미검증으로 기록한다.
