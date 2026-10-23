import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setAuthToken, setUnauthorizedHandler } from '../api/client';
import { clearSession, isTokenExpired, loadSession, saveSession } from '../utils/session';
import type { User } from '../types/api';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: Status;
  user: User | null;
  /** Message explaining why the user was signed out (e.g. session expired); shown on Login. */
  sessionNotice: string | null;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  clearNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const reset = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    setStatus('signedOut');
    try {
      await clearSession();
    } catch {
      /* nothing else to do if the keystore is unavailable */
    }
  }, []);

  // Restore the session on startup.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await loadSession();
        if (cancelled) return;
        if (!session) return setStatus('signedOut');
        if (isTokenExpired(session.token)) {
          await clearSession();
          if (!cancelled) {
            setSessionNotice('Your session expired. Please log in again.');
            setStatus('signedOut');
          }
          return;
        }
        setAuthToken(session.token);
        setUser(session.user);
        setStatus('signedIn'); // the server re-validates on the first request (401 => signed out)
      } catch {
        if (!cancelled) setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Any authenticated request that comes back 401 (expired/invalid token) signs the user out.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSessionNotice('Your session expired. Please log in again.');
      void reset();
    });
    return () => setUnauthorizedHandler(null);
  }, [reset]);

  const signIn = useCallback(async (token: string, nextUser: User) => {
    await saveSession(token, nextUser); // SecureStore: Keychain (iOS) / Keystore-backed storage (Android)
    setAuthToken(token);
    setUser(nextUser);
    setSessionNotice(null);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    setSessionNotice(null);
    await reset();
  }, [reset]);

  const clearNotice = useCallback(() => setSessionNotice(null), []);

  const value = useMemo(
    () => ({ status, user, sessionNotice, signIn, signOut, clearNotice }),
    [status, user, sessionNotice, signIn, signOut, clearNotice],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
