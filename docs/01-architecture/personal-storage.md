# 개인 데이터 서버 저장 사용법

대상: 앱 개발자와 로컬 체험 사용자. 소유자: zm-os. 검토일: 2026-11-05.
설계·제한·삭제의 정본은 [ADR-0046](../02-decisions/0046-personal-server-storage.md)이다.

## 메모 앱 사용

전제: 같은 zm-os 서버에 로그인하고 서버 저장 권한이 추가된 메모 앱 1.1.0을 실행한다. 로컬 개발 서버는 `pnpm platform:dev`로 시작한다.

1. 새 이용 범위에 동의한 뒤 메모를 입력하고 **서버에 저장**을 누른다.
2. 저장 성공 안내를 확인한다. 다른 브라우저에서 같은 계정·서버·앱을 열어 동일한 내용을 확인한다.
3. 기존 기기 메모가 있으면 **이 기기의 기존 로컬 메모 가져오기**를 펼친다. 내용을 편집창에 가져온 뒤 저장하면 서버에 복사된다. 원본은 유지된다.
4. 충돌 시 서버의 최신 내용과 내 입력을 비교하고 필요한 내용을 직접 합친 뒤 저장한다.
5. 응답을 받지 못했으면 **같은 저장 요청 다시 확인**을 누른다. 연결 실패만으로 저장 완료를 표시하지 않는다.

완료 확인: 새로고침·새 로그인·다른 브라우저에서 서버 내용을 읽을 수 있다. 연결 실패 시 입력을 복사하거나 현재 기기의 초안을 확인한다. 이 초안은 다른 PC에서 조회할 수 없다. 32 KiB 제한을 넘는 메모는 줄인 뒤 저장한다. 새 계정으로 가입하면 이전 계정 데이터를 복구하지 않는다.

내 계정 → 이용 앱 관리에서 서버의 앱 데이터 전체 삭제와 현재 기기 데이터 삭제를 따로 할 수 있다. 앱 내부 **서버 메모 삭제**는 note 항목만 삭제한다. 운영 백업·외부 앱 서버까지 삭제 완료된다는 뜻은 아니다.

## SDK와 HTTP

매니페스트에 `cloud-storage`를 추가하고 검수·공개한다. 클라우드 사용은 개발자 외부 서버 등록을 요구하지 않는다. CLI init의 로컬 전용 템플릿과 이 서버 저장 예제는 다르다. CLI 단독 dev 호스트에서는 `CLOUD_UNAVAILABLE`이며 전체 플랫폼에서 시험한다.

```ts
import { zm } from '@zm/sdk';
await zm.runtime.ready();
const before = await zm.cloud.get('note');
const write = {
  generation: before.generation,
  expectedRevision: before.revision,
  requestId: crypto.randomUUID(),
  schemaVersion: 1,
  value: { text: '서버에 저장할 내용' },
};
const result = await zm.cloud.put('note', write);
// 응답 유실 시 새 ID를 만들지 말고 같은 write로 다시 호출한다.
// CLOUD_REVISION_CONFLICT는 최신 get 결과와 비교해 사용자가 결정한다.
const page = await zm.cloud.list({ limit: 50 });
// 삭제도 현재 generation·revision과 새로운 requestId를 전달한다.
await zm.cloud.remove('note', {
  generation: result.generation,
  expectedRevision: result.revision,
  requestId: crypto.randomUUID(),
});
```

호스트는 `POST /v1/app-sessions/:id/cloud`에 `{method,params}`를 전달한다. 로그인 쿠키와 CSRF가 필요하며 인앱은 직접 이 자격을 받지 않는다. method는 cloud.get/put/remove/list 중 하나다. params는 SDK 인자와 같고 put/remove에 key가 포함된다. 사용자·앱 ID·검수 여부를 넣으면 거부한다.

get은 `{generation,revision,exists,schemaVersion,updatedAt,value}`, put/remove는 value를 제외한 메타데이터를 반환한다. 없는 키는 exists=false·revision=0, 삭제된 키는 exists=false·양수 revision이다. null 값과 삭제는 exists로 구분한다. list는 `{generation,keys,nextCursor}`를 반환하고 삭제 표식은 제외한다. 페이지를 순회하는 동안 데이터가 바뀔 수 있어 스냅샷 조회를 보장하지 않는다.

키는 ASCII 영숫자로 시작하는 1~120자이며 이후 영숫자·점·밑줄·콜론·하이픈을 허용한다. schemaVersion은 1 이상 정수다. 앱이 값의 형식 이전을 담당하고 미래 형식을 읽지 못하면 기존 값을 덮어쓰지 않는다.

본인 전체 삭제는 `POST /v1/me/apps/:appId/cloud-clear`와 `{confirmed:true,expectedUserId,isPreview:false}`를 사용한다. isPreview=true는 본인의 검수 영역만 지운다. 다른 계정으로 바뀌면 거부한다. 삭제 후 기존 실행은 다시 열어야 한다.

대표 오류: PERMISSION_DENIED, SESSION_INACTIVE, CLOUD_REVISION_CONFLICT, CLOUD_STALE_GENERATION, CLOUD_REQUEST_REUSED, CLOUD_QUOTA_EXCEEDED, CLOUD_RATE_LIMITED, CLOUD_RECEIPT_LIMIT, INVALID_VALUE. 상세 한도와 처리 원칙은 ADR-0046을 따른다.
