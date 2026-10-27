import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Atom,
  BarChart3,
  BookOpen,
  Bookmark,
  CalendarDays,
  ChevronRight,
  Clock3,
  Dna,
  FileText,
  FlaskConical,
  History,
  LayoutDashboard,
  Library,
  Menu,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Upload,
  UserRound,
  LogOut,
  X,
} from 'lucide-react';
import { ExamSessionState } from '../types/exam';
import { NotificationBell } from './NotificationBell';
import { ThemeToggle } from './ThemeToggle';
import { useOptionalAuth } from '../auth/AuthProvider';
import {
  loadPublishedDashboardContent,
  type DashboardContent,
  type DashboardContentAction,
} from '../admin/dashboardContent';
import {
  getDashboardOverview,
  getPracticeStreak,
  normalizeDashboardSubject,
} from '../utils/dashboardHistory';
import {
  filterVisibleNotifications,
  mergeDismissedNotificationKeys,
  readDismissedNotificationKeys,
  saveDismissedNotificationKeys,
} from '../utils/notificationFeed';

export type DashboardAction =
  | 'pyq-tests'
  | 'simulator'
  | 'import-paper'
  | 'mock-test'
  | 'custom-test'
  | 'question-bank'
  | 'performance'
  | 'revision'
  | 'quick-revision'
  | 'weak-topics'
  | 'syllabus'
  | 'streaks'
  | 'bookmarks'
  | 'notes'
  | 'flashcards'
  | 'study-plan'
  | 'history'
  | 'saved-papers'
  | 'settings'
  | 'profile'
  | 'search';

interface DashboardProps {
  onNavigate: (action: DashboardAction, query?: string) => void;
  hasSavedSession: boolean;
  recoveryError: string | null;
  resumeError: string | null;
  isResuming: boolean;
  onResume: () => void;
  onDiscardSavedSession: () => void;
  completedSessions: ExamSessionState[];
  historyError: string | null;
  onOpenReport: (session: ExamSessionState) => void;
  isAdmin: boolean;
  onOpenAdmin: () => void;
}

interface DashboardActionCard {
  key: string;
  title: string;
  description: string;
  action: DashboardContentAction;
  icon: React.ElementType;
  style: string;
  iconStyle: string;
}

interface DashboardQuickAccessItem {
  key: string;
  title: string;
  note: string;
  icon: React.ElementType;
  action?: DashboardContentAction;
  url?: string;
  color: string;
}

const navigation = [
  { label: 'Dashboard', icon: LayoutDashboard, target: 'dashboard-top' },
  { label: 'NEET PYQ Tests', icon: Play, action: 'pyq-tests' as const },
  { label: 'PDF Import', icon: Upload, action: 'import-paper' as const },
  { label: 'Mock Test', icon: Timer, action: 'mock-test' as const },
  { label: 'Custom Test', icon: Timer, action: 'custom-test' as const },
  { label: 'Question Bank', icon: Library, action: 'question-bank' as const },
  { label: 'Test History', icon: History, action: 'history' as const },
  { label: 'Results & Reports', icon: FileText, action: 'history' as const },
  { label: 'Performance', icon: BarChart3, action: 'performance' as const },
  { label: 'Syllabus Tracker', icon: BookOpen, action: 'syllabus' as const },
  { label: 'Revision Center', icon: Bookmark, action: 'revision' as const },
  { label: 'Quick Revision', icon: Sparkles, action: 'quick-revision' as const },
  { label: 'Weak Topics', icon: Target, action: 'weak-topics' as const },
  { label: 'Study Plan', icon: CalendarDays, action: 'study-plan' as const },
  { label: 'Streaks', icon: TrendingUp, action: 'streaks' as const },
  { label: 'Bookmarks', icon: Bookmark, action: 'bookmarks' as const },
  { label: 'Notes', icon: NotebookPen, action: 'notes' as const },
  { label: 'Flashcards', icon: Library, action: 'flashcards' as const },
  { label: 'Activity', icon: Activity, target: 'activity' },
  { label: 'Study Resources', icon: Play, target: 'study-resources' },
  { label: 'Settings', icon: Settings, action: 'settings' as const },
];

const subjectStyles = [
  { name: 'Physics', icon: Atom, color: 'text-sky-600', iconBg: 'bg-sky-100', bar: 'bg-sky-500', ring: 'ring-sky-100' },
  { name: 'Chemistry', icon: FlaskConical, color: 'text-emerald-600', iconBg: 'bg-emerald-100', bar: 'bg-emerald-500', ring: 'ring-emerald-100' },
  { name: 'Biology', icon: Dna, color: 'text-violet-600', iconBg: 'bg-violet-100', bar: 'bg-violet-500', ring: 'ring-violet-100' },
];

const actionCards: DashboardActionCard[] = [
  {
    key: 'default-pyq-tests',
    title: 'NEET PYQ Tests',
    description: 'Browse available NEET previous-year papers and start a CBT practice test.',
    action: 'pyq-tests',
    icon: Play,
    style: 'border-blue-200 bg-white text-slate-900 hover:border-blue-300',
    iconStyle: 'bg-blue-50 text-blue-700',
  },
  {
    key: 'default-import-paper',
    title: 'Import Paper',
    description: 'Practice with a question paper PDF you have.',
    action: 'import-paper',
    icon: Upload,
    style: 'border-slate-200 bg-white text-slate-900 hover:border-blue-300',
    iconStyle: 'bg-blue-50 text-blue-700',
  },
  {
    key: 'default-custom-test',
    title: 'Custom Test',
    description: 'Build a timed, topic-filtered test from an imported question bank.',
    action: 'custom-test',
    icon: Timer,
    style: 'border-slate-200 bg-white text-slate-900 hover:border-blue-300',
    iconStyle: 'bg-blue-50 text-blue-700',
  },
  {
    key: 'default-question-bank',
    title: 'Question Bank',
    description: 'Import, search, preview and reuse local question banks.',
    action: 'question-bank',
    icon: Library,
    style: 'border-slate-200 bg-white text-slate-900 hover:border-blue-300',
    iconStyle: 'bg-blue-50 text-blue-700',
  },
];

const quickAccess: DashboardQuickAccessItem[] = [
  { key: 'default-history', title: 'Test History', note: 'Review completed attempts', icon: History, action: 'history', color: 'text-blue-700 bg-blue-50' },
  { key: 'default-performance', title: 'Performance Analytics', note: 'See verified answer-key results', icon: BarChart3, action: 'performance', color: 'text-blue-700 bg-blue-50' },
  { key: 'default-revision', title: 'Revision Center', note: 'Review marked and incorrect questions', icon: Bookmark, action: 'revision', color: 'text-blue-700 bg-blue-50' },
  { key: 'default-bookmarks', title: 'Bookmarks', note: 'Revisit questions saved from your banks', icon: Bookmark, action: 'bookmarks', color: 'text-blue-700 bg-blue-50' },
  { key: 'default-study-plan', title: 'Study Plan', note: 'Manage your locally saved tasks', icon: CalendarDays, action: 'study-plan', color: 'text-blue-700 bg-blue-50' },
  { key: 'default-saved-papers', title: 'Saved Papers', note: 'View reports linked to imported PDF papers', icon: FileText, action: 'saved-papers', color: 'text-blue-700 bg-blue-50' },
];

const contentActionIcons: Partial<Record<DashboardContentAction, React.ElementType>> = {
  'pyq-tests': Play,
  simulator: Play,
  'import-paper': Upload,
  'mock-test': Timer,
  'custom-test': Timer,
  'question-bank': Library,
  performance: BarChart3,
  revision: Bookmark,
  'quick-revision': Sparkles,
  'weak-topics': Target,
  syllabus: BookOpen,
  streaks: TrendingUp,
  bookmarks: Bookmark,
  notes: NotebookPen,
  flashcards: Library,
  'study-plan': CalendarDays,
  history: History,
  'saved-papers': FileText,
  settings: Settings,
  search: Search,
};

const contentActionCardStyles: Partial<Record<DashboardContentAction, { style: string; iconStyle: string }>> = {
  'pyq-tests': { style: 'border-blue-200 bg-white text-slate-900 hover:border-blue-300', iconStyle: 'bg-blue-50 text-blue-700' },
  'import-paper': { style: 'border-slate-200 bg-white text-slate-900 hover:border-blue-300', iconStyle: 'bg-blue-50 text-blue-700' },
  'custom-test': { style: 'border-slate-200 bg-white text-slate-900 hover:border-blue-300', iconStyle: 'bg-blue-50 text-blue-700' },
  'question-bank': { style: 'border-slate-200 bg-white text-slate-900 hover:border-blue-300', iconStyle: 'bg-blue-50 text-blue-700' },
};

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(timestamp);
}

function getSourceLabel(session: ExamSessionState): string {
  if (session.config.sourceType === 'question-bank') return 'Question bank';
  if (session.config.sourceType === 'pdf' || session.config.hasCustomPdf) {
    return session.config.pdfFileName || 'Imported paper';
  }
  return 'Demo practice';
}

export const Dashboard: React.FC<DashboardProps> = ({
  onNavigate,
  hasSavedSession,
  recoveryError,
  resumeError,
  isResuming,
  onResume,
  onDiscardSavedSession,
  completedSessions,
  historyError,
  onOpenReport,
  isAdmin,
  onOpenAdmin,
}) => {
  const auth = useOptionalAuth();
  const signOut = auth?.signOut;
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [focusedSubject, setFocusedSubject] = useState('Physics');
  const [searchText, setSearchText] = useState('');
  const [signOutError, setSignOutError] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [managedContent, setManagedContent] = useState<DashboardContent | null>(null);
  const [contentStatus, setContentStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dismissedNotificationKeys, setDismissedNotificationKeys] = useState<string[]>(
    readDismissedNotificationKeys,
  );

  const visibleNotifications = useMemo(
    () => filterVisibleNotifications(
      managedContent?.notifications ?? [],
      dismissedNotificationKeys,
    ),
    [managedContent, dismissedNotificationKeys],
  );

  const handleClearAllNotifications = () => {
    const nextKeys = mergeDismissedNotificationKeys(
      dismissedNotificationKeys,
      visibleNotifications,
    );
    setDismissedNotificationKeys(nextKeys);
    saveDismissedNotificationKeys(nextKeys);
  };

  useEffect(() => {
    let active = true;
    void loadPublishedDashboardContent()
      .then((content) => {
        if (!active) return;
        setManagedContent(content);
        setContentStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setContentStatus('error');
      });
    return () => {
      active = false;
    };
  }, []);

  const overview = useMemo(() => getDashboardOverview(completedSessions), [completedSessions]);
  const practiceStreak = useMemo(() => getPracticeStreak(completedSessions), [completedSessions]);
  const latestScoredSession = overview.recentSessions
    .filter((item) => item.score !== null)
    .sort((left, right) => right.completedAt - left.completedAt)[0];
  const filteredSessions = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    if (!query) return overview.recentSessions;
    return overview.recentSessions.filter(({ session }) => {
      const haystack = [
        session.config.title,
        session.config.candidateName,
        session.config.rollNumber,
        session.config.pdfFileName || '',
        ...(session.examQuestions || []).flatMap((question) => [
          question.subject,
          question.topic,
          question.questionEn,
          ...Object.values(question.options).map((option) => option.textEn),
        ]),
      ].join(' ').toLocaleLowerCase();
      return haystack.includes(query);
    });
  }, [overview.recentSessions, searchText]);
  const verifiedSessions = overview.recentSessions
    .filter((item) => item.accuracy !== null)
    .slice()
    .reverse();
  const trendPoints = verifiedSessions.map((item, index) => {
    const x = verifiedSessions.length === 1
      ? 200
      : 24 + (index / (verifiedSessions.length - 1)) * 352;
    const y = 118 - ((item.accuracy || 0) / 100) * 92;
    return { x, y, accuracy: item.accuracy || 0 };
  });
  const trendPath = trendPoints.map((point, index) =>
    `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  ).join(' ');
  const subjectStats = new Map(overview.subjects.map((subject) => [subject.name.toLocaleLowerCase(), subject]));
  const normalizedFocusedSubject = normalizeDashboardSubject(focusedSubject);
  const activeSubjectStats = subjectStats.get(normalizedFocusedSubject.toLocaleLowerCase());
  const focusedSessions = overview.recentSessions.filter(({ session }) =>
    session.examQuestions?.some((question) =>
      normalizeDashboardSubject(question.subject).toLocaleLowerCase() === normalizedFocusedSubject.toLocaleLowerCase()
    )
  ).slice(0, 3);
  const performanceSubjects = [
    ...subjectStyles.map((subject) => ({
      name: subject.name,
      questionsAttempted: subjectStats.get(subject.name.toLocaleLowerCase())?.questionsAttempted || 0,
      accuracy: subjectStats.get(subject.name.toLocaleLowerCase())?.accuracy ?? null,
    })),
    ...overview.subjects.filter((subject) =>
      !subjectStyles.some((style) => style.name.toLocaleLowerCase() === subject.name.toLocaleLowerCase())
    ),
  ];

  const displayActionCards = useMemo<DashboardActionCard[]>(() => {
    const visibleActionCards = isAdmin
      ? actionCards
      : actionCards.filter((card) => card.action !== 'question-bank');
    if (contentStatus !== 'ready' || !managedContent) return visibleActionCards;
    return managedContent.quickActions
      .filter((row) => isAdmin || row.action_key !== 'question-bank')
      .map((row) => {
      const visual = contentActionCardStyles[row.action_key];
      return {
        key: row.id,
        title: row.title,
        description: row.description,
        action: row.action_key,
        icon: contentActionIcons[row.action_key] || Play,
        style: visual?.style || 'border-slate-200 bg-white text-slate-900 hover:border-blue-300',
        iconStyle: visual?.iconStyle || 'bg-blue-50 text-blue-700',
      };
    });
  }, [contentStatus, managedContent, isAdmin]);

  const displayQuickAccess = useMemo<DashboardQuickAccessItem[]>(() => {
    if (contentStatus !== 'ready' || !managedContent) return quickAccess;
    return managedContent.quickLinks.map((row) => {
      const action = row.target_type === 'action' ? row.action_key || undefined : undefined;
      return {
        key: row.id,
        title: row.title,
        note: row.note,
        icon: row.target_type === 'url' ? ArrowUpRight : contentActionIcons[action || 'history'] || Play,
        action,
        url: row.target_type === 'url' ? row.url || undefined : undefined,
        color: 'text-blue-700 bg-blue-50',
      };
    });
  }, [contentStatus, managedContent]);

  const handleNavigation = (item: typeof navigation[number]) => {
    setIsMobileNavOpen(false);
    if (item.action) {
      onNavigate(item.action);
    } else if (item.target) {
      scrollToSection(item.target);
    }
  };

  return (
    <main id="dashboard-top" className="flex min-h-screen w-full min-w-0 bg-slate-100 font-sans text-slate-900">
      {isMobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setIsMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/40 desktop:hidden"
        />
      )}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col overflow-y-auto overscroll-contain border-r border-slate-200 bg-white px-3 py-5 transition-[transform,width] duration-200 ease-in-out desktop:sticky desktop:top-0 desktop:h-screen desktop:flex-none desktop:overflow-y-visible desktop:translate-x-0 ${isSidebarCollapsed ? 'desktop:w-20 desktop:px-3' : 'desktop:w-[260px] desktop:px-5'} ${isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <a href="#dashboard-top" className={`flex items-center gap-3 px-2 ${isSidebarCollapsed ? 'desktop:justify-center desktop:px-0' : ''}`} onClick={() => setIsMobileNavOpen(false)}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200">
            <Dna className="h-6 w-6" />
          </span>
          <span className={`whitespace-nowrap ${isSidebarCollapsed ? 'desktop:hidden' : ''}`}>
            <span className="block text-lg font-black tracking-tight text-slate-900">Bunny Study</span>
            <span className="block text-mg font-black tracking-tight text-slate-700">Practice. Analyse. Improve.</span>
          </span>
        </a>

        <div className={`mt-4 hidden desktop:flex ${isSidebarCollapsed ? 'justify-center' : 'justify-end'}`}>
          <button
            type="button"
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!isSidebarCollapsed}
            aria-controls="dashboard-navigation"
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-blue-700"
          >
            {isSidebarCollapsed
              ? <PanelLeftOpen className="h-[18px] w-[18px]" />
              : <PanelLeftClose className="h-[18px] w-[18px]" />}
          </button>
        </div>

        <div className={`mb-2 mt-5 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 ${isSidebarCollapsed ? 'desktop:hidden' : ''}`}>Workspace</div>
        <nav id="dashboard-navigation" aria-label="Main navigation" className="flex-none space-y-1 desktop:min-h-0 desktop:flex-1 desktop:overflow-y-auto desktop:overscroll-contain">
          {navigation.map((item, index) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleNavigation(item)}
              title={isSidebarCollapsed ? item.label : undefined}
              className={`flex min-h-10 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors ${isSidebarCollapsed ? 'desktop:justify-center desktop:px-0' : ''} ${index === 0 ? 'border-blue-100 bg-blue-50 text-blue-700 shadow-sm' : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
            >
              <item.icon className="h-[18px] w-[18px]" />
              <span className={`whitespace-nowrap ${isSidebarCollapsed ? 'desktop:hidden' : ''}`}>{item.label}</span>
              {item.label === 'Test History' && overview.testCount > 0 && (
                <span className={`ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 ${isSidebarCollapsed ? 'desktop:hidden' : ''}`}>{overview.testCount}</span>
              )}
            </button>
          ))}
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setIsMobileNavOpen(false);
                onOpenAdmin();
              }}
              title={isSidebarCollapsed ? 'Admin Controls' : undefined}
              className={`mt-3 flex min-h-10 w-full items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-left text-sm font-bold text-blue-800 transition-colors hover:border-blue-300 hover:bg-blue-100 ${isSidebarCollapsed ? 'desktop:justify-center desktop:px-0' : ''}`}
            >
              <ShieldCheck className="h-[18px] w-[18px]" />
              <span className={`whitespace-nowrap ${isSidebarCollapsed ? 'desktop:hidden' : ''}`}>Admin Controls</span>
            </button>
          )}
        </nav>

        <div className={`mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 ${isSidebarCollapsed ? 'desktop:hidden' : ''}`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <p className="mt-3 text-sm font-bold text-slate-800">Small steps, strong scores.</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Use your completed reports to decide what to practise next.</p>
          <button type="button" onClick={() => scrollToSection('pick-focus')} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700">
            Pick a focus <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className={`mt-5 px-2 text-[10px] leading-4 text-slate-400 ${isSidebarCollapsed ? 'desktop:hidden' : ''}`}>Independent practice tools · Not an official NTA service</p>
      </aside>

      <div className="min-h-screen min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[68px] min-w-0 shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-100/95 px-3 backdrop-blur sm:h-[76px] sm:px-7 xl:px-10">
          <div className="flex min-w-0 items-center gap-3">
            {signOut && <button
              type="button"
              aria-label={isMobileNavOpen ? 'Close navigation' : 'Open navigation'}
              onClick={() => setIsMobileNavOpen((open) => !open)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 desktop:hidden"
            >
              {isMobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>}
            <div className="hidden sm:block">
              <p className="text-xs font-semibold text-slate-400">Your learning space</p>
              <h1 className="text-lg font-extrabold tracking-tight">Dashboard</h1>
            </div>
          </div>
          <label className="flex h-10 min-w-0 w-full max-w-[380px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && searchText.trim()) {
                  onNavigate('search', searchText.trim());
                }
              }}
              placeholder="Search tests, questions or subjects..."
              aria-label="Search tests, questions, and subjects"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </label>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <NotificationBell
              notifications={visibleNotifications}
              status={contentStatus}
              onClearAll={handleClearAllNotifications}
              emptyMessage={managedContent?.notifications.length
                ? 'You have cleared the current updates. New notices will appear here.'
                : 'No notifications are configured yet.'}
            />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-bold text-slate-800">{auth?.state.status === 'authenticated' ? auth.state.profile.full_name : 'Practice mode'}</p>
            </div>
            <button type="button" onClick={() => onNavigate('profile')} className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-blue-100 text-blue-700 shadow-sm transition hover:bg-blue-200" aria-label="Open profile and account">
              <UserRound className="h-[18px] w-[18px]" />
            </button>
            <ThemeToggle />
          </div>
        </header>

        <div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-5 px-3 py-4 sm:space-y-7 sm:px-7 sm:py-8 xl:px-10">
          {signOutError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{signOutError}</p>}
          {(recoveryError || resumeError || historyError) && (
            <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <p>{resumeError || recoveryError || historyError}</p>
              {recoveryError && !hasSavedSession && (
                <button type="button" onClick={onDiscardSavedSession} className="mt-2 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white">
                  Clear unusable saved session
                </button>
              )}
            </section>
          )}

          {hasSavedSession && (
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div>
                <h2 className="text-sm font-bold text-amber-900">Unfinished test saved</h2>
                <p className="mt-1 text-xs text-amber-800">Resume your saved answers and remaining time, or discard that session before starting another.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onResume} disabled={isResuming} className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-60">
                  {isResuming ? 'Restoring...' : 'Resume test'}
                </button>
                <button type="button" onClick={onDiscardSavedSession} className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-900">
                  Discard
                </button>
              </div>
            </section>
          )}

          <section className="dashboard-hero relative isolate min-h-[240px] overflow-hidden rounded-[28px] border border-slate-200 bg-white px-4 py-6 text-slate-900 shadow-sm sm:min-h-[260px] sm:px-10 sm:py-10 lg:min-h-[280px] lg:px-12">
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-blue-50/80 via-white to-slate-50" />
            <div className="relative z-10 max-w-[620px] lg:max-w-[52%]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold tracking-wide text-blue-800">
                <Sparkles className="h-3.5 w-3.5" /> YOUR NEXT BREAKTHROUGH STARTS HERE
              </div>
              <h2 className="max-w-[580px] text-3xl font-black leading-[1.12] tracking-tight sm:text-[42px]">Prepare Smarter.<br className="hidden sm:block" /> Perform Better.</h2>
              <p className="mt-4 max-w-[500px] text-sm leading-6 text-slate-600 sm:text-base lg:max-w-[450px]">
                Take tests, track progress, fix mistakes and get closer to your dream rank.
              </p>
              <button type="button" onClick={() => onNavigate('simulator')} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
                Start practising <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 hidden h-full w-[38%] items-end justify-center lg:flex">
              <div className="relative mb-7 h-[150px] w-[330px]">
                <div className="absolute bottom-0 left-0 right-0 h-3 rounded-full bg-slate-300" />
                <div className="absolute bottom-3 left-1 right-1 h-2 rounded bg-slate-200" />
                <div className="absolute bottom-5 left-7 flex h-[116px] w-[238px] items-end gap-2">
                  <div className="flex h-[105px] w-[70px] flex-col justify-between rounded-t-md border border-blue-200 bg-gradient-to-br from-blue-400 to-blue-700 p-2 shadow-md">
                    <span className="text-[9px] font-black tracking-widest text-white">PHYSICS</span>
                    <span className="text-center text-xl font-black text-white">01</span>
                    <span className="h-1 rounded bg-white/70" />
                  </div>
                  <div className="flex h-[116px] w-[72px] flex-col justify-between rounded-t-md border border-blue-200 bg-gradient-to-br from-blue-500 to-blue-800 p-2 shadow-md">
                    <span className="text-[8px] font-black tracking-widest text-white">CHEMISTRY</span>
                    <FlaskConical className="mx-auto h-7 w-7 text-white" />
                    <span className="h-1 rounded bg-white/70" />
                  </div>
                  <div className="flex h-[98px] w-[70px] flex-col justify-between rounded-t-md border border-blue-200 bg-gradient-to-br from-blue-400 to-blue-700 p-2 shadow-md">
                    <span className="text-[9px] font-black tracking-widest text-white">BIOLOGY</span>
                    <Dna className="mx-auto h-7 w-7 text-white" />
                    <span className="h-1 rounded bg-white/70" />
                  </div>
                </div>
                <div className="absolute bottom-5 right-1 h-[78px] w-[66px] rounded-t-[36px] border border-slate-200 bg-slate-100">
                  <span className="absolute -left-2 top-8 h-2 w-[82px] rounded-full bg-slate-400" />
                  <span className="absolute left-7 top-[76px] h-8 w-1.5 bg-slate-400" />
                </div>
                <div className="absolute bottom-5 left-0 h-14 w-10 rounded-t-full bg-blue-200">
                  <span className="absolute -left-2 top-1 h-7 w-5 -rotate-45 rounded-full bg-blue-300" />
                  <span className="absolute left-5 -top-1 h-8 w-5 rotate-45 rounded-full bg-blue-300" />
                </div>
              </div>
            </div>
            <div aria-hidden="true" className="absolute -right-12 -top-28 h-64 w-64 rounded-full border border-blue-100 lg:right-[20%]" />
          </section>

          <section aria-label="Quick actions" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {displayActionCards.length ? displayActionCards.map((card) => (
              <button key={card.key} type="button" onClick={() => onNavigate(card.action)} className={`group flex min-h-[132px] items-start gap-3 rounded-2xl border p-4 text-left shadow-sm transition-[transform,box-shadow,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 max-[399px]:flex-col sm:min-h-[148px] sm:gap-4 sm:p-5 ${card.style}`}>
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${card.iconStyle}`}>
                  <card.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 max-[399px]:w-full">
                  <span className="flex items-start justify-between gap-2 text-sm font-extrabold">
                    <span>{card.title}</span><ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                  <span className="mt-2 block text-sm leading-5 text-slate-600">{card.description}</span>
                </span>
              </button>
            )) : (
              <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-xs text-slate-500">
                No quick actions are currently published.
              </div>
            )}
          </section>

          <section aria-label="Study statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {[
              { label: 'Tests Attempted', value: String(overview.testCount), detail: overview.testCount ? 'Completed sessions saved here' : 'Complete a test to start your history', icon: FileText, style: 'bg-blue-50 text-blue-700' },
              { label: 'Average Accuracy', value: overview.averageAccuracy === null ? '—' : `${overview.averageAccuracy}%`, detail: overview.accuracySampleSize ? `From ${overview.accuracySampleSize} keyed answers` : 'Available when a trusted key is used', icon: Target, style: 'bg-blue-50 text-blue-700' },
              { label: 'Latest Score', value: latestScoredSession ? `${latestScoredSession.score} / ${latestScoredSession.maxPossibleScore}` : '—', detail: latestScoredSession ? latestScoredSession.session.config.title : 'Available after a scored test', icon: BarChart3, style: 'bg-blue-50 text-blue-700' },
              { label: 'Questions Solved', value: String(overview.questionsSolved), detail: 'Attempted across saved completed tests', icon: BookOpen, style: 'bg-blue-50 text-blue-700' },
              { label: 'Total Time', value: formatDuration(overview.totalTimeSeconds), detail: overview.testCount ? 'Time spent in completed tests' : 'No completed test time yet', icon: Clock3, style: 'bg-blue-50 text-blue-700' },
              { label: 'Practice Streak', value: `${practiceStreak} ${practiceStreak === 1 ? 'day' : 'days'}`, detail: practiceStreak ? 'Consecutive days with a completed saved test' : 'Complete a saved test to start a streak', icon: TrendingUp, style: 'bg-blue-50 text-blue-700' },
            ].map((stat) => (
              <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold text-slate-500">{stat.label}</span>
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.style}`}><stat.icon className="h-5 w-5" /></span>
                </div>
                <p className="mt-4 text-3xl font-black tracking-tight text-slate-900">{stat.value}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{stat.detail}</p>
              </article>
            ))}
          </section>

          <section id="performance" className="grid scroll-mt-24 gap-5 xl:grid-cols-[1.08fr_0.92fr]">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-extrabold">Subject-wise Performance</h2>
                  <p className="mt-1 text-xs text-slate-400">Calculated only from completed bank questions with a usable answer key.</p>
                </div>
                <span className="rounded-lg bg-slate-50 p-2 text-blue-600"><BarChart3 className="h-4 w-4" /></span>
              </div>
              <div className="mt-6 space-y-5">
                {performanceSubjects.map((subject) => {
                  const style = subjectStyles.find((item) => item.name.toLocaleLowerCase() === subject.name.toLocaleLowerCase());
                  const Icon = style?.icon || BookOpen;
                  return (
                    <button key={subject.name} type="button" onClick={() => { setFocusedSubject(subject.name); scrollToSection('pick-focus'); }} className="w-full text-left">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${style?.iconBg || 'bg-slate-100'} ${style?.color || 'text-slate-600'}`}><Icon className="h-4 w-4" /></span>
                        <span className="flex-1">
                            <span className="flex justify-between text-xs font-bold">
                              <span>{subject.name}</span>
                              <span className="text-slate-500">
                                {subject.accuracy === null
                                  ? 'No verified results'
                                  : <>{subject.accuracy}% <span className="font-normal">· {subject.questionsAttempted} keyed</span></>}
                              </span>
                            </span>
                            <span className="mt-2 block h-2 overflow-hidden rounded-full bg-slate-100">
                              <span className={`block h-full rounded-full ${style?.bar || 'bg-blue-500'}`} style={{ width: `${subject.accuracy ?? 0}%` }} />
                            </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {!overview.subjects.length && (
                <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                  Subject scores appear after a completed question-bank test with a trusted answer key.
                </p>
              )}
            </article>

            <article id="activity" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-extrabold">Recent Activity</h2>
                  <p className="mt-1 text-xs text-slate-400">Your latest completed practice sessions.</p>
                </div>
                <Activity className="h-5 w-5 text-violet-500" />
              </div>
              {overview.recentSessions.length ? (
                <div className="mt-5 divide-y divide-slate-100">
                  {overview.recentSessions.slice(0, 4).map((item) => (
                    <button key={`${item.session.config.id}-${item.completedAt}`} type="button" onClick={() => onOpenReport(item.session)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-slate-50">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><FileText className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-slate-800">Completed {item.session.config.title}</span>
                        <span className="mt-1 block truncate text-[11px] text-slate-400">
                          {formatDate(item.completedAt)} · {item.questionsAttempted} attempted · {item.score === null ? 'Not scored' : `${item.score} marks`}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState text="Activity will appear after you complete and submit a practice test." />
              )}
            </article>
          </section>

          <section id="your-progress" className="grid scroll-mt-24 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-extrabold">Your Progress</h2>
                  <p className="mt-1 text-xs text-slate-400">Verified keyed attempts from completed sessions.</p>
                </div>
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              </div>
              <div className="mt-5 space-y-4">
                {subjectStyles.map((subject) => {
                  const stats = subjectStats.get(subject.name.toLocaleLowerCase());
                  const count = stats?.questionsAttempted || 0;
                  return (
                    <button key={subject.name} type="button" onClick={() => { setFocusedSubject(subject.name); scrollToSection('pick-focus'); }} className="flex w-full items-center gap-3 text-left">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${subject.iconBg} ${subject.color}`}><subject.icon className="h-4 w-4" /></span>
                      <span className="flex-1">
                        <span className="flex justify-between text-xs font-bold"><span>{subject.name}</span><span className="text-slate-400">{count ? `${count} attempted` : 'No recorded questions'}</span></span>
                        <span className="mt-2 block h-1.5 rounded-full bg-slate-100">
                          <span className={`block h-1.5 rounded-full ${subject.bar}`} style={{ width: `${overview.accuracySampleSize ? Math.min(100, (count / overview.accuracySampleSize) * 100) : 0}%` }} />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {!overview.subjects.length && overview.testCount > 0 && (
                <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">Paper-only sessions do not contain structured subject labels, so subject progress is unavailable for them.</p>
              )}
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-extrabold">Performance Trend</h2>
                  <p className="mt-1 text-xs text-slate-400">Accuracy across completed sessions with a usable key.</p>
                </div>
                {verifiedSessions.length > 0 && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">{verifiedSessions.length} scored session{verifiedSessions.length === 1 ? '' : 's'}</span>}
              </div>
              {trendPoints.length ? (
                <div className="mt-4">
                  <div className="flex h-[180px] items-stretch gap-3">
                    <div className="flex flex-col justify-between py-1 text-[10px] text-slate-400"><span>100%</span><span>50%</span><span>0%</span></div>
                    <svg className="h-full min-w-0 flex-1 overflow-visible" viewBox="0 0 400 140" preserveAspectRatio="none" role="img" aria-label="Accuracy trend from saved scored sessions">
                      {[26, 72, 118].map((y) => <line key={y} x1="20" x2="380" y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="3 5" />)}
                      {trendPoints.length > 1 && <path d={trendPath} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
                      {trendPoints.map((point, index) => <circle key={`${point.x}-${index}`} cx={point.x} cy={point.y} r="5" fill="#ffffff" stroke="#3b82f6" strokeWidth="3" vectorEffect="non-scaling-stroke"><title>{point.accuracy}% accuracy</title></circle>)}
                    </svg>
                  </div>
                  <div className="mt-2 flex justify-between pl-8 text-[10px] text-slate-400">
                    <span>{formatDate(verifiedSessions[0].completedAt)}</span>
                    <span>{formatDate(verifiedSessions.at(-1)?.completedAt || verifiedSessions[0].completedAt)}</span>
                  </div>
                </div>
              ) : (
                <EmptyState text="Your trend will appear after a completed test has a usable answer key. No sample chart data is shown." />
              )}
            </article>
          </section>

          <section id="pick-focus" className="grid scroll-mt-24 gap-5 xl:grid-cols-[1fr_0.82fr]">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-extrabold">Pick Your Focus</h2>
                  <p className="mt-1 text-xs text-slate-400">Choose a subject to review your available practice data.</p>
                </div>
                <Target className="h-5 w-5 text-rose-500" />
              </div>
              <div className="mt-4 space-y-2">
                {subjectStyles.map((subject) => {
                  const stats = subjectStats.get(subject.name.toLocaleLowerCase());
                  const selected = focusedSubject.toLocaleLowerCase() === subject.name.toLocaleLowerCase();
                  return (
                    <button key={subject.name} type="button" onClick={() => setFocusedSubject(subject.name)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${selected ? `border-slate-200 bg-slate-50 ring-2 ${subject.ring}` : 'border-transparent hover:bg-slate-50'}`}>
                      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${subject.iconBg} ${subject.color}`}><subject.icon className="h-5 w-5" /></span>
                      <span className="flex-1">
                        <span className="block text-sm font-bold">{subject.name}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-400">{stats ? `${stats.questionsAttempted} keyed attempts · ${stats.accuracy}% accuracy` : 'No verified subject results stored'}</span>
                      </span>
                      <ChevronRight className={`h-4 w-4 ${selected ? subject.color : 'text-slate-300'}`} />
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-800">{focusedSubject} focus</p>
                {activeSubjectStats ? (
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    {activeSubjectStats.questionsAttempted} keyed attempts · {activeSubjectStats.accuracy}% accuracy across completed practice.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    No verified {focusedSubject} results are stored yet. Complete a question-bank test with a trusted key to build this view.
                  </p>
                )}
                {focusedSessions.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-slate-200 pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Relevant completed tests</p>
                    {focusedSessions.map(({ session }) => (
                      <button
                        key={`${session.config.id}-${session.submittedAt}`}
                        type="button"
                        onClick={() => onOpenReport(session)}
                        className="flex w-full items-center justify-between gap-2 py-1 text-left text-[11px] font-semibold text-blue-700 hover:text-blue-900"
                      >
                        <span className="truncate">{session.config.title}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-extrabold">Quick Access</h2>
                  <p className="mt-1 text-xs text-slate-400">Jump to a saved area of your practice space.</p>
                </div>
                <ArrowUpRight className="h-5 w-5 text-blue-600" />
              </div>
              <div className="mt-4 divide-y divide-slate-100">
                {displayQuickAccess.length ? displayQuickAccess.map((item) => {
                  const rowContent = (
                    <>
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.color}`}><item.icon className="h-4 w-4" /></span>
                      <span className="flex-1">
                        <span className="block text-xs font-bold text-slate-800">{item.title}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{item.note}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </>
                  );
                  return item.url ? (
                    <a key={item.key} href={item.url} target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-3 rounded-lg py-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                      {rowContent}
                    </a>
                  ) : (
                    <button key={item.key} type="button" onClick={() => { if (item.action) onNavigate(item.action); }} className="flex w-full items-center gap-3 rounded-lg py-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                      {rowContent}
                    </button>
                  );
                }) : (
                  <p className="py-5 text-center text-xs text-slate-500">No quick links are currently published.</p>
                )}
              </div>
            </article>
          </section>

          <section id="recent-tests" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold">Recent Tests &amp; Reports</h2>
                <p className="mt-1 text-xs text-slate-400">Completed exam records saved locally on this device.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-500">{overview.testCount} total</span>
            </div>
            {filteredSessions.length ? (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
                      <th className="pb-3 pr-4 font-semibold">Test</th>
                      <th className="pb-3 pr-4 font-semibold">Source</th>
                      <th className="pb-3 pr-4 font-semibold">Date</th>
                      <th className="pb-3 pr-4 font-semibold">Attempted</th>
                      <th className="pb-3 pr-4 font-semibold">Result</th>
                      <th className="pb-3 text-right font-semibold">Report</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSessions.map((item) => (
                      <tr key={`${item.session.config.id}-${item.completedAt}`} className="text-xs">
                        <td className="py-3 pr-4">
                          <span className="block max-w-[220px] truncate font-bold text-slate-800">{item.session.config.title}</span>
                          <span className="mt-1 block text-[10px] text-slate-400">{item.session.config.totalQuestions} questions</span>
                        </td>
                        <td className="py-3 pr-4 text-slate-500"><span className="block max-w-[150px] truncate">{getSourceLabel(item.session)}</span></td>
                        <td className="py-3 pr-4 whitespace-nowrap text-slate-500">{formatDate(item.completedAt)}</td>
                        <td className="py-3 pr-4 text-slate-600">{item.questionsAttempted}/{item.session.config.totalQuestions}</td>
                        <td className="py-3 pr-4 font-bold text-slate-700">{item.accuracy === null ? 'Not scored' : `${item.accuracy}% accuracy`}</td>
                        <td className="py-3 text-right">
                          <button type="button" onClick={() => onOpenReport(item.session)} className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 font-bold text-blue-700 hover:bg-blue-100">
                            View report <ArrowUpRight className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState text={searchText ? `No saved tests, papers, or subjects match “${searchText}”.` : 'No completed reports yet. Your submitted tests will appear here.'} />
            )}
          </section>

          <section id="study-resources" aria-label="Notifications and educational resources" className="scroll-mt-24 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-base font-extrabold">Notifications</h2>
              <p className="mt-1 text-xs text-slate-400">Updates for your learning space.</p>
              {contentStatus === 'ready' && visibleNotifications.length ? (
                <div className="mt-4 space-y-3">
                  {visibleNotifications.map((notification) => (
                    <div key={notification.id} className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                      <p className="text-xs font-bold text-slate-800">{notification.title}</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{notification.message}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text={contentStatus === 'error'
                  ? 'Notifications could not be loaded. Please refresh the dashboard or try again later.'
                  : contentStatus === 'ready' && managedContent?.notifications.length
                    ? 'You are all caught up. New updates will appear here.'
                    : 'No notifications are configured yet.'} />
              )}
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-extrabold">Study Resources</h2>
                  <p className="mt-1 text-xs text-slate-400">Verified NEET educational resources</p>
                </div>
                <Play className="h-5 w-5 text-rose-500" />
              </div>
              {contentStatus === 'ready' && managedContent?.youtubeResources.length ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {managedContent.youtubeResources.map((resource) => (
                    <a key={resource.id} href={resource.url} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-blue-300 hover:shadow-sm">
                      {resource.thumbnail_url ? (
                        <img src={resource.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-32 w-full object-cover" />
                      ) : (
                        <div className="flex h-32 items-center justify-center bg-slate-100 text-blue-600">
                          <Play className="h-8 w-8" />
                        </div>
                      )}
                      <div className="p-3">
                        <h3 className="text-sm font-bold text-slate-800">{resource.title}</h3>
                        <p className="mt-1 text-xs text-slate-500">{resource.creator}</p>
                        <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-blue-700">
                          Watch on YouTube <ArrowUpRight className="h-3 w-3" />
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-bold text-slate-700">Featured videos</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{contentStatus === 'error'
                      ? 'Study resources could not be loaded. Please refresh the dashboard or try again later.'
                      : 'No verified video resources are configured yet.'}</p>
                  </div>
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-bold text-slate-700">Creator of the Week</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-500">Curated resources come from the account-managed admin panel. No live trend or engagement data is invented.</p>
                  </div>
                </div>
              )}
            </article>
          </section>

          <footer id="settings" className="flex scroll-mt-24 flex-wrap items-center justify-between gap-3 border-t border-slate-200 py-5 text-[11px] text-slate-400">
            <span>· Practice. Analyse. Improve.</span>
            <span>Practice records are stored locally in this browser. No account or cloud sync is enabled.</span>
          </footer>

          <div className="sr-only" aria-live="polite">
            Focus subject: {focusedSubject}{activeSubjectStats ? `, ${activeSubjectStats.questionsAttempted} keyed attempts` : ', no verified attempts'}
          </div>
        </div>
      </div>
    </main>
  );
};

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-5 flex min-h-28 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-5 text-center text-xs leading-5 text-slate-400">
      {text}
    </div>
  );
}
