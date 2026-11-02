# zm-app CLI

대상: TypeScript·JavaScript 앱 개발자와 AI 개발 도구. 검토일: 2026-11-01. 실행 전 Node.js 24와 저장소 의존성 설치가 필요하다.

명령은 `pnpm --filter @zm/cli cli` 또는 빌드 후 `node packages/cli/dist/cli.js`로 시작한다. 앱 프로젝트 경로는 절대 경로 사용을 권장한다.

| 명령 | 동작 |
|---|---|
| `init <새 폴더> --app-id <등록 UUID>` | 개인 메모 앱 소스·매니페스트 생성. 기존 폴더 덮어쓰기 거부 |
| `build <앱 폴더>` | 소스와 SDK를 묶어 dist 생성. 임의 npm 스크립트 실행 없음 |
| `validate <앱 폴더 또는 ZIP>` | 매니페스트·ID·경로·파일 수·확장 크기·일부 비밀 패턴 검사 |
| `pack <앱 폴더> --out <새 ZIP>` | dist 검증 후 ZIP 작성. 기존 ZIP 덮어쓰기 거부 |
| `dev <앱 폴더>` | 독립 시험 호스트와 자산 서버 실행. 실제 로그인·실제 앱 인증 코드 발급 없음 |

`init/build/validate/pack --json`은 JSON 한 줄을 반환하며 실패는 stderr JSON과 종료 코드 1이다. 성공은 종료 코드 0이다. loopback HTTP API가 있는 예제의 validate·pack에는 `--local-test`를 명시한다. 원격 HTTP는 시험에서도 거부한다.

번들은 루트 `manifest.json`, `index.html`과 정적 자원이다. 경로 순회·역슬래시·숨김 파일·심볼릭 링크·중복 이름·암호화 ZIP을 거부한다. ZIP은 순차 해제하며 선언 크기와 실제 해제 바이트를 함께 제한한다. 검사는 JavaScript의 악성 행위를 증명하거나 운영자 검수를 대체하지 않는다.

현재 시험 한도는 공통 계약의 `TEST_LIMITS`다. 운영 권장값이 아니다. 값 변경은 플랫폼·CLI를 함께 검증해야 한다. API worker는 `@zm/cli`의 `validateZip`을 호출하므로 수신 측도 동일 검사를 수행한다.

실패 시 오류에 따라 소스·매니페스트·등록 ID를 수정하고 다시 build→validate→pack 한다. dist가 도구 관리 파일 목록과 다르면 빌드는 대체를 거부한다. 사용자가 그 파일을 별도 보관한 뒤 출력 상태를 정리해야 한다.

참고: [yauzl 순차 해제 API](https://github.com/thejoshwolfe/yauzl), [yazl 생성 API](https://github.com/thejoshwolfe/yazl).
