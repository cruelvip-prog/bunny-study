import { useState, type FormEvent } from 'react';
import { Dna } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { STUDENT_CLASSES, type StudentClass } from './profileValidation';

export function ProfileSetup() {
  const { completeProfile, signOut } = useAuth();
  const [fullName, setFullName] = useState('');
  const [studentClass, setStudentClass] = useState<StudentClass | ''>('');
  const [targetNeetYear, setTargetNeetYear] = useState(String(new Date().getUTCFullYear()));
  const [coachingInstitute, setCoachingInstitute] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await completeProfile({ fullName, studentClass, targetNeetYear, coachingInstitute });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save your profile. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 font-sans text-slate-900">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-7 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white"><Dna className="h-6 w-6" /></span>
          <span><span className="block text-lg font-black">OINKIE PREP</span><span className="block text-xs text-slate-500">Practice. Analyse. Improve.</span></span>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">Set up your study profile</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">A few details help personalize your NEET preparation space.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-slate-700">
            Full name
            <input required maxLength={120} autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Current class
            <select required value={studentClass} onChange={(event) => setStudentClass(event.target.value as StudentClass | '')} className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
              <option value="" disabled>Select your class</option>
              {STUDENT_CLASSES.map((item) => <option key={item} value={item}>{item === 'dropper' ? 'Dropper' : item}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Target NEET year
            <input required type="number" inputMode="numeric" min={new Date().getUTCFullYear()} max="2147483647" step="1" value={targetNeetYear} onChange={(event) => setTargetNeetYear(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Coaching institute <span className="font-normal text-slate-400">(optional)</span>
            <input maxLength={160} value={coachingInstitute} onChange={(event) => setCoachingInstitute(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          </label>
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>}
          <button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
            {busy ? 'Saving profile…' : 'Continue to OINKIE Prep'}
          </button>
        </form>
        <button type="button" onClick={() => void signOut()} className="mt-4 text-sm font-semibold text-blue-700 hover:text-blue-800">Sign out</button>
      </section>
    </main>
  );
}
