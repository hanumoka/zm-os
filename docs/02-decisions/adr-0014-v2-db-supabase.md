---
number: "0014"
title: v2 Postgres 호스팅 + RLS — Supabase 채택
status: superseded
date: 2026-05-26
author: hanumoka
related: ["0013", "0015", "0017"]
superseded_by: ["0017"]
---

# ADR-0014: v2 Postgres 호스팅 + RLS — Supabase 채택

> ⚠️ **2026-05-27 superseded by ADR-0017**: 본 ADR은 ADR-0017(Ports & Adapters)의 어댑터 옵션 명세로 reshape됨. Supabase Postgres + Drizzle은 `AppRepository` Port의 Cloud 어댑터 중 하나로 격하되며, 상세 명세는 **ADR-0025+** (CloudRepo-Supabase, v2 CLD Epic 진입 시점에 작성)에서 별도 작성된다. 본 ADR의 결정 근거(RLS auth.uid()=owner_id 패턴, Drizzle ORM 선택, B-tree 인덱스 의무 등)는 ADR-0025+ 작성 시 참고용으로 보존한다.

## Context

- v2에서 사용자/앱/설치 메타데이터를 Postgres에 저장. RLS로 사용자별 데이터 격리.
- v2 plan §5 ADR Candidate 1순위 (병렬 3건). STR-v2 / CLD Epic 전제.
- ADR-0013에서 Supabase Auth 채택 결정 → DB도 Supabase로 단일화 시 `auth.uid()` 네이티브 통합 가능.
- research-analyst 보고 (2026-05-26):
  - **Neon**: 무료 자동 정지 없음, Edge runtime 공식 지원, `pg_session_jwt`로 모든 JWT 공급자 통합, Drizzle 공식 파트너십. 1순위 평가.
  - **Supabase**: `auth.uid()` 자동 동작 (Supabase Auth 시), 7일 비활성 자동 정지 (POC 주의), Pro $25/월. 2순위 평가 (Supabase Auth 결합 시 1순위).
  - **Vercel Postgres**: 2024-12 deprecated → Neon 직접 통합으로 전환. 후보 제외.
  - **자체 호스팅**: VPS + 백업/패치/HA 수동 운영 부담. POC 단계 비권장.
- 알려진 CVE: CVE-2025-48757 (Supabase RLS 미설정 노출, 170+ 앱 영향) — RLS 기본 활성화 의무.

## Decision

**Supabase 채택**.

### 핵심 결정
- DB 호스팅: **Supabase Postgres** (Supabase Auth와 단일 벤더)
- ORM: **Drizzle ORM** (2026 표준, Supabase 공식 튜토리얼)
- 마이그레이션 도구: **Drizzle Kit** (`drizzle-kit generate` + `drizzle-kit migrate`)
- RLS 정책: 모든 사용자 데이터 테이블에 `auth.uid() = owner_id` 패턴 기본 활성화
- 무료 tier: POC v1 트래픽 검증용. 일시정지 우회를 위해 v2 Pro 출시 직전 업그레이드.
- Edge runtime: 검증 필요 (Server Action 우선 사용). `@supabase/supabase-js` Cloudflare Workers 지원 발표 있으나 zm-os 환경 별도 spike.

### 사유
- **Supabase Auth 결합 시 1순위**: `auth.uid()` 함수가 모든 RLS 정책에서 별도 함수 작성 없이 사용 가능
- **단일 벤더 운영 단순화**: ADR-0013 결정에 따라 인증/DB/Storage/Realtime 모두 Supabase로 통합 가능
- **벤더 Lock-in 최저**: Supabase는 PostgreSQL + GoTrue + PostgREST 오픈소스. pg_dump 표준 지원. 이탈 시 자체 호스팅 또는 Neon으로 이전 가능.
- **Drizzle ORM 공식 튜토리얼**: 마이그레이션 도구 학습 곡선 최저
- **Neon 거부 사유**: ADR-0013에서 Supabase Auth 채택 → Neon 사용 시 `pg_session_jwt` 추가 설정 필요. 단일 벤더 효율성 손실.

### RLS 정책 표준
```sql
-- 모든 사용자 데이터 테이블에 다음 패턴 강제
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<table>_owner_only" ON <table>
  FOR ALL USING (auth.uid() = owner_id);

-- owner_id 컬럼에 B-tree 인덱스 필수
CREATE INDEX idx_<table>_owner_id ON <table>(owner_id);
```

### 백업 정책
- Pro tier (출시 직전 업그레이드): 일 단위 자동 백업, 7일 보관
- PITR 필요 시: $100/월 add-on (Small compute 이상)
- 추가 안전망: 주 1회 pg_dump → 별도 R2/S3 저장 (SRV-06)

## Consequences

### Positive
- `auth.uid()` RLS 자동 통합 (커스텀 함수 0건)
- Drizzle ORM 공식 튜토리얼 + 마이그레이션 자동화
- 단일 벤더 → 운영/디버깅 일원화
- Lock-in 최저 (PG 표준 + pg_dump)

### Negative
- 무료 tier 7일 비활성 정지 → POC 단계 모니터링 필요
- Pro tier $25/월 (DB 컴퓨트 별도)
- PITR은 add-on $100/월 → POC v1 단계 미도입, v2 베타 시점 검토
- Edge runtime 호환은 별도 spike 필요

### 보안 의무 (회피 불가)
- 모든 신규 테이블 마이그레이션 스크립트에 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` 강제 (CVE-2025-48757 패턴 차단)
- service_role key 절대 클라이언트 노출 금지 (RLS 우회)
- RLS 정책 작성 시 안티패턴 회피: 정책 내 JOIN/서브쿼리 금지, `SELECT (auth.uid()) = owner_id` 패턴 사용 (statement-level 캐싱)

## Alternatives

### Neon + Drizzle + pg_session_jwt
- 장점: 자동 정지 없음, Edge runtime 공식, JWT 공급자 무관
- 단점: ADR-0013에서 Supabase Auth 선택 → `pg_session_jwt` 추가 학습/배선 필요
- 거부 사유: 인증 공급자 결정 후 단일 벤더 효율성이 더 큼

### Vercel Postgres
- 거부 사유: 2024-12 deprecated. 현재는 Neon 직접 통합으로 전환됨.

### 자체 호스팅 PostgreSQL + Auth.js
- 거부 사유: ADR-0013에서 Auth.js v5 거부. 운영 부담 (백업/패치/HA) POC 단계 비현실적.

## 정책 등재

- **TECH-08** (v2 신규): DB 호스팅 — Supabase Postgres + Drizzle ORM
- **CONST-01** (v2 신규): RLS 기본 활성화 의무 — 모든 사용자 데이터 테이블
- policy-registry §Active에 등재 (2026-05-26)

## 추가 spike (USR-01 진입 전)
- Edge runtime 호환 검증 (1일)
- Drizzle Kit 마이그레이션 워크플로 — 로컬 dev / staging / prod 분리 (1일)
- RLS 인덱스 성능 벤치 (1일)
