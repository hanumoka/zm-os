#!/usr/bin/env node
/**
 * 빌드 산출물에서 문서 라우트가 정적으로 생성되지 않았는지 검사한다.
 *
 * ## 왜 필요한가
 *
 * prod CSP는 `script-src 'self' 'nonce-...'` 이고, Next.js는 **요청에 실린 CSP
 * 헤더를 근거로 SSR 중에만** nonce를 주입한다. 라우트가 정적으로 생성되면 요청
 * 헤더가 존재하지 않아 nonce가 붙지 않고, prerender된 inline script 6개가 전부
 * 차단되어 **셸이 hydration되지 않는다.**
 *
 * 그런데 이 실패는 화면에 드러나지 않는다. SSR 마크업이 그대로 그려져서 데스크탑이
 * 정상으로 보이고, 시계가 멈춘 것 말고는 단서가 없다. 2026-08-15에 이 상태로
 * 프로덕션 빌드가 방치돼 있었다는 것이 실측으로 확인됐다.
 *
 * `app/layout.tsx`의 `export const dynamic = 'force-dynamic'` 한 줄이 이것을
 * 막는데, 그 줄이 지워져도 아무도 모른다. 그래서 소스가 아니라 **빌드 산출물**을
 * 본다 — 실제 조건을 검사해야 우회가 안 된다.
 *
 * 근거: `zm-docs`의 `docs/research/2026-08-15-zm-os-prod-build-measurement.md`
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(webRoot, '.next/prerender-manifest.json');

/** 반드시 동적이어야 하는 문서 라우트. 셸을 렌더하며 nonce가 필요하다. */
const MUST_BE_DYNAMIC = ['/', '/store', '/sandbox-test'];

if (!existsSync(manifestPath)) {
  console.error(
    `[verify-dynamic-rendering] .next/prerender-manifest.json 이 없습니다.\n` +
      `  next build 이후에 실행해야 합니다: ${manifestPath}`,
  );
  process.exit(1);
}

/** @type {{ routes?: Record<string, unknown> }} */
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const prerendered = Object.keys(manifest.routes ?? {});
const offenders = MUST_BE_DYNAMIC.filter((r) => prerendered.includes(r));

if (offenders.length > 0) {
  console.error(
    `\n[verify-dynamic-rendering] 문서 라우트가 정적으로 생성됐습니다: ${offenders.join(', ')}\n\n` +
      `  정적 라우트에는 nonce가 주입되지 않습니다. 그 결과 prerender된 inline script가\n` +
      `  CSP에 차단되어 프로덕션 셸이 hydration되지 않습니다. 화면에는 SSR 마크업이\n` +
      `  그대로 보이므로 눈으로는 알아채기 어렵습니다.\n\n` +
      `  app/layout.tsx 의 다음 줄이 남아 있는지 확인하세요:\n` +
      `      export const dynamic = 'force-dynamic';\n`,
  );
  process.exit(1);
}

console.log(
  `[verify-dynamic-rendering] OK — 문서 라우트 ${MUST_BE_DYNAMIC.length}개가 모두 동적입니다.`,
);
