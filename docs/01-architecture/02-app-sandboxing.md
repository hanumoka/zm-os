# Feature: App Sandboxing (SBX-01~02, IPC-01)

**Status**: 계획 (Phase 1 — 가장 중요)
**Owner**: TBD
**Related PRD**: §3 SBX-01, SBX-02, IPC-01
**관련 ADR**: [adr-0001-initial-stack.md](../decisions/adr-0001-initial-stack.md)
**보안 규칙**: [`.claude/rules/security.md`](../../.claude/rules/security.md)

## 개요

신뢰할 수 없는 사용자 제출 앱을 브라우저에서 안전하게 실행하기 위한 핵심 인프라.

## 접근

**blob: URL iframe + `sandbox="allow-scripts"` + Comlink IPC**

근거: [`02-sandboxing-untrusted-js.md`](../05-analysis/02-sandboxing-untrusted-js.md)
- 게임 엔진(Phaser/Pixi/Three.js/Godot) 100% 호환
- Figma, itch.io 등에서 검증된 패턴
- 구현 단순, 성능 오버헤드 거의 없음
- 격리 강도 충분 (QuickJS-WASM 인터프리터는 게임에 과함)

## 설계 (Phase 1 작업 단위에서 상세화)

(placeholder — 코드 구현 단계에서 채움)

## 알려진 위험 + 대응

| 위험 | 대응 |
|------|------|
| iframe sandbox 우회 CVE | 정기 점검, security.md CVE 목록 갱신 |
| postMessage origin 위조 | event.origin 화이트리스트 검증 (Comlink 안에 캡슐화) |
| 무한 루프 → 탭 hang | iframe별 soft timeout (60초 기본) |
| COEP/COOP가 SharedArrayBuffer 요구하는 게임 엔진 | 헤더 조건부 적용, 게임별 호환성 매트릭스 |
| 사용자 앱이 host storage 접근 시도 | sandbox iframe origin 격리로 자동 차단 (테스트 필수) |

## 의존성

- 앱 매니페스트 (APP-01)
- CSP/Permissions-Policy 헤더 (SBX-02 = next.config.ts)

## 미결정

- Comlink endpoint 노출 API 표면 (어디까지 호스트 함수 허용?)
- 게임 종료 시 iframe DOM 정리 시점
- 게임 상태 저장 API (호스트 storage 우회해서 sandbox storage 사용?)
