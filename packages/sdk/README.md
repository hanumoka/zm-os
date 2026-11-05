# 인앱 SDK

2026-11-05: `cloud-storage` 권한과 `zm.cloud.get/put/remove/list`를 추가했다. [개인 저장 계약과 예제](../../docs/01-architecture/personal-storage.md#sdk와-http)를 따른다. 기존 `zm.storage`는 현재 기기의 IndexedDB이며 자동 동기화되지 않는다.

대상: 앱 개발자. 검토일: 2026-11-01. `createSdk()` 또는 기본 `zm`을 사용한다. CLI 빌드가 SDK를 번들에 포함하므로 앱 실행 중 외부 패키지 CDN이 필요하지 않다.

```ts
import { zm } from '@zm/sdk';
await zm.runtime.ready();
const { appUserId } = await zm.identity.getAppUser();
await zm.storage.set('note', '현재 기기의 개인 메모');
const note = await zm.storage.get('note');
```

앱은 승인된 `local-storage`, `cloud-storage`, `app-identity`, `external-api` 범위만 호출한다. 사용자 ID·다른 앱 ID를 저장 호출에 전달하는 기능은 없다. 플랫폼 세션·제공자 토큰·이메일을 전달하지 않는다. 저장값은 JSON이며 바이너리·함수·순환·비유한 수를 거부한다. 저장 실패를 성공으로 표시하지 말고 사용자에게 재시도 선택을 제공한다.

외부 서버 인증은 서버가 만든 PKCE challenge를 `zm.auth.createCode(challenge)`에 전달하고 단회 코드를 해당 서버로 보낸다. verifier와 서버 자격은 앱 번들에 두지 않는다. 자세한 흐름은 `examples/api-client`와 `examples/api-server`를 참조한다.

실행 호스트의 문서 URL에는 `instance`가 있다. SDK는 부모 window와 실행 인스턴스가 일치하는 MessagePort만 받는다. 호스트는 iframe의 window를 확인한다. opaque origin인 `null`만으로 연결을 신뢰하지 않는다. 일반 브라우저 탭에서 직접 실행하면 `NO_HOST`, 응답 지연은 `TIMEOUT`, 종료 후 호출은 `CLOSED`다.

완료 확인: `pnpm --filter @zm/sdk test`와 CLI 시험 호스트의 실제 메모 저장·사용자 전환을 수행한다. 단위 시험만으로 브라우저 격리가 검증된 것은 아니다. [MessageChannel API](https://developer.mozilla.org/en-US/docs/Web/API/MessageChannel).
