---
number: "0043"
title: 이용 앱 관리 경로와 실행별 로컬 저장 세대
status: accepted
date: 2026-11-02
author: Codex
implementation: partial
measured_at: 07229f58a49005b4c7d40e10214b16fc4919f0e7 (변경 전 기준)
---

# 이용 앱 관리와 로컬 삭제의 실행 경계

대상: 웹·API·SDK 유지보수 담당자. 마지막 검토: 2026-11-02.

## 문제와 기준

[ADR-0042](0042-platform-rebuild-local-trial.md)의 플랫폼에서 내 앱에 추가하지 않았거나 목록에서 제거한 앱이 공개 중단되면, 사용자가 동의 철회·로컬 삭제 화면으로 접근하기 어려웠다. 같은 브라우저의 다른 탭에서 데이터 삭제 후 기존 실행의 늦은 저장이 데이터를 다시 만들 수도 있었다. 개발자 승인 취소 상태도 과거 승인 신청과 구분해 표시해야 했다.

제품 정책은 zm-docs의 [정책](https://github.com/hanumoka/zm-docs/blob/main/docs/projects/zm-os/policies.md)과 [웹 우선 결정](https://github.com/hanumoka/zm-docs/blob/main/docs/governance/decisions/DEC-0148-zm-os-complete-web-before-android.md)을 따른다. 이번 결정은 기존 철회·삭제·자격 정책을 구현하며 새로운 사용자 권한을 추가하지 않는다.

## 구현 결정

1. 계정 화면은 `GET /me/app-consents`의 본인 이용 이력으로 관리 경로를 제공한다. Store 공개 여부와 내 앱 등록 여부에 종속하지 않는다. 철회된 기록도 현재 기기 삭제를 위해 남긴다. 목록에는 앱 ID·이름·철회 시각·실행 가능 여부만 제공하고 미공개 버전 내용은 제공하지 않는다.
2. 로컬 삭제 직전 `/me`로 활성 계정과 재인증 필요 여부를 다시 확인한다. 화면에 남은 사용자와 다르면 삭제하지 않고 계정 화면을 갱신한다. 확인 응답 직후 다른 탭의 계정이 바뀌는 모든 순간을 원자적으로 잠그는 구조는 아니며, 로컬 영역은 처음 확인한 사용자 ID와 앱 ID로만 지정한다.
3. IndexedDB v2에 사용자·앱별 저장 세대를 둔다. 실행을 연결할 때 세대를 한 번 읽고, 저장 읽기·쓰기와 세대 검사를 같은 transaction에서 처리한다. 삭제는 행 제거와 세대 변경을 같은 transaction에서 처리한다. 삭제 전 실행이 늦게 접근하면 거절하고 호스트를 종료한다. 새 실행은 새 세대를 받는다.
4. 기존 v1 데이터는 유지한다. 실행 dispose 시 AbortSignal로 아직 완료되지 않은 저장 transaction을 취소한다. 다른 사용자·앱·미리보기 영역은 변경하지 않는다. 다른 브라우저·기기·외부 DB 삭제나 클라우드 동기화를 제공한다는 의미는 아니다.
5. `GET /developer/profile`은 현재 자격과 취소 사유를 반환한다. 과거 신청 결과와 별도로 표시한다. 재승인하면 현재 사유만 비우고 감사 이력과 앱별 운영 상태를 유지한다. 취소 개발자의 공개 중단·종료 신청은 계속 허용한다.

## 검증과 한계

API 인수 시험, v1 저장소 migration·세대 경합·dispose 시험, 실제 여러 탭 브라우저 시험으로 확인한다. 단일 브라우저의 IndexedDB transaction 경계에 의존하며, 사용자가 브라우저 자체 저장을 강제로 편집하는 상황을 방어하는 DRM 기능은 아니다. 모든 인앱 실행은 SDK 저장 호출 때 서버 실행 권한도 다시 확인한다.

실행 결과와 남은 조건은 [웹 완료 검증 목록](../01-architecture/web-completion-checklist.md)과 [작업 기록](../11-archive/2026-11.md)에 둔다. 실제 OAuth와 Android 기기 시험으로 확대 해석하지 않는다.
