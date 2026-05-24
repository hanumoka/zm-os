'use client';

import { useEffect, useRef, useState } from 'react';
import { parseManifest, type AppManifest } from '@/lib/apps/manifest';
import { createSandboxedFrame, type SandboxHandle } from '@/lib/apps/sandbox';
import type { HostEndpoint, IpcStatus } from '@/lib/apps/ipc';

// ─── 상수 ────────────────────────────────────────────────────────────────────

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
const SAMPLE_IPC_URL = '/sample-game-ipc/index.html';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type Message = { ts: number; data: unknown };

type IpcLogEntry = {
  ts: number;
  kind: 'info' | 'ok' | 'error';
  text: string;
};

// ─── 페이지 컴포넌트 ──────────────────────────────────────────────────────────

export default function SandboxTestPage(): React.JSX.Element {
  // ── 기존 Bouncing Ball 데모 상태 ────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // ── IPC 데모 상태 ───────────────────────────────────────────────────────────
  const ipcContainerRef = useRef<HTMLDivElement>(null);
  const [ipcStatus, setIpcStatus] = useState<IpcStatus>('idle');
  const [ipcError, setIpcError] = useState<string | null>(null);
  const [ipcLog, setIpcLog] = useState<IpcLogEntry[]>([]);
  const endpointRef = useRef<HostEndpoint | null>(null);

  // ── 기존 manifest 파싱 ─────────────────────────────────────────────────────
  useEffect(() => {
    try {
      setManifest(parseManifest(SAMPLE_MANIFEST));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // ── 기존 Bouncing Ball 프레임 생성 ─────────────────────────────────────────
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

  // ── IPC 데모 프레임 생성 ───────────────────────────────────────────────────
  useEffect(() => {
    if (!ipcContainerRef.current) return;
    const container = ipcContainerRef.current;
    let destroyed = false;
    let handle: SandboxHandle | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;

    const addLog = (kind: IpcLogEntry['kind'], text: string): void => {
      setIpcLog((prev) => [...prev, { ts: Date.now(), kind, text }]);
    };

    fetch(SAMPLE_IPC_URL)
      .then((r) => r.text())
      .then((html) => {
        if (destroyed) return;

        handle = createSandboxedFrame(container, {
          html,
          width: 480,
          height: 280,
          ipc: {
            allowedMethods: ['ping', 'getTime', 'echo'],
            defaultTimeoutMs: 5000,
            expose: {
              ping: (): Promise<'pong'> => {
                addLog('ok', '[호스트 수신] ping → pong 응답');
                return Promise.resolve('pong');
              },
              getTime: (): Promise<string> => {
                const now = new Date().toISOString();
                addLog('ok', `[호스트 수신] getTime → ${now}`);
                return Promise.resolve(now);
              },
              echo: (...args: unknown[]): Promise<string> => {
                const msg = typeof args[0] === 'string' ? args[0] : String(args[0] ?? '');
                const reply = 'host echoed: ' + msg;
                addLog('ok', `[호스트 수신] echo("${msg}") → "${reply}"`);
                return Promise.resolve(reply);
              },
            },
          },
        });

        if (handle.ipc) {
          endpointRef.current = handle.ipc;
          addLog('info', 'IPC 엔드포인트 생성됨 — 핸드셰이크 대기 중...');

          // 상태 폴링으로 UI 반영 (핸드셰이크는 비동기).
          // pollId 는 effect-scope let 으로 유지 → cleanup 에서 명시적 clearInterval.
          // React StrictMode unmount/remount 시 stale interval 누수 방지.
          pollId = setInterval(() => {
            const ep = endpointRef.current;
            if (!ep) {
              if (pollId !== null) clearInterval(pollId);
              return;
            }
            const s = ep.status;
            setIpcStatus(s);
            if (s === 'ready') {
              addLog('ok', '✅ 핸드셰이크 완료 — 앱과 IPC 연결됨');
              if (pollId !== null) clearInterval(pollId);
            } else if (s === 'error') {
              addLog('error', '❌ 핸드셰이크 타임아웃 또는 오류');
              if (pollId !== null) clearInterval(pollId);
            } else if (s === 'closed') {
              if (pollId !== null) clearInterval(pollId);
            }
          }, 100);
        }
      })
      .catch((e) => {
        setIpcError(String(e));
      });

    return () => {
      destroyed = true;
      if (pollId !== null) clearInterval(pollId);
      endpointRef.current = null;
      handle?.destroy();
    };
  }, []);

  // ── IPC 상태 색상 맵 ────────────────────────────────────────────────────────
  function statusColor(s: IpcStatus): string {
    switch (s) {
      case 'ready':      return 'text-green-600';
      case 'connecting': return 'text-yellow-600';
      case 'error':      return 'text-red-600';
      case 'closed':     return 'text-gray-500';
      default:           return 'text-gray-400';
    }
  }

  function statusLabel(s: IpcStatus): string {
    switch (s) {
      case 'idle':       return '대기';
      case 'connecting': return '연결 중...';
      case 'ready':      return '연결됨';
      case 'closed':     return '닫힘';
      case 'error':      return '연결 오류';
      default:           return s;
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      {/* ─── 페이지 헤더 ─────────────────────────────────────────────────── */}
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

      {/* ─── 섹션 1: Bouncing Ball (기존 보존) ──────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          섹션 1 — {manifest?.name ?? 'Loading...'}
        </h2>
        <p className="text-xs text-gray-500">
          기존 onMessage 레거시 데모 (IPC 미사용 · P1 보존)
        </p>
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
        <h2 className="text-lg font-semibold text-gray-900">섹션 1 검증 포인트</h2>
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

      {/* ─── 구분선 ──────────────────────────────────────────────────────── */}
      <hr className="border-gray-200" />

      {/* ─── 섹션 2: IPC Demo (신규) ─────────────────────────────────────── */}
      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold">섹션 2 — IPC Demo</h2>
          <p className="text-sm text-gray-600">
            <code>window.__zmosIpc.call(method, args)</code> 를 통한 호스트 RPC 양방향 통신 검증.
            앱(iframe) 버튼 클릭 시 호스트 메서드가 실행되고 아래 로그에 기록됩니다.
          </p>
        </header>

        {ipcError ? (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            IPC 데모 오류: {ipcError}
          </div>
        ) : null}

        {/* 연결 상태 배지 */}
        <div className="flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          <span className="font-medium text-gray-700">IPC 상태:</span>
          <span className={`font-mono font-semibold ${statusColor(ipcStatus)}`}>
            {statusLabel(ipcStatus)}
          </span>
          <span className="ml-auto text-xs text-gray-500">
            호스트 expose: <code>ping</code> · <code>getTime</code> · <code>echo</code>
          </span>
        </div>

        {/* IPC 앱 프레임 */}
        <div ref={ipcContainerRef} className="inline-block" />

        {/* 호스트 측 IPC 로그 */}
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-700">
            호스트 측 IPC 로그
          </h3>
          <ul className="space-y-1 font-mono text-xs max-h-40 overflow-y-auto rounded border border-gray-200 bg-white p-2">
            {ipcLog.length === 0 ? (
              <li className="text-gray-400">(로그 없음 — 앱 버튼 클릭 시 기록됨)</li>
            ) : (
              ipcLog.map((entry, i) => (
                <li
                  key={i}
                  className={
                    entry.kind === 'ok'
                      ? 'text-green-700'
                      : entry.kind === 'error'
                        ? 'text-red-700'
                        : 'text-gray-500'
                  }
                >
                  <span className="text-gray-400">
                    +{entry.ts - ipcLog[0].ts}ms
                  </span>{' '}
                  {entry.text}
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      {/* ─── 섹션 2 검증 포인트 ──────────────────────────────────────────── */}
      <section className="space-y-1 text-sm text-gray-700">
        <h2 className="text-lg font-semibold text-gray-900">섹션 2 검증 포인트</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            IPC 런타임(<code>window.__zmosIpc</code>)이 srcdoc에 자동 주입됨
            — <code>sandbox.ts: injectIpcRuntime</code> 경유
          </li>
          <li>
            앱 버튼 클릭 → <code>window.__zmosIpc.call(method)</code> →
            호스트 <code>expose</code> 핸들러 실행 → 결과 앱 화면 표시
          </li>
          <li>
            호스트 로그에 RPC 수신 기록 확인 (
            <code>ping</code> · <code>getTime</code> · <code>echo</code>)
          </li>
          <li>
            raw <code>postMessage</code> 직접 호출 없음 —
            <code>createHostEndpoint</code> 내부 캡슐화
          </li>
          <li>
            IPC 상태 배지가 <span className="text-green-600 font-semibold">연결됨</span>으로
            전환되어야 핸드셰이크 성공
          </li>
        </ul>
      </section>
    </main>
  );
}
