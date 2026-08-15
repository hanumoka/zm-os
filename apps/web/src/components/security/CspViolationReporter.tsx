'use client';

import { useEffect } from 'react';

/**
 * CSP 위반을 콘솔에 드러낸다. UI는 렌더하지 않는다.
 *
 * ## 왜 필요한가
 *
 * 2026-08-15 실측 시점에 이 저장소에는 실패를 감지할 수단이 **하나도 없었다** —
 * `securitypolicyviolation` 리스너 0건, `iframe.onload`/`onerror` 0건, CSP
 * `report-uri`/`report-to` 0건. 그래서 프로덕션 셸이 CSP에 막혀 hydration되지
 * 않는 상태가 오래 방치돼 있었고, 화면에는 SSR 마크업이 그대로 보여서 아무도
 * 알아채지 못했다.
 *
 * 이 컴포넌트는 그 공백의 첫 조각이다. 최소한 개발자 도구를 열면 무엇이 막혔는지
 * 보인다.
 *
 * ## 한계 — 무엇을 못 보는가
 *
 * **샌드박스 앱(`srcdoc`) 안에서 일어난 위반은 보이지 않는다.** 자식 문서는 별도
 * origin(opaque)이고 이벤트가 부모로 전파되지 않는다. 앱이 백지가 되어도 여기에는
 * 아무것도 찍히지 않는다. 앱 쪽 감지는 IPC 핸드셰이크 타임아웃 같은 별도 신호로
 * 만들어야 하며 아직 없다.
 *
 * 서버 수집(`report-to`)도 아직 없다. 배포 후 실제 사용자 환경의 위반은 잡히지
 * 않는다.
 */
export function CspViolationReporter(): null {
  useEffect(() => {
    // 같은 위반이 반복돼 콘솔을 덮지 않도록 한 번씩만 알린다.
    const seen = new Set<string>();

    const onViolation = (event: SecurityPolicyViolationEvent): void => {
      const key = `${event.violatedDirective}|${event.blockedURI}|${event.sourceFile ?? ''}:${event.lineNumber ?? 0}`;
      if (seen.has(key)) return;
      seen.add(key);

      console.error(
        '[zm-os/csp] 리소스가 차단됐습니다.',
        {
          directive: event.violatedDirective,
          blockedURI: event.blockedURI,
          source: event.sourceFile
            ? `${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`
            : '(문서)',
          disposition: event.disposition,
        },
        '\n호스트 문서의 위반만 잡힙니다. 샌드박스 앱 내부의 위반은 여기 나오지 않습니다.',
      );
    };

    document.addEventListener('securitypolicyviolation', onViolation);
    return () => {
      document.removeEventListener('securitypolicyviolation', onViolation);
    };
  }, []);

  return null;
}
