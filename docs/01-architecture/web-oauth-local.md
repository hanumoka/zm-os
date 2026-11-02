# 실제 웹 로그인 설정과 확인

대상: 소유자와 로컬 시험 담당자. 마지막 검토: 2026-11-02.

실제 Google·GitHub 로그인 시험에는 각 제공자에 등록한 OAuth 앱의 ID와 secret이 필요하다. 모의 owner/alice/bob 로그인 통과는 실제 제공자 시험을 대신하지 않는다. 이번 로컬 확인에서 제품 main·작업본의 환경 파일과 trial 설정, Windows 환경변수, 제품 OAuth 이름 파일과 Downloads 최상위 파일명에는 설정이 없었다. 제공자 콘솔의 기존 앱 등록 여부는 확인하지 않았다.

## 등록 값

현재 로컬 웹 주소는 `http://localhost:4300`이다. 주소를 `127.0.0.1`로 섞지 않는다. 콜백은 웹 프록시를 거쳐 BE로 전달된다.

| 제공자 | 앱 종류 | 등록할 콜백 | 로컬 설정 키 |
|---|---|---|---|
| Google | Web application | `http://localhost:4300/v1/auth/google/callback` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| GitHub | OAuth App | `http://localhost:4300/v1/auth/github/callback` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |

Google은 본인 프로젝트의 Google Auth Platform에서 앱 정보·시험 대상자를 설정한 뒤 Web application client를 생성하고 위 URI를 등록한다. localhost URI는 시험에 사용할 수 있다. 필요한 범위는 코드의 `openid`이며 Drive 등 업무 API 권한은 요청하지 않는다. [Google 웹 서버 OAuth 공식 안내](https://developers.google.com/identity/protocols/oauth2/web-server).

GitHub에서는 Settings → Developer settings → OAuth apps에서 기존 앱을 확인하거나 새 앱을 등록한다. Homepage URL은 위 로컬 웹 주소, callback은 표의 GitHub 주소다. 이 구현은 웹 OAuth 흐름과 `read:user`를 사용하며 저장소 접근·device flow는 요구하지 않는다. [GitHub OAuth 앱 등록 안내](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).

## 로컬 적용

전제: 제공자 콘솔에서 본인 앱을 관리할 수 있고 [로컬 시험 환경](platform-trial.md)이 준비되어 있어야 한다.

1. 현재 시험을 실행하는 작업 폴더의 `.trial/config.json`이 Git ignored인지 `git check-ignore .trial/config.json`으로 확인한다.
2. 기존 DB·파일·자산 설정을 유지하면서 위 네 키를 로컬 편집기로 추가한다. 값을 대화·문서·스크린샷·Git에 넣지 않는다. `.env` 파일은 이 실행 도구의 자동 로드 경로가 아니다. API는 환경변수도 읽지만 `platform:dev`에서는 trial 파일 값이 우선하므로 두 곳에 다른 값을 두지 않는다.
3. 실행 중인 자기 `platform:dev`를 종료하고 다시 실행한다. 웹의 실제 로그인 버튼을 사용한다. 모의 로그인 버튼과 구분한다.
4. 제공자별 로그인 성공 후 `/me`에 연결 제공자가 표시되는지 확인한다. 시험 계정은 모의 owner와 다른 계정이며 운영자가 자동 부여되지 않는다. 필요한 운영자 지정은 로컬 시험 안내의 admin 명령을 따른다.

완료 확인은 아래 시나리오의 실제 화면·응답 결과로 남긴다. 설정 키 존재나 302 이동만으로 실제 로그인 성공으로 기록하지 않는다.

## 실제 시험 목록

| 흐름 | 확인할 결과 |
|---|---|
| Google·GitHub 각각 처음 가입 | 제공자 인증 후 연령 자가 확인, 생년월일·실명 추가 수집 없음, Store 복귀 |
| 거절·취소·잘못된 callback/state | 계정·세션·앱 실행을 만들지 않고 오류 안내 |
| 각각 별도 가입한 두 계정 | 이메일이 같아도 합병하지 않음, 연결 시 이미 사용 중 안내, 기존 데이터 유지 |
| 아직 가입하지 않은 두 번째 제공자 연결 | 로그인한 계정과 양쪽 인증을 거쳐 연결, 내 앱·앱 소유권 유지 |
| 최근 인증과 연결 해제 | 재인증 후 한 수단 해제, 마지막 수단 해제 거부, 해제한 세션으로 접근 거부 |
| 실제 사용자로 서버 없는 앱·외부 API 앱 실행 | 동의→격리 실행→저장·외부 권한 확인, 다른 계정 데이터 비노출 |
| 재인증 후 탈퇴·재가입 | 이전 세션 종료, 조회 전용 삭제 상태, 새 계정·새 앱 식별자 |

실패 대응: `OAUTH_NOT_CONFIGURED`/503은 키 적용과 재시작, `redirect_uri_mismatch`는 등록 URI와 주소·포트 일치, 제공자 접근 거부는 앱의 시험 대상자 설정을 확인한다. state/교환 실패는 브라우저를 localhost로 통일하고 새 로그인 흐름에서 재현한다. 로그에는 오류 종류만 남기고 code·token·secret·쿠키는 남기지 않는다. 계정 선택 화면은 비밀번호 재입력이나 강한 본인 확인을 보장하지 않으며 제공자의 실제 재인증 동작을 별도로 관찰한다.
