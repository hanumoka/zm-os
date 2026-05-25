'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { PersistenceErrorEvent, PersistenceErrorHandler } from './persistence-error';
import { defaultPersistenceErrorHandler } from './persistence-error';

const MAX_RECENT_ERRORS = 20;

export type PersistenceErrorContextValue = {
  onPersistenceError: PersistenceErrorHandler;
  recentErrors: ReadonlyArray<PersistenceErrorEvent>;
};

const PersistenceErrorContext = createContext<PersistenceErrorContextValue | null>(null);

type PersistenceErrorProviderProps = {
  children: React.ReactNode;
  handler?: PersistenceErrorHandler;
};

export function PersistenceErrorProvider({
  children,
  handler,
}: PersistenceErrorProviderProps): React.JSX.Element {
  const [recentErrors, setRecentErrors] = useState<ReadonlyArray<PersistenceErrorEvent>>([]);
  const handlerRef = useRef(handler ?? defaultPersistenceErrorHandler);
  handlerRef.current = handler ?? defaultPersistenceErrorHandler;

  const onPersistenceError = useCallback((event: PersistenceErrorEvent): void => {
    handlerRef.current(event);
    setRecentErrors((prev) => {
      const next = [...prev, event];
      return next.length > MAX_RECENT_ERRORS ? next.slice(-MAX_RECENT_ERRORS) : next;
    });
  }, []);

  const value = useMemo<PersistenceErrorContextValue>(
    () => ({ onPersistenceError, recentErrors }),
    [onPersistenceError, recentErrors],
  );

  return (
    <PersistenceErrorContext.Provider value={value}>
      {children}
    </PersistenceErrorContext.Provider>
  );
}

export function usePersistenceError(): PersistenceErrorContextValue {
  const ctx = useContext(PersistenceErrorContext);
  if (ctx === null) {
    throw new Error('usePersistenceError: PersistenceErrorProvider 하위에서 호출해야 합니다.');
  }
  return ctx;
}
