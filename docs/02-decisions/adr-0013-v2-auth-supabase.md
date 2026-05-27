---
number: "0013"
title: v2 사용자 인증 — Supabase Auth 채택
status: superseded
date: 2026-05-26
author: hanumoka
related: ["0001", "0014", "0015", "0017"]
superseded_by: ["0017"]
---

# ADR-0013: v2 사용자 인증 — Supabase Auth 채택

> ⚠️ **2026-05-27 superseded by ADR-0017**: 본 ADR은 ADR-0017(Ports & Adapters)의 어댑터 옵션 명세로 reshape됨. Supabase Auth는 `AuthProvider` Port의 Cloud 어댑터 중 하나로 격하되며, 상세 명세는 **ADR-0024+** (CloudAuth-Supabase, v2 CLD Epic 진입 시점에 작성)에서 별도 작성된다. 본 ADR의 결정 근거(MAU 비용 분석, RLS 통합, CVE-2026-31813 강제 등)는 ADR-0024+ 작성 시 참고용으로 보존한다.

## Context

- PRD §1.2 비전 3번 (사용자 계정 + 어디서나 본인 OS 접근) 달성을 위해 v2에서 인증 도입 필요.
- v2 plan §5 ADR Candidate 1순위 (병렬 3건). USR Epic 전제.
- `docs/05-analysis/03-multitenant-stack-options.md`에서 멀티테넌트 후보 스택 예비 분석 (Clerk + Supabase 통합 권장).
- 요구사항:
  - Next.js 16 App Router + React 19 호환
  - Postgres + RLS 통합 (사용자 데이터 격리)
  - JWT 클레임이 RLS 정책에서 자동 사용 가능
  - 무료/저비용 tier 충분 (POC ~1000명 가정)
  - 세션 만료 + 토큰 refresh
  - 디바이스 세션 관리 (USR-06)
  - 계정 삭제 GDPR right-to-erasure (USR-05)
- 후보: Clerk / Supabase Auth / Auth.js (NextAuth v5)
- research-analyst 보고 (2026-05-26):
  - Auth.js v5는 2025-09 maintenance mode 전환 → 신규 프로젝트 비권장
  - Clerk 50,000 MAU 무료 + $0.02/MAU 초과
  - Supabase Auth 50,000 MAU 무료 + $0.00325/MAU 초과 (Clerk 대비 6배 저렴)
  - 알려진 CVE: Supabase Auth CVE-2025-48370 (≥2.70.0-rc.7 패치), CVE-2026-31813 (≥2.185.0 패치, Apple/Azure OIDC 사용 시)

## Decision

**Supabase Auth 단독 채택**.

### 핵심 결정
- 인증 공급자: **Supabase Auth** (DB 계층도 Supabase Postgres, ADR-0014 참조)
- 인증 흐름: Server Action 기반 (Next.js 16 App Router proxy.ts middleware)
- 세션 저장: cookie httpOnly + SameSite=Strict
- JWT 클레임 → Postgres RLS `auth.uid()` 함수로 직접 추출 (커스텀 함수 불필요)
- 소셜 로그인: Email/Password + Google 우선 (Apple/Azure OIDC는 보안 CVE 영향 → 사용 시 2.185.0 이상 강제)
- 세션 보안: API 인증은 Server Action에서 독립 검증 (proxy.ts만 의존 금지 — CVE-2025-29927 패턴 회피)

### 사유
- **비용**: 1,000 MAU 기준 $0/월. Pro tier도 50k MAU 초과 시 $0.00325/MAU로 Clerk 대비 6배 저렴.
- **RLS 네이티브 통합**: `auth.uid()` 자동 동작 (Clerk + Supabase 조합은 커스텀 SQL 함수 필요).
- **Lock-in 최저**: Supabase는 PostgreSQL + GoTrue 오픈소스. 이탈 시 자체 호스팅 또는 순수 PG 전환 가능.
- **단일 벤더**: ADR-0014 DB 결정과 통합 → 인프라 단순화.
- **Clerk + Supabase 시나리오 거부 사유**: auth.uid() 미동작, JWT template 2025-04 deprecated, 두 벤더 비용 합산 시 우위 사라짐.

### 명시적 비목표 (v2 단계)
- 디바이스 세션 UI 자동 제공 안 됨 → Supabase Auth API로 자체 구현 (USR-06 작업).
- SSO/SAML — 엔터프라이즈 v3 후보.

## Consequences

### Positive
- 비용 최저 + Lock-in 최저
- RLS 통합 단순 (`auth.uid()`)
- Supabase Auth는 PostgreSQL 위에서 동작 → DB와 동일 트랜잭션 가능
- Server Action + Edge runtime 호환 가능 (단, Edge runtime은 별도 검증 필요)

### Negative
- 디바이스 세션 목록 / 강제 로그아웃 UI를 직접 구현 필요 (Clerk 대비 추가 1~2일 작업)
- 무료 tier: 7일 비활성 시 프로젝트 자동 일시정지 (POC 단계는 수용)
- Supabase Auth CVE 관리 의무: ≥2.185.0 강제 (Apple/Azure OIDC 사용 시)

### 회귀 위험
- POC v1은 인증 없음 → USR-01 도입 시 모든 페이지에 인증 가드 추가 필요
- 데이터 마이그레이션 (Epic G MIG-01) — 첫 로그인 시 IDB → 서버 1회 업로드

## Alternatives

### Clerk + Supabase DB
- 장점: 디바이스 세션 UI 자동 제공, OAuth 공급자 다양
- 단점: 비용 6배, JWT template deprecated, `auth.uid()` 커스텀 함수 필요
- 거부 사유: 단일 사용자 POC + 1,000명 가정에서 가성비 낮음

### Auth.js (NextAuth v5)
- 거부 사유: 2025-09 Better Auth 인수 → 보안 패치 전용 모드. RLS 통합 없음. beta 상태 2년 이상.

### Better Auth (떠오르는 대안)
- 거부 사유: 2026-05 시점 안정성 검증 부족. v2.5에서 재평가 가능.

## 정책 등재

- **TECH-07** (v2 신규): 사용자 인증 — Supabase Auth
- policy-registry §Active에 등재 (2026-05-26)

## 보안 의무

- Supabase Auth ≥2.185.0 강제 (CVE-2026-31813, Apple/Azure OIDC)
- service_role key 클라이언트 번들 노출 절대 금지 (RLS 우회 위험)
- proxy.ts 단독 인증 검증 금지 — Server Action 내 독립 검증 (CVE-2025-29927)
- JWT 신선도: 권한 변경 즉시 반영 필요 시 강제 refresh 전략 (USR-04)
