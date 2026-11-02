# 로컬 시험 API 계약

대상: 웹·SDK·BE 구현 담당자. 소유자: 프로젝트 소유자. 검토일: 2026-11-01. ADR-0042의 구현 계약이며 운영 공개 판이 아니다.

API는 `/v1`, JSON을 반환한다. 오류는 `{code,message}`와 HTTP 400/401/403/404/409/413. 웹 same-origin 프록시를 통해 HttpOnly 쿠키를 사용하고 변경 요청은 `X-CSRF-Token`을 보낸다. GET `/me` 응답의 csrf를 사용한다. 직접 API 요청도 같은 권한 검사를 받는다. 배열 조회는 배열 자체를 반환한다.

| API | 입력 → 출력 |
|---|---|
| GET /health | `{ok:true, mode:'local-test'}` |
| POST /test/login | `{subject:'owner'|'alice'|'bob',provider:'google'|'github',ageConfirmed:true}` → UserView. loopback 시험 전용 |
| GET /auth/:provider/start | OAuth로 이동. 실제 설정이 없으면 503 |
| GET /me | UserView |
| POST /logout | `{}` → `{ok:true}` |
| GET /store/apps?q=&category= | AppView[] |
| GET /store/apps/:id | AppView |
| GET /me/apps | AppView[] |
| PUT 또는 DELETE /me/apps/:id | `{}` → `{ok:true}` |
| GET /apps/:id/consent | `{fingerprint,manifest,accepted:boolean}` |
| PUT /me/app-consents/:id | `{fingerprint}` → `{ok:true}` |
| DELETE /me/app-consents/:id | 철회·실행 취소 → `{ok:true}` |
| POST /app-sessions | `{appId}` → AppSessionView |
| GET /app-sessions/:id | AppSessionView 또는 403 |
| DELETE /app-sessions/:id | 종료 → `{ok:true}` |
| POST /app-sessions/:id/authorization-codes | `{challenge}` → `{code,expiresAt}` |
| GET /developer/application | 신청 객체 또는 null |
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
| GET /withdrawal-status | `Authorization: Bearer <조회비밀>` → 최소 삭제 상태 |
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
