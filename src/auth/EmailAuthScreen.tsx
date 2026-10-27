import { useState, type FormEvent } from 'react';
import { Dna, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { useAuth } from './AuthProvider';

type ScreenMode = 'login' | 'signup' | 'forgot';

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 font-sans text-slate-900">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
            <Dna className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-lg font-black tracking-tight text-slate-900">Bunny Study</span>
            <span className="block text-sm font-black tracking-tight text-slate-700">JUST PREP</span>
          </span>
        </div>
        {children}
      </section>
    </main>
  );
}

export function AuthStatusScreen({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: { label: string; onClick: () => void; busy?: boolean };
}) {
  return (
    <AuthShell>
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      {action && (
        <button
          type="button"
          disabled={action.busy}
          onClick={action.onClick}
          className="mt-6 min-h-11 w-full rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          {action.busy ? 'Please wait…' : action.label}
        </button>
      )}
    </AuthShell>
  );
}

export function EmailAuthScreen({ recovery = false }: { recovery?: boolean }) {
  const { signIn, signUp, sendPasswordReset, updatePassword, signOut } = useAuth();
  const [mode, setMode] = useState<ScreenMode>(recovery ? 'login' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(recovery ? '' : '');
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (mode !== 'forgot' && password.length < 8) {
      setError('Your password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'forgot') {
        await sendPasswordReset(normalizedEmail);
        setNotice('If an account exists for that address, a password recovery link will be sent.');
      } else if (mode === 'signup') {
        const confirmationRequired = await signUp(normalizedEmail, password);
        if (confirmationRequired) {
          setPendingConfirmation(true);
          setNotice('Check your inbox for a confirmation link. Your study space remains locked until you confirm your email and sign in.');
        }
      } else {
        await signIn(normalizedEmail, password);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Authentication failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (recovery) {
    return (
      <AuthShell>
        <h1 className="text-2xl font-extrabold tracking-tight">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Choose a new password for your Bunny study account.</p>
        <form
          className="mt-6 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setError('');
            setNotice('');
            if (password.length < 8) return setError('Your password must be at least 8 characters.');
            if (password !== confirmPassword) return setError('The passwords do not match.');
            setBusy(true);
            try {
              await updatePassword(password);
              setNotice('Password updated. You can continue to your study space.');
              window.history.replaceState({}, document.title, window.location.pathname);
            } catch (resetError) {
              setError(resetError instanceof Error ? resetError.message : 'The recovery link may have expired. Request a new one.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <PasswordField label="New password" value={password} onChange={setPassword} visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          <PasswordField label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          <Feedback error={error} notice={notice} />
          <PrimaryButton busy={busy}>Save new password</PrimaryButton>
        </form>
        <button type="button" onClick={() => void signOut()} className="mt-4 text-sm font-semibold text-blue-700 hover:text-blue-800">Return to sign in</button>
      </AuthShell>
    );
  }

  if (pendingConfirmation) {
    return (
      <AuthShell>
        <h1 className="text-2xl font-extrabold tracking-tight">Confirm your email</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{notice}</p>
        <p className="mt-3 break-all text-sm font-semibold text-slate-800">{email.trim()}</p>
        <button type="button" onClick={() => { setPendingConfirmation(false); setMode('login'); setNotice(''); }} className="mt-6 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Back to sign in</button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-extrabold tracking-tight">
        {mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Welcome back'}
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {mode === 'signup'
          ? 'Create an account to set up your NEET study profile.'
          : mode === 'forgot'
            ? 'We’ll email you a secure link to choose a new password.'
            : 'Sign in to continue to your NEET study space.'}
      </p>
      {mode !== 'forgot' && (
        <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Account access">
          {(['login', 'signup'] as const).map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={mode === tab} onClick={() => { setMode(tab); setError(''); setNotice(''); }} className={`min-h-10 rounded-lg text-sm font-bold capitalize transition ${mode === tab ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {tab === 'login' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block text-sm font-semibold text-slate-700">
          Email address
          <span className="mt-1.5 flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
            <Mail className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="you@example.com" />
          </span>
        </label>
        {mode !== 'forgot' && (
          <PasswordField label="Password" value={password} onChange={setPassword} visible={showPassword} onToggle={() => setShowPassword((v) => !v)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
        )}
        <Feedback error={error} notice={notice} />
        <PrimaryButton busy={busy}>{mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send recovery link' : 'Sign in'}</PrimaryButton>
      </form>
      <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm">
        {mode === 'forgot' ? (
          <button type="button" onClick={() => { setMode('login'); setError(''); setNotice(''); }} className="font-semibold text-blue-700 hover:text-blue-800">Back to sign in</button>
        ) : (
          <>
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'forgot' : 'login'); setError(''); setNotice(''); }} className="font-semibold text-blue-700 hover:text-blue-800">{mode === 'login' ? 'Forgot password?' : 'Already have an account?'}</button>
            {mode === 'signup' && <span className="text-slate-500">Email confirmation may be required.</span>}
          </>
        )}
      </div>
    </AuthShell>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete = 'new-password',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <span className="mt-1.5 flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
        <LockKeyhole className="h-4 w-4 text-slate-400" aria-hidden="true" />
        <input type={visible ? 'text' : 'password'} autoComplete={autoComplete} required value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        <button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={onToggle} className="rounded p-1 text-slate-500 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}

function Feedback({ error, notice }: { error: string; notice: string }) {
  if (error) return <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>;
  if (notice) return <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{notice}</p>;
  return null;
}

function PrimaryButton({ children, busy }: { children: React.ReactNode; busy: boolean }) {
  return (
    <button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
      {busy ? 'Please wait…' : children}
    </button>
  );
}
