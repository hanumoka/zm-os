# 트러블슈팅 인덱스 (Troubleshooting Index)
> 상세: `docs/13-troubleshooting/entries.md` | 규칙: `.claude/rules/troubleshoot-auto.md`
> 최종 갱신: 2026-05-25

| ID | 문제 요약 | 모듈 | 원인 분류 | 관련 M-NNN |
|----|-----------|------|-----------|------------|
| TS-001 | StrictMode setInterval cleanup 누락 | sandbox-test | React lifecycle | — |
| TS-002 | RPC 권한 게이트 length>0 우회 | ipc/host | 로직 결함 | — |
| TS-003 | AppFrame useRef guard가 2차 mount 차단 | desktop/AppFrame | React StrictMode | M-001 |
| TS-004 | Snake 게임 자동 시작 후 즉시 Game Over | sample-game | 게임 UX | — |
| TS-005 | ZIP built-in manifest.id 중복 검사 우회 | store/AppUpload | 입력 검증 | — |
