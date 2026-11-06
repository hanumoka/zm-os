# 로컬 시험 API 계약

2026-11-05 추가: 개인 데이터의 SDK·HTTP 요청/응답·오류는 [개인 저장 계약](personal-storage.md#sdk와-http)을 따른다.

대상: 웹·SDK·BE 구현 담당자. 소유자: 프로젝트 소유자. 검토일: 2026-11-02. ADR-0042의 구현 계약이며 운영 공개 판이 아니다.

API는 `/v1`, JSON을 반환한다. 오류는 `{code,message}`와 HTTP 400/401/403/404/409/413/429. 웹 same-origin 프록시를 통해 HttpOnly 쿠키를 사용하고 인증된 변경 요청은 `X-CSRF-Token`을 보낸다. GET `/me` 응답의 csrf를 사용한다. 이메일 인증의 모든 POST는 설정한 웹 Origin도 요구한다. 비밀번호·증명 규칙은 [ADR-0045](../02-decisions/0045-email-password-and-desktop-preferences.md)를 따른다. 직접 API 요청도 같은 권한 검사를 받는다. 배열 조회는 배열 자체를 반환한다.

| API | 입력 → 출력 |
|---|---|
| GET /health | `{ok:true, mode:'local-test'}` |
| POST /test/login | `{subject:'owner'|'alice'|'bob',provider:'google'|'github',ageConfirmed:true}` → UserView. loopback 시험 전용 |
| GET /auth/:provider/start | OAuth로 이동. 실제 설정이 없으면 503 |
| GET /me | UserView |
| GET /me/workspace?expectedUserId= | 계정별 환경·저장한 창 배치·수정 번호. [상세 계약](workspace.md#http와-데이터) |
| PUT /me/workspace | {expectedUserId,revision,requestId,workspace}. 충돌 409, 같은 마지막 요청 재시도는 같은 결과 |
| POST /logout | `{}` → `{ok:true}` |
| POST /auth/email/signup | `{email,ageConfirmed:true}` → `{message}`. 인증 전 계정 생성 없음 |
| POST /auth/email/login | `{email,password}` → `{ok:true}`와 세션 쿠키 |
| POST /auth/email/reset/request | `{email}` → `{message}`. 주소 존재 여부와 같은 응답 |
| POST /auth/email/complete | `{purpose:'signup'|'link'|'reset',token,password}` → `{ok:true,purpose}`. 자동 로그인 없음 |
| POST /me/email/link | `{email}` → `{message}`. 최근 재인증·동일 세션에서 연결 완료 |
| POST /me/email/reauth | `{password}` → `{ok:true}` |
| POST /me/email/password | `{password,newPassword}` → `{ok:true}`. 모든 기존 세션 철회 |
| GET /store/apps?q=&category=&appType= | AppView[]. appType은 default/developer, 카테고리와 교집합 |
| GET /store/apps/:id | AppView |
| GET /me/apps?q=&category=&appType= | AppView[]. 명시적 추가 + 숨기지 않은 기본앱 |
| PUT /operator/apps/:id/app-type | 운영자만 {appType,reason,revision} → {ok:true}. 소유권·데이터 유지 |
| PUT 또는 DELETE /me/apps/:id | `{}` → `{ok:true}`. 기본앱은 다시 표시/숨김, 개발자 앱은 추가/제거. 데이터·동의 유지 |
| GET /apps/:id/consent | `{fingerprint,manifest,accepted:boolean}` |
| GET /me/app-consents | 본인의 `AppConsentView[]`. 내 앱 추가 여부와 무관하며 공개 중단·종료·철회한 앱도 포함 |
| PUT /me/app-consents/:id | `{fingerprint}` → `{ok:true}` |
| DELETE /me/app-consents/:id | 철회·실행 취소 → `{ok:true}` |
| POST /app-sessions | `{appId}` → AppSessionView |
| GET /app-sessions/:id | AppSessionView 또는 403 |
| DELETE /app-sessions/:id | 종료 → `{ok:true}` |
| POST /app-sessions/:id/authorization-codes | `{challenge}` → `{code,expiresAt}` |
| GET /developer/application | 신청 객체 또는 null |
| GET /developer/profile | 현재 `{status:'none'|'approved'|'revoked',reason}`. 과거 신청의 심사 결과와 구분 |
| POST /developer/applications | `{displayName,email,description}` → 신청 객체 |
| GET /operator/developer-applications | 신청 객체[] |
| POST /operator/developer-applications/:id/decisions | `{decision:'approved'|'changes_requested'|'rejected',reason}` |
| POST /operator/developers/:userId/revoke | `{reason}` |
| GET /developer/apps | 본인 앱 객체[] |
| POST /developer/apps | `{name}` → `{id,...}` |
| POST /developer/apps/:id/versions | application/zip 원문 → 버전 객체. X-CSRF-Token 필수 |
| GET /developer/apps/:id/versions | 버전 객체[] |
| POST /developer/versions/:id/submit | 검증 통과한 판 제출 |
| GET /operator/reviews | 검수 판 객체[] |
| POST /operator/versions/:id/decisions | `{decision:'approved'|'changes_requested'|'rejected',reason}` |
| POST /developer/apps/:id/releases | `{versionId,revision}`. 승인 판 공개, 권한 재확인 |
| PUT /developer/apps/:id/publication | `{published:boolean,revision}` |
| PUT /operator/apps/:id/availability | `{status:'allowed'|'normal_suspended'|'emergency_suspended',reason,revision}` |
| GET /operator/apps | 앱 객체[] |
| GET /operator/users | 사용자 최소 객체[] |
| PUT /operator/users/:id/availability | `{status:'active'|'suspended',reason}` |
| POST /apps/:id/reports | `{reason}` |
| GET /me/reports 또는 /operator/reports | 본인 또는 운영자 범위의 신고[] |
| POST /operator/reports/:id/decisions | `{status:'resolved'|'dismissed',reason}` |
| POST /me/withdrawal/prepare | 최근 재인증 → `{receiptId,lookupSecret}`. 링크를 먼저 보관, 탈퇴는 아직 접수하지 않음 |
| POST /me/withdrawal | `{confirmed:true,receiptId}` + 최근 재인증 → `{status}`. 응답 유실 뒤에도 미리 보관한 링크로 조회 |
| GET /developer/deletion-requests | 본인 앱의 외부 삭제 요청[] |
| POST /developer/deletion-requests/:id/results | `{status:'processing'|'developer_reported_completed'|'needs_attention',note}` |
| GET /withdrawal-status | `Authorization: Bearer <조회비밀>` → 최소 삭제 상태. external 항목은 `{appId,appName,status}` |
| POST /developer/apps/:id/closure-requests | 소유자 종료 신청 |
| POST /operator/apps/:id/closure-confirmations | `{reason}` → 종료확인 |
| POST /developer/apps/:id/credentials | 서버 자격 발급·회전. 응답을 한 번만 표시 |
| POST /app-auth/exchange | 앱 자격 HTTP Basic + `{code,verifier}` → `{token,appUserId,expiresAt}` |
| POST /app-auth/introspect | 앱 자격 HTTP Basic + `{token}` → `{active,appUserId?}` |
| POST /preview-sessions | 소유자·운영자의 `{versionId,confirmed:true}` → `AppSessionView`와 `isPreview:true`. 별도 앱 사용자·로컬 저장 영역 |
| GET /versions/:id/bundle | 소유자·운영자만 원본 ZIP 다운로드 |
| POST /auth/native/prepare | 현재 웹 세션·CSRF와 `{provider,intent:'link' 또는 'reauth',challenge}` → 단회 `startUrl` |
| GET /auth/native/start | 단회 ticket 소비 → 원 계정에 결합된 OAuth 시작 |
| POST /auth/native/exchange | `{code,verifier}` → `{bootstrapTicket}`. 원 세션·로그인 수단 철회 확인 |
| POST /auth/native/bootstrap | 단회 ticket POST → HttpOnly 세션 설정·기존 기기 실행 취소·303 웹 복귀 |

단순 중지 후 기존 실행은 유효하며 새 실행만 막는다. 긴급·동의철회·계정정지는 관련 실행을 취소한다. 현재 사용자의 정지와 앱 소유자의 정지를 혼동하지 않는다. 개발자 승인 취소는 기존 앱의 공개 상태를 바꾸지 않는다. 모든 입력은 서버에서 검증한다. 임의 개발자 서버로의 서버 측 프록시는 제공하지 않는다.

이용 앱 이력에는 앱 ID·이름·철회 시각·실행 가능 여부와 일반적인 불가 사유만 반환한다. 미공개 버전 내용·신청 연락처·다른 사용자의 이력을 반환하지 않는다. 계정 화면에서 목록에 없는 앱의 동의 철회와 현재 기기 로컬 삭제를 계속 제공한다. 개발자 재승인 시 현재 취소 사유를 비우지만 감사 이력과 앱 중지 상태는 유지한다.

탈퇴 조회의 `appName`은 해당 요청의 앱별 사용자 식별자로 실제 실행한 버전 중 생성 시각이 최신인 판의 매니페스트 이름이다. 마지막 실행 시각 기준은 아니며 앱 등록 작업명이나 이용하지 않은 새 초안 이름을 반환하지 않는다. 이름이 없으면 null이고 화면은 appId를 표시한다. 개발자 처리 메모·연락처·appUserId는 이 조회 자격에 제공하지 않는다. 외부 완료 상태는 개발자의 보고이며 플랫폼의 실제 삭제 확인과 구분한다.
