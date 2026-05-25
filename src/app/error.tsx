'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';

type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorBoundaryProps): React.JSX.Element {
  useEffect(() => {
    console.error('[zm-os] route error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center w-full h-full min-h-screen bg-neutral-100 dark:bg-neutral-900 p-6">
      <div className="max-w-md w-full rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-neutral-800 shadow-lg p-6">
        <h2 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">
          오류가 발생했습니다
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4">
          {error.digest !== undefined
            ? `문제가 발생했습니다. (코드: ${error.digest})`
            : error.message}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
          >
            데스크탑으로
          </Link>
        </div>
      </div>
    </div>
  );
}
