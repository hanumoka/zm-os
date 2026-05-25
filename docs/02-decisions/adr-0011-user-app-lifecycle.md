---
number: "0011"
title: "사용자 앱 삭제 및 업데이트 UX (APP-04)"
status: "accepted"
date: "2026-05-25"
author: "architect + hanumoka"
related: ["ADR-0008", "PROD-05"]
---

# ADR-0011: 사용자 앱 삭제 및 업데이트 UX

## Context

POC v1에서 사용자가 ZIP으로 업로드한 앱은 삭제 불가(영속)이며, 동일 ID 재업로드 시
DUPLICATE_ID 에러로 거부된다. 사용자 앱 수명주기 관리(생성→업데이트→삭제)가 부재하여
UX 완성도가 낮다.

## Decision

1. **삭제**: 기존 `deleteUserApp` + `uninstall` 조합에 확인 다이얼로그 추가.
   ConfirmDialog 범용 컴포넌트 신규 (HTML `<dialog>`, 외부 의존성 0).
   삭제된 앱의 실행 중 윈도우는 Desktop.tsx useEffect에서 자동 닫기.

2. **업데이트**: `loadUserAppFromZip`의 DUPLICATE_ID 로직을 이원화.
   - built-in 앱 ID → 여전히 DUPLICATE_ID 에러 (보호)
   - 기존 사용자 앱 ID → `ok: true` + `updateTarget` 반환 → 호출자가 확인 다이얼로그 표시 후 upsert

3. **버전 비교**: `compareSemver` 순수 함수 신규 (`src/lib/apps/version.ts`).
   같거나 낮은 버전 시 경고(danger variant) + 사용자 선택. 높은 버전은 primary variant.

4. **보안 유지**: ZIP 보안 검증 6단계(magic byte~manifest)는 전부 유지.
   DUPLICATE_ID 단계만 "업데이트 감지"로 의미 변경. built-in 앱 보호는 reservedIds로 유지.

## Consequences

- (+) 사용자 앱 수명주기 완성 (생성→업데이트→삭제)
- (+) ConfirmDialog는 향후 다른 확인 UX에 재사용 가능
- (+) built-in 앱 보호 유지 (reservedIds)
- (+) WindowManagerProvider manager 객체 useMemo 안정화 (부수 개선)
- (-) zip-loader 시그니처 변경 (3번째 인자 추가, optional이므로 하위 호환)
- (-) AppUploadButton 복잡도 증가 (confirming-update 상태 추가)

## Alternatives

1. **업데이트 시 별도 "업데이트" 버튼**: 별도 UI 진입점. 단점: 업로드 경로 이원화로 UX 혼란.
2. **무조건 덮어쓰기 (확인 없음)**: 단순하지만 실수 위험.
3. **버전 업만 허용 (다운그레이드 차단)**: 엄격하지만 POC에서 과잉.
