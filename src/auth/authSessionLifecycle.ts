import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

export type AuthSessionTransition =
  | 'signed-out'
  | 'password-recovery'
  | 'preserve-profile'
  | 'verify-profile';

interface ResolveAuthSessionTransitionOptions {
  event?: AuthChangeEvent;
  currentUserId: string | null;
  nextSession: Session | null;
  recoveryActive?: boolean;
  forceProfileCheck?: boolean;
}

/**
 * Decides whether an auth callback needs to verify the profile again.
 *
 * Supabase re-emits SIGNED_IN when a hidden tab becomes visible and it
 * recovers the persisted session. That is a session refresh, not a new login.
 * The same applies to INITIAL_SESSION and TOKEN_REFRESHED events that overlap
 * the initial restore. Reusing the already verified profile keeps the
 * authenticated UI, exam state, and open feature screens mounted.
 *
 * Explicit retries and account changes still verify the profile. Sign-out and
 * password recovery are handled before the same-user check.
 */
export function resolveAuthSessionTransition({
  event,
  currentUserId,
  nextSession,
  recoveryActive = false,
  forceProfileCheck = false,
}: ResolveAuthSessionTransitionOptions): AuthSessionTransition {
  if (!nextSession) return 'signed-out';
  if (recoveryActive || event === 'PASSWORD_RECOVERY') return 'password-recovery';
  if (!forceProfileCheck && currentUserId === nextSession.user.id) {
    return 'preserve-profile';
  }
  return 'verify-profile';
}

/**
 * Replaces only the session token, leaving the current auth status and profile
 * in place. The user id must still match the state that is being updated.
 */
export function replaceSessionInState<T extends { session: Session }>(
  state: T,
  session: Session,
): T {
  if (state.session.user.id !== session.user.id) return state;
  return { ...state, session };
}
