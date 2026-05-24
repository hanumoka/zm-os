# Research: 브라우저 가상 데스크탑/OS 오픈소스 현황

> Phase 1 리서치 (2026-05-24). zm-os POC 출발점 결정용.
> 이 문서는 외부 자료 정리본 (스냅샷). 최신 정보는 각 프로젝트 GitHub 확인.

## 후보 비교 (요약)

### 1. Puter (puter.com / github.com/HeyPuter/puter) ⭐⭐⭐
- **요약**: 42k stars의 "Internet OS". 통합 앱 스토어 / 멀티유저 / 가상 파일시스템 보유.
- **스택**: JS 48% + TS 46%, Express/Node 백엔드, 자체 Puter.js SDK
- **앱 패키지**: Puter.js SDK 기반, Marketplace 발행 가능
- **멀티유저**: UUID 인증 + 액터 기반 권한 (User/App/AccessToken/Site/System) + 가상 FS
- **라이선스**: **AGPL-3.0** (상업화 시 주의)
- **POC 가치**: 영감 + 부분 참고. 도메인 매칭 약하고 라이선스 부담.
- **한계**: 클라우드 스토리지·AI 중심으로 비전 차이 큼.

### 2. daedalOS (github.com/DustinBrett/daedalOS) ⭐⭐
- **요약**: 12.2k stars. Windows 95풍 데스크탑 UI. BrowserFS 파일시스템 에뮬레이션.
- **스택**: Next.js + React, BrowserFS, JS-DOS, WebAmp, PDF.js, WebODF
- **앱 패키지**: 구조 없음. 내장 앱 + BrowserFS 파일 실행.
- **멀티유저**: 미지원 (로컬 브라우저 저장만)
- **POC 가치**: UI/UX 디자인 참고, BrowserFS 통합 참고
- **한계**: 멀티유저 0, 앱 스토어 0

### 3. OS.js (os-js.org) ⭐
- **요약**: 7.1k stars. 오래된 웹 데스크탑 프레임워크 (2009~).
- **스택**: JS 69%, Express 백엔드, Webpack
- **앱 패키지**: npm 패키지 + 명시적 매니페스트
- **POC 가치**: 매니페스트/플러그인 시스템 참고
- **한계**: 매우 낡음 (2021년 이후 정체), 스토어 개념 없음

### 4. v86 / JSLinux / WebVM ⭐ (영감만)
- **요약**: x86 에뮬레이터를 WASM에서. 브라우저에서 Linux/Win95 부팅.
- **스택**: WebAssembly + JIT
- **POC 가치**: "진짜 OS" 비전에 가장 가깝지만, 성능 오버헤드 심해 실용 불가
- **한계**: 앱 스토어 불가능, 파일시스템 복잡도 극대

### 5. Stackblitz WebContainers ⭐⭐⭐ (선택적 활용)
- **요약**: 브라우저 안 Node.js 런타임 (WASM)
- **POC 가치**: 사용자 앱이 Node.js를 필요로 할 때 통합 가치 매우 높음
- **한계**: OS/파일시스템/멀티유저 개념 없음

### 6. ChromeOS (비교용)
- **요약**: Google의 실제 OS. 브라우저=OS 패러다임.
- **POC 가치**: 아키텍처 철학 참고만 가능.

### 7. itch.io HTML5 호스팅 (비교용)
- **요약**: ZIP 업로드 (최대 1000파일, 500MB) + iframe 샌드박싱.
- **POC 가치**: 게임 패키징 + 실행 패턴 참고

## zm-os 결정 (ADR-0001 참조)

- **자작 + zm-v3 골격**: Puter 포크 X, daedalOS UI 부분 참고
- **이유**: 라이선스 자유, 도메인 매칭, 학습 비용 최소

## 출처

- [Puter GitHub](https://github.com/HeyPuter/puter)
- [Puter 기술 글](https://medium.com/data-and-beyond/your-desktop-in-the-cloud-a-hands-on-tutorial-for-puter-internet-os-e7da3be221cf)
- [daedalOS GitHub](https://github.com/DustinBrett/daedalOS)
- [daedalOS 아키텍처](https://dev.to/dustinbrett/how-i-made-a-desktop-environment-in-the-browser-15oi)
- [OS.js](https://www.os-js.org/)
- [ChromeOS 아키텍처](https://www.chromium.org/chromium-os/chromiumos-design-docs/software-architecture/)
- [Stackblitz WebContainers](https://webcontainers.io/)
- [v86](https://github.com/copy/v86)
- [itch.io HTML5 가이드](https://itch.io/docs/creators/html5)
