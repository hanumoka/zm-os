# 정책 다이제스트 (Policy Digest)

> 세션 시작 시 자동 로드. 최종 갱신: **2026-08-15**

## ⚠ 정본이 이 저장소에 없다

요구사항·정책·상위 설계·계약의 **정본은 `zm-docs` 저장소**다. `zm-docs`의 `DEC-0005`가 그렇게 정했다.

| 알아야 할 것 | 정본 위치 (`zm-docs`) |
|---|---|
| 무엇을 만드는가 / 성공 기준 / 비목표 | `docs/projects/zm-os/requirements.md` |
| 무엇이 금지이고 무엇이 결정 게이트인가 | `docs/projects/zm-os/policies.md` |
| 경계와 기술 스택 | `docs/projects/zm-os/architecture.md` |
| 저장 키·URL·앱 계약의 실제 값 | `docs/projects/zm-os/contracts.md` |
| 결정 기록 | `docs/governance/decisions/` (`DEC-NNNN`) |

**이 저장소의 ADR은 구현 결정의 정본으로 유효하다.** 다만 위 문서와 충돌하면 **`zm-docs`가 이긴다.**

이 파일 아래 내용과 `01-policy-registry.md`는 **동결됐다.** 역사 기록으로 보존하며, 새 정책을 여기에 추가하지 않는다.

## 지금 반드시 알아야 할 사실 (2026-08-15 실측)

**프로덕션 빌드에서 앱이 실행되지 않는다. 앱 이전에 호스트 셸이 먼저 죽는다.**

- prod CSP가 `script-src 'self'`인데 Next.js prerender 산출물에 **nonce 없는 inline `<script>` 6개**가 있어 차단된다 → **hydration 실패**
- 화면에는 SSR된 데스크탑이 그대로 보인다. **정상 동작으로 오독하기 쉽다.** 시계가 `--:--`에 멈춘 것이 단서
- 그 6개는 프레임워크 산출물이라 **"외부 파일로 빼기"로 해결할 수 없다.** nonce 미들웨어·hash·렌더링 전략 중 선택이 필요하고, 미들웨어 통로가 현재 없다
- **호스트 CSP는 srcdoc iframe에 상속된다.** srcdoc 안 inline은 차단되고 **절대경로 external classic script는 통과**한다
- `pixi.js`는 `unsafe-eval` 없는 환경을 명시적으로 거부한다 → CSP를 고쳐도 그 데모는 별도로 죽는다
- 실패를 감지할 수단이 코드에 **0건**(`securitypolicyviolation`·`iframe.onload/onerror`·CSP 리포팅)
- **기존 침투 점검 14/14 PASS는 dev 서버 대상이다.** e2e 6개가 포트 3000을 하드코딩하고 `package.json`에 미등록이다

전문: `zm-docs`의 `docs/research/2026-08-15-zm-os-prod-build-measurement.md`

## 금지 사항 (도메인 핵심)

- iframe `allow-same-origin` **절대 금지**
- raw `postMessage` 금지 — `@zm/ipc` 엔드포인트 경유 (eslint 강제)
- `any` 타입 금지 (eslint 강제)
- Port 인터페이스(`@zm/core/ports`)가 어댑터 패키지를 import 금지 (DIP)
- `@zm/storage` import 금지 — 삭제 대상 shell (eslint 강제)
- **`AppUploadButton` import 금지** — ZIP 업로드 UI는 `DEC-0007`로 제거됐다 (eslint 강제)
- `next.config.ts`에 `output: 'export'` 금지 — 보안 헤더가 무력화된다
- IndexedDB namespace는 **읽고 쓰는 코드와 같은 릴리스**에서만 추가
- 앱 내부의 중첩 iframe 금지
- 앱에 세션·계정 식별자 전달 금지

## 이 문서의 이전 서술 중 사실과 다른 것

동결 전 이 파일이 잘못 적고 있던 것이다. 인용하지 마라.

| 이전 서술 | 사실 |
|---|---|
| ARCH-02 "**blob:** iframe" | `srcdoc`이다. `createObjectURL` 사용 0건 |
| ARCH-02 "**Comlink** IPC" | Comlink를 쓰지 않는다. 의존성에 없고 자체 프로토콜이다. 남은 것은 설명 문구뿐(`desktopApps.ts:145,150,153`, `sandbox.ts:51`) |
| PROD-01 "POC = 게임 스토어 + 단일 사용자" | `DEC-0007`이 재정의했다 — 가상 웹 데스크탑 OS, 앱은 저장소 안의 모듈, 계정 1개로 로그인해 배포된 주소에서 쓴다 |
| PROD-05 "JSZip + 사용자 업로드" | 업로드 UI는 제거됐다 (`DEC-0007`) |
| TECH-03 "정적 CSP (nonce 미도입)" | 사실이지만 **그것이 프로덕션 셸을 죽인다**(위 참조) |
| Superseded 표의 "ADR-0024+/0025+/0026+ 예정" | 그 미래는 폐기됐다. Supabase 트랙 자체가 소멸 |
| Active 정책 18건 | 레지스트리 Active는 **22건**이다. ARCH-05·TECH-11·TECH-12·PROD-06이 이 표에서 누락돼 있었다 |

## Active 정책 (동결 시점 기준 22건)

상세는 `01-policy-registry.md`. **상태 열은 `zm-docs` 정본 기준이다.**

| ID | 요약 | 상태 |
|---|---|---|
| ARCH-01 | Next.js 풀스택 + 모노레포 | 부분 무효 — 백엔드는 Spring Boot + Kotlin (`server/`) |
| ARCH-02 | 샌드박스 iframe + IPC | 유효하나 **서술 정정 필요**(위 표) |
| ARCH-03 | Ports & Adapters — 5 Port | 유효. Moderation Port는 대상 상실 |
| ARCH-04 | OS 확장 — capability 계약 락 | 유효 |
| ARCH-05 | 스토리지 스키마는 레지스트리에서 파생 (`sinceVersion` 불변식) | 유효. **승계 제약 17에 가장 근접한 기존 규정** |
| TECH-01 | BlobStorage Port + Local 어댑터 | 유효 |
| TECH-02 | Python hooks | 유효 |
| TECH-03 | 정적 CSP/Permissions-Policy (nonce 미도입) | **재검토 필요** — 셸을 죽인다 |
| TECH-04 | react-rnd | 유효 |
| TECH-05 | Context + useReducer | 유효 |
| TECH-06 | Tailwind v4 dark variant | 유효 |
| TECH-10 | pnpm + Turborepo | 유효. Vercel 하위 절은 배포 결정 시점으로 이연 |
| TECH-11 | 금지 규칙의 기계 검사 — ESLint flat config | 유효. **제약 15(앱 간 직접 import 금지)를 얹을 자리** |
| TECH-12 | 타입 엄격도 — `noUncheckedIndexedAccess` | 유효 |
| PROD-01 | POC = 게임 스토어 | **폐기** — `DEC-0007` |
| PROD-02 | 카탈로그 하드코딩 | 재작성 대상 — 빌드타임 생성물로 |
| PROD-03 | DesktopAppEntry 확장 | 재작성 대상 |
| PROD-04 | 설치 상태 IndexedDB | 재작성 대상 — 활성화 enum + 비활성 사유 |
| PROD-05 | 사용자 ZIP 업로드 | **폐기** — UI 제거됨 |
| PROD-06 | 영속화 쓰기 가드 | 유효 |
| CONST-01 | RLS 의무 — CloudRepo 한정 | **적용 대상 없음** — 그 어댑터가 존재하지 않음 |
| CONST-02 | 서버 권위 시계 — CloudSync 한정 | **적용 대상 없음** |

## Superseded (참고용 보존)

| ID | 이전 결정 | 현재 |
|---|---|---|
| TECH-07 | Supabase Auth (ADR-0013) | 트랙 소멸. 인증 스택 미정 |
| TECH-08 | Supabase Postgres + Drizzle (ADR-0014) | 트랙 소멸. 백엔드는 Spring Boot + Kotlin |
| TECH-09 | LWW + 서버 권위 시계 (ADR-0015) | 트랙 소멸 |

## 다음 작업

`zm-docs`의 `docs/projects/zm-os/index.md` "남은 미결"이 정본이다. 1순위는 **호스트 셸의 hydration 복구**다.
