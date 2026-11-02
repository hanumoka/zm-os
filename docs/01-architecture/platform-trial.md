# 독립 앱 플랫폼 로컬 시험

대상: 소유자와 구현 담당자. 마지막 검토: 2026-11-02. 제품 정책은 zm-docs가 정본이며 구현 선택은 [ADR-0042](../02-decisions/0042-platform-rebuild-local-trial.md), API는 [시험 계약](platform-api-trial.md)을 따른다.

현재는 [웹 우선 결정](https://github.com/hanumoka/zm-docs/blob/main/docs/governance/decisions/DEC-0148-zm-os-complete-web-before-android.md)에 따라 웹·BE·worker·SDK·CLI를 먼저 완성한다. Android 추가 구현·네이티브 빌드·설치·기기 시험은 웹 완료 후 진행한다. 기존 Android 코드는 보존한다. [웹 완료 검증 목록](web-completion-checklist.md)에서 웹에 필요한 실제 OAuth와 남은 조건을 확인한다.

## 실행

전제: Node.js 24, 저장소 지정 pnpm, 실행 중인 Docker. Git 기본 브랜치의 기존 POC와 새 플랫폼은 별도 프로그램이다.

1. `pnpm install`로 의존성을 설치한다.
2. `pnpm platform:setup`으로 이 작업 전용 PostgreSQL 컨테이너와 비밀 설정을 생성한다. 외부 서비스 계정이나 유료 자원은 만들지 않는다.
3. `pnpm platform:dev`로 API 4310, 자산 서버 4311, worker, 웹 4300을 실행한다.
4. `http://localhost:4300`에서 로그인 화면을 연다. 모의 Google·GitHub 로그인과 실제 인증 버튼은 별개다. 모의 owner는 운영자, alice·bob은 일반 사용자로 시작한다. 개발자 자격은 신청·운영자 승인으로 얻는다.
5. 개발자 공간에서 앱 ID를 생성하고 [CLI](../../packages/cli/README.md)로 번들을 만든다. 업로드→검사 완료→검수 제출→운영자 승인→소유자 공개 순서다. 운영자 승인은 자동 공개가 아니다.
6. Store에서 내 앱 추가·사전 동의·전체 화면 실행을 확인한다. API 앱은 [외부 서버 예제](../../examples/README.md)의 별도 서버도 실행한다.

완료 확인: `/v1/health` 응답, 웹 Store, worker의 검증 상태, 두 종류 앱의 실행을 각각 확인한다. 화면이 보인다는 것만으로 실제 인증·Android 검증이 완료되지 않는다.

실패 대응: Docker 준비 실패는 Docker 상태와 15438 포트를 확인한다. 4300/4310/4311 포트가 이미 사용 중이면 기존 자기 시험 프로세스를 종료한다. 앱 검사 실패는 버전의 오류를 확인한 뒤 CLI에서 수정·검증한다. 임의로 승인 상태나 공개 포인터를 DB에서 고치지 않는다.

종료: 실행 터미널에서 Ctrl+C로 자기 하위 프로세스를 종료한다. DB는 `pnpm platform:stop`으로 멈춘다. 시험 DB를 버릴 때만 `node scripts/platform-trial.mjs reset --confirm-trial-data`를 쓴다. 소유 label이 다른 컨테이너는 삭제하지 않는다. 이 reset은 이 도구의 컨테이너만 지우며 파일 저장 영역·브라우저 저장은 따로 남는다. 새 빈 DB로 시작해도 예전 파일이 공개되지는 않는다.

## 구성과 책임

| 구분 | 구현 | 책임 |
|---|---|---|
| 웹 FE | React + Vite, `apps/platform-web` | Store·계정·개발자·운영자·격리된 앱 실행 |
| Android FE | Expo + React Native WebView, `apps/android` | 신뢰 웹 호스트, 외부 브라우저 인증·단회 복귀 연결 |
| BE | TypeScript + NestJS, `apps/api` | 권한·동의·버전·검수·공개·사용자별 실행·탈퇴 |
| 작업 프로세스 | `apps/worker` | ZIP 검사·불변 파일 준비·프로필 삭제 작업 |
| 플랫폼 DB | 로컬 PostgreSQL 17 | 관계·유일 제약·감사·작업 상태·세션 |
| 파일 저장 | `.trial/files` | 비공개 업로드·revision별 준비 자원. HTTP 서버는 승인된 포인터와 실행 자격으로 접근 |
| 개발 도구 | 계약·SDK·호스트 브리지·CLI | 앱 생성·검사·패킹·독립 시험 호스트 |
| 인앱 BE·DB | 개발자 외부 서버 | 앱 업무 데이터. 플랫폼 DB와 공유하지 않음 |

웹 API에는 HttpOnly 세션과 CSRF를 사용한다. 인앱은 플랫폼 쿠키나 제공자 토큰을 받지 않으며 MessagePort의 정해진 SDK만 호출한다. 자산은 다른 origin에서 제공하고 iframe에는 `allow-scripts`만 부여한다. 불신 앱의 JavaScript가 항상 안전하거나 CPU 고갈이 완전히 방지된다는 보장은 없다.

현재 DB 변경은 PostgreSQL advisory transaction lock으로 직렬화한다. 로컬 상태 경쟁을 우선 검증하기 위한 선택이며 운영 처리량에 대한 검증은 없다. 높은 부하에 사용할 때는 모듈 분리·행별 잠금·부하 측정이 후속이다. API가 버전 업로드를 검사하며 worker가 다시 지문을 확인하고 준비한다. worker의 revision별 디렉터리와 DB 포인터를 분리해 이전 lease의 결과가 공개 자원을 덮어쓰지 못하게 한다.

## 검증과 범위

`pnpm --filter @zm/api test`는 별도 이름의 PostgreSQL DB와 HTTP 서버를 만들고 시험 후 제거한다. 실행 중인 화면용 DB를 초기화하지 않는다. SDK·호스트 브리지·CLI 시험은 각 패키지의 `test`를 사용한다. 전체 검사는 `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm build`다. CLI 브라우저 재현은 `node packages/cli/e2e/dev-host.mjs`다.

단위/통합·브라우저 시험의 측정 결과는 [2026-11 작업 기록](../11-archive/2026-11.md)에 있다. 웹 완료에는 실제 Google·GitHub 계정 로그인을 포함한 웹 인수 근거가 필요하다. Android 설치·실행은 후속 단계의 별도 증거이며 웹 완료 조건으로 쓰지 않는다. 지금 웹 완료 판정은 내리지 않는다.

검수자는 제출된 불변 버전을 비공개로 실행하고 원본 ZIP을 인증된 다운로드 경로로 확인할 수 있다. 검수용 실행에 동의해야 하며 앱별 사용자 식별자와 호스트 로컬 저장을 일반 실행과 분리한다. 외부 서버에는 `isPreview`도 전달한다. 검수용 사용자 데이터가 외부 서버에 쓰인다면 탈퇴 시 그 별도 식별자에 대한 삭제 요청도 생성한다. 검수 통과는 광고·공개 사용자 콘텐츠 등 제외 기능이 없다는 운영자의 내용 확인까지 포함해야 한다. 자동 ZIP 검사는 그 판단을 대신하지 않는다.

## 웹 단계에서 남은 확인

- 실제 OAuth 작업은 소유자 요청으로 일시 보류했다. 재개 후 앱 설정·콜백·계정 연결·재인증을 확인한다. 제공자 화면의 계정 선택이 강한 재인증을 보장하는지도 확인해야 한다.
- 웹의 전체 수락 시나리오에 대한 최종 완료 판정과 재현 근거. 로컬 모의 제공자 시험과 실제 계정 로그인 시험을 합치지 않는다.
- 시험 DB 복원은 아래 독립 fixture 근거를 확인한다. 운영 백업·복원은 별도 단계다.

다음 항목은 웹 완료 이후다.

- Android SDK·기기 설치, 로그인 복귀·WebView 쿠키·격리·연결 단절 실측. 현재 계정에 결합한 단회 인증 시작·교환과 WebView 탐색 패치는 보존하며 전용 추가 구현·시험은 재개하지 않는다.
- 운영 공급자·보관 기간·백업/복원·성능 목표·기기별 삭제 확인. 현재 시험 수치는 운영 기본값이 아니다.

탈퇴 상태의 `platformStatus=completed`는 시험 DB의 로그인 식별자·내 앱·동의·프로필 내용을 정리한 상태다. 감사·탈퇴·외부 삭제 연결용 내부 식별자는 남는다. 다른 기기, 브라우저의 물리 저장, 외부 DB, 운영 백업까지 삭제 완료했다는 뜻이 아니다. 외부 삭제는 `developer_reported_completed`로 개발자의 보고임을 구분한다.

## 실제 인증 설정

등록 값·로컬 파일 적용·실제 시험 시나리오는 [실제 웹 로그인 설정](web-oauth-local.md)을 따른다. 2026-11-02 로컬 점검에서 키를 찾지 못했고 제공자 콘솔의 기존 등록 여부는 확인하지 않았다.

API 환경에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`을 비공개로 설정한다. 실제 값은 문서·코드·로그에 넣지 않는다. 콜백은 각각 `http://localhost:4300/v1/auth/google/callback`, `http://localhost:4300/v1/auth/github/callback`이다. 제공자에 등록한 URL과 정확히 같아야 한다. 설정이 없으면 실제 로그인은 503을 반환한다.

초기 운영자는 실제 인증을 마친 기존 계정을 로컬 배포 담당자가 지정한다. `pnpm --filter @zm/api admin list`로 계정 ID·상태·연결 제공자를 확인하고 `admin grant <계정 UUID>`로 부여하거나 `admin revoke <계정 UUID>`로 회수한다. 마지막 활성 운영자 회수와 비활성 계정 부여는 거부한다. 이 명령은 로컬 DB 관리 자격이 있는 실행자만 쓸 수 있고 작업을 감사 이력에 남긴다. 공개 가입 API에 운영자 역할 입력을 열지 않으며 모의 owner를 실제 제공자 계정으로 바꾸지 않는다.

Android 시험 환경은 [Android 안내](../../apps/android/README.md)를 따른다. WebView 라이브러리의 프레임 정보 전달 및 탐색 검사 무응답 차단을 최소 패치로 고정했다. 패치의 Java 컴파일·실제 탐색은 Android SDK와 기기가 있어야 검증할 수 있다. 기기에서 localhost를 사용할 때 웹·자산·외부 API 포트를 각각 연결해야 한다.

참고한 공식 문서: [NestJS 시작](https://docs.nestjs.com/first-steps), [Google 웹 서버 OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [Expo WebView](https://docs.expo.dev/versions/latest/sdk/webview/).

## 독립 웹 흐름 시험

전제: `pnpm install`과 `pnpm platform:setup`, 웹 14600·API 14610·자산 14611 포트가 비어 있어야 한다. 기본 브라우저는 Windows의 Edge이며 Linux에서는 `pnpm --filter @zm/platform-web exec playwright install --with-deps chromium` 후 `PLAYWRIGHT_CHANNEL=chromium`을 환경변수로 지정한다.

1. `pnpm test:web-flows`를 실행한다. 부분 확인은 `node scripts/platform-web-check.mjs` 뒤에 `external-deletion`, `moderation`, `runner-lifecycle` 중 하나를 지정한다.
2. 도구는 trial 컨테이너의 소유 label을 확인하고 무작위 `zmwebui_` DB·임시 파일·자기 서버를 만든다. 기존 `zmtrial`·`.trial/files`를 초기화하지 않는다. 외부 삭제 8개·검수 표본 5개·실행 화면 2개 확인을 같은 전용 환경에서 실행한다. 마지막 시험은 실제 FE와 합성 HTTP 응답으로 초기 실행 40회와 후속 문서 이동을 확인한다.
3. `apps/platform-web/e2e-out/`의 실행별 `result.json`과 스크린샷을 확인한다. 조회 자격은 스크린샷에서 가리고 원문 오류 로그를 출력하지 않는다. CI는 결과 JSON만 보관한다.

완료 확인: 명령 exit 0, 세 결과의 `completed:true`, 브라우저 오류 0, 자기 자원 정리 안내를 확인한다. 브라우저 표본은 모의 로그인 또는 합성 응답만 사용하며 실제 OAuth·운영 앱 검수·실제 외부 삭제를 대신하지 않는다.

실패 대응: 실패 코드와 마지막 통과 단계·가려진 로컬 스크린샷으로 확인한다. 비밀이 포함될 수 있는 Playwright 원문 오류·trace는 공개 로그에 추가하지 않는다. 실행기는 성공·실패 시 자기가 만든 DB·파일·서버만 정리하며 정리 실패도 비정상 종료한다. 브라우저 시작 실패의 정리도 시험했다. 프로세스 강제 종료나 OS 장애 뒤 정리 완료까지 보장하는 것은 아니다.

## 별도 시험 데이터의 복구 확인

전제: `platform:setup`의 소유 label을 가진 PostgreSQL 컨테이너가 실행 중이고 로컬 설정·의존성이 준비되어 있어야 한다.

1. `pnpm platform:recovery`를 실행한다. 도구는 무작위 전용 DB와 임시 파일 영역에 두 앱 버전 fixture를 만들고 쓰는 프로세스를 멈춘다. 기존 화면용 `zmtrial`과 `.trial/files`는 백업·삭제 대상으로 사용하지 않는다.
2. DB dump와 파일 SHA256 목록을 함께 만들고 새 DB·폴더에 복원한다. 손상·누락, 기존 대상 덮어쓰기, 복원 실패의 정리와 새 대상 재시도를 시험한다.
3. 복원 DB에서 HTTP 실행·원본 ZIP·준비 HTML을 확인한다. 승인된 이전 버전 공개 시 신규 실행과 기존 실행의 버전이 각각 올바른지 확인한다.

완료 확인: 명령 exit 0과 `.trial/recovery-report.json`의 `ok:true`. 보고서는 성공 및 자기 시험 자원 정리 후 기록한다. 기본 단위 시험은 `pnpm test:recovery`, 실제 통합은 `ZM_RECOVERY_INTEGRATION=1` 환경변수로 같은 명령을 실행한다. CI에도 실제 통합을 연결했다.

실패 대응: 도구가 만든 DB·폴더만 정리한다. 실행 시작 시 과거 성공 보고서를 제거하므로 실패를 이전 성공으로 해석하지 않는다. 실패 원인을 확인한 뒤 새 무작위 대상으로 재실행하며, 일반 사용 DB를 수동 초기화하지 않는다. 이는 정지한 시험 fixture의 복원 검증이며 운영 중 백업의 일관성·RPO/RTO·키 복구·스키마 downgrade·외부 앱 DB 복구를 보장하지 않는다.
