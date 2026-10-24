import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigurationError } from '../lib/supabaseClient';
import { createProfile, loadProfile, type Profile } from './profileService';
import type { ProfileInput } from './profileValidation';
import {
  replaceSessionInState,
  resolveAuthSessionTransition,
} from './authSessionLifecycle';

export type AuthState =
  | { status: 'loading' }
  | { status: 'configuration-error'; error: string }
  | { status: 'auth-error'; error: string }
  | { status: 'signed-out' }
  | { status: 'checking-profile'; session: Session }
  | { status: 'profile-error'; session: Session; error: string }
  | { status: 'needs-profile'; session: Session }
  | { status: 'password-recovery'; session: Session }
  | { status: 'authenticated'; session: Session; profile: Profile };

interface AuthContextValue {
  state: AuthState;
  signUp: (email: string, password: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  completeProfile: (input: ProfileInput) => Promise<void>;
  retryProfileCheck: () => Promise<void>;
  retrySessionRestore: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getReadableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const revision = useRef(0);
  const currentSession = useRef<Session | null>(null);
  const recoverySession = useRef(false);

  const applySession = useCallback(async (
    session: Session | null,
    event?: AuthChangeEvent,
    forceProfileCheck = false,
  ) => {
    const previousUserId = currentSession.current?.user.id ?? null;
    currentSession.current = session;

    const transition = resolveAuthSessionTransition({
      event,
      currentUserId: previousUserId,
      nextSession: session,
      recoveryActive: recoverySession.current,
      forceProfileCheck,
    });

    if (transition === 'signed-out') {
      revision.current++;
      recoverySession.current = false;
      setState({ status: 'signed-out' });
      return;
    }
    if (!session) return;
    if (transition === 'password-recovery') {
      revision.current++;
      recoverySession.current = true;
      setState({ status: 'password-recovery', session });
      return;
    }
    if (transition === 'preserve-profile') {
      // Supabase emits session-recovery events when a tab becomes visible
      // again. Keep the verified profile and mounted app instead of showing
      // the startup gate and remounting account-scoped UI.
      setState((current) => (
        'session' in current ? replaceSessionInState(current, session) : current
      ));
      return;
    }

    const currentRevision = ++revision.current;
    setState({ status: 'checking-profile', session });
    const result = await loadProfile(session.user.id);
    if (currentRevision !== revision.current || currentSession.current?.user.id !== session.user.id) return;
    const latestSession = currentSession.current ?? session;
    if (result.error) {
      setState({ status: 'profile-error', session: latestSession, error: result.error });
    } else if (!result.profile) {
      setState({ status: 'needs-profile', session: latestSession });
    } else {
      setState({ status: 'authenticated', session: latestSession, profile: result.profile });
    }
  }, []);

  useEffect(() => {
    const client = supabase;
    if (supabaseConfigurationError || !client) {
      setState({ status: 'configuration-error', error: supabaseConfigurationError || 'Supabase is not configured.' });
      return;
    }

    let active = true;
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (active) void applySession(session, event);
    });

    const restore = async () => {
      const { data, error } = await client.auth.getSession();
      if (!active) return;
      if (error) {
        setState({ status: 'auth-error', error: `Could not restore your session: ${error.message}` });
        return;
      }
      if (revision.current === 0) void applySession(data.session);
    };
    void restore();

    return () => {
      active = false;
      revision.current++;
      listener.subscription.unsubscribe();
    };
  }, [applySession]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error(supabaseConfigurationError || 'Supabase is not configured.');
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    return !data.session;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error(supabaseConfigurationError || 'Supabase is not configured.');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!supabase) throw new Error(supabaseConfigurationError || 'Supabase is not configured.');
    const redirectTo = new URL(window.location.href);
    redirectTo.searchParams.set('auth', 'recovery');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: redirectTo.toString(),
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) throw new Error(supabaseConfigurationError || 'Supabase is not configured.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    recoverySession.current = false;
    const session = currentSession.current;
    if (session) await applySession(session, undefined, true);
  }, [applySession]);

  const signOut = useCallback(async () => {
    if (!supabase) throw new Error(supabaseConfigurationError || 'Supabase is not configured.');
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    currentSession.current = null;
    recoverySession.current = false;
    revision.current++;
    setState({ status: 'signed-out' });
  }, []);

  const completeProfile = useCallback(async (input: ProfileInput) => {
    if (state.status !== 'needs-profile') throw new Error('Your authenticated session is not ready for profile setup.');
    const ownerId = state.session.user.id;
    const result = await createProfile(state.session.user, input);
    if (currentSession.current?.user.id !== ownerId) {
      throw new Error('Your account changed before the profile could be confirmed. Please try again.');
    }
    if (result.error || !result.profile) throw new Error(result.error || 'The profile could not be verified.');
    setState({ status: 'authenticated', session: state.session, profile: result.profile });
  }, [state]);

  const retryProfileCheck = useCallback(async () => {
    const session = currentSession.current;
    if (session) await applySession(session, undefined, true);
  }, [applySession]);

  const retrySessionRestore = useCallback(async () => {
    if (!supabase) {
      setState({ status: 'configuration-error', error: supabaseConfigurationError || 'Supabase is not configured.' });
      return;
    }
    setState({ status: 'loading' });
    const { data, error } = await supabase.auth.getSession();
    if (error) setState({ status: 'auth-error', error: `Could not restore your session: ${error.message}` });
    else await applySession(data.session, undefined, true);
  }, [applySession]);

  const value = useMemo<AuthContextValue>(() => ({
    state,
    signUp,
    signIn,
    sendPasswordReset,
    updatePassword,
    signOut,
    completeProfile,
    retryProfileCheck,
    retrySessionRestore,
  }), [
    state, signUp, signIn, sendPasswordReset, updatePassword, signOut,
    completeProfile, retryProfileCheck, retrySessionRestore,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

export function authUser(state: AuthState): User | null {
  return 'session' in state ? state.session.user : null;
}
