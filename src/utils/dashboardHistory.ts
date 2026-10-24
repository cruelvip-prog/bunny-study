import {
  ExamSessionState,
  OptionLetter,
  QuestionStatus,
} from '../types/exam';
import { calculateExamResults, validateAndNormalizeSession } from './examLogic';
import { getActiveAccountOwnerId, getAccountLocalStorageKey } from './accountStorage';

const DASHBOARD_HISTORY_KEY = 'oinkie_prep_completed_sessions_v1';

export interface DashboardSubjectStats {
  name: string;
  questionsAttempted: number;
  questionsCorrect: number;
  accuracy: number | null;
}

export interface DashboardSessionStats {
  session: ExamSessionState;
  completedAt: number;
  questionsAttempted: number;
  markedForReview: number;
  accuracy: number | null;
  score: number | null;
  maxPossibleScore: number;
  subjects: DashboardSubjectStats[];
}

export interface DashboardHistoryResult {
  sessions: ExamSessionState[];
  error: string | null;
}

export function normalizeDashboardSubject(subject: string): string {
  const normalized = subject.trim().toLocaleLowerCase();
  if (normalized === 'physics') return 'Physics';
  if (normalized === 'chemistry') return 'Chemistry';
  if (['biology', 'botany', 'zoology'].includes(normalized)) return 'Biology';
  return subject.trim();
}

function isCompletedSession(session: ExamSessionState): boolean {
  return session.isSubmitted && Number.isFinite(session.submittedAt) && (session.submittedAt || 0) > 0;
}

export function readDashboardHistory(): DashboardHistoryResult {
  try {
    const ownerId = getActiveAccountOwnerId();
    const storageKey = ownerId ? getAccountLocalStorageKey(ownerId, DASHBOARD_HISTORY_KEY) : DASHBOARD_HISTORY_KEY;
    const saved = localStorage.getItem(storageKey);
    if (!saved) return { sessions: [], error: null };

    let parsed: unknown;
    try {
      parsed = JSON.parse(saved);
    } catch (error) {
      return {
        sessions: [],
        error: `Completed test history contains invalid JSON and was preserved: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (!Array.isArray(parsed)) {
      return { sessions: [], error: 'Completed test history has an unsupported format and was preserved.' };
    }

    const sessions: ExamSessionState[] = [];
    const rejected: string[] = [];
    parsed.forEach((entry, index) => {
      const normalized = validateAndNormalizeSession(entry);
      if (normalized.session && isCompletedSession(normalized.session)) {
        sessions.push(normalized.session);
      } else {
        rejected.push(`entry ${index + 1}: ${normalized.error || 'not a completed session'}`);
      }
    });

    sessions.sort((left, right) => (right.submittedAt || 0) - (left.submittedAt || 0));
    return {
      sessions,
      error: rejected.length
        ? `${rejected.length} completed-history record(s) could not be read and remain preserved. ${rejected.join(' ')}`
        : null,
    };
  } catch (error) {
    return {
      sessions: [],
      error: `Could not read completed test history: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function recordCompletedSession(session: ExamSessionState): void {
  if (!isCompletedSession(session)) {
    throw new Error('Only completed exam sessions can be added to dashboard history.');
  }

  const existing = readDashboardHistory();
  if (existing.error) {
    throw new Error(existing.error);
  }

  const identity = `${session.config.id}:${session.submittedAt}`;
  const sessions = existing.sessions.filter(
    (item) => `${item.config.id}:${item.submittedAt}` !== identity
  );
  sessions.push(session);
  sessions.sort((left, right) => (right.submittedAt || 0) - (left.submittedAt || 0));

  try {
    const ownerId = getActiveAccountOwnerId();
    const storageKey = ownerId ? getAccountLocalStorageKey(ownerId, DASHBOARD_HISTORY_KEY) : DASHBOARD_HISTORY_KEY;
    localStorage.setItem(storageKey, JSON.stringify(sessions));
  } catch (error) {
    throw new Error(`Could not save completed test history: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function summarizeDashboardSession(session: ExamSessionState): DashboardSessionStats {
  const answers = session.responses.answers as Record<number, OptionLetter | null>;
  const statuses = session.responses.statuses as Record<number, QuestionStatus>;
  const summary = calculateExamResults(
    session.config,
    answers,
    statuses,
    session.answerKey,
    session.answerKeyStatus || (session.answerKey ? 'user-provided' : 'none')
  );
  const subjectTotals = new Map<string, { attempted: number; correct: number }>();

  if (session.examQuestions?.length === session.config.totalQuestions) {
    summary.questionResults.forEach((result, index) => {
      const subject = session.examQuestions?.[index]?.subject;
      if (!subject || !result.correctAnswer || !result.userAnswer) return;
      const normalizedSubject = normalizeDashboardSubject(subject);
      const total = subjectTotals.get(normalizedSubject) || { attempted: 0, correct: 0 };
      total.attempted++;
      if (result.isCorrect) total.correct++;
      subjectTotals.set(normalizedSubject, total);
    });
  }

  return {
    session,
    completedAt: session.submittedAt || session.startedAt,
    questionsAttempted: summary.totalAttempted,
    markedForReview: summary.totalMarkedForReview,
    accuracy: summary.hasAnswerKey ? summary.accuracy : null,
    score: summary.hasAnswerKey ? summary.totalScore : null,
    maxPossibleScore: summary.maxPossibleScore,
    subjects: Array.from(subjectTotals, ([name, totals]) => ({
      name,
      questionsAttempted: totals.attempted,
      questionsCorrect: totals.correct,
      accuracy: totals.attempted
        ? Math.round((totals.correct / totals.attempted) * 100)
        : null,
    })),
  };
}

export function getDashboardOverview(sessions: ExamSessionState[]) {
  const summaries = sessions.map(summarizeDashboardSession);
  let totalCorrect = 0;
  let totalKeyedAttempts = 0;
  let questionsSolved = 0;
  let totalTimeSeconds = 0;
  const subjects = new Map<string, { attempted: number; correct: number }>();

  for (const item of summaries) {
    questionsSolved += item.questionsAttempted;
    totalTimeSeconds += Math.max(
      0,
      item.session.config.durationMinutes * 60 - item.session.timeRemainingSeconds
    );
    item.subjects.forEach((subject) => {
      const total = subjects.get(subject.name) || { attempted: 0, correct: 0 };
      total.attempted += subject.questionsAttempted;
      total.correct += subject.questionsCorrect;
      subjects.set(subject.name, total);
    });
    const result = calculateExamResults(
      item.session.config,
      item.session.responses.answers,
      item.session.responses.statuses,
      item.session.answerKey,
      item.session.answerKeyStatus || (item.session.answerKey ? 'user-provided' : 'none')
    );
    result.questionResults.forEach((question) => {
      if (question.correctAnswer && question.userAnswer) {
        totalKeyedAttempts++;
        if (question.isCorrect) totalCorrect++;
      }
    });
  }

  return {
    testCount: sessions.length,
    questionsSolved,
    totalTimeSeconds,
    averageAccuracy: totalKeyedAttempts
      ? Math.round((totalCorrect / totalKeyedAttempts) * 100)
      : null,
    accuracySampleSize: totalKeyedAttempts,
    subjects: Array.from(subjects, ([name, totals]) => ({
      name,
      questionsAttempted: totals.attempted,
      questionsCorrect: totals.correct,
      accuracy: totals.attempted
        ? Math.round((totals.correct / totals.attempted) * 100)
        : null,
    })).sort((left, right) => left.name.localeCompare(right.name)),
    recentSessions: summaries,
  };
}

export function getPracticeStreak(sessions: ExamSessionState[], now = Date.now()): number {
  const activityDays = new Set(
    sessions
      .filter(isCompletedSession)
      .map((session) => {
        const date = new Date(session.submittedAt || 0);
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      })
  );
  const currentDate = new Date(now);
  const todayKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`;
  if (!activityDays.has(todayKey)) {
    currentDate.setDate(currentDate.getDate() - 1);
    const yesterdayKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`;
    if (!activityDays.has(yesterdayKey)) return 0;
  }

  let streak = 0;
  while (activityDays.has(`${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`)) {
    streak++;
    currentDate.setDate(currentDate.getDate() - 1);
  }
  return streak;
}
