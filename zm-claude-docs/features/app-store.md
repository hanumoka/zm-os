# Feature: App Store (STR-01~02)

**Status**: 계획 (Phase 2)
**Owner**: TBD
**Related PRD**: §3 STR-01, STR-02

## 개요

POC 1차에서 스토어는 **로컬 카탈로그**. 미리 정의된 앱 목록(JSON)에서 사용자가 선택해 데스크탑에 설치.

v2 단계에서 서버 백엔드 + 사용자 업로드 도입.

## 설계 (Phase 2 작업 단위에서 상세화)

(placeholder — 코드 구현 단계에서 채움)

## 의존성

- 앱 매니페스트 (APP-01)
- 설치한 앱 목록 관리 (APP-03 / IndexedDB)

## 미결정

- POC 카탈로그 정의 방식 (`public/store-catalog.json` 정적 파일 vs `src/app/api/store/route.ts` 동적)
