'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { setCsrfToken } from '@/lib/csrf';

interface SessionValue {
  /** True when this deployment requires a login (a CSRF token exists). */
  authenticated: boolean;
}

const SessionContext = createContext<SessionValue>({ authenticated: false });

/** Hands the server-issued CSRF token to the browser-side requests and tells the UI a login is in use. */
export function SessionProvider({
  csrfToken,
  children,
}: {
  csrfToken: string | null;
  children: ReactNode;
}) {
  // Set before children render so their first request already carries it.
  useState(() => setCsrfToken(csrfToken));
  useEffect(() => setCsrfToken(csrfToken), [csrfToken]);

  return (
    <SessionContext.Provider value={{ authenticated: csrfToken !== null }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = (): SessionValue => useContext(SessionContext);
