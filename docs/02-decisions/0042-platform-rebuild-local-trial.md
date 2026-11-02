---
number: "0042"
title: NestJS 기반 독립 앱 플랫폼의 로컬 시험 구현
status: accepted
date: 2026-11-01
author: Codex
implementation: partial
measured_at: 25e4e92ed65cfe535983ac92688aa1b516bbac62 (구현 전 기준)
---

# 독립 앱 플랫폼의 로컬 시험 구현

대상: 구현 담당자와 소유자. 마지막 검토: 2026-11-01.

## 근거와 범위

제품 정책 정본은 zm-docs의 [요구사항](https://github.com/hanumoka/zm-docs/blob/8df95eedb550f7c6c3999009acc564e4a359ef5a/docs/projects/zm-os/requirements.md), 정책·설계·계약 및 DEC-0121, 0126, 0127, 0135~0141이다. 소유자가 명세 완료 후 개발 진행을 요청했다. 기존 단일 사용자 POC의 로컬 우선·다중 창·Spring 서버 구상은 이번 구현의 기준이 아니다.

## 구현 결정

- 기존 `apps/web`과 기존 패키지는 보존한다. 신규 웹은 `apps/platform-web`, NestJS는 `apps/api`, 검사 작업은 `apps/worker`, Android는 `apps/android`다. 새 실행 명령은 기존 POC 명령과 구분한다.
- 공통 공개 계약은 `packages/platform-contracts`, SDK·CLI·브리지는 새 패키지에 둔다. React/Vite를 웹 호스트로 채택한다.
- PostgreSQL과 매개변수 SQL로 트랜잭션·잠금·유일 제약을 명시한다. Prisma는 제안이었으며 이번 구현에는 추가하지 않는다. 로컬 파일 저장 어댑터는 관리형 운영 저장소의 시험 대역이다.
- 사용자·개발자 자격·앱 공개·운영 중지·동의·실행 상태를 별개로 저장한다. 변경과 감사 기록은 같은 트랜잭션에 포함한다.
- 번들은 ZIP 웹 산출물이다. 등록한 소유자의 앱 ID에 결합하며 불변 버전·파일 지문을 검수한다. 임의 빌드 스크립트나 앱 서버 코드를 실행하지 않는다.
- 웹 호스트는 별도 자산 origin의 번들을 `sandbox="allow-scripts"`로 실행한다. MessagePort 최초 연결은 iframe의 window와 실행 인스턴스에 결합한다. `origin="null"`만으로 신뢰하지 않는다.
- Android는 신뢰하는 웹 호스트와 동일 iframe 경계를 사용하며 임의 네이티브 호출 브리지를 제공하지 않는다. 실제 Android 실행은 SDK·기기 준비 후 별도 검증한다.
- 서버가 없는 앱과 개발자 소유 외부 HTTP 서버 앱을 각각 예제로 검증한다. 외부 인증에는 단회 코드·PKCE·앱 서버 자격을 사용하며 매 요청에 현재 권한을 확인한다.
- 모의 로그인은 명시적인 로컬 시험 모드와 loopback 수신에서만 허용한다. 실제 Google·GitHub 인증과 혼동하지 않는다. 유료 자원·공개 운영은 하지 않는다.

## 완료 판단

타입·DB 통합·브라우저 상호작용·실패 경계를 측정하고 결과와 미실행 항목을 시험 기록에 적는다. 빌드 성공을 실제 OAuth 또는 Android 실행 성공으로 표시하지 않는다. 이 ADR의 채택은 제품 완성을 뜻하지 않는다.
