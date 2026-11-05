# 앱 개발 예제

대상: 앱 개발자·구현 검증 담당자. 검토일: 2026-11-01. 두 예제 모두 로컬 시험용이며 운영 배포 절차가 아니다.

## 서버 없는 개인 메모

개발자 콘솔에서 앱을 등록한 뒤, CLI로 플랫폼 저장소 밖의 새 폴더에 만들 수 있다.

`local-notes/`는 1.1.0부터 서버 저장 메모 예제다. CLI init은 로컬 전용 템플릿을 유지한다. 고정된 예제 앱 ID는 실제 등록한 앱 ID로 바꾼 뒤 제출한다. [서버 저장 체험·계약](../docs/01-architecture/personal-storage.md)을 따른다.

```sh
pnpm --filter @zm/cli cli init ../../my-zm-notes --app-id 콘솔에서받은앱UUID
pnpm --filter @zm/cli cli build ../../my-zm-notes
pnpm --filter @zm/cli cli dev ../../my-zm-notes
pnpm --filter @zm/cli cli pack ../../my-zm-notes --out ../../my-zm-notes.zip
```

`pnpm --filter`는 패키지 폴더에서 명령을 실행한다. 혼동을 피하려면 외부 프로젝트 경로는 절대 경로로 전달한다. CLI를 빌드한 뒤에는 `node packages/cli/dist/cli.js init <절대 경로>`도 사용할 수 있다.

시험 호스트는 `http://127.0.0.1:4321`이다. Alice 메모 저장 → Bob 전환 → 빈 메모 확인 → Alice 복귀 → 메모 유지 순서로 사용자 격리를 확인한다. 일반 중지는 새 실행만 막고 긴급 중지·동의 철회는 실행을 종료한다. 연결 단절은 SDK 권한 확인을 실패시킨다. 종료는 `Ctrl+C`다. 서버가 시작되지 않으면 4321·4322 포트를 점검한다.

## 개발자 외부 API 메모

1. 콘솔에서 별도 앱을 등록하고 `api-client/manifest.json`의 앱 ID를 등록 ID로 바꾼다.
2. 해당 앱의 서버 자격을 발급해 현재 셸의 `APP_ID`, `APP_SECRET` 환경변수로 설정한다. 저장소 파일·앱 번들에 넣지 않는다.
3. Node.js 24에서 `node --experimental-strip-types examples/api-server/server.ts`를 실행한다. 개발자 서버는 4320 포트, 플랫폼 API는 4310 포트를 사용한다.
4. CLI로 `api-client`를 build·pack한다. 로컬 HTTP 목적지가 있으므로 pack에 `--local-test`를 준다.
5. ZIP 제출 → 검사 → 운영자 승인 → 소유 개발자 공개 → 사용자 동의 → 실행한다. 실행 앱의 서버 연결 후 메모를 저장한다.
6. 다른 사용자로 실행하여 메모가 섞이지 않는지 확인한다. 동의 철회나 긴급 중지 후 서버 요청은 거부되어야 한다.

PKCE verifier와 앱 서버 자격은 외부 서버에만 있다. 브라우저에는 시도 ID·challenge와 앱 서버 세션만 전달한다. 서버는 매 메모 요청에서 플랫폼 introspection을 확인한 뒤 SQLite 작업을 시작한다. 이미 허용된 DB 작업은 이후 철회로 되돌리지 않는다. `admittedAt`은 그 구분을 시험하기 위한 응답이다.

SQLite는 `api-server/.data/notes.sqlite`에 남으며 앱 개발자 소유 데이터다. 플랫폼 탈퇴가 이 파일을 자동 삭제하지 않는다. 개발자는 삭제 콘솔의 앱별 식별자로 해당 행을 삭제한 뒤 처리 결과를 등록해야 한다. 이 예제의 인증 세션·진행 중 인증 시도는 메모리이며 서버 재시작 후 다시 연결한다. 실제 운영의 보관·백업·가용성 설계를 제공하는 예제가 아니다.
