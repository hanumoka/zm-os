# 작업공간 환경과 창 배치

대상: 로컬 이용자와 웹·BE 개발자. 소유자: zm-os. 검토일: 2026-11-06. 구현 선택은 [ADR-0049](../02-decisions/0049-workspace-sync-and-window-layouts.md)를 따른다.

## 직접 확인

전제: 같은 로컬 서버에 접속할 수 있고 시험 계정으로 로그인할 수 있어야 한다. 서로 다른 브라우저 또는 분리된 브라우저 프로필을 사용한다.

1. 바탕화면 또는 시작 메뉴에서 작업공간을 연다. 배경을 변경하고 서버 저장 상태를 확인한다.
2. 아이콘을 이동한 뒤 다른 브라우저에서 같은 계정으로 접속한다. 화면 복귀 또는 조회 주기 뒤 배경·배치를 확인한다. 다른 계정에는 적용되지 않아야 한다.
3. Store와 인앱을 열고 제목줄의 좌우 정렬 버튼으로 나란히 배치한다. 작업공간에서 ‘현재 창 배치 저장’을 누른다.
4. 새로고침하면 앱을 자동 실행하지 않는다. 작업공간에서 ‘저장한 창 복원’을 누르면 현재 권한으로 창을 연다. 이미 열린 창의 입력은 종료·초기화하지 않는다.
5. 연결 실패 시 저장 완료로 표시되지 않는지 확인한다. ‘다시 시도’로 저장 상태를 확인한다. 충돌 시 사용할 설정을 직접 선택한다.

완료 확인: 저장 상태, 두 브라우저의 환경, 새 실행 세션과 중지·동의 경계가 일치한다. 창 배치 저장은 메모 등 앱 내용 저장을 대신하지 않는다.

실패 시: 설정을 초기화하거나 앱을 삭제하지 말고 작업공간의 상태 안내를 확인한다. 미저장 변경은 해당 계정·탭에 남으므로 연결 복구 후 재시도한다. 탭 저장소까지 막힌 경우에는 새로고침 전 저장 성공을 확인한다. 실제 다른 PC는 같은 서버 접속 주소가 필요하며 localhost 주소가 자동 공유되지는 않는다.

## HTTP와 데이터

- GET `/v1/me/workspace?expectedUserId=<현재 계정 ID>`.
- PUT `/v1/me/workspace`: `{expectedUserId,revision,requestId,workspace}`. CSRF 필요.
- 응답: `{userId,revision,workspace,updatedAt,lastRequestId}`.
- `workspace`: schemaVersion 1, wallpaper(sky/sand/night), positions(시스템 앱별 column/row 0~999), windows(최대 24개).
- 창 항목: UUID key, kind(system/app), system 또는 appId·선택적 표시 이름, layout(rect, minimized, maximized, snap).
- rect는 x/y 0~10000, width/height 1~10000이다. 화면의 실제 표시는 현재 크기에 맞춰 제한한다.
- 잘못된 필드·URL·세션 등은 400, 인증·권한은 401/403, 현재 계정 불일치·수정 충돌·요청 ID 재사용은 409다.

원격 변경을 감지한 상태에서 자동 덮어쓰지 않는다. 마지막 요청의 응답만 잃었다면 같은 요청 재전송 또는 조회로 확인한다. 그 뒤 다른 기기 저장이 있으면 충돌로 처리해 사용자 선택을 받는다. 서버 시간과 수정 번호가 확정된 뒤 저장됨을 표시한다.

## 시험

`pnpm --filter @zm/platform-web test`는 동기화 순서·충돌·응답 소실·계정 전환·창 상태를 확인한다. `node scripts/platform-web-check.mjs workspace`는 독립 DB와 두 브라우저에서 실제 UI를 검증한다. `ZM_RECOVERY_INTEGRATION=1 pnpm test:recovery`는 도구가 만든 별도 DB·파일만 백업·복원한다. 운영 DB 초기화 명령으로 대체하지 않는다.
