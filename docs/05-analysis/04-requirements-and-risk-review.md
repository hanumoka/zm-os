# 요구사항·계획·실수/리스크 정밀 검토 보고서

> **Last Updated**: 2026-06-07
> **목적**: REFAC-02-P2 등 다음 v2 구현 진입 전, 요구사항·계획·정책↔코드 정합성·실수/리스크 관리 체계의 공백을 한 번에 진단하고 보강 후보를 제시한다.
> **산출 범위**: 검토 보고서 단독. 코드/정책/레지스트리 변경은 *제안*만 하며 적용은 별도 승인 대상. 비기능 요구사항은 *선택지만* 제시(임의 정책 확정 없음).
> **유형**: 점검(audit) 스냅샷 — 2026-06-07 코드/문서 기준.

---

## 1. 요약 (Executive Summary)

zm-os의 **도메인 핵심 보안(iframe 격리 / IPC / CSP)은 정책과 코드가 매우 잘 정합**되어 있다. ZIP 검증 10단계, sandbox 토큰 최소화, 자체 IPC의 prototype pollution 방어, CSP/Permissions-Policy 완전 구현 등은 선언된 규칙을 코드가 충실히 이행한다. 요구사항·계획 문서의 추적성/일관성도 전반적으로 우수하다(orphan 요구사항 0건).

보강이 필요한 지점은 다음 5개 영역에 집중된다:

1. **정책↔코드 DRIFT** — security.md가 선언했으나 코드에 미구현된 항목(스토리지 쿼터 모니터링, iframe soft-timeout).
2. **실수 레지스트리 공백** — 도메인 치명 실수가 M-NNN으로 미등록(M-001~003만 존재).
3. **제품 리스크 레지스트리 부재** — 협업 인프라 리스크(R1~R8)는 있으나 사용자 코드 실행/데이터 리스크 추적 체계 없음.
4. **비기능 요구사항 정책 부재** — 성능·브라우저 지원·스토리지 쿼터 SLA 미확정.
5. **검증 자동화(CI) 부재** — `.github/workflows` 0건, 품질 게이트가 수동 의존.

### 1.1 조사 방법

- Explore 에이전트 병렬 3종(요구사항·계획 문서 / 실수·리스크 체계 + 코드 정합성 / 웹 리서치) + 웹 리서치 2종 재실행으로 실데이터 확보.
- 핵심 코드 직접 검증: `packages/ipc/src/protocol.ts`, `packages/ipc/src/host.ts`, `apps/web/src/lib/security/csp.ts`, `apps/web/next.config.ts`, `apps/web/src/lib/apps/sandbox.ts`, `apps/web/src/components/desktop/AppFrame.tsx`.
- 타깃 검색: 스토리지 쿼터 모니터링 / soft-timeout / `any` 타입 / CI 워크플로 존재 여부.

### 1.2 ⚠️ 웹 리서치 오탐 reconcile (중요)

웹 리서치 에이전트는 코드 접근 없이 일반론을 제시했으므로 다음을 "보강 후보"로 올렸으나, **코드 직접 확인 결과 전부 이미 구현·방어되어 있어 갭이 아니다**:

| 웹 리서치가 제기한 "갭" | 실제 코드 확인 결과 | 판정 |
|---|---|---|
| "CSP 미설정" | `csp.ts` 전체 지시어 구현 + `next.config.ts` 전역 적용 | ❌ 오탐 (이미 구현) |
| "Permissions-Policy 없음" | 13개 기능 차단 구현(`csp.ts:69-83`) | ❌ 오탐 |
| "Comlink prototype pollution critical (#603)" | 실제 Comlink 라이브러리 아님 — 자체 wire-compatible RPC(`packages/ipc`)이며 `DANGEROUS_KEYS` + `.strict()` 방어 | ❌ 비적용 |
| "postMessage origin 미검증" | `host.ts:179,184` origin/source 이중 검증 | ❌ 오탐 |
| "targetOrigin `*` 위험" | null-origin iframe은 `*`가 web.dev 권장 방식 | ❌ 오탐(정상 설계) |

이 보고서는 위 오탐을 갭에서 배제하고, **코드로 검증된 강점(§2)과 실제 갭(§3~6)을 분리**한다.

---

## 2. 강점 — 이미 정합됨 (보강 불필요)

| # | 항목 | 근거 |
|---|------|------|
| S1 | iframe sandbox = `allow-scripts` 단독, `srcdoc`(null origin), `referrerPolicy='no-referrer'`. `allow-same-origin`/`allow-top-navigation` 0건 | `apps/web/src/lib/apps/sandbox.ts:4,75-76` |
| S2 | 자체 IPC의 prototype pollution 방어: `DANGEROUS_KEYS = Set(['__proto__','constructor','prototype'])` + 모든 메시지 스키마 `.strict()` + `hasDangerousKey` refine + discriminated union + `zm_ipc_` prefix 검사 | `packages/ipc/src/protocol.ts:24-28,55-59,75-78,96-99,115-118,136-139,161-170` |
| S3 | origin/source 이중 검증: `event.source === iframe.contentWindow` + `event.origin === 'null'`. iframe 전송은 `targetOrigin='*'`(null-origin 대상 표준 방식) | `packages/ipc/src/host.ts:179,184,116-121` |
| S4 | rate-limiter(N-08 DoS 방어) 통합, INIT 핸드셰이크 제외 | `packages/ipc/src/host.ts:82-88,190-196` |
| S5 | allowedMethods 화이트리스트 양방향 게이트(앱→호스트 / 호스트→앱), TS-002 우회 결함 수정 완료 | `packages/ipc/src/host.ts:132,315` |
| S6 | CSP/Permissions-Policy 완전 구현: `default-src 'self'`, `frame-src 'self' blob:`, `object-src 'none'`, `base-uri 'self'`, 13개 기능 차단, prod에서 `unsafe-eval`/`unsafe-inline` 제거, 전역 헤더 적용 | `apps/web/src/lib/security/csp.ts:104-204`, `apps/web/next.config.ts:8-21` |
| S7 | ZIP 검증 10단계(magic byte→크기→파싱→path traversal→압축비→필수파일→HTML크기→Zod→ID중복→저장) 정책↔코드 정합 | [`security.md`](../../.claude/rules/security.md) ↔ `apps/web/src/lib/apps/zip-loader.ts` |
| S8 | JSZip 3.10.1 — CVE-2022-48285(path traversal, `< 3.8.0`) 비해당. prototype pollution(`< 3.7.0`)도 비해당 | NVD/GHSA |
| S9 | `any` 타입 0건(apps/web/src 전체 검색) | grep 결과 |
| S10 | 추가 보안 헤더: `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, prod `X-Frame-Options: DENY` | `apps/web/src/lib/security/csp.ts:183-201` |

**결론:** 도메인 핵심(사용자 코드 격리) 방어선은 견고하다. 이는 zm-os의 최대 위험인 "임의 사용자 JS 실행"에 대한 1차 방어가 설계대로 작동함을 의미한다.

---

## 3. 보강 후보 — 정책↔코드 DRIFT

> security.md/규칙이 **선언했으나 코드에 미구현**이거나, 모노레포 이전 후 **stale**해진 항목.

| ID | 심각도 | 내용 | 근거 | 제안 |
|----|:------:|------|------|------|
| **D1** | 🔴 HIGH | **스토리지 쿼터 모니터링 미구현.** security.md §리소스 고갈 방어가 "`navigator.storage.estimate()`로 모니터링, 임계치 초과 시 알림"을 선언하나 `apps/web/src` 전체에 호출 0건. 호스트 origin IDB(설치앱 + 사용자 ZIP)가 per-origin quota 초과 시 **개별 저장소가 아닌 전체 origin 데이터(IDB+Cache+OPFS)가 일괄 삭제**됨(MDN) | security.md §리소스 고갈; grep 0건; MDN Storage quotas | 구현, 또는 정책에 "v2 deferred" 명시하여 drift 해소 |
| **D2** | 🟡 MED | **iframe soft-timeout 미구현.** security.md가 "iframe 단위 soft timeout(60초 비활성 시 종료 옵션)"을 선언하나 코드 0건. 무한루프 게임이 해당 iframe 스레드 점유(parent 영향은 제한적이나 UX 저하·탭 행) | security.md §리소스 고갈; grep 0건 | 구현, 또는 deferred 명시 |
| **D3** | 🟢 LOW | **stale 경로/용어.** security.md·[`self-review.md`](../../.claude/rules/self-review.md)·[`work-units.md`](../../.claude/rules/work-units.md)가 IPC를 `src/lib/apps/ipc/`로 지칭(실제는 `packages/ipc/src/`), "Comlink 기반"→실제는 자체 wire-compatible RPC. 보안 민감 경로 목록에 `apps/web/` 접두어·`packages/ipc` 누락 | 모노레포 이전(SRV-00, 2026-05-26) 후 미갱신 | 경로/용어 문구 정정 |
| **D4** | 🟢 LOW | **`SANDBOX_ORIGIN` 상수 중복.** `sandbox.ts:6`과 `host.ts:46`에 'null' 값 이중 정의(순환 import 회피용, 코드 주석에 자체 인지) | `packages/ipc/src/host.ts:44` 주석 | REFAC-02에서 `ipc/constants.ts` 분리 |
| **D5** | 🟢 LOW | **AppFrame 디버그 로그 잔존.** 보안 민감 컴포넌트에 `console.log`로 manifest 내용·html 길이·entry id 다수 출력 | `apps/web/src/components/desktop/AppFrame.tsx:50-51,71,75,94-118,123-131` | prod 빌드 전 정리(또는 debug 플래그) |

---

## 4. 보강 후보 — 실수 레지스트리(M-NNN) 공백

> 현재 [`known-mistakes.md`](../../.claude/rules/known-mistakes.md)에 M-001~003만 등록. 도메인 특성상 마땅히 등록될 치명 실수가 누락.

| 제안 ID | 심각도 | 실수 패턴 | 근거 / 자동 탐지 |
|---------|:------:|-----------|------|
| **M-004** | [BLOCK] 후보 | iframe sandbox에 `allow-same-origin`(또는 `allow-top-navigation`/`allow-popups-to-escape-sandbox`) 추가 — sandbox 격리 무력화(도메인 치명) | web.dev: same-origin+scripts 조합 시 자식이 부모에 접근해 sandbox 속성 자체 제거 가능. `mistake_guard.py` 백틱 패턴으로 자동 차단 등록 가능 |
| **M-005** | [WARN] | `addEventListener('message', ...)` 핸들러에서 `event.origin` 검증 누락 | security.md 규칙이나 자동 가드 없음. 현재 코드는 준수(`host.ts:184`, `sandbox.ts:92`)하나 회귀 방지용 등록 권장 |
| **M-006** | [WARN] | `window`/`document`/`localStorage`를 `useEffect` 밖(SSR 경로)에서 접근 | quality-standard 규칙이나 M 미등록. 현재 코드는 env guard 준수(`sandbox.ts:70`, `host.ts:76`) |
| (참고) | — | `any` 금지는 **현재 위반 0건** → M 등록은 선택사항. tsc strict + lint로 충분 | grep 0건 |

---

## 5. 보강 후보 — 제품 리스크 레지스트리 부재

> [`wu-claim.md`](../../.claude/rules/wu-claim.md)의 R1~R8은 **협업 인프라** 리스크(crash/race/secret 등). **제품(사용자 코드 실행·데이터) 리스크를 추적하는 레지스트리가 없다.** 신설 또는 security.md 섹션 추가 제안.

| 제안 ID | 리스크 | 현황 | 웹 근거 |
|---------|--------|------|---------|
| **RP-1** | 사용자 JS **정적 분석 부재** — 격리(iframe)는 견고하나 코드 내용 자체는 미검증(cryptomining, 무한루프 DoS, 외부 fetch 시도). 정적 분석은 eval/난독화에 한계가 있으므로 격리+권한선언 조합이 현실적 | 격리만 존재 | itch.io 격리 모델 / OWASP / 정적분석 한계(arxiv). SBX-v2-00 권한 선언 스키마와 연계 |
| **RP-2** | 호스트 origin IDB/OPFS **quota 고갈 → 전체 origin 데이터 삭제** (D1과 연결) | 모니터링 없음 | MDN Storage quotas and eviction |
| **RP-3** | **Safari/WebKit ITP** — 스크립트 작성 스토리지 7일 미사용 시 삭제 → 설치앱/설정 유실 가능. `navigator.storage.persist()` 검토 | 미대응 | WebKit Tracking Prevention |
| **RP-4** | **멀티탭 IDB 동시 접근 race** — POC는 단일 탭 가정. v2 멀티세션/탭 시 read-modify-write 비원자성 | 미추적 | MDN / IndexedDB best practices |
| **RP-5** | **의존성 CVE 수동 추적** — `npm audit`/CI 없음. JSZip은 12개월+ 미배포(유지보수 정체 신호) | 수동 | GHSA / Snyk |
| **RP-6** | **COEP/COOP 미도입(의도적, ADR-0004)** → SharedArrayBuffer 요구 게임 엔진 동작 불가. `COEP: credentialless` / credentialless iframe 경로를 추적 항목으로 등록 | 보류 결정됨 | web.dev coop-coep / cross-origin-isolation |

---

## 6. 보강 후보 — 검증 자동화(CI) 부재

- `.github/workflows` 디렉토리 **0건** — CI 파이프라인 없음.
- [`quality-standard.md`](../../.claude/rules/quality-standard.md)("tsc 0, any 금지")와 [`self-review.md`](../../.claude/rules/self-review.md) 체크리스트가 **수동 의존** → 누락 가능성.
- 권고(적용은 범위 외): GitHub Actions로 `turbo type-check` + `turbo test` + lint + `npm audit`(또는 `pnpm audit`)를 PR 게이트로 강제. pre-push secret scan(이미 존재)과 보완 관계.

---

## 7. 비기능 요구사항 — 선택지 제시 (정책 미확정)

> 아래는 **사용자 결정 대기 항목**이다. 권장값은 참고용이며 본 보고서는 정책을 확정하지 않는다.

### 7.1 성능 목표 (CONST-03 후보)
| 지표 | 권장 기준 | 근거 |
|------|----------|------|
| LCP | < 2.5s | Core Web Vitals; POC 측정 ~2.4s(최초 컴파일 포함) |
| CLS | < 0.1 | Core Web Vitals |
| INP | < 200ms | Core Web Vitals(FID 후속) |
| 번들 | gzip ≤ 500KB(현 ~400-500KB 유지) | POC roadmap 측정값 |

### 7.2 브라우저 지원 매트릭스 (TECH-11/CONST 후보)
| 기능 | 최소 지원 | 비고 |
|------|----------|------|
| OPFS | Chrome 86+ / Firefox 111+ / Safari 15.2+ / Edge 86+ | `createSyncAccessHandle`은 Web Worker 내부만 |
| OPFS `remove()` | Chrome만 | FF/Safari 미구현 |
| iframe quota(Safari) | 부모의 ~1/10 | 모바일 게임 저장 제약 |

→ 결정 필요: 최소 지원 버전 라인(예: Chrome 90+/FF 100+/Safari 15.2+), Safari/iOS 1급 지원 여부.

### 7.3 스토리지 쿼터 정책 (CONST 후보)
- per-origin 쿼터: Chrome/Edge/Safari ~디스크 60%, Firefox ~10%(또는 10GiB).
- 사용자별 한도: CLD-09(Cloud) 10MB 설정됨 / Local 모드 "무제한"의 경계 정의 필요.
- `navigator.storage.persist()` 적용 여부(eviction 방어) — RP-2/RP-3과 연결.

### 7.4 기타 (v2 진입 시 결정)
- 접근성: WCAG AA 목표 여부(데스크탑/스토어 UI 한정, 게임 iframe 제외 가능).
- 에러/복원력: 부분 실패 롤백, 오프라인 재시도 정책(CLD-06).
- 데이터 마이그레이션: Local→Cloud RTO/RPO, 90일 백업 후 purge 시점(MIG-01~03).

---

## 8. 요구사항·계획 문서 발견

전반적으로 **추적성/일관성 우수**(orphan 요구사항 0, 수치 일치, 가정 목록 G1~G10·보류 항목 분류 양호). 보강 후보:

| # | 항목 | 심각도 | 제안 |
|---|------|:------:|------|
| P1 | REFAC-02 P1~P5 **병렬성/예상시간(3일 vs 5일) 근거 미명시** — 일정 예측 정확도 저하 | 중간 | v2-plan §4.1에 의존성 그래프 + 시간 근거 1줄 |
| P2 | ADR-0024~0029 "예약" **비정식 표기**("ADR-0024+") | 중간 | `02-decisions/index.md`에 예약 번호 섹션 신설 |
| P3 | CONST-01/02 **scope(2026-05-27 추가)가 PRD/roadmap 미반영** | 낮음 | 문서 freshen |
| P4 | ADR-0030~0032(협업 헌법) **v2-plan 미반영** | 낮음 | 다음 roadmap/v2-plan 갱신 시 반영 |
| P5 | "보안 검증 9" vs "6단계+7패턴" **용어 불일치** | 낮음 | PRD/security.md 용어 통일 |

---

## 9. 우선순위 요약 + 권고 액션

> 적용은 **별도 승인** 대상. 본 표는 권고 순서일 뿐이다.

| 우선순위 | 항목 | 유형 |
|:--------:|------|------|
| 🔴 HIGH | **D1**(스토리지 쿼터 모니터링), **M-004**(allow-same-origin 차단 등록) | 코드 / 레지스트리 |
| 🟡 MED | **D2**(soft-timeout), **M-005·M-006**, **RP-1~RP-3**, **CI**, **P1·P2** | 코드 / 레지스트리 / 문서 |
| 🟢 LOW | **D3·D4·D5**(stale·중복·로그), **RP-4~RP-6**, **P3~P5** | 문서 / 정리 |
| ⏸ 결정 대기 | §7 비기능 요구사항(성능·브라우저·스토리지 정책) | 정책 |

**제안 처리 경로**
- 레지스트리(M-004~006) → [`known-mistakes.md`](../../.claude/rules/known-mistakes.md) + [BLOCK]은 `mistake_guard.py` 패턴.
- 제품 리스크(RP-1~6) → 신규 리스크 레지스트리 또는 security.md 섹션.
- DRIFT(D1~D5) → 구현 또는 정책 "deferred" 명시로 선언↔코드 일치화.
- 비기능 정책(§7) → 사용자 결정 후 [`policy-registry.md`](../03-policy/01-policy-registry.md) 등재 + `_digest.md` 동기화.

---

## 10. 출처 (웹 리서치 — 실제 fetch 기준)

신뢰도: **확실** = 1차 권위 출처 직접 확인 / **추정** = 버전 특정 미검증.

**iframe sandbox / CSP / COEP (확실)**
- https://web.dev/articles/sandboxed-iframes
- https://web.dev/articles/csp
- https://web.dev/articles/coop-coep · https://web.dev/articles/cross-origin-isolation-guide
- https://web.dev/articles/permissions-best-practices · https://web.dev/articles/securely-hosting-user-data
- https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
- https://html.spec.whatwg.org/multipage/iframe-embed-object.html

**postMessage / Comlink (확실)**
- https://github.com/GoogleChromeLabs/comlink/issues/603 (※ 자체 RPC라 비적용)
- https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/11-Testing_Web_Messaging

**의존성 CVE (확실)**
- https://github.com/advisories/GHSA-36fh-84j7-cv5h · https://nvd.nist.gov/vuln/detail/cve-2022-48285 (JSZip CVE-2022-48285)
- https://github.com/advisories/GHSA-f82v-jwr5-mffw (Next.js CVE-2025-29927) — *Next.js 16 영향 여부는 추정*
- https://security.snyk.io/package/npm/jszip · https://security.snyk.io/package/npm/zod

**클라이언트 스토리지 (확실)**
- https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system · https://web.dev/articles/origin-private-file-system
- https://webkit.org/tracking-prevention/

**UGC 위협 모델 (확실/추정 혼재)**
- https://itch.io/docs/itch/using/sandbox.html
- https://www.intigriti.com/researchers/blog/hacking-tools/exploiting-postmessage-vulnerabilities
- https://danieldusek.com/escaping-improperly-sandboxed-iframes.html
- https://arxiv.org/pdf/2301.05097 (정적 분석 한계)

---

## 11. 관련 문서

- 정책 SSOT: [`docs/03-policy/01-policy-registry.md`](../03-policy/01-policy-registry.md)
- 보안 규칙: [`.claude/rules/security.md`](../../.claude/rules/security.md)
- ADR-0004(CSP/Permissions-Policy): [`docs/02-decisions/adr-0004-csp-permissions-policy.md`](../02-decisions/adr-0004-csp-permissions-policy.md)
- v2 계획: [`docs/04-planning/03-v2-plan.md`](../04-planning/03-v2-plan.md)
- 기존 보안 감사: [`docs/06-security/02-phase-3-stabilization-audit-2026-05-25.md`](../06-security/02-phase-3-stabilization-audit-2026-05-25.md)
- 엔진 호환성: [`docs/07-testing/01-engine-compatibility-matrix.md`](../07-testing/01-engine-compatibility-matrix.md)
- 관련 분석: [`docs/05-analysis/02-sandboxing-untrusted-js.md`](02-sandboxing-untrusted-js.md)

---

## 12. 적용 이력 (2026-06-07)

본 검토 직후 사용자 승인(🔴HIGH→🟡MED→🟢LOW 순) 하에 적용:

| 항목 | 조치 | 결과 |
|------|------|------|
| D1 | 스토리지 쿼터 모니터링 구현 — `apps/web/src/lib/storage/quota-monitor.ts` + `use-quota-monitor.ts` + `components/desktop/QuotaBadge.tsx`(Taskbar surface). architect→lib/fe-developer 게이트 경유 | ✅ tsc 5/5, vitest +8 (61→69) |
| D2 | soft-timeout — security.md에 **v2 deferred** 명시 (RP-1 추적) | ✅ drift 해소 |
| D3 | stale 경로/용어 정정 — security.md(frontmatter `paths` + IPC 경로/용어 + zip-loader/rate-limiter 경로), self-review.md(`globs`), work-units.md | ✅ |
| M-004~006 | known-mistakes.md [WARN] 등록 (allow-same-origin / origin 검증 / SSR 가드) | ✅ |
| RP-1~6 | security.md §제품 리스크 레지스트리 신설 | ✅ |
| P1 | v2-plan §4.1 REFAC-02 의존성 구조 노트 | ✅ (doc-updater) |
| P2 | ADR 예약 번호 — `02-decisions/index.md`에 이미 존재 | — 변경 불요 |
| P3 | CONST-01/02 scope — PRD/roadmap에 참조 없음 | — N/A |
| P4 | ADR-0030~32 — index.md/MEMORY에 이미 추적(기능 계획과 직교) | — 의도적 생략 |
| P5 | "보안 검증 9" — validator 9개 모듈 + 6단계 순차, 둘 다 정확 | — 모순 아님 |

**미적용 (별도 결정 대기):** D4(상수 분리 = REFAC-02 흡수), D5(AppFrame 디버그 로그 정리), CI(GitHub Actions), §7 비기능 요구사항 정책.
