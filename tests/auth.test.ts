import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { validateProfileInput } from '../src/auth/profileValidation';
import {
  replaceSessionInState,
  resolveAuthSessionTransition,
} from '../src/auth/authSessionLifecycle';
import {
  getAccountLocalStorageKey,
  setActiveAccountOwnerId,
} from '../src/utils/accountStorage';
import { readStudyNotes, saveStudyNotes } from '../src/utils/studyToolsStorage';

test('profile validation trims full name and blank coaching institute', () => {
  const result = validateProfileInput({
    fullName: '  Asha Rao  ',
    studentClass: '12th',
    targetNeetYear: '2026',
    coachingInstitute: '   ',
  }, 2026);

  assert.equal(result.error, null);
  assert.deepEqual(result.value, {
    full_name: 'Asha Rao',
    student_class: '12th',
    target_neet_year: 2026,
    coaching_institute: null,
  });
});

test('profile validation rejects blank names, invalid classes, and past years', () => {
  const base = {
    fullName: 'Student',
    studentClass: '11th' as const,
    targetNeetYear: '2027',
    coachingInstitute: '',
  };

  assert.match(validateProfileInput({ ...base, fullName: '\t \n' }, 2026).error || '', /full name/i);
  assert.match(validateProfileInput({ ...base, studentClass: 'college' as never }, 2026).error || '', /class/i);
  assert.match(validateProfileInput({ ...base, targetNeetYear: '2025' }, 2026).error || '', /2026 or later/i);
});

test('profile validation accepts only integer years within PostgreSQL integer range', () => {
  const base = {
    fullName: 'Student',
    studentClass: 'dropper' as const,
    coachingInstitute: '',
  };

  assert.equal(
    validateProfileInput({ ...base, targetNeetYear: '2028' }, 2026).value?.target_neet_year,
    2028,
  );
  assert.ok(validateProfileInput({ ...base, targetNeetYear: '2026.5' }, 2026).error);
  assert.ok(validateProfileInput({ ...base, targetNeetYear: '2147483648' }, 2026).error);
});

test('account local storage namespaces differ by owner and do not overlap legacy keys', () => {
  const keyA = getAccountLocalStorageKey('11111111-1111-4111-8111-111111111111', 'bookmarks');
  const keyB = getAccountLocalStorageKey('22222222-2222-4222-8222-222222222222', 'bookmarks');

  assert.notEqual(keyA, keyB);
  assert.match(keyA, /^oinkie:account:v1:11111111-1111-4111-8111-111111111111:/);
  assert.notEqual(keyA, 'oinkie_prep_bookmarks_v1');
});

function fakeSession(userId: string, accessToken = `token-${userId}`): Session {
  return {
    access_token: accessToken,
    refresh_token: `refresh-${userId}`,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: { id: userId },
  } as Session;
}

test('repeated tab visibility and focus recovery events do not repeat profile checks', () => {
  let currentUserId: string | null = null;
  let profileChecks = 0;
  const run = (
    event: AuthChangeEvent | undefined,
    nextSession: Session | null,
    forceProfileCheck = false,
  ) => {
    const transition = resolveAuthSessionTransition({
      event,
      currentUserId,
      nextSession,
      forceProfileCheck,
    });
    if (transition === 'verify-profile') profileChecks += 1;
    currentUserId = nextSession?.user.id ?? null;
    return transition;
  };

  assert.equal(run('INITIAL_SESSION', fakeSession('user-a')), 'verify-profile');
  for (let index = 0; index < 10; index += 1) {
    assert.equal(
      run(index % 2 === 0 ? 'SIGNED_IN' : 'TOKEN_REFRESHED', fakeSession('user-a', `token-visible-${index}`)),
      'preserve-profile',
    );
  }
  assert.equal(run(undefined, fakeSession('user-a', 'token-restored-after-visibility')), 'preserve-profile');
  assert.equal(profileChecks, 1);
});

test('overlapping startup restore and INITIAL_SESSION verify the profile only once', () => {
  let currentUserId: string | null = null;
  let profileChecks = 0;
  const run = (event: AuthChangeEvent | undefined, nextSession: Session) => {
    const transition = resolveAuthSessionTransition({ event, currentUserId, nextSession });
    if (transition === 'verify-profile') profileChecks += 1;
    currentUserId = nextSession.user.id;
    return transition;
  };
  const session = fakeSession('user-a');

  assert.equal(run(undefined, session), 'verify-profile');
  assert.equal(run('INITIAL_SESSION', session), 'preserve-profile');
  assert.equal(run('SIGNED_IN', session), 'preserve-profile');
  assert.equal(profileChecks, 1);
});

test('account changes, sign-out, password recovery, and explicit retries still transition auth state', () => {
  const userA = fakeSession('user-a');

  assert.equal(resolveAuthSessionTransition({
    event: 'SIGNED_IN',
    currentUserId: 'user-a',
    nextSession: fakeSession('user-b'),
  }), 'verify-profile');
  assert.equal(resolveAuthSessionTransition({
    currentUserId: 'user-a',
    nextSession: userA,
    forceProfileCheck: true,
  }), 'verify-profile');
  assert.equal(resolveAuthSessionTransition({
    event: 'PASSWORD_RECOVERY',
    currentUserId: 'user-a',
    nextSession: userA,
  }), 'password-recovery');
  assert.equal(resolveAuthSessionTransition({
    event: 'SIGNED_OUT',
    currentUserId: 'user-a',
    nextSession: null,
  }), 'signed-out');
});

test('token refresh replaces the stored session without discarding profile or screen state', () => {
  const oldSession = fakeSession('user-a', 'old-token');
  const refreshedSession = fakeSession('user-a', 'new-token');
  const state = {
    status: 'authenticated' as const,
    session: oldSession,
    profile: { id: 'user-a', full_name: 'Student A' },
  };

  const refreshed = replaceSessionInState(state, refreshedSession);
  assert.equal(refreshed.status, 'authenticated');
  assert.equal(refreshed.session.access_token, 'new-token');
  assert.equal(refreshed.profile, state.profile);

  const changedAccount = replaceSessionInState(state, fakeSession('user-b'));
  assert.equal(changedAccount, state);
});

test('study records stay isolated by account and legacy data is not read or changed', () => {
  const values = new Map<string, string>();
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  const legacyKey = 'oinkie_prep_notes_v1';
  const legacyValue = JSON.stringify([{ id: 'legacy', title: 'Legacy', body: 'Preserve me', updatedAt: 1 }]);
  values.set(legacyKey, legacyValue);

  try {
    setActiveAccountOwnerId('11111111-1111-4111-8111-111111111111');
    saveStudyNotes([{ id: 'owner-a', title: 'A note', body: 'Private A', updatedAt: 2 }]);
    assert.equal(readStudyNotes().items[0]?.id, 'owner-a');

    setActiveAccountOwnerId('22222222-2222-4222-8222-222222222222');
    assert.deepEqual(readStudyNotes().items, []);
    saveStudyNotes([{ id: 'owner-b', title: 'B note', body: 'Private B', updatedAt: 3 }]);

    setActiveAccountOwnerId('11111111-1111-4111-8111-111111111111');
    assert.equal(readStudyNotes().items[0]?.id, 'owner-a');
    assert.equal(values.get(legacyKey), legacyValue);
  } finally {
    setActiveAccountOwnerId(null);
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
