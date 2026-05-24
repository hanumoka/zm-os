'use client';

import { useEffect, useRef, useState } from 'react';
import { parseManifest, type AppManifest } from '@/lib/apps/manifest';
import { createSandboxedFrame, type SandboxHandle } from '@/lib/apps/sandbox';

const SAMPLE_MANIFEST: unknown = {
  schemaVersion: 1,
  id: 'com.zmos.sample.bouncing-ball',
  name: 'Bouncing Ball',
  version: '1.0.0',
  author: 'zm-os team',
  description: 'POC 샌드박스 격리 검증용 미니 게임',
  entryPoint: 'index.html',
  size: { defaultWidth: 480, defaultHeight: 320 },
};

const SAMPLE_GAME_URL = '/sample-game/index.html';

type Message = { ts: number; data: unknown };

export default function SandboxTestPage(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    try {
      setManifest(parseManifest(SAMPLE_MANIFEST));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!manifest || !containerRef.current) return;
    const container = containerRef.current;
    let destroyed = false;
    let handle: SandboxHandle | null = null;

    fetch(SAMPLE_GAME_URL)
      .then((r) => r.text())
      .then((html) => {
        if (destroyed) return;
        handle = createSandboxedFrame(container, {
          html,
          width: manifest.size.defaultWidth,
          height: manifest.size.defaultHeight,
          onMessage: (data) => {
            setMessages((prev) => [...prev, { ts: Date.now(), data }]);
          },
        });
      })
      .catch((e) => setError(String(e)));

    return () => {
      destroyed = true;
      handle?.destroy();
    };
  }, [manifest]);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Sandbox Test</h1>
        <p className="text-sm text-gray-600">
          POC 샌드박싱 검증 페이지 — manifest 검증 + iframe 격리 + parent storage 접근 차단
        </p>
      </header>

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{manifest?.name ?? 'Loading...'}</h2>
        {manifest ? (
          <p className="text-sm text-gray-600">
            id: <code>{manifest.id}</code> · v{manifest.version} ·{' '}
            sandbox: <code>{manifest.sandbox.storage}</code>/<code>{manifest.sandbox.network}</code>
          </p>
        ) : null}
        <div ref={containerRef} className="inline-block" />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Messages from sandbox</h2>
        <ul className="space-y-1 text-xs font-mono">
          {messages.length === 0 ? (
            <li className="text-gray-500">(대기 중...)</li>
          ) : (
            messages.map((m, i) => (
              <li key={i} className="rounded bg-gray-100 px-2 py-1">
                <span className="text-gray-500">
                  +{m.ts - messages[0].ts}ms
                </span>{' '}
                {JSON.stringify(m.data)}
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="space-y-1 text-sm text-gray-700">
        <h2 className="text-lg font-semibold text-gray-900">검증 포인트</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            iframe <code>sandbox=&quot;allow-scripts&quot;</code> 만 부여 ·{' '}
            <code>allow-same-origin</code> 부여 안 함
          </li>
          <li>
            HTML은 <code>srcdoc</code>로 인라인 → iframe origin은{' '}
            <code>&quot;null&quot;</code> 로 격리
          </li>
          <li>
            게임 안에서 <code>window.parent.localStorage</code>,{' '}
            <code>window.parent.document</code>, <code>document.cookie</code>{' '}
            접근 시도 → 위 isolation-check 메시지의 결과가 모두 <code>false</code>여야 OK
          </li>
          <li>
            postMessage 수신 시 <code>event.origin === &quot;null&quot;</code> 검증
          </li>
        </ul>
      </section>
    </main>
  );
}
