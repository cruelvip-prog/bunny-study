import React, { useEffect, useState } from 'react';
import { ArrowLeft, LogOut, Save, UserRound } from 'lucide-react';
import { useOptionalAuth } from '../auth/AuthProvider';
import { validateProfileInput, STUDENT_CLASSES, type ProfileInput } from '../auth/profileValidation';

export function ProfileAccountScreen({ onBack }: { onBack: () => void }) {
  const auth = useOptionalAuth();
  const authenticated = auth?.state.status === 'authenticated' ? auth.state : null;
  const profile = authenticated?.profile ?? null;

  const [form, setForm] = useState<ProfileInput>({
    fullName: profile?.full_name ?? '',
    studentClass: (profile?.student_class ?? '') as ProfileInput['studentClass'],
    targetNeetYear: profile?.target_neet_year ? String(profile.target_neet_year) : '',
    coachingInstitute: profile?.coaching_institute ?? '',
  });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        fullName: profile.full_name,
        studentClass: profile.student_class as ProfileInput['studentClass'],
        targetNeetYear: String(profile.target_neet_year),
        coachingInstitute: profile.coaching_institute ?? '',
      });
    }
  }, [profile]);

  const handleSave = async () => {
    if (!auth || !authenticated) return;
    const result = validateProfileInput(form);
    if (result.error || !result.value) {
      setError(result.error || 'Invalid profile.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await auth.completeProfile({
        fullName: result.value.full_name,
        studentClass: result.value.student_class,
        targetNeetYear: String(result.value.target_neet_year),
        coachingInstitute: result.value.coaching_institute ?? '',
      });
      setSuccess('Profile saved.');
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (profile) {
      setForm({
        fullName: profile.full_name,
        studentClass: profile.student_class as ProfileInput['studentClass'],
        targetNeetYear: String(profile.target_neet_year),
        coachingInstitute: profile.coaching_institute ?? '',
      });
    }
    setEditing(false);
    setError(null);
    setSuccess(null);
  };

  const confirmSignOut = async () => {
    if (!auth) return;
    setSigningOut(true);
    try {
      await auth.signOut();
      setShowSignOutDialog(false);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 font-sans text-slate-900 sm:px-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </button>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
              <UserRound className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Profile & Account</h1>
              <p className="text-sm text-slate-500">Manage your aspirant profile and account access.</p>
            </div>
          </div>

          {!authenticated && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Sign in to view and edit your profile.
            </p>
          )}

          {authenticated && (
            <>
              {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
              {success && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</p>}

              <div className="mt-5 grid gap-4">
                <label className="text-sm font-semibold text-slate-700">
                  Full name
                  <input
                    value={form.fullName}
                    disabled={!editing}
                    onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                  />
                </label>

                <label className="text-sm font-semibold text-slate-700">
                  Class
                  <select
                    value={form.studentClass}
                    disabled={!editing}
                    onChange={(event) => setForm((current) => ({ ...current, studentClass: event.target.value as ProfileInput['studentClass'] }))}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                  >
                    <option value="">Select class</option>
                    {STUDENT_CLASSES.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-semibold text-slate-700">
                  Target NEET year
                  <input
                    value={form.targetNeetYear}
                    disabled={!editing}
                    onChange={(event) => setForm((current) => ({ ...current, targetNeetYear: event.target.value }))}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                  />
                </label>

                <label className="text-sm font-semibold text-slate-700">
                  Coaching institute (optional)
                  <input
                    value={form.coachingInstitute}
                    disabled={!editing}
                    onChange={(event) => setForm((current) => ({ ...current, coachingInstitute: event.target.value }))}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {!editing ? (
                  <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white transition hover:bg-blue-800">
                    <Save className="h-4 w-4" /> Edit
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => void handleSave()} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60">
                      <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button type="button" onClick={handleCancel} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          <div className="mt-6 border-t border-slate-200 pt-5">
            <button
              type="button"
              onClick={() => setShowSignOutDialog(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-700 transition hover:bg-rose-100"
            >
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          </div>
        </section>

        {showSignOutDialog && (
          <div role="dialog" aria-modal="true" aria-labelledby="signout-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
              <h2 id="signout-title" className="text-lg font-extrabold text-slate-900">Are you sure you want to sign out?</h2>
              <p className="mt-2 text-sm text-slate-600">You may need to sign in again to access your account.</p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setShowSignOutDialog(false)} disabled={signingOut} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                  Cancel
                </button>
                <button type="button" onClick={() => void confirmSignOut()} disabled={signingOut} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-60">
                  {signingOut ? 'Signing out...' : 'Yes, Sign Out'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}