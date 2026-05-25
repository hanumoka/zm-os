'use client';

import React, { useEffect } from 'react';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps): React.JSX.Element {
  useEffect(() => {
    console.error('[zm-os] global error:', error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#f5f5f5',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: '100%',
            padding: 24,
            borderRadius: 8,
            border: '1px solid #fca5a5',
            backgroundColor: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}
        >
          <h2 style={{ color: '#b91c1c', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            치명적 오류
          </h2>
          <p style={{ color: '#525252', fontSize: 14, marginBottom: 16 }}>
            {error.digest !== undefined
              ? `애플리케이션에 심각한 문제가 발생했습니다. (코드: ${error.digest})`
              : '애플리케이션에 심각한 문제가 발생했습니다.'}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 6,
              border: 'none',
              backgroundColor: '#dc2626',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
