import React from 'react';
import {
  Clock,
  Maximize,
  Minimize,
  HelpCircle,
  User,
  Send,
  AlertTriangle,
  LogOut,
} from 'lucide-react';
import { TestConfig } from '../types/exam';
import { ThemeToggle } from './ThemeToggle';
import { useOptionalAuth } from '../auth/AuthProvider';
import { useState } from 'react';

interface HeaderProps {
  config: TestConfig;
  timeRemainingSeconds: number;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenHelp: () => void;
  onRequestSubmit: () => void;
  answeredCount: number;
  totalQuestions: number;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  timeRemainingSeconds,
  isFullscreen,
  onToggleFullscreen,
  onOpenHelp,
  onRequestSubmit,
  answeredCount,
  totalQuestions,
}) => {
  const auth = useOptionalAuth();
  const signOut = auth?.signOut;
  const [signOutError, setSignOutError] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  // Format HH:MM:SS
  const formatTime = (totalSecs: number) => {
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const isLowTime = timeRemainingSeconds <= 600; // < 10 mins
  const isUrgent = timeRemainingSeconds <= 180; // < 3 mins

  return (
    <header className="z-30 border-b border-slate-200 bg-white text-slate-800 shadow-sm">
      {/* Upper brand bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-700 font-bold text-white shadow-sm">
            <span className="text-sm tracking-wider">CBT</span>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-slate-900">
                {config.title || 'Independent Practice Exam'}
              </h1>
              <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                {config.sourceType === 'question-bank' ? 'Question Bank' : config.sourceType === 'pdf' ? 'PDF Practice' : 'Practice Mode'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Independent practice simulator &bull; Not an official NTA service
            </p>
          </div>
        </div>

        {/* Candidate practice profile */}
        <div className="hidden items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 md:flex">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
            <User className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <div className="font-semibold text-slate-800">
              {config.candidateName || 'NEET Candidate'}
            </div>
            <div className="font-mono text-xs text-slate-500">
              Practice ID: {config.rollNumber || 'PRACTICE-0001'}
            </div>
          </div>
        </div>
      </div>

      {/* Lower Operational Bar: Timer & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600">
            Answered: <strong className="text-emerald-700">{answeredCount}</strong> / {totalQuestions}
          </span>
          <div className="h-2 w-24 overflow-hidden rounded-full border border-slate-200 bg-slate-100 md:w-36">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${totalQuestions ? (answeredCount / totalQuestions) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Timer Badge */}
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono tracking-wider transition-colors ${
            isUrgent
              ? 'border-rose-300 bg-rose-50 text-rose-800 animate-pulse'
              : isLowTime
              ? 'border-amber-300 bg-amber-50 text-amber-800'
              : 'border-slate-200 bg-slate-50 text-slate-800'
          }`}
        >
          {isUrgent ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 animate-bounce" />
          ) : (
            <Clock className="w-4 h-4 text-blue-700" />
          )}
          <span className="hidden font-sans text-xs text-slate-500 sm:inline">Time left</span>
          <span className="text-sm font-bold">{formatTime(timeRemainingSeconds)}</span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {signOut && <button
            type="button"
            disabled={isSigningOut}
            onClick={async () => {
              setSignOutError('');
              setIsSigningOut(true);
              try {
                await signOut();
              } catch (error) {
                setSignOutError(error instanceof Error ? error.message : 'Could not sign out. Please retry.');
              } finally {
                setIsSigningOut(false);
              }
            }}
            aria-label="Sign out"
            title="Sign out"
            className="flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <LogOut className="h-3.5 w-3.5 text-blue-700" />
            <span className="hidden sm:inline">{isSigningOut ? 'Signing out…' : 'Sign out'}</span>
          </button>}
          <button
            onClick={onOpenHelp}
            className="flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
            title="Keyboard shortcuts (?)"
          >
            <HelpCircle className="w-3.5 h-3.5 text-blue-700" />
            <span className="hidden sm:inline">Shortcuts</span>
          </button>

          <button
            onClick={onToggleFullscreen}
            className="flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
            title="Toggle Windows 10 Fullscreen (F)"
          >
            {isFullscreen ? (
              <>
                <Minimize className="w-3.5 h-3.5 text-amber-700" />
                <span className="hidden sm:inline">Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize className="w-3.5 h-3.5 text-blue-700" />
                <span className="hidden sm:inline">Fullscreen</span>
              </>
            )}
          </button>

          <button
            onClick={onRequestSubmit}
            className="flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-1.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            title="Submit Exam"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Submit Exam</span>
          </button>
        </div>
      </div>
      {signOutError && <p role="alert" className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{signOutError}</p>}
    </header>
  );
};
